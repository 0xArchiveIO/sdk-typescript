/**
 * Configuration options for the 0xarchive client
 */
export interface ClientOptions {
  /** Your 0xarchive API key */
  apiKey: string;
  /** Base URL for the API (defaults to https://api.0xarchive.io) */
  baseUrl?: string;
  /** Request timeout in milliseconds (defaults to 30000) */
  timeout?: number;
  /** Enable runtime validation of API responses using Zod schemas (defaults to false) */
  validate?: boolean;
}

/**
 * Response metadata
 */
export interface ApiMeta {
  /** Number of records returned */
  count: number;
  /** Cursor for next page (if available) */
  nextCursor?: string;
  /** Unique request ID for debugging */
  requestId: string;
}

/**
 * Standard API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta: ApiMeta;
}


// =============================================================================
// Order Book Types
// =============================================================================

/**
 * A price level in the order book
 */
export interface PriceLevel {
  /** Price at this level */
  px: string;
  /** Total size at this price level */
  sz: string;
  /** Number of orders at this level */
  n: number;
}

/**
 * Order book snapshot
 */
export interface OrderBook {
  /** Trading pair symbol (e.g., BTC, ETH) */
  coin: string;
  /** Snapshot timestamp (UTC) */
  timestamp: string;
  /** Bid price levels (best bid first) */
  bids: PriceLevel[];
  /** Ask price levels (best ask first) */
  asks: PriceLevel[];
  /** Mid price (best bid + best ask) / 2 */
  midPrice?: string;
  /** Spread in absolute terms (best ask - best bid) */
  spread?: string;
  /** Spread in basis points */
  spreadBps?: string;
}

export interface GetOrderBookParams {
  /** Timestamp to get order book at (Unix ms or ISO string) */
  timestamp?: number | string;
  /** Number of price levels to return per side */
  depth?: number;
}

/**
 * Lighter orderbook data granularity levels.
 * Controls the resolution of historical orderbook data (Lighter.xyz only).
 *
 * - 'checkpoint': ~60s intervals (default, all tiers)
 * - '30s': 30 second intervals (Build+ tier)
 * - '10s': 10 second intervals (Build+ tier)
 * - '1s': 1 second intervals (Pro+ tier)
 * - 'tick': Checkpoint + raw deltas (Enterprise tier only)
 */
export type LighterGranularity = 'checkpoint' | '30s' | '10s' | '1s' | 'tick';

export interface OrderBookHistoryParams extends CursorPaginationParams {
  /** Number of price levels to return per side */
  depth?: number;
  /**
   * Data resolution for Lighter orderbook history (Lighter.xyz only, ignored for Hyperliquid).
   * Controls the granularity of returned snapshots. Tier restrictions apply.
   * Credit multipliers: checkpoint=1x, 30s=2x, 10s=3x, 1s=10x, tick=20x.
   * @default 'checkpoint'
   */
  granularity?: LighterGranularity;
}

// =============================================================================
// Trade/Fill Types
// =============================================================================

/** Trade side: 'A' (ask/sell) or 'B' (bid/buy) */
export type TradeSide = 'A' | 'B';

/** Position direction (can include 'Open Long', 'Close Short', 'Long > Short', etc.) */
export type TradeDirection = string;

/**
 * Trade/fill record with full execution details
 */
export interface Trade {
  /** Trading pair symbol */
  coin: string;
  /** Trade side: 'A' (ask/sell) or 'B' (bid/buy) */
  side: TradeSide;
  /** Execution price */
  price: string;
  /** Trade size */
  size: string;
  /** Execution timestamp (UTC) */
  timestamp: string;
  /** Blockchain transaction hash */
  txHash?: string;
  /** Unique trade ID */
  tradeId?: number;
  /** Associated order ID */
  orderId?: number;
  /** True if taker (crossed the spread), false if maker */
  crossed?: boolean;
  /** Trading fee amount */
  fee?: string;
  /** Fee denomination (e.g., USDC) */
  feeToken?: string;
  /** Realized PnL if closing a position */
  closedPnl?: string;
  /** Position direction */
  direction?: TradeDirection;
  /** Position size before this trade */
  startPosition?: string;
  /** User's wallet address (for fill-level data from REST API) */
  userAddress?: string;
  /** Maker's wallet address (for market-level WebSocket trades) */
  makerAddress?: string;
  /** Taker's wallet address (for market-level WebSocket trades) */
  takerAddress?: string;
}

