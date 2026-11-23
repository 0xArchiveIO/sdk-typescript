/**
 * The momentum factor (client.hyperliquid.factors.momentum), against
 * responses recorded from the API (tests/fixtures/momentum).
 */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MOMENTUM_INTERVALS,
  MOMENTUM_MAX_LIMIT,
  OxArchive,
  OxArchiveError,
  PlanRequiredError,
  type MomentumReturn,
  type MomentumScore,
} from '../src';

const BASE = 'https://api.example.test';
const COVERAGE = '2025-05-24T01:00:00Z';
const PLANS = ['build', 'pro', 'scale', 'enterprise'];
const HOUR = 3_600_000;
const DAY = 86_400_000;

type Row = Record<string, unknown>;

interface Fixture {
  request: { path: string; query: Record<string, string | number | boolean>; plan: string };
  status: number;
  body: Record<string, unknown> & { data?: Row[]; meta?: Record<string, unknown> };
}

function fixture(name: string): Fixture {
  return JSON.parse(readFileSync(new URL(`./fixtures/momentum/${name}.json`, import.meta.url), 'utf8')) as Fixture;
}

function reply(f: Fixture) {
  return { ok: f.status < 400, status: f.status, json: async () => structuredClone(f.body) };
}

function stubFetch(...names: string[]) {
  const fetchMock = vi.fn();
  for (const name of names) fetchMock.mockResolvedValueOnce(reply(fixture(name)));
  fetchMock.mockRejectedValue(new Error('unexpected extra request'));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function urlAt(fetchMock: ReturnType<typeof vi.fn>, call = 0): URL {
  return new URL(String(fetchMock.mock.calls[call]?.[0]));
}

function queryAt(fetchMock: ReturnType<typeof vi.fn>, call = 0): Record<string, string> {
  return Object.fromEntries(urlAt(fetchMock, call).searchParams.entries());
}

/** The recorded request's query, as the SDK sends it (strings). */
function recordedQuery(name: string): Record<string, string> {
  return Object.fromEntries(Object.entries(fixture(name).request.query).map(([k, v]) => [k, String(v)]));
}

function client(validate = false) {
  return new OxArchive({ apiKey: 'test-key', baseUrl: BASE, validate });
}

async function collect<T>(gen: AsyncGenerator<T, void, undefined>): Promise<T[]> {
  const out: T[] = [];
  for await (const row of gen) out.push(row);
  return out;
}

const methodsOf = (obj: object): string[] => {
  const names = new Set<string>();
  let proto = Object.getPrototypeOf(obj);
  while (proto && proto !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name !== 'constructor' && typeof (obj as Record<string, unknown>)[name] === 'function') names.add(name);
    }
    proto = Object.getPrototypeOf(proto);
  }
  return [...names].sort();
};

function expectScores(scores: MomentumScore[], raw: Row[], lookback: string): void {
  expect(scores.length).toBe(raw.length);
  expect(scores.length).toBeGreaterThan(0);
  scores.forEach((s, i) => {
    const r = raw[i]!;
    expect(s).toEqual({
      symbol: r.symbol,
      timestamp: r.timestamp,
      timestampMs: r.timestamp_ms,
      lookback,
      method: 'momentum/1',
      ret: r.ret,
      vol: r.vol,
      score: r.score,
      pctRank: r.pct_rank,
      quintile: r.quintile,
      inTop25: r.in_top25,
      inTop50: r.in_top50,
      isFinal: r.is_final,
    });
    expect(s.pctRank).toBeGreaterThan(0);
    expect(s.pctRank).toBeLessThanOrEqual(1);
    // The top-25 universe is part of the top-50 one.
    if (s.inTop25) expect(s.inTop50).toBe(true);
  });
  // One reading: every perp at the same hour close, strongest first.
  expect(new Set(scores.map((s) => s.timestampMs)).size).toBe(1);
  expect(scores[0]!.timestampMs % HOUR).toBe(0);
  const values = scores.map((s) => s.score);
  expect(values).toEqual([...values].sort((a, b) => b - a));
}

