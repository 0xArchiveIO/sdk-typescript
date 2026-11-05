/**
 * News stories on Hyperliquid, HIP-3 and Lighter.
 *
 * The bodies in tests/fixtures/news have the shape the backend builds
 * (migration 338's news_story_json and the reaction job), with the regression
 * values of the news build (BTC 2026-11-04 02:57 UTC, xyz:CL 18:07 UTC). They
 * are not recordings: the routes are dark until NEWS_ROUTES_ENABLED is set,
 * so replace them with recordings after launch. No network is used.
 */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NewsStorySchema, OxArchive, OxArchiveError, PlanRequiredError } from '../src';

const BASE = 'https://api.example.test';

interface Fixture {
  request: { path: string; query: Record<string, string | number>; plan: string };
  status: number;
  body: Record<string, unknown> & { data?: unknown; meta?: Record<string, unknown> };
}

function fixture(name: string): Fixture {
  return JSON.parse(readFileSync(new URL(`./fixtures/news/${name}.json`, import.meta.url), 'utf8')) as Fixture;
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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const FIRST_SEEN = Date.UTC(2026, 10, 4, 2, 57, 0);
const CURSOR = '1793760070100_c3d90be1a7746f20';

describe('where news is served', () => {
  it('is on Hyperliquid, HIP-3 and Lighter, and nowhere else', () => {
    const c = client();
    expect(c.hyperliquid.news).toBeDefined();
    expect(c.hyperliquid.hip3.news).toBeDefined();
    expect(c.lighter.news).toBeDefined();
    expect('news' in c.rhLighter).toBe(false);
    expect('news' in c.hyperliquid.hip4).toBe(false);
    expect('news' in c.spot).toBe(false);
  });
});

describe('news.list()', () => {
  it('sends the filters and parses stories with their reactions', async () => {
    const f = fixture('news_hl_page1');
    const fetchMock = stubFetch('news_hl_page1');
    const page = await client().hyperliquid.news.list({ limit: 2, minWeight: 2, symbols: ['BTC', 'BNB'] });

    expect(urlAt(fetchMock).pathname).toBe('/v1/hyperliquid/news');
    expect(queryAt(fetchMock)).toEqual(recordedQuery(f));
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBe(CURSOR);
    const [liq, tree] = page.data;

    expect(liq.id).toBe('st_8a41c07e5d2b9f13');
    expect([liq.origin, liq.topic, liq.weight, liq.weightRule]).toEqual(['venue', 'liquidation', 3, 'venue']);
    expect(liq.firstSeenAt).toBe('2026-11-04T02:57:00.000Z');
    expect(liq.url).toBeNull();
    expect(liq.sourceLine).toBeNull();
    expect(liq.markets).toEqual([{ venue: 'hyperliquid', symbol: 'BTC' }]);
    const reaction = liq.reaction!;
    expect(reaction.status).toBe('final');
    expect(reaction.from).toBe(liq.firstSeenAt);
    expect(reaction.market).toEqual({ venue: 'hyperliquid', symbol: 'BTC' });
    const five = reaction.windows['5m']!;
    expect(five.end).toBe('2026-11-04T03:02:00.000Z');
    expect(five.price).toEqual({ at: 76554, end: 75983, movePct: -0.75 });
    expect(five.liquidationsUsd).toEqual({ long: 16650000, short: 0, total: 16650000 });
    expect([five.oiChangePct, five.volumeVsPrior, five.moveZ, five.moveLevel]).toEqual([-0.76, 4.4, -7, 'large']);
    expect(five.bidDepth_25bpUsd).toEqual({ at: 4200000, end: 3100000 });
    expect(five.askDepth_25bpUsd).toEqual({ at: 3900000, end: 3600000 });
    expect(reaction.others).toEqual([
      { market: { venue: 'hyperliquid', symbol: 'ETH' }, movePct_5m: -1.12, oiChangePct_5m: -0.9 },
    ]);
    expect(reaction.knownAt).toBeDefined();
    // The 1-minute window has no depth or move_z.
    const one = reaction.windows['1m']!;
    expect(one.moveLevel).toBeUndefined();
    expect(one.bidDepth_25bpUsd).toBeUndefined();

    expect(tree.source).toBe('Tree News');
    expect(tree.sourceLine).toBe('via Tree News');
    expect(tree.headline).toBe('Binance says it has replenished 95% of stolen crypto assets');
    expect(tree.markets.map((m) => m.symbol)).toEqual(['BNB', 'BTC']);
    expect(tree.reports.map((r) => r.source)).toEqual(['Tree News', 'Tree News']);
    expect(tree.reports[1].publishedAt).toBeNull();
  });

  it('a measuring reaction has only the windows that are due; unmeasured figures stay null', async () => {
    stubFetch('news_hl_page1');
    const tree = (await client().hyperliquid.news.list({ limit: 2, minWeight: 2, symbols: 'BTC,BNB' })).data[1];

    expect(tree.reaction!.status).toBe('measuring');
    expect(Object.keys(tree.reaction!.windows)).toEqual(['1m']);
    expect(tree.reaction!.windows['5m']).toBeUndefined();
    expect(tree.reaction!.windows['1m']!.oiChangePct).toBeNull();
    expect(tree.reaction!.windows['1m']!.liquidationsUsd!.total).toBe(0);
  });

  it('a story with no market has no reaction, and the last page has no cursor', async () => {
    const fetchMock = stubFetch('news_hl_page2');
    const page = await client().hyperliquid.news.list({ limit: 2, minWeight: 2, symbols: 'BTC,BNB', cursor: CURSOR });

    expect(queryAt(fetchMock)).toEqual(recordedQuery(fixture('news_hl_page2')));
    expect(page.data[0].markets).toEqual([]);
    expect(page.data[0].reaction).toBeNull();
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeUndefined();
  });

  it('sends asOf as Unix milliseconds', async () => {
    const fetchMock = stubFetch('news_hl_as_of');
    const page = await client().hyperliquid.news.list({
      asOf: new Date(FIRST_SEEN + 90_000),
      limit: 1,
      symbols: 'BTC',
    });

    expect(queryAt(fetchMock).as_of).toBe(String(FIRST_SEEN + 90_000));
    expect(queryAt(fetchMock)).toEqual(recordedQuery(fixture('news_hl_as_of')));
    expect(page.data[0].reaction!.status).toBe('measuring');
    expect(Object.keys(page.data[0].reaction!.windows)).toEqual(['1m']);
  });

  it('turns start and end into Unix milliseconds', async () => {
    const fetchMock = stubFetch('news_hl_page2');
    await client().hyperliquid.news.list({ start: '2026-11-04', end: new Date(1793836800000), topic: 'hack' });
    const q = queryAt(fetchMock);
    expect(q.start).toBe(String(Date.UTC(2026, 10, 4)));
    expect(q.end).toBe('1793836800000');
    expect(q.topic).toBe('hack');
  });

  it('takes symbols as a string or an array, trimmed, and sends none when empty', async () => {
    const fetchMock = stubFetch('news_hl_page2', 'news_hl_page2', 'news_hl_page2');
    const news = client().hyperliquid.news;
    await news.list({ symbols: [' BTC', 'ETH,SOL '] });
    await news.list({ symbols: 'BTC' });
    await news.list({ symbols: [] });
    expect(queryAt(fetchMock, 0).symbols).toBe('BTC,ETH,SOL');
    expect(queryAt(fetchMock, 1).symbols).toBe('BTC');
    expect('symbols' in queryAt(fetchMock, 2)).toBe(false);
  });

  it('HIP-3 uses its own route and keeps the symbol as given', async () => {
    const fetchMock = stubFetch('news_hip3_cl');
    const page = await client().hyperliquid.hip3.news.list({ symbols: 'xyz:CL', topic: 'macro', limit: 1 });

    expect(urlAt(fetchMock).pathname).toBe('/v1/hyperliquid/hip3/news');
    expect(queryAt(fetchMock)).toEqual(recordedQuery(fixture('news_hip3_cl')));
    const story = page.data[0];
    expect(story.markets).toEqual([
      { venue: 'hip3', symbol: 'xyz:CL' },
      { venue: 'hip3', symbol: 'xyz:BRENTOIL' },
    ]);
    const five = story.reaction!.windows['5m']!;
    expect(five.price).toEqual({ at: 88.173, end: 88.9, movePct: 0.82 });
    expect([five.oiChangePct, five.volumeVsPrior, five.moveZ, five.moveLevel]).toEqual([1.83, 8.3, 3.6, 'large']);
  });

  it('Lighter reports a liquidation total only', async () => {
    const fetchMock = stubFetch('news_lighter_total_only');
    const page = await client().lighter.news.list({ symbols: 'BTC', limit: 1 });

    expect(urlAt(fetchMock).pathname).toBe('/v1/lighter/news');
    const five = page.data[0].reaction!.windows['5m']!;
    expect(five.liquidationsUsd).toEqual({ long: null, short: null, total: 1210000 });
    expect(five.moveZ).toBeNull();
    expect(five.moveLevel).toBeNull();
  });

  it('keeps fields the API adds later', async () => {
    const f = fixture('news_hl_page2');
    (f.body.data as Record<string, unknown>[])[0].futureField = 7;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(f)));
    const page = await client().hyperliquid.news.list();
    expect((page.data[0] as unknown as Record<string, unknown>).futureField).toBe(7);
  });
});

