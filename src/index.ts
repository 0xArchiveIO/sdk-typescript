/**
 * @0xarchive/sdk - Official TypeScript SDK for 0xarchive
 *
 * Historical Market Data API for these top-level venue APIs:
 * - Hyperliquid (perpetuals data from April 2023)
 * - Hyperliquid HIP-3 builder perps under the Hyperliquid namespace at /v1/hyperliquid/hip3 and client.hyperliquid.hip3
 * - Hyperliquid HIP-4 outcome markets at /v1/hyperliquid/hip4 and client.hyperliquid.hip4
 * - Hyperliquid Spot at /v1/hyperliquid/spot and client.spot (candles from 2025-03-22T10:50:22Z; trades from 2025-03-22; orderbook + L4 + TWAP live from 2026-05-05)
 * - Lighter, with two deployments: mainnet at /v1/lighter and client.lighter,
 *   and Robinhood Chain at /v1/rh-lighter and client.rhLighter
 * - Account positions on client.hyperliquid.positions, client.hyperliquid.hip3.positions,
 *   client.lighter.positions and client.rhLighter.positions
 * - Webhook management on client.webhooks, with verifyWebhookSignature and
 *   constructWebhookEvent for receivers
 * - The public symbol universe on client.symbols
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
 * // Lighter data
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
export {
  HyperliquidClient,
  Hip3Client,
  Hip4Client,
  LighterClient,
  LighterDeploymentClient,
  RhLighterClient,
  SpotClient,
} from './exchanges';

// Account positions and Lighter liquidations resources
export {
  HyperliquidPositionsResource,
  Hip3PositionsResource,
  LighterPositionsResource,
  LighterAccountsResource,
  LighterLiquidationsResource,
  type LighterAccountIndex,
} from './resources';

// API contract: version, error codes, venues
export {
  API_VERSION,
  API_VERSION_HEADER,
  ERROR_CODES,
  WEBSOCKET_ONLY_ERROR_CODES,
  VENUES,
  isErrorCode,
  type ErrorCode,
  type WebSocketOnlyErrorCode,
  type Venue,
} from './contract';

// WebSocket client and the channel capability table
export {
  OxArchiveWs,
  WS_CHANNEL_CAPABILITIES,
  WS_LIVE_CHANNELS,
  WS_REPLAY_CHANNELS,
  WS_BULK_REPLAY_CHANNELS,
  type WsChannelCapability,
} from './websocket';

// Order and L4 parameter types
export type { OrderHistoryParams, OrderFlowParams, TpslParams } from './resources/orders';
export type { L4OrderBookParams } from './resources/l4-orderbook';

// Orderbook Reconstructor — Lighter tick-level
export {
  OrderBookReconstructor,
  reconstructOrderBook,
  reconstructFinal,
  type TickData,
  type ReconstructedOrderBook,
  type ReconstructOptions,
} from './orderbook-reconstructor';

// L4 Orderbook Reconstructor — Hyperliquid / HIP-3
export {
  L4OrderBookReconstructor,
  type L4Order,
  type L2Level,
  type L4Diff,
  type L4Checkpoint,
} from './l4-reconstructor';

// L2 Full-Depth Orderbook resource
export {
  L2OrderBookResource,
  type L2OrderBookParams,
  type L2OrderBookHistoryParams,
} from './resources/l2-orderbook';
export type { L3OrderBookParams, L3OrderBookHistoryParams } from './resources/l3-orderbook';
export { Hip3BreadthResource } from './resources/hip3-breadth';

// CVD, HIP-3 oracle, HIP-4 questions, wallet classification and symbol resources
export {
  CvdResource,
  Hip3OracleResource,
  Hip4QuestionsResource,
  WalletsResource,
  SymbolsResource,
} from './resources';

// Webhooks: management resource and signature verification for your receiver
export { WebhooksResource } from './resources/webhooks';
export {
  constructWebhookEvent,
  verifyWebhookSignature,
  assertWebhookSignature,
  createWebhookSignatureHeader,
  parseWebhookSignatureHeader,
  readWebhookHeader,
  WebhookSignatureError,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_EVENT_ID_HEADER,
  WEBHOOK_EVENT_TYPE_HEADER,
  DEFAULT_WEBHOOK_TOLERANCE_SECONDS,
  type WebhookEvent,
  type WebhookHeaders,
  type WebhookPayload,
  type WebhookDeliveryContext,
  type WebhookVerificationFailure,
  type ParsedWebhookSignature,
  type VerifyWebhookOptions,
  type SubtleCryptoLike,
  type WebhookCryptoKey,
} from './webhook-signature';

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
  Hip4SideSchema,
  Hip4OpenInterestSchema,
  Hip4OpenInterestResponseSchema,
  Hip4OpenInterestArrayResponseSchema,
  // HIP-3 breadth schemas
  Hip3BreadthCountsSchema,
  Hip3BreadthNamespaceCountsSchema,
  Hip3BreadthSnapshotSchema,
  Hip3BreadthResponseSchema,
  Hip3BreadthArrayResponseSchema,
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
  // Lighter liquidation schemas (mainnet and Robinhood Chain)
  LighterLiquidationSchema,
  LighterLiquidationVolumeSchema,
  LighterLiquidationArrayResponseSchema,
  LighterLiquidationVolumeArrayResponseSchema,
  // Account positions schemas
  PositionSideSchema,
  PositionLeverageSchema,
  PositionCumFundingSchema,
  PositionSchema,
  MarketPositionSchema,
  PositionChangeSchema,
  AccountSummarySchema,
  MarketPositionsSummarySchema,
  WalletPositionsSchema,
  LighterL1AccountSchema,
  LighterL1AccountsSchema,
  WalletPositionsResponseSchema,
  PositionArrayResponseSchema,
  MarketPositionArrayResponseSchema,
  PositionChangeArrayResponseSchema,
  AccountSummaryArrayResponseSchema,
  MarketPositionsSummaryArrayResponseSchema,
  LighterL1AccountsResponseSchema,
  PositionsFreshnessSchema,
  PositionsFreshnessArrayResponseSchema,
  // Liquidation Levels schemas
  LiquidationLevelBucketSchema,
  LiquidationLevelsSchema,
  LiquidationLevelsResponseSchema,
  LiquidationLevelsHistoryItemSchema,
  LiquidationLevelsHistoryResponseSchema,
  // Trigger Levels schemas
  TriggerLevelBucketSchema,
  TriggerLevelsSchema,
  TriggerLevelsResponseSchema,
  TriggerLevelsHistoryItemSchema,
  TriggerLevelsHistoryResponseSchema,
  // Coin Freshness schemas
  DataTypeFreshnessInfoSchema,
  CoinFreshnessSchema,
  CoinFreshnessResponseSchema,
  SpotFreshnessSchema,
  SpotFreshnessResponseSchema,
  // Coin Summary schemas
  CoinSummarySchema,
  CoinSummaryResponseSchema,
  // Price Snapshot schemas
  PriceSnapshotSchema,
  PriceSnapshotArrayResponseSchema,
  // CVD schemas
  CvdBucketSchema,
  CvdBucketArrayResponseSchema,
  // HIP-3 oracle schemas
  Hip3OracleDiscoveryBoundsSchema,
  Hip3OracleExternalPriceSchema,
  Hip3OracleDiscoveryBoundsResponseSchema,
  Hip3OracleExternalPriceResponseSchema,
  // HIP-4 question schemas
  Hip4QuestionSchema,
  Hip4QuestionResponseSchema,
  Hip4QuestionArrayResponseSchema,
  // Wallet classification schemas
  WalletClassifyMetricsSchema,
  ClassifiedWalletSchema,
  WalletClassificationSchema,
  WalletClassificationResponseSchema,
  // Symbol universe schemas
  VenueSchema,
  CapabilitySchema,
  CapabilitiesResponseSchema,
  SymbolEntrySchema,
  SymbolsResponseSchema,
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
  WsL4SnapshotSchema,
  WsL4BatchSchema,
  WsL2FullDepthLevelSchema,
  WsL2FullDepthSnapshotDataSchema,
  WsL2FullDepthDeltaSchema,
  WsReplaySnapshotSchema,
  WsHistoricalDataSchema,
  WsStreamStartedSchema,
  WsStreamProgressSchema,
  TimestampedRecordSchema,
  WsHistoricalBatchSchema,
  WsStreamCompletedSchema,
  WsStreamStoppedSchema,
  WsOutcomeSettledSchema,
  // Live Lighter WebSocket payload schemas
  LighterLiveBookLevelSchema,
  LighterLiveOrderbookSchema,
  LighterLiveTradeSchema,
  LighterLiveTradesSchema,
  LighterLiveAssetCtxSchema,
  LighterLiveStatsSchema,
  // Validated types (inferred from schemas)
  type ValidatedApiMeta,
  type ValidatedPriceLevel,
  type ValidatedOrderBook,
  type ValidatedTrade,
  type ValidatedInstrument,
  type ValidatedFundingRate,
  type ValidatedOpenInterest,
  type ValidatedHip4OpenInterest,
  type ValidatedCandle,
  type ValidatedLiquidation,
  type ValidatedWsServerMessage,
  type ValidatedLighterLiveOrderbook,
  type ValidatedLighterLiveTrade,
  type ValidatedLighterLiveStats,
  type ValidatedLighterLiquidation,
  type ValidatedLighterLiquidationVolume,
  type ValidatedPosition,
  type ValidatedMarketPosition,
  type ValidatedPositionChange,
  type ValidatedAccountSummary,
  type ValidatedMarketPositionsSummary,
  type ValidatedWalletPositions,
  type ValidatedCvdBucket,
  type ValidatedHip3OracleDiscoveryBounds,
  type ValidatedHip3OracleExternalPrice,
  type ValidatedHip4Question,
  type ValidatedWalletClassification,
  type ValidatedSymbolEntry,
  type ValidatedCapability,
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
  // Capabilities
  Capability,
  CapabilityDatatype,
  // L4 order book snapshot
  L4RestingOrder,
  L4OrderBookSnapshot,
  // Trades
  Trade,
  GetTradesCursorParams,
  RecentTradesParams,
  TradeSideFilter,
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
  // HIP-3 breadth
  Hip3BreadthCounts,
  Hip3BreadthNamespaceCounts,
  Hip3BreadthSnapshot,
  Hip3BreadthHistoryParams,
  // Open Interest
  OpenInterest,
  Hip4OpenInterest,
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
  // Lighter liquidations (mainnet and Robinhood Chain)
  LighterLiquidation,
  LighterLiquidationVolume,
  // Account positions
  PositionSide,
  PositionsSource,
  PositionQuality,
  AccountSeen,
  PositionLeverage,
  PositionCumFunding,
  Position,
  MarketPosition,
  PositionChange,
  AccountSummary,
  MarketPositionsSummary,
  WalletPositions,
  LighterL1Account,
  LighterL1Accounts,
  PositionsFreshness,
  PositionsResponse,
  PositionsTime,
  PositionsGetParams,
  Hip3PositionsGetParams,
  PositionsRangeParams,
  Hip3PositionsRangeParams,
  Hip3PositionsAccountParams,
  PositionsAccountHistoryParams,
  Hip3PositionsAccountHistoryParams,
  PositionsMarketParams,
  LighterPositionsMarketParams,
  PositionsMarketSummaryParams,
  LighterPositionsMarketSummaryParams,
  PositionsMarketSummaryRangeParams,
  LighterPositionsMarketSummaryRangeParams,
  PositionsBulkParams,
  LighterPositionsBulkParams,
  LighterAccountsByL1Params,
  // Liquidation Levels
  LevelsSide,
  LiquidationLevelBucket,
  LiquidationLevels,
  LiquidationLevelsParams,
  LevelsHistoryParams,
  LiquidationLevelsHistoryItem,
  // Trigger Levels
  TriggerLevelBucket,
  TriggerLevels,
  TriggerLevelsParams,
  TriggerLevelsHistoryItem,
  // Coin Freshness
  DataTypeFreshnessInfo,
  CoinFreshness,
  SpotFreshness,
  // Coin Summary
  CoinSummary,
  // Price History
  PriceSnapshot,
  PriceHistoryParams,
  // CVD
  CvdInterval,
  CvdParams,
  CvdBucket,
  // HIP-3 oracle
  Hip3OracleDiscoveryBounds,
  Hip3OracleExternalPrice,
  // HIP-4 questions
  Hip4Question,
  Hip4ListQuestionsParams,
  // Wallet classification
  WalletClassifySort,
  WalletClassifyParams,
  WalletClassifyMetrics,
  ClassifiedWallet,
  WalletClassification,
  // Symbol universe
  SymbolEntry,
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
  HyperliquidCoreL4Channel,
  Hip3L4Channel,
  Hip4L4Channel,
  SpotL4Channel,
  HyperliquidL4LiveOnlyChannel,
  L4Channel,
  WsBulkReplayChannel,
  WsLiveOnlyChannel,
  FullDepthL2Channel,
  LighterLiveChannel,
  LighterReplayOnlyChannel,
  RhLighterLiveChannel,
  RhLighterReplayOnlyChannel,
  WsReplayableChannel,
  WsStandardReplayChannel,
  WsOptions,
  WsClientMessage,
  WsServerMessage,
  WsConnectionState,
  WsEventHandlers,
  WsSubscribe,
  WsSubscribeOptions,
  WsUnsubscribe,
  WsPing,
  WsSubscribed,
  WsUnsubscribed,
  WsPong,
  WsError,
  WsData,
  // WebSocket Replay (Option B)
  WsReplay,
  WsStandardReplay,
  WsStandardReplayOptions,
  WsBulkReplay,
  WsBulkReplayOptions,
  WsCoreL4Replay,
  WsCoreL4ReplayOptions,
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
  // WebSocket Bulk Stream (deprecated: discontinued on the server)
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
  WsL4SnapshotEntry,
  WsL4SnapshotData,
  WsL4DiffEvent,
  WsL4OrderEvent,
  WsL4BatchEvent,
  // Full-depth L2 WebSocket types
  WsL2FullDepthLevel,
  WsL2FullDepthSnapshotData,
  WsL2FullDepthDelta,
  WsL2FullDepthSnapshot,
  WsL2FullDepthBatch,
  // Live Lighter WebSocket payloads
  LighterLiveBookLevel,
  LighterLiveOrderbook,
  LighterLiveTrade,
  LighterLiveAssetCtx,
  LighterLiveStats,
  // HIP-4 settlement event
  WsOutcomeSettled,
  // Webhooks
  WebhookSubscriptionConfig,
  WebhookConditionCanonicalOperator,
  WebhookConditionOperator,
  WebhookCondition,
  WebhookParamDeclaration,
  WebhookMetricDeclaration,
  WebhookCostFloor,
  WebhookEventTypeDeclaration,
  WebhookEndpointStatus,
  WebhookEndpoint,
  CreatedWebhookEndpoint,
  CreateWebhookEndpointParams,
  RotatedWebhookSecret,
  WebhookPauseReason,
  WebhookSubscription,
  CreateWebhookSubscriptionParams,
  UpdateWebhookSubscriptionParams,
  WebhookReplayWindow,
  WebhookResumeGap,
  WebhookSubscriptionResumeResult,
  WebhookSubscriptionResumeAllResult,
  WebhookDeliveryState,
  WebhookDelivery,
  ListWebhookDeliveriesParams,
  WebhookTestFireResult,
  WebhookRedeliveryResult,
  WebhookWatchedAddress,
  WebhookWatchedAddressList,
  AddWebhookAddressParams,
  WebhookLimitUsage,
  WebhookDeliveryBudget,
  WebhookPausedSubscriptions,
  WebhookLimits,
  WebhookWindow,
  WebhookOccurrence,
  WebhookDryRunParams,
  WebhookDryRunResult,
  WebhookEstimateParams,
  WebhookDayCount,
  WebhookEstimateRung,
  WebhookEstimateDistribution,
  WebhookEstimateBasis,
  WebhookEstimateResult,
  // Errors
  ApiError,
  OxArchiveErrorDetails,
} from './types';

export { OxArchiveError } from './types';

// Default export for convenience
export { OxArchive as default } from './client';
