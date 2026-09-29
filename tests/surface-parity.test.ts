import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CvdResource,
  Hip3OracleResource,
  Hip4QuestionsResource,
  OxArchive,
  SymbolsResource,
  WalletsResource,
} from '../src';
import type { CvdParams, WsChannel, WsL2FullDepthBatch, WsL2FullDepthSnapshot } from '../src';
import {
  FULL_DEPTH_L2_CHANNELS,
  FULL_DEPTH_L2_LIVE_ONLY_REPLAY_ERROR,
  OxArchiveWs,
} from '../src/websocket';
import { WsChannelSchema, WsServerMessageSchema } from '../src/schemas';

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

function requestAt(fetchMock: ReturnType<typeof vi.fn>, call = 0): { method: string; url: URL } {
  const [url, init] = fetchMock.mock.calls[call] as [string, RequestInit];
  return { method: String(init.method), url: new URL(url) };
}

function client(validate = false) {
  return new OxArchive({ apiKey: 'test-key', baseUrl: BASE, validate });
}

const CVD_ROWS = [
  { timestamp: 1790639100000, buy_volume: 9980.41574, sell_volume: 231235.17863, delta: -221254.76289, cumulative_delta: -221254.76289 },
  { timestamp: 1790639160000, buy_volume: 21354.74669, sell_volume: 4732459.50115, delta: -4711104.75446, cumulative_delta: -4932359.51735 },
];

describe('CVD', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is exposed on Hyperliquid core and HIP-3', () => {
    const c = client();
    expect(c.hyperliquid.cvd).toBeInstanceOf(CvdResource);
    expect(c.hyperliquid.hip3.cvd).toBeInstanceOf(CvdResource);
  });

  it('GETs /v1/hyperliquid/cvd/{symbol} with the window and returns buckets, cursor and meta', async () => {
    const notice = 'cumulative_delta runs from the first bucket of this page; to join pages, rebuild it from delta';
    const fetchMock = stubFetch(ok(CVD_ROWS, { next_cursor: '1790639160000', notice }));

    const page = await client().hyperliquid.cvd.history('btc', {
      start: '2026-09-29T00:00:00Z',
      end: 1790650000000,
      interval: '1m',
      limit: 2,
    });

    const { method, url } = requestAt(fetchMock);
    expect(method).toBe('GET');
    expect(url.pathname).toBe('/v1/hyperliquid/cvd/BTC');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      start: String(Date.parse('2026-09-29T00:00:00Z')),
      end: '1790650000000',
      interval: '1m',
      limit: '2',
    });
    expect(page.data[0]).toEqual({
      timestamp: 1790639100000,
      buyVolume: 9980.41574,
      sellVolume: 231235.17863,
      delta: -221254.76289,
      cumulativeDelta: -221254.76289,
    });
    expect(page.nextCursor).toBe('1790639160000');
    expect(page.meta?.notice).toBe(notice);
  });

  it('passes the cursor back unchanged with the same window, and stops when it is absent', async () => {
    const fetchMock = stubFetch(ok([CVD_ROWS[0]], { next_cursor: '1790639100000' }), ok([CVD_ROWS[1]]));
    const window: CvdParams = { start: 1790600000000, end: 1790650000000, interval: '1m' };

    const cvd = client().hyperliquid.cvd;
    const pages = [await cvd.history('BTC', window)];
    while (pages[pages.length - 1].nextCursor) {
      pages.push(await cvd.history('BTC', { ...window, cursor: pages[pages.length - 1].nextCursor }));
    }

    expect(pages).toHaveLength(2);
    expect(pages[1].nextCursor).toBeUndefined();
    const second = requestAt(fetchMock, 1).url;
    expect(second.searchParams.get('cursor')).toBe('1790639100000');
    expect(second.searchParams.get('start')).toBe('1790600000000');
    expect(second.searchParams.get('end')).toBe('1790650000000');
    expect(second.searchParams.get('interval')).toBe('1m');
  });

  it('sends no query string when called without params (newest buckets of the last 24 hours)', async () => {
    const fetchMock = stubFetch(ok(CVD_ROWS));

    await client().hyperliquid.cvd.history('ETH');

    expect(requestAt(fetchMock).url.search).toBe('');
  });

  it('keeps HIP-3 symbols case-sensitive under /v1/hyperliquid/hip3/cvd', async () => {
    const fetchMock = stubFetch(ok(CVD_ROWS));

    await client().hyperliquid.hip3.cvd.history('km:US500', { interval: '1h' });

    expect(requestAt(fetchMock).url.pathname).toBe('/v1/hyperliquid/hip3/cvd/km:US500');
  });

  it('validates the bucket shape when validation is on', async () => {
    stubFetch(ok([{ timestamp: 1, buy_volume: 'x' }]));

    await expect(client(true).hyperliquid.cvd.history('BTC')).rejects.toMatchObject({ code: 422 });
  });
});

