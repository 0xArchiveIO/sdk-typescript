import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  HYPERLIQUID_L4_LIVE_ONLY_REPLAY_ERROR,
  LIGHTER_INTERVAL_CHANNEL_ERROR,
  LIGHTER_LIVE_CHANNELS,
  LIGHTER_REPLAY_CHANNELS,
  LIGHTER_REPLAY_ONLY_CHANNELS,
  LIGHTER_SUBSCRIPTION_ERROR,
  OxArchiveWs,
} from '../src/websocket';
import {
  LighterLiveOrderbookSchema,
  LighterLiveStatsSchema,
  LighterLiveTradeSchema,
  LighterLiveTradesSchema,
  TradeSchema,
  WsServerMessageSchema,
} from '../src/schemas';
import type {
  LighterLiveChannel,
  LighterLiveOrderbook,
  LighterLiveStats,
  LighterLiveTrade,
  OrderBook,
  Trade,
  WsChannel,
  WsL4Batch,
  WsL4DiffEvent,
  WsL4Snapshot,
  WsStandardReplayChannel,
} from '../src/types';

const lighterChannels: WsStandardReplayChannel[] = [
  'lighter_orderbook',
  'lighter_trades',
  'lighter_candles',
  'lighter_open_interest',
  'lighter_funding',
  'lighter_l3_orderbook',
];

const lighterLiveChannels: LighterLiveChannel[] = [
  'lighter_orderbook',
  'lighter_trades',
  'lighter_open_interest',
  'lighter_funding',
];

const lighterReplayOnlyChannels: WsChannel[] = ['lighter_candles', 'lighter_l3_orderbook'];

// Real production frames from wss://api.0xarchive.io/ws (the order book is
// truncated to three levels per side; live frames carry up to 20).
const LIGHTER_ORDERBOOK_FRAME = {
  type: 'data',
  channel: 'lighter_orderbook',
  coin: 'BTC',
  symbol: 'BTC',
  data: {
    coin: 'BTC',
    time: 1790294171459,
    levels: [
      [
        { px: '84368.7', sz: '0.00020', n: 1 },
        { px: '84368.6', sz: '0.00020', n: 1 },
        { px: '84368.3', sz: '0.00010', n: 1 },
      ],
      [
        { px: '84368.8', sz: '0.05720', n: 1 },
        { px: '84368.9', sz: '0.14223', n: 1 },
        { px: '84369.1', sz: '0.01198', n: 1 },
      ],
    ],
  },
} as const;

const LIGHTER_TRADES_FRAME = {
  type: 'data',
  channel: 'lighter_trades',
  coin: 'BTC',
  symbol: 'BTC',
  data: [
    {
      coin: 'BTC',
      side: 'A',
      px: '84367.9',
      sz: '0.00003',
      time: 1790294182211,
      hash: '0000001dc8774b28000001a0d5d94943000000000000000000000000000000000000000000000000',
      tid: 31944180930,
      oid: 562953419896990,
      crossed: false,
      dir: null,
      fee: null,
      fee_token: null,
      closed_pnl: null,
      start_position: '109.79011',
      users: ['281474976623827'],
    },
    {
      coin: 'BTC',
      side: 'B',
      px: '84367.9',
      sz: '0.00003',
      time: 1790294182211,
      hash: '0000001dc8774b28000001a0d5d94943000000000000000000000000000000000000000000000000',
      tid: 31944180930,
      oid: 844421425107071,
      crossed: true,
      dir: null,
      fee: null,
      fee_token: null,
      closed_pnl: null,
      start_position: '0.03940',
      users: ['713845'],
    },
  ],
} as const;

const LIGHTER_STATS_DATA = {
  coin: 'BTC',
  ctx: {
    openInterest: '172706178.266310',
    funding: '0.000012',
    premium: '-0.000327',
    markPx: '84363.5',
    oraclePx: '84397.0',
    midPx: '84368.8',
    dayNtlVlm: '908611371.550746',
    dayBaseVlm: '10808.97087',
    prevDayPx: '84285.9',
    impactPxs: null,
  },
} as const;

const statsFrame = (channel: 'lighter_open_interest' | 'lighter_funding') => ({
  type: 'data',
  channel,
  coin: 'BTC',
  symbol: 'BTC',
  data: LIGHTER_STATS_DATA,
});

/** Minimal stand-in for the global WebSocket that records what is sent. */
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

