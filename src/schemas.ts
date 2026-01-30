/**
 * Zod schemas for runtime validation of API responses
 *
 * @example
 * ```typescript
 * import { OrderBookSchema, TradeSchema } from '@0xarchive/sdk';
 *
 * // Validate data manually
 * const result = OrderBookSchema.safeParse(data);
 * if (result.success) {
 *   console.log(result.data.midPrice);
 * } else {
 *   console.error(result.error);
 * }
 * ```
 */

import { z } from 'zod';

// =============================================================================
// Base Schemas
// =============================================================================

export const ApiMetaSchema = z.object({
  count: z.number(),
  nextCursor: z.string().optional(),
  requestId: z.string(),
});

export const ApiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema,
    meta: ApiMetaSchema,
  });

// =============================================================================
// Order Book Schemas
// =============================================================================

export const PriceLevelSchema = z.object({
  px: z.string(),
  sz: z.string(),
  n: z.number(),
});

export const OrderBookSchema = z.object({
  coin: z.string(),
  timestamp: z.string(),
  bids: z.array(PriceLevelSchema),
  asks: z.array(PriceLevelSchema),
  midPrice: z.string().optional(),
  spread: z.string().optional(),
  spreadBps: z.string().optional(),
});

// =============================================================================
// Trade/Fill Schemas
// =============================================================================

export const TradeSideSchema = z.enum(['A', 'B']);

// Direction can include 'Open Long', 'Close Short', 'Long > Short', etc.
export const TradeDirectionSchema = z.string();

export const TradeSchema = z.object({
  coin: z.string(),
  side: TradeSideSchema,
  price: z.string(),
  size: z.string(),
  timestamp: z.string(),
  txHash: z.string().optional(),
  tradeId: z.number().optional(),
  orderId: z.number().optional(),
  crossed: z.boolean().optional(),
  fee: z.string().optional(),
  feeToken: z.string().optional(),
  closedPnl: z.string().optional(),
  direction: TradeDirectionSchema.optional(),
  startPosition: z.string().optional(),
  userAddress: z.string().optional(),
  makerAddress: z.string().optional(),
  takerAddress: z.string().optional(),
});

// =============================================================================
// Instrument Schemas
// =============================================================================

export const InstrumentTypeSchema = z.enum(['perp', 'spot']);

export const InstrumentSchema = z.object({
  name: z.string(),
  szDecimals: z.number(),
  maxLeverage: z.number().optional(),
  onlyIsolated: z.boolean().optional(),
  instrumentType: InstrumentTypeSchema.optional(),
  isActive: z.boolean(),
});

// =============================================================================
// Funding Schemas
// =============================================================================

export const FundingRateSchema = z.object({
  coin: z.string(),
  timestamp: z.string(),
  fundingRate: z.string(),
  premium: z.string().optional(),
});

// =============================================================================
// Open Interest Schemas
// =============================================================================

export const OpenInterestSchema = z.object({
  coin: z.string(),
  timestamp: z.string(),
  openInterest: z.string(),
  markPrice: z.string().optional(),
  oraclePrice: z.string().optional(),
  dayNtlVolume: z.string().optional(),
  prevDayPrice: z.string().optional(),
  midPrice: z.string().optional(),
  impactBidPrice: z.string().optional(),
  impactAskPrice: z.string().optional(),
});

// =============================================================================
// Liquidation Schemas
// =============================================================================

export const LiquidationSideSchema = z.enum(['B', 'S']);

export const LiquidationSchema = z.object({
  coin: z.string(),
  timestamp: z.string(),
  liquidatedUser: z.string(),
  liquidatorUser: z.string(),
  price: z.string(),
  size: z.string(),
  side: LiquidationSideSchema,
  markPrice: z.string().optional(),
  closedPnl: z.string().optional(),
  direction: z.string().optional(),
  tradeId: z.number().optional(),
  txHash: z.string().optional(),
});

// =============================================================================
// Candle Schemas
// =============================================================================

export const CandleIntervalSchema = z.enum(['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w']);

