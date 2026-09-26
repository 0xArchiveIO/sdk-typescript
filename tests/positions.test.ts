import { afterEach, describe, expect, it, vi } from 'vitest';
import { OxArchive, OxArchiveError } from '../src';
import type { MarketPosition, Position, PositionChange } from '../src';

const BASE = 'https://api.example.test';
const WALLET = `0x${'ab'.repeat(20)}`;

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

function urlOf(fetchMock: ReturnType<typeof vi.fn>, call = 0): URL {
  return new URL(String(fetchMock.mock.calls[call]?.[0]));
}

function query(url: URL): Record<string, string> {
  return Object.fromEntries(url.searchParams.entries());
}

// Fixtures in the exact wire shape of the positions DTOs (snake_case).
const HL_POSITION = {
  symbol: 'BTC',
  coin: 'BTC',
  size: '-1.5',
  side: 'short',
  entry_price: '64000',
  mark_price: '64210.5',
  mark_time: '2026-09-25T12:00:00Z',
  position_value: '96315.75',
  unrealized_pnl: '-315.75',
  return_on_equity: '-0.032',
  leverage: { type: 'cross', value: '10' },
  max_leverage: 40,
  margin_used: '9631.575',
  liquidation_price: null,
  liquidation_price_status: 'not_published_cross',
  cum_funding: { all_time: '12.5', since_open: '3.1', since_change: '0.4' },
  opened_at: '2026-09-20T08:15:00.123Z',
  snapshot_as_of: '2026-09-25T11:58:40Z',
  quality: 'complete',
};

const HL_ACCOUNT = {
  account_value: '150000.12',
  cross_account_value: '150000.12',
  collateral: '140000',
  total_margin_used: '9631.575',
  cross_maintenance_margin_used: '1200',
  withdrawable: null,
  total_position_value: '96315.75',
  total_unrealized_pnl: '-315.75',
  long_value: '0',
  short_value: '96315.75',
  n_positions: 1,
  account_mode: 'standard',
  snapshot_as_of: '2026-09-25T11:58:40Z',
  quality: 'complete',
};

const HL_CHANGE = {
  timestamp: '2026-09-24T10:00:00.500Z',
  symbol: 'BTC',
  coin: 'BTC',
  side: 'A',
  price: '64000',
  size: '0.5',
  start_position: '-1',
  end_position: '-1.5',
  entry_price_after: '64000',
  event_type: 'increase',
  cause: 'trade',
  direction: 'Open Short',
  closed_pnl: '0',
  fee: '12.8',
  fee_token: 'USDC',
  crossed: true,
  trade_id: 123456789,
  order_id: 987654321,
  opened_at: '2026-09-20T08:15:00.123Z',
  seq: 3,
  block_number: 812345678,
  event_index: 4,
  continuity: 'ok',
  finalized: true,
};

const LIGHTER_POSITION = {
  account_index: '281474976623827',
  account_kind: 'user',
  symbol: 'BTC',
  coin: 'BTC',
  size: '0.25',
  side: 'long',
  entry_price: '84000.5',
  mark_price: '84363.5',
  mark_time: '2026-09-25T12:00:00Z',
  position_value: '21090.875',
  unrealized_pnl: '90.75',
  return_on_equity: null,
  leverage: { type: 'cross', value: null },
  max_leverage: null,
  margin_used: null,
  liquidation_price: null,
  liquidation_price_status: 'unavailable',
  cum_funding: { all_time: null, since_open: null, since_change: null },
  opened_at: '2026-09-01T00:00:00Z',
  snapshot_as_of: null,
  quality: 'complete',
  initial_margin_fraction: '0.05',
  allocated_margin: null,
  margin_mode: 'cross',
  mark_source: 'mark',
  finalized: true,
};

const LIGHTER_CHANGE = {
  timestamp: '2026-09-24T10:00:00Z',
  account_index: '713845',
  account_kind: 'user',
  symbol: 'BTC',
  coin: 'BTC',
  side: 'B',
  price: '84367.9',
  size: '0.00003',
  start_position: '0.0394',
  end_position: '0.03943',
  entry_price_after: '84100.2',
  event_type: 'increase',
  cause: 'trade',
  realized_pnl: '0',
  fee: '0.000506',
  fee_token: 'USDG',
  is_maker: false,
  trade_id: 31944180930,
  order_id: 844421425107071,
  opened_at: '2026-09-01T00:00:00Z',
  continuity: 'ok',
  position_size_before: '0.0394',
  position_size_after: '0.03943',
  fee_rate: '0.0002',
  fee_usdc: '0.000506',
  usdc_amount: '2.531037',
  finalized: false,
};

