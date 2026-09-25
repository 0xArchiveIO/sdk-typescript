/**
 * WebSocket client for 0xarchive real-time streaming and historical replay.
 * For large historical downloads, use the S3 Parquet bulk export at
 * https://www.0xarchive.io/data.
 *
 * @example Real-time streaming
 * ```typescript
 * const ws = new OxArchiveWs({ apiKey: 'ox_...' });
 * await ws.connect();
 * ws.onOrderbook((coin, ob) => console.log(`${coin}: ${ob.midPrice}`));
 * ws.subscribeOrderbook('BTC');
 * ```
 *
 * @example Live Lighter.xyz data
 * ```typescript
 * const ws = new OxArchiveWs({ apiKey: 'ox_...' });
 * ws.onLighterOrderbook((coin, book) => console.log(coin, book.levels[0][0]?.px));
 * await ws.connect();
 * ws.subscribeLighter('orderbook', 'BTC', { intervalMs: 250 });
 * ```
 *
 * @example Historical replay (like Tardis.dev)
 * ```typescript
 * const ws = new OxArchiveWs({ apiKey: 'ox_...' });
 * ws.onHistoricalData((coin, timestamp, data) => {
 *   console.log(`${new Date(timestamp)}: ${data.mid_price}`);
 * });
 * await ws.connect();
 * ws.replay('orderbook', 'BTC', {
 *   start: Date.now() - 86400000,
 *   end: Date.now(),
 *   speed: 10 // 10x speed
 * });
 * ```
 */

import type {
  WsOptions,
  WsChannel,
  WsClientMessage,
  WsServerMessage,
  WsReplay,
  WsStandardReplayChannel,
  WsStandardReplayOptions,
  WsCoreL4ReplayOptions,
  HyperliquidCoreL4Channel,
  HyperliquidL4LiveOnlyChannel,
  LighterLiveChannel,
  LighterReplayOnlyChannel,
  LighterLiveOrderbook,
  LighterLiveTrade,
  LighterLiveStats,
  WsSubscribe,
  WsSubscribeOptions,
  WsConnectionState,
  WsEventHandlers,
  OrderBook,
  OrderbookDelta,
  PriceLevel,
  Trade,
  WsHistoricalData,
  WsHistoricalTickData,
  WsHistoricalBatch,
  WsReplayStarted,
  WsReplayCompleted,
  WsReplaySnapshot,
  WsStreamStarted,
  WsStreamCompleted,
  WsStreamProgress,
  WsGapDetected,
  WsOutcomeSettled,
} from './types';

const DEFAULT_WS_URL = 'wss://api.0xarchive.io/ws';
const DEFAULT_PING_INTERVAL = 30000; // 30 seconds
const DEFAULT_RECONNECT_DELAY = 1000;
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 10;

/** Every Lighter channel. All six support historical replay. */
export const LIGHTER_REPLAY_CHANNELS: ReadonlySet<WsChannel> = new Set([
  'lighter_orderbook',
  'lighter_trades',
  'lighter_candles',
  'lighter_open_interest',
  'lighter_funding',
  'lighter_l3_orderbook',
]);

/** Lighter channels that also accept live subscriptions. */
export const LIGHTER_LIVE_CHANNELS: ReadonlySet<LighterLiveChannel> = new Set([
  'lighter_orderbook',
  'lighter_trades',
  'lighter_open_interest',
  'lighter_funding',
]);

/** Lighter channels that support historical replay only. */
export const LIGHTER_REPLAY_ONLY_CHANNELS: ReadonlySet<LighterReplayOnlyChannel> = new Set([
  'lighter_candles',
  'lighter_l3_orderbook',
]);

export const LIGHTER_SUBSCRIPTION_ERROR =
  'lighter_candles and lighter_l3_orderbook support replay, not live subscriptions. ' +
  'Use REST for current data or a replay request for stored history. Live Lighter ' +
  'subscriptions are available on lighter_orderbook, lighter_trades, ' +
  'lighter_open_interest and lighter_funding.';

/** Smallest `intervalMs` accepted for a `lighter_orderbook` subscription. */
export const LIGHTER_BOOK_INTERVAL_MIN_MS = 100;
/** Largest `intervalMs` accepted for a `lighter_orderbook` subscription. */
export const LIGHTER_BOOK_INTERVAL_MAX_MS = 5000;

export const LIGHTER_INTERVAL_CHANNEL_ERROR = 'intervalMs is only supported on lighter_orderbook.';

export const HYPERLIQUID_L4_LIVE_ONLY_REPLAY_ERROR =
  'Hyperliquid HIP-3, HIP-4, and Spot L4 channels support live subscriptions only; replay is unavailable.';

export const HYPERLIQUID_CORE_L4_REPLAY_CHANNELS: ReadonlySet<HyperliquidCoreL4Channel> = new Set([
  'l4_diffs',
  'l4_orders',
]);

export const HYPERLIQUID_L4_LIVE_ONLY_CHANNELS: ReadonlySet<HyperliquidL4LiveOnlyChannel> = new Set([
  'hip3_l4_diffs',
  'hip3_l4_orders',
  'hip4_l4_diffs',
  'hip4_l4_orders',
  'spot_l4_diffs',
  'spot_l4_orders',
]);

function validateLiveSubscription(channel: WsChannel, options?: WsSubscribeOptions): void {
  if (LIGHTER_REPLAY_ONLY_CHANNELS.has(channel as LighterReplayOnlyChannel)) {
    throw new Error(LIGHTER_SUBSCRIPTION_ERROR);
  }
  const intervalMs = options?.intervalMs;
  // `== null` also treats an explicit null from JavaScript callers as omitted.
  if (intervalMs == null) {
    return;
  }
  if (channel !== 'lighter_orderbook') {
    throw new Error(LIGHTER_INTERVAL_CHANNEL_ERROR);
  }
  if (
    !Number.isInteger(intervalMs) ||
    intervalMs < LIGHTER_BOOK_INTERVAL_MIN_MS ||
    intervalMs > LIGHTER_BOOK_INTERVAL_MAX_MS
  ) {
    throw new Error(
      `intervalMs must be an integer between ${LIGHTER_BOOK_INTERVAL_MIN_MS} and ` +
        `${LIGHTER_BOOK_INTERVAL_MAX_MS} for lighter_orderbook (got ${intervalMs}). ` +
        'Leave it out for one book a second.',
    );
  }
}

