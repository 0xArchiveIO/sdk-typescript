/**
 * @0xarchive/sdk - Official TypeScript SDK for 0xarchive
 *
 * Historical Market Data API for these top-level venue APIs:
 * - Hyperliquid (perpetuals data from April 2023)
 * - Hyperliquid HIP-3 builder perps under the Hyperliquid namespace at /v1/hyperliquid/hip3 and client.hyperliquid.hip3
 * - Hyperliquid HIP-4 outcome markets at /v1/hyperliquid/hip4 and client.hyperliquid.hip4
 * - Hyperliquid Spot at /v1/hyperliquid/spot and client.spot (trades from 2025-03-22; orderbook + L4 + TWAP live from 2026-05-05)
 * - Lighter.xyz (perpetuals data)
 *
 * @example
 * ```typescript
 * import { OxArchive } from '@0xarchive/sdk';
 *
 * const client = new OxArchive({ apiKey: '0xa_your_api_key' });
 *
 * // Hyperliquid data
 * const hlOrderbook = await client.hyperliquid.orderbook.get('BTC');
 *
 * // Lighter.xyz data
 * const lighterOrderbook = await client.lighter.orderbook.get('BTC');
 *
 * // Hyperliquid HIP-3 data
 * const hip3Orderbook = await client.hyperliquid.hip3.orderbook.get('km:US500');
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
export { HyperliquidClient, Hip3Client, Hip4Client, LighterClient, SpotClient } from './exchanges';

// WebSocket client
export { OxArchiveWs } from './websocket';

// Orderbook Reconstructor — Lighter tick-level (Enterprise)
export {
  OrderBookReconstructor,
  reconstructOrderBook,
  reconstructFinal,
  type TickData,
  type ReconstructedOrderBook,
  type ReconstructOptions,
} from './orderbook-reconstructor';

// L4 Orderbook Reconstructor — Hyperliquid / HIP-3 (Pro+)
export {
  L4OrderBookReconstructor,
  type L4Order,
  type L2Level,
  type L4Diff,
  type L4Checkpoint,
} from './l4-reconstructor';

// L2 Full-Depth Orderbook resource
export { L2OrderBookResource, type L2OrderBookParams } from './resources/l2-orderbook';

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
  LiquidationVolumeSchema,
  LiquidationVolumeArrayResponseSchema,
  // Coin Freshness schemas
  DataTypeFreshnessInfoSchema,
  CoinFreshnessSchema,
  CoinFreshnessResponseSchema,
  // Coin Summary schemas
  CoinSummarySchema,
  CoinSummaryResponseSchema,
  // Price Snapshot schemas
  PriceSnapshotSchema,
  PriceSnapshotArrayResponseSchema,
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
  WsReplaySnapshotSchema,
  WsHistoricalDataSchema,
  WsStreamStartedSchema,
  WsStreamProgressSchema,
  TimestampedRecordSchema,
  WsHistoricalBatchSchema,
  WsStreamCompletedSchema,
  WsStreamStoppedSchema,
  WsOutcomeSettledSchema,
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
  Hip3Instrument,
  Hip4Outcome,
  Hip4OutcomeAggregate,
  Hip4OutcomeSideSpec,
  Hip4AggregatedOi,
  Hip4ListOutcomesParams,
  SpotPair,
  SpotTwapStatus,
  InstrumentType,
  // Funding
  FundingRate,
  FundingHistoryParams,
  // Open Interest
  OpenInterest,
  OpenInterestHistoryParams,
  OiFundingInterval,
  // Candles
  Candle,
  CandleInterval,
  CandleHistoryParams,
  // Liquidations
  Liquidation,
  LiquidationHistoryParams,
  LiquidationsByUserParams,
  LiquidationVolume,
  LiquidationVolumeParams,
  // Coin Freshness
  DataTypeFreshnessInfo,
  CoinFreshness,
  // Coin Summary
  CoinSummary,
  // Price History
  PriceSnapshot,
  PriceHistoryParams,
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
  // Web3 Auth
  SiweChallenge,
  Web3SignupResult,
  Web3ApiKey,
  Web3KeysList,
  Web3RevokeResult,
  Web3PaymentRequired,
  Web3SubscribeResult,
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
  WsReplaySnapshot,
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
  WsGapDetected,
  // L4 WebSocket types
  WsL4Snapshot,
  WsL4Batch,
  // HIP-4 settlement event
  WsOutcomeSettled,
  // Errors
  ApiError,
} from './types';

export { OxArchiveError } from './types';

// Default export for convenience
export { OxArchive as default } from './client';
