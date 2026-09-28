import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LIGHTER_INTERVAL_CHANNEL_ERROR,
  LIGHTER_REPLAY_CHANNELS,
  OxArchiveWs,
  RH_LIGHTER_INTERVAL_CHANNEL_ERROR,
  RH_LIGHTER_LIVE_CHANNELS,
  RH_LIGHTER_REPLAY_CHANNELS,
  RH_LIGHTER_REPLAY_ONLY_CHANNELS,
  RH_LIGHTER_SUBSCRIPTION_ERROR,
} from '../src/websocket';
import { WsChannelSchema, WsServerMessageSchema } from '../src/schemas';
import type {
  LighterLiveOrderbook,
  LighterLiveStats,
  LighterLiveTrade,
  OrderBook,
  RhLighterLiveChannel,
  Trade,
  WsChannel,
  WsStandardReplayChannel,
} from '../src/types';

const rhLive: RhLighterLiveChannel[] = [
  'rh_lighter_orderbook',
  'rh_lighter_trades',
  'rh_lighter_open_interest',
  'rh_lighter_funding',
];

const rhAll: WsStandardReplayChannel[] = [...rhLive, 'rh_lighter_candles'];

// Robinhood Chain live frames use the mainnet Lighter live shapes.
const RH_BOOK = {
  type: 'data',
  channel: 'rh_lighter_orderbook',
  coin: 'AAPL-USDG',
  symbol: 'AAPL-USDG',
  data: {
    coin: 'AAPL-USDG',
    time: 1790294171459,
    levels: [
      [{ px: '231.12', sz: '4.5', n: 1 }],
      [{ px: '231.18', sz: '2.0', n: 1 }],
    ],
  },
} as const;

const RH_TRADES = {
  type: 'data',
  channel: 'rh_lighter_trades',
  coin: 'BTC',
  symbol: 'BTC',
  data: [
    {
      coin: 'BTC',
      side: 'A',
      px: '84367.9',
      sz: '0.001',
      time: 1790294182211,
      hash: 'abc',
      tid: 77,
      oid: 11,
      crossed: false,
      dir: null,
      fee: null,
      fee_token: null,
      closed_pnl: null,
      start_position: '0.5',
      users: ['9001'],
    },
    {
      coin: 'BTC',
      side: 'B',
      px: '84367.9',
      sz: '0.001',
      time: 1790294182211,
      hash: 'abc',
      tid: 77,
      oid: 12,
      crossed: true,
      dir: null,
      fee: null,
      fee_token: null,
      closed_pnl: null,
      start_position: '0',
      users: ['9002'],
    },
  ],
} as const;

const RH_STATS = {
  coin: 'BTC',
  ctx: {
    openInterest: '1250.5',
    funding: '0.00001',
    premium: '0.0001',
    markPx: '84363.5',
    oraclePx: '84397.0',
    midPx: '84368.8',
    dayNtlVlm: '1000000',
    dayBaseVlm: '12',
    prevDayPx: '84285.9',
    impactPxs: null,
  },
} as const;

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

function openClient(): { ws: OxArchiveWs; send: ReturnType<typeof vi.fn> } {
  vi.stubGlobal('WebSocket', { OPEN: 1 });
  const ws = new OxArchiveWs({ apiKey: 'test-key' });
  const send = vi.fn();
  (ws as any).ws = { readyState: 1, send };
  return { ws, send };
}

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

const sent = (send: ReturnType<typeof vi.fn>) => send.mock.calls.map(([payload]) => JSON.parse(payload));

