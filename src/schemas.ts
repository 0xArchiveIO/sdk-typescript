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
  coverageFrom: z.string().optional(),
  notice: z.string().optional(),
  // Finalization (Lighter trades, account positions)
  finalizedThrough: z.string().optional(),
  requestedEnd: z.string().optional(),
  clampedTo: z.string().optional(),
  preliminaryRowCount: z.number().optional(),
  // Account positions context
  asOf: z.string().optional(),
  snapshotTs: z.string().optional(),
  source: z.string().optional(),
  quality: z.string().optional(),
  stale: z.boolean().optional(),
  // Defined further down with the positions schemas.
  totals: z.lazy(() => MarketPositionsSummarySchema).optional(),
  builtThrough: z.string().optional(),
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
  accountIndex: z.string().optional(),
  makerAddress: z.string().optional(),
  takerAddress: z.string().optional(),
  builderAddress: z.string().optional(),
  builderFee: z.string().optional(),
  deployerFee: z.string().optional(),
  priorityGas: z.number().optional(),
  cloid: z.string().optional(),
  twapId: z.number().optional(),
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

/** HIP-4 side index: 0 = Yes, 1 = No. */
export const Hip4SideSchema = z.union([z.literal(0), z.literal(1)]);

/**
 * HIP-4 per-side open interest. This is intentionally separate from the
 * generic open-interest schema so Zod does not strip outcome identity fields.
 */
export const Hip4OpenInterestSchema = z.object({
  coin: z.string(),
  symbol: z.string(),
  outcomeId: z.number().int(),
  side: Hip4SideSchema,
  timestamp: z.string(),
  openInterest: z.string(),
  markPrice: z.string().nullable().optional(),
  midPrice: z.string().nullable().optional(),
});

// =============================================================================
// HIP-3 Breadth Schemas
// =============================================================================

const NonNegativeIntegerSchema = z.number().int().nonnegative();

export const Hip3BreadthCountsSchema = z.object({
  candidates: NonNegativeIntegerSchema,
  eligible: NonNegativeIntegerSchema,
  above: NonNegativeIntegerSchema,
  at: NonNegativeIntegerSchema,
  below: NonNegativeIntegerSchema,
  excludedNoSessionVolume: NonNegativeIntegerSchema,
  excludedStalePrice: NonNegativeIntegerSchema,
});

export const Hip3BreadthNamespaceCountsSchema = z.record(NonNegativeIntegerSchema);

export const Hip3BreadthSnapshotSchema = z.object({
  sessionDate: z.string(),
  calculatedAt: z.string(),
  valuePct: z.number().nullable(),
  coverageRatio: z.number().min(0).max(1),
  counts: Hip3BreadthCountsSchema,
  namespaces: z.object({
    eligible: Hip3BreadthNamespaceCountsSchema,
    above: Hip3BreadthNamespaceCountsSchema,
    at: Hip3BreadthNamespaceCountsSchema,
    below: Hip3BreadthNamespaceCountsSchema,
  }),
});

// =============================================================================
// Liquidation Schemas
// =============================================================================

// Liquidations now share the trade wire shape (each row is a fill with
// `is_liquidation: true`), so `side` follows the trade convention `A`/`B`
// rather than the legacy `B`/`S` long/short pair. See CHANGELOG 1.6.0.
export const LiquidationSideSchema = z.enum(['A', 'B']);

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

export const WsChannelSchema = z.enum([
  'orderbook', 'trades', 'candles', 'liquidations', 'ticker', 'all_tickers',
  'open_interest', 'funding',
  'lighter_orderbook', 'lighter_trades', 'lighter_candles',
  'lighter_open_interest', 'lighter_funding', 'lighter_l3_orderbook',
  'rh_lighter_orderbook', 'rh_lighter_trades', 'rh_lighter_candles',
  'rh_lighter_open_interest', 'rh_lighter_funding',
  'hip3_orderbook', 'hip3_trades', 'hip3_candles',
  'hip3_open_interest', 'hip3_funding', 'hip3_liquidations',
  'hip4_orderbook', 'hip4_trades', 'hip4_open_interest',
  'spot_orderbook', 'spot_trades', 'spot_l4_diffs', 'spot_l4_orders', 'spot_twap',
  'l4_diffs', 'l4_orders',
  'hip3_l4_diffs', 'hip3_l4_orders',
  'hip4_l4_diffs', 'hip4_l4_orders',
]);