/** A client whose socket is already open, with `send` captured. */
function openClient(): { ws: OxArchiveWs; send: ReturnType<typeof vi.fn> } {
  vi.stubGlobal('WebSocket', { OPEN: 1 });
  const ws = new OxArchiveWs({ apiKey: 'test-key' });
  const send = vi.fn();
  (ws as any).ws = { readyState: 1, send };
  return { ws, send };
}

/** A client connected through FakeSocket. */
async function connectedClient(prepare?: (ws: OxArchiveWs) => void): Promise<{ ws: OxArchiveWs; socket: FakeSocket }> {
  FakeSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeSocket);
  const ws = new OxArchiveWs({ apiKey: 'test-key', autoReconnect: false });
  prepare?.(ws);
  const connected = ws.connect();
  const socket = FakeSocket.instances[FakeSocket.instances.length - 1]!;
  socket.open();
  await connected;
  return { ws, socket };
}

describe('Lighter WebSocket capabilities', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defines exactly the six replay-capable Lighter channels', () => {
    expect([...LIGHTER_REPLAY_CHANNELS].sort()).toEqual([...lighterChannels].sort());
  });

  it('splits them into four live channels and two replay-only channels', () => {
    expect([...LIGHTER_LIVE_CHANNELS].sort()).toEqual([...lighterLiveChannels].sort());
    expect([...LIGHTER_REPLAY_ONLY_CHANNELS].sort()).toEqual([...lighterReplayOnlyChannels].sort());
  });

  it.each(lighterReplayOnlyChannels)('rejects %s live subscriptions before sending', (channel) => {
    const { ws, send } = openClient();

    expect(() => ws.subscribe(channel, 'BTC')).toThrow(LIGHTER_SUBSCRIPTION_ERROR);
    expect(send).not.toHaveBeenCalled();
    expect((ws as any).subscriptions.size).toBe(0);
  });

  it.each(lighterLiveChannels)('sends a live %s subscription with the Hyperliquid envelope', (channel) => {
    const { ws, send } = openClient();

    ws.subscribe(channel, 'BTC');

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(JSON.stringify({ op: 'subscribe', channel, symbol: 'BTC' }));
    expect((ws as any).subscriptions.size).toBe(1);
  });

  it('unsubscribes a live Lighter channel with the Hyperliquid envelope', () => {
    const { ws, send } = openClient();
    ws.subscribe('lighter_trades', 'BTC');

    ws.unsubscribe('lighter_trades', 'BTC');

    expect(send).toHaveBeenLastCalledWith(
      JSON.stringify({ op: 'unsubscribe', channel: 'lighter_trades', symbol: 'BTC' }),
    );
    expect((ws as any).subscriptions.size).toBe(0);
  });

  it.each(lighterChannels)('allows %s through bounded replay', (channel) => {
    vi.stubGlobal('WebSocket', { OPEN: 1 });
    const ws = new OxArchiveWs({ apiKey: 'test-key' });
    const send = vi.fn();
    (ws as any).ws = { readyState: 1, send };

    ws.replay(channel, 'BTC', { start: 1, end: 2 });

    expect(send).toHaveBeenCalledWith(
      JSON.stringify({
        op: 'replay',
        channel,
        symbol: 'BTC',
        start: 1,
        end: 2,
        speed: 1,
        granularity: undefined,
        interval: undefined,
      }),
    );
  });

  it('keeps Hyperliquid live subscriptions unchanged', () => {
    vi.stubGlobal('WebSocket', { OPEN: 1 });
    const ws = new OxArchiveWs({ apiKey: 'test-key' });
    const send = vi.fn();
    (ws as any).ws = { readyState: 1, send };

    ws.subscribe('orderbook', 'BTC');

    expect(send).toHaveBeenCalledWith(
      JSON.stringify({ op: 'subscribe', channel: 'orderbook', symbol: 'BTC' }),
    );
  });

  it('accepts the core L4 replay snapshot and ordered batch event shapes', () => {
    const snapshot: WsL4Snapshot = {
      type: 'l4_snapshot',
      channel: 'l4_diffs',
      coin: 'BTC',
      symbol: 'BTC',
      last_block_number: 100,
      timestamp: 1_700_000_000_000,
      data: {
        bids: [['0xabc', { oid: 1, sz: '2' }]],
        asks: [],
      },
    };
    const batch: WsL4Batch<WsL4DiffEvent> = {
      type: 'l4_batch',
      channel: 'l4_diffs',
      coin: 'BTC',
      symbol: 'BTC',
      data: [{
        timestamp: 1_700_000_000_001,
        block_number: 101,
        seq: 2,
        oid: 1,
        user: '0xabc',
        side: 'B',
        price: 100,
        diff_type: 'update',
        new_size: 1,
        insert_before: null,
      }],
    };

    expect(WsServerMessageSchema.safeParse(snapshot).success).toBe(true);
    expect(WsServerMessageSchema.safeParse(batch).success).toBe(true);
    expect(batch.data[0]?.block_number).toBe(101);
    expect(batch.data[0]?.seq).toBe(2);
  });

  it('sends bounded core L4 replay requests and requires end', () => {
    vi.stubGlobal('WebSocket', { OPEN: 1 });
    const ws = new OxArchiveWs({ apiKey: 'test-key' });
    const send = vi.fn();
    (ws as any).ws = { readyState: 1, send };

    ws.replay('l4_orders', 'BTC', { start: 1, end: 2 });
    expect(send).toHaveBeenCalledWith(
      JSON.stringify({
        op: 'replay',
        channel: 'l4_orders',
        symbol: 'BTC',
        start: 1,
        end: 2,
        speed: 1,
        granularity: undefined,
        interval: undefined,
      }),
    );
    expect(() => (ws.replay as any)('l4_diffs', 'BTC', { start: 1 }))
      .toThrow('Hyperliquid core L4 replay requires an explicit end timestamp.');
  });

  it.each([
    'hip3_l4_diffs',
    'hip3_l4_orders',
    'hip4_l4_diffs',
    'hip4_l4_orders',
    'spot_l4_diffs',
    'spot_l4_orders',
  ] as WsChannel[])('rejects %s replay because the channel is live-only', (channel) => {
    vi.stubGlobal('WebSocket', { OPEN: 1 });
    const ws = new OxArchiveWs({ apiKey: 'test-key' });
    const send = vi.fn();
    (ws as any).ws = { readyState: 1, send };

    expect(() => (ws.replay as any)(channel, 'BTC', { start: 1, end: 2 }))
      .toThrow(HYPERLIQUID_L4_LIVE_ONLY_REPLAY_ERROR);
    expect(send).not.toHaveBeenCalled();
  });
});

