/**
 * Trade intent, USDC flows, breadth above the n-day moving average and
 * positioning, against responses recorded from the API (tests/fixtures/derived).
 */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OxArchive, OxArchiveError, PlanRequiredError } from '../src';

const BASE = 'https://api.example.test';

interface Fixture {
  request: { path: string; query: Record<string, string | number>; plan: string };
  status: number;
  body: Record<string, unknown> & { data?: unknown; meta?: Record<string, unknown> };
}

function fixture(name: string): Fixture {
  return JSON.parse(readFileSync(new URL(`./fixtures/derived/${name}.json`, import.meta.url), 'utf8')) as Fixture;
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
function recordedQuery(f: Fixture): Record<string, string> {
  return Object.fromEntries(Object.entries(f.request.query).map(([k, v]) => [k, String(v)]));
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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('where the four datasets are served', () => {
  it('core has all four; HIP-3 has trade intent, moving-average breadth and positioning', () => {
    const c = client();
    expect(methodsOf(c.hyperliquid.tradeIntent)).toEqual(['history', 'iterate']);
    expect(methodsOf(c.hyperliquid.usdcFlows)).toEqual(['history', 'iterate', 'iterateVolume', 'volume']);
    expect(methodsOf(c.hyperliquid.breadthMa)).toEqual(['current', 'history', 'iterate']);
    expect(methodsOf(c.hyperliquid.positioning)).toEqual(['current']);
    expect(methodsOf(c.hyperliquid.hip3.tradeIntent)).toEqual(['history', 'iterate']);
    expect(methodsOf(c.hyperliquid.hip3.breadthMa)).toEqual(['current', 'history', 'iterate']);
    expect(methodsOf(c.hyperliquid.hip3.positioning)).toEqual(['current']);
    expect('usdcFlows' in (c.hyperliquid.hip3 as unknown as Record<string, unknown>)).toBe(false);
    expect('tradeIntent' in (c.hyperliquid.hip4 as unknown as Record<string, unknown>)).toBe(false);
  });
});

describe('trade intent', () => {
  it.each([false, true])('GETs /v1/hyperliquid/trade-intent/{symbol} and parses buckets (validate %s)', async (validate) => {
    const f = fixture('trade_intent_btc_1h_page1');
    const fetchMock = stubFetch('trade_intent_btc_1h_page1');
    const q = f.request.query;

    const page = await client(validate).hyperliquid.tradeIntent.history('btc', {
      start: Number(q.start),
      end: Number(q.end),
      interval: '1h',
      limit: Number(q.limit),
    });

    expect(urlAt(fetchMock).pathname).toBe('/v1/hyperliquid/trade-intent/BTC');
    expect(queryAt(fetchMock)).toEqual(recordedQuery(f));
    expect(page.data).toHaveLength(3);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBe('1793588400000');
    expect(page.meta).toMatchObject({ symbol: 'BTC', venue: 'hyperliquid', builtThrough: '2026-11-04T19:00:00.000Z' });
    const b = page.data[0]!;
    expect(b).toMatchObject({
      timestamp: '2026-11-02T00:00:00.000Z',
      timestampMs: 1793577600000,
      close: 78061.0,
      priceSource: 'mark',
      openLong: 27144995.59,
      flipLs: 515658.22,
      mmUsd: 66752421.84,
      winnersCount: 4,
      losersCount: 10,
      quality: 'ok',
      isFinal: true,
      preliminary: false,
      preliminaryFrom: null,
      preliminaryFromMs: null,
      method: 'who/3',
    });
  });

  it.each([false, true])('keeps the nulls of second buckets and the preliminary fields (validate %s)', async (validate) => {
    stubFetch('trade_intent_btc_1s', 'trade_intent_btc_1m_live');
    const c = client(validate);

    const seconds = await c.hyperliquid.tradeIntent.history('BTC', { start: 1, end: 2, interval: '1s' });
    expect(seconds.data[0]).toMatchObject({
      close: null,
      priceSource: null,
      winnersNet: null,
      winnersGross: null,
      losersNet: null,
      losersGross: null,
      winnersCount: null,
      losersCount: null,
      winnersFlow: 0,
      preliminary: true,
      isFinal: false,
    });
    expect(seconds.meta?.preliminaryRowCount).toBe(3);

    const live = await c.hyperliquid.tradeIntent.history('BTC', { start: 1, end: 2, interval: '1m', limit: 3 });
    expect(live.data[0]).toMatchObject({
      preliminary: true,
      preliminaryFrom: '2026-11-04T19:55:00.000Z',
      preliminaryFromMs: 1793822100000,
    });
    expect(live.meta?.builtThrough).toBe('2026-11-04T20:01:00.000Z');
  });

  it('keeps HIP-3 symbols as given under /v1/hyperliquid/hip3/trade-intent', async () => {
    const f = fixture('trade_intent_hip3_1h');
    const fetchMock = stubFetch('trade_intent_hip3_1h');
    const page = await client(true).hyperliquid.hip3.tradeIntent.history('xyz:XYZ100', {
      start: Number(f.request.query.start),
      end: Number(f.request.query.end),
      interval: '1h',
    });
    expect(urlAt(fetchMock).pathname).toBe('/v1/hyperliquid/hip3/trade-intent/xyz:XYZ100');
    expect(queryAt(fetchMock)).toEqual(recordedQuery(f));
    expect(page.meta).toMatchObject({ symbol: 'xyz:XYZ100', venue: 'hip3' });
    expect(page.hasMore).toBe(false);
  });

  it('iterate() follows the cursor with the same window until it is absent', async () => {
    const f = fixture('trade_intent_btc_1h_page1');
    const fetchMock = stubFetch('trade_intent_btc_1h_page1', 'trade_intent_btc_1h_page2');
    const q = f.request.query;

    const rows = await collect(
      client().hyperliquid.tradeIntent.iterate('BTC', {
        start: Number(q.start),
        end: Number(q.end),
        interval: '1h',
        limit: 3,
      }),
    );

    expect(rows.map((r) => r.timestamp)).toEqual([
      '2026-11-02T00:00:00.000Z',
      '2026-11-02T01:00:00.000Z',
      '2026-11-02T02:00:00.000Z',
      '2026-11-02T03:00:00.000Z',
      '2026-11-02T04:00:00.000Z',
      '2026-11-02T05:00:00.000Z',
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(queryAt(fetchMock, 0)).toEqual(recordedQuery(f));
    expect(queryAt(fetchMock, 1)).toEqual(recordedQuery(fixture('trade_intent_btc_1h_page2')));
  });
});

describe('USDC flows', () => {
  it.each([false, true])('history() sends min_usd and kind and parses events (validate %s)', async (validate) => {
    const f = fixture('usdc_flows_events_filtered');
    const fetchMock = stubFetch('usdc_flows_events_filtered');
    const q = f.request.query;

    const page = await client(validate).hyperliquid.usdcFlows.history({
      start: Number(q.start),
      end: Number(q.end),
      minUsd: 1_000_000,
      kind: 'withdraw',
      limit: 5,
    });

    expect(urlAt(fetchMock).pathname).toBe('/v1/hyperliquid/usdc-flows');
    expect(queryAt(fetchMock)).toEqual(recordedQuery(f));
    expect(page.data).toHaveLength(5);
    expect(page.data[0]).toEqual({
      id: '1205903006:0',
      timestamp: '2026-11-02T02:49:53.333Z',
      timestampMs: 1793587793333,
      kind: 'withdraw',
      amountUsd: 1695639.0,
      feeUsd: 1.0,
      user: '0x70e8b3627fe9de9adbc13cdffc96f11b91bd6424',
      txHash: '0x7c8a3b16c2a8713f5eb4fe2b015a593496a1fef8f0d490bb6094c9b8fd9f3ff6',
      blockNumber: 1205903006,
      eventIndex: 0,
    });
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBe('1793620217054_1206355300_3');
  });

  it('iterate() walks three empty pages that carry a cursor, then stops on the page without one', async () => {
    const first = fixture('usdc_flows_events_sparse_page1');
    const fetchMock = stubFetch(
      'usdc_flows_events_sparse_page1',
      'usdc_flows_events_sparse_page2',
      'usdc_flows_events_sparse_page3',
      'usdc_flows_events_sparse_page4',
    );

    const rows = await collect(
      client(true).hyperliquid.usdcFlows.iterate({
        start: Number(first.request.query.start),
        end: Number(first.request.query.end),
        minUsd: Number(first.request.query.min_usd),
        limit: 10,
      }),
    );

    expect(rows).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    for (let page = 1; page <= 4; page++) {
      expect(queryAt(fetchMock, page - 1)).toEqual(recordedQuery(fixture(`usdc_flows_events_sparse_page${page}`)));
    }
  });

  it('iterate() fixes a missing end once and sends it on every page', async () => {
    let now = 1_793_700_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => (now += 60_000));
    const fetchMock = stubFetch('usdc_flows_events_page1', 'usdc_flows_events_page2', 'usdc_flows_events_sparse_page4');
    // page2 carries a cursor; the empty last page ends the walk.
    await collect(client().hyperliquid.usdcFlows.iterate({ start: 1_793_577_600_000, limit: 3 }));

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const ends = [0, 1, 2].map((i) => queryAt(fetchMock, i).end);
    expect(new Set(ends).size).toBe(1);
    expect(ends[0]).toBe(String(1_793_700_060_000));
    expect(queryAt(fetchMock, 1).cursor).toBe('1793577600062_1205759951_18');
    expect(queryAt(fetchMock, 2).cursor).toBe('1793577601003_1205759962_1');
  });

  it('iterate() throws when a page returns the cursor it was sent', async () => {
    const fetchMock = stubFetch('usdc_flows_events_sparse_page1', 'usdc_flows_events_sparse_page1');
    const error = await collect(
      client().hyperliquid.usdcFlows.iterate({ start: 1, end: 2, minUsd: 100_000_000_000 }),
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OxArchiveError);
    expect((error as OxArchiveError).errorCode).toBe('internal_error');
    expect((error as OxArchiveError).message).toContain('1785542399999_18446744073709551615_4294967295');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([false, true])('volume() sends the window and interval only, and parses buckets (validate %s)', async (validate) => {
    const f = fixture('usdc_flows_volume_page1');
    const fetchMock = stubFetch('usdc_flows_volume_page1');
    const q = f.request.query;

    const page = await client(validate).hyperliquid.usdcFlows.volume({
      start: Number(q.start),
      end: Number(q.end),
      interval: '1h',
      limit: 3,
      // Not a volume parameter: never sent.
      ...({ minUsd: 5, kind: 'deposit' } as object),
    });

    expect(urlAt(fetchMock).pathname).toBe('/v1/hyperliquid/usdc-flows/volume');
    expect(queryAt(fetchMock)).toEqual(recordedQuery(f));
    expect(page.data[0]).toEqual({
      timestamp: '2026-11-02T00:00:00.000Z',
      timestampMs: 1793577600000,
      depositUsd: 78574.57,
      depositCount: 30,
      withdrawUsd: 2427797.87,
      withdrawCount: 120,
      evmInUsd: 11432121.13,
      evmInCount: 5069,
      evmOutUsd: 2351409.82,
      evmOutCount: 118,
      netUsd: 6731488.01,
    });
    expect(page.nextCursor).toBe('1793584800000');
  });

  it('iterateVolume() follows the cursor to the last page', async () => {
    const f = fixture('usdc_flows_volume_page1');
    const fetchMock = stubFetch('usdc_flows_volume_page1', 'usdc_flows_volume_page2');
    // The recorded window holds a seventh bucket (the one opening at `end`);
    // its page was not recorded, so this last page is written here.
    const last = fixture('usdc_flows_volume_page2');
    const lastBody = {
      ...last.body,
      data: (last.body.data as unknown[]).slice(2),
      meta: { count: 1, request_id: 'last', has_more: false },
    };
    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce(reply(f))
      .mockResolvedValueOnce(reply(last))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => lastBody })
      .mockRejectedValue(new Error('unexpected extra request'));
    const rows = await collect(
      client().hyperliquid.usdcFlows.iterateVolume({
        start: Number(f.request.query.start),
        end: Number(f.request.query.end),
        interval: '1h',
        limit: 3,
      }),
    );
    expect(rows).toHaveLength(7);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(queryAt(fetchMock, 1)).toEqual(recordedQuery(last));
    expect(queryAt(fetchMock, 2)).toMatchObject({ cursor: '1793595600000', interval: '1h', limit: '3' });
  });

  it('a window before coverage is empty with the coverage notice', async () => {
    stubFetch('usdc_flows_events_before_coverage');
    const page = await client(true).hyperliquid.usdcFlows.history({ start: '2025-01-01', end: '2025-01-02' });
    expect(page.data).toEqual([]);
    expect(page.hasMore).toBe(false);
    expect(page.meta?.coverageFrom).toBe('2025-09-27T09:33:00Z');
    expect(page.meta?.notice).toContain('2025-09-27 09:33 UTC');
  });
});

describe('breadth above the n-day moving average', () => {
  it.each([false, true])('current() sends n only and returns the reading (validate %s)', async (validate) => {
    const fetchMock = stubFetch('breadth_ma_hl_current_n200', 'breadth_ma_hip3_current_n5');
    const c = client(validate);

    const core = await c.hyperliquid.breadthMa.current({ n: 200 });
    const hip3 = await c.hyperliquid.hip3.breadthMa.current({ n: 5 });

    expect(urlAt(fetchMock, 0).pathname).toBe('/v1/hyperliquid/breadth/above-ma/current');
    expect(queryAt(fetchMock, 0)).toEqual({ n: '200' });
    expect(urlAt(fetchMock, 1).pathname).toBe('/v1/hyperliquid/hip3/breadth/above-ma/current');
    expect(queryAt(fetchMock, 1)).toEqual({ n: '5' });
    expect(core).toEqual({
      timestamp: '2026-11-04T19:59:00.000Z',
      timestampMs: 1793822340000,
      calculatedAt: '2026-11-04T20:00:00.000Z',
      calculatedAtMs: 1793822400000,
      n: 200,
      method: 'ma-breadth/1',
      valuePct: 31.7919,
      coverageRatio: 0.7793,
      counts: {
        candidates: 222,
        eligible: 173,
        above: 55,
        at: 0,
        below: 118,
        excludedStalePrice: 43,
        excludedShortHistory: 6,
      },
      distance: { p25: -0.194641, median: -0.081344, p75: 0.066203 },
      isFinal: false,
    });
    expect(hip3.n).toBe(5);
  });

  it.each([false, true])('history() sends n with the window and pages by cursor (validate %s)', async (validate) => {
    const f = fixture('breadth_ma_hl_n50_1h_page1');
    const fetchMock = stubFetch('breadth_ma_hl_n50_1h_page1', 'breadth_ma_hl_n50_1h_page2');
    const q = f.request.query;

    const rows = await collect(
      client(validate).hyperliquid.breadthMa.iterate({
        n: 50,
        start: Number(q.start),
        end: Number(q.end),
        interval: '1h',
        limit: 3,
      }),
    );

    expect(urlAt(fetchMock).pathname).toBe('/v1/hyperliquid/breadth/above-ma');
    expect(queryAt(fetchMock, 0)).toEqual(recordedQuery(f));
    expect(queryAt(fetchMock, 1)).toEqual(recordedQuery(fixture('breadth_ma_hl_n50_1h_page2')));
    expect(rows).toHaveLength(5);
    expect(rows.every((r) => r.n === 50 && r.isFinal)).toBe(true);
    expect(rows[0]?.counts.excludedShortHistory).toBe(1);
  });

  it('HIP-3 history reads daily buckets; a window before n\'s first reading carries the notice', async () => {
    const daily = fixture('breadth_ma_hip3_n20_1d');
    const fetchMock = stubFetch('breadth_ma_hip3_n20_1d', 'breadth_ma_before_coverage');
    const c = client(true);

    const page = await c.hyperliquid.hip3.breadthMa.history({
      n: 20,
      start: Number(daily.request.query.start),
      end: Number(daily.request.query.end),
      interval: '1d',
    });
    expect(urlAt(fetchMock, 0).pathname).toBe('/v1/hyperliquid/hip3/breadth/above-ma');
    expect(queryAt(fetchMock, 0)).toEqual(recordedQuery(daily));
    expect(page.data).toHaveLength(3);
    expect(page.hasMore).toBe(false);

    const before = await c.hyperliquid.breadthMa.history({ n: 200, start: '2025-05-01', end: '2025-05-02', interval: '1d' });
    expect(before.data).toEqual([]);
    expect(before.meta?.coverageFrom).toBe('2025-10-08T00:00:00Z');
  });
});

describe('positioning', () => {
  it.each([false, true])('current() sends window only and returns one record per perp (validate %s)', async (validate) => {
    const fetchMock = stubFetch('positioning_hl_4h', 'positioning_hip3_1h');
    const c = client(validate);

    const core = await c.hyperliquid.positioning.current({ window: '4h' });
    const hip3 = await c.hyperliquid.hip3.positioning.current({ window: '1h' });

    expect(urlAt(fetchMock, 0).pathname).toBe('/v1/hyperliquid/positioning');
    expect(queryAt(fetchMock, 0)).toEqual({ window: '4h' });
    expect(urlAt(fetchMock, 1).pathname).toBe('/v1/hyperliquid/hip3/positioning');
    expect(queryAt(fetchMock, 1)).toEqual({ window: '1h' });
    expect(core.hasMore).toBe(false);
    expect(core.nextCursor).toBeUndefined();
    expect(core.meta?.asOf).toBe('2026-11-04T20:00:00.000Z');
    expect(core.data[0]).toEqual({
      symbol: '0G',
      window: '4h',
      windowStart: '2026-11-04T16:00:00.000Z',
      windowStartMs: 1793808000000,
      windowEnd: '2026-11-04T20:00:00.000Z',
      windowEndMs: 1793822400000,
      oiStart: 6731236.0,
      oiEnd: 6720526.0,
      markStart: 0.161752,
      markEnd: 0.15742,
      oiBuckets: 48,
      buyUsd: 30896.46,
      sellUsd: 32642.46,
      liqLongUsd: 0.0,
      liqShortUsd: 0.0,
      liqLongCount: 0,
      liqShortCount: 0,
      typicalPrice: 0.01190657284537222,
      typicalOi: 0.004222354480843349,
      typicalFlow: 0.10218384332958294,
      typicalWindows: 1952,
    });
    expect(hip3.meta?.asOf).toBe('2026-11-04T19:55:00.000Z');
    expect(hip3.data.every((r) => r.window === '1h')).toBe(true);
  });

  it('keeps null open interest and typical moves as null, and fields the API adds later', async () => {
    const f = fixture('positioning_hl_4h');
    const record = (f.body.data as Record<string, unknown>[])[0]!;
    const body = {
      ...f.body,
      data: [{ ...record, oi_start: null, mark_start: null, typical_price: null, typical_oi: null, typical_flow: null, state: 'quiet' }],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body }));
    for (const validate of [false, true]) {
      const page = await client(validate).hyperliquid.positioning.current({ window: '4h' });
      expect(page.data[0]).toMatchObject({ oiStart: null, markStart: null, typicalPrice: null, typicalOi: null, typicalFlow: null });
    }
  });
});

describe('refused before sending', () => {
  it.each([
    ['trade intent interval', () => client().hyperliquid.tradeIntent.history('BTC', { interval: '2m' as never }), RangeError],
    ['trade intent limit', () => client().hyperliquid.tradeIntent.history('BTC', { limit: 2001 }), RangeError],
    ['trade intent symbol', () => client().hyperliquid.tradeIntent.history(''), TypeError],
    ['usdc kind', () => client().hyperliquid.usdcFlows.history({ kind: 'bridge' as never }), RangeError],
    ['usdc minUsd', () => client().hyperliquid.usdcFlows.history({ minUsd: -1 }), RangeError],
    ['usdc limit', () => client().hyperliquid.usdcFlows.history({ limit: 1001 }), RangeError],
    ['volume interval', () => client().hyperliquid.usdcFlows.volume({ interval: '1w' as never }), RangeError],
    ['breadth n missing', () => client().hyperliquid.breadthMa.current({} as never), TypeError],
    ['breadth n', () => client().hyperliquid.breadthMa.history({ n: 7 as never }), RangeError],
    ['breadth interval', () => client().hyperliquid.hip3.breadthMa.history({ n: 5, interval: '1w' as never }), RangeError],
    ['positioning window missing', () => client().hyperliquid.positioning.current({} as never), TypeError],
    ['positioning window', () => client().hyperliquid.hip3.positioning.current({ window: '2h' as never }), RangeError],
  ])('%s', async (_name, call, type) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(call()).rejects.toBeInstanceOf(type);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['tradeIntent.iterate', () => client().hyperliquid.tradeIntent.iterate('BTC', {} as never)],
    ['usdcFlows.iterate', () => client().hyperliquid.usdcFlows.iterate({} as never)],
    ['usdcFlows.iterateVolume', () => client().hyperliquid.usdcFlows.iterateVolume({} as never)],
    ['breadthMa.iterate', () => client().hyperliquid.breadthMa.iterate({ n: 5 } as never)],
  ])('%s needs start', (_name, call) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(call).toThrow(TypeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('the plan refusal', () => {
  it.each([
    ['usdc_flows_free_forbidden', 'usdc_flows', () => client().hyperliquid.usdcFlows.history()],
    ['trade_intent_free_forbidden', 'trade_intent', () => client().hyperliquid.tradeIntent.history('BTC')],
    ['breadth_ma_free_forbidden', 'breadth_ma', () => client().hyperliquid.breadthMa.current({ n: 5 })],
    ['positioning_free_forbidden', 'positioning', () => client().hyperliquid.positioning.current({ window: '1h' })],
  ])('%s is a PlanRequiredError', async (name, datatype, call) => {
    const f = fixture(name);
    stubFetch(name);
    const error = await call().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PlanRequiredError);
    expect(error).toBeInstanceOf(OxArchiveError);
    const e = error as PlanRequiredError;
    expect(e.name).toBe('PlanRequiredError');
    expect(e.status).toBe(403);
    expect(e.errorCode).toBe('forbidden');
    expect(e.requestId).toBe(f.body.request_id);
    expect(e.datatype).toBe(datatype);
    expect(e.requiredPlans).toEqual(['build', 'pro', 'scale', 'enterprise']);
    expect(e.upgradeUrl).toBe('https://0xarchive.io/pricing');
    expect(e.message).toBe(f.body.error);
  });

  it('a 403 that names no plans stays a plain OxArchiveError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ code: 403, error: 'Forbidden', error_code: 'forbidden', request_id: 'r', success: false }),
      }),
    );
    const error = await client().hyperliquid.usdcFlows.history().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OxArchiveError);
    expect(error).not.toBeInstanceOf(PlanRequiredError);
    expect((error as OxArchiveError).errorCode).toBe('forbidden');
  });
});