/**
 * Cursor-based pagination parameters (recommended)
 * More efficient than offset-based pagination for large datasets.
 * The cursor is a timestamp - use the `nextCursor` from the response to get the next page.
 */
export interface CursorPaginationParams {
  /** Start timestamp (Unix ms or ISO string) - REQUIRED */
  start: number | string;
  /** End timestamp (Unix ms or ISO string) - REQUIRED */
  end: number | string;
  /** Cursor from previous response's nextCursor (timestamp). If not provided, starts from the beginning of the range. */
  cursor?: number | string;
  /** Maximum number of results to return (default: 100, max: 1000) */
  limit?: number;
}

/**
 * Parameters for getting trades with cursor-based pagination (recommended)
 */
export interface GetTradesCursorParams extends CursorPaginationParams {
  /** Filter by side */
  side?: TradeSide;
}

/**
 * Response with cursor for pagination
 */
export interface CursorResponse<T> {
  data: T;
  /** Cursor for next page (use as cursor parameter) */
  nextCursor?: string;
}

// =============================================================================
// Instruments Types
// =============================================================================

/** Instrument type */
export type InstrumentType = 'perp' | 'spot';

/**
 * Trading instrument metadata (Hyperliquid)
 */
export interface Instrument {
  /** Instrument symbol (e.g., BTC) */
  name: string;
  /** Size decimal precision */
  szDecimals: number;
  /** Maximum leverage allowed */
  maxLeverage?: number;
  /** If true, only isolated margin mode is allowed */
  onlyIsolated?: boolean;
  /** Type of instrument */
  instrumentType?: InstrumentType;
  /** Whether the instrument is currently tradeable */
  isActive: boolean;
}

/**
 * Trading instrument metadata (Lighter.xyz)
 *
 * Lighter instruments have a different schema than Hyperliquid with more
 * detailed market configuration including fees and minimum amounts.
 */
export interface LighterInstrument {
  /** Instrument symbol (e.g., BTC, ETH) */
  symbol: string;
  /** Unique market identifier */
  marketId: number;
  /** Market type (e.g., 'perp') */
  marketType: string;
  /** Market status (e.g., 'active') */
  status: string;
  /** Taker fee rate (e.g., 0.0005 = 0.05%) */
  takerFee: number;
  /** Maker fee rate (e.g., 0.0002 = 0.02%) */
  makerFee: number;
  /** Liquidation fee rate */
  liquidationFee: number;
  /** Minimum order size in base currency */
  minBaseAmount: number;
  /** Minimum order size in quote currency */
  minQuoteAmount: number;
  /** Size decimal precision */
  sizeDecimals: number;
  /** Price decimal precision */
  priceDecimals: number;
  /** Quote currency decimal precision */
  quoteDecimals: number;
  /** Whether the instrument is currently tradeable */
  isActive: boolean;
}

// =============================================================================
// Funding Types
// =============================================================================

/**
 * Funding rate record
 */
export interface FundingRate {
  /** Trading pair symbol */
  coin: string;
  /** Funding timestamp (UTC) */
  timestamp: string;
  /** Funding rate as decimal (e.g., 0.0001 = 0.01%) */
  fundingRate: string;
  /** Premium component of funding rate */
  premium?: string;
}

/**
 * Parameters for getting funding rate history
 */
export interface FundingHistoryParams extends CursorPaginationParams {}

// =============================================================================
// Open Interest Types
// =============================================================================

/**
 * Open interest snapshot with market context
 */
export interface OpenInterest {
  /** Trading pair symbol */
  coin: string;
  /** Snapshot timestamp (UTC) */
  timestamp: string;
  /** Total open interest in contracts */
  openInterest: string;
  /** Mark price used for liquidations */
  markPrice?: string;
  /** Oracle price from external feed */
  oraclePrice?: string;
  /** 24-hour notional volume */
  dayNtlVolume?: string;
  /** Price 24 hours ago */
  prevDayPrice?: string;
  /** Current mid price */
  midPrice?: string;
  /** Impact bid price for liquidations */
  impactBidPrice?: string;
  /** Impact ask price for liquidations */
  impactAskPrice?: string;
}

/**
 * Parameters for getting open interest history
 */
export interface OpenInterestHistoryParams extends CursorPaginationParams {}

// =============================================================================
// Candle Types
// =============================================================================

/** Candle interval for OHLCV data */
export type CandleInterval = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w';