describe('news.iterate()', () => {
  it('follows the cursor with the same window and filters until it is absent', async () => {
    const fetchMock = stubFetch('news_hl_page1', 'news_hl_page2');
    const ids = (
      await collect(client().hyperliquid.news.iterate({ limit: 2, minWeight: 2, symbols: 'BTC,BNB', start: 1 }))
    ).map((s) => s.id);

    expect(ids).toEqual(['st_8a41c07e5d2b9f13', 'st_c3d90be1a7746f20', 'st_19ab0c5d7e3f8a42']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect('cursor' in queryAt(fetchMock, 0)).toBe(false);
    expect(queryAt(fetchMock, 1).cursor).toBe(CURSOR);
    const { cursor: _c, ...second } = queryAt(fetchMock, 1);
    expect(second).toEqual(queryAt(fetchMock, 0));
  });

  it('fixes a missing end once and sends it on every page', async () => {
    let now = 1_793_700_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => (now += 60_000));
    const fetchMock = stubFetch('news_hl_page1', 'news_hl_page2');
    await collect(client().hyperliquid.news.iterate({ limit: 2 }));

    expect(queryAt(fetchMock, 0).end).toBe(String(1_793_700_060_000));
    expect(queryAt(fetchMock, 1).end).toBe(queryAt(fetchMock, 0).end);
  });

  it('works without a start', async () => {
    const fetchMock = stubFetch('news_hl_page2');
    await collect(client().lighter.news.iterate({ end: 1_793_836_800_000 }));
    expect('start' in queryAt(fetchMock)).toBe(false);
  });

  it('throws when a page returns the cursor it was sent', async () => {
    const fetchMock = stubFetch('news_hl_page1', 'news_hl_page1');
    const error = await collect(client().hyperliquid.news.iterate({ limit: 2 })).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OxArchiveError);
    expect((error as OxArchiveError).message).toContain('cursor it was sent');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('refused before sending', () => {
  it.each([
    ['limit 0', () => client().hyperliquid.news.list({ limit: 0 })],
    ['limit 501', () => client().hyperliquid.news.list({ limit: 501 })],
    ['minWeight 0', () => client().hyperliquid.news.list({ minWeight: 0 as never })],
    ['minWeight 4', () => client().lighter.news.list({ minWeight: 4 as never })],
    ['21 symbols', () => client().hyperliquid.news.list({ symbols: Array.from({ length: 21 }, (_, i) => `S${i}`) })],
    ['bad start', () => client().hyperliquid.news.list({ start: 'not a time' })],
    ['bad asOf', () => client().hyperliquid.news.list({ asOf: 'later' })],
  ])('%s', async (_name, call) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(call()).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('errors', () => {
  it.each([
    ['/v1/hyperliquid/news', () => client().hyperliquid.news.list()],
    ['/v1/hyperliquid/hip3/news', () => client().hyperliquid.hip3.news.list()],
    ['/v1/lighter/news', () => client().lighter.news.list()],
  ])('a Free key gets a PlanRequiredError on %s', async (path, call) => {
    const f = fixture('news_free_forbidden');
    const fetchMock = stubFetch('news_free_forbidden');
    const error = await call().catch((e: unknown) => e);

    expect(urlAt(fetchMock).pathname).toBe(path);
    expect(error).toBeInstanceOf(PlanRequiredError);
    expect(error).toBeInstanceOf(OxArchiveError);
    const e = error as PlanRequiredError;
    expect(e.status).toBe(403);
    expect(e.errorCode).toBe('forbidden');
    expect(e.datatype).toBe('news');
    expect(e.requiredPlans).toEqual(['build', 'pro', 'scale', 'enterprise']);
    expect(e.upgradeUrl).toBe('https://0xarchive.io/pricing');
    expect(e.requestId).toBe(f.body.request_id);
    expect(e.message).toBe(f.body.error);
  });

  it('keeps the code and parameter of a bad request', async () => {
    stubFetch('news_invalid_parameter');
    const error = (await client().hyperliquid.news.list({ minWeight: 3 }).catch((e: unknown) => e)) as OxArchiveError;
    expect(error).toBeInstanceOf(OxArchiveError);
    expect(error).not.toBeInstanceOf(PlanRequiredError);
    expect(error.status).toBe(400);
    expect(error.errorCode).toBe('invalid_parameter');
  });
});

describe('validation', () => {
  it('parses every fixture story under validate: true', async () => {
    for (const name of ['news_hl_page1', 'news_hl_page2', 'news_hip3_cl', 'news_lighter_total_only', 'news_hl_as_of']) {
      stubFetch(name);
      const f = fixture(name);
      const fn =
        f.request.path === '/v1/lighter/news'
          ? client(true).lighter.news.list(recordedParams(f))
          : f.request.path.includes('hip3')
            ? client(true).hyperliquid.hip3.news.list(recordedParams(f))
            : client(true).hyperliquid.news.list(recordedParams(f));
      const page = await fn;
      for (const story of page.data) expect(NewsStorySchema.safeParse(story).success).toBe(true);
    }
  });

  it('rejects a story with a missing headline', async () => {
    const f = fixture('news_hl_page2');
    delete (f.body.data as Record<string, unknown>[])[0].headline;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(f)));
    await expect(client(true).hyperliquid.news.list()).rejects.toThrow();
  });
});

function recordedParams(f: Fixture) {
  const q = f.request.query;
  return {
    ...(q.limit !== undefined ? { limit: Number(q.limit) } : {}),
    ...(q.symbols !== undefined ? { symbols: String(q.symbols) } : {}),
    ...(q.topic !== undefined ? { topic: String(q.topic) } : {}),
  };
}