function expectReturns(buckets: MomentumReturn[], raw: Row[]): void {
  expect(buckets.length).toBe(raw.length);
  buckets.forEach((b, i) => {
    const r = raw[i]!;
    expect(b).toMatchObject({
      timestamp: r.timestamp,
      timestampMs: r.timestamp_ms,
      calculatedAt: r.calculated_at,
      calculatedAtMs: r.calculated_at_ms,
      lookback: r.lookback,
      universe: r.universe,
      method: 'momentum/1',
      ret: r.ret,
      longRet: r.long_ret,
      shortRet: r.short_ret,
      hours: r.hours,
      longs: r.longs,
      shorts: r.shorts,
      isFinal: r.is_final,
    });
    // The factor is the long leg less the short leg.
    expect(b.ret).toBeCloseTo(b.longRet - b.shortRet, 12);
    expect(b.calculatedAtMs).toBeGreaterThan(b.timestampMs);
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('where the momentum factor is served', () => {
  it('core perps only, under factors.momentum', () => {
    const c = client();
    expect(methodsOf(c.hyperliquid.factors.momentum)).toEqual(['current', 'get', 'iterateReturns', 'returns']);
    expect('factors' in (c.hyperliquid.hip3 as unknown as Record<string, unknown>)).toBe(false);
    expect('factors' in (c.hyperliquid.hip4 as unknown as Record<string, unknown>)).toBe(false);
  });
});

describe('scores', () => {
  it.each([false, true])('current() sends the lookback and parses every perp (validate %s)', async (validate) => {
    const name = 'momentum_current_14d';
    const fetchMock = stubFetch(name);

    const page = await client(validate).hyperliquid.factors.momentum.current({ lookback: '14d' });

    expect(urlAt(fetchMock).pathname).toBe('/v1/hyperliquid/factors/momentum/current');
    expect(queryAt(fetchMock)).toEqual({ lookback: '14d' });
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeUndefined();
    expect(page.meta?.requestId).toBe(fixture(name).body.meta?.request_id);
    expect(page.meta?.count).toBe(178); // recorded; the fixture keeps 6 of the records
    expectScores(page.data, fixture(name).body.data!, '14d');
    const first = page.data[0]!;
    expect(first).toMatchObject({ symbol: 'BLUR', timestamp: '2026-11-23T16:00:00.000Z', pctRank: 1, quintile: 5, isFinal: false });
    expect(first.score).toBeCloseTo(first.ret! / first.vol!, 9);
    expect(page.data[page.data.length - 1]!.quintile).toBe(1);
  });

  it.each([false, true])('get() sends at in milliseconds and reads that hour (validate %s)', async (validate) => {
    const name = 'momentum_scores_7d_at';
    const fetchMock = stubFetch(name, name);
    const momentum = client(validate).hyperliquid.factors.momentum;

    const byText = await momentum.get({ lookback: '7d', at: '2026-11-01T12:00:00Z' });
    const byDate = await momentum.get({ lookback: '7d', at: new Date('2026-11-01T12:00:00Z') });

    for (const call of [0, 1]) {
      expect(urlAt(fetchMock, call).pathname).toBe('/v1/hyperliquid/factors/momentum');
      expect(queryAt(fetchMock, call)).toEqual(recordedQuery(name));
    }
    expect(recordedQuery(name).at).toBe(String(Date.parse('2026-11-01T12:00:00Z')));
    for (const page of [byText, byDate]) {
      expectScores(page.data, fixture(name).body.data!, '7d');
      expect(page.data[0]!.timestamp).toBe('2026-11-01T12:00:00.000Z');
      expect(page.data.every((s) => s.isFinal)).toBe(true);
    }
    expect(byText.data[0]).toMatchObject({ symbol: 'HYPE', inTop25: true, inTop50: true });
  });

  it('get() without at sends only the lookback', async () => {
    const fetchMock = stubFetch('momentum_current_14d');
    await client().hyperliquid.factors.momentum.get({ lookback: '14d' });
    expect(urlAt(fetchMock).pathname).toBe('/v1/hyperliquid/factors/momentum');
    expect(queryAt(fetchMock)).toEqual({ lookback: '14d' });
  });

  it('keeps null returns and volatility', async () => {
    const f = fixture('momentum_current_14d');
    const row = { ...f.body.data![0]!, ret: null, vol: null };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ ...f, body: { ...f.body, data: [row] } })));
    const page = await client(true).hyperliquid.factors.momentum.current({ lookback: '14d' });
    expect(page.data[0]!.ret).toBeNull();
    expect(page.data[0]!.vol).toBeNull();
  });
});

