import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  API_VERSION,
  API_VERSION_HEADER,
  ERROR_CODES,
  OxArchive,
  OxArchiveError,
  OxArchiveWs,
  VENUES,
  WEBSOCKET_ONLY_ERROR_CODES,
  WS_BULK_REPLAY_CHANNELS,
  WS_CHANNEL_CAPABILITIES,
  WS_LIVE_CHANNELS,
  WS_REPLAY_CHANNELS,
  isErrorCode,
} from '../src';
import type { Capability, WsChannel, WsError, WsServerMessage } from '../src';
import { cursorPage, unwrapEnvelope } from '../src/http';
import {
  bulkReplayEndError,
  bulkReplayMultiError,
  liveOnlyError,
  replayOnlyError,
  restOnlyError,
} from '../src/websocket';
import { CapabilitiesResponseSchema, WsServerMessageSchema } from '../src/schemas';

const BASE = 'https://api.example.test';

type Body = Record<string, unknown>;

function reply(body: unknown, status = 200) {
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

function headersAt(fetchMock: ReturnType<typeof vi.fn>, call = 0): Record<string, string> {
  return (fetchMock.mock.calls[call]?.[1] as { headers: Record<string, string> }).headers;
}

function client(validate = false) {
  return new OxArchive({ apiKey: 'test-key', baseUrl: BASE, validate });
}

const readRepoFile = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/** Minimal stand-in for the global WebSocket. */
class FakeSocket {
  static readonly OPEN = 1;
  static instances: FakeSocket[] = [];
  readyState = 0;
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;

  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }

  close(): void {
    this.readyState = 3;
  }

  open(): void {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }

  receive(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

async function connected(options: { wsUrl?: string } = {}): Promise<{ ws: OxArchiveWs; socket: FakeSocket }> {
  FakeSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeSocket);
  const ws = new OxArchiveWs({ apiKey: 'k y', autoReconnect: false, ...options });
  const opening = ws.connect();
  const socket = FakeSocket.instances[FakeSocket.instances.length - 1]!;
  socket.open();
  await opening;
  return { ws, socket };
}

function openClient() {
  vi.stubGlobal('WebSocket', { OPEN: 1 });
  const ws = new OxArchiveWs({ apiKey: 'test-key' });
  const send = vi.fn();
  (ws as any).ws = { readyState: 1, send };
  return { ws, send, sent: () => send.mock.calls.map(([payload]) => JSON.parse(payload)) };
}

// =============================================================================
// 1. Version selector
// =============================================================================

describe('API version 2026-10-01', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is the contract date', () => {
    expect(API_VERSION).toBe('2026-10-01');
    expect(API_VERSION_HEADER).toBe('0xArchive-Version');
  });

  it('is sent on every REST verb', async () => {
    const fetchMock = stubFetch(ok([]), ok({}), ok({}), ok({}));
    const c = client();

    await c.hyperliquid.trades.history('BTC', { start: 1, end: 2 });
    await c.webhooks.createEndpoint({ url: 'https://example.test/hook' } as any);
    await c.webhooks.updateSubscription('sub', { enabled: false } as any);
    await c.webhooks.deleteEndpoint('ep');

    for (let call = 0; call < 4; call++) {
      expect(headersAt(fetchMock, call)[API_VERSION_HEADER]).toBe('2026-10-01');
      expect(headersAt(fetchMock, call)['X-API-Key']).toBe('test-key');
    }
    expect(fetchMock.mock.calls.map(([, init]) => (init as { method: string }).method)).toEqual([
      'GET',
      'POST',
      'PATCH',
      'DELETE',
    ]);
  });

  it('is sent on the raw web3 subscribe requests', async () => {
    const fetchMock = stubFetch(reply({ payment: { amount: '1', asset: 'USDC' } }, 402));
    await client().web3.subscribeQuote('build');
    expect(headersAt(fetchMock)[API_VERSION_HEADER]).toBe('2026-10-01');
  });

  it('is on the WebSocket connection query, after the key', async () => {
    const { ws, socket } = await connected();
    expect(socket.url).toBe('wss://api.0xarchive.io/ws?apiKey=k%20y&version=2026-10-01');
    ws.disconnect();

    const custom = await connected({ wsUrl: 'wss://example.test/ws?region=eu' });
    expect(custom.socket.url).toBe('wss://example.test/ws?region=eu&apiKey=k%20y&version=2026-10-01');
    custom.ws.disconnect();
  });
});

// =============================================================================
// 1. Version-selected shapes: envelopes on data quality and symbols
// =============================================================================

