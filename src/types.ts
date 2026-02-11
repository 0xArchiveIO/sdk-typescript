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
// Liquidation Types
// =============================================================================

/**
 * Liquidation event record
 */
export interface Liquidation {
  /** Trading pair symbol */
  coin: string;
  /** Liquidation timestamp (UTC) */
  timestamp: string;
  /** Address of the liquidated user */
  liquidatedUser: string;
  /** Address of the liquidator */
  liquidatorUser: string;
  /** Liquidation execution price */
  price: string;
  /** Liquidation size */
  size: string;
  /** Side: 'B' (buy) or 'S' (sell) */
  side: 'B' | 'S';
  /** Mark price at time of liquidation */
  markPrice?: string;
  /** Realized PnL from the liquidation */
  closedPnl?: string;
  /** Position direction (e.g., 'Open Long', 'Close Short') */
  direction?: string;
  /** Unique trade ID */
  tradeId?: number;
  /** Blockchain transaction hash */
  txHash?: string;
}

/**
 * Parameters for getting liquidation history
 */
export interface LiquidationHistoryParams extends CursorPaginationParams {}

/**
 * Parameters for getting liquidations by user
 */
export interface LiquidationsByUserParams extends CursorPaginationParams {
  /** Optional coin filter */
  coin?: string;
}

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

/** WebSocket channel types. Note: ticker/all_tickers are real-time only. Liquidations is historical only (May 2025+). */
export type WsChannel = 'orderbook' | 'trades' | 'candles' | 'liquidations' | 'ticker' | 'all_tickers';

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

/**
 * Gap detected in historical data stream.
 * Sent when there's a gap exceeding the threshold between consecutive data points.
 * Thresholds: 2 minutes for orderbook/candles/liquidations, 60 minutes for trades.
 */