describe('Lighter live order book interval', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends intervalMs as interval_ms on lighter_orderbook', () => {
    const { ws, send } = openClient();

    ws.subscribe('lighter_orderbook', 'BTC', { intervalMs: 250 });

    expect(send).toHaveBeenCalledWith(
      JSON.stringify({ op: 'subscribe', channel: 'lighter_orderbook', symbol: 'BTC', interval_ms: 250 }),
    );
  });

  it('leaves interval_ms out when no interval is given (server default: one book a second)', () => {
    const { ws, send } = openClient();

    ws.subscribe('lighter_orderbook', 'BTC');
    ws.subscribe('lighter_orderbook', 'ETH', {});

    expect(send.mock.calls.map(([payload]) => JSON.parse(payload))).toEqual([
      { op: 'subscribe', channel: 'lighter_orderbook', symbol: 'BTC' },
      { op: 'subscribe', channel: 'lighter_orderbook', symbol: 'ETH' },
    ]);
  });

  it.each([100, 5000])('accepts the inclusive bound %i', (intervalMs) => {
    const { ws, send } = openClient();

    ws.subscribe('lighter_orderbook', 'BTC', { intervalMs });

    expect(JSON.parse(send.mock.calls[0]![0]).interval_ms).toBe(intervalMs);
  });

  it.each([50, 99, 5001, 250.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects intervalMs %s before sending',
    (intervalMs) => {
      const { ws, send } = openClient();

      expect(() => ws.subscribe('lighter_orderbook', 'BTC', { intervalMs })).toThrow(
        `intervalMs must be an integer between 100 and 5000 for lighter_orderbook (got ${intervalMs}). ` +
          'Leave it out for one book a second.',
      );
      expect(send).not.toHaveBeenCalled();
      expect((ws as any).subscriptions.size).toBe(0);
    },
  );

  it.each(['lighter_trades', 'lighter_open_interest', 'lighter_funding', 'orderbook', 'hip3_orderbook'] as WsChannel[])(
    'rejects intervalMs on %s',
    (channel) => {
      const { ws, send } = openClient();

      expect(() => ws.subscribe(channel, 'BTC', { intervalMs: 250 })).toThrow(LIGHTER_INTERVAL_CHANNEL_ERROR);
      expect(send).not.toHaveBeenCalled();
      expect((ws as any).subscriptions.size).toBe(0);
    },
  );

  it('rejects intervalMs on replay-only Lighter channels with the replay-only error', () => {
    const { ws } = openClient();

    expect(() => ws.subscribe('lighter_candles', 'BTC', { intervalMs: 250 })).toThrow(LIGHTER_SUBSCRIPTION_ERROR);
  });
});