export const WsConnectionStateSchema = z.enum(['connecting', 'connected', 'disconnected', 'reconnecting']);

// Server -> Client messages
export const WsSubscribedSchema = z.object({
  type: z.literal('subscribed'),
  channel: WsChannelSchema,
  coin: z.string().optional(),
  symbol: z.string().optional(),
});

export const WsUnsubscribedSchema = z.object({
  type: z.literal('unsubscribed'),
  channel: WsChannelSchema,
  coin: z.string().optional(),
  symbol: z.string().optional(),
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
  symbol: z.string().optional(),
  data: z.unknown(),
});

// Live Lighter payloads (the `data` of live lighter_* messages). Replay rows
// for the same channels keep their own shapes and are not described here.
export const LighterLiveBookLevelSchema = z.object({
  px: z.string(),
  sz: z.string(),
  n: z.number(),
});

export const LighterLiveOrderbookSchema = z.object({
  coin: z.string(),
  time: z.number(),
  levels: z.tuple([z.array(LighterLiveBookLevelSchema), z.array(LighterLiveBookLevelSchema)]),
});

export const LighterLiveTradeSchema = z.object({
  coin: z.string(),
  side: TradeSideSchema,
  px: z.string(),
  sz: z.string(),
  time: z.number(),
  hash: z.string().nullable(),
  tid: z.number(),
  oid: z.number().nullable(),
  crossed: z.boolean(),
  dir: z.string().nullable(),
  fee: z.string().nullable(),
  fee_token: z.string().nullable(),
  closed_pnl: z.string().nullable(),
  start_position: z.string().nullable(),
  users: z.array(z.string()),
});

export const LighterLiveTradesSchema = z.array(LighterLiveTradeSchema);

export const LighterLiveAssetCtxSchema = z.object({
  openInterest: z.string().nullable(),
  funding: z.string().nullable(),
  premium: z.string().nullable(),
  markPx: z.string().nullable(),
  oraclePx: z.string().nullable(),
  midPx: z.string().nullable(),
  dayNtlVlm: z.string().nullable(),
  dayBaseVlm: z.string().nullable(),
  prevDayPx: z.string().nullable(),
  impactPxs: z.null(),
});

export const LighterLiveStatsSchema = z.object({
  coin: z.string(),
  ctx: LighterLiveAssetCtxSchema,
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
  current_timestamp: z.number(),
});

export const WsReplayResumedSchema = z.object({
  type: z.literal('replay_resumed'),
  current_timestamp: z.number(),
});

