import { afterEach, describe, expect, it, vi } from 'vitest';
import { OxArchive } from '../src';

const BASE = 'https://api.example.test';

type Body = Record<string, unknown>;

function reply(body: Body, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

function ok(data: unknown, meta: Body = {}) {
  return reply({ success: true, data, meta: { count: Array.isArray(data) ? data.length : 1, request_id: 'req', ...meta } });
}

function stubFetch(...responses: Array<ReturnType<typeof reply>>) {
  const fetchMock = vi.fn();
  for (const response of responses) fetchMock.mockResolvedValueOnce(response);
  fetchMock.mockResolvedValue(ok([]));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function urlAt(fetchMock: ReturnType<typeof vi.fn>, call = 0): URL {
  return new URL(String(fetchMock.mock.calls[call]?.[0]));
}

function client(validate = false) {
  return new OxArchive({ apiKey: 'test-key', baseUrl: BASE, validate });
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

describe('methods only where the API serves the route', () => {
  it('Hyperliquid core and HIP-3 orders keep history, flow, TP/SL and trigger levels', () => {
    const c = client();
    for (const orders of [c.hyperliquid.orders, c.hyperliquid.hip3.orders]) {
      expect(methodsOf(orders)).toEqual(['flow', 'history', 'tpsl', 'triggerLevels', 'triggerLevelsHistory']);
    }
  });

  it('HIP-4 orders have no trigger levels', () => {
    expect(methodsOf(client().hyperliquid.hip4.orders)).toEqual(['flow', 'history', 'tpsl']);
  });

  it('Spot orders have history only', () => {
    expect(methodsOf(client().spot.orders)).toEqual(['history']);
  });

  it('HIP-4 has no full-depth L2 resource', () => {
    const hip4 = client().hyperliquid.hip4 as unknown as Record<string, unknown>;
    expect('l2Orderbook' in hip4).toBe(false);
    expect(client().hyperliquid.l2Orderbook).toBeDefined();
    expect(client().hyperliquid.hip3.l2Orderbook).toBeDefined();
  });

  it('only Hyperliquid core liquidations look up by user', () => {
    const c = client();
    expect(methodsOf(c.hyperliquid.liquidations)).toContain('byUser');
    expect(methodsOf(c.hyperliquid.hip3.liquidations)).toEqual(['history', 'levels', 'levelsHistory', 'volume']);
  });
});

describe('data-quality symbol coverage path', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ['hip3', 'km:US500', '/v1/data-quality/coverage/hip3/km%3AUS500'],
    ['hip3', 'xyz:abc', '/v1/data-quality/coverage/hip3/xyz%3Aabc'],
    ['spot', 'HYPE-USDC', '/v1/data-quality/coverage/spot/HYPE-USDC'],
    ['hip4', '#0', '/v1/data-quality/coverage/hip4/%230'],
    ['HyperLiquid', 'BTC', '/v1/data-quality/coverage/hyperliquid/BTC'],
  ])('%s %s is sent case-preserved and URL-encoded', async (exchange, symbol, path) => {
    const fetchMock = stubFetch(reply({ exchange, symbol, data_types: {} }));

    await client().dataQuality.symbolCoverage(exchange, symbol, { from: 1, to: 2 });

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`${BASE}${path}?from=1&to=2`);
  });
});

const BUCKET = { last_updated: '2026-09-29T03:17:57.217Z', lag_ms: 784 };