describe('outlier envelopes', () => {
  afterEach(() => vi.unstubAllGlobals());

  const STATUS = {
    status: 'operational',
    updated_at: '2026-09-29T14:55:18.686Z',
    exchanges: { hyperliquid: { status: 'operational', last_data_at: '2026-09-29T14:55:18Z', latency_ms: 686 } },
    data_types: {},
    active_incidents: 0,
  };

  it.each([
    ['status', (c: OxArchive) => c.dataQuality.status(), '/v1/data-quality/status'],
    ['coverage', (c: OxArchive) => c.dataQuality.coverage(), '/v1/data-quality/coverage'],
    ['exchangeCoverage', (c: OxArchive) => c.dataQuality.exchangeCoverage('hip3'), '/v1/data-quality/coverage/hip3'],
    [
      'symbolCoverage',
      (c: OxArchive) => c.dataQuality.symbolCoverage('hip4', '#0'),
      '/v1/data-quality/coverage/hip4/%230',
    ],
    ['listIncidents', (c: OxArchive) => c.dataQuality.listIncidents(), '/v1/data-quality/incidents'],
    ['getIncident', (c: OxArchive) => c.dataQuality.getIncident('inc-1'), '/v1/data-quality/incidents/inc-1'],
    ['latency', (c: OxArchive) => c.dataQuality.latency(), '/v1/data-quality/latency'],
    ['sla', (c: OxArchive) => c.dataQuality.sla(), '/v1/data-quality/sla'],
  ] as const)('dataQuality.%s() returns the envelope data', async (_name, call, path) => {
    const fetchMock = stubFetch(reply({ success: true, data: STATUS, meta: { request_id: 'r1' } }));

    const result = await call(client());

    expect(urlAt(fetchMock).pathname).toBe(path);
    expect(result).toEqual({
      status: 'operational',
      updatedAt: '2026-09-29T14:55:18.686Z',
      exchanges: { hyperliquid: { status: 'operational', lastDataAt: '2026-09-29T14:55:18Z', latencyMs: 686 } },
      dataTypes: {},
      activeIncidents: 0,
    });
  });

  it('reads a body without the envelope as it is', async () => {
    stubFetch(reply(STATUS));
    const result = await client().dataQuality.status();
    expect(result.status).toBe('operational');
    expect(result.activeIncidents).toBe(0);
  });

  it('unwrapEnvelope leaves bodies that are not the envelope alone', () => {
    expect(unwrapEnvelope({ success: true, data: [1], meta: {} })).toEqual([1]);
    expect(unwrapEnvelope({ success: true, symbols: [1], meta: {} })).toEqual({ success: true, symbols: [1], meta: {} });
    expect(unwrapEnvelope({ exchange: 'hip3', dataTypes: {} })).toEqual({ exchange: 'hip3', dataTypes: {} });
    expect(unwrapEnvelope([1, 2])).toEqual([1, 2]);
  });

  const SYMBOL = {
    symbol: 'km:US500',
    exchange: 'hip3',
    coverage_from: '2026-02-16T00:00:00Z',
    coverage_to: '2026-09-29T00:00:00Z',
    data_types: ['trades', 'l4_orderbook'],
    coverage_by_type: { l4_orderbook: '2026-03-10T00:00:00Z' },
    size_per_day: { l4_orderbook: 1.5 },
  };

  it('symbols.list() reads the list from the envelope data, with validation', async () => {
    stubFetch(reply({ success: true, data: [SYMBOL], meta: { count: 1, request_id: 'r' } }));
    const list = await client(true).symbols.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      symbol: 'km:US500',
      coverageFrom: '2026-02-16T00:00:00Z',
      coverageByType: { l4_orderbook: '2026-03-10T00:00:00Z' },
      sizePerDay: { l4_orderbook: 1.5 },
    });
  });

  it('symbols.list() still reads the older `symbols` body', async () => {
    stubFetch(reply({ success: true, symbols: [SYMBOL], meta: { request_id: 'r' } }));
    const list = await client(true).symbols.list();
    expect(list.map((s) => s.symbol)).toEqual(['km:US500']);
  });
});

// =============================================================================
// 1. Version-selected shapes: RFC 3339 times with *_ms integers
// =============================================================================

describe('RFC 3339 record times with *Ms integers', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('liquidation levels carry snapshotTs and snapshotTsMs, under validation', async () => {
    stubFetch(
      ok({
        mid_price: 83787,
        snapshot_ts: '2026-09-29T14:51:47.000Z',
        snapshot_ts_ms: 1790693507000,
        block_number: 1165450000,
        total_long: 1,
        total_short: 2,
        flagged_notional: 0,
        levels: [],
      }),
      ok([
        {
          snapshot_ts: '2026-09-28T14:56:49.000Z',
          snapshot_ts_ms: 1790607409000,
          block_number: 1,
          mid_price: 1,
          total_long: 1,
          total_short: 1,
          flagged_notional: 0,
        },
      ], { next_cursor: '1790607409000', has_more: true }),
      ok([
        { snapshot_ts: '2026-09-28T15:00:01.000Z', snapshot_ts_ms: 1790607601000, mid_price: 1, total_bid_size: 1, total_ask_size: 1 },
      ], { has_more: false }),
    );
    const c = client(true);

    const levels = await c.hyperliquid.liquidations.levels('BTC', { at: '2026-09-29T14:52:00Z' });
    const history = await c.hyperliquid.liquidations.levelsHistory('BTC', { summary: true, limit: 1 });
    const triggers = await c.hyperliquid.orders.triggerLevelsHistory('BTC', { summary: true, limit: 1 });

    expect(levels).toMatchObject({ snapshotTs: '2026-09-29T14:51:47.000Z', snapshotTsMs: 1790693507000 });
    expect(history.data[0]).toMatchObject({ snapshotTs: '2026-09-28T14:56:49.000Z', snapshotTsMs: 1790607409000 });
    expect(history.hasMore).toBe(true);
    expect(triggers.data[0]).toMatchObject({ snapshotTs: '2026-09-28T15:00:01.000Z', snapshotTsMs: 1790607601000 });
    expect(triggers.hasMore).toBe(false);
  });

  it('sends `at` as Unix milliseconds when given an ISO string', async () => {
    const fetchMock = stubFetch(ok({}));
    await client().hyperliquid.liquidations.levels('BTC', { at: '2026-09-29T14:52:00Z' });
    expect(urlAt(fetchMock).searchParams.get('at')).toBe(String(Date.parse('2026-09-29T14:52:00Z')));
  });

  it('L4 snapshot resting orders carry timestamp and timestampMs (null when unknown)', async () => {
    stubFetch(
      ok({
        coin: 'BTC',
        timestamp: '2026-09-29T14:56:29.346Z',
        checkpoint_timestamp: '2026-09-29T14:56:29.346Z',
        diffs_applied: 0,
        last_block_number: 1165520828,
        bids: [
          { oid: 1, user_address: '0xabc', side: 'B', price: 1, size: 2, timestamp: '2026-09-29T14:56:12.733Z', timestamp_ms: 1790693772733 },
          { oid: 2, user_address: '0xdef', side: 'B', price: 1, size: 1, timestamp: null, timestamp_ms: null },
        ],
        asks: [],
        bid_count: 2,
        ask_count: 0,
        total_bid_size: 3,
        total_ask_size: 0,
      }),
    );

    const book = await client().hyperliquid.l4Orderbook.get('BTC');

    expect(book.bids[0]).toEqual({
      oid: 1,
      userAddress: '0xabc',
      side: 'B',
      price: 1,
      size: 2,
      timestamp: '2026-09-29T14:56:12.733Z',
      timestampMs: 1790693772733,
    });
    expect(book.bids[1]).toMatchObject({ timestamp: null, timestampMs: null });
    expect(book.checkpointTimestamp).toBe('2026-09-29T14:56:29.346Z');
  });
});