/**
 * OHLCV candle data
 */
export interface Candle {
  /** Candle open timestamp (UTC) */
  timestamp: string;
  /** Opening price */
  open: number;
  /** Highest price during the interval */
  high: number;
  /** Lowest price during the interval */
  low: number;
  /** Closing price */
  close: number;
  /** Total volume traded during the interval */
  volume: number;
  /** Total quote volume (volume * price) */
  quoteVolume?: number;
  /** Number of trades during the interval */
  tradeCount?: number;
}

/**
 * Parameters for getting candle history
 */
export interface CandleHistoryParams extends CursorPaginationParams {
  /** Candle interval (default: 1h) */
  interval?: CandleInterval;
}

// =============================================================================
// WebSocket Types
// =============================================================================

/** WebSocket channel types. Note: ticker/all_tickers are real-time only. */
export type WsChannel = 'orderbook' | 'trades' | 'candles' | 'ticker' | 'all_tickers';

/** Subscribe message from client */
export interface WsSubscribe {
  op: 'subscribe';
  channel: WsChannel;
  coin?: string;
}

/** Unsubscribe message from client */
export interface WsUnsubscribe {
  op: 'unsubscribe';
  channel: WsChannel;
  coin?: string;
}

/** Ping message from client */
export interface WsPing {
  op: 'ping';
}

/** Replay message from client - replays historical data with timing preserved */
export interface WsReplay {
  op: 'replay';
  channel: WsChannel;
  coin?: string;
  /** Start timestamp (Unix ms) */
  start: number;
  /** End timestamp (Unix ms, defaults to now) */
  end?: number;
  /** Playback speed multiplier (1 = real-time, 10 = 10x faster) */
  speed?: number;
  /** Data resolution for Lighter orderbook ('checkpoint', '30s', '10s', '1s', 'tick') */
  granularity?: string;
  /** Candle interval for candles channel ('1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w') */
  interval?: string;
}

/** Replay control messages */
export interface WsReplayPause { op: 'replay.pause'; }
export interface WsReplayResume { op: 'replay.resume'; }
export interface WsReplaySeek { op: 'replay.seek'; timestamp: number; }
export interface WsReplayStop { op: 'replay.stop'; }

/** Stream message from client - bulk download historical data */
export interface WsStream {
  op: 'stream';
  channel: WsChannel;
  coin?: string;
  /** Start timestamp (Unix ms) */
  start: number;
  /** End timestamp (Unix ms) */
  end: number;
  /** Batch size (records per message) */
  batch_size?: number;
  /** Data resolution for Lighter orderbook ('checkpoint', '30s', '10s', '1s', 'tick') */
  granularity?: string;
  /** Candle interval for candles channel ('1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w') */
  interval?: string;
}

/** Stream control messages */
export interface WsStreamStop { op: 'stream.stop'; }

/** Client message union type */
export type WsClientMessage =
  | WsSubscribe
  | WsUnsubscribe
  | WsPing
  | WsReplay
  | WsReplayPause
  | WsReplayResume
  | WsReplaySeek
  | WsReplayStop
  | WsStream
  | WsStreamStop;

/** Subscription confirmed from server */
export interface WsSubscribed {
  type: 'subscribed';
  channel: WsChannel;
  coin?: string;
}

/** Unsubscription confirmed from server */
export interface WsUnsubscribed {
  type: 'unsubscribed';
  channel: WsChannel;
  coin?: string;
}

/** Pong response from server */
export interface WsPong {
  type: 'pong';
}

/** Error from server */
export interface WsError {
  type: 'error';
  message: string;
}

/** Data message from server (real-time) */
export interface WsData<T = unknown> {
  type: 'data';
  channel: WsChannel;
  coin: string;
  data: T;
}

/** Replay started response */
export interface WsReplayStarted {
  type: 'replay_started';
  channel: WsChannel;
  coin: string;
  /** Start timestamp in milliseconds */
  start: number;
  /** End timestamp in milliseconds */
  end: number;
  /** Playback speed multiplier */
  speed: number;
}

/** Replay paused response */
export interface WsReplayPaused {
  type: 'replay_paused';
  current_timestamp: number;
}

/** Replay resumed response */
export interface WsReplayResumed {
  type: 'replay_resumed';
  current_timestamp: number;
}

/** Replay completed response */
export interface WsReplayCompleted {
  type: 'replay_completed';
  channel: WsChannel;
  coin: string;
  snapshots_sent: number;
}