describe('subscribeLighter convenience methods', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('accepts short and full channel names', () => {
    const { ws, send } = openClient();

    ws.subscribeLighter('orderbook', 'BTC', { intervalMs: 500 });
    ws.subscribeLighter('trades', 'BTC');
    ws.subscribeLighter('open_interest', 'ETH');
    ws.subscribeLighter('lighter_funding', 'ETH');

    expect(send.mock.calls.map(([payload]) => JSON.parse(payload))).toEqual([
      { op: 'subscribe', channel: 'lighter_orderbook', symbol: 'BTC', interval_ms: 500 },
      { op: 'subscribe', channel: 'lighter_trades', symbol: 'BTC' },
      { op: 'subscribe', channel: 'lighter_open_interest', symbol: 'ETH' },
      { op: 'subscribe', channel: 'lighter_funding', symbol: 'ETH' },
    ]);
  });

  it('unsubscribes with short or full channel names', () => {
    const { ws, send } = openClient();
    ws.subscribeLighter('trades', 'BTC');
    ws.subscribeLighter('funding', 'BTC');

    ws.unsubscribeLighter('trades', 'BTC');
    ws.unsubscribeLighter('lighter_funding', 'BTC');

    expect(send.mock.calls.slice(2).map(([payload]) => JSON.parse(payload))).toEqual([
      { op: 'unsubscribe', channel: 'lighter_trades', symbol: 'BTC' },
      { op: 'unsubscribe', channel: 'lighter_funding', symbol: 'BTC' },
    ]);
    expect((ws as any).subscriptions.size).toBe(0);
  });

  it('applies the same interval rule as subscribe', () => {
    const { ws, send } = openClient();

    expect(() => ws.subscribeLighter('trades', 'BTC', { intervalMs: 250 })).toThrow(LIGHTER_INTERVAL_CHANNEL_ERROR);
    expect(() => ws.subscribeLighter('orderbook', 'BTC', { intervalMs: 50 })).toThrow('(got 50)');
    expect(send).not.toHaveBeenCalled();
  });
});

describe('WebSocket resubscribe on connect', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('re-sends stored subscriptions with their interval and full symbol', async () => {
    const { ws, socket } = await connectedClient((client) => {
      client.subscribe('lighter_orderbook', 'BTC', { intervalMs: 250 });
      client.subscribe('lighter_trades', 'BTC');
      client.subscribe('hip3_orderbook', 'km:US500');
      client.subscribe('all_tickers');
    });

    expect(socket.sent).toEqual([
      { op: 'subscribe', channel: 'lighter_orderbook', symbol: 'BTC', interval_ms: 250 },
      { op: 'subscribe', channel: 'lighter_trades', symbol: 'BTC' },
      { op: 'subscribe', channel: 'hip3_orderbook', symbol: 'km:US500' },
      { op: 'subscribe', channel: 'all_tickers' },
    ]);
    ws.disconnect();
  });

  it('keeps the latest interval when the same book is subscribed again', async () => {
    const { ws, socket } = await connectedClient((client) => {
      client.subscribe('lighter_orderbook', 'BTC', { intervalMs: 250 });
      client.subscribe('lighter_orderbook', 'BTC', { intervalMs: 1000 });
    });

    expect((ws as any).subscriptions.size).toBe(1);
    expect(socket.sent).toEqual([
      { op: 'subscribe', channel: 'lighter_orderbook', symbol: 'BTC', interval_ms: 1000 },
    ]);
    ws.disconnect();
  });

  it('treats Lighter symbols case-insensitively, as the server does', async () => {
    const { ws, socket } = await connectedClient((client) => {
      client.subscribe('lighter_orderbook', 'btc', { intervalMs: 250 });
      client.subscribe('lighter_orderbook', 'BTC', { intervalMs: 500 });
      client.subscribe('lighter_trades', 'eth');
      client.unsubscribe('lighter_trades', 'ETH');
    });

    expect((ws as any).subscriptions.size).toBe(1);
    expect(socket.sent).toEqual([
      { op: 'subscribe', channel: 'lighter_orderbook', symbol: 'BTC', interval_ms: 500 },
    ]);
    ws.disconnect();
  });

  it('keeps HIP-3 symbols case-sensitive', () => {
    const { ws } = openClient();
    ws.subscribe('hip3_orderbook', 'xyz:XYZ100');
    ws.subscribe('hip3_orderbook', 'XYZ:XYZ100');

    expect((ws as any).subscriptions.size).toBe(2);
  });

  it('does not re-send a subscription that was removed', async () => {
    const { ws, socket } = await connectedClient((client) => {
      client.subscribe('lighter_funding', 'BTC');
      client.subscribe('lighter_trades', 'BTC');
      client.unsubscribe('lighter_funding', 'BTC');
    });

    expect(socket.sent).toEqual([{ op: 'subscribe', channel: 'lighter_trades', symbol: 'BTC' }]);
    ws.disconnect();
  });
});