describe('HIP-3 oracle', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is exposed on client.hyperliquid.hip3.oracle', () => {
    expect(client().hyperliquid.hip3.oracle).toBeInstanceOf(Hip3OracleResource);
  });

  it('discoveryBounds() GETs the discovery-bounds route', async () => {
    const fetchMock = stubFetch(
      ok({
        symbol: 'km:US500',
        reference_price: 752.24,
        reference_source: 'external',
        max_leverage: 20,
        bound_fraction: 0.05,
        lower_bound: 714.628,
        upper_bound: 789.852,
        block_number: 1038634032,
        timestamp: 1781678086894,
      })
    );

    const bounds = await client(true).hyperliquid.hip3.oracle.discoveryBounds('km:US500');

    const { method, url } = requestAt(fetchMock);
    expect(method).toBe('GET');
    expect(url.pathname).toBe('/v1/hyperliquid/hip3/oracle/discovery-bounds/km:US500');
    expect(bounds).toEqual({
      symbol: 'km:US500',
      referencePrice: 752.24,
      referenceSource: 'external',
      maxLeverage: 20,
      boundFraction: 0.05,
      lowerBound: 714.628,
      upperBound: 789.852,
      blockNumber: 1038634032,
      timestamp: 1781678086894,
    });
  });

  it('externalPrice() GETs the external-price route and allows null prices', async () => {
    const fetchMock = stubFetch(
      ok({ symbol: 'xyz:XYZ100', external_price: null, mark_price: 752.1, block_number: 1, timestamp: 2 })
    );

    const price = await client(true).hyperliquid.hip3.oracle.externalPrice('xyz:XYZ100');

    expect(requestAt(fetchMock).url.pathname).toBe('/v1/hyperliquid/hip3/oracle/external-price/xyz:XYZ100');
    expect(price).toEqual({ symbol: 'xyz:XYZ100', externalPrice: null, markPrice: 752.1, blockNumber: 1, timestamp: 2 });
  });
});

const QUESTION = {
  question_id: 0,
  name: 'Recurring',
  description: 'class:priceBucket|underlying:BTC|expiry:20260508-0600|priceThresholds:79303,82540|period:1d',
  fallback_outcome_id: 6,
  named_outcome_ids: [7, 8, 9],
  settled_named_outcomes: [],
  first_seen_at: '2026-05-08T05:57:28.326Z',
  last_updated_at: '2026-05-08T05:57:28.326Z',
};