/** Replay stopped response */
export interface WsReplayStopped {
  type: 'replay_stopped';
}

/** Historical data point (replay mode) */
export interface WsHistoricalData<T = unknown> {
  type: 'historical_data';
  channel: WsChannel;
  coin: string;
  timestamp: number;
  data: T;
}

/** Orderbook delta for tick-level data */
export interface OrderbookDelta {
  /** Timestamp in milliseconds */
  timestamp: number;
  /** Side: 'bid' or 'ask' */
  side: 'bid' | 'ask';
  /** Price level */
  price: number;
  /** New size (0 = level removed) */
  size: number;
  /** Sequence number for ordering */
  sequence: number;
}

/** Historical tick data (granularity='tick' mode) - checkpoint + deltas */
export interface WsHistoricalTickData {
  type: 'historical_tick_data';
  channel: WsChannel;
  coin: string;
  /** Initial checkpoint (full orderbook snapshot) */
  checkpoint: OrderBook;
  /** Incremental deltas to apply after checkpoint */
  deltas: OrderbookDelta[];
}

/** Stream started response */
export interface WsStreamStarted {
  type: 'stream_started';
  channel: WsChannel;
  coin: string;
  /** Start timestamp in milliseconds */
  start: number;
  /** End timestamp in milliseconds */
  end: number;
}

/** Stream progress response (sent periodically during streaming) */
export interface WsStreamProgress {
  type: 'stream_progress';
  snapshots_sent: number;
}

/** A record with timestamp for batched data */
export interface TimestampedRecord<T = unknown> {
  timestamp: number;
  data: T;
}

/** Batch of historical data (bulk streaming) */
export interface WsHistoricalBatch<T = unknown> {
  type: 'historical_batch';
  channel: WsChannel;
  coin: string;
  data: TimestampedRecord<T>[];
}

/** Stream completed response */
export interface WsStreamCompleted {
  type: 'stream_completed';
  channel: WsChannel;
  coin: string;
  snapshots_sent: number;
}

/** Stream stopped response */
export interface WsStreamStopped {
  type: 'stream_stopped';
  snapshots_sent: number;
}

/** Server message union type */
export type WsServerMessage =
  | WsSubscribed
  | WsUnsubscribed
  | WsPong
  | WsError
  | WsData
  | WsReplayStarted
  | WsReplayPaused
  | WsReplayResumed
  | WsReplayCompleted
  | WsReplayStopped
  | WsHistoricalData
  | WsHistoricalTickData
  | WsStreamStarted
  | WsStreamProgress
  | WsHistoricalBatch
  | WsStreamCompleted
  | WsStreamStopped;

/**
 * WebSocket connection options.
 *
 * The server sends WebSocket ping frames every 30 seconds and will disconnect
 * idle connections after 60 seconds. The SDK automatically handles keep-alive
 * by sending application-level pings at the configured interval.
 */
export interface WsOptions {
  /** API key for authentication */
  apiKey: string;
  /** WebSocket URL (defaults to wss://api.0xarchive.io/ws) */
  wsUrl?: string;
  /** Auto-reconnect on disconnect (defaults to true) */
  autoReconnect?: boolean;
  /** Reconnect delay in ms (defaults to 1000) */
  reconnectDelay?: number;
  /** Maximum reconnect attempts (defaults to 10) */
  maxReconnectAttempts?: number;
  /** Ping interval in ms to keep connection alive (defaults to 30000). Server disconnects after 60s idle. */
  pingInterval?: number;
}

/** WebSocket connection state */
export type WsConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

/** WebSocket event handlers */
export interface WsEventHandlers {
  onOpen?: () => void;
  onClose?: (code: number, reason: string) => void;
  onError?: (error: Error) => void;
  onMessage?: (message: WsServerMessage) => void;
  onStateChange?: (state: WsConnectionState) => void;
}

// =============================================================================
// Error Types
// =============================================================================

/**
 * API error response
 */
export interface ApiError {
  code: number;
  error: string;
}

/**
 * SDK error class
 */
export class OxArchiveError extends Error {
  code: number;
  requestId?: string;

  constructor(message: string, code: number, requestId?: string) {
    super(message);
    this.name = 'OxArchiveError';
    this.code = code;
    this.requestId = requestId;
  }
}

/** Timestamp can be Unix ms (number), ISO string, or Date object */
export type Timestamp = number | string | Date;
