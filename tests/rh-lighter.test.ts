import { afterEach, describe, expect, it, vi } from 'vitest';
import { OxArchive, OxArchiveError, RhLighterClient } from '../src';

const BASE = 'https://api.example.test';

type MockBody = Record<string, unknown>;

function reply(body: MockBody, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

function ok(data: unknown, meta: MockBody = {}) {
  return reply({ success: true, data, meta: { count: Array.isArray(data) ? data.length : 1, request_id: 'req', ...meta } });
}

function stubFetch(...responses: Array<ReturnType<typeof reply>>) {
  const fetchMock = vi.fn();
  for (const response of responses) {
    fetchMock.mockResolvedValueOnce(response);
  }
  fetchMock.mockResolvedValue(ok([]));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function requestUrl(fetchMock: ReturnType<typeof vi.fn>, call = 0): URL {
  return new URL(String(fetchMock.mock.calls[call]?.[0]));
}

const range = { start: 1_782_504_626_605, end: 1_782_591_026_605 };

// A liquidation row as the API serializes it (snake_case). Rows from before
// live capture, backfilled from the venue's finalized export, carry source
// 'bucket' and an empty raw_json.
const LIQUIDATION_ROW = {
  symbol: 'BTC',
  timestamp: 1_782_600_000_000,
  transaction_time_us: 1_782_600_000_000_123,
  trade_id: 41_234_567,
  liquidation_type: 'partial',
  price: 84_210.5,
  size: 0.125,
  usd_amount: 10_526.3125,
  ask_account: '713845',
  bid_account: '281474976710654',
  ask_order_id: 562_953_419_896_990,
  bid_order_id: 844_421_425_107_071,
  is_maker_ask: false,
  taker_position_size_before: 0.5,
  maker_position_size_before: -2.25,
  taker_entry_quote_before: 42_000.25,
  maker_entry_quote_before: 189_000.5,
  taker_initial_margin_fraction_before: 500,
  maker_initial_margin_fraction_before: 200,
  taker_allocated_margin_usdc_before: 0,
  taker_allocated_margin_usdc_after: 0,
  maker_allocated_margin_usdc_before: 0,
  maker_allocated_margin_usdc_after: 0,
  taker_fee: 0,
  maker_fee: 0,
  taker_position_sign_changed: false,
  maker_position_sign_changed: false,
  block_height: 98_765_432,
  tx_hash: '0000001dc8774b28000001a0d5d94943',
  raw_json: '',
  source: 'bucket',
};

describe('Lighter on Robinhood Chain REST client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is a second Lighter deployment client with no L3 order book or account lookup', () => {
    const client = new OxArchive({ apiKey: 'test-key' });

    expect(client.rhLighter).toBeInstanceOf(RhLighterClient);
    expect('l3Orderbook' in client.rhLighter).toBe(false);
    expect('accounts' in client.rhLighter).toBe(false);
    expect(client.lighter.l3Orderbook).toBeDefined();
    expect(client.lighter.accounts).toBeDefined();
    for (const lighter of [client.lighter, client.rhLighter]) {
      expect(lighter.liquidations).toBeDefined();
      expect(lighter.positions).toBeDefined();
    }
  });

  it('maps all 16 routes to /v1/rh-lighter with uppercase symbols', async () => {
    const fetchMock = stubFetch();
    const client = new OxArchive({ apiKey: 'test-key', baseUrl: BASE });
    const rh = client.rhLighter;

    await rh.instruments.list();
    await rh.instruments.get('aapl-usdg');
    await rh.orderbook.get('btc');
    await rh.orderbook.history('btc', { ...range, granularity: '10s' });
    await rh.trades.list('aapl-usdg', range);
    await rh.trades.recent('btc', 50);
    await rh.candles.history('btc', { ...range, interval: '1h' });
    await rh.openInterest.history('btc', range);
    await rh.openInterest.current('btc');
    await rh.funding.history('btc', range);
    await rh.funding.current('btc');
    await rh.liquidations.history('btc', range);
    await rh.liquidations.volume('btc', { ...range, interval: '4h' });
    await rh.freshness('btc');
    await rh.summary('btc');
    await rh.priceHistory('btc', range);

    const paths = fetchMock.mock.calls.map(([url]) => new URL(String(url)).pathname);
    expect(paths).toEqual([
      '/v1/rh-lighter/instruments',
      '/v1/rh-lighter/instruments/AAPL-USDG',
      '/v1/rh-lighter/orderbook/BTC',
      '/v1/rh-lighter/orderbook/BTC/history',
      '/v1/rh-lighter/trades/AAPL-USDG',
      '/v1/rh-lighter/trades/BTC/recent',
      '/v1/rh-lighter/candles/BTC',
      '/v1/rh-lighter/openinterest/BTC',
      '/v1/rh-lighter/openinterest/BTC/current',
      '/v1/rh-lighter/funding/BTC',
      '/v1/rh-lighter/funding/BTC/current',
      '/v1/rh-lighter/liquidations/BTC',
      '/v1/rh-lighter/liquidations/BTC/volume',
      '/v1/rh-lighter/freshness/BTC',
      '/v1/rh-lighter/summary/BTC',
      '/v1/rh-lighter/prices/BTC',
    ]);
    expect(new Set(paths).size).toBe(16);
    expect(requestUrl(fetchMock, 3).searchParams.get('granularity')).toBe('10s');
    expect(requestUrl(fetchMock, 5).searchParams.get('limit')).toBe('50');
    expect(requestUrl(fetchMock, 12).searchParams.get('interval')).toBe('4h');
  });

  it('leaves the mainnet Lighter client on /v1/lighter', async () => {
    const fetchMock = stubFetch();
    const client = new OxArchive({ apiKey: 'test-key', baseUrl: BASE });

    await client.lighter.orderbook.get('btc');
    await client.lighter.freshness('eth');
    await client.lighter.l3Orderbook.get('btc');

    const paths = fetchMock.mock.calls.map(([url]) => new URL(String(url)).pathname);
    expect(paths).toEqual(['/v1/lighter/orderbook/BTC', '/v1/lighter/freshness/ETH', '/v1/lighter/l3orderbook/BTC']);
  });

  it('returns the finalization boundary and clamp on trade history', async () => {
    const trade = {
      coin: 'BTC',
      side: 'B',
      price: '84367.9',
      size: '0.00003',
      timestamp: '2026-09-24T12:00:00Z',
      trade_id: 31944180930,
      account_index: '713845',
    };
    const fetchMock = stubFetch(
      ok([trade], {
        next_cursor: '1790294182211_31944180930',
        finalized_through: '2026-09-25T00:00:00.000Z',
        requested_end: '2026-09-26T00:00:00.000Z',
        clamped_to: '2026-09-25T00:00:00.000Z',
      }),
    );
    const client = new OxArchive({ apiKey: 'test-key', baseUrl: BASE, validate: true });

    const result = await client.rhLighter.trades.list('btc', {
      start: '2026-09-24T00:00:00Z',
      end: '2026-09-26T00:00:00Z',
    });

    expect(result.data[0]).toMatchObject({ coin: 'BTC', tradeId: 31944180930, accountIndex: '713845' });
    expect(result.nextCursor).toBe('1790294182211_31944180930');
    expect(result.meta).toMatchObject({
      finalizedThrough: '2026-09-25T00:00:00.000Z',
      requestedEnd: '2026-09-26T00:00:00.000Z',
      clampedTo: '2026-09-25T00:00:00.000Z',
    });
    expect(requestUrl(fetchMock).pathname).toBe('/v1/rh-lighter/trades/BTC');
  });

  it('surfaces the candles refusal as an OxArchiveError until candles are enabled', async () => {
    stubFetch(
      reply(
        {
          success: false,
          error:
            'Candles are not yet available for Lighter (Robinhood Chain). Trades, orderbook, open interest, funding and liquidations are.',
        },
        503,
      ),
    );
    const client = new OxArchive({ apiKey: 'test-key', baseUrl: BASE });

    const failure = client.rhLighter.candles.history('BTC', { ...range, interval: '1h' });
    await expect(failure).rejects.toBeInstanceOf(OxArchiveError);
    await expect(failure).rejects.toMatchObject({ code: 503 });
  });
});