describe('Live Lighter message dispatch (real frames)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('delivers lighter_orderbook raw to onLighterOrderbook and keeps it out of onOrderbook', async () => {
    const raw: Array<[string, LighterLiveOrderbook]> = [];
    const books: OrderBook[] = [];
    const { ws, socket } = await connectedClient((client) => {
      client.onLighterOrderbook((coin, book) => raw.push([coin, book]));
      client.onOrderbook((_coin, book) => books.push(book));
    });

    socket.receive(LIGHTER_ORDERBOOK_FRAME);
    socket.receive({ ...LIGHTER_ORDERBOOK_FRAME, channel: 'orderbook' });

    expect(raw).toEqual([['BTC', LIGHTER_ORDERBOOK_FRAME.data]]);
    // Only the Hyperliquid book reaches the generic handler.
    expect(books).toHaveLength(1);
    ws.disconnect();
  });

  it('converts lighter_orderbook for onOrderbook when no Lighter book handler is registered', async () => {
    const books: OrderBook[] = [];
    const { ws, socket } = await connectedClient((client) => {
      client.onOrderbook((_coin, book) => books.push(book));
    });

    socket.receive(LIGHTER_ORDERBOOK_FRAME);

    expect(books).toHaveLength(1);
    const book = books[0]!;
    expect(book.coin).toBe('BTC');
    expect(book.timestamp).toBe(new Date(1790294171459).toISOString());
    expect(book.bids.map((level) => level.px)).toEqual(['84368.7', '84368.6', '84368.3']);
    expect(book.asks.map((level) => level.px)).toEqual(['84368.8', '84368.9', '84369.1']);
    expect(book.bids.every((level) => level.n === 1)).toBe(true);
    expect(Number(book.midPrice)).toBeCloseTo(84368.75, 6);
    ws.disconnect();
  });

  it('delivers lighter_trades legs raw to onLighterTrades and keeps them out of onTrades', async () => {
    const received: LighterLiveTrade[][] = [];
    const generic: Trade[][] = [];
    const { ws, socket } = await connectedClient((client) => {
      client.onLighterTrades((_coin, legs) => received.push(legs));
      client.onTrades((_coin, trades) => generic.push(trades));
    });

    socket.receive(LIGHTER_TRADES_FRAME);

    expect(received).toEqual([LIGHTER_TRADES_FRAME.data]);
    expect(generic).toEqual([]);
    const legs = received[0]!;
    // Two legs per trade: count by distinct tid, volume over one leg per tid.
    expect(new Set(legs.map((leg) => leg.tid)).size).toBe(1);
    const volume = [...new Map(legs.map((leg) => [leg.tid, Number(leg.sz)])).values()].reduce((a, b) => a + b, 0);
    expect(volume).toBeCloseTo(0.00003, 10);
    expect(legs.filter((leg) => leg.crossed).map((leg) => leg.side)).toEqual(['B']);
    expect(legs.every((leg) => leg.fee === null && leg.fee_token === null && leg.closed_pnl === null && leg.dir === null)).toBe(true);
    ws.disconnect();
  });

  it('converts lighter_trades legs for onTrades (no Lighter trade handler) with the account index', async () => {
    const received: Trade[][] = [];
    const { ws, socket } = await connectedClient((client) => {
      client.onTrades((_coin, trades) => received.push(trades));
    });

    socket.receive(LIGHTER_TRADES_FRAME);

    expect(received).toHaveLength(1);
    const [ask, bid] = received[0]!;
    expect(ask).toStrictEqual({
      coin: 'BTC',
      side: 'A',
      price: '84367.9',
      size: '0.00003',
      timestamp: new Date(1790294182211).toISOString(),
      tradeId: 31944180930,
      txHash: '0000001dc8774b28000001a0d5d94943000000000000000000000000000000000000000000000000',
      orderId: 562953419896990,
      crossed: false,
      startPosition: '109.79011',
      accountIndex: '281474976623827',
    });
    expect(bid).toMatchObject({ side: 'B', crossed: true, orderId: 844421425107071, accountIndex: '713845' });
    expect(TradeSchema.safeParse(ask).success).toBe(true);
    expect(TradeSchema.safeParse(bid).success).toBe(true);
    ws.disconnect();
  });

  it('delivers the shared stats message for both lighter_open_interest and lighter_funding', async () => {
    const received: Array<[string, string, LighterLiveStats]> = [];
    const { ws, socket } = await connectedClient((client) => {
      client.onLighterStats((channel, coin, stats) => received.push([channel, coin, stats]));
    });

    socket.receive(statsFrame('lighter_open_interest'));
    socket.receive(statsFrame('lighter_funding'));

    expect(received).toEqual([
      ['lighter_open_interest', 'BTC', LIGHTER_STATS_DATA],
      ['lighter_funding', 'BTC', LIGHTER_STATS_DATA],
    ]);
    expect(received[0]![2].ctx.funding).toBe('0.000012');
    expect(received[0]![2].ctx.impactPxs).toBeNull();
    ws.disconnect();
  });

  it('keeps the Hyperliquid trades mapping unchanged', async () => {
    const received: Trade[][] = [];
    const { ws, socket } = await connectedClient((client) => {
      client.onTrades((_coin, trades) => received.push(trades));
    });

    socket.receive({
      type: 'data',
      channel: 'trades',
      coin: 'BTC',
      data: [{ px: '100', sz: '1', side: 'B', time: 1_700_000_000_000, hash: '0xh', tid: 7, users: ['0xmaker', '0xtaker'] }],
    });

    expect(received[0]![0]).toMatchObject({ price: '100', makerAddress: '0xmaker', takerAddress: '0xtaker', tradeId: 7 });
    expect(received[0]![0]!.accountIndex).toBeUndefined();
    ws.disconnect();
  });

  it('passes the server error text for lag notices to onMessage', async () => {
    const errors: string[] = [];
    const { ws, socket } = await connectedClient();
    ws.on('onMessage', (message) => {
      if (message.type === 'error') errors.push(message.message);
    });

    const notice =
      'Dropped ~12 live lighter_trades messages for BTC: your connection fell behind the Lighter stream, ' +
      'and those trades were not delivered.';
    socket.receive({ type: 'error', message: notice });

    expect(errors).toEqual([notice]);
    ws.disconnect();
  });
});