export interface WsGapDetected {
  type: 'gap_detected';
  channel: WsChannel;
  coin: string;
  /** Start of the gap (last data point timestamp in ms) */
  gap_start: number;
  /** End of the gap (next data point timestamp in ms) */
  gap_end: number;
  /** Gap duration in minutes */
  duration_minutes: number;
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
  | WsStreamStopped
  | WsGapDetected;

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

// =============================================================================
// Data Quality Types
// =============================================================================

/** System status values */
export type SystemStatusValue = 'operational' | 'degraded' | 'outage' | 'maintenance';

/** Status of a single exchange */
export interface ExchangeStatus {
  /** Current status */
  status: SystemStatusValue;
  /** Timestamp of last received data */
  lastDataAt?: string;
  /** Current latency in milliseconds */
  latencyMs?: number;
}

/** Status of a data type (orderbook, fills, etc.) */
export interface DataTypeStatus {
  /** Current status */
  status: SystemStatusValue;
  /** Data completeness over last 24 hours (0-100) */
  completeness24h: number;
}

/** Overall system status response */
export interface StatusResponse {
  /** Overall system status */
  status: SystemStatusValue;
  /** When this status was computed */
  updatedAt: string;
  /** Per-exchange status */
  exchanges: Record<string, ExchangeStatus>;
  /** Per-data-type status */
  dataTypes: Record<string, DataTypeStatus>;
  /** Number of active incidents */
  activeIncidents: number;
}

/** Coverage information for a specific data type */
export interface DataTypeCoverage {
  /** Earliest available data timestamp */
  earliest: string;
  /** Latest available data timestamp */
  latest: string;
  /** Total number of records */
  totalRecords: number;
  /** Number of symbols with data */
  symbols: number;
  /** Data resolution (e.g., '1.2s', '1m') */
  resolution?: string;
  /** Current data lag */
  lag?: string;
  /** Completeness percentage (0-100) */
  completeness: number;
}

/** Coverage for a single exchange */
export interface ExchangeCoverage {
  /** Exchange name */
  exchange: string;
  /** Coverage per data type */
  dataTypes: Record<string, DataTypeCoverage>;
}

/** Overall coverage response */
export interface CoverageResponse {
  /** Coverage for all exchanges */
  exchanges: ExchangeCoverage[];
}

/** Gap information for per-symbol coverage */
export interface CoverageGap {
  /** Start of the gap (last data before gap) */
  start: string;
  /** End of the gap (first data after gap) */
  end: string;
  /** Duration of the gap in minutes */
  durationMinutes: number;
}

/** Empirical data cadence measurement based on last 7 days of data */
export interface DataCadence {
  /** Median interval between consecutive records in seconds */
  medianIntervalSeconds: number;
  /** 95th percentile interval between consecutive records in seconds */
  p95IntervalSeconds: number;
  /** Number of intervals sampled for this measurement */
  sampleCount: number;
}

/** Coverage for a specific symbol and data type */
export interface SymbolDataTypeCoverage {
  /** Earliest available data timestamp */
  earliest: string;
  /** Latest available data timestamp */
  latest: string;
  /** Total number of records */
  totalRecords: number;
  /** 24-hour completeness percentage (0-100) */
  completeness: number;
  /** Historical coverage percentage (0-100) based on hours with data / total hours */
  historicalCoverage?: number;
  /** Detected data gaps within the requested time window */
  gaps: CoverageGap[];
  /** Empirical data cadence (present when sufficient data exists) */
  cadence?: DataCadence;
}

/** Options for symbol coverage query */
export interface SymbolCoverageOptions {
  /** Start of gap detection window (Unix milliseconds). Default: now - 30 days */
  from?: number;
  /** End of gap detection window (Unix milliseconds). Default: now */
  to?: number;
}

/** Per-symbol coverage response */
export interface SymbolCoverageResponse {
  /** Exchange name */
  exchange: string;
  /** Symbol name */
  symbol: string;
  /** Coverage per data type */
  dataTypes: Record<string, SymbolDataTypeCoverage>;
}

/** Incident status values */
export type IncidentStatusValue = 'open' | 'investigating' | 'identified' | 'monitoring' | 'resolved';

/** Incident severity values */
export type IncidentSeverityValue = 'minor' | 'major' | 'critical';

/** Data quality incident */
export interface Incident {
  /** Unique incident ID */
  id: string;
  /** Status: open, investigating, identified, monitoring, resolved */
  status: string;
  /** Severity: minor, major, critical */
  severity: string;
  /** Affected exchange (if specific to one) */
  exchange?: string;
  /** Affected data types */
  dataTypes: string[];
  /** Affected symbols */
  symbolsAffected: string[];
  /** When the incident started */
  startedAt: string;
  /** When the incident was resolved */
  resolvedAt?: string;
  /** Total duration in minutes */
  durationMinutes?: number;
  /** Incident title */
  title: string;
  /** Detailed description */
  description?: string;
  /** Root cause analysis */
  rootCause?: string;
  /** Resolution details */
  resolution?: string;
  /** Number of records affected */
  recordsAffected?: number;
  /** Number of records recovered */
  recordsRecovered?: number;
}

/** Pagination info for incident list */
export interface Pagination {
  /** Total number of incidents */
  total: number;
  /** Page size limit */
  limit: number;
  /** Current offset */
  offset: number;
}

/** Incidents list response */
export interface IncidentsResponse {
  /** List of incidents */
  incidents: Incident[];
  /** Pagination info */
  pagination: Pagination;
}

/** WebSocket latency metrics */
export interface WebSocketLatency {
  /** Current latency */
  currentMs: number;
  /** 1-hour average latency */
  avg1hMs: number;
  /** 24-hour average latency */
  avg24hMs: number;
  /** 24-hour P99 latency */
  p9924hMs?: number;
}

/** REST API latency metrics */
export interface RestApiLatency {
  /** Current latency */
  currentMs: number;
  /** 1-hour average latency */
  avg1hMs: number;
  /** 24-hour average latency */
  avg24hMs: number;
}

/** Data freshness metrics (lag from source) */
export interface DataFreshness {
  /** Orderbook data lag */
  orderbookLagMs?: number;
  /** Fills/trades data lag */
  fillsLagMs?: number;
  /** Funding rate data lag */
  fundingLagMs?: number;
  /** Open interest data lag */
  oiLagMs?: number;
}

/** Latency metrics for a single exchange */
export interface ExchangeLatency {
  /** WebSocket latency metrics */
  websocket?: WebSocketLatency;
  /** REST API latency metrics */
  restApi?: RestApiLatency;
  /** Data freshness metrics */
  dataFreshness: DataFreshness;
}

/** Overall latency response */
export interface LatencyResponse {
  /** When these metrics were measured */
  measuredAt: string;
  /** Per-exchange latency metrics */
  exchanges: Record<string, ExchangeLatency>;
}

/** SLA targets */
export interface SlaTargets {
  /** Uptime target percentage */
  uptime: number;
  /** Data completeness target percentage */
  dataCompleteness: number;
  /** API P99 latency target in milliseconds */
  apiLatencyP99Ms: number;
}

/** Completeness metrics per data type */
export interface CompletenessMetrics {
  /** Orderbook completeness percentage */
  orderbook: number;
  /** Fills completeness percentage */
  fills: number;
  /** Funding rate completeness percentage */
  funding: number;
  /** Overall completeness percentage */
  overall: number;
}

/** Actual SLA metrics */
export interface SlaActual {
  /** Actual uptime percentage */
  uptime: number;
  /** 'met' or 'missed' */
  uptimeStatus: string;
  /** Actual completeness metrics */
  dataCompleteness: CompletenessMetrics;
  /** 'met' or 'missed' */
  completenessStatus: string;
  /** Actual API P99 latency */
  apiLatencyP99Ms: number;
  /** 'met' or 'missed' */
  latencyStatus: string;
}

/** SLA compliance response */
export interface SlaResponse {
  /** Period covered (e.g., '2026-01') */
  period: string;
  /** Target SLA metrics */
  slaTargets: SlaTargets;
  /** Actual SLA metrics */
  actual: SlaActual;
  /** Number of incidents in this period */
  incidentsThisPeriod: number;
  /** Total downtime in minutes */
  totalDowntimeMinutes: number;
}

/** Parameters for listing incidents */
export interface ListIncidentsParams {
  /** Filter by incident status */
  status?: IncidentStatusValue;
  /** Filter by exchange */
  exchange?: string;
  /** Only show incidents starting after this timestamp (Unix ms) */
  since?: number | string;
  /** Maximum results per page (default: 20, max: 100) */
  limit?: number;
  /** Pagination offset */
  offset?: number;
}

/** Parameters for getting SLA metrics */
export interface SlaParams {
  /** Year (defaults to current year) */
  year?: number;
  /** Month 1-12 (defaults to current month) */
  month?: number;
}