describe('Lighter liquidations (both deployments)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ['lighter', '/v1/lighter'],
    ['rhLighter', '/v1/rh-lighter'],
  ] as const)('pages %s liquidation trades with the Lighter row shape', async (venue, base) => {
    const fetchMock = stubFetch(
      ok([LIQUIDATION_ROW], { next_cursor: '1782600000000_41234567' }),
      ok([], {}),
    );
    const client = new OxArchive({ apiKey: 'test-key', baseUrl: BASE, validate: true });

    const first = await client[venue].liquidations.history('btc', { ...range, limit: 1 });
    const second = await client[venue].liquidations.history('btc', { ...range, cursor: first.nextCursor, limit: 1 });

    expect(first.data).toHaveLength(1);
    expect(first.data[0]).toStrictEqual({
      symbol: 'BTC',
      timestamp: 1_782_600_000_000,
      transactionTimeUs: 1_782_600_000_000_123,
      tradeId: 41_234_567,
      liquidationType: 'partial',
      price: 84_210.5,
      size: 0.125,
      usdAmount: 10_526.3125,
      askAccount: '713845',
      bidAccount: '281474976710654',
      askOrderId: 562_953_419_896_990,
      bidOrderId: 844_421_425_107_071,
      isMakerAsk: false,
      takerPositionSizeBefore: 0.5,
      makerPositionSizeBefore: -2.25,
      takerEntryQuoteBefore: 42_000.25,
      makerEntryQuoteBefore: 189_000.5,
      takerInitialMarginFractionBefore: 500,
      makerInitialMarginFractionBefore: 200,
      takerAllocatedMarginUsdcBefore: 0,
      takerAllocatedMarginUsdcAfter: 0,
      makerAllocatedMarginUsdcBefore: 0,
      makerAllocatedMarginUsdcAfter: 0,
      takerFee: 0,
      makerFee: 0,
      takerPositionSignChanged: false,
      makerPositionSignChanged: false,
      blockHeight: 98_765_432,
      txHash: '0000001dc8774b28000001a0d5d94943',
      rawJson: '',
      source: 'bucket',
    });
    expect(first.nextCursor).toBe('1782600000000_41234567');
    expect(second.data).toEqual([]);
    expect(requestUrl(fetchMock, 0).pathname).toBe(`${base}/liquidations/BTC`);
    expect(requestUrl(fetchMock, 1).searchParams.get('cursor')).toBe('1782600000000_41234567');
  });

  it('returns Lighter volume buckets (total and count)', async () => {
    const fetchMock = stubFetch(
      ok([{ symbol: 'ETH', timestamp: 1_782_604_800_000, total_usd: 125_000.5, count: 7 }], {
        next_cursor: '1782604800000',
      }),
    );
    const client = new OxArchive({ apiKey: 'test-key', baseUrl: BASE, validate: true });

    const volume = await client.lighter.liquidations.volume('eth', { ...range, interval: '1h' });

    expect(volume.data).toStrictEqual([{ symbol: 'ETH', timestamp: 1_782_604_800_000, totalUsd: 125_000.5, count: 7 }]);
    expect(volume.nextCursor).toBe('1782604800000');
    const url = requestUrl(fetchMock);
    expect(url.pathname).toBe('/v1/lighter/liquidations/ETH/volume');
    expect(url.searchParams.get('interval')).toBe('1h');
  });
});