/** A live subscription the client re-sends after a reconnect. */
interface StoredSubscription {
  channel: WsChannel;
  coin?: string;
  intervalMs?: number;
}

/** Short and full channel names accepted by `subscribeLighter`. */
type LighterLiveChannelInput =
  | 'orderbook' | 'trades' | 'open_interest' | 'funding'
  | LighterLiveChannel;

function lighterLiveChannel(channel: LighterLiveChannelInput): LighterLiveChannel {
  return (channel.startsWith('lighter_') ? channel : `lighter_${channel}`) as LighterLiveChannel;
}

function validateReplayChannel(channel: WsChannel, end?: number): void {
  if (HYPERLIQUID_L4_LIVE_ONLY_CHANNELS.has(channel as HyperliquidL4LiveOnlyChannel)) {
    throw new Error(HYPERLIQUID_L4_LIVE_ONLY_REPLAY_ERROR);
  }
  if (HYPERLIQUID_CORE_L4_REPLAY_CHANNELS.has(channel as HyperliquidCoreL4Channel) && end === undefined) {
    throw new Error('Hyperliquid core L4 replay requires an explicit end timestamp.');
  }
}

// Server idle timeout is 60 seconds. The SDK sends pings every 30 seconds
// to keep the connection alive. Browser WebSocket API automatically responds
// to WebSocket protocol-level ping frames from the server.

/**
 * Transform raw Hyperliquid trade format to SDK Trade type.
 * Raw format: { px, sz, side, time, hash, tid, users: [maker, taker] }
 * SDK format: { coin, side, price, size, timestamp, tx_hash, trade_id, maker_address, taker_address }
 */
function transformTrade(coin: string, raw: Record<string, unknown>): Trade {
  // Check if already in SDK format (from REST API or historical replay)
  if ('price' in raw && 'size' in raw) {
    return raw as unknown as Trade;
  }

  // Transform from Hyperliquid raw format
  const px = raw.px as string | undefined;
  const sz = raw.sz as string | undefined;
  const side = raw.side as string | undefined;
  const time = raw.time as number | undefined;
  const hash = raw.hash as string | undefined;
  const tid = raw.tid as number | undefined;

  // Extract user addresses from the users array (market-level WebSocket trades)
  // users[0] = maker address, users[1] = taker address
  const users = raw.users as string[] | undefined;
  const maker_address = users && users.length > 0 ? users[0] : undefined;
  const taker_address = users && users.length > 1 ? users[1] : undefined;

  // Also check for user_address field (for historical replay data)
  const user_address = raw.userAddress as string | undefined ?? raw.user_address as string | undefined;

  return {
    coin,
    side: (side === 'A' || side === 'B' ? side : 'B') as 'A' | 'B',
    price: px ?? '0',
    size: sz ?? '0',
    timestamp: time ? new Date(time).toISOString() : new Date().toISOString(),
    txHash: hash,
    tradeId: tid,
    makerAddress: maker_address,
    takerAddress: taker_address,
    userAddress: user_address,
  };
}

/**
 * Transform an array of raw Hyperliquid trades to SDK Trade types.
 */
function transformTrades(coin: string, rawTrades: unknown): Trade[] {
  if (!Array.isArray(rawTrades)) {
    // Single trade object
    return [transformTrade(coin, rawTrades as Record<string, unknown>)];
  }
  return rawTrades.map((raw) => transformTrade(coin, raw as Record<string, unknown>));
}

/**
 * Transform one live Lighter fill leg to the SDK Trade type. Each leg carries
 * one account (`users[0]`, a Lighter account index), so it maps to
 * `accountIndex` rather than to maker/taker addresses. Fields the live stream
 * does not carry (fee, fee token, closed PnL, direction) are left out.
 */
function transformLighterLiveTrade(coin: string, raw: LighterLiveTrade): Trade {
  const trade: Trade = {
    coin,
    side: raw.side === 'A' ? 'A' : 'B',
    price: raw.px ?? '0',
    size: raw.sz ?? '0',
    timestamp: typeof raw.time === 'number' ? new Date(raw.time).toISOString() : new Date().toISOString(),
  };
  if (typeof raw.tid === 'number') trade.tradeId = raw.tid;
  if (typeof raw.hash === 'string') trade.txHash = raw.hash;
  if (typeof raw.oid === 'number') trade.orderId = raw.oid;
  if (typeof raw.crossed === 'boolean') trade.crossed = raw.crossed;
  if (typeof raw.start_position === 'string') trade.startPosition = raw.start_position;
  if (Array.isArray(raw.users) && typeof raw.users[0] === 'string') trade.accountIndex = raw.users[0];
  return trade;
}

/** Normalise a live `lighter_trades` payload to an array of fill legs. */
function lighterLiveTrades(data: unknown): LighterLiveTrade[] {
  if (Array.isArray(data)) return data as LighterLiveTrade[];
  return data ? [data as LighterLiveTrade] : [];
}

/**
 * Transform raw Hyperliquid orderbook format to SDK OrderBook type.
 * Raw format: { coin, levels: [[{px, sz, n}, ...], [{px, sz, n}, ...]], time }
 * SDK format: { coin, timestamp, bids: [{px, sz, n}], asks: [{px, sz, n}], mid_price, spread, spread_bps }
 */
