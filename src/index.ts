/**
 * @0xarchive/sdk - Official TypeScript SDK for 0xarchive
 *
 * @example
 * ```typescript
 * import { OxArchive } from '@0xarchive/sdk';
 *
 * const client = new OxArchive({ apiKey: 'ox_your_api_key' });
 *
 * // Get current order book
 * const orderbook = await client.orderbook.get('BTC');
 *
 * // Get historical snapshots
 * const history = await client.orderbook.history('ETH', {
 *   start: Date.now() - 86400000,
 *   end: Date.now()
 * });
 * ```
 *
 * @packageDocumentation
 */

// Main client
export { OxArchive } from './client';

// WebSocket client
export { OxArchiveWs } from './websocket';

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
  // Trades
  Trade,
  GetTradesCursorParams,
  CursorResponse,
  TradeSide,
  TradeDirection,
  // Instruments
  Instrument,
  InstrumentType,
  // Funding
  FundingRate,
  // Open Interest
  OpenInterest,
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