describe('Live Lighter schemas (real frames)', () => {
  it('validates the data envelopes and acks', () => {
    for (const frame of [
      LIGHTER_ORDERBOOK_FRAME,
      LIGHTER_TRADES_FRAME,
      statsFrame('lighter_open_interest'),
      statsFrame('lighter_funding'),
      { type: 'subscribed', channel: 'lighter_orderbook', coin: 'BTC', symbol: 'BTC' },
      { type: 'unsubscribed', channel: 'lighter_trades', coin: 'BTC', symbol: 'BTC' },
    ]) {
      expect(WsServerMessageSchema.safeParse(frame).success).toBe(true);
    }
  });

  it('validates each live payload', () => {
    expect(LighterLiveOrderbookSchema.safeParse(LIGHTER_ORDERBOOK_FRAME.data).success).toBe(true);
    expect(LighterLiveTradesSchema.safeParse(LIGHTER_TRADES_FRAME.data).success).toBe(true);
    expect(LighterLiveStatsSchema.safeParse(LIGHTER_STATS_DATA).success).toBe(true);
  });

  it('accepts null optional fields on a trade leg', () => {
    const leg = { ...LIGHTER_TRADES_FRAME.data[0], hash: null, oid: null, start_position: null, users: [] };
    expect(LighterLiveTradeSchema.safeParse(leg).success).toBe(true);
  });

  it('rejects an order book without both sides', () => {
    const bad = { coin: 'BTC', time: 1, levels: [[{ px: '1', sz: '1', n: 1 }]] };
    expect(LighterLiveOrderbookSchema.safeParse(bad).success).toBe(false);
  });
});