function transformOrderbook(coin: string, raw: Record<string, unknown>): OrderBook {
  // Check if already in SDK format (from REST API or historical replay)
  if ('bids' in raw && 'asks' in raw) {
    return raw as unknown as OrderBook;
  }

  // Transform from Hyperliquid raw format
  // levels is [[{px, sz, n}, ...], [{px, sz, n}, ...]] where [0]=bids, [1]=asks
  const levels = raw.levels as Array<Array<{ px: string; sz: string; n: number }>> | undefined;
  const time = raw.time as number | undefined;

  const bids: PriceLevel[] = [];
  const asks: PriceLevel[] = [];

  if (levels && levels.length >= 2) {
    // levels[0] = bids, levels[1] = asks
    // Each level is already {px, sz, n} object
    for (const level of levels[0] || []) {
      bids.push({ px: level.px, sz: level.sz, n: level.n });
    }
    for (const level of levels[1] || []) {
      asks.push({ px: level.px, sz: level.sz, n: level.n });
    }
  }

  // Calculate mid price and spread
  let midPrice: string | undefined;
  let spread: string | undefined;
  let spreadBps: string | undefined;

  if (bids.length > 0 && asks.length > 0) {
    const bestBid = parseFloat(bids[0].px);
    const bestAsk = parseFloat(asks[0].px);
    const mid = (bestBid + bestAsk) / 2;
    midPrice = mid.toString();
    spread = (bestAsk - bestBid).toString();
    spreadBps = ((bestAsk - bestBid) / mid * 10000).toFixed(2);
  }

  return {
    coin,
    timestamp: time ? new Date(time).toISOString() : new Date().toISOString(),
    bids,
    asks,
    midPrice,
    spread,
    spreadBps,
  };
}

/**
 * WebSocket client for supported live data and historical replay.
 *
 * Live subscriptions cover Hyperliquid channels and four Lighter.xyz channels
 * (`lighter_orderbook`, `lighter_trades`, `lighter_open_interest`,
 * `lighter_funding`). `lighter_candles` and `lighter_l3_orderbook` are
 * replay-only.
 *
 * **Keep-Alive:** The server sends WebSocket ping frames every 30 seconds
 * and will disconnect idle connections after 60 seconds. This SDK automatically
 * handles keep-alive by sending application-level pings at the configured interval
 * (default: 30 seconds). The browser WebSocket API automatically responds to
 * server ping frames.
 */
export class OxArchiveWs {
  private ws: WebSocket | null = null;
  private options: Required<WsOptions>;
  private handlers: WsEventHandlers = {};
  private subscriptions: Map<string, StoredSubscription> = new Map();
  private state: WsConnectionState = 'disconnected';
  private reconnectAttempts = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  // Typed event handlers (separate from WsEventHandlers to avoid wrapping issues)
  private historicalDataHandlers: Array<(coin: string, timestamp: number, data: unknown) => void> = [];
  private historicalTickDataHandlers: Array<(coin: string, checkpoint: OrderBook, deltas: OrderbookDelta[]) => void> = [];
  private batchHandlers: Array<(coin: string, records: Array<{ timestamp: number; data: unknown }>) => void> = [];
  private replayStartHandlers: Array<(channel: WsChannel, coin: string, start: number, end: number, speed: number) => void> = [];
  private replayCompleteHandlers: Array<(channel: WsChannel, coin: string, snapshotsSent: number) => void> = [];
  private replaySnapshotHandlers: Array<(channel: WsChannel, coin: string, timestamp: number, data: unknown) => void> = [];
  private streamStartHandlers: Array<(channel: WsChannel, coin: string, start: number, end: number) => void> = [];
  private streamProgressHandlers: Array<(snapshotsSent: number) => void> = [];
  private streamCompleteHandlers: Array<(channel: WsChannel, coin: string, snapshotsSent: number) => void> = [];
  private orderbookHandlers: Array<(coin: string, data: OrderBook) => void> = [];
  private tradesHandlers: Array<(coin: string, data: Trade[]) => void> = [];
  private liquidationsHandlers: Array<(channel: WsChannel, coin: string, data: Trade[]) => void> = [];
  private gapHandlers: Array<(channel: WsChannel, coin: string, gapStart: number, gapEnd: number, durationMinutes: number) => void> = [];
  private outcomeSettledHandlers: Array<(coin: string, outcomeId: number, side: number, settlementValue?: number, settlementAt?: string) => void> = [];
  private lighterOrderbookHandlers: Array<(coin: string, data: LighterLiveOrderbook) => void> = [];
  private lighterTradesHandlers: Array<(coin: string, data: LighterLiveTrade[]) => void> = [];
  private lighterStatsHandlers: Array<(channel: 'lighter_open_interest' | 'lighter_funding', coin: string, data: LighterLiveStats) => void> = [];

  constructor(options: WsOptions) {
    this.options = {
      apiKey: options.apiKey,
      wsUrl: options.wsUrl ?? DEFAULT_WS_URL,
      autoReconnect: options.autoReconnect ?? true,
      reconnectDelay: options.reconnectDelay ?? DEFAULT_RECONNECT_DELAY,
      maxReconnectAttempts: options.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS,
      pingInterval: options.pingInterval ?? DEFAULT_PING_INTERVAL,
    };
  }