describe('Lighter on Robinhood Chain WebSocket channels', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defines five replay channels, four live and one replay-only, separate from mainnet', () => {
    expect([...RH_LIGHTER_REPLAY_CHANNELS].sort()).toEqual([...rhAll].sort());
    expect([...RH_LIGHTER_LIVE_CHANNELS].sort()).toEqual([...rhLive].sort());
    expect([...RH_LIGHTER_REPLAY_ONLY_CHANNELS]).toEqual(['rh_lighter_candles']);
    for (const channel of rhAll) {
      expect(LIGHTER_REPLAY_CHANNELS.has(channel)).toBe(false);
      expect(WsChannelSchema.safeParse(channel).success).toBe(true);
    }
  });

  it.each(rhLive)('sends a live %s subscription', (channel) => {
    const { ws, send } = openClient();

    ws.subscribe(channel, 'BTC');

    expect(sent(send)).toEqual([{ op: 'subscribe', channel, symbol: 'BTC' }]);
  });

  it('rejects live rh_lighter_candles before sending', () => {
    const { ws, send } = openClient();

    expect(() => ws.subscribe('rh_lighter_candles', 'BTC')).toThrow(RH_LIGHTER_SUBSCRIPTION_ERROR);
    expect(() => ws.subscribe('rh_lighter_candles', 'BTC', { intervalMs: 250 })).toThrow(RH_LIGHTER_SUBSCRIPTION_ERROR);
    expect(send).not.toHaveBeenCalled();
    expect((ws as any).subscriptions.size).toBe(0);
  });

  it.each(rhAll)('allows %s through bounded replay', (channel) => {
    const { ws, send } = openClient();

    ws.replay(channel, 'AAPL-USDG', { start: 1, end: 2, speed: 5 });

    expect(sent(send)).toEqual([{ op: 'replay', channel, symbol: 'AAPL-USDG', start: 1, end: 2, speed: 5 }]);
  });

  it('accepts intervalMs on rh_lighter_orderbook, including the bounds', () => {
    const { ws, send } = openClient();

    ws.subscribe('rh_lighter_orderbook', 'BTC', { intervalMs: 100 });
    ws.subscribe('rh_lighter_orderbook', 'ETH', { intervalMs: 5000 });
    ws.subscribe('rh_lighter_orderbook', 'SOL');

    expect(sent(send)).toEqual([
      { op: 'subscribe', channel: 'rh_lighter_orderbook', symbol: 'BTC', interval_ms: 100 },
      { op: 'subscribe', channel: 'rh_lighter_orderbook', symbol: 'ETH', interval_ms: 5000 },
      { op: 'subscribe', channel: 'rh_lighter_orderbook', symbol: 'SOL' },
    ]);
  });

  it.each([99, 5001, 250.5])('rejects intervalMs %s on rh_lighter_orderbook with its own channel name', (intervalMs) => {
    const { ws, send } = openClient();

    expect(() => ws.subscribe('rh_lighter_orderbook', 'BTC', { intervalMs })).toThrow(
      `intervalMs must be an integer between 100 and 5000 for rh_lighter_orderbook (got ${intervalMs}). ` +
        'Leave it out for one book a second.',
    );
    expect(send).not.toHaveBeenCalled();
  });

  it.each(['rh_lighter_trades', 'rh_lighter_open_interest', 'rh_lighter_funding'] as WsChannel[])(
    'rejects intervalMs on %s naming the Robinhood Chain book channel',
    (channel) => {
      const { ws, send } = openClient();

      expect(() => ws.subscribe(channel, 'BTC', { intervalMs: 250 })).toThrow(RH_LIGHTER_INTERVAL_CHANNEL_ERROR);
      expect(send).not.toHaveBeenCalled();
    },
  );

  it('keeps the mainnet interval error for non-Robinhood channels', () => {
    const { ws } = openClient();

    expect(() => ws.subscribe('lighter_trades', 'BTC', { intervalMs: 250 })).toThrow(LIGHTER_INTERVAL_CHANNEL_ERROR);
    expect(() => ws.subscribe('orderbook', 'BTC', { intervalMs: 250 })).toThrow(LIGHTER_INTERVAL_CHANNEL_ERROR);
  });

  it('subscribeRhLighter accepts short and full channel names', () => {
    const { ws, send } = openClient();

    ws.subscribeRhLighter('orderbook', 'BTC', { intervalMs: 500 });
    ws.subscribeRhLighter('trades', 'AAPL-USDG');
    ws.subscribeRhLighter('open_interest', 'BTC');
    ws.subscribeRhLighter('rh_lighter_funding', 'BTC');
    ws.unsubscribeRhLighter('trades', 'AAPL-USDG');
    ws.unsubscribeRhLighter('rh_lighter_orderbook', 'BTC');

    expect(sent(send)).toEqual([
      { op: 'subscribe', channel: 'rh_lighter_orderbook', symbol: 'BTC', interval_ms: 500 },
      { op: 'subscribe', channel: 'rh_lighter_trades', symbol: 'AAPL-USDG' },
      { op: 'subscribe', channel: 'rh_lighter_open_interest', symbol: 'BTC' },
      { op: 'subscribe', channel: 'rh_lighter_funding', symbol: 'BTC' },
      { op: 'unsubscribe', channel: 'rh_lighter_trades', symbol: 'AAPL-USDG' },
      { op: 'unsubscribe', channel: 'rh_lighter_orderbook', symbol: 'BTC' },
    ]);
    expect((ws as any).subscriptions.size).toBe(2);
  });

  it('treats Robinhood Chain symbols case-insensitively and apart from mainnet', async () => {
    const { ws, socket } = await connectedClient((client) => {
      client.subscribe('rh_lighter_orderbook', 'aapl-usdg', { intervalMs: 250 });
      client.subscribe('rh_lighter_orderbook', 'AAPL-USDG', { intervalMs: 1000 });
      client.subscribe('lighter_orderbook', 'BTC');
      client.subscribe('rh_lighter_orderbook', 'BTC');
      client.subscribe('rh_lighter_trades', 'eth');
      client.unsubscribe('rh_lighter_trades', 'ETH');
    });

    expect((ws as any).subscriptions.size).toBe(3);
    expect(socket.sent).toEqual([
      { op: 'subscribe', channel: 'rh_lighter_orderbook', symbol: 'AAPL-USDG', interval_ms: 1000 },
      { op: 'subscribe', channel: 'lighter_orderbook', symbol: 'BTC' },
      { op: 'subscribe', channel: 'rh_lighter_orderbook', symbol: 'BTC' },
    ]);
    ws.disconnect();
  });
});