describe('recorded errors keep their code, parameter and values', () => {
  it.each([
    ['breadth_ma_missing_n', () => client().hyperliquid.breadthMa.history({ n: 5 }), 400, 'invalid_parameter', 'n', ['5', '20', '50', '200']],
    ['breadth_ma_current_refuses_window', () => client().hyperliquid.breadthMa.current({ n: 5 }), 400, 'invalid_parameter', 'interval', undefined],
    ['trade_intent_invalid_interval', () => client().hyperliquid.tradeIntent.history('BTC'), 400, 'invalid_interval', 'interval', ['1s', '5s', '15s', '1m', '5m', '15m', '1h', '4h', '1d']],
    ['usdc_flows_volume_refuses_min_usd', () => client().hyperliquid.usdcFlows.volume(), 400, 'invalid_parameter', 'min_usd', undefined],
    ['positioning_missing_window', () => client().hyperliquid.positioning.current({ window: '1h' }), 400, 'invalid_parameter', 'window', ['1h', '4h', '24h']],
    ['positioning_refuses_end', () => client().hyperliquid.positioning.current({ window: '1h' }), 400, 'invalid_parameter', 'end', undefined],
    ['positioning_cold_503', () => client().hyperliquid.positioning.current({ window: '4h' }), 503, 'upstream_unavailable', undefined, undefined],
  ])('%s', async (name, call, status, code, param, validValues) => {
    stubFetch(name);
    const e = (await call().catch((err: unknown) => err)) as OxArchiveError;
    expect(e).toBeInstanceOf(OxArchiveError);
    expect(e).not.toBeInstanceOf(PlanRequiredError);
    expect(e.status).toBe(status);
    expect(e.errorCode).toBe(code);
    expect(e.param).toBe(param);
    expect(e.validValues).toEqual(validValues);
  });

  it.each([
    [
      'usdc_flows_hip3_unsupported',
      'usdc_flows',
      [{ route: '/v1/hyperliquid/usdc-flows', venue: 'hyperliquid' }],
      () => client().hyperliquid.usdcFlows.history(),
    ],
    [
      'positioning_lighter_unsupported',
      'positioning',
      [
        { route: '/v1/hyperliquid/positioning', venue: 'hyperliquid' },
        { route: '/v1/hyperliquid/hip3/positioning', venue: 'hip3' },
      ],
      () => client().hyperliquid.positioning.current({ window: '1h' }),
    ],
  ])('%s keeps where the datatype is served', async (name, datatype, availableOn, call) => {
    stubFetch(name);
    const e = (await call().catch((err: unknown) => err)) as OxArchiveError;
    expect(e.status).toBe(404);
    expect(e.errorCode).toBe('unsupported_for_venue');
    expect(e.body).toMatchObject({ datatype, availableOn });
  });
});

describe('capabilities rows of the four datasets', () => {
  it('parse under validation, with the Build-and-above plans', async () => {
    const f = fixture('capabilities_derived_rows');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(f)));
    const rows = await client(true).capabilities();
    expect(rows.map((r) => `${r.venue}:${r.datatype}`)).toEqual([
      'hyperliquid:usdc_flows',
      'hyperliquid:trade_intent',
      'hyperliquid:breadth_ma',
      'hyperliquid:positioning',
      'hip3:trade_intent',
      'hip3:breadth_ma',
      'hip3:positioning',
    ]);
    for (const row of rows) expect(row.plans).toEqual(['build', 'pro', 'scale', 'enterprise']);
    const flows = rows.find((r) => r.datatype === 'usdc_flows')!;
    expect(flows.restRoutes).toEqual(['/v1/hyperliquid/usdc-flows', '/v1/hyperliquid/usdc-flows/volume']);
    expect(flows.availableFrom).toBe('2025-09-27T09:33:00.000Z');
    expect(rows.find((r) => r.datatype === 'positioning')?.pageLimit).toBeNull();
  });
});