  /**
   * Connect to the WebSocket server
   *
   * @returns Promise that resolves when connected
   * @example
   * ```typescript
   * await ws.connect();
   * ws.subscribeOrderbook('BTC');
   * ```
   */
  connect(handlers?: WsEventHandlers): Promise<void> {
    if (handlers) {
      this.handlers = handlers;
    }

    this.setState('connecting');

    return new Promise((resolve, reject) => {
      const url = `${this.options.wsUrl}?apiKey=${encodeURIComponent(this.options.apiKey)}`;
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.setState('connected');
        this.startPing();
        this.resubscribe();
        this.handlers.onOpen?.();
        resolve();
      };

      this.ws.onclose = (event) => {
        this.stopPing();
        const wasConnecting = this.state === 'connecting';
        this.handlers.onClose?.(event.code, event.reason);

        // If initial connection failed, reject and don't auto-reconnect
        if (wasConnecting) {
          this.setState('disconnected');
          reject(new Error(`WebSocket closed before connecting (code: ${event.code})`));
          return;
        }

        // Only auto-reconnect if we were previously connected
        if (this.options.autoReconnect && this.state !== 'disconnected') {
          this.scheduleReconnect();
        } else {
          this.setState('disconnected');
        }
      };

      this.ws.onerror = () => {
        const error = new Error('WebSocket connection error');
        this.handlers.onError?.(error);
        // Note: onerror is usually followed by onclose, which will reject the promise
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WsServerMessage;
          this.handleMessage(message);
        } catch {
          // Ignore parse errors for malformed messages
        }
      };
    });
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): void {
    this.setState('disconnected');
    this.stopPing();
    this.clearReconnectTimer();

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
  }

  /**
   * Subscribe to a supported live channel.
   *
   * Live Lighter subscriptions are available on `lighter_orderbook`,
   * `lighter_trades`, `lighter_open_interest` and `lighter_funding`.
   * `lighter_candles` and `lighter_l3_orderbook` are replay-only and throw
   * here; use REST for current data or a bounded replay for stored history.
   *
   * @param channel - Channel to subscribe to
   * @param coin - Symbol (e.g. 'BTC'); Lighter symbols are case-insensitive
   * @param options - `intervalMs` sets the book rate for `lighter_orderbook`
   *   only (100 to 5000 ms, default one book a second)
   * @throws Error for a replay-only Lighter channel, or an `intervalMs` on
   *   another channel or outside 100 to 5000
   */
  subscribe(channel: WsChannel, coin?: string, options?: WsSubscribeOptions): void {
    validateLiveSubscription(channel, options);
    const subscription: StoredSubscription = { channel, coin };
    if (options?.intervalMs != null) {
      subscription.intervalMs = options.intervalMs;
    }
    // A repeat subscribe to the same channel and symbol replaces the stored
    // options, so a reconnect re-sends the latest interval.
    this.subscriptions.set(this.subscriptionKey(channel, coin), subscription);

    if (this.isConnected()) {
      this.send(this.subscribeMessage(subscription));
    }
  }

  /**
   * Subscribe to order book updates for a coin
   */
  subscribeOrderbook(coin: string): void {
    this.subscribe('orderbook', coin);
  }

  /**
   * Subscribe to trades for a coin
   */
  subscribeTrades(coin: string): void {
    this.subscribe('trades', coin);
  }

  /**
   * Subscribe to ticker updates for a coin
   */
  subscribeTicker(coin: string): void {
    this.subscribe('ticker', coin);
  }

  /**
   * Subscribe to all tickers
   */
  subscribeAllTickers(): void {
    this.subscribe('all_tickers');
  }

  /**
   * Unsubscribe from a channel
   */
  unsubscribe(channel: WsChannel, coin?: string): void {
    const key = this.subscriptionKey(channel, coin);
    this.subscriptions.delete(key);

    if (this.isConnected()) {
      this.send({ op: 'unsubscribe', channel, symbol: coin });
    }
  }

  /**
   * Unsubscribe from order book updates for a coin
   */
  unsubscribeOrderbook(coin: string): void {
    this.unsubscribe('orderbook', coin);
  }

  /**
   * Unsubscribe from trades for a coin
   */
  unsubscribeTrades(coin: string): void {
    this.unsubscribe('trades', coin);
  }

  /**
   * Unsubscribe from ticker updates for a coin
   */
  unsubscribeTicker(coin: string): void {
    this.unsubscribe('ticker', coin);
  }

  /**
   * Unsubscribe from all tickers
   */
  unsubscribeAllTickers(): void {
    this.unsubscribe('all_tickers');
  }

  /**
   * Subscribe to live liquidation events for a coin (Hyperliquid).
   *
   * Each message is a fill row with `is_liquidation: true`. Same wire shape as
   * trades. Live as of v1.6.0 (Hyperliquid + HIP-3 nodes); historical replay
   * also supported via `replay('liquidations', ...)`.
   */
  subscribeLiquidations(coin: string): void {
    this.subscribe('liquidations', coin);
  }

  /** Unsubscribe from live liquidation events (Hyperliquid). */
  unsubscribeLiquidations(coin: string): void {
    this.unsubscribe('liquidations', coin);
  }

  /**
   * Subscribe to live HIP-3 liquidation events for a coin.
   * Each message is a fill row with `is_liquidation: true`.
   */
  subscribeHip3Liquidations(coin: string): void {
    this.subscribe('hip3_liquidations', coin);
  }

  /** Unsubscribe from live HIP-3 liquidation events. */
  unsubscribeHip3Liquidations(coin: string): void {
    this.unsubscribe('hip3_liquidations', coin);
  }

  /**
   * Subscribe to a Hyperliquid Spot channel for a given dashed pair.
   *
   * @param channel One of `spot_orderbook`, `spot_trades`, `spot_l4_diffs`,
   *   `spot_l4_orders`, `spot_twap`. The short form (e.g. `'orderbook'`) is
   *   also accepted and the `spot_` prefix is added automatically.
   * @param coin Spot dashed canonical symbol (e.g. `'HYPE-USDC'`).
   */
  subscribeSpot(
    channel:
      | 'orderbook' | 'trades' | 'l4_diffs' | 'l4_orders' | 'twap'
      | 'spot_orderbook' | 'spot_trades' | 'spot_l4_diffs' | 'spot_l4_orders' | 'spot_twap',
    coin: string,
  ): void {
    const fullChannel = (channel.startsWith('spot_') ? channel : `spot_${channel}`) as WsChannel;
    this.subscribe(fullChannel, coin);
  }

  /** Unsubscribe from a Hyperliquid Spot channel for a given dashed pair.
   * Accepts the short form (`'orderbook'`) or the full form (`'spot_orderbook'`). */
  unsubscribeSpot(
    channel:
      | 'orderbook' | 'trades' | 'l4_diffs' | 'l4_orders' | 'twap'
      | 'spot_orderbook' | 'spot_trades' | 'spot_l4_diffs' | 'spot_l4_orders' | 'spot_twap',
    coin: string,
  ): void {
    const fullChannel = (channel.startsWith('spot_') ? channel : `spot_${channel}`) as WsChannel;
    this.unsubscribe(fullChannel, coin);
  }

  /**
   * Subscribe to a live Lighter.xyz channel.
   *
   * @param channel One of `orderbook`, `trades`, `open_interest`, `funding`
   *   (or the full `lighter_*` form). Candles and L3 are replay-only.
   * @param symbol Lighter symbol, as listed by `client.lighter.instruments.list()`
   *   (case-insensitive; the server echoes it uppercase).
   * @param options `intervalMs` for `orderbook` only: send the newest book at
   *   most once per 100 to 5000 ms (default 1000).
   *
   * @example
   * ```typescript
   * ws.onLighterOrderbook((coin, book) => console.log(coin, book.levels[0][0]?.px));
   * ws.subscribeLighter('orderbook', 'BTC', { intervalMs: 250 });
   * ws.subscribeLighter('trades', 'BTC');
   * ```
   */
  subscribeLighter(
    channel: LighterLiveChannelInput,
    symbol: string,
    options?: WsSubscribeOptions,
  ): void {
    this.subscribe(lighterLiveChannel(channel), symbol, options);
  }

  /** Unsubscribe from a live Lighter.xyz channel. Accepts the short form
   * (`'orderbook'`) or the full form (`'lighter_orderbook'`). */
  unsubscribeLighter(channel: LighterLiveChannelInput, symbol: string): void {
    this.unsubscribe(lighterLiveChannel(channel), symbol);
  }

  /**
   * Subscribe to a HIP-4 channel for a given outcome coin.
   *
   * @param channel One of `hip4_orderbook`, `hip4_trades`, `hip4_open_interest`,
   *   `hip4_l4_diffs`, `hip4_l4_orders`.
   * @param coin HIP-4 coin (e.g. `'#0'` or `'0'`). The bare numeric form is
   *   recommended; both are accepted by the backend.
   */
  subscribeHip4(
    channel:
      | 'orderbook' | 'trades' | 'open_interest' | 'l4_diffs' | 'l4_orders'
      | 'hip4_orderbook' | 'hip4_trades' | 'hip4_open_interest' | 'hip4_l4_diffs' | 'hip4_l4_orders',
    coin: string
  ): void {
    const fullChannel = (channel.startsWith('hip4_') ? channel : `hip4_${channel}`) as WsChannel;
    this.subscribe(fullChannel, coin);
  }

  /** Unsubscribe from a HIP-4 channel for a given outcome coin. Accepts the
   * short channel form (`'orderbook'`) or the full form (`'hip4_orderbook'`). */
  unsubscribeHip4(
    channel:
      | 'orderbook' | 'trades' | 'open_interest' | 'l4_diffs' | 'l4_orders'
      | 'hip4_orderbook' | 'hip4_trades' | 'hip4_open_interest' | 'hip4_l4_diffs' | 'hip4_l4_orders',
    coin: string
  ): void {
    const fullChannel = (channel.startsWith('hip4_') ? channel : `hip4_${channel}`) as WsChannel;
    this.unsubscribe(fullChannel, coin);
  }

  // ==========================================================================
  // Historical Replay (Option B) - Like Tardis.dev
  // ==========================================================================

  /**
   * Start historical replay with timing preserved.
   * All six Lighter channels support replay. Replay rows keep their existing
   * shapes, which differ from the live Lighter payloads.
   *
   * @param channel - Data channel to replay
   * @param coin - Trading pair (e.g., 'BTC', 'ETH')
   * @param options - Replay options
   *
   * @example
   * ```typescript
   * ws.replay('orderbook', 'BTC', {
   *   start: Date.now() - 86400000, // 24 hours ago
   *   end: Date.now(),
   *   speed: 10 // 10x faster than real-time
   * });
   * ```
   */
  replay(
    channel: HyperliquidCoreL4Channel,
    coin: string,
    options: WsCoreL4ReplayOptions,
  ): void;
  replay(
    channel: WsStandardReplayChannel,
    coin: string,
    options: WsStandardReplayOptions,
  ): void;
  replay(
    channel: WsChannel,
    coin: string,
    options: {
      start: number;
      end?: number;
      speed?: number;
      granularity?: string;
      /** Candle interval for candles channel (1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w) */
      interval?: string;
    },
  ): void {
    validateReplayChannel(channel, options.end);
    this.send({
      op: 'replay',
      channel,
      symbol: coin,
      start: options.start,
      end: options.end,
      speed: options.speed ?? 1,
      granularity: options.granularity,
      interval: options.interval,
    } as WsReplay);
  }

  /**
   * Start a multi-channel historical replay with timing preserved.
   * Data from all channels is interleaved chronologically. Before the timeline
   * begins, `replay_snapshot` messages provide initial state for each channel.
   *
   * @param channels - Array of data channels to replay simultaneously
   * @param coin - Trading pair (e.g., 'BTC', 'ETH')
   * @param options - Replay options
   *
   * @example
   * ```typescript
   * ws.onReplaySnapshot((channel, coin, timestamp, data) => {
   *   console.log(`Initial ${channel} state at ${new Date(timestamp).toISOString()}`);
   * });
   * ws.onHistoricalData((coin, timestamp, data) => {
   *   // Interleaved data from all channels
   * });
   * ws.multiReplay(['orderbook', 'trades', 'funding'], 'BTC', {
   *   start: Date.now() - 86400000,
   *   speed: 10
   * });
   * ```
   */
  multiReplay(
    channels: WsStandardReplayChannel[],
    coin: string,
    options: WsStandardReplayOptions,
  ): void {
    for (const channel of channels) {
      validateReplayChannel(channel, options.end);
    }
    this.send({
      op: 'replay',
      channels,
      symbol: coin,
      start: options.start,
      end: options.end,
      speed: options.speed ?? 1,
      granularity: options.granularity,
      interval: options.interval,
    });
  }

  /**
   * Pause the current replay
   */
  replayPause(): void {
    this.send({ op: 'replay.pause' });
  }

  /**
   * Resume a paused replay
   */
  replayResume(): void {
    this.send({ op: 'replay.resume' });
  }

  /**
   * Seek to a specific timestamp in the replay
   * @param timestamp - Unix timestamp in milliseconds
   */
  replaySeek(timestamp: number): void {
    this.send({ op: 'replay.seek', timestamp });
  }

  /**
   * Stop the current replay
   */
  replayStop(): void {
    this.send({ op: 'replay.stop' });
  }

  // ==========================================================================
  // Bulk Streaming (discontinued)
  // ==========================================================================

  /**
   * Request a bulk stream of historical data for one channel.
   *
   * @deprecated Bulk streaming has been discontinued on the server. This
   * method still sends the request, but the server replies with an `error`
   * message (delivered to `onMessage`) and sends no data. For large dataset
   * downloads, use the S3 Parquet bulk export at https://www.0xarchive.io/data.
   * For paced historical data over WebSocket, use `replay()`.
   *
   * @param channel - Data channel to stream
   * @param coin - Trading pair (e.g., 'BTC', 'ETH')
   * @param options - Stream options
   */
  stream(
    channel: WsChannel,
    coin: string,
    options: {
      start: number;
      end: number;
      batchSize?: number;
      granularity?: string;
      /** Candle interval for candles channel (1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w) */
      interval?: string;
    }
  ): void {
    this.send({
      op: 'stream',
      channel,
      symbol: coin,
      start: options.start,
      end: options.end,
      batch_size: options.batchSize ?? 1000,
      granularity: options.granularity,
      interval: options.interval,
    });
  }

  /**
   * Request a multi-channel bulk stream of historical data.
   *
   * @deprecated Bulk streaming has been discontinued on the server. This
   * method still sends the request, but the server replies with an `error`
   * message (delivered to `onMessage`) and sends no data. For large dataset
   * downloads, use the S3 Parquet bulk export at https://www.0xarchive.io/data.
   * For paced multi-channel history over WebSocket, use `multiReplay()`.
   *
   * @param channels - Array of data channels to stream simultaneously
   * @param coin - Trading pair (e.g., 'BTC', 'ETH')
   * @param options - Stream options
   */
  multiStream(
    channels: WsChannel[],
    coin: string,
    options: {
      start: number;
      end: number;
      batchSize?: number;
      granularity?: string;
      interval?: string;
    }
  ): void {
    this.send({
      op: 'stream',
      channels,
      symbol: coin,
      start: options.start,
      end: options.end,
      batch_size: options.batchSize ?? 1000,
      granularity: options.granularity,
      interval: options.interval,
    });
  }

  /**
   * Stop the current bulk stream.
   *
   * @deprecated Bulk streaming has been discontinued on the server, so there
   * is never an active stream to stop. The server replies with an `error`
   * message (delivered to `onMessage`). For large dataset downloads, use the
   * S3 Parquet bulk export at https://www.0xarchive.io/data.
   */
  streamStop(): void {
    this.send({ op: 'stream.stop' });
  }

  // ==========================================================================
  // Event Handlers for Replay
  // ==========================================================================

  /**
   * Handle historical data points (replay mode)
   */
  onHistoricalData<T = unknown>(
    handler: (coin: string, timestamp: number, data: T) => void
  ): void {
    this.historicalDataHandlers.push(handler as (coin: string, timestamp: number, data: unknown) => void);
  }

  /**
   * Handle historical tick data (granularity='tick' mode)
   * Receives a checkpoint (full orderbook) followed by incremental deltas.
   * This is for tick-level granularity on Lighter.xyz orderbook data.
   */
  onHistoricalTickData(
    handler: (coin: string, checkpoint: OrderBook, deltas: OrderbookDelta[]) => void
  ): void {
    this.historicalTickDataHandlers.push(handler);
  }

  /**
   * Handle batched data (bulk stream mode).
   *
   * @deprecated Bulk streaming has been discontinued on the server, so this
   * handler is never called. For large dataset downloads, use the S3 Parquet
   * bulk export at https://www.0xarchive.io/data.
   */
  onBatch<T = unknown>(
    handler: (coin: string, records: Array<{ timestamp: number; data: T }>) => void
  ): void {
    this.batchHandlers.push(handler as (coin: string, records: Array<{ timestamp: number; data: unknown }>) => void);
  }

  /**
   * Handle replay started event
   */
  onReplayStart(
    handler: (channel: WsChannel, coin: string, start: number, end: number, speed: number) => void
  ): void {
    this.replayStartHandlers.push(handler);
  }

  /**
   * Handle replay completed event
   */
  onReplayComplete(
    handler: (channel: WsChannel, coin: string, snapshotsSent: number) => void
  ): void {
    this.replayCompleteHandlers.push(handler);
  }

  /**
   * Handle replay snapshot events (multi-channel mode).
   * Called with the initial state for each channel before the replay
   * timeline begins. Use this to initialize local state (e.g., set the current
   * orderbook or latest funding rate) before `historical_data` messages start
   * arriving.
   *
   * @param handler - Callback receiving channel, coin, timestamp (ms), and data payload
   *
   * @example
   * ```typescript
   * ws.onReplaySnapshot((channel, coin, timestamp, data) => {
   *   if (channel === 'orderbook') {
   *     currentOrderbook = data;
   *   } else if (channel === 'funding') {
   *     currentFundingRate = data;
   *   }
   * });
   * ```
   */
  onReplaySnapshot<T = unknown>(
    handler: (channel: WsChannel, coin: string, timestamp: number, data: T) => void
  ): void {
    this.replaySnapshotHandlers.push(handler as (channel: WsChannel, coin: string, timestamp: number, data: unknown) => void);
  }

  /**
   * Handle stream started event.
   *
   * @deprecated Bulk streaming has been discontinued on the server, so this
   * handler is never called. For large dataset downloads, use the S3 Parquet
   * bulk export at https://www.0xarchive.io/data.
   */
  onStreamStart(
    handler: (channel: WsChannel, coin: string, start: number, end: number) => void
  ): void {
    this.streamStartHandlers.push(handler);
  }

  /**
   * Handle stream progress event.
   *
   * @deprecated Bulk streaming has been discontinued on the server, so this
   * handler is never called. For large dataset downloads, use the S3 Parquet
   * bulk export at https://www.0xarchive.io/data.
   */
  onStreamProgress(
    handler: (snapshotsSent: number) => void
  ): void {
    this.streamProgressHandlers.push(handler);
  }

  /**
   * Handle stream completed event.
   *
   * @deprecated Bulk streaming has been discontinued on the server, so this
   * handler is never called. For large dataset downloads, use the S3 Parquet
   * bulk export at https://www.0xarchive.io/data.
   */
  onStreamComplete(
    handler: (channel: WsChannel, coin: string, snapshotsSent: number) => void
  ): void {
    this.streamCompleteHandlers.push(handler);
  }

  /**
   * Handle gap detected events during replay.
   * Called when there's a gap in the historical data exceeding the threshold.
   * Thresholds: 2 minutes for orderbook/candles/liquidations, 60 minutes for trades.
   *
   * @param handler - Callback receiving channel, coin, gap start/end timestamps (ms), and duration (minutes)
   *
   * @example
   * ```typescript
   * ws.onGap((channel, coin, gapStart, gapEnd, durationMinutes) => {
   *   console.warn(`Gap detected in ${channel} ${coin}: ${durationMinutes} minutes`);
   *   console.warn(`  From: ${new Date(gapStart).toISOString()}`);
   *   console.warn(`  To:   ${new Date(gapEnd).toISOString()}`);
   * });
   * ```
   */
  onGap(
    handler: (channel: WsChannel, coin: string, gapStart: number, gapEnd: number, durationMinutes: number) => void
  ): void {
    this.gapHandlers.push(handler);
  }

  /**
   * Get current connection state
   */
  getState(): WsConnectionState {
    return this.state;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Set event handlers after construction
   */
  on<K extends keyof WsEventHandlers>(event: K, handler: WsEventHandlers[K]): void {
    this.handlers[event] = handler;
  }

  /**
   * Helper to handle typed orderbook data
   */
  onOrderbook(handler: (coin: string, data: OrderBook) => void): void {
    this.orderbookHandlers.push(handler);
  }

  /**
   * Helper to handle typed trade data
   */
  onTrades(handler: (coin: string, data: Trade[]) => void): void {
    this.tradesHandlers.push(handler);
  }

  /**
   * Helper to handle live liquidation events for both `liquidations` and
   * `hip3_liquidations` channels. Each item is a fill row with
   * `is_liquidation: true`, surfaced as a `Trade` (the wire shape matches
   * trades exactly).
   *
   * @param handler Called with the channel, coin, and parsed Trade array.
   *
   * @example
   * ```typescript
   * ws.onLiquidations((channel, coin, fills) => {
   *   for (const f of fills) {
   *     console.log(`${channel} ${coin} liq: ${f.side} ${f.size}@${f.price}`);
   *   }
   * });
   * ws.subscribeLiquidations('BTC');
   * ws.subscribeHip3Liquidations('hyna:BTC');
   * ```
   */
  onLiquidations(handler: (channel: WsChannel, coin: string, data: Trade[]) => void): void {
    this.liquidationsHandlers.push(handler);
  }

  /**
   * Handle live `lighter_orderbook` messages as published: a full book of up to
   * 20 levels per side (`levels[0]` bids, `levels[1]` asks, best first), not a
   * diff. While any `onLighterOrderbook` handler is registered, Lighter books
   * are not passed to `onOrderbook`, so Lighter `BTC` is not mixed with
   * Hyperliquid `BTC`. Without one, `onOrderbook` receives them converted to
   * `OrderBook`.
   */
  onLighterOrderbook(handler: (coin: string, data: LighterLiveOrderbook) => void): void {
    this.lighterOrderbookHandlers.push(handler);
  }

  /**
   * Handle live `lighter_trades` messages as published. Each trade arrives as
   * two legs (one per side) sharing `tid`: count trades by distinct `tid` and
   * sum volume over one leg per `tid`. `fee`, `fee_token`, `closed_pnl` and
   * `dir` are null in live messages; the finalized record with fees is served
   * by `client.lighter.trades.list()`. While any `onLighterTrades` handler is
   * registered, Lighter trades are not passed to `onTrades`; without one,
   * `onTrades` receives them converted to `Trade` (one entry per leg, with the
   * account index in `accountIndex`).
   *
   * @example
   * ```typescript
   * ws.onLighterTrades((coin, legs) => {
   *   const trades = new Set(legs.map((leg) => leg.tid)).size;
   *   console.log(`${coin}: ${trades} trades`);
   * });
   * ws.subscribeLighter('trades', 'BTC');
   * ```
   */
  onLighterTrades(handler: (coin: string, data: LighterLiveTrade[]) => void): void {
    this.lighterTradesHandlers.push(handler);
  }

  /**
   * Handle live `lighter_open_interest` and `lighter_funding` messages. Both
   * channels carry the same `{coin, ctx}` message; `channel` says which
   * subscription delivered it. `ctx.funding` and `ctx.premium` are fractions.
   */
  onLighterStats(
    handler: (channel: 'lighter_open_interest' | 'lighter_funding', coin: string, data: LighterLiveStats) => void
  ): void {
    this.lighterStatsHandlers.push(handler);
  }

  /**
   * Handle HIP-4 outcome settlement events. Pushed once per `(outcome_id, side)`
   * when the outcome flips to settled. After this event the server proactively
   * unsubscribes the client from every hip4_* subscription on the settled coin —
   * treat the event as a terminal signal for that coin.
   *
   * @example
   * ```typescript
   * ws.onOutcomeSettled((coin, outcomeId, side, value, at) => {
   *   console.log(`${coin} (outcome ${outcomeId} side ${side}) settled to ${value} at ${at}`);
   * });
   * ```
   */
  onOutcomeSettled(
    handler: (coin: string, outcomeId: number, side: number, settlementValue?: number, settlementAt?: string) => void
  ): void {
    this.outcomeSettledHandlers.push(handler);
  }

  // Private methods

  private send(message: WsClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private setState(state: WsConnectionState): void {
    this.state = state;
    this.handlers.onStateChange?.(state);
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      this.send({ op: 'ping' });
    }, this.options.pingInterval);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private subscriptionKey(channel: WsChannel, coin?: string): string {
    if (!coin) return channel;
    // Lighter symbols are case-insensitive on the server, so 'btc' and 'BTC'
    // are one subscription.
    const symbol = LIGHTER_REPLAY_CHANNELS.has(channel) ? coin.toUpperCase() : coin;
    return `${channel}:${symbol}`;
  }

  private subscribeMessage(subscription: StoredSubscription): WsSubscribe {
    // Wire field is `symbol`; `coin` is the deprecated alias kept on the
    // SDK surface for backward compatibility.
    const message: WsSubscribe = { op: 'subscribe', channel: subscription.channel, symbol: subscription.coin };
    if (subscription.intervalMs !== undefined) {
      message.interval_ms = subscription.intervalMs;
    }
    return message;
  }

  private resubscribe(): void {
    // Stored entries keep channel and symbol separately, so symbols that
    // contain ':' (HIP-3, e.g. 'km:US500') and Lighter book intervals survive
    // a reconnect intact.
    for (const subscription of this.subscriptions.values()) {
      this.send(this.subscribeMessage(subscription));
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      this.setState('disconnected');
      return;
    }

    this.setState('reconnecting');
    this.reconnectAttempts++;

    const delay = this.options.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(() => {
        // Reconnect attempt failed, schedule another attempt
        // (reconnectAttempts is already incremented, so this will eventually stop)
        if (this.reconnectAttempts < this.options.maxReconnectAttempts) {
          this.scheduleReconnect();
        }
      });
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private handleMessage(message: WsServerMessage): void {
    // Call the generic onMessage handler first
    this.handlers.onMessage?.(message);

    // Dispatch to typed handlers based on message type
    switch (message.type) {
      case 'historical_data': {
        const msg = message as WsHistoricalData;
        for (const handler of this.historicalDataHandlers) {
          handler(msg.coin, msg.timestamp, msg.data);
        }
        break;
      }
      case 'historical_tick_data': {
        const msg = message as WsHistoricalTickData;
        for (const handler of this.historicalTickDataHandlers) {
          handler(msg.coin, msg.checkpoint, msg.deltas);
        }
        break;
      }
      case 'historical_batch': {
        const msg = message as WsHistoricalBatch;
        for (const handler of this.batchHandlers) {
          handler(msg.coin, msg.data as Array<{ timestamp: number; data: unknown }>);
        }
        break;
      }
      case 'replay_started': {
        const msg = message as WsReplayStarted;
        for (const handler of this.replayStartHandlers) {
          handler(msg.channel, msg.coin, msg.start, msg.end, msg.speed);
        }
        break;
      }
      case 'replay_completed': {
        const msg = message as WsReplayCompleted;
        for (const handler of this.replayCompleteHandlers) {
          handler(msg.channel, msg.coin, msg.snapshots_sent);
        }
        break;
      }
      case 'replay_snapshot': {
        const msg = message as WsReplaySnapshot;
        for (const handler of this.replaySnapshotHandlers) {
          handler(msg.channel, msg.coin, msg.timestamp, msg.data);
        }
        break;
      }
      case 'stream_started': {
        const msg = message as WsStreamStarted;
        for (const handler of this.streamStartHandlers) {
          handler(msg.channel, msg.coin, msg.start, msg.end);
        }
        break;
      }
      case 'stream_progress': {
        const msg = message as WsStreamProgress;
        for (const handler of this.streamProgressHandlers) {
          handler(msg.snapshots_sent);
        }
        break;
      }
      case 'stream_completed': {
        const msg = message as WsStreamCompleted;
        for (const handler of this.streamCompleteHandlers) {
          handler(msg.channel, msg.coin, msg.snapshots_sent);
        }
        break;
      }
      case 'gap_detected': {
        const msg = message as WsGapDetected;
        for (const handler of this.gapHandlers) {
          handler(msg.channel, msg.coin, msg.gap_start, msg.gap_end, msg.duration_minutes);
        }
        break;
      }
      case 'data': {
        if (message.channel === 'lighter_orderbook' && this.lighterOrderbookHandlers.length > 0) {
          // A Lighter-specific handler takes the book, so Lighter 'BTC' does
          // not reach onOrderbook alongside Hyperliquid 'BTC'.
          for (const handler of this.lighterOrderbookHandlers) {
            handler(message.coin, message.data as LighterLiveOrderbook);
          }
        } else if (
          message.channel === 'orderbook' ||
          message.channel === 'hip3_orderbook' ||
          message.channel === 'hip4_orderbook' ||
          message.channel === 'lighter_orderbook' ||
          message.channel === 'spot_orderbook'
        ) {
          // Transform raw orderbook payload to SDK OrderBook type. Covers the
          // bare `orderbook` channel plus all per-venue variants so a single
          // `onOrderbook` handler works regardless of which subscribe* helper
          // produced the data.
          const orderbook = transformOrderbook(message.coin, message.data as Record<string, unknown>);
          for (const handler of this.orderbookHandlers) {
            handler(message.coin, orderbook);
          }
        } else if (message.channel === 'lighter_trades') {
          const legs = lighterLiveTrades(message.data);
          if (this.lighterTradesHandlers.length > 0) {
            // A Lighter-specific handler takes the legs, so Lighter 'BTC'
            // does not reach onTrades alongside Hyperliquid 'BTC'.
            for (const handler of this.lighterTradesHandlers) {
              handler(message.coin, legs);
            }
          } else {
            // Live Lighter legs carry one account each, so they get their own
            // transform instead of the Hyperliquid users[maker, taker] mapping.
            const trades = legs.map((leg) => transformLighterLiveTrade(message.coin, leg));
            for (const handler of this.tradesHandlers) {
              handler(message.coin, trades);
            }
          }
        } else if (message.channel === 'lighter_open_interest' || message.channel === 'lighter_funding') {
          for (const handler of this.lighterStatsHandlers) {
            handler(message.channel, message.coin, message.data as LighterLiveStats);
          }
        } else if (
          message.channel === 'trades' ||
          message.channel === 'hip3_trades' ||
          message.channel === 'hip4_trades' ||
          message.channel === 'spot_trades'
        ) {
          // Transform raw trade payload to SDK Trade type. Covers the bare
          // `trades` channel plus all per-venue variants.
          const trades = transformTrades(message.coin, message.data);
          for (const handler of this.tradesHandlers) {
            handler(message.coin, trades);
          }
        } else if (message.channel === 'liquidations' || message.channel === 'hip3_liquidations') {
          // Liquidation messages share the trades wire shape (fill row with
          // is_liquidation: true). Reuse the trade transformer so consumers
          // get the same `Trade` type they already know.
          const fills = transformTrades(message.coin, message.data);
          for (const handler of this.liquidationsHandlers) {
            handler(message.channel, message.coin, fills);
          }
        }
        break;
      }
      case 'outcome_settled': {
        const msg = message as WsOutcomeSettled;
        for (const handler of this.outcomeSettledHandlers) {
          handler(msg.coin, msg.outcome_id, msg.side, msg.settlement_value, msg.settlement_at);
        }
        break;
      }
    }
  }
}