export const WsReplayCompletedSchema = z.object({
  type: z.literal('replay_completed'),
  channel: WsChannelSchema,
  coin: z.string(),
  snapshots_sent: z.number(),
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

export const WsReplaySnapshotSchema = z.object({
  type: z.literal('replay_snapshot'),
  channel: WsChannelSchema,
  coin: z.string(),
  timestamp: z.number(),
  data: z.unknown(),
});

const WsL4ChannelSchema = z.enum([
  'l4_diffs', 'l4_orders',
  'hip3_l4_diffs', 'hip3_l4_orders',
  'hip4_l4_diffs', 'hip4_l4_orders',
  'spot_l4_diffs', 'spot_l4_orders',
]);

const WsL4SnapshotEntrySchema = z.tuple([z.string(), z.record(z.unknown())]);

export const WsL4SnapshotSchema = z.object({
  type: z.literal('l4_snapshot'),
  channel: WsL4ChannelSchema,
  coin: z.string(),
  symbol: z.string(),
  last_block_number: z.number().int().nonnegative(),
  timestamp: z.number().int(),
  data: z.object({
    bids: z.array(WsL4SnapshotEntrySchema),
    asks: z.array(WsL4SnapshotEntrySchema),
  }),
});

const WsL4DiffEventSchema = z.object({
  timestamp: z.number().int(),
  block_number: z.number().int().nonnegative(),
  seq: z.number().int().nonnegative(),
  oid: z.number().int().nonnegative(),
  user: z.string(),
  side: z.string(),
  price: z.number(),
  diff_type: z.string(),
  new_size: z.number().nullable(),
  insert_before: z.number().int().nonnegative().nullable(),
});

const WsL4OrderEventSchema = z.object({
  timestamp: z.number().int(),
  block_number: z.number().int().nonnegative(),
  seq: z.number().int().nonnegative(),
  oid: z.number().int().nonnegative(),
  user: z.string(),
  status: z.string(),
  side: z.string(),
  limit_price: z.number(),
  size: z.number(),
  orig_size: z.number(),
  order_type: z.string(),
  trigger_condition: z.string(),
  is_trigger: z.boolean(),
  trigger_price: z.number(),
  is_position_tpsl: z.boolean(),
  reduce_only: z.boolean(),
  tif: z.string().nullable(),
  cloid: z.string().nullable(),
});

export const WsL4BatchSchema = z.object({
  type: z.literal('l4_batch'),
  channel: WsL4ChannelSchema,
  coin: z.string(),
  symbol: z.string(),
  data: z.array(z.union([WsL4DiffEventSchema, WsL4OrderEventSchema])),
});

// Stream messages (bulk streaming has been discontinued; kept for compatibility)
/**
 * @deprecated Bulk streaming has been discontinued, so the server no longer
 * sends this message. For large dataset downloads, use the S3 Parquet bulk
 * export at https://www.0xarchive.io/data.
 */
export const WsStreamStartedSchema = z.object({
  type: z.literal('stream_started'),
  channel: WsChannelSchema,
  coin: z.string(),
  start: z.number(),
  end: z.number(),
});

/**
 * @deprecated Bulk streaming has been discontinued, so the server no longer
 * sends this message. For large dataset downloads, use the S3 Parquet bulk
 * export at https://www.0xarchive.io/data.
 */
export const WsStreamProgressSchema = z.object({
  type: z.literal('stream_progress'),
  snapshots_sent: z.number(),
});

/**
 * @deprecated Bulk streaming has been discontinued, so the server no longer
 * sends batches of these records. For large dataset downloads, use the S3
 * Parquet bulk export at https://www.0xarchive.io/data.
 */
export const TimestampedRecordSchema = z.object({
  timestamp: z.number(),
  data: z.unknown(),
});

/**
 * @deprecated Bulk streaming has been discontinued, so the server no longer
 * sends this message. For large dataset downloads, use the S3 Parquet bulk
 * export at https://www.0xarchive.io/data.
 */
export const WsHistoricalBatchSchema = z.object({
  type: z.literal('historical_batch'),
  channel: WsChannelSchema,
  coin: z.string(),
  data: z.array(TimestampedRecordSchema),
});

/**
 * @deprecated Bulk streaming has been discontinued, so the server no longer
 * sends this message. For large dataset downloads, use the S3 Parquet bulk
 * export at https://www.0xarchive.io/data.
 */
export const WsStreamCompletedSchema = z.object({
  type: z.literal('stream_completed'),
  channel: WsChannelSchema,
  coin: z.string(),
  snapshots_sent: z.number(),
});

/**
 * @deprecated Bulk streaming has been discontinued, so the server no longer
 * sends this message. For large dataset downloads, use the S3 Parquet bulk
 * export at https://www.0xarchive.io/data.
 */
export const WsStreamStoppedSchema = z.object({
  type: z.literal('stream_stopped'),
  snapshots_sent: z.number(),
});

/**
 * HIP-4 outcome settlement event. Fired once per `(outcome_id, side)` when the
 * outcome flips to settled. After delivery the server unsubscribes the client
 * from every hip4_* subscription on this coin — treat as a terminal signal.
 */
export const WsOutcomeSettledSchema = z.object({
  type: z.literal('outcome_settled'),
  coin: z.string(),
  outcome_id: z.number(),
  side: z.number(),
  settlement_value: z.number().optional(),
  settlement_at: z.string().optional(),
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
  WsL4SnapshotSchema,
  WsL4BatchSchema,
  WsReplaySnapshotSchema,
  WsHistoricalDataSchema,
  WsStreamStartedSchema,
  WsStreamProgressSchema,
  WsHistoricalBatchSchema,
  WsStreamCompletedSchema,
  WsStreamStoppedSchema,
  WsOutcomeSettledSchema,
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
export const Hip4OpenInterestResponseSchema = ApiResponseSchema(Hip4OpenInterestSchema);
export const Hip4OpenInterestArrayResponseSchema = ApiResponseSchema(z.array(Hip4OpenInterestSchema));
export const Hip3BreadthResponseSchema = ApiResponseSchema(Hip3BreadthSnapshotSchema);
export const Hip3BreadthArrayResponseSchema = ApiResponseSchema(z.array(Hip3BreadthSnapshotSchema));
export const CandleArrayResponseSchema = ApiResponseSchema(z.array(CandleSchema));
export const LiquidationArrayResponseSchema = ApiResponseSchema(z.array(LiquidationSchema));

// =============================================================================
// Liquidation Volume Schemas
// =============================================================================

export const LiquidationVolumeSchema = z.object({
  coin: z.string(),
  timestamp: z.string(),
  totalUsd: z.number(),
  longUsd: z.number(),
  shortUsd: z.number(),
  count: z.number(),
  longCount: z.number(),
  shortCount: z.number(),
});

export const LiquidationVolumeArrayResponseSchema = z.object({
  success: z.boolean().optional(),
  data: z.array(LiquidationVolumeSchema),
  meta: ApiMetaSchema.optional(),
});

// =============================================================================
// Lighter Liquidation Schemas (mainnet and Robinhood Chain)
// =============================================================================

export const LighterLiquidationSchema = z.object({
  symbol: z.string(),
  timestamp: z.number(),
  transactionTimeUs: z.number(),
  tradeId: z.number(),
  liquidationType: z.string(),
  price: z.number(),
  size: z.number(),
  usdAmount: z.number(),
  askAccount: z.string(),
  bidAccount: z.string(),
  askOrderId: z.number(),
  bidOrderId: z.number(),
  isMakerAsk: z.boolean(),
  takerPositionSizeBefore: z.number(),
  makerPositionSizeBefore: z.number(),
  takerEntryQuoteBefore: z.number(),
  makerEntryQuoteBefore: z.number(),
  takerInitialMarginFractionBefore: z.number(),
  makerInitialMarginFractionBefore: z.number(),
  takerAllocatedMarginUsdcBefore: z.number(),
  takerAllocatedMarginUsdcAfter: z.number(),
  makerAllocatedMarginUsdcBefore: z.number(),
  makerAllocatedMarginUsdcAfter: z.number(),
  takerFee: z.number(),
  makerFee: z.number(),
  takerPositionSignChanged: z.boolean(),
  makerPositionSignChanged: z.boolean(),
  blockHeight: z.number(),
  txHash: z.string(),
  rawJson: z.string(),
  source: z.string(),
});

export const LighterLiquidationVolumeSchema = z.object({
  symbol: z.string(),
  timestamp: z.number(),
  totalUsd: z.number(),
  count: z.number(),
});

export const LighterLiquidationArrayResponseSchema = ApiResponseSchema(z.array(LighterLiquidationSchema));
export const LighterLiquidationVolumeArrayResponseSchema = ApiResponseSchema(
  z.array(LighterLiquidationVolumeSchema)
);

// =============================================================================
// Account Positions Schemas
// =============================================================================

export const PositionSideSchema = z.enum(['long', 'short']);

export const PositionLeverageSchema = z.object({
  type: z.string(),
  value: z.string().nullable(),
});

export const PositionCumFundingSchema = z.object({
  allTime: z.string().nullable(),
  sinceOpen: z.string().nullable(),
  sinceChange: z.string().nullable(),
});

export const PositionSchema = z.object({
  snapshotTs: z.string().optional(),
  accountIndex: z.string().optional(),
  accountKind: z.string().optional(),
  symbol: z.string(),
  coin: z.string(),
  dex: z.string().optional(),
  size: z.string(),
  side: PositionSideSchema,
  entryPrice: z.string().nullable(),
  markPrice: z.string().nullable(),
  markTime: z.string().nullable(),
  positionValue: z.string().nullable(),
  unrealizedPnl: z.string().nullable(),
  returnOnEquity: z.string().nullable(),
  leverage: PositionLeverageSchema,
  maxLeverage: z.number().nullable(),
  marginUsed: z.string().nullable(),
  liquidationPrice: z.string().nullable(),
  liquidationPriceStatus: z.string(),
  cumFunding: PositionCumFundingSchema,
  openedAt: z.string().nullable(),
  snapshotAsOf: z.string().nullable(),
  quality: z.string(),
  initialMarginFraction: z.string().nullable().optional(),
  allocatedMargin: z.string().nullable().optional(),
  marginMode: z.string().optional(),
  markSource: z.string().optional(),
  finalized: z.boolean().optional(),
});

export const MarketPositionSchema = z.object({
  snapshotTs: z.string().optional(),
  userAddress: z.string().optional(),
  accountIndex: z.string().optional(),
  accountKind: z.string().optional(),
  symbol: z.string(),
  coin: z.string(),
  dex: z.string().optional(),
  size: z.string(),
  side: PositionSideSchema,
  entryPrice: z.string().nullable(),
  markPrice: z.string().nullable(),
  positionValue: z.string().nullable(),
  unrealizedPnl: z.string().nullable(),
  leverageType: z.string(),
  liquidationPrice: z.string().nullable(),
  quality: z.string(),
});

export const PositionChangeSchema = z.object({
  timestamp: z.string(),
  accountIndex: z.string().optional(),
  accountKind: z.string().optional(),
  symbol: z.string(),
  coin: z.string(),
  dex: z.string().optional(),
  side: TradeSideSchema,
  price: z.string().nullable(),
  size: z.string().nullable(),
  startPosition: z.string().nullable(),
  endPosition: z.string().nullable(),
  entryPriceAfter: z.string().nullable(),
  eventType: z.string(),
  cause: z.string(),
  direction: z.string().optional(),
  closedPnl: z.string().nullable().optional(),
  realizedPnl: z.string().optional(),
  fee: z.string().nullable(),
  feeToken: z.string(),
  crossed: z.boolean().optional(),
  isMaker: z.boolean().optional(),
  tradeId: z.number(),
  orderId: z.number().nullable(),
  openedAt: z.string().nullable(),
  seq: z.number().optional(),
  blockNumber: z.number().optional(),
  eventIndex: z.number().optional(),
  continuity: z.string(),
  positionSizeBefore: z.string().optional(),
  positionSizeAfter: z.string().optional(),
  feeRate: z.string().nullable().optional(),
  feeUsdc: z.string().nullable().optional(),
  usdcAmount: z.string().optional(),
  finalized: z.boolean().optional(),
});

export const AccountSummarySchema = z.object({
  snapshotTs: z.string().optional(),
  accountIndex: z.string().optional(),
  dex: z.string().optional(),
  accountValue: z.string().nullable().optional(),
  crossAccountValue: z.string().nullable().optional(),
  collateral: z.string().nullable().optional(),
  totalMarginUsed: z.string().nullable().optional(),
  crossMaintenanceMarginUsed: z.string().nullable().optional(),
  withdrawable: z.string().nullable().optional(),
  totalPositionValue: z.string().nullable(),
  totalUnrealizedPnl: z.string().nullable(),
  longValue: z.string().nullable(),
  shortValue: z.string().nullable(),
  nPositions: z.number(),
  accountMode: z.string().optional(),
  snapshotAsOf: z.string().nullable().optional(),
  quality: z.string(),
});

export const MarketPositionsSummarySchema = z.object({
  snapshotTs: z.string().nullable(),
  symbol: z.string(),
  coin: z.string(),
  dex: z.string().optional(),
  longCount: z.number(),
  shortCount: z.number(),
  longSize: z.string(),
  shortSize: z.string(),
  longValue: z.string().nullable(),
  shortValue: z.string().nullable(),
  longAvgEntryPrice: z.string().nullable(),
  shortAvgEntryPrice: z.string().nullable(),
  longPositionsWithEntry: z.number(),
  shortPositionsWithEntry: z.number(),
  longTop10ValueShare: z.string().nullable(),
  shortTop10ValueShare: z.string().nullable(),
  top10ValueShare: z.string().nullable(),
  quality: z.string(),
});

export const WalletPositionsSchema = z.object({
  positions: z.array(PositionSchema),
  account: AccountSummarySchema.nullable(),
  accountSeen: z.string().optional(),
});

export const LighterL1AccountSchema = z.object({
  accountIndex: z.string(),
  accountType: z.number(),
  firstSeen: z.string().nullable(),
});

export const LighterL1AccountsSchema = z.object({
  l1Address: z.string(),
  totalAccounts: z.number(),
  accounts: z.array(LighterL1AccountSchema),
});

export const WalletPositionsResponseSchema = ApiResponseSchema(WalletPositionsSchema);
export const PositionArrayResponseSchema = ApiResponseSchema(z.array(PositionSchema));
export const MarketPositionArrayResponseSchema = ApiResponseSchema(z.array(MarketPositionSchema));
export const PositionChangeArrayResponseSchema = ApiResponseSchema(z.array(PositionChangeSchema));
export const AccountSummaryArrayResponseSchema = ApiResponseSchema(z.array(AccountSummarySchema));
export const MarketPositionsSummaryArrayResponseSchema = ApiResponseSchema(z.array(MarketPositionsSummarySchema));
export const LighterL1AccountsResponseSchema = ApiResponseSchema(LighterL1AccountsSchema);

// =============================================================================
// Liquidation Levels Schemas (projected forced-liquidation levels)
// =============================================================================

export const LiquidationLevelBucketSchema = z.object({
  price: z.number(),
  longNotional: z.number(),
  shortNotional: z.number(),
  longCount: z.number(),
  shortCount: z.number(),
});

export const LiquidationLevelsSchema = z.object({
  midPrice: z.number(),
  snapshotTs: z.string(),
  blockNumber: z.number(),
  totalLong: z.number(),
  totalShort: z.number(),
  flaggedNotional: z.number(),
  levels: z.array(LiquidationLevelBucketSchema),
});

export const LiquidationLevelsResponseSchema = ApiResponseSchema(LiquidationLevelsSchema);

export const LiquidationLevelsHistoryItemSchema = z.object({
  snapshotTs: z.string(),
  blockNumber: z.number(),
  midPrice: z.number(),
  totalLong: z.number(),
  totalShort: z.number(),
  flaggedNotional: z.number(),
  levels: z.array(LiquidationLevelBucketSchema).optional(),
});

export const LiquidationLevelsHistoryResponseSchema = ApiResponseSchema(
  z.array(LiquidationLevelsHistoryItemSchema)
);

// =============================================================================
// Trigger Levels Schemas (pending stop-loss / take-profit orders)
// =============================================================================

export const TriggerLevelBucketSchema = z.object({
  priceBucket: z.number(),
  bidCount: z.number(),
  bidSize: z.number(),
  askCount: z.number(),
  askSize: z.number(),
});

export const TriggerLevelsSchema = z.object({
  midPrice: z.number(),
  asOf: z.string(),
  totalBidSize: z.number(),
  totalAskSize: z.number(),
  levels: z.array(TriggerLevelBucketSchema),
});

export const TriggerLevelsResponseSchema = ApiResponseSchema(TriggerLevelsSchema);

export const TriggerLevelsHistoryItemSchema = z.object({
  snapshotTs: z.string(),
  midPrice: z.number(),
  totalBidSize: z.number(),
  totalAskSize: z.number(),
  levels: z.array(TriggerLevelBucketSchema).optional(),
});

export const TriggerLevelsHistoryResponseSchema = ApiResponseSchema(
  z.array(TriggerLevelsHistoryItemSchema)
);

// =============================================================================
// Coin Freshness Schemas
// =============================================================================

export const DataTypeFreshnessInfoSchema = z.object({
  lastUpdated: z.string().nullable().optional(),
  lagMs: z.number().nullable().optional(),
});

export const CoinFreshnessSchema = z.object({
  coin: z.string(),
  exchange: z.string(),
  measuredAt: z.string(),
  orderbook: DataTypeFreshnessInfoSchema,
  trades: DataTypeFreshnessInfoSchema,
  funding: DataTypeFreshnessInfoSchema,
  openInterest: DataTypeFreshnessInfoSchema,
  liquidations: DataTypeFreshnessInfoSchema.optional(),
});

export const CoinFreshnessResponseSchema = z.object({
  success: z.boolean().optional(),
  data: CoinFreshnessSchema,
  meta: ApiMetaSchema.optional(),
});

// =============================================================================
// Coin Summary Schemas
// =============================================================================

export const CoinSummarySchema = z.object({
  coin: z.string(),
  timestamp: z.string(),
  markPrice: z.string().nullable().optional(),
  oraclePrice: z.string().nullable().optional(),
  midPrice: z.string().nullable().optional(),
  fundingRate: z.string().nullable().optional(),
  premium: z.string().nullable().optional(),
  openInterest: z.string().nullable().optional(),
  volume24h: z.string().nullable().optional(),
  liquidationVolume24h: z.number().nullable().optional(),
  longLiquidationVolume24h: z.number().nullable().optional(),
  shortLiquidationVolume24h: z.number().nullable().optional(),
});

export const CoinSummaryResponseSchema = z.object({
  success: z.boolean().optional(),
  data: CoinSummarySchema,
  meta: ApiMetaSchema.optional(),
});

// =============================================================================
// Price Snapshot Schemas
// =============================================================================

export const PriceSnapshotSchema = z.object({
  timestamp: z.string(),
  markPrice: z.string().nullable().optional(),
  oraclePrice: z.string().nullable().optional(),
  midPrice: z.string().nullable().optional(),
});

export const PriceSnapshotArrayResponseSchema = z.object({
  success: z.boolean().optional(),
  data: z.array(PriceSnapshotSchema),
  meta: ApiMetaSchema.optional(),
});

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
export type ValidatedHip4OpenInterest = z.infer<typeof Hip4OpenInterestSchema>;
export type ValidatedCandle = z.infer<typeof CandleSchema>;
export type ValidatedLiquidation = z.infer<typeof LiquidationSchema>;
export type ValidatedWsServerMessage = z.infer<typeof WsServerMessageSchema>;
export type ValidatedLighterLiveOrderbook = z.infer<typeof LighterLiveOrderbookSchema>;
export type ValidatedLighterLiveTrade = z.infer<typeof LighterLiveTradeSchema>;
export type ValidatedLighterLiveStats = z.infer<typeof LighterLiveStatsSchema>;
export type ValidatedLighterLiquidation = z.infer<typeof LighterLiquidationSchema>;
export type ValidatedLighterLiquidationVolume = z.infer<typeof LighterLiquidationVolumeSchema>;
export type ValidatedPosition = z.infer<typeof PositionSchema>;
export type ValidatedMarketPosition = z.infer<typeof MarketPositionSchema>;
export type ValidatedPositionChange = z.infer<typeof PositionChangeSchema>;
export type ValidatedAccountSummary = z.infer<typeof AccountSummarySchema>;
export type ValidatedMarketPositionsSummary = z.infer<typeof MarketPositionsSummarySchema>;
export type ValidatedWalletPositions = z.infer<typeof WalletPositionsSchema>;