describe('returns', () => {
  const PAGES = ['momentum_returns_7d_top25_1d_page1', 'momentum_returns_7d_top25_1d_page2'] as const;
  const HOLDINGS = 'momentum_returns_14d_top50_1h_holdings';
  const window = () => {
    const q = recordedQuery(PAGES[0]);
    return {
      universe: q.universe as 'top25',
      interval: q.interval as '1d',
      start: Number(q.start),
      end: Number(q.end),
      limit: Number(q.limit),
    };
  };

  it.each([false, true])('pages with the window unchanged (validate %s)', async (validate) => {
    const fetchMock = stubFetch(...PAGES);
    const momentum = client(validate).hyperliquid.factors.momentum;

    const first = await momentum.returns({ lookback: '7d', ...window() });
    const second = await momentum.returns({ lookback: '7d', ...window(), cursor: first.nextCursor });

    expect(urlAt(fetchMock, 0).pathname).toBe('/v1/hyperliquid/factors/momentum/returns');
    expect(queryAt(fetchMock, 0)).toEqual(recordedQuery(PAGES[0]));
    expect(queryAt(fetchMock, 1)).toEqual(recordedQuery(PAGES[1]));
    expect(recordedQuery(PAGES[0]).start).toBe(String(Date.parse('2026-10-01T00:00:00Z')));
    expect([first.hasMore, first.nextCursor]).toEqual([true, '1791676800000']);
    expect([second.hasMore, second.nextCursor]).toEqual([true, '1792540800000']);
    expectReturns(first.data, fixture(PAGES[0]).body.data!);
    expectReturns(second.data, fixture(PAGES[1]).body.data!);
    const joined = [...first.data, ...second.data];
    const opens = joined.map((b) => b.timestampMs);
    // Daily buckets, oldest first, none repeated across the page boundary;
    // the cursor is the next bucket's open.
    expect(opens[0]).toBe(Date.parse('2026-10-01T00:00:00Z'));
    opens.slice(1).forEach((t, i) => expect(t - opens[i]!).toBe(DAY));
    expect(second.data[0]!.timestampMs).toBe(Number(first.nextCursor));
    for (const b of joined) {
      expect([b.lookback, b.universe, b.hours, b.isFinal]).toEqual(['7d', 'top25', 24, true]);
      expect(b.calculatedAtMs).toBe(b.timestampMs + DAY);
      expect(b.holdings).toBeUndefined();
    }
    expect(first.data[0]).toMatchObject({ ret: 0.011022206600979339, longs: 6, shorts: 5 });
  });

  it('iterateReturns() sends the cursor with the same window', async () => {
    const fetchMock = stubFetch(...PAGES);
    const rows: MomentumReturn[] = [];
    // Two recorded pages of a longer walk: stop after their 20 buckets.
    for await (const b of client(true).hyperliquid.factors.momentum.iterateReturns({ lookback: '7d', ...window() })) {
      rows.push(b);
      if (rows.length === 20) break;
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(queryAt(fetchMock, 0)).toEqual(recordedQuery(PAGES[0]));
    expect(queryAt(fetchMock, 1)).toEqual(recordedQuery(PAGES[1]));
    expect(rows.map((b) => b.timestampMs)).toEqual(
      [...fixture(PAGES[0]).body.data!, ...fixture(PAGES[1]).body.data!].map((r) => r.timestamp_ms),
    );
  });

  it('iterateReturns() stops on the page without a cursor', async () => {
    const fetchMock = stubFetch(HOLDINGS);
    const q = recordedQuery(HOLDINGS);
    const rows = await collect(
      client().hyperliquid.factors.momentum.iterateReturns({
        lookback: '14d', universe: 'top50', interval: '1h', holdings: true, start: Number(q.start), end: Number(q.end),
      }),
    );
    expect(rows).toHaveLength(4);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(queryAt(fetchMock)).toEqual(q);
  });

  it('iterateReturns() fixes a missing end once and sends it on every page', async () => {
    const fetchMock = stubFetch(PAGES[0], HOLDINGS);
    const before = Date.now();
    await collect(client().hyperliquid.factors.momentum.iterateReturns({ lookback: '7d', start: '2026-10-01' }));
    const after = Date.now();
    const [a, b] = [queryAt(fetchMock, 0), queryAt(fetchMock, 1)];
    expect(a.end).toBe(b.end);
    expect(Number(a.end)).toBeGreaterThanOrEqual(before);
    expect(Number(a.end)).toBeLessThanOrEqual(after);
    expect(a.start).toBe(String(Date.parse('2026-10-01T00:00:00Z')));
    expect(a.cursor).toBeUndefined();
    expect(b.cursor).toBe(fixture(PAGES[0]).body.meta?.next_cursor);
  });

  it('iterateReturns() throws when a page returns the cursor it was sent', async () => {
    const f = fixture(PAGES[1]);
    const fetchMock = vi.fn().mockImplementation(async () => reply(f));
    vi.stubGlobal('fetch', fetchMock);
    const error = await collect(
      client().hyperliquid.factors.momentum.iterateReturns({ lookback: '7d', start: '2026-10-01', end: '2026-11-20' }),
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OxArchiveError);
    expect((error as OxArchiveError).errorCode).toBe('internal_error');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([false, true])('holdings, the top-50 universe and hourly buckets (validate %s)', async (validate) => {
    const fetchMock = stubFetch(HOLDINGS);

    const page = await client(validate).hyperliquid.factors.momentum.returns({
      lookback: '14d',
      universe: 'top50',
      interval: '1h',
      holdings: true,
      start: '2026-11-15T00:00:00Z',
      end: '2026-11-15T03:00:00Z',
    });

    expect(queryAt(fetchMock)).toEqual(recordedQuery(HOLDINGS));
    expect(recordedQuery(HOLDINGS).holdings).toBe('true');
    expect(page.hasMore).toBe(false);
    const raw = fixture(HOLDINGS).body.data!;
    expectReturns(page.data, raw);
    // end is a bucket open: the 03:00 bucket is the last one.
    expect(page.data.map((b) => b.timestamp)).toEqual([0, 1, 2, 3].map((h) => `2026-11-15T0${h}:00:00.000Z`));
    page.data.forEach((b, i) => {
      expect([b.universe, b.lookback, b.hours]).toEqual(['top50', '14d', 1]);
      expect(b.calculatedAtMs).toBe(b.timestampMs + HOUR);
      expect(b.holdings).toEqual(raw[i]!.holdings);
      const longs = b.holdings!.filter((h) => h.weight > 0);
      const shorts = b.holdings!.filter((h) => h.weight < 0);
      expect([longs.length, shorts.length]).toEqual([b.longs, b.shorts]);
      expect([b.longs, b.shorts]).toEqual([11, 10]);
      // Each leg sums to 1 in size, long leg first.
      expect(longs.reduce((s, h) => s + h.weight, 0)).toBeCloseTo(1, 9);
      expect(shorts.reduce((s, h) => s + h.weight, 0)).toBeCloseTo(-1, 9);
      expect(b.holdings!.slice(0, longs.length)).toEqual(longs);
    });
    expect(page.data[0]!.holdings![0]!.symbol).toBe('STRK');
  });

  it('a window before coverage is empty with the coverage notice', async () => {
    const fetchMock = stubFetch('momentum_returns_before_coverage');
    const page = await client(true).hyperliquid.factors.momentum.returns({ lookback: '7d', start: '2025-05-01', end: '2025-05-02' });
    expect(queryAt(fetchMock)).toEqual({
      lookback: '7d',
      start: String(Date.parse('2025-05-01T00:00:00Z')),
      end: String(Date.parse('2025-05-02T00:00:00Z')),
    });
    expect(page.data).toEqual([]);
    expect(page.hasMore).toBe(false);
    expect(page.meta?.coverageFrom).toBe(COVERAGE);
    expect(String(page.meta?.notice)).toContain('returns begin 2025-05-24 01:00 UTC');
  });

  it('sends holdings: false as false and leaves unset parameters to the API', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => reply(fixture(HOLDINGS)));
    vi.stubGlobal('fetch', fetchMock);
    const momentum = client().hyperliquid.factors.momentum;
    await momentum.returns({ lookback: '14d' });
    await momentum.returns({ lookback: '14d', holdings: false, start: '2026-11-01', end: new Date('2026-11-02T00:00:00Z') });
    expect(queryAt(fetchMock, 0)).toEqual({ lookback: '14d' });
    expect(queryAt(fetchMock, 1)).toEqual({
      lookback: '14d',
      holdings: 'false',
      start: String(Date.parse('2026-11-01T00:00:00Z')),
      end: String(Date.parse('2026-11-02T00:00:00Z')),
    });
  });
});

describe('refused before sending', () => {
  it.each([
    ['lookback missing', () => client().hyperliquid.factors.momentum.current({} as never), TypeError],
    ['lookback 1d', () => client().hyperliquid.factors.momentum.current({ lookback: '1d' as never }), RangeError],
    ['lookback 28d', () => client().hyperliquid.factors.momentum.get({ lookback: '28d' as never }), RangeError],
    ['returns lookback', () => client().hyperliquid.factors.momentum.returns({ lookback: '7D' as never }), RangeError],
    ['universe', () => client().hyperliquid.factors.momentum.returns({ lookback: '7d', universe: 'top100' as never }), RangeError],
    ['interval', () => client().hyperliquid.factors.momentum.returns({ lookback: '7d', interval: '4h' as never }), RangeError],
    ['limit 0', () => client().hyperliquid.factors.momentum.returns({ lookback: '7d', limit: 0 }), RangeError],
    ['limit 1001', () => client().hyperliquid.factors.momentum.returns({ lookback: '7d', limit: MOMENTUM_MAX_LIMIT + 1 }), RangeError],
    ['holdings', () => client().hyperliquid.factors.momentum.returns({ lookback: '7d', holdings: 'yes' as never }), TypeError],
  ])('%s', async (_name, call, kind) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(call()).rejects.toThrow(kind);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('iterateReturns() needs start', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(() => client().hyperliquid.factors.momentum.iterateReturns({ lookback: '7d' } as never)).toThrow(TypeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('errors', () => {
  it.each([
    ['momentum_free_forbidden', () => client().hyperliquid.factors.momentum.current({ lookback: '7d' })],
    ['momentum_free_forbidden_returns', () => client().hyperliquid.factors.momentum.returns({ lookback: '7d' })],
  ])('%s is a PlanRequiredError', async (name, call) => {
    const f = fixture(name);
    const fetchMock = stubFetch(name);
    const e = (await call().catch((err: unknown) => err)) as PlanRequiredError;
    expect(e).toBeInstanceOf(PlanRequiredError);
    expect(e).toBeInstanceOf(OxArchiveError);
    expect(e.status).toBe(403);
    expect(e.errorCode).toBe('forbidden');
    expect(e.datatype).toBe('momentum');
    expect(e.requiredPlans).toEqual(PLANS);
    expect(e.upgradeUrl).toBe('https://0xarchive.io/pricing');
    expect(e.requestId).toBe(f.body.request_id);
    expect(e.message).toBe(f.body.error);
    expect(urlAt(fetchMock).pathname).toBe(f.request.path);
  });

  it.each([
    ['momentum_missing_lookback', 400, 'invalid_parameter', 'lookback', ['7d', '14d']],
    ['momentum_lookback_28d', 400, 'invalid_parameter', 'lookback', ['7d', '14d']],
    ['momentum_current_refuses_at', 400, 'invalid_parameter', 'at', undefined],
    ['momentum_returns_invalid_interval', 400, 'invalid_interval', 'interval', ['1h', '1d']],
    ['momentum_cold_503', 503, 'upstream_unavailable', undefined, undefined],
  ])('%s keeps its code, parameter and values', async (name, status, code, param, validValues) => {
    stubFetch(name);
    const e = (await client().hyperliquid.factors.momentum.returns({ lookback: '7d' }).catch((err: unknown) => err)) as OxArchiveError;
    expect(e).toBeInstanceOf(OxArchiveError);
    expect(e).not.toBeInstanceOf(PlanRequiredError);
    expect(e.status).toBe(status);
    expect(e.errorCode).toBe(code);
    expect(e.param).toBe(param);
    expect(e.validValues).toEqual(validValues);
    expect(e.message).toBe(fixture(name).body.error);
    expect(e.requestId).toBe(fixture(name).body.request_id);
  });

  it('a cold start answers a retryable 503 upstream_unavailable', async () => {
    const fetchMock = stubFetch('momentum_cold_503');
    const e = (await client().hyperliquid.factors.momentum.current({ lookback: '7d' }).catch((err: unknown) => err)) as OxArchiveError;
    expect(e).toBeInstanceOf(OxArchiveError);
    expect(e.status).toBe(503);
    expect(e.errorCode).toBe('upstream_unavailable');
    expect(e.message).toContain('still being prepared');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('the capabilities row', () => {
  it('names the plans and the routes, and matches the SDK limits', async () => {
    const f = fixture('capabilities_momentum_row');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(f)));
    const rows = (await client(true).capabilities()).filter((r) => r.datatype === 'momentum');
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.venue).toBe('hyperliquid');
    expect(row.plans).toEqual(PLANS);
    expect([...row.restRoutes].sort()).toEqual([
      '/v1/hyperliquid/factors/momentum',
      '/v1/hyperliquid/factors/momentum/current',
      '/v1/hyperliquid/factors/momentum/returns',
    ]);
    expect([...(row.intervals ?? [])].sort()).toEqual([...MOMENTUM_INTERVALS].sort());
    expect(row.pageLimit).toBe(MOMENTUM_MAX_LIMIT);
    // As recorded: the row does not set availableFrom; the notes name the start.
    expect(row.availableFrom ?? null).toBeNull();
    expect(row.notes).toContain('2025-05-24 01:00 UTC');
  });
});
