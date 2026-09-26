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
  /** Coverage start date (ISO 8601), present when the requested window ends before the symbol's coverage begins */
  coverageFrom?: string;
  /** Advisory notice explaining an empty response (e.g. window predates coverage) */
  notice?: string;
  /**
   * Finalization boundary (RFC 3339 UTC). Data before it is final and will not
   * change; data after it is preliminary. Set on Lighter trades (both
   * deployments) and on account-positions history and change routes.
   */
  finalizedThrough?: string;
  /**
   * The request's original `end` (RFC 3339 UTC), set only when the request was
   * clamped to `clampedTo`.
   */
  requestedEnd?: string;
  /**
   * Set only when the requested window ended past the served boundary: the
   * boundary it was clamped to (RFC 3339 UTC). On Lighter trades this equals
   * `finalizedThrough`; on account positions it equals `builtThrough`.
   */
  clampedTo?: string;
  /**
   * Number of preliminary (not yet reconciled) rows in the page. Set on routes
   * that intentionally serve the preliminary tier, such as Lighter
   * `/trades/{symbol}/recent`.
   */
  preliminaryRowCount?: number;
  /** Account positions: the instant (RFC 3339 UTC) the returned state describes, taken from the data. */
  asOf?: string;
  /** Account positions: the committed snapshot (RFC 3339 UTC) the response was read from. */
  snapshotTs?: string;
  /** Account positions: how the rows were produced (`snapshot`, `reconstructed` or `changes`). */
  source?: PositionsSource;
  /** Account positions: completeness of the snapshot the response was read from. */
  quality?: PositionQuality;
  /** Account positions: true when the latest live snapshot is older than 12 minutes (paired with `notice`). */
  stale?: boolean;
  /**
   * Account positions: totals over the whole filtered result set of a market
   * listing (not only this page). Sent on the first page only.
   */
  totals?: MarketPositionsSummary;
  /**
   * Account positions: every event before this instant (RFC 3339 UTC) is built
   * into the change log and the as-of state. Reads are clamped to it. Data up
   * to it may still be preliminary; `finalizedThrough` says how far it is final.
   */
  builtThrough?: string;
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
 * - 'checkpoint': ~60s intervals (default)
 * - '30s': 30 second intervals
 * - '10s': 10 second intervals
 * - '1s': 1 second intervals
 * - 'tick': Checkpoint + raw deltas
 */
export type LighterGranularity = 'checkpoint' | '30s' | '10s' | '1s' | 'tick';

export interface OrderBookHistoryParams extends CursorPaginationParams {
  /** Number of price levels to return per side */
  depth?: number;
  /**
   * Data resolution for Lighter orderbook history (Lighter.xyz only, ignored for Hyperliquid).
   * Controls the granularity of returned snapshots.
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
 * Trade/fill record with execution details.
 *
 * Lighter trade routes are fill-grain: when the route supplies counterparty
 * context, maker and taker information describes that individual fill rather
 * than a complete order lifecycle.
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
  /**
   * Fee paid on this fill in `feeToken`, including any builder fee; negative is
   * a rebate. `"0"` is a recorded zero fee. Absent when the source did not
   * record fees, for example fills from 2025-03-22 to 2025-05-25.
   */
  fee?: string;
  /** Fee denomination (e.g., USDC). Present exactly when `fee` and `closedPnl` were recorded. */
  feeToken?: string;
  /**
   * Realized PnL on this fill. `"0"` when the fill opened or added to a
   * position. Absent when the source did not record it (same cases as `fee`).
   */
  closedPnl?: string;
  /** Position direction */
  direction?: TradeDirection;
  /**
   * Position size (spot: balance) before this fill; negative is short. `"0"`
   * means flat. Absent when the source did not record it.
   */
  startPosition?: string;
  /** User's wallet address (for fill-level data from REST API) */
  userAddress?: string;
  /**
   * Lighter account index that owns this fill, as a string. Present on Lighter
   * trades (REST and live `lighter_trades`); Lighter identifies accounts by
   * index rather than wallet address.
   */
  accountIndex?: string;
  /** Maker's wallet address when the route provides per-fill maker/taker context */
  makerAddress?: string;
  /** Taker's wallet address when the route provides per-fill maker/taker context */
  takerAddress?: string;
  /** Builder address that routed this order. Present only when the order was placed through a builder. */
  builderAddress?: string;
  /** Builder fee charged on this fill, paid to the builder (in quote currency, typically USDC). Present only when builderAddress is set. */
  builderFee?: string;
  /** HIP-3 deployer fee share on this fill (in quote currency). Negative for the maker side (rebate), positive for the taker side. Present only on HIP-3 fills. */
  deployerFee?: string;
  /** Priority fee burned in HYPE (not USDC) for write priority on the Hyperliquid validator queue. Independent of builderFee and deployerFee — paid to the network, not to a builder or deployer. Present only when the order paid for priority. */
  priorityGas?: number;
  /** Client order ID */
  cloid?: string;
  /** TWAP execution ID */
  twapId?: number;
}

/**
 * Cursor-based pagination parameters (recommended)
 * More efficient than offset-based pagination for large datasets.
 * The API returns `next_cursor` as a numeric string. Treat it as an opaque
 * client value: pass the returned `nextCursor` unchanged to the next request;
 * do not parse or transform it.
 */
export interface CursorPaginationParams {
  /** Start timestamp (Unix ms or ISO string) - REQUIRED */
  start: number | string;
  /** End timestamp (Unix ms or ISO string) - REQUIRED */
  end: number | string;
  /** Opaque cursor from the previous response's `nextCursor`. */
  cursor?: number | string;
  /** Maximum number of results to return; route-specific (candle routes accept 10,000 or 1,000 by family). */
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
  /**
   * Response metadata, where the method returns it. Trade history returns it
   * so Lighter callers can read `finalizedThrough` and `clampedTo`.
   */
  meta?: ApiMeta;
}

// =============================================================================
// HIP-3 Breadth Types
// =============================================================================

/** Auditable counts behind a HIP-3 breadth-above-session-VWAP snapshot. */
export interface Hip3BreadthCounts {
  candidates: number;
  eligible: number;
  above: number;
  at: number;
  below: number;
  excludedNoSessionVolume: number;
  excludedStalePrice: number;
}

/** Per-builder namespace counts for one HIP-3 breadth snapshot. */
export type Hip3BreadthNamespaceCounts = Record<string, number>;

/**
 * Aggregate HIP-3 market breadth above the current UTC-session VWAP.
 *
 * `valuePct` is unavailable (`null`) when no instrument is eligible. It is
 * never a zero-filled substitute for an unavailable aggregate. `coverageRatio`
 * is `eligible / candidates`; the namespace maps are aggregate counts, not
 * per-symbol VWAP values.
 */
export interface Hip3BreadthSnapshot {
  /** UTC session date represented by the snapshot (history starts 2026-08-28). */
  sessionDate: string;
  /** UTC timestamp when the aggregate was calculated. */
  calculatedAt: string;
  /** Percentage of eligible instruments above session VWAP, or null if none are eligible. */
  valuePct: number | null;
  /** Ratio of eligible instruments to candidates, in the inclusive range 0..1. */
  coverageRatio: number;
  /** Auditable instrument eligibility and direction counts. */
  counts: Hip3BreadthCounts;
  /** Aggregate counts keyed by HIP-3 builder namespace. */
  namespaces: {
    eligible: Hip3BreadthNamespaceCounts;
    above: Hip3BreadthNamespaceCounts;
    at: Hip3BreadthNamespaceCounts;
    below: Hip3BreadthNamespaceCounts;
  };
}