// =============================================================================
// 1. Lighter and Robinhood Chain replay uses the live shapes
// =============================================================================

describe('Lighter replay rows in the live shapes', () => {
  afterEach(() => vi.unstubAllGlobals());

  // Frames recorded from wss://api.0xarchive.io/ws with version=2026-10-01.
  const TRADE_FRAME = {
    type: 'historical_data',
    channel: 'lighter_trades',
    coin: 'BTC',
    symbol: 'BTC',
    timestamp: 1790521041257,
    data: [
      {
        closed_pnl: '-0.002079',
        coin: 'BTC',
        crossed: false,
        dir: null,
        fee: '0.000028',
        fee_token: null,
        hash: '0000001df51adca6000001a0e35ee169',
        oid: 562953432205959,
        px: '84600',
        side: 'A',
        start_position: '45.4181',
        sz: '0.00001',
        tid: 32228097373,
        time: 1790521041257,
        users: ['702384'],
      },
    ],
  };
  const FUNDING_FRAME = {
    type: 'historical_data',
    channel: 'rh_lighter_funding',
    coin: 'BTC',
    symbol: 'BTC',
    timestamp: 1790521054869,
    data: {
      coin: 'BTC',
      ctx: {
        dayBaseVlm: null,
        dayNtlVlm: null,
        funding: '0.000007',
        impactPxs: null,
        markPx: null,
        midPx: null,
        openInterest: null,
        oraclePx: null,
        premium: null,
        prevDayPx: null,
      },
    },
  };
  const TICK_FRAME = {
    type: 'historical_tick_data',
    channel: 'lighter_orderbook',
    coin: 'BTC',
    symbol: 'BTC',
    checkpoint: {
      coin: 'BTC',
      time: 1790522081268,
      levels: [
        [
          { n: 1, px: '84464.1', sz: '0.024' },
          { n: 1, px: '84464', sz: '0.2507' },
        ],
        [{ n: 1, px: '84467.7', sz: '0.00175' }],
      ],
    },
    deltas: [{ timestamp: 1790522081317, side: 'bid', price: 84463.9, size: 0, sequence: 329626746 }],
  };

  it('delivers trade and stats rows to onHistoricalData as sent', async () => {
    const { ws, socket } = await connected();
    const rows: Array<[string, number, unknown]> = [];
    ws.onHistoricalData((coin, timestamp, data) => rows.push([coin, timestamp, data]));

    socket.receive(TRADE_FRAME);
    socket.receive(FUNDING_FRAME);

    expect(rows).toEqual([
      ['BTC', 1790521041257, TRADE_FRAME.data],
      ['BTC', 1790521054869, FUNDING_FRAME.data],
    ]);
    expect(WsServerMessageSchema.safeParse(TRADE_FRAME).success).toBe(true);
    ws.disconnect();
  });

  it('converts a live-shaped tick checkpoint to an OrderBook', async () => {
    const { ws, socket } = await connected();
    const seen: unknown[] = [];
    const onMessage = vi.fn();
    ws.on('onMessage', onMessage);
    ws.onHistoricalTickData((coin, checkpoint, deltas) => seen.push({ coin, checkpoint, deltas }));

    socket.receive(TICK_FRAME);
    socket.receive({ ...TICK_FRAME, checkpoint: null });

    expect(seen[0]).toMatchObject({
      coin: 'BTC',
      checkpoint: {
        coin: 'BTC',
        timestamp: new Date(1790522081268).toISOString(),
        bids: [
          { px: '84464.1', sz: '0.024', n: 1 },
          { px: '84464', sz: '0.2507', n: 1 },
        ],
        asks: [{ px: '84467.7', sz: '0.00175', n: 1 }],
      },
      deltas: TICK_FRAME.deltas,
    });
    expect((seen[1] as { checkpoint: unknown }).checkpoint).toBeNull();
    expect(onMessage.mock.calls[0][0].checkpoint.bids).toHaveLength(2);
    ws.disconnect();
  });
});

// =============================================================================
// 2. Errors
// =============================================================================