describe('freshness shapes', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('Spot freshness returns the Spot buckets and passes validation', async () => {
    const fetchMock = stubFetch(
      ok({
        coin: 'HYPE-USDC',
        symbol: 'HYPE-USDC',
        exchange: 'spot',
        measured_at: '2026-09-29T03:17:58.001721916Z',
        orderbook: BUCKET,
        trades: BUCKET,
        l4_checkpoints: BUCKET,
        l4_diffs: BUCKET,
        orders: BUCKET,
        twap: { last_updated: null, lag_ms: null },
      })
    );

    const fresh = await client(true).spot.freshness('hype-usdc');

    expect(urlAt(fetchMock).pathname).toBe('/v1/hyperliquid/spot/freshness/HYPE-USDC');
    expect(fresh).toEqual({
      coin: 'HYPE-USDC',
      symbol: 'HYPE-USDC',
      exchange: 'spot',
      measuredAt: '2026-09-29T03:17:58.001721916Z',
      orderbook: { lastUpdated: BUCKET.last_updated, lagMs: 784 },
      trades: { lastUpdated: BUCKET.last_updated, lagMs: 784 },
      l4Checkpoints: { lastUpdated: BUCKET.last_updated, lagMs: 784 },
      l4Diffs: { lastUpdated: BUCKET.last_updated, lagMs: 784 },
      orders: { lastUpdated: BUCKET.last_updated, lagMs: 784 },
      twap: { lastUpdated: null, lagMs: null },
    });
  });

  it('HIP-4 freshness has no funding bucket and passes validation', async () => {
    stubFetch(
      ok({
        coin: '#0',
        symbol: '#0',
        exchange: 'hip4',
        measured_at: '2026-09-29T03:17:58.070590549Z',
        orderbook: {},
        trades: {},
        open_interest: {},
      })
    );

    const fresh = await client(true).hyperliquid.hip4.getFreshness('#0');

    expect(fresh.funding).toBeUndefined();
    expect(fresh.symbol).toBe('#0');
    expect(fresh.openInterest).toEqual({});
  });

  it('core freshness keeps symbol and funding under validation', async () => {
    stubFetch(
      ok({
        coin: 'BTC',
        symbol: 'BTC',
        exchange: 'hyperliquid',
        measured_at: '2026-09-29T03:17:58Z',
        orderbook: BUCKET,
        trades: BUCKET,
        funding: BUCKET,
        open_interest: BUCKET,
        liquidations: BUCKET,
      })
    );

    const fresh = await client(true).hyperliquid.freshness('BTC');

    expect(fresh.symbol).toBe('BTC');
    expect(fresh.funding?.lagMs).toBe(784);
  });
});

describe('Lighter L3 account filter', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('get() sends account with timestamp and depth', async () => {
    const fetchMock = stubFetch(ok({ coin: 'BTC', orders: [] }));

    await client().lighter.l3Orderbook.get('btc', {
      timestamp: '2026-03-05T00:00:00Z',
      depth: 50,
      account: 281474976710654,
    });

    const url = urlAt(fetchMock);
    expect(url.pathname).toBe('/v1/lighter/l3orderbook/BTC');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      timestamp: String(Date.parse('2026-03-05T00:00:00Z')),
      depth: '50',
      account: '281474976710654',
    });
  });

  it('history() sends account', async () => {
    const fetchMock = stubFetch(ok([], { next_cursor: '1790645044705' }));

    const page = await client().lighter.l3Orderbook.history('BTC', {
      start: 1,
      end: 2,
      limit: 10,
      account: '713845',
    });

    const url = urlAt(fetchMock);
    expect(url.pathname).toBe('/v1/lighter/l3orderbook/BTC/history');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      start: '1',
      end: '2',
      limit: '10',
      account: '713845',
    });
    expect(page.nextCursor).toBe('1790645044705');
  });
});

describe('opaque cursors', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('HIP-4 trades pass the composite cursor through unchanged', async () => {
    const cursor = '1790575451682_379606340537712';
    const fetchMock = stubFetch(ok([], { next_cursor: cursor }), ok([]), ok([]));
    const hip4 = client().hyperliquid.hip4;
    const window = { start: 1790400000000, end: 1790600000000, limit: 2 };

    const first = await hip4.trades.list('62970', window);
    await hip4.trades.list('62970', { ...window, cursor: first.nextCursor });
    await hip4.getTrades('#62970', { ...window, cursor: first.nextCursor });

    expect(first.nextCursor).toBe(cursor);
    expect(urlAt(fetchMock, 1).searchParams.get('cursor')).toBe(cursor);
    expect(urlAt(fetchMock, 2).searchParams.get('cursor')).toBe(cursor);
    expect(urlAt(fetchMock, 2).pathname).toBe('/v1/hyperliquid/hip4/trades/%2362970');
  });
});
