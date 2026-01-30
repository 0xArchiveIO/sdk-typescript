/**
 * WebSocket client for 0xarchive real-time streaming, replay, and bulk download
 *
 * @example Real-time streaming
 * ```typescript
 * const ws = new OxArchiveWs({ apiKey: 'ox_...' });
 * await ws.connect();
 * ws.onOrderbook((coin, ob) => console.log(`${coin}: ${ob.midPrice}`));
 * ws.subscribeOrderbook('BTC');
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
 *   speed: 10 // 10x speed
 * });
 * ```
 *
 * @example Bulk streaming (like Databento)
 * ```typescript
 * const ws = new OxArchiveWs({ apiKey: 'ox_...' });
 * const batches: OrderBook[] = [];
 * ws.onBatch((coin, records) => {
 *   batches.push(...records.map(r => r.data));
 * });
 * ws.onStreamComplete((channel, coin, count) => {
 *   console.log(`Downloaded ${count} records`);
 * });
 * await ws.connect();
 * ws.stream('orderbook', 'ETH', {
 *   start: Date.now() - 3600000,
 *   end: Date.now(),
 *   batchSize: 1000
 * });
 * ```
 */

import type {
  WsOptions,
  WsChannel,
  WsClientMessage,
  WsServerMessage,
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
  WsStreamStarted,
  WsStreamCompleted,
  WsStreamProgress,
} from './types';

const DEFAULT_WS_URL = 'wss://api.0xarchive.io/ws';
const DEFAULT_PING_INTERVAL = 30000; // 30 seconds
const DEFAULT_RECONNECT_DELAY = 1000;
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 10;

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
 * WebSocket client for real-time data streaming.
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
  private subscriptions: Set<string> = new Set();
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
  private streamStartHandlers: Array<(channel: WsChannel, coin: string, start: number, end: number) => void> = [];
  private streamProgressHandlers: Array<(snapshotsSent: number) => void> = [];
  private streamCompleteHandlers: Array<(channel: WsChannel, coin: string, snapshotsSent: number) => void> = [];
  private orderbookHandlers: Array<(coin: string, data: OrderBook) => void> = [];
  private tradesHandlers: Array<(coin: string, data: Trade[]) => void> = [];

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
   * Subscribe to a channel
   */
  subscribe(channel: WsChannel, coin?: string): void {
    const key = this.subscriptionKey(channel, coin);
    this.subscriptions.add(key);

    if (this.isConnected()) {
      this.send({ op: 'subscribe', channel, coin });
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
      this.send({ op: 'unsubscribe', channel, coin });
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

  // ==========================================================================
  // Historical Replay (Option B) - Like Tardis.dev
  // ==========================================================================

  /**
   * Start historical replay with timing preserved
   *
   * @param channel - Data channel to replay
   * @param coin - Trading pair (e.g., 'BTC', 'ETH')
   * @param options - Replay options
   *
   * @example
   * ```typescript
   * ws.replay('orderbook', 'BTC', {
   *   start: Date.now() - 86400000, // 24 hours ago
   *   speed: 10 // 10x faster than real-time
   * });
   * ```
   */
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
    }
  ): void {
    this.send({
      op: 'replay',
      channel,
      coin,
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
  // Bulk Streaming (Option D) - Like Databento
  // ==========================================================================

  /**
   * Start bulk streaming for fast data download
   *
   * @param channel - Data channel to stream
   * @param coin - Trading pair (e.g., 'BTC', 'ETH')
   * @param options - Stream options
   *
   * @example
   * ```typescript
   * ws.stream('orderbook', 'ETH', {
   *   start: Date.now() - 3600000, // 1 hour ago
   *   end: Date.now(),
   *   batchSize: 1000
   * });
   * ```
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
      coin,
      start: options.start,
      end: options.end,
      batch_size: options.batchSize ?? 1000,
      granularity: options.granularity,
      interval: options.interval,
    });
  }

  /**
   * Stop the current bulk stream
   */
  streamStop(): void {
    this.send({ op: 'stream.stop' });
  }

  // ==========================================================================
  // Event Handlers for Replay/Stream
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
   * Handle batched data (bulk stream mode)
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
   * Handle stream started event
   */
  onStreamStart(
    handler: (channel: WsChannel, coin: string, start: number, end: number) => void
  ): void {
    this.streamStartHandlers.push(handler);
  }

  /**
   * Handle stream progress event
   */
  onStreamProgress(
    handler: (snapshotsSent: number) => void
  ): void {
    this.streamProgressHandlers.push(handler);
  }

  /**
   * Handle stream completed event
   */
  onStreamComplete(
    handler: (channel: WsChannel, coin: string, snapshotsSent: number) => void
  ): void {
    this.streamCompleteHandlers.push(handler);
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
    return coin ? `${channel}:${coin}` : channel;
  }

  private resubscribe(): void {
    for (const key of this.subscriptions) {
      const [channel, coin] = key.split(':') as [WsChannel, string | undefined];
      this.send({ op: 'subscribe', channel, coin });
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
      case 'data': {
        if (message.channel === 'orderbook') {
          // Transform raw Hyperliquid format to SDK OrderBook type
          const orderbook = transformOrderbook(message.coin, message.data as Record<string, unknown>);
          for (const handler of this.orderbookHandlers) {
            handler(message.coin, orderbook);
          }
        } else if (message.channel === 'trades') {
          // Transform raw Hyperliquid format to SDK Trade type
          const trades = transformTrades(message.coin, message.data);
          for (const handler of this.tradesHandlers) {
            handler(message.coin, trades);
          }
        }
        break;
      }
    }
  }
}