describe('errors carry the stable error code', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('exports the public code set as a typed list', () => {
    expect(ERROR_CODES).toEqual([
      'invalid_parameter',
      'invalid_symbol',
      'invalid_interval',
      'invalid_cursor',
      'invalid_time_range',
      'range_before_coverage',
      'historical_range_exceeded',
      'historical_depth_exceeded',
      'unsupported_for_venue',
      'route_not_found',
      'not_found',
      'unauthorized',
      'forbidden',
      'insufficient_credits',
      'rate_limited',
      'conflict',
      'upstream_unavailable',
      'internal_error',
      'slow_consumer',
      'endpoint_unsupported',
      'positions_unavailable',
      'api_key_limit_reached',
      'oauth_not_permitted',
    ]);
    expect(WEBSOCKET_ONLY_ERROR_CODES).toEqual(['slow_consumer', 'endpoint_unsupported']);
    expect(isErrorCode('slow_consumer')).toBe(true);
    expect(isErrorCode('invalid_query_params')).toBe(false);
    expect(isErrorCode(404)).toBe(false);
  });

  it('exposes errorCode, status, requestId, param and validValues', async () => {
    stubFetch(
      reply(
        {
          code: 400,
          error: "Invalid interval '7m'. Use one of: 1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w.",
          error_code: 'invalid_interval',
          param: 'interval',
          request_id: '02dd99fc',
          success: false,
          valid_values: ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'],
        },
        400,
      ),
    );

    const error = await client()
      .hyperliquid.candles.history('BTC', { start: 1, end: 2, interval: '7m' as any })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(OxArchiveError);
    const e = error as OxArchiveError;
    expect(e.errorCode).toBe('invalid_interval');
    expect(e.status).toBe(400);
    expect(e.code).toBe(400);
    expect(e.requestId).toBe('02dd99fc');
    expect(e.param).toBe('interval');
    expect(e.validValues).toEqual(['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w']);
    expect(e.message).toContain("Invalid interval '7m'");
  });

  it('keeps the rest of the body, such as where a datatype is available', async () => {
    stubFetch(
      reply(
        {
          available_on: [{ route: '/v1/hyperliquid/orders/{symbol}/flow', venue: 'hyperliquid' }],
          code: 404,
          datatype: 'order_flow',
          error: 'Order flow is not offered on Hyperliquid spot.',
          error_code: 'unsupported_for_venue',
          request_id: 'r404',
          success: false,
          venue: 'spot',
        },
        404,
      ),
    );

    const e = (await client()
      .hyperliquid.orders.flow('BTC', { start: 1, end: 2 })
      .catch((err: unknown) => err)) as OxArchiveError;

    expect(e.errorCode).toBe('unsupported_for_venue');
    expect(e.status).toBe(404);
    expect(e.param).toBeUndefined();
    expect(e.body).toMatchObject({
      availableOn: [{ route: '/v1/hyperliquid/orders/{symbol}/flow', venue: 'hyperliquid' }],
      datatype: 'order_flow',
      venue: 'spot',
    });
  });

  it('keeps the HTTP status when the error body is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => {
          throw new SyntaxError('Unexpected token <');
        },
      }),
    );

    const e = (await client().hyperliquid.orderbook.get('BTC').catch((err: unknown) => err)) as OxArchiveError;

    expect(e).toBeInstanceOf(OxArchiveError);
    expect(e.status).toBe(502);
    expect(e.errorCode).toBeUndefined();
  });

  it('gives the Hyperliquid core recent-trades refusal the route_not_found code', async () => {
    const fetchMock = stubFetch();
    const e = (await client().hyperliquid.trades.recent('BTC').catch((err: unknown) => err)) as OxArchiveError;
    expect(e.errorCode).toBe('route_not_found');
    expect(e.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('copies error_code to errorCode on WebSocket errors and calls onServerError', async () => {
    const { ws, socket } = await connected();
    const errors: WsError[] = [];
    const messages: WsServerMessage[] = [];
    ws.onServerError((error) => errors.push(error));
    ws.on('onMessage', (message) => messages.push(message));

    for (const [code, message] of [
      ['slow_consumer', 'Dropped ~12 live lighter_trades messages for BTC: your connection fell behind.'],
      ['endpoint_unsupported', 'This endpoint does not serve orderbook; use wss://api.0xarchive.io/ws.'],
      ['unsupported_for_venue', 'Channel spot_orderbook does not support historical replay'],
    ] as const) {
      socket.receive({ type: 'error', message, error_code: code });
    }
    socket.receive({ type: 'error', message: 'no code' });

    expect(errors.map((e) => e.errorCode)).toEqual(['slow_consumer', 'endpoint_unsupported', 'unsupported_for_venue', undefined]);
    expect(errors[0]).toMatchObject({ type: 'error', error_code: 'slow_consumer', errorCode: 'slow_consumer' });
    expect((messages[1] as WsError).errorCode).toBe('endpoint_unsupported');
    expect(WsServerMessageSchema.safeParse({ type: 'error', message: 'm', error_code: 'rate_limited' }).success).toBe(true);
    ws.disconnect();
  });
});

// =============================================================================
// 3 and 4. Pagination and meta
// =============================================================================

describe('hasMore, nextCursor and meta', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('cursorPage reads hasMore from meta, and falls back to the cursor', () => {
    const meta = { count: 1, requestId: 'r' };
    expect(cursorPage({ success: true, data: [1], meta: { ...meta, nextCursor: 'c', hasMore: true } })).toMatchObject({
      nextCursor: 'c',
      hasMore: true,
    });
    expect(cursorPage({ success: true, data: [], meta: { ...meta, hasMore: false } })).toMatchObject({
      nextCursor: undefined,
      hasMore: false,
    });
    expect(cursorPage({ success: true, data: [1], meta: { ...meta, nextCursor: 'c' } }).hasMore).toBe(true);
    expect(cursorPage({ success: true, data: [1], meta }).hasMore).toBe(false);
  });

  it('paged methods return hasMore and meta with the symbol and venue', async () => {
    stubFetch(
      ok([{ coin: 'BTC', side: 'B', price: '1', size: '1', timestamp: '2026-09-29T00:00:00.000Z' }], {
        next_cursor: 'abc',
        has_more: true,
        symbol: 'BTC',
        venue: 'hyperliquid',
      }),
      ok([], { has_more: false, symbol: '#66900', venue: 'hip4' }),
    );
    const c = client(true);

    const first = await c.hyperliquid.trades.history('btc', { start: 1, end: 2 });
    const last = await c.hyperliquid.hip4.getTrades('#66900', { start: 1, end: 2, cursor: first.nextCursor });

    expect(first).toMatchObject({ nextCursor: 'abc', hasMore: true, meta: { symbol: 'BTC', venue: 'hyperliquid' } });
    expect(last).toMatchObject({ data: [], hasMore: false, meta: { symbol: '#66900', venue: 'hip4' } });
    expect(last.nextCursor).toBeUndefined();
  });

  it.each([
    ['orderbook.history', (c: OxArchive) => c.hyperliquid.orderbook.history('BTC', { start: 1, end: 2 })],
    ['funding.history', (c: OxArchive) => c.hyperliquid.funding.history('BTC', { start: 1, end: 2 })],
    ['openInterest.history', (c: OxArchive) => c.hyperliquid.openInterest.history('BTC', { start: 1, end: 2 })],
    ['candles.history', (c: OxArchive) => c.hyperliquid.candles.history('BTC', { start: 1, end: 2 })],
    ['liquidations.history', (c: OxArchive) => c.hyperliquid.liquidations.history('BTC', { start: 1, end: 2 })],
    ['liquidations.volume', (c: OxArchive) => c.hyperliquid.liquidations.volume('BTC', { start: 1, end: 2 })],
    ['liquidations.byUser', (c: OxArchive) => c.hyperliquid.liquidations.byUser('0xabc', { start: 1, end: 2 })],
    ['orders.history', (c: OxArchive) => c.hyperliquid.orders.history('BTC', { start: 1, end: 2 })],
    ['orders.tpsl', (c: OxArchive) => c.hyperliquid.orders.tpsl('BTC', { start: 1, end: 2 })],
    ['l4Orderbook.diffs', (c: OxArchive) => c.hyperliquid.l4Orderbook.diffs('BTC', { start: 1, end: 2 })],
    ['l4Orderbook.history', (c: OxArchive) => c.hyperliquid.l4Orderbook.history('BTC', { start: 1, end: 2 })],
    ['l2Orderbook.history', (c: OxArchive) => c.hyperliquid.l2Orderbook.history('BTC', { start: 1, end: 2 })],
    ['l2Orderbook.diffs', (c: OxArchive) => c.hyperliquid.l2Orderbook.diffs('BTC', { start: 1, end: 2 })],
    ['cvd.history', (c: OxArchive) => c.hyperliquid.cvd.history('BTC', { start: 1, end: 2 })],
    ['priceHistory', (c: OxArchive) => c.hyperliquid.priceHistory('BTC', { start: 1, end: 2 })],
    ['l3Orderbook.history', (c: OxArchive) => c.lighter.l3Orderbook.history('BTC', { start: 1, end: 2 })],
    ['lighter liquidations.volume', (c: OxArchive) => c.lighter.liquidations.volume('BTC', { start: 1, end: 2 })],
    ['spot.twap.history', (c: OxArchive) => c.spot.twap.history('HYPE-USDC', { start: 1, end: 2 })],
    ['spot.twap.byUser', (c: OxArchive) => c.spot.twap.byUser('0xabc', { start: 1, end: 2 })],
    ['hip4.outcomes.list', (c: OxArchive) => c.hyperliquid.hip4.outcomes.list()],
    ['hip4.questions.list', (c: OxArchive) => c.hyperliquid.hip4.questions.list()],
    ['hip3.breadth.history', (c: OxArchive) => c.hyperliquid.hip3.breadth.history({})],
  ] as const)('%s returns hasMore and meta', async (_name, call) => {
    stubFetch(ok([], { next_cursor: 'n1', has_more: true, symbol: 'BTC', venue: 'hyperliquid' }));
    const page = await call(client());
    expect(page).toMatchObject({ nextCursor: 'n1', hasMore: true, meta: { requestId: 'req', symbol: 'BTC', venue: 'hyperliquid' } });
  });

  it('positions iterators stop when hasMore is false, even with a cursor', async () => {
    const row = { symbol: 'BTC' };
    const fetchMock = stubFetch(
      ok([row], { next_cursor: 'c1', has_more: true }),
      ok([row], { next_cursor: 'c2', has_more: false }),
      ok([row], { next_cursor: 'c3', has_more: true }),
    );

    const rows = [];
    for await (const r of client().hyperliquid.positions.iterateHistory('0xabc', { start: 1, end: 2 })) rows.push(r);

    expect(rows).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(urlAt(fetchMock, 1).searchParams.get('cursor')).toBe('c1');
  });

  it('positions iterators keep walking empty pages while hasMore is true', async () => {
    const fetchMock = stubFetch(
      ok([], { next_cursor: 'c1', has_more: true }),
      ok([{ symbol: 'BTC' }], { has_more: false }),
    );
    const rows = [];
    for await (const r of client().hyperliquid.positions.iterateChanges('0xabc', { start: 1, end: 2 })) rows.push(r);
    expect(rows).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

// =============================================================================
// 5. Capabilities
// =============================================================================

// Rows as `GET /v1/capabilities` returned them on 2026-09-29.
const CAPABILITY_ROWS = [
  {
    venue: 'hip3',
    datatype: 'l4_diffs',
    rest_routes: ['/v1/hyperliquid/hip3/orderbook/{symbol}/l4/diffs'],
    ws_channels: ['hip3_l4_diffs'],
    live: true,
    replay: true,
    available_from: '2026-03-11T01:03:00.000Z',
    cadence: 'event',
    page_limit: 10000,
    intervals: [],
    notes: 'WebSocket replay is bulk (speed is ignored) and single-channel only; it starts at the nearest L4 checkpoint and opens with its snapshot.',
  },
  {
    venue: 'hyperliquid',
    datatype: 'summary',
    rest_routes: ['/v1/hyperliquid/summary/{symbol}'],
    ws_channels: [],
    live: false,
    replay: false,
    available_from: null,
    cadence: 'snapshot',
    page_limit: null,
    intervals: [],
    notes: null,
  },
];

describe('client.capabilities()', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('GETs /v1/capabilities and returns typed rows, under validation', async () => {
    const fetchMock = stubFetch(ok(CAPABILITY_ROWS));

    const rows: Capability[] = await client(true).capabilities();

    expect(urlAt(fetchMock).pathname).toBe('/v1/capabilities');
    expect(urlAt(fetchMock).search).toBe('');
    expect(rows[0]).toEqual({
      venue: 'hip3',
      datatype: 'l4_diffs',
      restRoutes: ['/v1/hyperliquid/hip3/orderbook/{symbol}/l4/diffs'],
      wsChannels: ['hip3_l4_diffs'],
      live: true,
      replay: true,
      availableFrom: '2026-03-11T01:03:00.000Z',
      cadence: 'event',
      pageLimit: 10000,
      intervals: [],
      notes: CAPABILITY_ROWS[0]!.notes,
    });
    expect(rows[1]).toMatchObject({ availableFrom: null, pageLimit: null, notes: null, wsChannels: [] });
  });

  it('refuses an unknown venue under validation', () => {
    const parsed = CapabilitiesResponseSchema.safeParse({
      success: true,
      data: [{ ...CAPABILITY_ROWS[1], venue: 'dydx' }],
      meta: { count: 1, requestId: 'r' },
    });
    expect(parsed.success).toBe(false);
    expect(VENUES).toEqual(['hyperliquid', 'hip3', 'hip4', 'spot', 'lighter', 'rh-lighter']);
  });
});

// =============================================================================
// 6. Parameters that work server-side
// =============================================================================

describe('trades side on every venue', () => {
  afterEach(() => vi.unstubAllGlobals());

  const venues = [
    ['hyperliquid', (c: OxArchive) => c.hyperliquid.trades, '/v1/hyperliquid/trades/BTC', 'BTC'],
    ['hip3', (c: OxArchive) => c.hyperliquid.hip3.trades, '/v1/hyperliquid/hip3/trades/xyz:SP500', 'xyz:SP500'],
    ['hip4', (c: OxArchive) => c.hyperliquid.hip4.trades, '/v1/hyperliquid/hip4/trades/%2366900', '#66900'],
    ['spot', (c: OxArchive) => c.spot.trades, '/v1/hyperliquid/spot/trades/HYPE-USDC', 'HYPE-USDC'],
    ['lighter', (c: OxArchive) => c.lighter.trades, '/v1/lighter/trades/BTC', 'BTC'],
    ['rhLighter', (c: OxArchive) => c.rhLighter.trades, '/v1/rh-lighter/trades/BTC', 'BTC'],
  ] as const;

  it.each(venues)('%s history() and list() send side', async (_venue, trades, path, symbol) => {
    const fetchMock = stubFetch(ok([]), ok([]));
    const c = client();

    await trades(c).history(symbol, { start: 1, end: 2, side: 'buy' });
    await trades(c).list(symbol, { start: 1, end: 2, side: 'sell', cursor: 'x' });

    expect(urlAt(fetchMock, 0).pathname).toBe(path);
    expect(urlAt(fetchMock, 0).searchParams.get('side')).toBe('buy');
    expect(urlAt(fetchMock, 1).searchParams.get('side')).toBe('sell');
    expect(urlAt(fetchMock, 1).searchParams.get('cursor')).toBe('x');
  });

  it.each(venues.filter(([venue]) => venue !== 'hyperliquid'))(
    '%s recent() sends limit and side',
    async (_venue, trades, path, symbol) => {
      const fetchMock = stubFetch(ok([]), ok([]));
      const c = client();

      await trades(c).recent(symbol, { limit: 50, side: 'sell' });
      await trades(c).recent(symbol, 20);

      expect(urlAt(fetchMock, 0).pathname).toBe(`${path}/recent`);
      expect(Object.fromEntries(urlAt(fetchMock, 0).searchParams)).toEqual({ limit: '50', side: 'sell' });
      expect(Object.fromEntries(urlAt(fetchMock, 1).searchParams)).toEqual({ limit: '20' });
    },
  );

  it('the HIP-4 convenience methods pass side through', async () => {
    const fetchMock = stubFetch(ok([]), ok([]));
    const hip4 = client().hyperliquid.hip4;

    await hip4.getTradesRecent('#66900', { limit: 5, side: 'buy' });
    await hip4.getTrades('#66900', { start: 1, end: 2, side: 'sell' });

    expect(urlAt(fetchMock, 0).pathname).toBe('/v1/hyperliquid/hip4/trades/%2366900/recent');
    expect(urlAt(fetchMock, 0).searchParams.get('side')).toBe('buy');
    expect(urlAt(fetchMock, 1).searchParams.get('side')).toBe('sell');
  });
});

describe('order history triggered and depth', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ['core', (c: OxArchive) => c.hyperliquid.orders, '/v1/hyperliquid/orders/BTC/history', 'BTC'],
    ['hip3', (c: OxArchive) => c.hyperliquid.hip3.orders, '/v1/hyperliquid/hip3/orders/xyz:SP500/history', 'xyz:SP500'],
    ['hip4', (c: OxArchive) => c.hyperliquid.hip4.orders, '/v1/hyperliquid/hip4/orders/%2366900/history', '#66900'],
  ] as const)('%s order history sends triggered', async (_venue, orders, path, symbol) => {
    const fetchMock = stubFetch(ok([]), ok([]));

    await orders(client()).history(symbol, { start: 1, end: 2, triggered: true });
    await orders(client()).history(symbol, { start: 1, end: 2, triggered: false });

    expect(urlAt(fetchMock, 0).pathname).toBe(path);
    expect(urlAt(fetchMock, 0).searchParams.get('triggered')).toBe('true');
    expect(urlAt(fetchMock, 1).searchParams.get('triggered')).toBe('false');
  });

  it('getOrderHistory on HIP-4 passes triggered', async () => {
    const fetchMock = stubFetch(ok([]));
    await client().hyperliquid.hip4.getOrderHistory('#66900', { start: 1, end: 2, triggered: true });
    expect(urlAt(fetchMock).searchParams.get('triggered')).toBe('true');
  });

  it.each([
    ['core full-depth L2 history', (c: OxArchive) => c.hyperliquid.l2Orderbook.history('BTC', { start: 1, end: 2, depth: 3 }), '/v1/hyperliquid/orderbook/BTC/l2/history'],
    ['HIP-3 full-depth L2 history', (c: OxArchive) => c.hyperliquid.hip3.l2Orderbook.history('xyz:SP500', { start: 1, end: 2, depth: 3 }), '/v1/hyperliquid/hip3/orderbook/xyz:SP500/l2/history'],
    ['HIP-3 order book history', (c: OxArchive) => c.hyperliquid.hip3.orderbook.history('xyz:SP500', { start: 1, end: 2, depth: 3 }), '/v1/hyperliquid/hip3/orderbook/xyz:SP500/history'],
    ['HIP-4 order book history', (c: OxArchive) => c.hyperliquid.hip4.getOrderbookHistory('#66900', { start: 1, end: 2, depth: 3 }), '/v1/hyperliquid/hip4/orderbook/%2366900/history'],
    ['Spot order book history', (c: OxArchive) => c.spot.orderbook.history('HYPE-USDC', { start: 1, end: 2, depth: 3 }), '/v1/hyperliquid/spot/orderbook/HYPE-USDC/history'],
  ] as const)('%s sends depth', async (_name, call, path) => {
    const fetchMock = stubFetch(ok([]));
    await call(client());
    expect(urlAt(fetchMock).pathname).toBe(path);
    expect(urlAt(fetchMock).searchParams.get('depth')).toBe('3');
  });
});

