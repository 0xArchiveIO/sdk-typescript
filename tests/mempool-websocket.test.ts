import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  OxArchive,
  OxArchiveWs,
  STREAM_WS_URL,
  WS_CHANNEL_CAPABILITIES,
  WS_LIVE_CHANNELS,
  WS_REPLAY_CHANNELS,
  isErrorCode,
} from '../src';
import type { Capability, MempoolItem, OrderBook, Trade, WsError, WsServerMessage } from '../src';
import { MEMPOOL_REPLAY_ERROR, endpointOnlyError, liveOnlyError } from '../src/websocket';
import {
  CapabilitiesResponseSchema,
  MempoolItemSchema,
  WsChannelSchema,
  WsMempoolDataSchema,
  WsServerMessageSchema,
} from '../src/schemas';

const PLANS = ['pro', 'scale', 'enterprise'];

// One order touching BTC and one transfer, which references no market.
const ORDER: MempoolItem = {
  received_at: '2026-10-08T01:57:23.548737209Z',
  received_at_ms: 1791424643548,
  symbols: ['BTC'],
  action: {
    type: 'order',
    orders: [
      { a: 0, b: true, p: '83276', s: '0.40011', r: false, t: { limit: { tif: 'Alo' } }, c: '0x7849acc2c6c2f6f0fe4bc80ef13d1504' },
    ],
    grouping: 'na',
  },
  nonce: 1791424643400,
  vault_address: null,
  expires_after_ms: null,
  signature: {
    r: '0x5afc6f1b7d1c4e2a9b3f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a39',
    s: '0x57e2a1b3c5d7e9f0a2b4c6d8e0f1a3b5c7d9e1f3a5b7c9d1e3f5a7b9c1d3e5f7',
    v: 28,
  },
};

const TRANSFER: MempoolItem = {
  received_at: '2026-10-08T01:57:23.548737209Z',
  received_at_ms: 1791424643548,
  symbols: [],
  action: {
    type: 'usdSend',
    signatureChainId: '0xa4b1',
    hyperliquidChain: 'Mainnet',
    destination: '0x0000000000000000000000000000000000000001',
    amount: '25',
    time: 1791424643300,
  },
  nonce: 1791424643300,
  vault_address: '0x0000000000000000000000000000000000000002',
  expires_after_ms: 1791424703300,
  signature: {
    r: '0x1111111111111111111111111111111111111111111111111111111111111111',
    s: '0x2222222222222222222222222222222222222222222222222222222222222222',
    v: 27,
  },
};

const UNFILTERED_FRAME = { type: 'data', channel: 'mempool', coin: null, symbol: null, data: [ORDER, TRANSFER] };
const BTC_FRAME = { type: 'data', channel: 'mempool', coin: 'BTC', symbol: 'BTC', data: [ORDER] };

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

/** A client whose socket is already open, on the given endpoint. */
function openClient(wsUrl?: string): { ws: OxArchiveWs; sent: () => unknown[] } {
  vi.stubGlobal('WebSocket', { OPEN: 1 });
  const ws = new OxArchiveWs({ apiKey: 'test-key', ...(wsUrl ? { wsUrl } : {}) });
  const send = vi.fn();
  (ws as any).ws = { readyState: 1, send };
  return { ws, sent: () => send.mock.calls.map(([payload]) => JSON.parse(payload)) };
}

async function streamClient(prepare?: (ws: OxArchiveWs) => void): Promise<{ ws: OxArchiveWs; socket: FakeSocket }> {
  FakeSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeSocket);
  const ws = new OxArchiveWs({ apiKey: 'test-key', wsUrl: STREAM_WS_URL, autoReconnect: false });
  prepare?.(ws);
  const connecting = ws.connect();
  const socket = FakeSocket.instances[FakeSocket.instances.length - 1]!;
  socket.open();
  await connecting;
  return { ws, socket };
}