describe('HIP-4 questions', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is exposed on client.hyperliquid.hip4.questions', () => {
    expect(client().hyperliquid.hip4.questions).toBeInstanceOf(Hip4QuestionsResource);
  });

  it('list() GETs /questions with cursor and limit and returns nextCursor', async () => {
    const fetchMock = stubFetch(ok([QUESTION], { next_cursor: '0' }));

    const page = await client(true).hyperliquid.hip4.questions.list({ limit: 1, cursor: '5' });

    const { method, url } = requestAt(fetchMock);
    expect(method).toBe('GET');
    expect(url.pathname).toBe('/v1/hyperliquid/hip4/questions');
    expect(Object.fromEntries(url.searchParams)).toEqual({ limit: '1', cursor: '5' });
    expect(page.nextCursor).toBe('0');
    expect(page.data[0]).toEqual({
      questionId: 0,
      name: 'Recurring',
      description: QUESTION.description,
      fallbackOutcomeId: 6,
      namedOutcomeIds: [7, 8, 9],
      settledNamedOutcomes: [],
      firstSeenAt: '2026-05-08T05:57:28.326Z',
      lastUpdatedAt: '2026-05-08T05:57:28.326Z',
    });
  });

  it('get() GETs /questions/{question_id}', async () => {
    const fetchMock = stubFetch(ok({ ...QUESTION, question_id: 12 }));

    const question = await client().hyperliquid.hip4.questions.get(12);

    expect(requestAt(fetchMock).url.pathname).toBe('/v1/hyperliquid/hip4/questions/12');
    expect(question.questionId).toBe(12);
  });

  it('keeps fields the API adds under validation', async () => {
    stubFetch(ok({ ...QUESTION, resolution_source: 'oracle' }));

    const question = await client(true).hyperliquid.hip4.questions.get(0);

    expect(question.resolutionSource).toBe('oracle');
  });

  it('listQuestions() and getQuestion() on the HIP-4 client use the same routes', async () => {
    const fetchMock = stubFetch(ok([QUESTION]), ok(QUESTION));
    const hip4 = client().hyperliquid.hip4;

    await hip4.listQuestions({ limit: 10 });
    await hip4.getQuestion('0');

    expect(requestAt(fetchMock, 0).url.pathname).toBe('/v1/hyperliquid/hip4/questions');
    expect(requestAt(fetchMock, 0).url.searchParams.get('limit')).toBe('10');
    expect(requestAt(fetchMock, 1).url.pathname).toBe('/v1/hyperliquid/hip4/questions/0');
  });
});

const CLASSIFIED = {
  wallets: [
    {
      address: '0x010461c14e146ac35fe42271bdc1134ee31c703a',
      metrics: {
        total_orders: 5000,
        cancel_rate: 0.9,
        maker_ratio: 0.8,
        total_volume_usd: 1_250_000,
        uses_twap: false,
        top_builder: null,
      },
      period: '24h',
    },
  ],
  total: 4444,
  date: '2026-09-28',
};

describe('wallet classification', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is exposed on Hyperliquid core and HIP-3', () => {
    expect(client().hyperliquid.wallets).toBeInstanceOf(WalletsResource);
    expect(client().hyperliquid.hip3.wallets).toBeInstanceOf(WalletsResource);
  });

  it('classify() GETs /wallets/classify with the API parameter names', async () => {
    const fetchMock = stubFetch(ok(CLASSIFIED));

    const page = await client(true).hyperliquid.wallets.classify({
      min_orders: 1000,
      min_volume_usd: 50000,
      sort: 'total_volume_usd',
      order: 'desc',
      limit: 50,
      offset: 100,
      uses_twap: true,
      uses_priority_gas: false,
      min_cancel_rate: 0.1,
      max_cancel_rate: 0.95,
      date: '2026-09-28',
    });

    const { method, url } = requestAt(fetchMock);
    expect(method).toBe('GET');
    expect(url.pathname).toBe('/v1/hyperliquid/wallets/classify');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      min_orders: '1000',
      min_volume_usd: '50000',
      sort: 'total_volume_usd',
      order: 'desc',
      limit: '50',
      offset: '100',
      uses_twap: 'true',
      uses_priority_gas: 'false',
      min_cancel_rate: '0.1',
      max_cancel_rate: '0.95',
      date: '2026-09-28',
    });
    expect(page.total).toBe(4444);
    expect(page.date).toBe('2026-09-28');
    expect(page.wallets[0].metrics).toEqual({
      totalOrders: 5000,
      cancelRate: 0.9,
      makerRatio: 0.8,
      totalVolumeUsd: 1_250_000,
      usesTwap: false,
      topBuilder: null,
    });
  });

  it('HIP-3 classify() GETs /v1/hyperliquid/hip3/wallets/classify with no params by default', async () => {
    const fetchMock = stubFetch(ok(CLASSIFIED));

    await client().hyperliquid.hip3.wallets.classify();

    expect(requestAt(fetchMock).url.pathname).toBe('/v1/hyperliquid/hip3/wallets/classify');
    expect(requestAt(fetchMock).url.search).toBe('');
  });
});