describe('Live Lighter on Robinhood Chain dispatch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('delivers Robinhood Chain books, trades and stats to their own handlers only', async () => {
    const books: Array<[string, LighterLiveOrderbook]> = [];
    const legs: LighterLiveTrade[][] = [];
    const stats: Array<[string, string, LighterLiveStats]> = [];
    const mainnetBooks = vi.fn();
    const mainnetTrades = vi.fn();
    const mainnetStats = vi.fn();
    const genericBooks = vi.fn();
    const genericTrades = vi.fn();
    const { ws, socket } = await connectedClient((client) => {
      client.onRhLighterOrderbook((coin, book) => books.push([coin, book]));
      client.onRhLighterTrades((_coin, data) => legs.push(data));
      client.onRhLighterStats((channel, coin, data) => stats.push([channel, coin, data]));
      client.onLighterOrderbook(mainnetBooks);
      client.onLighterTrades(mainnetTrades);
      client.onLighterStats(mainnetStats);
      client.onOrderbook(genericBooks);
      client.onTrades(genericTrades);
    });

    socket.receive(RH_BOOK);
    socket.receive(RH_TRADES);
    socket.receive({ type: 'data', channel: 'rh_lighter_open_interest', coin: 'BTC', symbol: 'BTC', data: RH_STATS });
    socket.receive({ type: 'data', channel: 'rh_lighter_funding', coin: 'BTC', symbol: 'BTC', data: RH_STATS });

    expect(books).toEqual([['AAPL-USDG', RH_BOOK.data]]);
    expect(legs).toEqual([RH_TRADES.data]);
    expect(stats.map(([channel, coin]) => [channel, coin])).toEqual([
      ['rh_lighter_open_interest', 'BTC'],
      ['rh_lighter_funding', 'BTC'],
    ]);
    expect(stats[0]![2].ctx.openInterest).toBe('1250.5');
    for (const handler of [mainnetBooks, mainnetTrades, mainnetStats, genericBooks, genericTrades]) {
      expect(handler).not.toHaveBeenCalled();
    }
    ws.disconnect();
  });

  it('converts Robinhood Chain data for onOrderbook and onTrades without dedicated handlers', async () => {
    const books: OrderBook[] = [];
    const trades: Trade[][] = [];
    const { ws, socket } = await connectedClient((client) => {
      client.onOrderbook((_coin, book) => books.push(book));
      client.onTrades((_coin, data) => trades.push(data));
    });

    socket.receive(RH_BOOK);
    socket.receive(RH_TRADES);

    expect(books[0]).toMatchObject({ coin: 'AAPL-USDG', bids: [{ px: '231.12' }], asks: [{ px: '231.18' }] });
    expect(trades[0]).toHaveLength(2);
    expect(trades[0]![0]).toMatchObject({ side: 'A', tradeId: 77, accountIndex: '9001', crossed: false });
    expect(trades[0]![1]).toMatchObject({ side: 'B', accountIndex: '9002', crossed: true });
    ws.disconnect();
  });

  it('validates Robinhood Chain envelopes and acks', () => {
    for (const frame of [
      RH_BOOK,
      RH_TRADES,
      { type: 'subscribed', channel: 'rh_lighter_trades', coin: 'BTC', symbol: 'BTC' },
      { type: 'unsubscribed', channel: 'rh_lighter_funding', coin: 'BTC', symbol: 'BTC' },
      { type: 'replay_started', channel: 'rh_lighter_candles', coin: 'BTC', start: 1, end: 2, speed: 1 },
      { type: 'historical_data', channel: 'rh_lighter_trades', coin: 'BTC', timestamp: 1, data: {} },
    ]) {
      expect(WsServerMessageSchema.safeParse(frame).success).toBe(true);
    }
  });
});