describe('mempool channel capability', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is live only, on the stream endpoint, with the Pro, Scale and Enterprise plans', () => {
    expect(STREAM_WS_URL).toBe('wss://stream.0xarchive.io/ws');
    expect(WS_CHANNEL_CAPABILITIES.mempool).toEqual({
      venue: 'hyperliquid',
      datatype: 'mempool',
      live: true,
      replay: false,
      bulkReplay: false,
      wsEndpoint: 'wss://stream.0xarchive.io/ws',
      plans: PLANS,
    });
    expect(WS_LIVE_CHANNELS.has('mempool')).toBe(true);
    expect(WS_REPLAY_CHANNELS.has('mempool')).toBe(false);
    expect(WsChannelSchema.safeParse('mempool').success).toBe(true);
  });

  it('leaves the endpoint and plans off every other channel', () => {
    for (const [channel, capability] of Object.entries(WS_CHANNEL_CAPABILITIES)) {
      if (channel === 'mempool') continue;
      expect(capability.wsEndpoint, channel).toBeUndefined();
      expect(capability.plans, channel).toBeUndefined();
    }
  });

  it('reads ws_endpoint and plans from /v1/capabilities, under validation', async () => {
    const row = {
      venue: 'hyperliquid',
      datatype: 'mempool',
      rest_routes: [],
      ws_channels: ['mempool'],
      live: true,
      replay: false,
      available_from: null,
      cadence: 'event',
      page_limit: null,
      intervals: [],
      notes: 'Signed transactions before they are in a block.',
      ws_endpoint: 'wss://stream.0xarchive.io/ws',
      plans: PLANS,
    };
    const summary = {
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
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: [row, summary], meta: { count: 2, request_id: 'r' } }),
      }),
    );

    const rows: Capability[] = await new OxArchive({ apiKey: 'k', baseUrl: 'https://api.example.test', validate: true }).capabilities();

    expect(rows[0]).toMatchObject({ datatype: 'mempool', wsChannels: ['mempool'], wsEndpoint: STREAM_WS_URL, plans: PLANS });
    expect(rows[1]!.wsEndpoint).toBeUndefined();
    expect(rows[1]!.plans).toBeUndefined();
    expect(
      CapabilitiesResponseSchema.safeParse({ success: true, data: [{ ...rows[0], plans: 'pro' }], meta: { count: 1, requestId: 'r' } })
        .success,
    ).toBe(false);
  });
});

describe('mempool subscriptions', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('subscribes without a symbol to the unfiltered stream, and with one to a market', () => {
    const { ws, sent } = openClient(STREAM_WS_URL);

    ws.subscribeMempool();
    ws.subscribeMempool('BTC');
    ws.subscribe('mempool', 'xyz:TSLA');
    ws.unsubscribeMempool('BTC');
    ws.unsubscribeMempool();

    expect(sent()).toEqual([
      { op: 'subscribe', channel: 'mempool' },
      { op: 'subscribe', channel: 'mempool', symbol: 'BTC' },
      { op: 'subscribe', channel: 'mempool', symbol: 'xyz:TSLA' },
      { op: 'unsubscribe', channel: 'mempool', symbol: 'BTC' },
      { op: 'unsubscribe', channel: 'mempool' },
    ]);
    expect((ws as any).subscriptions.size).toBe(1);
  });

  it('keeps the symbol on every other channel', () => {
    const { ws, sent } = openClient(STREAM_WS_URL);
    ws.subscribe('trades', 'BTC');
    ws.subscribe('l4_diffs', 'ETH');
    expect(sent()).toEqual([
      { op: 'subscribe', channel: 'trades', symbol: 'BTC' },
      { op: 'subscribe', channel: 'l4_diffs', symbol: 'ETH' },
    ]);
  });

  it('connects to the stream endpoint and re-sends both kinds of subscription on connect', async () => {
    const { ws, socket } = await streamClient((client) => {
      client.subscribeMempool();
      client.subscribeMempool('HYPE-USDC');
    });

    expect(socket.url).toBe('wss://stream.0xarchive.io/ws?apiKey=test-key&version=2026-10-01');
    expect(socket.sent).toEqual([
      { op: 'subscribe', channel: 'mempool' },
      { op: 'subscribe', channel: 'mempool', symbol: 'HYPE-USDC' },
    ]);
    ws.disconnect();
  });

  it('refuses mempool on the default endpoint before sending, naming the stream endpoint', () => {
    for (const wsUrl of [undefined, 'wss://api.0xarchive.io/ws', 'wss://api.0xarchive.io/ws?region=us']) {
      const { ws, sent } = openClient(wsUrl);
      const message = endpointOnlyError('mempool', STREAM_WS_URL);
      expect(message).toBe(
        "mempool is served on wss://stream.0xarchive.io/ws only. Create a client with { wsUrl: 'wss://stream.0xarchive.io/ws' } to subscribe to it.",
      );
      expect(() => ws.subscribeMempool()).toThrow(message);
      expect(() => ws.subscribe('mempool', 'BTC')).toThrow(message);
      expect(sent()).toEqual([]);
      expect((ws as any).subscriptions.size).toBe(0);
    }
  });

  it('leaves any other endpoint to the server', () => {
    const { ws, sent } = openClient('wss://proxy.example.test/ws');
    ws.subscribeMempool('BTC');
    expect(sent()).toEqual([{ op: 'subscribe', channel: 'mempool', symbol: 'BTC' }]);
  });

  it('refuses a replay before sending: pending transactions are not stored', () => {
    const { ws, sent } = openClient(STREAM_WS_URL);
    expect(liveOnlyError('mempool')).toBe(MEMPOOL_REPLAY_ERROR);
    expect(() => (ws.replay as any)('mempool', 'BTC', { start: 1, end: 2 })).toThrow(MEMPOOL_REPLAY_ERROR);
    expect(() => (ws.multiReplay as any)(['trades', 'mempool'], 'BTC', { start: 1, end: 2 })).toThrow(MEMPOOL_REPLAY_ERROR);
    expect(sent()).toEqual([]);
  });
});