export const CandleSchema = z.object({
  timestamp: z.string(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number(),
  quoteVolume: z.number().optional(),
  tradeCount: z.number().optional(),
});

// =============================================================================
// WebSocket Message Schemas
// =============================================================================

export const WsChannelSchema = z.enum(['orderbook', 'trades', 'candles', 'liquidations', 'ticker', 'all_tickers']);

export const WsConnectionStateSchema = z.enum(['connecting', 'connected', 'disconnected', 'reconnecting']);

// Server -> Client messages
export const WsSubscribedSchema = z.object({
  type: z.literal('subscribed'),
  channel: WsChannelSchema,
  coin: z.string().optional(),
});

export const WsUnsubscribedSchema = z.object({
  type: z.literal('unsubscribed'),
  channel: WsChannelSchema,
  coin: z.string().optional(),
});

export const WsPongSchema = z.object({
  type: z.literal('pong'),
});

export const WsErrorSchema = z.object({
  type: z.literal('error'),
  message: z.string(),
});

export const WsDataSchema = z.object({
  type: z.literal('data'),
  channel: WsChannelSchema,
  coin: z.string(),
  data: z.unknown(),
});

// Replay messages
export const WsReplayStartedSchema = z.object({
  type: z.literal('replay_started'),
  channel: WsChannelSchema,
  coin: z.string(),
  start: z.number(),
  end: z.number(),
  speed: z.number(),
});

export const WsReplayPausedSchema = z.object({
  type: z.literal('replay_paused'),
  currentTimestamp: z.number(),
});

export const WsReplayResumedSchema = z.object({
  type: z.literal('replay_resumed'),
  currentTimestamp: z.number(),
});

export const WsReplayCompletedSchema = z.object({
  type: z.literal('replay_completed'),
  channel: WsChannelSchema,
  coin: z.string(),
  snapshotsSent: z.number(),
});

export const WsReplayStoppedSchema = z.object({
  type: z.literal('replay_stopped'),
});

export const WsHistoricalDataSchema = z.object({
  type: z.literal('historical_data'),
  channel: WsChannelSchema,
  coin: z.string(),
  timestamp: z.number(),
  data: z.unknown(),
});

// Stream messages
export const WsStreamStartedSchema = z.object({
  type: z.literal('stream_started'),
  channel: WsChannelSchema,
  coin: z.string(),
  start: z.number(),
  end: z.number(),
});

export const WsStreamProgressSchema = z.object({
  type: z.literal('stream_progress'),
  snapshotsSent: z.number(),
});

export const TimestampedRecordSchema = z.object({
  timestamp: z.number(),
  data: z.unknown(),
});

export const WsHistoricalBatchSchema = z.object({
  type: z.literal('historical_batch'),
  channel: WsChannelSchema,
  coin: z.string(),
  data: z.array(TimestampedRecordSchema),
});

export const WsStreamCompletedSchema = z.object({
  type: z.literal('stream_completed'),
  channel: WsChannelSchema,
  coin: z.string(),
  snapshotsSent: z.number(),
});

export const WsStreamStoppedSchema = z.object({
  type: z.literal('stream_stopped'),
  snapshotsSent: z.number(),
});

// Union of all server messages
export const WsServerMessageSchema = z.discriminatedUnion('type', [
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
  WsHistoricalBatchSchema,
  WsStreamCompletedSchema,
  WsStreamStoppedSchema,
]);

// =============================================================================
// API Response Schemas (pre-built for common endpoints)
// =============================================================================

export const OrderBookResponseSchema = ApiResponseSchema(OrderBookSchema);
export const OrderBookArrayResponseSchema = ApiResponseSchema(z.array(OrderBookSchema));
export const TradeArrayResponseSchema = ApiResponseSchema(z.array(TradeSchema));
export const InstrumentResponseSchema = ApiResponseSchema(InstrumentSchema);
export const InstrumentArrayResponseSchema = ApiResponseSchema(z.array(InstrumentSchema));
export const FundingRateResponseSchema = ApiResponseSchema(FundingRateSchema);
export const FundingRateArrayResponseSchema = ApiResponseSchema(z.array(FundingRateSchema));
export const OpenInterestResponseSchema = ApiResponseSchema(OpenInterestSchema);
export const OpenInterestArrayResponseSchema = ApiResponseSchema(z.array(OpenInterestSchema));
export const CandleArrayResponseSchema = ApiResponseSchema(z.array(CandleSchema));
export const LiquidationArrayResponseSchema = ApiResponseSchema(z.array(LiquidationSchema));

// =============================================================================
// Type exports (inferred from schemas)
// =============================================================================

export type ValidatedApiMeta = z.infer<typeof ApiMetaSchema>;
export type ValidatedPriceLevel = z.infer<typeof PriceLevelSchema>;
export type ValidatedOrderBook = z.infer<typeof OrderBookSchema>;
export type ValidatedTrade = z.infer<typeof TradeSchema>;
export type ValidatedInstrument = z.infer<typeof InstrumentSchema>;
export type ValidatedFundingRate = z.infer<typeof FundingRateSchema>;
export type ValidatedOpenInterest = z.infer<typeof OpenInterestSchema>;
export type ValidatedCandle = z.infer<typeof CandleSchema>;
export type ValidatedLiquidation = z.infer<typeof LiquidationSchema>;
export type ValidatedWsServerMessage = z.infer<typeof WsServerMessageSchema>;