const MARKET_ROW = {
  user_address: WALLET,
  symbol: 'BTC',
  coin: 'BTC',
  size: '12.5',
  side: 'long',
  entry_price: '63000',
  mark_price: '64210.5',
  position_value: '802631.25',
  unrealized_pnl: '15131.25',
  leverage_type: 'cross',
  liquidation_price: null,
  quality: 'complete',
};

const SUMMARY = {
  snapshot_ts: '2026-09-25T12:00:00Z',
  symbol: 'BTC',
  coin: 'BTC',
  long_count: 1200,
  short_count: 900,
  long_size: '5000.1',
  short_size: '5000.1',
  long_value: '321000000',
  short_value: '321000000',
  long_avg_entry_price: '62000.5',
  short_avg_entry_price: '65000.25',
  long_positions_with_entry: 1199,
  short_positions_with_entry: 900,
  long_top10_value_share: '0.41',
  short_top10_value_share: '0.38',
  top10_value_share: '0.395',
  quality: 'complete',
};

const SNAPSHOT_META = {
  as_of: '2026-09-25T12:00:00.000Z',
  snapshot_ts: '2026-09-25T12:00:00.000Z',
  source: 'snapshot',
  quality: 'complete',
  stale: false,
};

describe('Hyperliquid account positions', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads the live wallet snapshot with its account and meta context', async () => {
    const fetchMock = stubFetch(ok({ positions: [HL_POSITION], account: HL_ACCOUNT }, SNAPSHOT_META));
    const client = new OxArchive({ apiKey: 'test-key', baseUrl: BASE, validate: true });

    const { data, meta, nextCursor } = await client.hyperliquid.positions.get(WALLET);

    const position: Position = data.positions[0]!;
    expect(position).toMatchObject({
      symbol: 'BTC',
      size: '-1.5',
      side: 'short',
      entryPrice: '64000',
      unrealizedPnl: '-315.75',
      leverage: { type: 'cross', value: '10' },
      maxLeverage: 40,
      liquidationPrice: null,
      liquidationPriceStatus: 'not_published_cross',
      cumFunding: { allTime: '12.5', sinceOpen: '3.1', sinceChange: '0.4' },
      snapshotAsOf: '2026-09-25T11:58:40Z',
    });
    expect(data.account).toMatchObject({ accountValue: '150000.12', nPositions: 1, accountMode: 'standard', withdrawable: null });
    expect(meta).toMatchObject({ asOf: '2026-09-25T12:00:00.000Z', snapshotTs: '2026-09-25T12:00:00.000Z', source: 'snapshot', quality: 'complete', stale: false });
    expect(nextCursor).toBeUndefined();
    const url = urlOf(fetchMock);
    expect(url.pathname).toBe(`/v1/hyperliquid/wallets/${WALLET}/positions`);
    expect(query(url)).toEqual({});
  });

  it('sends an as-of timestamp, a symbol filter and paging as Unix milliseconds', async () => {
    const fetchMock = stubFetch(
      ok(
        { positions: [], account: null, account_seen: 'never_seen' },
        {
          as_of: '2026-07-01T10:30:00.000Z',
          source: 'reconstructed',
          quality: 'complete',
          built_through: '2026-09-25T11:00:00.000Z',
          finalized_through: '2026-09-25T09:00:00.000Z',
          notice: 'No activity is recorded for this address since 2025-05-25 15:00 (UTC).',
          coverage_from: '2025-05-25T15:00:00.000Z',
        },
      ),
    );
    const client = new OxArchive({ apiKey: 'test-key', baseUrl: BASE, validate: true });

    const result = await client.hyperliquid.positions.get(WALLET, {
      timestamp: '2026-07-01T10:30:00Z',
      symbol: 'btc',
      limit: 50,
      cursor: 'opaque',
    });

    expect(result.data.accountSeen).toBe('never_seen');
    expect(result.meta).toMatchObject({
      source: 'reconstructed',
      builtThrough: '2026-09-25T11:00:00.000Z',
      finalizedThrough: '2026-09-25T09:00:00.000Z',
      coverageFrom: '2025-05-25T15:00:00.000Z',
    });
    expect(query(urlOf(fetchMock))).toEqual({
      timestamp: String(Date.parse('2026-07-01T10:30:00Z')),
      symbol: 'BTC',
      limit: '50',
      cursor: 'opaque',
    });
  });

  it('reads hourly history, the change log and the clamp fields', async () => {
    const fetchMock = stubFetch(
      ok([{ ...HL_POSITION, snapshot_ts: '2026-09-24T10:00:00Z' }], { source: 'snapshot', finalized_through: '2026-09-25T09:00:00.000Z' }),
      ok([HL_CHANGE], {
        source: 'changes',
        built_through: '2026-09-25T11:00:00.000Z',
        requested_end: '2026-09-26T00:00:00.000Z',
        clamped_to: '2026-09-25T11:00:00.000Z',
      }),
    );
    const client = new OxArchive({ apiKey: 'test-key', baseUrl: BASE, validate: true });
    const window = { start: new Date('2026-09-24T00:00:00Z'), end: 1_790_380_800_000, symbol: 'btc' };

    const history = await client.hyperliquid.positions.history(WALLET, window);
    const changes = await client.hyperliquid.positions.changes(WALLET, window);

    expect(history.data[0]?.snapshotTs).toBe('2026-09-24T10:00:00Z');
    const leg: PositionChange = changes.data[0]!;
    expect(leg).toMatchObject({
      side: 'A',
      startPosition: '-1',
      endPosition: '-1.5',
      entryPriceAfter: '64000',
      eventType: 'increase',
      cause: 'trade',
      closedPnl: '0',
      crossed: true,
      blockNumber: 812345678,
      continuity: 'ok',
      finalized: true,
    });
    expect(changes.meta).toMatchObject({ clampedTo: '2026-09-25T11:00:00.000Z', requestedEnd: '2026-09-26T00:00:00.000Z' });
    expect(urlOf(fetchMock, 0).pathname).toBe(`/v1/hyperliquid/wallets/${WALLET}/positions/history`);
    expect(urlOf(fetchMock, 1).pathname).toBe(`/v1/hyperliquid/wallets/${WALLET}/positions/changes`);
    expect(query(urlOf(fetchMock, 1))).toEqual({
      start: String(Date.parse('2026-09-24T00:00:00Z')),
      end: '1790380800000',
      symbol: 'BTC',
    });
  });

  it('reads the account summary and its hourly history', async () => {
    const fetchMock = stubFetch(
      ok([HL_ACCOUNT], SNAPSHOT_META),
      ok([{ ...HL_ACCOUNT, snapshot_ts: '2026-09-24T10:00:00Z' }], { next_cursor: 'next-acct' }),
    );
    const client = new OxArchive({ apiKey: 'test-key', baseUrl: BASE, validate: true });

    const now = await client.hyperliquid.positions.account(WALLET);
    const hist = await client.hyperliquid.positions.accountHistory(WALLET, { start: 1_790_208_000_000, end: 1_790_294_400_000, limit: 24 });

    expect(now.data[0]).toMatchObject({ collateral: '140000', totalMarginUsed: '9631.575' });
    expect(hist.data[0]?.snapshotTs).toBe('2026-09-24T10:00:00Z');
    expect(hist.nextCursor).toBe('next-acct');
    expect(urlOf(fetchMock, 0).pathname).toBe(`/v1/hyperliquid/wallets/${WALLET}/account`);
    expect(query(urlOf(fetchMock, 0))).toEqual({});
    expect(urlOf(fetchMock, 1).pathname).toBe(`/v1/hyperliquid/wallets/${WALLET}/account/history`);
    expect(query(urlOf(fetchMock, 1))).toEqual({ start: '1790208000000', end: '1790294400000', limit: '24' });
  });

  it('lists a market with totals, filters and camelCase parameters mapped to the wire', async () => {
    const fetchMock = stubFetch(
      ok([MARKET_ROW], { ...SNAPSHOT_META, next_cursor: 'm2', totals: SUMMARY }),
      ok([SUMMARY], SNAPSHOT_META),
      ok([{ ...MARKET_ROW, snapshot_ts: '2026-09-25T11:00:00Z' }], { snapshot_ts: '2026-09-25T11:00:00.000Z' }),
    );
    const client = new OxArchive({ apiKey: 'test-key', baseUrl: BASE, validate: true });

    const market = await client.hyperliquid.positions.market('btc', {
      hour: Date.UTC(2026, 8, 25, 11),
      side: 'long',
      minValue: 100_000,
      limit: 100,
    });
    const summary = await client.hyperliquid.positions.marketSummary('btc');
    const bulk = await client.hyperliquid.positions.all({ hour: '2026-09-25T11:00:00Z', limit: 2000 });

    const row: MarketPosition = market.data[0]!;
    expect(row).toMatchObject({ userAddress: WALLET, leverageType: 'cross', positionValue: '802631.25' });
    expect(market.meta.totals).toMatchObject({
      longCount: 1200,
      longTop10ValueShare: '0.41',
      top10ValueShare: '0.395',
      longPositionsWithEntry: 1199,
    });
    expect(market.nextCursor).toBe('m2');
    expect(summary.data[0]).toMatchObject({ longAvgEntryPrice: '62000.5', shortTop10ValueShare: '0.38' });
    expect(bulk.data[0]?.snapshotTs).toBe('2026-09-25T11:00:00Z');

    expect(urlOf(fetchMock, 0).pathname).toBe('/v1/hyperliquid/positions/BTC');
    expect(query(urlOf(fetchMock, 0))).toEqual({
      hour: String(Date.UTC(2026, 8, 25, 11)),
      side: 'long',
      min_value: '100000',
      limit: '100',
    });
    expect(urlOf(fetchMock, 1).pathname).toBe('/v1/hyperliquid/positions/BTC/summary');
    expect(query(urlOf(fetchMock, 1))).toEqual({});
    expect(urlOf(fetchMock, 2).pathname).toBe('/v1/hyperliquid/positions');
    expect(query(urlOf(fetchMock, 2))).toEqual({ hour: String(Date.UTC(2026, 8, 25, 11)), limit: '2000' });
  });

  it('refuses a bulk or market hour that is not an exact UTC hour before sending', async () => {
    const fetchMock = stubFetch();
    const client = new OxArchive({ apiKey: 'test-key', baseUrl: BASE });

    await expect(client.hyperliquid.positions.all({ hour: Date.UTC(2026, 8, 25, 11, 30) })).rejects.toThrow(RangeError);
    await expect(client.hyperliquid.positions.market('BTC', { hour: '2026-09-25T11:00:01Z' })).rejects.toThrow('exact UTC hour');
    await expect(client.hyperliquid.positions.history(WALLET, { start: 'not a date', end: 1 })).rejects.toThrow(TypeError);
    await expect((client.hyperliquid.positions.all as (p: unknown) => Promise<unknown>)({})).rejects.toThrow('hour is required');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('follows cursors through empty pages in the iterators', async () => {
    const fetchMock = stubFetch(
      ok([HL_CHANGE], { next_cursor: 'c1' }),
      ok([], { next_cursor: 'c2' }),
      ok([{ ...HL_CHANGE, trade_id: 2 }, { ...HL_CHANGE, trade_id: 3 }], {}),
    );
    const client = new OxArchive({ apiKey: 'test-key', baseUrl: BASE });

    const ids: number[] = [];
    for await (const leg of client.hyperliquid.positions.iterateChanges(WALLET, { start: 1, end: 2, limit: 2 })) {
      ids.push(leg.tradeId);
    }

    expect(ids).toEqual([123456789, 2, 3]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(urlOf(fetchMock, 0).searchParams.get('cursor')).toBeNull();
    expect(urlOf(fetchMock, 1).searchParams.get('cursor')).toBe('c1');
    expect(urlOf(fetchMock, 2).searchParams.get('cursor')).toBe('c2');
    expect(urlOf(fetchMock, 2).searchParams.get('limit')).toBe('2');
  });

  it('stops an iterator when the API repeats a cursor', async () => {
    const fetchMock = stubFetch(ok([MARKET_ROW], { next_cursor: 'same' }), ok([MARKET_ROW], { next_cursor: 'same' }));
    const client = new OxArchive({ apiKey: 'test-key', baseUrl: BASE });

    const rows: MarketPosition[] = [];
    for await (const row of client.hyperliquid.positions.iterateMarket('BTC')) {
      rows.push(row);
    }

    expect(rows).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('sends the same explicit window on every page of iterateMarketSummary', async () => {
    const fetchMock = stubFetch(
      ok([SUMMARY], { next_cursor: 's1' }),
      ok([], { next_cursor: 's2' }),
      ok([{ ...SUMMARY, snapshot_ts: '2026-09-25T13:00:00Z' }], {}),
    );
    const client = new OxArchive({ apiKey: 'test-key', baseUrl: BASE });

    const points: Array<string | null> = [];
    for await (const point of client.hyperliquid.positions.iterateMarketSummary('btc', {
      start: new Date(Date.UTC(2026, 8, 18)),
      end: '2026-09-26T00:00:00Z',
      limit: 168,
    })) {
      points.push(point.snapshotTs);
    }

    expect(points).toEqual(['2026-09-25T12:00:00Z', '2026-09-25T13:00:00Z']);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const window = { start: String(Date.UTC(2026, 8, 18)), end: String(Date.UTC(2026, 8, 26)), limit: '168' };
    expect(urlOf(fetchMock, 0).pathname).toBe('/v1/hyperliquid/positions/BTC/summary');
    expect(query(urlOf(fetchMock, 0))).toEqual(window);
    expect(query(urlOf(fetchMock, 1))).toEqual({ ...window, cursor: 's1' });
    expect(query(urlOf(fetchMock, 2))).toEqual({ ...window, cursor: 's2' });
  });

  it('refuses a summary series or cursor without an explicit end before sending', async () => {
    const fetchMock = stubFetch(ok([SUMMARY], {}));
    const client = new OxArchive({ apiKey: 'test-key', baseUrl: BASE });
    const start = Date.UTC(2026, 8, 18);

    // @ts-expect-error iterateMarketSummary needs both start and end
    const series = client.hyperliquid.positions.iterateMarketSummary('BTC', { start });
    await expect(series.next()).rejects.toThrow('end is required');
    // @ts-expect-error iterateMarketSummary needs both start and end
    const lighterSeries = client.rhLighter.positions.iterateMarketSummary('BTC', { end: start });
    await expect(lighterSeries.next()).rejects.toThrow('start is required');
    await expect(client.hyperliquid.positions.marketSummary('BTC', { start, cursor: 's1' })).rejects.toThrow(
      'end is required with a cursor',
    );
    await expect(client.lighter.positions.marketSummary('BTC', { cursor: 's1' })).rejects.toThrow(TypeError);
    expect(fetchMock).not.toHaveBeenCalled();

    await client.hyperliquid.positions.marketSummary('BTC', { start, end: start + 3_600_000 * 200, cursor: 's1' });
    expect(query(urlOf(fetchMock, 0))).toEqual({ start: String(start), end: String(start + 3_600_000 * 200), cursor: 's1' });
  });

  it('refuses dex and includeSystem on Hyperliquid core before sending, as the API does', async () => {
    const fetchMock = stubFetch();
    const client = new OxArchive({ apiKey: 'test-key', baseUrl: BASE });
    const core = client.hyperliquid.positions;

    // @ts-expect-error dex is HIP-3 only
    await expect(core.account(WALLET, { dex: 'xyz' })).rejects.toThrow('dex applies to HIP-3 positions only');
    // @ts-expect-error dex is HIP-3 only
    await expect(core.accountHistory(WALLET, { start: 1, end: 2, dex: 'xyz' })).rejects.toThrow(TypeError);
    // @ts-expect-error dex is HIP-3 only
    await expect(core.iterateAccountHistory(WALLET, { start: 1, end: 2, dex: 'xyz' }).next()).rejects.toThrow(TypeError);
    // @ts-expect-error dex is HIP-3 only
    await expect(core.get(WALLET, { dex: 'xyz' })).rejects.toThrow(TypeError);
    // @ts-expect-error dex is HIP-3 only
    await expect(core.history(WALLET, { start: 1, end: 2, dex: 'xyz' })).rejects.toThrow(TypeError);
    // @ts-expect-error dex is HIP-3 only
    await expect(core.changes(WALLET, { start: 1, end: 2, dex: 'xyz' })).rejects.toThrow(TypeError);
    // @ts-expect-error includeSystem is Lighter only
    await expect(core.market('BTC', { includeSystem: true })).rejects.toThrow('includeSystem applies to Lighter positions only');
    // @ts-expect-error includeSystem is Lighter only
    await expect(core.marketSummary('BTC', { includeSystem: false })).rejects.toThrow(TypeError);
    // @ts-expect-error includeSystem is Lighter only
    await expect(client.hyperliquid.hip3.positions.all({ hour: 0, includeSystem: true })).rejects.toThrow(TypeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports snapshot_advanced as an OxArchiveError with its error code', async () => {
    stubFetch(
      reply(
        {
          success: false,
          error: 'The snapshot this cursor was paging has been replaced or has expired. Restart pagination without a cursor.',
          error_code: 'snapshot_advanced',
        },
        409,
      ),
    );
    const client = new OxArchive({ apiKey: 'test-key', baseUrl: BASE });

    const error = await client.hyperliquid.positions.market('BTC', { cursor: 'stale' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(OxArchiveError);
    expect(error).toMatchObject({ code: 409, errorCode: 'snapshot_advanced' });
  });
});

describe('HIP-3 account positions', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps HIP-3 symbols case-sensitive and passes the dex filter', async () => {
    const fetchMock = stubFetch(
      ok({ positions: [{ ...HL_POSITION, symbol: 'xyz:TSLA', coin: 'xyz:TSLA', dex: 'xyz' }], account: { ...HL_ACCOUNT, dex: 'xyz' } }, SNAPSHOT_META),
      ok([HL_ACCOUNT], SNAPSHOT_META),
      ok([MARKET_ROW], SNAPSHOT_META),
      ok([], {}),
    );
    const client = new OxArchive({ apiKey: 'test-key', baseUrl: BASE, validate: true });

    const wallet = await client.hyperliquid.hip3.positions.get(WALLET, { dex: 'xyz', symbol: 'xyz:TSLA' });
    await client.hyperliquid.hip3.positions.account(WALLET, { dex: 'xyz' });
    await client.hyperliquid.hip3.positions.market('xyz:TSLA');
    await client.hyperliquid.hip3.positions.changes(WALLET, { start: 1, end: 2, dex: 'xyz' });

    expect(wallet.data.positions[0]).toMatchObject({ symbol: 'xyz:TSLA', dex: 'xyz' });
    expect(wallet.data.account?.dex).toBe('xyz');
    expect(urlOf(fetchMock, 0).pathname).toBe(`/v1/hyperliquid/hip3/wallets/${WALLET}/positions`);
    expect(query(urlOf(fetchMock, 0))).toEqual({ symbol: 'xyz:TSLA', dex: 'xyz' });
    expect(query(urlOf(fetchMock, 1))).toEqual({ dex: 'xyz' });
    expect(urlOf(fetchMock, 2).pathname).toBe('/v1/hyperliquid/hip3/positions/xyz:TSLA');
    expect(query(urlOf(fetchMock, 3))).toEqual({ start: '1', end: '2', dex: 'xyz' });
  });

  it('sends dex on HIP-3 account history and on every page of its iterator', async () => {
    const fetchMock = stubFetch(
      ok([{ ...HL_ACCOUNT, dex: 'xyz' }], {}),
      ok([{ ...HL_ACCOUNT, dex: 'xyz' }], { next_cursor: 'a1' }),
      ok([{ ...HL_ACCOUNT, dex: 'xyz' }], {}),
    );
    const client = new OxArchive({ apiKey: 'test-key', baseUrl: BASE });
    const hip3 = client.hyperliquid.hip3.positions;

    await hip3.accountHistory(WALLET, { start: 1, end: 2, dex: 'xyz', limit: 24 });
    let rows = 0;
    for await (const row of hip3.iterateAccountHistory(WALLET, { start: 1, end: 2, dex: 'xyz' })) {
      expect(row.dex).toBe('xyz');
      rows += 1;
    }

    expect(rows).toBe(2);
    expect(urlOf(fetchMock, 0).pathname).toBe(`/v1/hyperliquid/hip3/wallets/${WALLET}/account/history`);
    expect(query(urlOf(fetchMock, 0))).toEqual({ start: '1', end: '2', dex: 'xyz', limit: '24' });
    expect(query(urlOf(fetchMock, 1))).toEqual({ start: '1', end: '2', dex: 'xyz' });
    expect(query(urlOf(fetchMock, 2))).toEqual({ start: '1', end: '2', dex: 'xyz', cursor: 'a1' });
  });
});

describe('Lighter account positions (mainnet and Robinhood Chain)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ['lighter', '/v1/lighter'],
    ['rhLighter', '/v1/rh-lighter'],
  ] as const)('%s reads accounts by integer index', async (venue, base) => {
    const fetchMock = stubFetch(
      ok({ positions: [LIGHTER_POSITION], account: { account_index: '281474976623827', total_position_value: '21090.875', total_unrealized_pnl: '90.75', long_value: '21090.875', short_value: '0', n_positions: 1, quality: 'complete' } }, SNAPSHOT_META),
      ok([LIGHTER_CHANGE], { source: 'changes', built_through: '2026-09-25T11:58:00.000Z', finalized_through: '2026-09-24T21:00:00.000Z' }),
      ok([{ ...LIGHTER_POSITION, snapshot_ts: '2026-09-24T10:00:00Z' }], {}),
    );
    const client = new OxArchive({ apiKey: 'test-key', baseUrl: BASE, validate: true });
    const positions = client[venue].positions;

    const wallet = await positions.get(281474976623827, { symbol: 'btc' });
    const changes = await positions.changes('713845', { start: 1, end: 2 });
    await positions.history(713845n, { start: 1, end: 2 });

    expect(wallet.data.positions[0]).toMatchObject({
      accountIndex: '281474976623827',
      accountKind: 'user',
      initialMarginFraction: '0.05',
      allocatedMargin: null,
      marginMode: 'cross',
      markSource: 'mark',
      finalized: true,
      leverage: { type: 'cross', value: null },
    });
    expect(wallet.data.account).toMatchObject({ accountIndex: '281474976623827', nPositions: 1 });
    expect(changes.data[0]).toMatchObject({
      isMaker: false,
      realizedPnl: '0',
      feeToken: 'USDG',
      positionSizeAfter: '0.03943',
      feeRate: '0.0002',
      usdcAmount: '2.531037',
      finalized: false,
    });
    expect(changes.meta).toMatchObject({ builtThrough: '2026-09-25T11:58:00.000Z', finalizedThrough: '2026-09-24T21:00:00.000Z' });
    expect(urlOf(fetchMock, 0).pathname).toBe(`${base}/accounts/281474976623827/positions`);
    expect(query(urlOf(fetchMock, 0))).toEqual({ symbol: 'BTC' });
    expect(urlOf(fetchMock, 1).pathname).toBe(`${base}/accounts/713845/positions/changes`);
    expect(urlOf(fetchMock, 2).pathname).toBe(`${base}/accounts/713845/positions/history`);
  });

  it.each([
    ['lighter', '/v1/lighter'],
    ['rhLighter', '/v1/rh-lighter'],
  ] as const)('%s market routes send include_system', async (venue, base) => {
    const lighterRow = { ...MARKET_ROW, user_address: undefined, account_index: '0', account_kind: 'insurance' };
    const fetchMock = stubFetch(
      ok([lighterRow], { ...SNAPSHOT_META, totals: SUMMARY }),
      ok([SUMMARY], {}),
      ok([lighterRow], {}),
    );
    const client = new OxArchive({ apiKey: 'test-key', baseUrl: BASE, validate: true });
    const positions = client[venue].positions;

    const market = await positions.market('eth', { includeSystem: true, side: 'short' });
    await positions.marketSummary('eth', { start: 1_790_208_000_000, end: 1_790_294_400_000, includeSystem: false });
    await positions.all({ hour: 1_790_208_000_000, includeSystem: true, cursor: 'b1' });

    expect(market.data[0]).toMatchObject({ accountIndex: '0', accountKind: 'insurance' });
    expect(urlOf(fetchMock, 0).pathname).toBe(`${base}/positions/ETH`);
    expect(query(urlOf(fetchMock, 0))).toEqual({ side: 'short', include_system: 'true' });
    expect(urlOf(fetchMock, 1).pathname).toBe(`${base}/positions/ETH/summary`);
    expect(query(urlOf(fetchMock, 1))).toEqual({ start: '1790208000000', end: '1790294400000', include_system: 'false' });
    expect(urlOf(fetchMock, 2).pathname).toBe(`${base}/positions`);
    expect(query(urlOf(fetchMock, 2))).toEqual({ hour: '1790208000000', include_system: 'true', cursor: 'b1' });
  });

  it.each([
    ['lighter', '/v1/lighter'],
    ['rhLighter', '/v1/rh-lighter'],
  ] as const)('%s summary iterator sends the same window on every page and refuses dex', async (venue, base) => {
    const fetchMock = stubFetch(ok([SUMMARY], { next_cursor: 's1' }), ok([SUMMARY], {}));
    const client = new OxArchive({ apiKey: 'test-key', baseUrl: BASE });
    const positions = client[venue].positions;

    let points = 0;
    for await (const point of positions.iterateMarketSummary('eth', { start: 1_790_208_000_000, end: 1_790_294_400_000, includeSystem: true })) {
      expect(point.longCount).toBe(1200);
      points += 1;
    }
    // @ts-expect-error dex is HIP-3 only
    await expect(positions.get(713845, { dex: 'xyz' })).rejects.toThrow('dex applies to HIP-3 positions only');

    expect(points).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const window = { start: '1790208000000', end: '1790294400000', include_system: 'true' };
    expect(urlOf(fetchMock, 0).pathname).toBe(`${base}/positions/ETH/summary`);
    expect(query(urlOf(fetchMock, 0))).toEqual(window);
    expect(query(urlOf(fetchMock, 1))).toEqual({ ...window, cursor: 's1' });
  });

  it('refuses an account index that is not a non-negative integer before sending', async () => {
    const fetchMock = stubFetch();
    const client = new OxArchive({ apiKey: 'test-key', baseUrl: BASE });

    await expect(client.lighter.positions.get('0xabc')).rejects.toThrow('accountIndex must be a non-negative integer');
    await expect(client.rhLighter.positions.get(-1)).rejects.toThrow(TypeError);
    await expect(client.lighter.positions.get(1.5)).rejects.toThrow(TypeError);
    await expect(client.lighter.positions.get(Number.MAX_SAFE_INTEGER + 2)).rejects.toThrow(TypeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('exposes the Hyperliquid-only account methods on Hyperliquid clients only', () => {
    const client = new OxArchive({ apiKey: 'test-key' });

    expect(typeof client.hyperliquid.positions.account).toBe('function');
    expect(typeof client.hyperliquid.hip3.positions.accountHistory).toBe('function');
    expect('account' in client.lighter.positions).toBe(false);
    expect('accountHistory' in client.rhLighter.positions).toBe(false);
  });

  it('resolves mainnet accounts by L1 address and iterates them', async () => {
    const l1 = `0x${'Cd'.repeat(20)}`;
    const fetchMock = stubFetch(
      ok(
        { l1_address: l1.toLowerCase(), total_accounts: 3, accounts: [{ account_index: '713845', account_type: 0, first_seen: '2025-02-01T00:00:00Z' }] },
        { next_cursor: 'a1' },
      ),
      ok(
        {
          l1_address: l1.toLowerCase(),
          total_accounts: 3,
          accounts: [
            { account_index: '713846', account_type: 1, first_seen: null },
            { account_index: '713847', account_type: 1, first_seen: '2025-03-01T00:00:00Z' },
          ],
        },
        {},
      ),
    );
    const client = new OxArchive({ apiKey: 'test-key', baseUrl: BASE, validate: true });

    const indices: string[] = [];
    for await (const account of client.lighter.accounts.iterateByL1(l1, { limit: 1 })) {
      indices.push(account.accountIndex);
    }

    expect(indices).toEqual(['713845', '713846', '713847']);
    const first = urlOf(fetchMock, 0);
    expect(first.pathname).toBe('/v1/lighter/accounts');
    expect(query(first)).toEqual({ l1_address: l1, limit: '1' });
    expect(urlOf(fetchMock, 1).searchParams.get('cursor')).toBe('a1');

    fetchMock.mockResolvedValueOnce(ok({ l1_address: l1.toLowerCase(), total_accounts: 0, accounts: [] }, {}));
    const page = await client.lighter.accounts.byL1(l1);
    expect(page.data).toEqual({ l1Address: l1.toLowerCase(), totalAccounts: 0, accounts: [] });
  });
});

describe('Positions response validation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects a malformed positions payload when validation is on', async () => {
    stubFetch(ok({ positions: [{ ...HL_POSITION, side: 'sideways' }], account: null }, SNAPSHOT_META));
    const client = new OxArchive({ apiKey: 'test-key', baseUrl: BASE, validate: true });

    await expect(client.hyperliquid.positions.get(WALLET)).rejects.toMatchObject({ code: 422 });
  });

  it('keeps every positions meta field through validation', async () => {
    const meta = {
      next_cursor: 'n',
      as_of: 'a',
      snapshot_ts: 's',
      source: 'reconstructed',
      quality: 'partial',
      stale: true,
      notice: 'stale',
      built_through: 'b',
      finalized_through: 'f',
      requested_end: 'r',
      clamped_to: 'c',
      coverage_from: 'cf',
      totals: SUMMARY,
    };
    stubFetch(ok([MARKET_ROW], meta));
    const client = new OxArchive({ apiKey: 'test-key', baseUrl: BASE, validate: true });

    const page = await client.hyperliquid.positions.market('BTC');

    expect(page.meta).toMatchObject({
      nextCursor: 'n',
      asOf: 'a',
      snapshotTs: 's',
      source: 'reconstructed',
      quality: 'partial',
      stale: true,
      notice: 'stale',
      builtThrough: 'b',
      finalizedThrough: 'f',
      requestedEnd: 'r',
      clampedTo: 'c',
      coverageFrom: 'cf',
    });
    expect(page.meta.totals?.longCount).toBe(1200);
  });
});