// =============================================================================
// 7. WebSocket replay availability mirrors /v1/capabilities
// =============================================================================

// Every WebSocket row of `GET /v1/capabilities` on 2026-10-04:
// [venue, datatype, ws_channels, live, replay]. The Spot TWAP row lists no
// channel: `spot_twap` is accepted on subscribe but neither streams nor
// replays, so its data is REST only.
const WS_CAPABILITY_ROWS: Array<[string, string, WsChannel[], boolean, boolean]> = [
  ['hyperliquid', 'l2_orderbook', ['orderbook'], true, true],
  ['hyperliquid', 'l2_full_depth', ['orderbook_full'], true, true],
  ['hyperliquid', 'l4_diffs', ['l4_diffs'], true, true],
  ['hyperliquid', 'l4_orders', ['l4_orders'], true, true],
  ['hyperliquid', 'trades', ['trades'], true, true],
  ['hyperliquid', 'candles', ['candles'], false, true],
  ['hyperliquid', 'funding', ['funding'], true, true],
  ['hyperliquid', 'oi', ['open_interest'], true, true],
  ['hyperliquid', 'liquidations', ['liquidations'], true, true],
  ['hyperliquid', 'ticker', ['ticker', 'all_tickers'], true, false],
  ['hip3', 'l2_orderbook', ['hip3_orderbook'], true, true],
  ['hip3', 'l2_full_depth', ['hip3_orderbook_full'], true, true],
  ['hip3', 'l4_diffs', ['hip3_l4_diffs'], true, true],
  ['hip3', 'l4_orders', ['hip3_l4_orders'], true, true],
  ['hip3', 'trades', ['hip3_trades'], true, true],
  ['hip3', 'candles', ['hip3_candles'], false, true],
  ['hip3', 'funding', ['hip3_funding'], true, true],
  ['hip3', 'oi', ['hip3_open_interest'], true, true],
  ['hip3', 'liquidations', ['hip3_liquidations'], true, true],
  ['hip4', 'l2_orderbook', ['hip4_orderbook'], false, true],
  ['hip4', 'l4_diffs', ['hip4_l4_diffs'], true, true],
  ['hip4', 'l4_orders', ['hip4_l4_orders'], true, true],
  ['hip4', 'trades', ['hip4_trades'], true, true],
  ['hip4', 'oi', ['hip4_open_interest'], false, true],
  ['spot', 'l2_orderbook', ['spot_orderbook'], true, false],
  ['spot', 'l4_diffs', ['spot_l4_diffs'], true, true],
  ['spot', 'l4_orders', ['spot_l4_orders'], true, true],
  ['spot', 'trades', ['spot_trades'], true, false],
  ['spot', 'twap', [], false, false],
  ['lighter', 'l2_orderbook', ['lighter_orderbook'], true, true],
  ['lighter', 'l3_orderbook', ['lighter_l3_orderbook'], false, true],
  ['lighter', 'trades', ['lighter_trades'], true, true],
  ['lighter', 'candles', ['lighter_candles'], false, true],
  ['lighter', 'funding', ['lighter_funding'], true, true],
  ['lighter', 'oi', ['lighter_open_interest'], true, true],
  ['rh-lighter', 'l2_orderbook', ['rh_lighter_orderbook'], true, true],
  ['rh-lighter', 'trades', ['rh_lighter_trades'], true, true],
  ['rh-lighter', 'candles', ['rh_lighter_candles'], false, true],
  ['rh-lighter', 'funding', ['rh_lighter_funding'], true, true],
  ['rh-lighter', 'oi', ['rh_lighter_open_interest'], true, true],
];