const SYMBOLS = {
  symbols: [
    {
      symbol: 'BTC',
      exchange: 'hyperliquid',
      coverage_from: '2023-04-15T00:00:00Z',
      data_types: ['l2_orderbook', 'l4_orderbook', 'trades'],
      coverage_by_type: { orderbook: '2023-04-15T00:00:00Z', l4_orderbook: '2026-03-10T00:00:00Z' },
      size_per_day: { orderbook: 120.5, l4_orders: 4000.25 },
      is_active: true,
    },
    {
      symbol: '#0',
      exchange: 'hip4',
      coverage_from: '2026-05-02T00:00:00Z',
      coverage_to: '2026-05-03T06:00:05Z',
      data_types: ['l2_orderbook', 'trades'],
      coverage_by_type: { trades: '2026-05-02T00:00:00Z' },
      slug: 'btc-above-78213-yes-may-03-0600',
      outcome_pair: ['#0', '#1'],
      display_title: 'BTC above 78,213 on May 3 at 06:00 UTC? Yes',
      is_settled: true,
    },
  ],
};

describe('symbols', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is exposed on client.symbols', () => {
    expect(client().symbols).toBeInstanceOf(SymbolsResource);
  });

  it('list() GETs /v1/symbols and keeps data-type keys as the API spells them', async () => {
    const fetchMock = stubFetch(reply(SYMBOLS));

    const symbols = await client(true).symbols.list();

    const { method, url } = requestAt(fetchMock);
    expect(method).toBe('GET');
    expect(url.pathname).toBe('/v1/symbols');
    expect(symbols).toHaveLength(2);
    expect(symbols[0]).toEqual({
      symbol: 'BTC',
      exchange: 'hyperliquid',
      coverageFrom: '2023-04-15T00:00:00Z',
      dataTypes: ['l2_orderbook', 'l4_orderbook', 'trades'],
      coverageByType: { orderbook: '2023-04-15T00:00:00Z', l4_orderbook: '2026-03-10T00:00:00Z' },
      sizePerDay: { orderbook: 120.5, l4_orders: 4000.25 },
      isActive: true,
    });
    expect(symbols[1]).toMatchObject({
      coverageTo: '2026-05-03T06:00:05Z',
      outcomePair: ['#0', '#1'],
      displayTitle: 'BTC above 78,213 on May 3 at 06:00 UTC? Yes',
      isSettled: true,
    });
  });
});

describe('HIP-4 outcomes settlement filter', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends isSettled as is_settled, the parameter the API reads', async () => {
    const fetchMock = stubFetch(ok([]), ok([]), ok([]));
    const hip4 = client().hyperliquid.hip4;

    await hip4.outcomes.list({ isSettled: false, limit: 5 });
    await hip4.listOutcomes({ isSettled: true, slug: 'btc-above-78213-may-03-0600' });
    await hip4.outcomes.list();

    expect(Object.fromEntries(requestAt(fetchMock, 0).url.searchParams)).toEqual({ is_settled: 'false', limit: '5' });
    expect(Object.fromEntries(requestAt(fetchMock, 1).url.searchParams)).toEqual({
      is_settled: 'true',
      slug: 'btc-above-78213-may-03-0600',
    });
    expect(requestAt(fetchMock, 2).url.search).toBe('');
  });
});

describe('order flow cursor on every client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('forwards cursor on core, HIP-3 and HIP-4 orders.flow()', async () => {
    const fetchMock = stubFetch();
    const c = client();
    const window = { start: 1783900800000, end: 1783987200000, interval: '1m', cursor: '1783960740000' };

    await c.hyperliquid.orders.flow('BTC', window);
    await c.hyperliquid.hip3.orders.flow('km:US500', window);
    await c.hyperliquid.hip4.orders.flow('0', window);

    for (let call = 0; call < 3; call++) {
      expect(requestAt(fetchMock, call).url.searchParams.get('cursor')).toBe('1783960740000');
    }
  });
});

