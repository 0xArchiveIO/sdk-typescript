/**
 * @0xarchive/sdk - Official TypeScript SDK for 0xarchive
 *
 * Historical Market Data API for multiple exchanges:
 * - Hyperliquid (perpetuals data from April 2023)
 * - Lighter.xyz (perpetuals data)
 *
 * @example
 * ```typescript
 * import { OxArchive } from '@0xarchive/sdk';
 *
 * const client = new OxArchive({ apiKey: 'ox_your_api_key' });
 *
 * // Hyperliquid data
 * const hlOrderbook = await client.hyperliquid.orderbook.get('BTC');
 *
 * // Lighter.xyz data
 * const lighterOrderbook = await client.lighter.orderbook.get('BTC');
 *
 * // Get historical snapshots
 * const history = await client.hyperliquid.orderbook.history('ETH', {
 *   start: Date.now() - 86400000,
 *   end: Date.now()
 * });
 * ```
 *
 * @packageDocumentation
 */

// Main client
export { OxArchive } from './client';

// Exchange clients
export { HyperliquidClient, LighterClient } from './exchanges';

// WebSocket client
export { OxArchiveWs } from './websocket';

// Orderbook Reconstructor (for tick-level data)
export {
  OrderBookReconstructor,
  reconstructOrderBook,
  reconstructFinal,
  type TickData,
  type ReconstructedOrderBook,
  type ReconstructOptions,
} from './orderbook-reconstructor';

// Tick-level history params
export type { TickHistoryParams } from './resources/orderbook';

// Zod schemas for runtime validation
export {
  // Base schemas
  ApiMetaSchema,
  ApiResponseSchema,
  // Order Book schemas
  PriceLevelSchema,
  OrderBookSchema,
  OrderBookResponseSchema,
  OrderBookArrayResponseSchema,
  // Trade schemas
  TradeSideSchema,
  TradeDirectionSchema,
  TradeSchema,
  TradeArrayResponseSchema,
  // Instrument schemas
  InstrumentTypeSchema,
  InstrumentSchema,
  InstrumentResponseSchema,
  InstrumentArrayResponseSchema,
  // Funding schemas
  FundingRateSchema,
  FundingRateResponseSchema,
  FundingRateArrayResponseSchema,
  // Open Interest schemas
  OpenInterestSchema,
  OpenInterestResponseSchema,
  OpenInterestArrayResponseSchema,
  // Candle schemas
  CandleIntervalSchema,
  CandleSchema,
  CandleArrayResponseSchema,
  // Liquidation schemas
  LiquidationSideSchema,
  LiquidationSchema,
  LiquidationArrayResponseSchema,
  // WebSocket schemas
  WsChannelSchema,
  WsConnectionStateSchema,
  WsServerMessageSchema,
  WsSubscribedSchema,
  WsUnsubscribedSchema,
  WsPongSchema,
  WsErrorSchema,
  WsDataSchema,
  WsReplayStartedSchema,
  WsReplayPausedSchema,
  WsReplayResumedSchema,
  WsReplayCompletedSchema,
  WsReplayStoppedSchema,
  WsHistoricalDataSchema,
  WsStreamStartedSchema,
  WsStreamProgressSchema,
  TimestampedRecordSchema,
  WsHistoricalBatchSchema,
  WsStreamCompletedSchema,
  WsStreamStoppedSchema,
  // Validated types (inferred from schemas)
  type ValidatedApiMeta,
  type ValidatedPriceLevel,
  type ValidatedOrderBook,
  type ValidatedTrade,
  type ValidatedInstrument,
  type ValidatedFundingRate,
  type ValidatedOpenInterest,
  type ValidatedCandle,
  type ValidatedLiquidation,
  type ValidatedWsServerMessage,
} from './schemas';

// Types
export type {
  ClientOptions,
  ApiMeta,
  ApiResponse,
  Timestamp,
  // Order Book
  PriceLevel,
  OrderBook,
  GetOrderBookParams,
  OrderBookHistoryParams,
  LighterGranularity,
  // Trades
  Trade,
  GetTradesCursorParams,
  CursorResponse,
  TradeSide,
  TradeDirection,
  // Instruments
  Instrument,
  LighterInstrument,
  InstrumentType,
  // Funding
  FundingRate,
  // Open Interest
  OpenInterest,
  // Candles
  Candle,
  CandleInterval,
  CandleHistoryParams,
  // Liquidations
  Liquidation,
  LiquidationHistoryParams,
  LiquidationsByUserParams,
  // Data Quality
  SystemStatusValue,
  ExchangeStatus,
  DataTypeStatus,
  StatusResponse,
  DataTypeCoverage,
  ExchangeCoverage,
  CoverageResponse,
  CoverageGap,
  DataCadence,
  SymbolDataTypeCoverage,
  SymbolCoverageOptions,
  SymbolCoverageResponse,
  IncidentStatusValue,
  IncidentSeverityValue,
  Incident,
  Pagination,
  IncidentsResponse,
  WebSocketLatency,
  RestApiLatency,
  DataFreshness,
  ExchangeLatency,
  LatencyResponse,
  SlaTargets,
  CompletenessMetrics,
  SlaActual,
  SlaResponse,
  ListIncidentsParams,
  SlaParams,
  // WebSocket
  WsChannel,
  WsOptions,
  WsClientMessage,
  WsServerMessage,
  WsConnectionState,
  WsEventHandlers,
  WsSubscribe,
  WsUnsubscribe,
  WsPing,
  WsSubscribed,
  WsUnsubscribed,
  WsPong,
  WsError,
  WsData,
  // WebSocket Replay (Option B)
  WsReplay,
  WsReplayPause,
  WsReplayResume,
  WsReplaySeek,
  WsReplayStop,
  WsReplayStarted,
  WsReplayPaused,
  WsReplayResumed,
  WsReplayCompleted,
  WsReplayStopped,
  WsHistoricalData,
  WsHistoricalTickData,
  OrderbookDelta,
  // WebSocket Bulk Stream (Option D)
  WsStream,
  WsStreamStop,
  WsStreamStarted,
  WsStreamProgress,
  TimestampedRecord,
  WsHistoricalBatch,
  WsStreamCompleted,
  WsStreamStopped,
  // Errors
  ApiError,
} from './types';

export { OxArchiveError } from './types';

// Default export for convenience
export { OxArchive as default } from './client';