// Channel names the SDK keeps for compatibility whose capabilities row lists
// no channel: [channel, venue, datatype].
const REST_ONLY_CHANNELS: Array<[WsChannel, string, string]> = [['spot_twap', 'spot', 'twap']];

describe('WebSocket channel capabilities', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists every channel exactly once, matching the capabilities rows', () => {
    const fromRows = WS_CAPABILITY_ROWS.flatMap(([venue, datatype, channels, live, replay]) =>
      channels.map((channel) => [channel, { venue, datatype, live, replay }] as const),
    );
    const restOnly = REST_ONLY_CHANNELS.map(([channel, venue, datatype]) => {
      const row = WS_CAPABILITY_ROWS.find(([v, d]) => v === venue && d === datatype);
      expect(row, channel).toBeDefined();
      expect([row![3], row![4]], channel).toEqual([false, false]);
      return [channel, { venue, datatype, live: false, replay: false }] as const;
    });
    const expected = [...fromRows, ...restOnly];
    expect(Object.keys(WS_CHANNEL_CAPABILITIES).sort()).toEqual(expected.map(([c]) => c).sort());
    for (const [channel, capability] of expected) {
      expect(WS_CHANNEL_CAPABILITIES[channel], channel).toMatchObject(capability);
    }
  });

  it('marks every L4 and full-depth channel as bulk replay, and nothing else', () => {
    expect([...WS_BULK_REPLAY_CHANNELS].sort()).toEqual(
      [
        'hip3_l4_diffs',
        'hip3_l4_orders',
        'hip3_orderbook_full',
        'hip4_l4_diffs',
        'hip4_l4_orders',
        'l4_diffs',
        'l4_orders',
        'orderbook_full',
        'spot_l4_diffs',
        'spot_l4_orders',
      ].sort(),
    );
    expect([...WS_REPLAY_CHANNELS].filter((c) => !WS_LIVE_CHANNELS.has(c)).sort()).toEqual(
      [
        'candles',
        'hip3_candles',
        'hip4_open_interest',
        'hip4_orderbook',
        'lighter_candles',
        'lighter_l3_orderbook',
        'rh_lighter_candles',
      ].sort(),
    );
  });

  it.each(['hip3_l4_diffs', 'hip3_l4_orders', 'spot_l4_diffs', 'spot_l4_orders', 'hip4_l4_diffs', 'hip4_l4_orders', 'orderbook_full', 'hip3_orderbook_full'] as const)(
    'replays %s in bulk',
    (channel) => {
      const { ws, sent } = openClient();
      ws.replay(channel, 'X', { start: 1, end: 2 });
      expect(sent()).toEqual([{ op: 'replay', channel, symbol: 'X', start: 1, end: 2, speed: 1 }]);
      expect(() => (ws.replay as any)(channel, 'X', { start: 1 })).toThrow(bulkReplayEndError(channel));
      expect(() => (ws.multiReplay as any)([channel], 'X', { start: 1, end: 2 })).toThrow(bulkReplayMultiError(channel));
      expect(sent()).toHaveLength(1);
    },
  );

  it.each(['ticker', 'all_tickers', 'spot_orderbook', 'spot_trades'] as const)(
    'refuses a %s replay before sending',
    (channel) => {
      const { ws, sent } = openClient();
      expect(() => (ws.replay as any)(channel, 'BTC', { start: 1, end: 2 })).toThrow(liveOnlyError(channel));
      expect(() => (ws.multiReplay as any)(['orderbook', channel], 'BTC', { start: 1, end: 2 })).toThrow(liveOnlyError(channel));
      expect(sent()).toEqual([]);
    },
  );

  it.each(['candles', 'hip3_candles', 'hip4_orderbook', 'hip4_open_interest'] as const)(
    'refuses a live %s subscription before sending',
    (channel) => {
      const { ws, sent } = openClient();
      expect(() => ws.subscribe(channel, 'BTC')).toThrow(replayOnlyError(channel));
      expect(sent()).toEqual([]);
    },
  );

  it('refuses live HIP-4 book and open interest through subscribeHip4, and keeps trades and L4', () => {
    const { ws, sent } = openClient();
    expect(() => ws.subscribeHip4('orderbook', '#1')).toThrow(replayOnlyError('hip4_orderbook'));
    expect(() => ws.subscribeHip4('hip4_open_interest', '#1')).toThrow(replayOnlyError('hip4_open_interest'));
    ws.subscribeHip4('trades', '#1');
    ws.subscribeHip4('l4_diffs', '#1');
    expect(sent().map((m) => m.channel)).toEqual(['hip4_trades', 'hip4_l4_diffs']);
  });

  it('refuses spot_twap live and in replay: Spot TWAP is REST only', () => {
    const { ws, sent } = openClient();
    expect(() => ws.subscribe('spot_twap', 'HYPE-USDC')).toThrow(restOnlyError('spot_twap'));
    expect(() => ws.subscribeSpot('twap', 'HYPE-USDC')).toThrow(restOnlyError('spot_twap'));
    expect(() => (ws.replay as any)('spot_twap', 'HYPE-USDC', { start: 1, end: 2 })).toThrow(restOnlyError('spot_twap'));
    expect(() => (ws.multiReplay as any)(['spot_twap'], 'HYPE-USDC', { start: 1, end: 2 })).toThrow(
      restOnlyError('spot_twap'),
    );
    expect(sent()).toEqual([]);
  });

  it('still replays timed channels alone and together', () => {
    const { ws, sent } = openClient();
    ws.replay('hip3_candles', 'xyz:SP500', { start: 1, end: 2, interval: '1h' });
    ws.multiReplay(['hip4_orderbook', 'hip4_trades', 'hip4_open_interest'], '#66900', { start: 1, end: 2, speed: 5 });
    expect(sent()).toHaveLength(2);
    expect(sent()[1]).toMatchObject({ channels: ['hip4_orderbook', 'hip4_trades', 'hip4_open_interest'], speed: 5 });
  });

  it('accepts the version echo on acks', () => {
    expect(
      WsServerMessageSchema.safeParse({
        type: 'replay_started',
        channel: 'hip3_l4_diffs',
        coin: 'km:US500',
        symbol: 'km:US500',
        start: 1,
        end: 2,
        speed: 1,
        version: '2026-10-01',
      }).success,
    ).toBe(true);
    expect(
      WsServerMessageSchema.safeParse({ type: 'subscribed', channel: 'hip4_orderbook', coin: '#1', symbol: '#1', version: '2026-10-01' })
        .success,
    ).toBe(true);
  });
});