// Frame shapes as sent on wss://api.0xarchive.io/ws; the values are illustrative.
const FULL_DEPTH_SNAPSHOT: WsL2FullDepthSnapshot = {
  type: 'l4_snapshot',
  channel: 'orderbook_full',
  coin: 'BTC',
  symbol: 'BTC',
  last_block_number: 1164899778,
  timestamp: 1790649759046,
  data: {
    bids: [{ px: 114200, sz: 1.5, n: 3 }],
    asks: [{ px: 114201, sz: 0.25, n: 1 }],
    bid_count: 13779,
    ask_count: 6919,
    total_bid_size: 5123.4,
    total_ask_size: 4012.9,
    mid_price: 114200.5,
    spread: 1,
    spread_bps: 0.0876,
    is_crossed: false,
  },
};

const FULL_DEPTH_BATCH: WsL2FullDepthBatch = {
  type: 'l4_batch',
  channel: 'orderbook_full',
  coin: 'BTC',
  symbol: 'BTC',
  data: [
    { side: 'B', px: 114200, sz: 1.75, n: 4, bn: 1164899779 },
    { side: 'A', px: 114230, sz: 0, n: 0, bn: 1164899779 },
  ],
};

describe('full-depth L2 WebSocket channels', () => {
  afterEach(() => vi.unstubAllGlobals());

  function openClient() {
    vi.stubGlobal('WebSocket', { OPEN: 1 });
    const ws = new OxArchiveWs({ apiKey: 'test-key' });
    const send = vi.fn();
    (ws as any).ws = { readyState: 1, send };
    return { ws, send };
  }

  it('lists orderbook_full and hip3_orderbook_full as channels', () => {
    expect([...FULL_DEPTH_L2_CHANNELS].sort()).toEqual(['hip3_orderbook_full', 'orderbook_full']);
    for (const channel of FULL_DEPTH_L2_CHANNELS) {
      expect(WsChannelSchema.safeParse(channel).success).toBe(true);
    }
  });

  it.each([
    ['orderbook_full', 'BTC'],
    ['hip3_orderbook_full', 'km:US500'],
  ] as Array<[WsChannel, string]>)('subscribes to %s live', (channel, symbol) => {
    const { ws, send } = openClient();

    ws.subscribe(channel, symbol);
    ws.unsubscribe(channel, symbol);

    expect(send.mock.calls.map(([payload]) => JSON.parse(payload))).toEqual([
      { op: 'subscribe', channel, symbol },
      { op: 'unsubscribe', channel, symbol },
    ]);
  });

  it.each(['orderbook_full', 'hip3_orderbook_full'] as WsChannel[])(
    'refuses %s replay before sending, because the API serves it live only',
    (channel) => {
      const { ws, send } = openClient();

      expect(() => (ws.replay as any)(channel, 'BTC', { start: 1, end: 2 })).toThrow(
        FULL_DEPTH_L2_LIVE_ONLY_REPLAY_ERROR
      );
      expect(() => (ws.multiReplay as any)(['orderbook', channel], 'BTC', { start: 1, end: 2 })).toThrow(
        FULL_DEPTH_L2_LIVE_ONLY_REPLAY_ERROR
      );
      expect(send).not.toHaveBeenCalled();
    }
  );

  it('validates the live snapshot and level-change frames', () => {
    expect(WsServerMessageSchema.safeParse(FULL_DEPTH_SNAPSHOT).success).toBe(true);
    expect(WsServerMessageSchema.safeParse(FULL_DEPTH_BATCH).success).toBe(true);
    const emptyHip3Book = {
      ...FULL_DEPTH_SNAPSHOT,
      channel: 'hip3_orderbook_full',
      data: { ...FULL_DEPTH_SNAPSHOT.data, bids: [], asks: [], mid_price: null, spread: null, spread_bps: null },
    };
    expect(WsServerMessageSchema.safeParse(emptyHip3Book).success).toBe(true);
  });

  it('delivers the frames to onMessage', () => {
    const { ws } = openClient();
    const onMessage = vi.fn();
    ws.on('onMessage', onMessage);

    (ws as any).handleMessage(FULL_DEPTH_SNAPSHOT);
    (ws as any).handleMessage(FULL_DEPTH_BATCH);

    expect(onMessage).toHaveBeenCalledTimes(2);
    expect(onMessage.mock.calls[0][0]).toEqual(FULL_DEPTH_SNAPSHOT);
    expect(onMessage.mock.calls[1][0]).toEqual(FULL_DEPTH_BATCH);
  });
});