/** Parameters for HIP-3 breadth-above-session-VWAP history. */
export interface Hip3BreadthHistoryParams {
  /** Range start, epoch milliseconds inclusive. Defaults to the route window. */
  start?: number;
  /** Range end, epoch milliseconds inclusive. Defaults to now. */
  end?: number;
  /** Opaque cursor returned as `nextCursor`; pass it through unchanged. */
  cursor?: string;
  /** Snapshots per page, from 1 through 1000. */
  limit?: number;
  /** Optional last-observation-downsampling interval. */
  interval?: OiFundingInterval;
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

/**
 * HIP-3 Builder Perps instrument with latest market data.
 * Derived from live open interest data.
 */
export interface Hip3Instrument {
  /** Full coin name (e.g., km:US500, xyz:XYZ100) */
  coin: string;
  /** Builder namespace (e.g., km, xyz) */
  namespace: string;
  /** Ticker within the namespace (e.g., US500, XYZ100) */
  ticker: string;
  /** Latest mark price */
  markPrice?: number;
  /** Latest open interest */
  openInterest?: number;
  /** Latest mid price */
  midPrice?: number;
  /** Timestamp of latest data point */
  latestTimestamp?: string;
}

/**
 * HIP-4 outcome-market per-side instrument metadata.
 *
 * Returned from `/v1/hyperliquid/hip4/instruments` and
 * `/v1/hyperliquid/hip4/instruments/{symbol}`. One row per side (`#0`, `#1`, ...).
 * Coin format: `#<10*outcome_id + side>` (e.g. `#0` = outcome 0 / Yes, `#1` = outcome 0 / No).
 *
 * Symbol path encoding: the backend accepts both the bare numeric form (`0`, `1`)
 * and the on-chain `#`-prefixed form (`#0`, `#1`). The bare numeric form is recommended
 * as the primary path. The SDK URL-encodes `#` to `%23` on the wire, so both forms
 * are accepted safely through `fetch` URL parsing.
 *
 * Note: HIP-4 `mark_price` / `midPrice` on related endpoints (open interest,
 * prices, summary) are implied probabilities in [0, 1], not USD prices.
 */
export interface Hip4Outcome {
  /** Numeric outcome id (groups two sides under a single market). */
  outcomeId: number;
  /** Side index within the outcome (0 = Yes, 1 = No). */
  side: number;
  /** Public asset_id: 100_000_000 + 10*outcome_id + side. */
  assetId: number;
  /** Coin string with leading `#` (e.g. `#0`). Backend also accepts the bare numeric form. */
  coin: string;
  /** Same as `coin` for HIP-4. */
  symbol: string;
  /** Human-readable market name including side suffix. */
  name?: string;
  /** Raw description string from upstream (pipe-delimited key:value pairs). */
  description?: string;
  /** Side label (e.g. "Yes", "No"). */
  sideName?: string;
  /** Recurring class (e.g. "priceBinary"). */
  recurringClass?: string;
  /** Underlying asset for recurring markets (e.g. "BTC"). */
  recurringUnderlying?: string;
  /** Expiry timestamp ISO-8601 for recurring markets. */
  recurringExpiry?: string;
  /** Target price strike for recurring price-binary markets. */
  recurringTargetPx?: number;
  /** Cadence for recurring markets (e.g. "1d"). */
  recurringPeriod?: string;
  /** Builder/deployer wallet address. */
  builderAddress?: string;
  /** True after settlement; ingester unsubscribes settled markets. */
  isSettled?: boolean;
  /** Settlement value (typically 1.0 = Yes won, 0.0 = No won). Set when isSettled=true. */
  settlementValue?: number;
  /** Settlement timestamp (ISO-8601). Set when isSettled=true. */
  settlementAt?: string;
  /** Per-side human-readable title (e.g. "BTC above 78,213 on May 4 at 06:00 UTC? — Yes"). */
  displayTitle?: string;
  /** Per-side URL slug (e.g. "btc-above-78213-yes-may-04-0600"). */
  slug?: string;
  /** When this outcome was first observed in upstream metadata. */
  firstSeenAt?: string;
  /** When this outcome metadata row was last updated. */
  lastUpdatedAt?: string;
}

/**
 * HIP-4 aggregated open-interest snapshot for a single outcome.
 * Populated only on the detail variant `/outcomes/{outcome_id}`; omitted on the list variant.
 */
export interface Hip4AggregatedOi {
  /** Latest open interest contracts on side 0 (Yes). */
  side0OpenInterestContracts?: number;
  /** Latest open interest contracts on side 1 (No). */
  side1OpenInterestContracts?: number;
  /** Display sum of both sides' open interest contracts. */
  outcomeDisplayOpenInterestContracts?: number;
  /** Number of fully-paired YES+NO sets outstanding. */
  pairedSetSupplyContracts?: number;
  /** True if both sides report identical supply (sanity check). */
  sideSupplyParity?: boolean;
  /** Quote currency (always "USDH" today). */
  currency?: string;
  /** When this aggregate was computed. */
  asOf?: string;
  /** Source timestamp for side 0 OI. */
  side0AsOf?: string;
  /** Source timestamp for side 1 OI. */
  side1AsOf?: string;
}

/**
 * HIP-4 outcome-market per-outcome aggregate metadata.
 *
 * Returned from `/v1/hyperliquid/hip4/outcomes` (list, no `aggregatedOi`),
 * `/v1/hyperliquid/hip4/outcomes/{outcome_id}` (detail, includes `aggregatedOi`),
 * and `/v1/hyperliquid/hip4/outcomes/by-slug/{slug}` (detail, includes `aggregatedOi`).
 * One row per outcome (combines both sides into a single market view).
 *
 * Note: HIP-4 mark/mid prices on related endpoints are implied probabilities
 * in [0, 1], not USD prices.
 */
export interface Hip4OutcomeAggregate {
  /** Numeric outcome id. */
  outcomeId: number;
  /** Underlying market name (without side suffix). */
  name?: string;
  /** Raw description string from upstream. */
  descriptionRaw?: string;
  /** Outcome class (e.g. "priceBinary"). */
  class?: string;
  /** Underlying asset (e.g. "BTC"). */
  underlying?: string;
  /** Expiry timestamp ISO-8601. */
  expiry?: string;
  /** Strike price for price-binary markets (USD, not a probability). */
  targetPrice?: number;
  /** Cadence (e.g. "1d"). */
  period?: string;
  /** Per-side specs for this outcome. */
  sideSpecs?: Hip4OutcomeSideSpec[];
  /** True after settlement. */
  isSettled?: boolean;
  /** Status (e.g. "live", "settled"). */
  status?: string;
  /** Source seen-at timestamp. */
  sourceSeenAt?: string;
  /** Outcome-level human-readable title (no side suffix). e.g. "BTC above 78,213 on May 4 at 06:00 UTC?" */
  displayTitle?: string;
  /** Outcome-level URL slug (e.g. "btc-above-78213-may-04-0600"). */
  slug?: string;
  /**
   * Two-element pair of side coins, ordered by side (`[#side0, #side1]`).
   * Convenience for clients that just want to know which `#N` codes belong to
   * this outcome without iterating `sideSpecs`.
   */
  outcomePair?: [string, string];
  /** Latest aggregated OI (detail endpoint only). */
  aggregatedOi?: Hip4AggregatedOi;
}

/** Per-side spec embedded in `Hip4OutcomeAggregate.sideSpecs`. */
export interface Hip4OutcomeSideSpec {
  /** Side index (0 = Yes, 1 = No). */
  side: number;
  /** Side label. */
  name?: string;
  /** Coin string (e.g. `#0`). */
  coin: string;
  /** Public asset_id. */
  assetId?: number;
  /** Per-side human-readable title. */
  displayTitle?: string;
  /** Per-side URL slug. */
  slug?: string;
}

/**
 * Hyperliquid Spot pair metadata.
 *
 * Returned from `/v1/hyperliquid/spot/pairs` and
 * `/v1/hyperliquid/spot/pairs/{symbol}`. Symbols are dashed canonical
 * (`HYPE-USDC`, `PURR-USDC`); the server resolves the dashed form to
 * Hyperliquid's wire formats (`PURR/USDC`, `@107`) internally.
 *
 * Spot has no funding, no open interest, and no liquidations. Candle history
 * is served separately through `SpotClient.candles` at
 * `/v1/hyperliquid/spot/candles/{symbol}` from 2025-03-22T10:50:22Z.
 */
export interface SpotPair {
  /** Dashed canonical symbol (e.g. `HYPE-USDC`, `PURR-USDC`). `coin` is an alias. */
  symbol: string;
  /** Alias of `symbol`. */
  coin?: string;
  /** Hyperliquid spot pair index (e.g. `0` for PURR/USDC; wire format `@<index>`). */
  pairIndex: number;
  /** Hyperliquid wire name (e.g. `PURR/USDC`). */
  name: string;
  /** Whether this is the canonical pair for the base token. */
  isCanonical: boolean;
  /** Base token id in the Hyperliquid spot token registry. */
  baseTokenId: number;
  /** Quote token id (0 = USDC). */
  quoteTokenId: number;
  /** Base token name (e.g. `HYPE`, `PURR`). */
  baseTokenName: string;
  /** Quote token name (typically `USDC`). */
  quoteTokenName: string;
  /** Base token size decimals. */
  baseSzDecimals: number;
  /** Base token wei decimals. */
  baseWeiDecimals: number;
  /** Quote token size decimals. */
  quoteSzDecimals: number;
  /** Quote token wei decimals. */
  quoteWeiDecimals: number;
  /** Base token EVM address. */
  baseTokenAddress?: string;
  /** Deployer fee share for the pair. */
  deployerFeeShare?: number;
  /** First time the pair appeared in the metadata table (rebuilds can reset this). */
  firstSeenAt?: string;
  /** Last metadata update time. */
  lastUpdatedAt?: string;
}

/**
 * Hyperliquid Spot TWAP status record.
 *
 * Returned from `/v1/hyperliquid/spot/twap/{symbol}` and
 * `/v1/hyperliquid/spot/twap/user/{user}`. TWAP statuses come from the L4
 * order stream; field shape mirrors the upstream Hyperliquid TWAP status.
 * Loosely typed because upstream includes a number of optional fields and
 * keeps adding to the schema.
 */
export interface SpotTwapStatus {
  /** Dashed canonical symbol (e.g. `HYPE-USDC`). */
  coin: string;
  /** Status timestamp (UTC). */
  timestamp: string;
  /** TWAP execution id assigned by Hyperliquid. */
  twapId?: number;
  /** User wallet address that owns the TWAP. */
  userAddress?: string;
  /** Side: `B` (buy) or `A` (sell). */
  side?: TradeSide;
  /** Total TWAP order size. */
  size?: number;
  /** Total executed size so far. */
  executedSize?: number;
  /** Notional executed in quote currency. */
  executedNotional?: number;
  /** TWAP minutes window length. */
  minutes?: number;
  /** True if the TWAP is randomized. */
  randomize?: boolean;
  /** Reduce-only flag. */
  reduceOnly?: boolean;
  /** Status string (`activated`, `terminated`, `error`, etc.). */
  status?: string;
  /** Block number the status was observed at. */
  blockNumber?: number;
  /** Block time of the status event (UTC). */
  blockTime?: string;
  /** When the TWAP started (UTC). */
  startedAt?: string;
  /** Error message when status is `error`. */
  error?: string;
}

/** Filter params for `/v1/hyperliquid/hip4/outcomes`. */
export interface Hip4ListOutcomesParams {
  /** Filter by settlement state. Omit to return all. */
  isSettled?: boolean;
  /**
   * Slug filter. When provided, the response is a single-element list (or empty)
   * containing the outcome whose per-outcome OR per-side slug matches. Composes
   * with `isSettled`.
   */
  slug?: string;
  /** Cursor for next page. */
  cursor?: number | string;
  /** Max results per page. */
  limit?: number;
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
  /** Funding rate as decimal (e.g., 0.0001 = 0.01%); Lighter is fractional and non-annualized. */
  fundingRate: string;
  /** Premium component of funding rate */
  premium?: string;
}

/**
 * Aggregation interval for OI and funding history.
 *
 * When omitted, the route's native/default cadence is returned. Cadence is
 * venue- and family-specific; callers should not infer a universal raw
 * one-minute interval from this shared type.
 */
export type OiFundingInterval = '5m' | '15m' | '30m' | '1h' | '4h' | '1d';

/**
 * Parameters for getting funding rate history
 */
export interface FundingHistoryParams extends CursorPaginationParams {
  /** Aggregation interval. When omitted, the route's native/default cadence is returned. */
  interval?: OiFundingInterval;
}

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
 * HIP-4 per-side open interest snapshot.
 *
 * HIP-4 outcome markets expose identity fields that are not part of the
 * generic open-interest contract. `markPrice` and `midPrice` are implied
 * probabilities in [0, 1], not USD prices. HIP-4 has no oracle price field.
 */
export interface Hip4OpenInterest {
  /** `#`-prefixed per-side coin identifier (for example, `#0`). */
  coin: string;
  /** Same value as `coin`, returned for cross-venue consistency. */
  symbol: string;
  /** Numeric outcome identifier shared by the Yes and No sides. */
  outcomeId: number;
  /** Side index within the outcome (0 = Yes, 1 = No). */
  side: 0 | 1;
  /** Snapshot timestamp (UTC). */
  timestamp: string;
  /** Open interest in contracts (notional currency: USDH). */
  openInterest: string;
  /** Implied probability in [0, 1], not a USD mark price. */
  markPrice?: string | null;
  /** Mid probability in [0, 1]. */
  midPrice?: string | null;
}

/**
 * Parameters for getting open interest history
 */
export interface OpenInterestHistoryParams extends CursorPaginationParams {
  /** Aggregation interval. When omitted, the route's native/default cadence is returned. */
  interval?: OiFundingInterval;
}

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
  /**
   * Trade side of the liquidating fill. Follows the trade convention:
   * `'A'` (ask, sell-side fill, long was liquidated) or `'B'` (bid, buy-side
   * fill, short was liquidated). Liquidations now share the trade wire shape
   * (each row is a fill with `is_liquidation: true`) so this matches the
   * `side` value on `Trade`. See CHANGELOG 1.6.0.
   */
  side: 'A' | 'B';
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
 * Parameters for getting liquidation history.
 *
 * Currently identical to `CursorPaginationParams`. Kept as a named type so
 * that future liquidation-specific filters (e.g. `side`, `minSize`) can be
 * added without breaking callers.
 */
export type LiquidationHistoryParams = CursorPaginationParams;

/**
 * Parameters for getting liquidations by user
 */
export interface LiquidationsByUserParams extends CursorPaginationParams {
  /** Optional coin filter */
  coin?: string;
}

// =============================================================================
// Liquidation Levels Types (projected forced-liquidation levels)
// =============================================================================

/** Side filter for level endpoints. bid/buy/B keeps the long (or bid) side; ask/sell/A keeps the short (or ask) side. */
export type LevelsSide = 'bid' | 'ask' | 'buy' | 'sell' | 'B' | 'A';

/**
 * One price bucket of projected forced-liquidation exposure.
 */
export interface LiquidationLevelBucket {
  /** Bucket center price */
  price: number;
  /** USD notional of long positions projected to liquidate in this bucket */
  longNotional: number;
  /** USD notional of short positions projected to liquidate in this bucket */
  shortNotional: number;
  /** Number of long positions in this bucket */
  longCount: number;
  /** Number of short positions in this bucket */
  shortCount: number;
}

/**
 * Projected forced-liquidation levels for one snapshot, computed from
 * clearinghouse positions and margin state. Snapshots refresh about every
 * five minutes; this is a measured cadence, not a hard guarantee. `snapshotTs`
 * identifies the snapshot served.
 */
export interface LiquidationLevels {
  /** Mark price at the snapshot, center of the requested range */
  midPrice: number;
  /** UTC snapshot time the levels reflect */
  snapshotTs: string;
  /** Hyperliquid block height the snapshot reflects */
  blockNumber: number;
  /** Total long notional at risk across the whole book */
  totalLong: number;
  /** Total short notional at risk across the whole book */
  totalShort: number;
  /** Notional computed approximately or not bucketed (HIP-3 cross-margin exposure) */
  flaggedNotional: number;
  /** Price buckets inside the requested range */
  levels: LiquidationLevelBucket[];
}

/**
 * Parameters for getting current liquidation levels
 */
export interface LiquidationLevelsParams {
  /** Percentage range around the mark price (1-50, default 10) */
  range_pct?: number;
  /** Number of price buckets (10-200, default 50) */
  buckets?: number;
  /** Side filter; the other side is zeroed */
  side?: LevelsSide;
  /** Point-in-time read: epoch ms. Serves the newest snapshot at or before this instant. History begins 2026-07-27. */
  at?: number;
}

/**
 * Parameters for level history endpoints (liquidation + trigger levels).
 * Cursor pagination: follow `nextCursor` as `cursor`.
 */
export interface LevelsHistoryParams {
  /** Range start, epoch ms inclusive. Default: 24h before end */
  start?: number | string;
  /** Range end, epoch ms inclusive. Default: now */
  end?: number | string;
  /** Cursor from the previous page's nextCursor (snapshot_ts ms, exclusive) */
  cursor?: string;
  /** Snapshots per page (1-100, default 24) */
  limit?: number;
  /** When true, items omit the levels array (cheap snapshot discovery) */
  summary?: boolean;
  /** Percentage range around each snapshot's mid (1-50, default 10) */
  range_pct?: number;
  /** Number of price buckets (10-200, default 50) */
  buckets?: number;
  /** Side filter; the other side is zeroed */
  side?: LevelsSide;
}

/**
 * One historical liquidation-levels snapshot. `levels` is omitted when
 * `summary: true` was requested.
 */
export interface LiquidationLevelsHistoryItem {
  snapshotTs: string;
  blockNumber: number;
  midPrice: number;
  totalLong: number;
  totalShort: number;
  flaggedNotional: number;
  levels?: LiquidationLevelBucket[];
}

// =============================================================================
// Trigger Levels Types (pending stop-loss / take-profit orders)
// =============================================================================

/**
 * Aggregated currently open trigger orders at one rounded price bucket.
 */
export interface TriggerLevelBucket {
  /** Rounded trigger price bucket */
  priceBucket: number;
  /** Number of bid-side trigger orders in the bucket */
  bidCount: number;
  /** Bid-side trigger size in the bucket */
  bidSize: number;
  /** Number of ask-side trigger orders in the bucket */
  askCount: number;
  /** Ask-side trigger size in the bucket */
  askSize: number;
}

/**
 * Currently pending stop-loss and take-profit trigger orders grouped into
 * price buckets. Voluntary trigger orders, not projected forced liquidations;
 * use liquidation levels for those.
 */
export interface TriggerLevels {
  /** Current mid/mark price, center of the requested range */
  midPrice: number;
  /** UTC RFC3339 server time the pending-trigger state was read */
  asOf: string;
  /** Total pending bid size across the returned window */
  totalBidSize: number;
  /** Total pending ask size across the returned window */
  totalAskSize: number;
  /** Price buckets inside the requested range */
  levels: TriggerLevelBucket[];
}

/**
 * Parameters for getting the current trigger-levels map
 */
export interface TriggerLevelsParams {
  /** Percentage range around the mid price (1-50, default 10) */
  range_pct?: number;
  /** Number of price buckets (10-200, default 50) */
  buckets?: number;
  /** Side filter; the other side is zeroed */
  side?: LevelsSide;
}

/**
 * One historical trigger-levels snapshot (15-minute cadence). `levels` is
 * omitted when `summary: true` was requested.
 */
export interface TriggerLevelsHistoryItem {
  snapshotTs: string;
  midPrice: number;
  totalBidSize: number;
  totalAskSize: number;
  levels?: TriggerLevelBucket[];
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
 * Parameters for getting candle history.
 *
 * All candle routes support `1m`, `5m`, `15m`, `30m`, `1h`, `4h`, `1d`, and
 * `1w` intervals. Maximum rows are route-specific: 10,000 for core
 * Hyperliquid, HIP-3, and Lighter, and 1,000 for HIP-4 and Hyperliquid Spot.
 * The API returns pagination cursors as numeric strings; treat them as opaque
 * client values and pass them through unchanged.
 */
export interface CandleHistoryParams extends CursorPaginationParams {
  /** Candle interval (default: 1h) */
  interval?: CandleInterval;
  /** Maximum results (default: 100; route max is 10,000 or 1,000 by family) */
  limit?: number;
}

// =============================================================================
// Aggregated Liquidation Volume Types
// =============================================================================

/** Pre-aggregated liquidation volume bucket */
export interface LiquidationVolume {
  /** Trading pair symbol */
  coin: string;
  /** Bucket timestamp (UTC) */
  timestamp: string;
  /** Total liquidation volume in USD (price * size) */
  totalUsd: number;
  /** Long liquidations volume */
  longUsd: number;
  /** Short liquidations volume */
  shortUsd: number;
  /** Total liquidation count */
  count: number;
  /** Long liquidation count */
  longCount: number;
  /** Short liquidation count */
  shortCount: number;
}

/** Parameters for getting aggregated liquidation volume */
export interface LiquidationVolumeParams extends CursorPaginationParams {
  /** Aggregation interval (default: 1h). Valid: 5m, 15m, 30m, 1h, 4h, 1d */
  interval?: OiFundingInterval;
}

// =============================================================================
// Lighter Liquidation Types (mainnet and Robinhood Chain)
// =============================================================================

/**
 * One Lighter liquidation trade, from `client.lighter.liquidations.history()`
 * or `client.rhLighter.liquidations.history()`.
 *
 * Lighter reports both accounts of the trade rather than a single liquidated
 * user: `askAccount` and `bidAccount` are Lighter account indices, and the
 * `taker*` / `maker*` fields describe each side's state before the trade.
 * Prices and sizes are numbers; `timestamp` is Unix milliseconds.
 *
 * Rows backfilled from the venue's finalized export have `source: 'bucket'`
 * and an empty `rawJson` (on Robinhood Chain, the span before live capture);
 * rows captured live have `source: 'ws'` and keep the full venue payload in
 * `rawJson`.
 */
export interface LighterLiquidation {
  /** Market symbol (perps uppercase, e.g. `BTC`). */
  symbol: string;
  /** Trade time (Unix ms). */
  timestamp: number;
  /** Intra-block ordering (microseconds). */
  transactionTimeUs: number;
  /** Lighter trade id. */
  tradeId: number;
  /** Venue liquidation type. */
  liquidationType: string;
  /** Execution price. */
  price: number;
  /** Size in base units. */
  size: number;
  /** Notional in the deployment's quote asset (USDC on mainnet, USDG on Robinhood Chain). */
  usdAmount: number;
  /** Account index on the ask side. */
  askAccount: string;
  /** Account index on the bid side. */
  bidAccount: string;
  askOrderId: number;
  bidOrderId: number;
  /** Whether the maker was on the ask side. */
  isMakerAsk: boolean;
  /** Taker's signed position before the trade (long positive, short negative). */
  takerPositionSizeBefore: number;
  /** Maker's signed position before the trade. */
  makerPositionSizeBefore: number;
  takerEntryQuoteBefore: number;
  makerEntryQuoteBefore: number;
  takerInitialMarginFractionBefore: number;
  makerInitialMarginFractionBefore: number;
  takerAllocatedMarginUsdcBefore: number;
  takerAllocatedMarginUsdcAfter: number;
  makerAllocatedMarginUsdcBefore: number;
  makerAllocatedMarginUsdcAfter: number;
  takerFee: number;
  makerFee: number;
  takerPositionSignChanged: boolean;
  makerPositionSignChanged: boolean;
  /** Lighter block height. */
  blockHeight: number;
  /** Lighter transaction hash. */
  txHash: string;
  /** The venue's trade payload as captured, or `''` for rows backfilled from the venue's finalized export. */
  rawJson: string;
  /** Where the row came from: `'ws'` for live capture, `'bucket'` for rows backfilled from the venue's finalized export. */
  source: string;
}

/**
 * Aggregated Lighter liquidation volume bucket. Lighter does not report a
 * reliable long/short direction on liquidations, so buckets carry the total
 * and the count only.
 */
export interface LighterLiquidationVolume {
  /** Market symbol. */
  symbol: string;
  /** Bucket start (Unix ms). */
  timestamp: number;
  /** Total liquidated notional in the deployment's quote asset. */
  totalUsd: number;
  /** Number of liquidation trades in the bucket. */
  count: number;
}

// =============================================================================
// Account Positions Types
// =============================================================================

/** Direction of an open position. A flat position has size `"0"`. */
export type PositionSide = 'long' | 'short';

/**
 * How positions rows were produced: `snapshot` (a committed live or hourly
 * snapshot), `reconstructed` (an as-of state between snapshots, rebuilt from
 * the change log) or `changes` (change-log rows).
 */
export type PositionsSource = 'snapshot' | 'reconstructed' | 'changes' | (string & {});

/**
 * Row or snapshot quality. `complete`, `partial` (for example a missing mark,
 * so value and PnL are null) and `degraded` apply everywhere; Lighter rows can
 * also read `preliminary` (built from not yet reconciled trades),
 * `unreconciled` (a market with real-time trades only) or `incomplete`.
 */
export type PositionQuality =
  | 'complete'
  | 'partial'
  | 'degraded'
  | 'preliminary'
  | 'unreconciled'
  | 'incomplete'
  | (string & {});

/**
 * Why a wallet or account returned no positions: `flat` (it traded but holds
 * nothing at that instant), `never_seen` (no recorded activity in the covered
 * history, with `meta.notice` and `meta.coverageFrom`) or `outside_coverage`
 * (the requested instant is before coverage begins).
 */
export type AccountSeen = 'flat' | 'never_seen' | 'outside_coverage' | (string & {});

/** Leverage of a position. On Lighter `type` is the margin mode and `value` is null. */
export interface PositionLeverage {
  /** `cross`, `isolated` or `unknown`. */
  type: 'cross' | 'isolated' | 'unknown' | (string & {});
  /** Leverage multiple as a decimal string, or null when unknown. */
  value: string | null;
}

/** Cumulative funding of a position, in USD, as of `snapshotAsOf`. */
export interface PositionCumFunding {
  allTime: string | null;
  sinceOpen: string | null;
  sinceChange: string | null;
}

/**
 * One position. Numbers are decimal strings (a flat position is `"0"`);
 * timestamps are RFC 3339 UTC strings.
 *
 * Hyperliquid rows carry `leverage`, margin, liquidation price and funding
 * fields; on Lighter those are null and the Lighter extras
 * (`accountIndex`, `accountKind`, `initialMarginFraction`, `allocatedMargin`,
 * `marginMode`, `markSource`, `finalized`) are set. Reconstructed rows
 * (`meta.source === 'reconstructed'`) carry exact size, entry and `openedAt`,
 * mark fields at the requested time, and null snapshot-only fields.
 */
export interface Position {
  /** Hour the row describes (history rows only). */
  snapshotTs?: string;
  /** Lighter account index, as a string. */
  accountIndex?: string;
  /** Lighter account kind: `user`, `settlement`, `insurance` or `system`. */
  accountKind?: string;
  symbol: string;
  /** Same value as `symbol`. */
  coin: string;
  /** HIP-3 dex. */
  dex?: string;
  /** Signed size (negative for shorts). */
  size: string;
  side: PositionSide;
  entryPrice: string | null;
  markPrice: string | null;
  markTime: string | null;
  positionValue: string | null;
  unrealizedPnl: string | null;
  returnOnEquity: string | null;
  leverage: PositionLeverage;
  maxLeverage: number | null;
  marginUsed: string | null;
  liquidationPrice: string | null;
  /**
   * `exact`, `not_published_cross` (cross liquidation prices are not
   * published), `changed_since_snapshot` or `unavailable`.
   */
  liquidationPriceStatus: string;
  cumFunding: PositionCumFunding;
  /** When the current position lifecycle opened. */
  openedAt: string | null;
  /** The instant leverage, funding and margin fields describe. */
  snapshotAsOf: string | null;
  quality: PositionQuality;
  /** Lighter: initial margin fraction at the last trade (e.g. `"0.05"`). */
  initialMarginFraction?: string | null;
  /** Lighter: isolated margin allocated to the position. */
  allocatedMargin?: string | null;
  /** Lighter: `cross`, `isolated` or `unknown`. */
  marginMode?: string;
  /** Lighter: where the mark came from (`mark`, `last_trade`, `stale_mark` or `none`). */
  markSource?: string;
  /** Lighter: true when every trade behind the row is reconciled. */
  finalized?: boolean;
}

/** Lean position record returned by market listings and the bulk route. */
export interface MarketPosition {
  /** Hour the row describes (bulk rows). */
  snapshotTs?: string;
  /** Hyperliquid wallet address. */
  userAddress?: string;
  /** Lighter account index, as a string. */
  accountIndex?: string;
  /** Lighter account kind. */
  accountKind?: string;
  symbol: string;
  coin: string;
  dex?: string;
  size: string;
  side: PositionSide;
  entryPrice: string | null;
  markPrice: string | null;
  positionValue: string | null;
  unrealizedPnl: string | null;
  /** `cross`, `isolated` or `unknown` (Lighter: the margin mode). */
  leverageType: string;
  liquidationPrice: string | null;
  quality: PositionQuality;
}

/**
 * One change-log leg: a trade (or settlement) that moved a position.
 * `side` is `B` / `A`, exactly as on trades.
 */
export interface PositionChange {
  timestamp: string;
  /** Lighter account index, as a string. */
  accountIndex?: string;
  /** Lighter account kind. */
  accountKind?: string;
  symbol: string;
  coin: string;
  dex?: string;
  side: TradeSide;
  price: string | null;
  size: string | null;
  startPosition: string | null;
  endPosition: string | null;
  /** Entry price after the leg; null when the leg leaves the position flat. */
  entryPriceAfter: string | null;
  /**
   * `open`, `increase`, `reduce`, `close` or `flip`; on Lighter a leg that
   * leaves the position unchanged is `settlement` (or `unchanged`).
   */
  eventType: string;
  /** `trade`, `liquidation`, `liquidation_counterparty`, `adl`, `settlement` or `unknown`. */
  cause: string;
  /** Hyperliquid direction (e.g. `Open Long`). */
  direction?: string;
  /** Hyperliquid closed PnL. */
  closedPnl?: string | null;
  /** Lighter realized PnL. */
  realizedPnl?: string;
  fee: string | null;
  feeToken: string;
  /** Hyperliquid: true for the taker leg. */
  crossed?: boolean;
  /** Lighter: true for the maker leg. */
  isMaker?: boolean;
  tradeId: number;
  orderId: number | null;
  openedAt: string | null;
  /** Hyperliquid in-block sequence. */
  seq?: number;
  /** Hyperliquid block context (present from 2026-09-17). */
  blockNumber?: number;
  eventIndex?: number;
  /** `ok`, `inferred`, `first_seen` or `quarantined`. */
  continuity: 'ok' | 'inferred' | 'first_seen' | 'quarantined' | (string & {});
  /** Lighter aliases of `startPosition` / `endPosition`. */
  positionSizeBefore?: string;
  positionSizeAfter?: string;
  feeRate?: string | null;
  feeUsdc?: string | null;
  usdcAmount?: string;
  /** True when the leg is final and will not be re-derived. */
  finalized?: boolean;
}

/**
 * Account summary. Hyperliquid returns the clearinghouse figures (one account
 * per address on core, one per dex on HIP-3); `accountValue`,
 * `crossAccountValue`, `collateral`, margin and `withdrawable` are
 * Hyperliquid only. A total with any unpriced position is null, never a
 * partial sum.
 */
export interface AccountSummary {
  /** Hour the row describes (history rows only). */
  snapshotTs?: string;
  /** Lighter account index. */
  accountIndex?: string;
  /** HIP-3 dex. */
  dex?: string;
  accountValue?: string | null;
  crossAccountValue?: string | null;
  collateral?: string | null;
  totalMarginUsed?: string | null;
  crossMaintenanceMarginUsed?: string | null;
  /** Present on some historical hourly rows only; null elsewhere. */
  withdrawable?: string | null;
  totalPositionValue: string | null;
  totalUnrealizedPnl: string | null;
  longValue: string | null;
  shortValue: string | null;
  nPositions: number;
  /** `standard`, `unified`, `portfolio`, `dex_abstraction` or `unknown`. */
  accountMode?: string;
  snapshotAsOf?: string | null;
  quality: PositionQuality;
}

/** Long/short aggregates of one market at one snapshot. */
export interface MarketPositionsSummary {
  snapshotTs: string | null;
  symbol: string;
  coin: string;
  dex?: string;
  longCount: number;
  shortCount: number;
  longSize: string;
  shortSize: string;
  longValue: string | null;
  shortValue: string | null;
  /** Average entry over the long positions whose entry is known. */
  longAvgEntryPrice: string | null;
  shortAvgEntryPrice: string | null;
  /** Positions the average entries cover. */
  longPositionsWithEntry: number;
  shortPositionsWithEntry: number;
  /** Share of long value held by the ten largest long positions (0 to 1). */
  longTop10ValueShare: string | null;
  shortTop10ValueShare: string | null;
  top10ValueShare: string | null;
  quality: PositionQuality;
}

/** `data` of a wallet or account positions request. */
export interface WalletPositions {
  positions: Position[];
  /**
   * Account summary on the first page of a snapshot read (Hyperliquid core,
   * HIP-3 with a `dex`, and Lighter without a `symbol` filter); null otherwise.
   */
  account: AccountSummary | null;
  /** Set only when `positions` is empty. */
  accountSeen?: AccountSeen;
}

/** One Lighter account owned by an L1 address. */
export interface LighterL1Account {
  accountIndex: string;
  accountType: number;
  firstSeen: string | null;
}

/** Lighter accounts owned by an L1 address (mainnet only). */
export interface LighterL1Accounts {
  l1Address: string;
  totalAccounts: number;
  accounts: LighterL1Account[];
}

/**
 * A positions response page: the data, the cursor for the next page, and the
 * response metadata (`asOf`, `snapshotTs`, `source`, `quality`, `stale`,
 * `builtThrough`, `finalizedThrough`, `totals` and the clamp fields).
 */
export interface PositionsResponse<T> extends CursorResponse<T> {
  meta: ApiMeta;
}

/**
 * A positions time value: Unix milliseconds, an ISO 8601 string, or a Date.
 * The SDK sends it as Unix milliseconds.
 */
export type PositionsTime = number | string | Date;

/** Parameters for a wallet or account positions read. */
export interface PositionsGetParams {
  /**
   * As-of instant. Omit for the latest live snapshot. An exact hour with a
   * committed snapshot serves that snapshot; any other instant is
   * reconstructed from the change log (state after every event before it).
   */
  timestamp?: PositionsTime;
  /** Restrict to one market. */
  symbol?: string;
  /** Opaque cursor from the previous page's `nextCursor`. */
  cursor?: string;
  /** Rows per page (default 500, max 5,000). */
  limit?: number;
}

/** Parameters for HIP-3 wallet reads (adds the dex filter). */
export interface Hip3PositionsGetParams extends PositionsGetParams {
  /** Restrict to one HIP-3 dex. */
  dex?: string;
}

/** Parameters for position history and change-log reads over `[start, end)`. */
export interface PositionsRangeParams {
  /** Inclusive start. */
  start: PositionsTime;
  /** Exclusive end. */
  end: PositionsTime;
  /** Restrict to one market. */
  symbol?: string;
  /** Opaque cursor from the previous page's `nextCursor`. */
  cursor?: string;
  /** Rows per page (default 500, max 5,000). */
  limit?: number;
}

/** HIP-3 history and change-log parameters (adds the dex filter). */
export interface Hip3PositionsRangeParams extends PositionsRangeParams {
  dex?: string;
}

/** Parameters for the HIP-3 account summary. Hyperliquid core takes none. */
export interface Hip3PositionsAccountParams {
  /** Restrict to one HIP-3 dex. Omit for one row per dex. */
  dex?: string;
}

/** Parameters for Hyperliquid hourly account history over `[start, end)`. */
export interface PositionsAccountHistoryParams {
  /** Inclusive start. */
  start: PositionsTime;
  /** Exclusive end. */
  end: PositionsTime;
  /** Opaque cursor from the previous page's `nextCursor`. */
  cursor?: string;
  /** Rows per page (default 500, max 5,000). */
  limit?: number;
}

/** HIP-3 account history parameters (adds the dex filter). */
export interface Hip3PositionsAccountHistoryParams extends PositionsAccountHistoryParams {
  /** Restrict to one HIP-3 dex. */
  dex?: string;
}

/** Parameters for every open position in one market. */
export interface PositionsMarketParams {
  /** A committed hourly snapshot (an exact UTC hour). Omit for the latest live snapshot. */
  hour?: PositionsTime;
  /** Only long or only short positions. */
  side?: PositionSide;
  /** Minimum position value in USD. */
  minValue?: number;
  cursor?: string;
  /** Rows per page (default 100, max 2,000). */
  limit?: number;
}

/** Lighter market listing parameters (adds system accounts). */
export interface LighterPositionsMarketParams extends PositionsMarketParams {
  /** Include settlement, insurance and other system accounts (default false). */
  includeSystem?: boolean;
}

/**
 * Parameters for a market's long/short summary. Omit `start` and `end` for
 * the latest live snapshot (one point); pass them for an hourly series over
 * `[start, end)` (at most 168 hours per page).
 *
 * An omitted `end` means "now", and a series cursor is bound to the window it
 * was issued for, so a later request without `end` cannot use it. To page
 * with `cursor`, send the same explicit `start` and `end` on every page; the
 * SDK refuses a `cursor` without an `end` before sending.
 */
export interface PositionsMarketSummaryParams {
  /** Inclusive start of the hourly series (default: 24 hours before `end`). */
  start?: PositionsTime;
  /** Exclusive end of the hourly series (default: now). Required when paging. */
  end?: PositionsTime;
  /** Opaque cursor from the previous page's `nextCursor`. */
  cursor?: string;
  /** Points per page (default 100, at most 168). */
  limit?: number;
}

/** Lighter market summary parameters (adds system accounts). */
export interface LighterPositionsMarketSummaryParams extends PositionsMarketSummaryParams {
  /** Include settlement, insurance and other system accounts (default false). */
  includeSystem?: boolean;
}

/**
 * Parameters for iterating a market's hourly summary series over
 * `[start, end)`. Both bounds are required so that every page asks for the
 * same window.
 */
export interface PositionsMarketSummaryRangeParams extends PositionsMarketSummaryParams {
  /** Inclusive start. */
  start: PositionsTime;
  /** Exclusive end. */
  end: PositionsTime;
}

/** Lighter market summary iteration parameters (adds system accounts). */
export interface LighterPositionsMarketSummaryRangeParams extends LighterPositionsMarketSummaryParams {
  /** Inclusive start. */
  start: PositionsTime;
  /** Exclusive end. */
  end: PositionsTime;
}

/** Parameters for every open position across markets at one hour (bulk). */
export interface PositionsBulkParams {
  /** A committed hourly snapshot (an exact UTC hour). */
  hour: PositionsTime;
  cursor?: string;
  /** Rows per page (default 1,000, max 2,000). */
  limit?: number;
}

/** Lighter bulk parameters (adds system accounts). */
export interface LighterPositionsBulkParams extends PositionsBulkParams {
  includeSystem?: boolean;
}

/** Parameters for resolving Lighter accounts by L1 address. */
export interface LighterAccountsByL1Params {
  cursor?: string;
  /** Accounts per page (default 500, max 5,000). */
  limit?: number;
}

// =============================================================================
// Per-Coin Freshness Types
// =============================================================================

/** Freshness data for a single data type */
export interface DataTypeFreshnessInfo {
  /** Last update timestamp */
  lastUpdated?: string;
  /** Lag in milliseconds */
  lagMs?: number;
}

/** Per-coin freshness across all data types */
export interface CoinFreshness {
  /** Coin symbol */
  coin: string;
  /** Exchange name */
  exchange: string;
  /** When this measurement was taken */
  measuredAt: string;
  /** Orderbook freshness */
  orderbook: DataTypeFreshnessInfo;
  /** Trades freshness */
  trades: DataTypeFreshnessInfo;
  /** Funding freshness */
  funding: DataTypeFreshnessInfo;
  /** Open interest freshness */
  openInterest: DataTypeFreshnessInfo;
  /** Liquidations freshness (Hyperliquid only) */
  liquidations?: DataTypeFreshnessInfo;
}

// =============================================================================
// Coin Summary Types
// =============================================================================

/** Combined market summary for a coin */
export interface CoinSummary {
  /** Trading pair symbol */
  coin: string;
  /** Timestamp (UTC) */
  timestamp: string;
  /** Latest mark price */
  markPrice?: string;
  /** Latest oracle price */
  oraclePrice?: string;
  /** Latest mid price */
  midPrice?: string;
  /** Current funding rate */
  fundingRate?: string;
  /** Funding premium */
  premium?: string;
  /** Current open interest */
  openInterest?: string;
  /** 24h notional trading volume */
  volume24h?: string;
  /** 24h total liquidation volume in USD */
  liquidationVolume24h?: number;
  /** 24h long liquidation volume in USD */
  longLiquidationVolume24h?: number;
  /** 24h short liquidation volume in USD */
  shortLiquidationVolume24h?: number;
}

// =============================================================================
// Price History Types
// =============================================================================

/** Price snapshot from OI data */
export interface PriceSnapshot {
  /** Timestamp (UTC) */
  timestamp: string;
  /** Mark price */
  markPrice?: string;
  /** Oracle price */
  oraclePrice?: string;
  /** Mid price */
  midPrice?: string;
}

/** Parameters for price history */
export interface PriceHistoryParams extends CursorPaginationParams {
  /** Aggregation interval. When omitted, the projected route's native/default cadence is returned. */
  interval?: OiFundingInterval;
}

// =============================================================================
// WebSocket Types
// =============================================================================

/**
 * WebSocket channel types.
 *
 * - ticker/all_tickers: live subscriptions only
 * - liquidations: live + replay (Hyperliquid; live as of 1.6.0)
 * - hip3_liquidations: live + replay (HIP-3; live as of 1.6.0)
 * - lighter_orderbook, lighter_trades, lighter_open_interest, lighter_funding:
 *   live subscriptions + historical replay. Live messages use the
 *   Hyperliquid-style payloads described by `LighterLiveOrderbook`,
 *   `LighterLiveTrade` and `LighterLiveStats`; replay rows keep their own
 *   shapes.
 * - lighter_candles, lighter_l3_orderbook: historical replay only; use Lighter
 *   REST for current data
 * - rh_lighter_orderbook, rh_lighter_trades, rh_lighter_open_interest,
 *   rh_lighter_funding: Lighter on Robinhood Chain (the second Lighter
 *   deployment), live subscriptions + historical replay. Live payloads have
 *   the same shapes as the mainnet `lighter_*` live payloads. Live data is
 *   served on `wss://api.0xarchive.io/ws` only.
 * - rh_lighter_candles: Lighter on Robinhood Chain candles, historical replay
 *   only (once candles are enabled for that deployment)
 * - open_interest, funding: Hyperliquid core live subscriptions + historical
 *   replay
 * - hip3_open_interest, hip3_funding: historical only (replay)
 *
 * HIP-4 channels (outcome contracts; no funding or liquidations):
 * - hip4_trades: realtime + replay
 * - hip4_orderbook, hip4_open_interest: stored replay only; live bridges paused
 * - l4_diffs, l4_orders: Hyperliquid core live data and bounded replay. Core
 *   replay starts with `l4_snapshot`, followed by ordered `l4_batch` pages.
 * - hip3_l4_diffs, hip3_l4_orders, hip4_l4_diffs, hip4_l4_orders,
 *   spot_l4_diffs, spot_l4_orders: real-time only
 *
 * Liquidation messages share the trade wire format: each item is a fill row
 * with `is_liquidation: true`.
 */
export type WsChannel =
  | 'orderbook' | 'trades' | 'candles' | 'liquidations' | 'ticker' | 'all_tickers'
  | 'open_interest' | 'funding'
  | 'lighter_orderbook' | 'lighter_trades' | 'lighter_candles'
  | 'lighter_open_interest' | 'lighter_funding' | 'lighter_l3_orderbook'
  | 'rh_lighter_orderbook' | 'rh_lighter_trades' | 'rh_lighter_candles'
  | 'rh_lighter_open_interest' | 'rh_lighter_funding'
  | 'hip3_orderbook' | 'hip3_trades' | 'hip3_candles'
  | 'hip3_open_interest' | 'hip3_funding' | 'hip3_liquidations'
  | 'hip4_orderbook' | 'hip4_trades' | 'hip4_open_interest'
  | 'spot_orderbook' | 'spot_trades' | 'spot_l4_diffs' | 'spot_l4_orders' | 'spot_twap'
  | 'l4_diffs' | 'l4_orders'
  | 'hip3_l4_diffs' | 'hip3_l4_orders'
  | 'hip4_l4_diffs' | 'hip4_l4_orders';

/** Hyperliquid core L4 channels with checkpoint-anchored replay support. */
export type HyperliquidCoreL4Channel = 'l4_diffs' | 'l4_orders';

/** HIP-3 L4 channels. These channels are live-only. */
export type Hip3L4Channel = 'hip3_l4_diffs' | 'hip3_l4_orders';

/** HIP-4 L4 channels. These channels are live-only. */
export type Hip4L4Channel = 'hip4_l4_diffs' | 'hip4_l4_orders';

/** Hyperliquid Spot L4 channels. These channels are live-only. */
export type SpotL4Channel = 'spot_l4_diffs' | 'spot_l4_orders';

/** L4 channels that must not be sent in a historical replay request. */
export type HyperliquidL4LiveOnlyChannel = Hip3L4Channel | Hip4L4Channel | SpotL4Channel;

/** Lighter channels that accept live subscriptions as well as replay. */
export type LighterLiveChannel =
  | 'lighter_orderbook'
  | 'lighter_trades'
  | 'lighter_open_interest'
  | 'lighter_funding';

/** Lighter channels that support historical replay only. */
export type LighterReplayOnlyChannel = 'lighter_candles' | 'lighter_l3_orderbook';

/**
 * Lighter on Robinhood Chain channels that accept live subscriptions as well
 * as replay. Live payloads use the same shapes as the mainnet channels
 * (`LighterLiveOrderbook`, `LighterLiveTrade`, `LighterLiveStats`).
 */
export type RhLighterLiveChannel =
  | 'rh_lighter_orderbook'
  | 'rh_lighter_trades'
  | 'rh_lighter_open_interest'
  | 'rh_lighter_funding';

/** Lighter on Robinhood Chain channels that support historical replay only. */
export type RhLighterReplayOnlyChannel = 'rh_lighter_candles';

/** Replay-capable channels, including the existing Lighter replay channels. */
export type WsReplayableChannel = Exclude<WsChannel, HyperliquidL4LiveOnlyChannel>;

/** Replay-capable channels other than the dedicated core L4 replay path. */
export type WsStandardReplayChannel = Exclude<WsReplayableChannel, HyperliquidCoreL4Channel>;

/** Subscribe message from client */
export interface WsSubscribe {
  op: 'subscribe';
  channel: WsChannel;
  /** Wire field for coin/symbol. The server accepts `symbol` (canonical)
   * and `coin` (deprecated alias) during the migration period. */
  symbol?: string;
  /** @deprecated Use `symbol`. The server still accepts `coin` for now. */
  coin?: string;
  /**
   * `lighter_orderbook` and `rh_lighter_orderbook` only: the newest book is
   * sent at most once per this many milliseconds (integer, 100 to 5000
   * inclusive). Omitted means one book a second. The server rejects it on
   * every other channel.
   */
  interval_ms?: number;
}

/** Options for a live subscription. */
export interface WsSubscribeOptions {
  /**
   * `lighter_orderbook` and `rh_lighter_orderbook` only: send the newest book
   * at most once per this many milliseconds. Must be an integer from 100 to
   * 5000 inclusive; leave it out for one book a second. Each book sent is one
   * metered message. Sent on the wire as `interval_ms`.
   */
  intervalMs?: number;
}

/** Unsubscribe message from client */
export interface WsUnsubscribe {
  op: 'unsubscribe';
  channel: WsChannel;
  symbol?: string;
  /** @deprecated Use `symbol`. */
  coin?: string;
}

/** Ping message from client */
export interface WsPing {
  op: 'ping';
}

/** Common options for standard timed replay channels. */
export interface WsStandardReplayOptions {
  /** Start timestamp (Unix ms). */
  start: number;
  /** End timestamp (Unix ms, defaults to now for standard replay). */
  end?: number;
  /** Playback speed multiplier (1 = real-time, 10 = 10x faster). */
  speed?: number;
  /** Data resolution for Lighter orderbook channels. */
  granularity?: string;
  /** Candle or aggregate interval for supported channels. */
  interval?: string;
}

/** Standard replay request, including Lighter replay. */
export interface WsStandardReplay extends WsStandardReplayOptions {
  op: 'replay';
  /** Single channel for replay. Mutually exclusive with `channels`. */
  channel?: WsStandardReplayChannel;
  /** Multiple channels for multi-channel replay. Mutually exclusive with `channel`. */
  channels?: WsStandardReplayChannel[];
  symbol?: string;
  /** @deprecated Use `symbol`. */
  coin?: string;
}

/** Options for checkpoint-anchored Hyperliquid core L4 replay. */
export interface WsCoreL4ReplayOptions {
  /** Start timestamp (Unix ms). */
  start: number;
  /** Required end timestamp (Unix ms) for the bounded L4 replay. */
  end: number;
  /** Accepted for API compatibility but ignored by the bulk L4 replay task. */
  speed?: number;
}

/**
 * Hyperliquid core L4 replay request. The server emits one `l4_snapshot`
 * anchor, then one or more `l4_batch` pages ordered by `(block_number, seq)`.
 * `end` is required because this is a bounded bulk replay; `speed` is ignored.
 */
export interface WsCoreL4Replay extends WsCoreL4ReplayOptions {
  op: 'replay';
  channel: HyperliquidCoreL4Channel;
  /** Core L4 replay is single-channel only. */
  channels?: never;
  symbol?: string;
  /** @deprecated Use `symbol`. */
  coin?: string;
}

/** Replay request union with live-only HIP-3, HIP-4, and Spot L4 excluded. */
export type WsReplay = WsStandardReplay | WsCoreL4Replay;

/** Replay control messages */
export interface WsReplayPause { op: 'replay.pause'; }
export interface WsReplayResume { op: 'replay.resume'; }
export interface WsReplaySeek { op: 'replay.seek'; timestamp: number; }
export interface WsReplayStop { op: 'replay.stop'; }

/**
 * Stream message from client - bulk download historical data.
 *
 * @deprecated Bulk streaming has been discontinued on the server, which
 * answers this request with an `error` message and sends no data. For large
 * dataset downloads, use the S3 Parquet bulk export at
 * https://www.0xarchive.io/data.
 */
export interface WsStream {
  op: 'stream';
  /** Single channel for streaming. Mutually exclusive with `channels`. */
  channel?: WsChannel;
  /** Multiple channels for multi-channel streaming. Mutually exclusive with `channel`. */
  channels?: WsChannel[];
  symbol?: string;
  /** @deprecated Use `symbol`. */
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

/**
 * Stream control message.
 *
 * @deprecated Bulk streaming has been discontinued on the server, which
 * answers this request with an `error` message and sends no data. For large
 * dataset downloads, use the S3 Parquet bulk export at
 * https://www.0xarchive.io/data.
 */
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
  /** Canonical symbol echoed by the server (Lighter symbols, on both deployments, are echoed uppercase). */
  symbol?: string;
}

/** Unsubscription confirmed from server */
export interface WsUnsubscribed {
  type: 'unsubscribed';
  channel: WsChannel;
  coin?: string;
  /** Canonical symbol echoed by the server. */
  symbol?: string;
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
  /** Canonical symbol; the same value as `coin`. */
  symbol?: string;
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

/**
 * Replay snapshot providing initial state for a channel before the timeline starts.
 * Sent in multi-channel replay mode to provide the most recent data point
 * for each channel at the replay start time. This allows clients to initialize
 * their state (e.g., current orderbook, latest funding rate) before timeline
 * data begins arriving via `historical_data` messages.
 */
export interface WsReplaySnapshot<T = unknown> {
  type: 'replay_snapshot';
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

/**
 * Stream started response.
 *
 * @deprecated Bulk streaming has been discontinued, so the server no longer
 * sends this message. For large dataset downloads, use the S3 Parquet bulk
 * export at https://www.0xarchive.io/data.
 */
export interface WsStreamStarted {
  type: 'stream_started';
  channel: WsChannel;
  coin: string;
  /** Start timestamp in milliseconds */
  start: number;
  /** End timestamp in milliseconds */
  end: number;
}

/**
 * Stream progress response (sent periodically during streaming).
 *
 * @deprecated Bulk streaming has been discontinued, so the server no longer
 * sends this message. For large dataset downloads, use the S3 Parquet bulk
 * export at https://www.0xarchive.io/data.
 */
export interface WsStreamProgress {
  type: 'stream_progress';
  snapshots_sent: number;
}

/**
 * A record with timestamp for batched data (bulk streaming).
 *
 * @deprecated Bulk streaming has been discontinued, so the server no longer
 * sends batches of these records. For large dataset downloads, use the S3
 * Parquet bulk export at https://www.0xarchive.io/data.
 */
export interface TimestampedRecord<T = unknown> {
  timestamp: number;
  data: T;
}

/**
 * Batch of historical data (bulk streaming).
 *
 * @deprecated Bulk streaming has been discontinued, so the server no longer
 * sends this message. For large dataset downloads, use the S3 Parquet bulk
 * export at https://www.0xarchive.io/data.
 */
export interface WsHistoricalBatch<T = unknown> {
  type: 'historical_batch';
  channel: WsChannel;
  coin: string;
  data: TimestampedRecord<T>[];
}

/**
 * Stream completed response.
 *
 * @deprecated Bulk streaming has been discontinued, so the server no longer
 * sends this message. For large dataset downloads, use the S3 Parquet bulk
 * export at https://www.0xarchive.io/data.
 */
export interface WsStreamCompleted {
  type: 'stream_completed';
  channel: WsChannel;
  coin: string;
  snapshots_sent: number;
}

/**
 * Stream stopped response.
 *
 * @deprecated Bulk streaming has been discontinued, so the server no longer
 * sends this message. For large dataset downloads, use the S3 Parquet bulk
 * export at https://www.0xarchive.io/data.
 */
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

/** A checkpoint order entry in an L4 snapshot: user address plus venue order object. */
export type WsL4SnapshotEntry = [user: string, order: Record<string, unknown>];

/** Replay/live L4 snapshot payload. */
export interface WsL4SnapshotData {
  bids: WsL4SnapshotEntry[];
  asks: WsL4SnapshotEntry[];
}

/** One L4 diff event in a batch, ordered by `(block_number, seq)`. */
export interface WsL4DiffEvent {
  timestamp: number;
  block_number: number;
  seq: number;
  oid: number;
  user: string;
  side: string;
  price: number;
  diff_type: string;
  new_size: number | null;
  insert_before: number | null;
}

/** One L4 order-lifecycle event in a batch, ordered by `(block_number, seq)`. */
export interface WsL4OrderEvent {
  timestamp: number;
  block_number: number;
  seq: number;
  oid: number;
  user: string;
  status: string;
  side: string;
  limit_price: number;
  size: number;
  orig_size: number;
  order_type: string;
  trigger_condition: string;
  is_trigger: boolean;
  trigger_price: number;
  is_position_tpsl: boolean;
  reduce_only: boolean;
  tif: string | null;
  cloid: string | null;
}

/** L4 batch event item for either the diffs or order-lifecycle channel. */
export type WsL4BatchEvent = WsL4DiffEvent | WsL4OrderEvent;

/**
 * L4 snapshot envelope. Core replay sends this first, anchored at the nearest
 * checkpoint at or before the requested start. HIP-3, HIP-4, and Spot L4 use
 * the same envelope for live delivery only.
 */
export interface WsL4Snapshot<T = WsL4SnapshotData> {
  type: 'l4_snapshot';
  channel: HyperliquidCoreL4Channel | Hip3L4Channel | Hip4L4Channel | SpotL4Channel;
  coin: string;
  symbol: string;
  last_block_number: number;
  timestamp: number;
  data: T;
}

/**
 * L4 batch envelope. Core replay emits batches after its initial snapshot in
 * strict `(block_number, seq)` order; HIP-3, HIP-4, and Spot L4 are live-only.
 */
export interface WsL4Batch<T extends WsL4BatchEvent = WsL4BatchEvent> {
  type: 'l4_batch';
  channel: HyperliquidCoreL4Channel | Hip3L4Channel | Hip4L4Channel | SpotL4Channel;
  coin: string;
  symbol: string;
  data: T[];
}

// -----------------------------------------------------------------------------
// Live Lighter payloads
//
// Live `lighter_*` data messages use the same shapes as Hyperliquid live data.
// Live `rh_lighter_*` messages (Lighter on Robinhood Chain) use these same
// shapes. Replay of the same channels is unchanged and keeps its own
// `historical_data` row shapes, which differ from these.
// -----------------------------------------------------------------------------

/** One price level in a live `lighter_orderbook` message. */
export interface LighterLiveBookLevel {
  /** Price, as a decimal string exactly as Lighter publishes it. */
  px: string;
  /** Size at this price, as a decimal string exactly as Lighter publishes it. */
  sz: string;
  /** Always 1: Lighter does not publish per-level order counts. */
  n: number;
}

/**
 * Live `lighter_orderbook` payload. Every message is a full book of up to 20
 * levels per side, not a diff. The newest book is sent at most once per
 * subscription interval (default 1000 ms).
 */
export interface LighterLiveOrderbook {
  coin: string;
  /** Lighter's book update time (Unix ms). */
  time: number;
  /** `[bids, asks]`: bids best (highest) first, asks best (lowest) first. */
  levels: [bids: LighterLiveBookLevel[], asks: LighterLiveBookLevel[]];
}

/**
 * One fill leg in a live `lighter_trades` message. Each trade arrives as two
 * legs, one per side, sharing `tid`. Count trades by distinct `tid`, not by
 * array length, and sum `sz` over one leg per `tid` for volume.
 *
 * Live trades are preliminary. The finalized record, including fees, is served
 * by `client.lighter.trades.list()` (`GET /v1/lighter/trades/{symbol}`), which
 * returns reconciled trades only. On Robinhood Chain (`rh_lighter_trades`) the
 * finalized record is `client.rhLighter.trades.list()`.
 */
export interface LighterLiveTrade {
  coin: string;
  /** 'A' = ask side, 'B' = bid side. */
  side: 'A' | 'B';
  /** Price, as a decimal string. */
  px: string;
  /** Size, as a decimal string. */
  sz: string;
  /** Trade time (Unix ms). */
  time: number;
  /** Lighter transaction hash. */
  hash: string | null;
  /** Trade id, shared by both legs of the trade. */
  tid: number;
  /** This side's order id. */
  oid: number | null;
  /** `true` for the taker leg, `false` for the maker leg. */
  crossed: boolean;
  /** Null in live messages: Lighter's live stream does not carry it. */
  dir: string | null;
  /** Null in live messages: Lighter's live stream does not carry it. */
  fee: string | null;
  /** Null in live messages: Lighter's live stream does not carry it. */
  fee_token: string | null;
  /** Null in live messages: Lighter's live stream does not carry it. */
  closed_pnl: string | null;
  /** This account's signed position before the trade, as a decimal string. */
  start_position: string | null;
  /** `[account index]` of this side's Lighter account, as a string. */
  users: string[];
}

/**
 * Market context carried by live `lighter_open_interest` and
 * `lighter_funding` messages. Values are decimal strings.
 */
export interface LighterLiveAssetCtx {
  /** Lighter's reported open interest (the same value as the REST current open interest). */
  openInterest: string | null;
  /** Current funding rate as a fraction (Lighter publishes percent; divided by 100). */
  funding: string | null;
  /** Premium as a fraction. */
  premium: string | null;
  /** Mark price. */
  markPx: string | null;
  /** Lighter's index price. */
  oraclePx: string | null;
  /** Mid price. */
  midPx: string | null;
  /** 24h quote volume. */
  dayNtlVlm: string | null;
  /** 24h base volume. */
  dayBaseVlm: string | null;
  /** Derived from the last trade price and Lighter's 24h percent change. */
  prevDayPx: string | null;
  /** Always null: Lighter has no impact prices. */
  impactPxs: null;
}

/**
 * Live `lighter_open_interest` and `lighter_funding` payload. Both channels
 * carry the same message, updated as Lighter publishes market stats.
 */
export interface LighterLiveStats {
  coin: string;
  ctx: LighterLiveAssetCtx;
}

/**
 * HIP-4 outcome settlement notification.
 *
 * Pushed once per `(outcome_id, side)` when `hip4_outcome_metadata.is_settled`
 * flips to true. After delivering this message the server proactively
 * unsubscribes the client from every hip4_* subscription on the settled coin —
 * treat this as a terminal signal for the coin.
 */
export interface WsOutcomeSettled {
  type: 'outcome_settled';
  /** HIP-4 coin (e.g. `#55850`). */
  coin: string;
  /** Numeric outcome id. */
  outcome_id: number;
  /** Side index (0 = Yes, 1 = No). */
  side: number;
  /** Settlement value (typically 1.0 for the winning side, 0.0 for the losing side). */
  settlement_value?: number;
  /** Settlement timestamp (ISO-8601). */
  settlement_at?: string;
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
  | WsReplaySnapshot
  | WsHistoricalData
  | WsHistoricalTickData
  | WsStreamStarted
  | WsStreamProgress
  | WsHistoricalBatch
  | WsStreamCompleted
  | WsStreamStopped
  | WsGapDetected
  | WsL4Snapshot
  | WsL4Batch
  | WsOutcomeSettled;

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
// Web3 Authentication Types
// =============================================================================

/** SIWE challenge message returned by the challenge endpoint */
export interface SiweChallenge {
  /** The SIWE message to sign with personal_sign (EIP-191) */
  message: string;
  /** Single-use nonce (expires after 10 minutes) */
  nonce: string;
}

/** Result of creating a free-tier account via wallet signature */
export interface Web3SignupResult {
  /** The generated API key */
  apiKey: string;
  /** Account tier (e.g., 'free') */
  tier: string;
  /** The wallet address that owns this key */
  walletAddress: string;
}

/** An API key record returned by the keys endpoint */
export interface Web3ApiKey {
  /** Unique key ID (UUID) */
  id: string;
  /** Key name */
  name: string;
  /** First characters of the key for identification */
  keyPrefix: string;
  /** Whether the key is currently active */
  isActive: boolean;
  /** Last usage timestamp (ISO 8601) */
  lastUsedAt?: string;
  /** Creation timestamp (ISO 8601) */
  createdAt: string;
}

/** List of API keys for a wallet */
export interface Web3KeysList {
  /** All API keys belonging to this wallet */
  keys: Web3ApiKey[];
  /** The wallet address */
  walletAddress: string;
}

/** Result of revoking an API key */
export interface Web3RevokeResult {
  /** Confirmation message */
  message: string;
  /** The wallet address that owned the key */
  walletAddress: string;
}

/** x402 payment details returned by subscribe (402 response) */
export interface Web3PaymentRequired {
  /** Amount in smallest unit (e.g., "49000000" for $49 USDC) */
  amount: string;
  /** Payment asset (e.g., "USDC") */
  asset: string;
  /** Blockchain network (e.g., "base") */
  network: string;
  /** Address to send payment to */
  payTo: string;
  /** Token contract address */
  assetAddress: string;
}

/** Result of a successful x402 subscription */
export interface Web3SubscribeResult {
  /** The generated API key */
  apiKey: string;
  /** Subscription tier */
  tier: string;
  /** Expiration timestamp (ISO 8601) */
  expiresAt: string;
  /** The wallet address that owns the subscription */
  walletAddress: string;
  /** On-chain transaction hash */
  txHash?: string;
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
  /**
   * Stable application error code when the API sends one, for example
   * `snapshot_advanced` (409: restart pagination without a cursor),
   * `invalid_cursor` or `positions_unavailable`.
   */
  errorCode?: string;
}

/**
 * SDK error class
 */
export class OxArchiveError extends Error {
  code: number;
  requestId?: string;
  /**
   * Stable application error code from the API envelope (`error_code`), when
   * sent. For example `snapshot_advanced` on a 409 from a positions cursor
   * whose snapshot was replaced: restart pagination without a cursor.
   */
  errorCode?: string;

  constructor(message: string, code: number, requestId?: string, errorCode?: string) {
    super(message);
    this.name = 'OxArchiveError';
    this.code = code;
    this.requestId = requestId;
    if (errorCode !== undefined) {
      this.errorCode = errorCode;
    }
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
  /** Coverage for supported venue APIs */
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
  /** 1-hour average; omitted until the platform has real samples for this venue. */
  avg1hMs?: number;
  /** 24-hour average latency */
  /** 24-hour average; omitted when unavailable. */
  avg24hMs?: number;
  /** 24-hour P99 latency */
  p9924hMs?: number;
}

/** REST API latency metrics */
export interface RestApiLatency {
  /** Current latency */
  currentMs: number;
  /** 1-hour average latency */
  /** 1-hour average; omitted until the platform has real samples for this venue. */
  avg1hMs?: number;
  /** 24-hour average latency */
  /** 24-hour average; omitted when unavailable. */
  avg24hMs?: number;
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
  /** Omitted until fills has an honest expectation model. */
  fills?: number;
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
  /**
   * Filter by venue scope: 'hyperliquid', 'hip3', 'hip4', 'spot', 'lighter'
   * or 'rh-lighter' (Lighter on Robinhood Chain)
   */
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