// =============================================================================
// 8. Verbs
// =============================================================================

describe('verb aliases', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('trades.history() is trades.list(), and both remain', async () => {
    const fetchMock = stubFetch(ok([]), ok([]));
    const trades = client().hyperliquid.trades;

    const a = await trades.history('BTC', { start: 1, end: 2, limit: 5 });
    const b = await trades.list('BTC', { start: 1, end: 2, limit: 5 });

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(String(fetchMock.mock.calls[1]?.[0]));
    expect(a).toEqual(b);
    expect(typeof client().trades.history).toBe('function');
  });

  it('spot.twap.history() is spot.twap.bySymbol()', async () => {
    const fetchMock = stubFetch(ok([]), ok([]));
    const twap = client().spot.twap;

    await twap.history('hype-usdc', { start: 1, end: 2 });
    await twap.bySymbol('hype-usdc', { start: 1, end: 2 });

    expect(urlAt(fetchMock, 0).pathname).toBe('/v1/hyperliquid/spot/twap/HYPE-USDC');
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(String(fetchMock.mock.calls[1]?.[0]));
  });
});

// =============================================================================
// 9. Venue name
// =============================================================================

describe('the venue is named Lighter', () => {
  it('never as Lighter.xyz in the README or the source', () => {
    const files = [
      'README.md',
      'src/client.ts',
      'src/exchanges.ts',
      'src/index.ts',
      'src/types.ts',
      'src/websocket.ts',
      'src/schemas.ts',
      'src/resources/instruments.ts',
      'src/resources/l3-orderbook.ts',
      'src/resources/trades.ts',
    ];
    for (const file of files) {
      expect(readRepoFile(file), file).not.toMatch(/Lighter\.xyz/i);
    }
  });
});