describe('mempool messages', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('delivers the items to onMempool with the subscription symbol, or null when unfiltered', async () => {
    const batches: Array<[string | null, MempoolItem[]]> = [];
    const raw: WsServerMessage[] = [];
    const books: OrderBook[] = [];
    const trades: Trade[][] = [];
    const { ws, socket } = await streamClient((client) => {
      client.onMempool((symbol, items) => batches.push([symbol, items]));
      client.on('onMessage', (message) => raw.push(message));
      client.onOrderbook((_coin, book) => books.push(book));
      client.onTrades((_coin, data) => trades.push(data));
    });

    socket.receive({ type: 'subscribed', channel: 'mempool', coin: null, symbol: null });
    socket.receive(UNFILTERED_FRAME);
    socket.receive(BTC_FRAME);

    expect(batches).toEqual([
      [null, [ORDER, TRANSFER]],
      ['BTC', [ORDER]],
    ]);
    const [, [order, transfer]] = batches[0]!;
    expect(order!.action.type).toBe('order');
    expect(order!.symbols).toEqual(['BTC']);
    expect(order!.signature.v).toBe(28);
    expect(transfer!.symbols).toEqual([]);
    expect(transfer!.vault_address).toBe('0x0000000000000000000000000000000000000002');
    expect(transfer!.expires_after_ms).toBe(1791424703300);
    expect(Object.keys(order!)).toEqual([
      'received_at',
      'received_at_ms',
      'symbols',
      'action',
      'nonce',
      'vault_address',
      'expires_after_ms',
      'signature',
    ]);
    expect(raw.map((m) => m.type)).toEqual(['subscribed', 'data', 'data']);
    expect(books).toEqual([]);
    expect(trades).toEqual([]);
    ws.disconnect();
  });

  it('validates the data messages, items and acks', () => {
    for (const frame of [UNFILTERED_FRAME, BTC_FRAME]) {
      expect(WsMempoolDataSchema.safeParse(frame).success).toBe(true);
      expect(WsServerMessageSchema.safeParse(frame).success).toBe(true);
    }
    for (const ack of [
      { type: 'subscribed', channel: 'mempool', coin: null, symbol: null },
      { type: 'subscribed', channel: 'mempool', coin: 'BTC', symbol: 'BTC', version: '2026-10-01' },
      { type: 'unsubscribed', channel: 'mempool', coin: null, symbol: null },
    ]) {
      expect(WsServerMessageSchema.safeParse(ack).success).toBe(true);
    }
    expect(MempoolItemSchema.parse(ORDER).action).toEqual(ORDER.action);
    expect(MempoolItemSchema.safeParse({ ...ORDER, signature: null }).success).toBe(false);
    expect(MempoolItemSchema.safeParse({ ...ORDER, action: { orders: [] } }).success).toBe(false);
  });

  it.each([
    [
      'forbidden',
      'The mempool channel is included with the Pro, Scale and Enterprise plans. Upgrade at https://0xarchive.io/pricing.',
    ],
    [
      'endpoint_unsupported',
      "The 'mempool' channel is live only and served on wss://stream.0xarchive.io/ws. Subscribe to it there.",
    ],
    ['rate_limited', 'The unfiltered mempool stream is at capacity. Subscribe with a symbol, or try again later.'],
    ['upstream_unavailable', 'The mempool channel is temporarily unavailable. Please try again shortly.'],
  ] as const)('surfaces %s as a typed server error with its code', async (code, message) => {
    const errors: WsError[] = [];
    const { ws, socket } = await streamClient((client) => client.onServerError((error) => errors.push(error)));

    socket.receive({ type: 'error', message, error_code: code });

    expect(errors).toEqual([{ type: 'error', message, error_code: code, errorCode: code }]);
    expect(isErrorCode(errors[0]!.errorCode)).toBe(true);
    expect(WsServerMessageSchema.safeParse({ type: 'error', message, error_code: code }).success).toBe(true);
    ws.disconnect();
  });
});
