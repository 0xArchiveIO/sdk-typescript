import type { WebhookEvent } from './webhook-signature';
import type { ErrorCode, Venue } from './contract';

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
  /**
   * Opaque cursor for the next page. Present exactly when `hasMore` is true;
   * pass it back unchanged as `cursor` with unchanged filters.
   */
  nextCursor?: string;
  /**
   * Set on every cursor-paged route: true while another page may follow,
   * false on the last page. A last page can be empty when the previous page
   * was exactly full.
   */
  hasMore?: boolean;
  /** Unique request ID for debugging */
  requestId: string;
  /**
   * The canonical public symbol the response is for (`BTC`, `km:US500`,
   * `#66900`, `HYPE-USDC`). Set on per-symbol routes.
   */
  symbol?: string;
  /** The venue the response is for. Set on per-symbol routes. */
  venue?: Venue;
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
 * Controls the resolution of historical orderbook data (Lighter only).
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
   * Data resolution for Lighter orderbook history (Lighter only; Hyperliquid routes do not take it).
   * Controls the granularity of returned snapshots.
   * Credit multipliers: checkpoint=1x, 30s=2x, 10s=3x, 1s=10x, tick=20x.
   * @default 'checkpoint'
   */
  granularity?: LighterGranularity;
}

/**
 * One resting order in an L4 order book snapshot
 * (`l4Orderbook.get()`).
 */
export interface L4RestingOrder {
  /** Order id. */
  oid: number;
  /** Owner of the order. */
  userAddress: string;
  /** `B` (bid) or `A` (ask). */
  side: 'B' | 'A';
  price: number;
  size: number;
  /**
   * When the order took its place in the queue (RFC 3339 UTC). Null when the
   * queue time is unknown.
   */
  timestamp: string | null;
  /** `timestamp` in Unix milliseconds, or null when unknown. */
  timestampMs: number | null;
}

/**
 * An L4 order book snapshot from `l4Orderbook.get()`: every resting order,
 * rebuilt from the nearest checkpoint plus the diffs after it.
 */
export interface L4OrderBookSnapshot {
  coin: string;
  /** The instant the book describes (RFC 3339 UTC). */
  timestamp: string;
  /** The checkpoint the book was rebuilt from (RFC 3339 UTC). */
  checkpointTimestamp: string;
  /** Number of diffs applied on top of the checkpoint. */
  diffsApplied: number;
  /** Last block included. */
  lastBlockNumber: number;
  bids: L4RestingOrder[];
  asks: L4RestingOrder[];
  bidCount: number;
  askCount: number;
  totalBidSize: number;
  totalAskSize: number;
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
  /** Priority fee burned in HYPE (not USDC) for write priority on the Hyperliquid validator queue. Independent of builderFee and deployerFee: paid to the network, not to a builder or deployer. Present only when the order paid for priority. */
  priorityGas?: number;
  /** Client order ID */
  cloid?: string;
  /** TWAP execution ID */
  twapId?: number;
}

/**
 * Cursor-based pagination parameters (recommended)
 * More efficient than offset-based pagination for large datasets.
 * The API returns `next_cursor` as a string. Treat it as an opaque
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
 * Taker side filter for trade routes: `'buy'` keeps trades whose taker
 * bought (`side: 'B'`), `'sell'` keeps trades whose taker sold
 * (`side: 'A'`).
 */
export type TradeSideFilter = 'buy' | 'sell';

/**
 * Parameters for trade history with cursor-based pagination. `side`
 * filters on the server, so a full page still holds `limit` matching trades
 * and the cursor pages the filtered tape; send the same `side` on every page.
 */
export interface GetTradesCursorParams extends CursorPaginationParams {
  /** Keep only buys or only sells. Every venue accepts it. */
  side?: TradeSideFilter;
}

/** Parameters for the most recent trades of a symbol (`trades.recent()`). */
export interface RecentTradesParams {
  /** Number of trades to return (default 100). */
  limit?: number;
  /** Keep only buys or only sells. */
  side?: TradeSideFilter;
}

/**
 * One page of a cursor-paged series.
 *
 * Keep paging while `hasMore` is true: pass `nextCursor` back unchanged as
 * `cursor` with the same filters. `hasMore` is false on the last page, which
 * can be empty when the previous page was exactly full.
 */
export interface CursorResponse<T> {
  data: T;
  /** Cursor for next page (use as cursor parameter). Present exactly when `hasMore` is true. */
  nextCursor?: string;
  /**
   * True while another page may follow. Read from `meta.hasMore`; when an
   * older server omits it, true exactly when `nextCursor` is set.
   */
  hasMore: boolean;
  /**
   * Response metadata: `requestId`, `count`, and where the API sends them
   * `symbol`, `venue`, coverage notices (`coverageFrom`, `notice`) and the
   * Lighter finalization boundary (`finalizedThrough`, `clampedTo`).
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
 * Trading instrument metadata (Lighter)
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
  /** True after settlement; collection stops for settled markets. */
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
 * `/v1/hyperliquid/spot/candles/{symbol}` from 2025-03-22 10:50 UTC.
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
export type OiFundingInterval = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d';

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
  /** Snapshot time the levels reflect (RFC 3339 UTC, millisecond precision). */
  snapshotTs: string;
  /** `snapshotTs` in Unix milliseconds. */
  snapshotTsMs: number;
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
  /**
   * Point-in-time read: Unix ms or an RFC 3339 string. Serves the newest
   * snapshot at or before this instant. History begins 2026-07-27.
   */
  at?: number | string;
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
  /** Snapshot time (RFC 3339 UTC, millisecond precision). */
  snapshotTs: string;
  /** `snapshotTs` in Unix milliseconds. */
  snapshotTsMs: number;
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
  /** Snapshot time (RFC 3339 UTC, millisecond precision). */
  snapshotTs: string;
  /** `snapshotTs` in Unix milliseconds. */
  snapshotTsMs: number;
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
  /** Aggregation interval (default: 1h). Valid: 1m, 5m, 15m, 30m, 1h, 4h, 1d */
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
 * Prices and sizes are numbers; `timestamp` is RFC 3339 UTC and
 * `timestampMs` the same instant in Unix milliseconds.
 *
 * Rows backfilled from the venue's finalized export have `source: 'bucket'`
 * and an empty `rawJson` (on Robinhood Chain, the span before live capture);
 * rows captured live have `source: 'ws'` and keep the full venue payload in
 * `rawJson`.
 */
export interface LighterLiquidation {
  /** Market symbol (perps uppercase, e.g. `BTC`). */
  symbol: string;
  /** Trade time (RFC 3339 UTC, millisecond precision). */
  timestamp: string;
  /** Trade time in Unix milliseconds. */
  timestampMs: number;
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
  /** Bucket start (RFC 3339 UTC). */
  timestamp: string;
  /** Bucket start in Unix milliseconds. */
  timestampMs: number;
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
 * Hyperliquid only. Lighter and Robinhood Chain return position aggregates
 * (`accountIndex`, the totals, long/short value, `nPositions`, `quality`), from
 * `positions.account()`, `positions.accountHistory()` and `data.account` of
 * `positions.get()`. A total with any unpriced position is null, never a
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
 * Freshness of the account positions data of one venue, from
 * `client.dataQuality.positionsFreshness()`. One row per venue: Hyperliquid
 * core (`venue: 'hyperliquid'`, `product: 'core'`), HIP-3 (`'hyperliquid'`,
 * `'hip3'`), Lighter (`'lighter'`, `'lighter'`) and Lighter on Robinhood Chain
 * (`'rh_lighter'`, `'rh_lighter'`). Instants are RFC 3339 UTC strings.
 */
export interface PositionsFreshness {
  /** `hyperliquid`, `lighter` or `rh_lighter`. */
  venue: string;
  /** `core`, `hip3`, `lighter` or `rh_lighter`. */
  product: string;
  /** Time of the latest live snapshot. */
  liveSnapshotTs: string | null;
  /** Age of the latest live snapshot, in seconds. */
  liveAgeSeconds: number | null;
  /** True when the latest live snapshot is older than 12 minutes (or there is none). */
  stale: boolean;
  /** Quality of the latest live snapshot: `complete`, `partial` or `degraded`. */
  liveQuality: string | null;
  /** Hour of the latest hourly snapshot. */
  hourlySnapshotTs: string | null;
  /** Every event before this instant is built into the change log and the as-of state. */
  builtThrough: string | null;
  /** Every event before this instant is final and will not be re-derived. */
  finalizedThrough: string | null;
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
 * The SDK sends it as Unix milliseconds. A time without a time zone is UTC.
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

/**
 * Per-coin freshness across the data types a venue family has. A family
 * leaves out the buckets it has no dataset for: HIP-4 has no `funding` or
 * `liquidations`.
 */
export interface CoinFreshness {
  /** Trading pair symbol */
  symbol?: string;
  /** Coin symbol (deprecated alias of `symbol`) */
  coin: string;
  /** Exchange name */
  exchange: string;
  /** When this measurement was taken */
  measuredAt: string;
  /** Orderbook freshness */
  orderbook: DataTypeFreshnessInfo;
  /** Trades freshness */
  trades: DataTypeFreshnessInfo;
  /** Funding freshness. Absent on HIP-4, which has no funding. */
  funding?: DataTypeFreshnessInfo;
  /** Open interest freshness */
  openInterest: DataTypeFreshnessInfo;
  /** Liquidations freshness (Hyperliquid core, HIP-3 and Lighter) */
  liquidations?: DataTypeFreshnessInfo;
}

/**
 * Freshness for a Hyperliquid Spot pair. Spot has no funding, open interest
 * or liquidations; it reports order book, trades, L4 checkpoints and diffs,
 * order lifecycle and TWAP buckets instead.
 */
export interface SpotFreshness {
  /** Dashed pair symbol, e.g. `HYPE-USDC` */
  symbol: string;
  /** Pair symbol (deprecated alias of `symbol`) */
  coin: string;
  /** Always `spot` */
  exchange: string;
  /** When this measurement was taken */
  measuredAt: string;
  /** Order book freshness */
  orderbook?: DataTypeFreshnessInfo;
  /** Trades freshness */
  trades?: DataTypeFreshnessInfo;
  /** L4 checkpoint freshness */
  l4Checkpoints?: DataTypeFreshnessInfo;
  /** L4 diff freshness */
  l4Diffs?: DataTypeFreshnessInfo;
  /** Order lifecycle freshness */
  orders?: DataTypeFreshnessInfo;
  /** TWAP status freshness */
  twap?: DataTypeFreshnessInfo;
  [key: string]: unknown;
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
// Cumulative Volume Delta (CVD) Types
// =============================================================================

/** Bucket widths the CVD routes accept. */
export type CvdInterval = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w';

/**
 * Parameters for CVD history (Hyperliquid core and HIP-3).
 *
 * Every field is optional. Without `start` or `cursor`, the response is the
 * newest `limit` buckets of the 24 hours before `end` (or before now), with
 * no cursor.
 */
export interface CvdParams {
  /** Start of the window (Unix ms, ISO 8601 string or `Date`). */
  start?: number | string | Date;
  /** End of the window (Unix ms, ISO 8601 string or `Date`). Defaults to now. */
  end?: number | string | Date;
  /** Bucket width (default `'1h'`). */
  interval?: CvdInterval;
  /**
   * The previous page's `nextCursor`, passed back unchanged, with the same
   * `start`, `end` and `interval`.
   */
  cursor?: number | string;
  /** Buckets per page (default 500, max 10000). */
  limit?: number;
}

/** One cumulative volume delta bucket. */
export interface CvdBucket {
  /** Bucket open time (RFC 3339 UTC). */
  timestamp: string;
  /** Bucket open time in Unix milliseconds. */
  timestampMs: number;
  /** Taker buy notional in the bucket. */
  buyVolume: number;
  /** Taker sell notional in the bucket. */
  sellVolume: number;
  /** `buyVolume` minus `sellVolume` for this bucket. */
  delta: number;
  /**
   * Running total of `delta` from the first bucket of this response. It
   * restarts on every page, so rebuild it from `delta` when joining pages.
   */
  cumulativeDelta: number;
}

// =============================================================================
// HIP-3 Oracle Types
// =============================================================================

/**
 * Instantaneous discovery bounds for a HIP-3 market, derived from the
 * current reference price and the market's max leverage. The full ratcheted
 * range can be wider when deployer-specific reset configuration applies.
 */
export interface Hip3OracleDiscoveryBounds {
  /** HIP-3 symbol, e.g. `km:US500`. */
  symbol: string;
  /** External price when available, otherwise the mark price. */
  referencePrice: number;
  /** Which price `referencePrice` is. */
  referenceSource: 'external' | 'mark';
  /** Market max leverage used for the bound fraction. */
  maxLeverage: number;
  /** Fraction applied on each side of `referencePrice`. */
  boundFraction: number;
  /** Instantaneous lower discovery bound. */
  lowerBound: number;
  /** Instantaneous upper discovery bound. */
  upperBound: number;
  /** Source block number. */
  blockNumber: number;
  /** Source time (RFC 3339 UTC, millisecond precision). */
  timestamp: string;
  /** Source time in Unix milliseconds. */
  timestampMs: number;
}

/** Latest deployer-pushed external price and mark price for a HIP-3 market. */
export interface Hip3OracleExternalPrice {
  /** HIP-3 symbol, e.g. `km:US500`. */
  symbol: string;
  /** Externally derived reference price, when available. */
  externalPrice?: number | null;
  /** On-chain mark input. */
  markPrice?: number | null;
  /** Source block number. */
  blockNumber: number;
  /** Source time (RFC 3339 UTC, millisecond precision). */
  timestamp: string;
  /** Source time in Unix milliseconds. */
  timestampMs: number;
}

// =============================================================================
// HIP-4 Question Types
// =============================================================================

/**
 * A HIP-4 question: a multi-choice resolver that groups binary outcome
 * markets under one ballot, with one named outcome per choice plus a
 * fallback outcome that resolves Yes when no named choice does.
 */
export interface Hip4Question {
  /** Question identifier. */
  questionId: number;
  /** Question name as published on-chain (recurring markets use a generic name such as `Recurring`). */
  name: string;
  /** Pipe-delimited question metadata (class, underlying, expiry, price thresholds, period). */
  description: string;
  /** Outcome id that resolves Yes when no named outcome does. */
  fallbackOutcomeId: number;
  /** Outcome ids of the named choices grouped under this question. */
  namedOutcomeIds: number[];
  /** Subset of `namedOutcomeIds` that have already settled. */
  settledNamedOutcomes: number[];
  /** When the question was first observed (RFC 3339, UTC). */
  firstSeenAt: string;
  /** When the question was last updated (RFC 3339, UTC). */
  lastUpdatedAt: string;
  [key: string]: unknown;
}

/** Parameters for listing HIP-4 questions. */
export interface Hip4ListQuestionsParams {
  /** The previous page's `nextCursor` (a question id), passed back unchanged. */
  cursor?: number | string;
  /** Maximum results (default 100, max 1000). */
  limit?: number;
}

// =============================================================================
// Wallet Classification Types
// =============================================================================

/** Metrics the wallet classification can be sorted by. */
export type WalletClassifySort =
  | 'total_orders'
  | 'total_fills'
  | 'total_volume'
  | 'total_volume_usd'
  | 'cancel_rate'
  | 'fill_rate'
  | 'maker_ratio'
  | 'avg_order_size_usd'
  | 'avg_order_notional'
  | 'max_order_size_usd'
  | 'max_order_notional'
  | 'active_hours'
  | 'unique_coins'
  | 'total_fees'
  | 'total_fees_usd'
  | 'realized_pnl'
  | 'realized_pnl_usd'
  | 'median_cancel_speed_ms'
  | 'twap_fills'
  | 'total_priority_gas'
  | 'total_priority_gas_paid'
  | 'total_builder_fees'
  | 'total_builder_fees_paid';

/**
 * Parameters for wallet classification. Parameter names are sent as written,
 * in the API's snake_case.
 */
export interface WalletClassifyParams {
  /** Minimum order count (default 100). */
  min_orders?: number;
  /** Minimum fill volume in USD (default 0). */
  min_volume_usd?: number;
  /** Metric to sort by (default `total_orders`). */
  sort?: WalletClassifySort;
  /** Sort order (default `desc`). */
  order?: 'asc' | 'desc';
  /** Maximum wallets to return (default 100, 1 to 1000). */
  limit?: number;
  /** Pagination offset (default 0, capped at 100000). */
  offset?: number;
  /** Only wallets that do, or do not, use TWAP orders. */
  uses_twap?: boolean;
  /** Only wallets that do, or do not, pay priority gas. */
  uses_priority_gas?: boolean;
  /** Minimum cancel rate, 0 to 1. */
  min_cancel_rate?: number;
  /** Maximum cancel rate, 0 to 1. */
  max_cancel_rate?: number;
  /** Daily snapshot date, `YYYY-MM-DD` (defaults to yesterday). */
  date?: string;
}

/** Precomputed behavioral metrics for one wallet. Every field is optional. */
export interface WalletClassifyMetrics {
  totalOrders?: number;
  cancelRate?: number;
  fillRate?: number;
  orderToTradeRatio?: number;
  iocRatio?: number;
  postOnlyRatio?: number;
  tpslRatio?: number;
  triggerOrderRatio?: number;
  uniqueCoinsTraded?: number;
  usesTpsl?: boolean;
  usesBuilder?: boolean;
  topBuilder?: string | null;
  avgOrderSizeUsd?: number;
  maxOrderSizeUsd?: number;
  medianCancelSpeedMs?: number;
  activeHours?: number;
  totalFills?: number;
  totalVolumeUsd?: number;
  makerRatio?: number;
  longShortRatio?: number;
  buyVolumeUsd?: number;
  sellVolumeUsd?: number;
  totalFeesUsd?: number;
  realizedPnlUsd?: number;
  liquidationCount?: number;
  maxSingleFillUsd?: number;
  uniqueFillCoins?: number;
  usesTwap?: boolean;
  twapFillRatio?: number;
  usesCloid?: boolean;
  cloidRatio?: number;
  usesPriorityGas?: boolean;
  totalPriorityGasPaid?: number;
  totalBuilderFeesPaid?: number;
}

/** One wallet and its precomputed metrics. */
export interface ClassifiedWallet {
  /** Wallet address. */
  address: string;
  /** Behavioral metrics for the snapshot day. */
  metrics: WalletClassifyMetrics;
  /** Metric lookback period, e.g. `24h`. */
  period: string;
}

/** A page of classified wallets. */
export interface WalletClassification {
  /** Wallets on this page. */
  wallets: ClassifiedWallet[];
  /** Total wallets matching the filters. Page with `offset`. */
  total: number;
  /** Daily snapshot date (`YYYY-MM-DD`). */
  date: string;
}

// =============================================================================
// Symbol Universe Types
// =============================================================================

/**
 * One market in the public symbol universe (`GET /v1/symbols`).
 *
 * `coverageByType` and `sizePerDay` are keyed by data type exactly as the API
 * sends them (for example `l4_orderbook`), so their keys are not camelCased.
 */
export interface SymbolEntry {
  /** Symbol as used on its venue's routes (e.g. `BTC`, `xyz:XYZ100`, `HYPE-USDC`, `#0`). */
  symbol: string;
  /** Venue family: `hyperliquid`, `hip3`, `hip4`, `spot`, `lighter` or `rh-lighter`. */
  exchange: string;
  /** Earliest coverage (RFC 3339), when known. */
  coverageFrom?: string | null;
  /** Latest coverage (RFC 3339), when the market no longer updates. */
  coverageTo?: string | null;
  /** Data types available for the symbol (e.g. `l2_orderbook`, `trades`). */
  dataTypes: string[];
  /** Earliest coverage per data type (RFC 3339), keyed by data type. */
  coverageByType?: Record<string, string>;
  /** Estimated size per day per data type, keyed by data type. */
  sizePerDay?: Record<string, number>;
  /** HIP-4 slug, when available. */
  slug?: string | null;
  /** HIP-4 outcome pair (the two side coins), when available. */
  outcomePair?: [string, string] | null;
  /** HIP-4 display title, when available. */
  displayTitle?: string | null;
  /** HIP-4: whether the outcome has settled. */
  isSettled?: boolean | null;
  /** Whether the market is active, when reported. */
  isActive?: boolean | null;
}

// =============================================================================
// Capabilities
// =============================================================================

/**
 * Datatype ids used by `GET /v1/capabilities`. The list can grow; unknown ids
 * are still typed as strings.
 */
export type CapabilityDatatype =
  | 'l2_orderbook'
  | 'l2_full_depth'
  | 'l2_full_depth_diffs'
  | 'l3_orderbook'
  | 'l4_orderbook'
  | 'l4_diffs'
  | 'l4_orders'
  | 'order_flow'
  | 'tpsl'
  | 'trigger_levels'
  | 'liquidation_levels'
  | 'trades'
  | 'candles'
  | 'funding'
  | 'oi'
  | 'liquidations'
  | 'liquidations_by_user'
  | 'cvd'
  | 'prices'
  | 'summary'
  | 'freshness'
  | 'instruments'
  | 'breadth'
  | 'oracle'
  | 'twap'
  | 'outcomes'
  | 'questions'
  | 'wallet_profile'
  | 'wallet_classify'
  | 'positions'
  | 'ticker'
  | 'mempool'
  | (string & {});

/**
 * One venue x datatype offer from `client.capabilities()`
 * (`GET /v1/capabilities`): where the datatype is served, whether it streams
 * live and replays over WebSocket, and from when.
 */
export interface Capability {
  /** Venue (`hyperliquid`, `hip3`, `hip4`, `spot`, `lighter`, `rh-lighter`). */
  venue: Venue;
  /** Datatype id, e.g. `trades`, `l4_diffs`, `oi`. */
  datatype: CapabilityDatatype;
  /** REST route templates that serve it, e.g. `/v1/hyperliquid/trades/{symbol}`. */
  restRoutes: string[];
  /** WebSocket channels that carry it (empty when REST only). */
  wsChannels: string[];
  /** True when a WebSocket channel streams it live. */
  live: boolean;
  /** True when a WebSocket channel replays it. */
  replay: boolean;
  /**
   * First served instant (RFC 3339 UTC), or null when the datatype has no
   * single floor (reference data, point-in-time reads).
   */
  availableFrom: string | null;
  /**
   * `event` (one row per exchange event), `snapshot` (periodic state),
   * `sample` (periodic readings), `interval` (buckets of `interval`) or
   * `reference` (catalog data).
   */
  cadence: string;
  /** Largest `limit` one page accepts, or null when the route is not paged. */
  pageLimit: number | null;
  /** Values `interval` accepts (empty when the route takes none). */
  intervals: string[];
  /** Notes, e.g. that a floor is a policy floor or that replay is bulk. */
  notes: string | null;
  /**
   * The only WebSocket endpoint that serves the datatype's channels, e.g.
   * `wss://stream.0xarchive.io/ws` for `mempool`. Absent when the channels
   * are served on the default endpoint, `wss://api.0xarchive.io/ws`.
   */
  wsEndpoint?: string;
  /**
   * The plans that include the datatype, e.g. `['pro', 'scale', 'enterprise']`
   * for `mempool`. Absent when every plan includes it, Free included.
   */
  plans?: string[];
}

// =============================================================================
// WebSocket Types
// =============================================================================

/**
 * WebSocket channel types.
 *
 * Which channels stream live and which replay is listed in
 * `WS_CHANNEL_CAPABILITIES` (exported by the SDK), which mirrors
 * `GET /v1/capabilities`:
 *
 * - Live and replay: `orderbook`, `trades`, `liquidations`, `open_interest`,
 *   `funding`; `hip3_orderbook`, `hip3_trades`, `hip3_open_interest`,
 *   `hip3_funding`, `hip3_liquidations`; `hip4_trades`; `lighter_orderbook`,
 *   `lighter_trades`, `lighter_open_interest`, `lighter_funding`; and the
 *   Robinhood Chain `rh_lighter_orderbook`, `rh_lighter_trades`,
 *   `rh_lighter_open_interest`, `rh_lighter_funding`.
 * - Live and bulk replay: the L4 channels of every product (`l4_diffs`,
 *   `l4_orders`, `hip3_l4_*`, `hip4_l4_*`, `spot_l4_*`) and the full-depth
 *   L2 channels (`orderbook_full`, `hip3_orderbook_full`). A bulk replay is
 *   single-channel, needs an explicit `end`, ignores `speed`, and starts with
 *   an `l4_snapshot` followed by ordered `l4_batch` messages.
 * - Replay only: `candles`, `hip3_candles`, `hip4_orderbook`,
 *   `hip4_open_interest`, `lighter_candles`, `lighter_l3_orderbook`,
 *   `rh_lighter_candles`.
 * - Live only: `ticker`, `all_tickers`, `spot_orderbook`, `spot_trades`,
 *   `mempool`. `mempool` (pending transactions on every Hyperliquid product)
 *   is served on `wss://stream.0xarchive.io/ws` (`STREAM_WS_URL`) only, with
 *   the Pro, Scale and Enterprise plans, and is the one channel whose symbol
 *   is optional.
 * - Neither: `spot_twap`. Spot TWAP statuses are served over REST only
 *   (`client.spot.twap`); the channel name is kept so existing code compiles.
 *
 * Liquidation messages share the trade wire format: each item is a fill row
 * with `is_liquidation: true`. Lighter and Robinhood Chain replay rows use the
 * live payload shapes (`LighterLiveOrderbook`, `LighterLiveTrade`,
 * `LighterLiveStats`).
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
  | 'hip4_l4_diffs' | 'hip4_l4_orders'
  | 'orderbook_full' | 'hip3_orderbook_full'
  | 'mempool';

/**
 * Full-depth L2 order book channels (every price level, Hyperliquid core and
 * HIP-3). Live, and bulk replay derived from the L4 stream.
 */
export type FullDepthL2Channel = 'orderbook_full' | 'hip3_orderbook_full';

/** Hyperliquid core L4 channels. */
export type HyperliquidCoreL4Channel = 'l4_diffs' | 'l4_orders';

/** HIP-3 L4 channels. */
export type Hip3L4Channel = 'hip3_l4_diffs' | 'hip3_l4_orders';

/** HIP-4 L4 channels. */
export type Hip4L4Channel = 'hip4_l4_diffs' | 'hip4_l4_orders';

/** Hyperliquid Spot L4 channels. */
export type SpotL4Channel = 'spot_l4_diffs' | 'spot_l4_orders';

/** Every L4 channel, on every product. */
export type L4Channel = HyperliquidCoreL4Channel | Hip3L4Channel | Hip4L4Channel | SpotL4Channel;

/**
 * The HIP-3, HIP-4 and Spot L4 channels.
 *
 * @deprecated These channels now support replay, like the core L4 channels.
 * The name is kept so existing code compiles; use {@link L4Channel} or
 * {@link WsBulkReplayChannel}.
 */
export type HyperliquidL4LiveOnlyChannel = Hip3L4Channel | Hip4L4Channel | SpotL4Channel;

/**
 * Channels replayed in bulk: every L4 channel and the full-depth L2 channels.
 * A bulk replay is single-channel, needs an explicit `end`, and ignores
 * `speed`: an `l4_snapshot` anchor at or before `start`, then `l4_batch`
 * pages in block order until `end`.
 */
export type WsBulkReplayChannel = L4Channel | FullDepthL2Channel;

/** Channels that stream live only; the API does not replay them. */
export type WsLiveOnlyChannel = 'ticker' | 'all_tickers' | 'spot_orderbook' | 'spot_trades' | 'mempool';

/**
 * Channels whose data is served over REST only: the API neither streams nor
 * replays them, and the client refuses both before sending.
 */
export type WsRestOnlyChannel = 'spot_twap';

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

/** Every channel the API replays. */
export type WsReplayableChannel = Exclude<WsChannel, WsLiveOnlyChannel | WsRestOnlyChannel>;

/** Channels replayed with timing preserved (`speed`), alone or in a multi-channel replay. */
export type WsStandardReplayChannel = Exclude<WsReplayableChannel, WsBulkReplayChannel>;

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

/**
 * Options for a bulk replay (L4 and full-depth L2 channels, every product).
 */
export interface WsBulkReplayOptions {
  /** Start timestamp (Unix ms). The replay anchors on the nearest checkpoint at or before it. */
  start: number;
  /** End timestamp (Unix ms). Required: a bulk replay is bounded. */
  end: number;
  /** Accepted for API compatibility but ignored: a bulk replay is not paced. */
  speed?: number;
}

/**
 * Options for checkpoint-anchored Hyperliquid core L4 replay.
 *
 * @deprecated Use {@link WsBulkReplayOptions}; bulk replay now covers every
 * L4 and full-depth channel.
 */
export type WsCoreL4ReplayOptions = WsBulkReplayOptions;

/**
 * Bulk replay request (L4 and full-depth L2 channels). The server emits one
 * `l4_snapshot` anchor, then one or more `l4_batch` pages ordered by block.
 * `end` is required; `speed` is ignored; one channel per replay.
 */
export interface WsBulkReplay extends WsBulkReplayOptions {
  op: 'replay';
  channel: WsBulkReplayChannel;
  /** Bulk replay is single-channel only. */
  channels?: never;
  symbol?: string;
  /** @deprecated Use `symbol`. */
  coin?: string;
}

/**
 * Hyperliquid core L4 replay request.
 *
 * @deprecated Use {@link WsBulkReplay}.
 */
export type WsCoreL4Replay = WsBulkReplay;

/** Replay request union: timed replay or bulk replay. */
export type WsReplay = WsStandardReplay | WsBulkReplay;

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
  /** The same value as `symbol`; null on the unfiltered `mempool` stream. */
  coin?: string | null;
  /**
   * Canonical symbol echoed by the server (Lighter symbols, on both
   * deployments, are echoed uppercase); null on the unfiltered `mempool`
   * stream.
   */
  symbol?: string | null;
  /** The API version the connection selected (`2026-10-01`). */
  version?: string;
}

/** Unsubscription confirmed from server */
export interface WsUnsubscribed {
  type: 'unsubscribed';
  channel: WsChannel;
  /** The same value as `symbol`; null on the unfiltered `mempool` stream. */
  coin?: string | null;
  /** Canonical symbol echoed by the server; null on the unfiltered `mempool` stream. */
  symbol?: string | null;
}

/** Pong response from server */
export interface WsPong {
  type: 'pong';
}

/**
 * Error from server. `error_code` is the stable code as sent (see
 * `ErrorCode`); the SDK copies it to `errorCode` before handlers run.
 * `slow_consumer` means the connection fell behind a stream and messages were
 * dropped: re-subscribe, or restart the replay, to resync.
 */
export interface WsError {
  type: 'error';
  message: string;
  /** Stable error code, as sent on the wire. */
  error_code?: ErrorCode | (string & {});
  /** The same code as `error_code`, set by the SDK. */
  errorCode?: ErrorCode | (string & {});
}

/**
 * Data message from server (real-time). `mempool` messages have their own
 * shape, {@link WsMempoolData}: `coin` and `symbol` are null on the
 * unfiltered stream.
 */
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
  /** Canonical symbol. */
  symbol?: string;
  /** Start timestamp in milliseconds */
  start: number;
  /** End timestamp in milliseconds */
  end: number;
  /** Playback speed multiplier */
  speed: number;
  /** The API version the connection selected (`2026-10-01`). */
  version?: string;
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
 * L4 snapshot envelope, for every product (core, HIP-3, HIP-4, Spot). A live
 * subscription starts with it, and a replay sends it first, anchored at the
 * nearest checkpoint at or before the requested start.
 */
export interface WsL4Snapshot<T = WsL4SnapshotData> {
  type: 'l4_snapshot';
  channel: L4Channel;
  coin: string;
  symbol: string;
  last_block_number: number;
  timestamp: number;
  data: T;
}

/**
 * L4 batch envelope, for every product. A replay emits batches of up to 5,000
 * events after its initial snapshot, in strict `(block_number, seq)` order.
 */
export interface WsL4Batch<T extends WsL4BatchEvent = WsL4BatchEvent> {
  type: 'l4_batch';
  channel: L4Channel;
  coin: string;
  symbol: string;
  data: T[];
}

/** One aggregated price level in a full-depth L2 snapshot. */
export interface WsL2FullDepthLevel {
  /** Price. */
  px: number;
  /** Aggregate size resting at the price. */
  sz: number;
  /** Number of orders at the price. */
  n: number;
}

/** The book sent first on `orderbook_full` and `hip3_orderbook_full`. */
export interface WsL2FullDepthSnapshotData {
  /** Every bid level, best (highest) first. */
  bids: WsL2FullDepthLevel[];
  /** Every ask level, best (lowest) first. */
  asks: WsL2FullDepthLevel[];
  /** Number of bid levels. */
  bid_count: number;
  /** Number of ask levels. */
  ask_count: number;
  /** Total size across all bid levels. */
  total_bid_size: number;
  /** Total size across all ask levels. */
  total_ask_size: number;
  /** Mid price; null when a side is empty. */
  mid_price: number | null;
  /** Best ask minus best bid; null when a side is empty. */
  spread: number | null;
  /** Spread in basis points of the mid; null when a side is empty. */
  spread_bps: number | null;
  /** True when the best bid is at or above the best ask. */
  is_crossed: boolean;
}

/**
 * One level change on a full-depth L2 channel. Apply changes in order: set
 * the level at `px` on `side` to `sz` and `n`, and remove it when `sz` is 0.
 */
export interface WsL2FullDepthDelta {
  /** `B` for bids, `A` for asks. */
  side: 'B' | 'A';
  /** Price of the level. */
  px: number;
  /** New aggregate size at the level (0 removes it). */
  sz: number;
  /** New order count at the level (0 removes it). */
  n: number;
  /** Block number of the change. */
  bn: number;
}

/**
 * First message of a full-depth L2 subscription or replay (`orderbook_full`,
 * `hip3_orderbook_full`): the whole aggregated book. It shares the
 * `l4_snapshot` message type with the L4 channels; tell them apart by
 * `channel`.
 */
export interface WsL2FullDepthSnapshot {
  type: 'l4_snapshot';
  channel: FullDepthL2Channel;
  coin: string;
  symbol: string;
  /** Block the book is current to. */
  last_block_number: number;
  timestamp: number;
  data: WsL2FullDepthSnapshotData;
}

/**
 * Level changes on a full-depth L2 subscription or replay, in order. A replay
 * sends one batch per 100 ms of event time, never splitting a block. It
 * shares the `l4_batch` message type with the L4 channels; tell them apart by
 * `channel`.
 */
export interface WsL2FullDepthBatch {
  type: 'l4_batch';
  channel: FullDepthL2Channel;
  coin: string;
  symbol: string;
  data: WsL2FullDepthDelta[];
}

// -----------------------------------------------------------------------------
// Live Lighter payloads
//
// Live `lighter_*` data messages use the same shapes as Hyperliquid live data.
// Live `rh_lighter_*` messages (Lighter on Robinhood Chain) use these same
// shapes. Replay of the same channels uses them too (API version 2026-10-01,
// which the SDK selects): a `historical_data` book is a `LighterLiveOrderbook`,
// a trade is an array holding one `LighterLiveTrade` leg, and open interest
// and funding are a `LighterLiveStats`.
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
 * by `client.lighter.trades.history()` (`GET /v1/lighter/trades/{symbol}`), which
 * returns reconciled trades only. On Robinhood Chain (`rh_lighter_trades`) the
 * finalized record is `client.rhLighter.trades.history()`.
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
  /** Null in live messages: Lighter's live stream does not carry it. Replay fills it from the reconciled record. */
  fee: string | null;
  /** Null in live messages: Lighter's live stream does not carry it. */
  fee_token: string | null;
  /** Null in live messages: Lighter's live stream does not carry it. Replay fills it from the reconciled record where Lighter reports one. */
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

// -----------------------------------------------------------------------------
// Pending transactions (`mempool`)
//
// Signed Hyperliquid transactions as our Hyperliquid node receives them from
// its peers, before they are included in a block, on every Hyperliquid product
// (perps, HIP-3, HIP-4 and spot). Live only: nothing is stored or replayed.
// -----------------------------------------------------------------------------

/** The signature of a pending transaction, as signed. */
export interface MempoolSignature {
  r: string;
  s: string;
  v: number;
}

/**
 * A signed action in Hyperliquid's exchange-action format, exactly as signed:
 * markets are asset ids (`a` or `asset`), not symbols, and prices and sizes
 * are strings. `type` names the action, for example `order`, `cancel`,
 * `modify`, `twapOrder`, `updateLeverage` or `usdSend`. Hyperliquid adds
 * action types over time, so expect types not listed here.
 */
export interface MempoolAction {
  type: string;
  [field: string]: unknown;
}

/**
 * One signed action on the `mempool` channel. Pending is not executed: a
 * transaction seen here can still be rejected, expire or never land. The same
 * signed action can occasionally arrive twice; deduplicate on `signature` if
 * needed.
 */
export interface MempoolItem {
  /**
   * When our node received the transaction, RFC 3339 UTC with nanosecond
   * precision. Not a block time.
   */
  received_at: string;
  /** `received_at` as Unix milliseconds. */
  received_at_ms: number;
  /**
   * The markets the action's asset ids reference, in canonical spelling
   * (`BTC`, `xyz:TSLA`, `HYPE-USDC`, `#49720`), in first-seen order without
   * repeats. Empty for actions with no market, such as transfers.
   */
  symbols: string[];
  /**
   * The action exactly as signed, fields in signed order, so the signer can
   * be recovered from `signature`. The signer's address is not included.
   */
  action: MempoolAction;
  /** The action's nonce. */
  nonce: number;
  /** The vault or subaccount the action acts for, or null. */
  vault_address: string | null;
  /** The action's `expiresAfter` (Unix ms), or null. */
  expires_after_ms: number | null;
  signature: MempoolSignature;
}

/**
 * A `mempool` data message: one per batch of transactions our node receives
 * from a peer, sent as soon as it arrives.
 */
export interface WsMempoolData {
  type: 'data';
  channel: 'mempool';
  /** The subscription's symbol, or null on the unfiltered stream. */
  coin: string | null;
  /** The subscription's symbol, or null on the unfiltered stream. */
  symbol: string | null;
  data: MempoolItem[];
}

/**
 * HIP-4 outcome settlement notification.
 *
 * Pushed once per `(outcome_id, side)` when the outcome settles. After
 * delivering this message the server proactively unsubscribes the client
 * from every hip4_* subscription on the settled coin; treat this as a
 * terminal signal for the coin.
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
  | WsL2FullDepthSnapshot
  | WsL2FullDepthBatch
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
 * API error response body, as the SDK reads it (keys camelCased).
 *
 * Error responses have no `meta`: the request id sits at the top level,
 * beside the HTTP status (`code`), the stable `errorCode` and the message.
 */
export interface ApiError {
  /** Always false on an error response. */
  success?: false;
  /** HTTP status. */
  code: number;
  /** Stable error code (`error_code`); see {@link ErrorCode}. */
  errorCode?: ErrorCode | (string & {});
  /** Human-readable message. */
  error: string;
  /** Request id to quote to support. Surfaced as `OxArchiveError.requestId`. */
  requestId?: string;
  /** The request parameter the error is about, when there is one. */
  param?: string;
  /** Values the parameter accepts, when the API lists them. */
  validValues?: string[];
  /**
   * On `unsupported_for_venue`: the venues and routes that serve the
   * datatype.
   */
  availableOn?: Array<{ venue: string; route: string }>;
}

/** Extra fields an {@link OxArchiveError} can carry. */
export interface OxArchiveErrorDetails {
  /** The request parameter the error is about (`param`). */
  param?: string;
  /** Values the parameter accepts (`valid_values`). */
  validValues?: string[];
  /** The whole error body as the SDK read it (keys camelCased). */
  body?: Record<string, unknown>;
}

/**
 * The error every REST method throws.
 *
 * Branch on `errorCode`, the API's stable code (`error_code`), rather than on
 * the message. `status` is the HTTP status; `requestId` is the id to quote to
 * support; `param` and `validValues` say which parameter was refused and what
 * it accepts. Errors raised before a response arrives (a timeout, a network
 * failure, a refusal before sending) have no `errorCode`.
 *
 * @example
 * ```typescript
 * try {
 *   await client.hyperliquid.trades.history('BTC', { start, end, side: 'buy' });
 * } catch (error) {
 *   if (error instanceof OxArchiveError && error.errorCode === 'invalid_parameter') {
 *     console.log(error.param, error.validValues);
 *   }
 * }
 * ```
 */
export class OxArchiveError extends Error {
  /** HTTP status (the same value as `status`). */
  code: number;
  requestId?: string;
  /**
   * Stable error code from the API envelope (`error_code`), when sent. One of
   * {@link ERROR_CODES}, or a route-specific code such as `snapshot_advanced`
   * (409 from a positions cursor whose snapshot was replaced: restart
   * pagination without a cursor).
   */
  errorCode?: ErrorCode | (string & {});
  /** The request parameter the error is about, when the API names one. */
  param?: string;
  /** Values the parameter accepts, when the API lists them. */
  validValues?: string[];
  /** The whole error body as the SDK read it, for fields not surfaced above. */
  body?: Record<string, unknown>;

  constructor(
    message: string,
    code: number,
    requestId?: string,
    errorCode?: string,
    details?: OxArchiveErrorDetails,
  ) {
    super(message);
    this.name = 'OxArchiveError';
    this.code = code;
    this.requestId = requestId;
    if (errorCode !== undefined) {
      this.errorCode = errorCode;
    }
    if (details?.param !== undefined) {
      this.param = details.param;
    }
    if (details?.validValues !== undefined) {
      this.validValues = details.validValues;
    }
    if (details?.body !== undefined) {
      this.body = details.body;
    }
  }

  /** HTTP status of the failed request (the same value as `code`). */
  get status(): number {
    return this.code;
  }
}

/**
 * Timestamp can be Unix ms (number), an ISO 8601 string, or a Date. A time
 * without a time zone is UTC: `'2026-09-01'` is midnight UTC and
 * `'2026-09-01T12:00:00'` is noon UTC on every machine.
 */
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

// =============================================================================
// Webhooks
// =============================================================================

/**
 * A subscription's configuration: which occurrences of an event type should
 * be delivered.
 *
 * Unlike most types in this file, the keys here are **wire keys**. This
 * object is stored and returned by the API verbatim, so the SDK sends it and
 * returns it exactly as written. Use `min_notional_usd`, not
 * `minNotionalUsd`.
 *
 * Every key is optional and every key is validated against the event type's
 * declaration from `client.webhooks.eventTypes()`. An empty config means
 * "every occurrence of this event that is in scope for me". The stored form
 * is normalised: venues and addresses lowercased, declared parameters filled
 * in at their defaults, and operators in their canonical spelling.
 */
export interface WebhookSubscriptionConfig {
  /**
   * Venue or venues to match, from the event type's `venues`. A single
   * string, a pipe-separated string, or a list. Omit to match every covered
   * venue.
   */
  venue?: string | string[];
  /** Instrument symbols to match, in each venue's own form. Omit to match every symbol. */
  symbols?: string[];
  /** Wallets to match, for an address-scoped event type. Each must already be on your watched list. */
  addresses?: string[];
  /**
   * Declared parameters for the event type, such as `window_s` or
   * `threshold_usd`. A declared parameter left out is stored at its default;
   * one may also be written at the top level of this object.
   */
  params?: Record<string, unknown>;
  /** Conditions on the event type's declared metrics, all of which must hold. At most 16. */
  conditions?: WebhookCondition[];
  /**
   * Shorthand for a `notional_usd` at-or-above condition. It is stored as a
   * condition and mirrored back here as the loosest notional lower bound.
   */
  min_notional_usd?: number;
  /** Declared parameters written at the top level. */
  [key: string]: unknown;
}

/** Canonical condition operators, as the API stores them. */
export type WebhookConditionCanonicalOperator =
  | 'greater_than'
  | 'greater_than_or_equal'
  | 'less_than'
  | 'less_than_or_equal'
  | 'equal'
  | 'not_equal'
  | 'between'
  | 'not_between'
  | 'in'
  | 'not_in'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'before'
  | 'after'
  | 'is_empty'
  | 'is_not_empty';

/**
 * Operators accepted in a {@link WebhookCondition}.
 *
 * Which ones apply depends on the metric's type, and the event type's
 * `operators` lists them per type. Symbol spellings such as `>=` are
 * accepted and stored in their canonical form, so a condition sent as `>=`
 * reads back as `greater_than_or_equal`.
 */
export type WebhookConditionOperator =
  | WebhookConditionCanonicalOperator
  | '>'
  | '>='
  | '<'
  | '<='
  | '=='
  | '!=';

/** One condition on a declared metric. */
export interface WebhookCondition {
  /** A metric declared by the event type. */
  metric: string;
  /** Comparison to apply. */
  op: WebhookConditionOperator;
  /**
   * What to compare against: a number, a string, a boolean, an RFC 3339
   * timestamp, a `[low, high]` pair for `between` and `not_between`, or a
   * non-empty list for `in` and `not_in`. Omitted for `is_empty` and
   * `is_not_empty`.
   */
  value?: unknown;
}

/** A tunable parameter an event type declares. */
export interface WebhookParamDeclaration {
  /** Value type: `integer`, `number`, `string` or `array_of_number`. */
  type: 'integer' | 'number' | 'string' | 'array_of_number';
  /** Unit the value is expressed in, when it has one. */
  unit?: string;
  /** Value used when the parameter is not supplied. */
  default?: unknown;
  /** Lowest accepted value, when bounded below. */
  min?: number;
  /** Highest accepted value, when bounded above. */
  max?: number;
  /** Accepted values, when the parameter is a fixed choice. */
  enum?: unknown[];
  /** What the parameter changes. */
  description?: string;
}

/** A metric an event carries, which conditions may be written against. */
export interface WebhookMetricDeclaration {
  /** Value type. It decides which operators a condition on this metric may use. */
  type: 'number' | 'integer' | 'string' | 'boolean' | 'timestamp';
  /** Unit the metric is expressed in, when it has one. */
  unit?: string;
  /** Accepted values, when the metric is a fixed choice. */
  values?: string[];
  /** What the metric measures, including when it is null. */
  description?: string;
}

/** The smallest occurrence an event type reports at all. */
export interface WebhookCostFloor {
  /** Metric the floor applies to, e.g. `notional_usd`. */
  metric: string;
  /** Lowest value still reported. */
  min: number;
}

/**
 * One entry in the event catalog: an event type and everything a
 * subscription to it may say.
 *
 * This is the authority on filters, parameters, metrics and operators. Read
 * it rather than hardcoding a catalog. `params`, `metrics`, `operators` and
 * `filtersExample` keep their keys exactly as the API sends them.
 */
export interface WebhookEventTypeDeclaration {
  /** Event type, e.g. `market.liquidation`. Send it as `eventType` when subscribing. */
  type: string;
  /** Version of the delivered payload shape. */
  schemaVersion: number;
  /** Whether subscriptions are accepted. `false` means published but not yet live. */
  live: boolean;
  /**
   * `public` for market-wide events, `user` for your own account and
   * platform activity, `addresses` for events about your watched wallets.
   */
  scope: 'public' | 'user' | 'addresses';
  /** Venues the type covers. Empty when the type is not venue scoped. */
  venues: string[];
  /** Filter keys the configuration accepts. Anything else is refused. */
  filters: string[];
  /** Tunable parameters, keyed by parameter name. */
  params: Record<string, WebhookParamDeclaration>;
  /** Metrics carried by the event, keyed by metric name. */
  metrics: Record<string, WebhookMetricDeclaration>;
  /** Smallest occurrence reported at all, or null when the type has no floor. */
  costFloor: WebhookCostFloor | null;
  /** Rough delivery latency, from the occurrence to the first delivery attempt. */
  latencyClass: 'seconds' | 'minutes';
  /** What the event reports and what one occurrence means. */
  description: string;
  /** A worked example configuration for this type. */
  filtersExample?: WebhookSubscriptionConfig;
  /**
   * Operator vocabulary grouped by metric type, plus the `any` group that
   * applies to every metric.
   */
  operators?: Record<string, WebhookConditionCanonicalOperator[]>;
}

/** Endpoint status. `auto_disabled` means a long run of failed deliveries switched it off. */
export type WebhookEndpointStatus = 'active' | 'disabled' | 'auto_disabled';

/** A delivery destination. The signing secret is never part of this shape. */
export interface WebhookEndpoint {
  /** Endpoint id. */
  id: string;
  /** HTTPS destination that receives deliveries. */
  url: string;
  /** Your own label for the endpoint. */
  description: string;
  /**
   * `active` is serving, `disabled` means you switched it off, and
   * `auto_disabled` means a long run of failed deliveries switched it off
   * for you. `enableEndpoint()` brings it back.
   */
  status: WebhookEndpointStatus;
  /** Failed attempts since the last success. Resets to 0 on a delivery that lands. */
  consecutiveFailures: number;
  /** When the endpoint was created (RFC 3339). */
  createdAt: string;
}

/** A newly created endpoint. This and a rotation are the only responses that carry the secret. */
export interface CreatedWebhookEndpoint extends WebhookEndpoint {
  /** Signing secret. Store it now: it is not shown again. */
  secret: string;
}

/** Parameters for creating an endpoint. */
export interface CreateWebhookEndpointParams {
  /** HTTPS URL to deliver to. Destinations that resolve to a private or internal address are refused. */
  url: string;
  /** Optional label. */
  description?: string;
}

/** A freshly rotated signing secret. */
export interface RotatedWebhookSecret {
  /** The new signing secret. The previous one keeps verifying for 24 hours. */
  secret: string;
}

/** Why a subscription is paused: the daily delivery limit, or a plan without webhook delivery. */
export type WebhookPauseReason = 'deliveries_per_day_cap' | 'plan_no_webhooks';

/**
 * A rule: one event type, one configuration, delivered to one endpoint.
 *
 * When the account passes its daily delivery limit, or its plan stops
 * including webhook delivery, the rule pauses and says so here rather than
 * dropping events in silence. Nothing is buffered while it is paused; the
 * `suppressed*` fields describe what was missed, and the same window can be
 * re-read from the REST routes.
 */
export interface WebhookSubscription {
  /** Subscription id. */
  id: string;
  /** Endpoint that receives this rule's deliveries. */
  endpointId: string;
  /** Event type this rule subscribes to. */
  eventType: string;
  /** The stored configuration, normalised. Wire keys, returned verbatim. */
  filters: WebhookSubscriptionConfig;
  /** Your own on and off switch. Resuming a paused rule never changes it. */
  enabled: boolean;
  /** When the rule was created (RFC 3339). */
  createdAt: string;
  /** `active` is serving; `auto_paused` means delivery is paused until you resume it. */
  status: 'active' | 'auto_paused';
  /** Why the rule is paused and what clears it, in plain words. Present only while paused. */
  pauseMessage?: string;
  /** Start of the current gap. Null while serving. */
  pausedAt?: string | null;
  /** Machine-readable cause of the current pause. Null while serving. Show `pauseMessage` to people. */
  pauseReason?: WebhookPauseReason | null;
  /** Matches observed but not delivered since the pause began. A lower bound, not a total. */
  suppressedCount: number;
  /** First suppressed match of the current pause. */
  suppressedFirstAt?: string | null;
  /** Most recent suppressed match of the current pause. */
  suppressedLastAt?: string | null;
  /** Start of the last pause that has already ended. */
  lastPausedAt?: string | null;
  /** When that pause ended. */
  lastResumedAt?: string | null;
  /** Cause of the last pause that has already ended. */
  lastPauseReason?: WebhookPauseReason | null;
  /** Matches suppressed during the last pause that has already ended. */
  lastSuppressedCount: number;
  /** First suppressed match of that pause. */
  lastSuppressedFirstAt?: string | null;
  /** Most recent suppressed match of that pause. */
  lastSuppressedLastAt?: string | null;
}

/** Parameters for creating a subscription. */
export interface CreateWebhookSubscriptionParams {
  /** Endpoint to deliver matches to. It must be one of yours. */
  endpointId: string;
  /** Event type to subscribe to. It must be `live` in the catalog. */
  eventType: string;
  /** Configuration. Omit for every in-scope occurrence. */
  filters?: WebhookSubscriptionConfig;
}

/** Parameters for editing a subscription in place. A field left out is left alone. */
export interface UpdateWebhookSubscriptionParams {
  /** Replacement configuration. It replaces the stored one wholesale. */
  filters?: WebhookSubscriptionConfig;
  /** Switch the rule on or off without touching its configuration. */
  enabled?: boolean;
}

/** The window re-read to cover a pause, as start and end. */
export interface WebhookReplayWindow {
  /** Window start (RFC 3339). */
  start: string | null;
  /** Window end (RFC 3339). */
  end: string | null;
}

/**
 * The window a resume just closed. Nothing is buffered while a rule is
 * paused, so this describes what was missed rather than replaying it.
 */
export interface WebhookResumeGap {
  /** Start of the gap. */
  pausedAt: string | null;
  /** End of the gap. */
  resumedAt: string | null;
  /** The gap as a window to re-read from the REST routes. */
  replayWindow: WebhookReplayWindow;
  /** Cause of the pause that was cleared. Null on a bulk resume with more than one cause. */
  reason?: WebhookPauseReason | null;
  /** Distinct causes across the resumed rules. Bulk resume only. */
  reasons?: WebhookPauseReason[];
  /** The cause in plain words. */
  pauseMessage?: string | null;
  /**
   * Matches suppressed inside the window. Null when the rules were address
   * scoped, because their occurrences were not looked at.
   */
  suppressedCount?: number | null;
  /** Whether anything inside the window was counted. False means the count is null because nothing was looked at. */
  counted: boolean;
  /** First suppressed match inside the window. */
  suppressedFirstAt?: string | null;
  /** Most recent suppressed match inside the window. */
  suppressedLastAt?: string | null;
  /** How many of the resumed rules were address scoped, and so not counted. Bulk resume only. */
  uncountedSubscriptions?: number;
  /** What can and cannot be recovered for the window, and how. */
  note: string;
}

/** Result of resuming one subscription. */
export interface WebhookSubscriptionResumeResult {
  /** The subscription after the resume. */
  subscription: WebhookSubscription;
  /** The window the resume closed. Null when the rule was already serving and nothing changed. */
  gap: WebhookResumeGap | null;
  /** Present only when nothing changed, to say why. */
  note?: string;
}

/** Result of resuming every paused subscription on the account. */
export interface WebhookSubscriptionResumeAllResult {
  /** The subscriptions that were put back into service. */
  subscriptions: WebhookSubscription[];
  /** How many rules were resumed. */
  resumedCount: number;
  /** The window the resume closed, across the rules it cleared. Null when nothing was paused. */
  gap: WebhookResumeGap | null;
  /** Present only when nothing changed, to say why. */
  note?: string;
}

/** Delivery state. `exhausted` means the retry window closed without success. */
export type WebhookDeliveryState = 'pending' | 'delivered' | 'failed' | 'exhausted';

/**
 * One delivery record for one event to one endpoint. An event and an
 * endpoint share a single record for their whole life, so a repeat delivery
 * rewrites this record rather than adding another.
 */
export interface WebhookDelivery {
  /** Delivery id. Pass it to `redeliver()`. */
  id: string;
  /** Event id, stable across retries and repeat deliveries. Deduplicate on it. */
  eventId: string;
  /** Event type delivered. */
  eventType: string;
  /** `pending`, `delivered`, `failed` or `exhausted`. */
  state: WebhookDeliveryState;
  /** Attempts made so far. */
  attempts: number;
  /** HTTP status your receiver returned on the last attempt. */
  lastStatusCode?: number | null;
  /** Why the last attempt failed. Null when it succeeded. */
  lastError?: string | null;
  /** How long the last attempt took, in milliseconds. */
  lastLatencyMs?: number | null;
  /** When the next attempt is due (RFC 3339). */
  nextAttemptAt: string;
  /** When the delivery landed (RFC 3339). Null until it does. */
  deliveredAt?: string | null;
  /** When the delivery was queued (RFC 3339). A repeat delivery resets it. */
  createdAt: string;
  /** The event body as sent. Wire keys, exactly as signed. */
  payload: WebhookEvent;
}

/** Parameters for listing deliveries. */
export interface ListWebhookDeliveriesParams {
  /** Deliveries to return, newest first. Default 50, clamped to 1 to 200. */
  limit?: number;
}

/** A delivery that has just been queued by a test. */
export interface WebhookTestFireResult {
  /** Delivery id. Read it back from the endpoint's delivery log. */
  deliveryId: string;
  /** Event id carried in the delivered payload. */
  eventId: string;
}

/** A past delivery queued for another attempt. The ids are unchanged. */
export interface WebhookRedeliveryResult {
  /** Delivery id, the same one that was asked for. */
  deliveryId: string;
  /** Event id, unchanged, so a receiver that already processed it can deduplicate. */
  eventId: string;
  /** Event type being delivered again. */
  eventType: string;
  /** Always `pending` right after a repeat delivery is queued. */
  state: 'pending';
  /** Attempt counter, restarted from zero. */
  attempts: number;
  /** When the attempt is due, which is immediately (RFC 3339). */
  nextAttemptAt: string;
}

/** A wallet on your watched list. Address-scoped event types report only on these. */
export interface WebhookWatchedAddress {
  /** Watched-address id. */
  id: string;
  /** The wallet, stored lowercase. */
  address: string;
  /** Your own label, at most 64 characters. */
  label: string;
  /** When it was added (RFC 3339). */
  createdAt: string;
}

/** The watched list, with the number of wallets the plan allows. */
export interface WebhookWatchedAddressList {
  /** Every wallet on the list. */
  addresses: WebhookWatchedAddress[];
  /** Watched wallets the plan allows. */
  limit: number;
}

/** Parameters for watching a wallet. */
export interface AddWebhookAddressParams {
  /** A 0x-prefixed, 40 hex character wallet address. Stored lowercase. */
  address: string;
  /** Optional label, at most 64 characters. */
  label?: string;
}

/** One plan cap: what the plan allows, what is in use, and what is left. */
export interface WebhookLimitUsage {
  /** In use now. */
  used: number;
  /** What the plan allows. Zero on a plan without webhook delivery. */
  limit: number;
  /** What is left, never below zero. */
  remaining: number;
}

/** Today's delivery budget. The budget resets on its own; a paused rule does not. */
export interface WebhookDeliveryBudget {
  /** Deliveries today. */
  used: number;
  /** Deliveries a day the plan allows. Null when the plan has no ceiling. */
  limit: number | null;
  /** Deliveries left today. Null when the plan has no ceiling. */
  remaining: number | null;
  /** True when the plan has no daily ceiling. */
  unlimited: boolean;
  /** When the budget resets (RFC 3339). */
  resetsAt: string;
  /** Present only while something is paused, to say the reset time is the budget's, not the pause's. */
  resetsAtNote?: string;
}

/** Paused rules on the account. */
export interface WebhookPausedSubscriptions {
  /** How many rules are paused and delivering nothing. */
  count: number;
  /** Start of the oldest pause still in force. */
  earliestPausedAt?: string | null;
  /** Distinct causes across the paused rules. */
  reasons: WebhookPauseReason[];
  /** What is paused and what clears it, in plain words. Present only when something is paused. */
  message?: string;
}

/** What the plan allows for webhooks and what is in use. */
export interface WebhookLimits {
  /** The plan webhook decisions are priced at. */
  plan: string;
  /** The plan's display name, when known. */
  planLabel?: string | null;
  /** Whether the plan has webhook delivery at all. False on Free, where every cap is zero. */
  included: boolean;
  /** Whether the estimate and the dry-run are available. True on every plan. */
  previewIncluded: boolean;
  /** Endpoint cap and usage. */
  endpoints: WebhookLimitUsage;
  /** Subscription cap and usage. */
  subscriptions: WebhookLimitUsage;
  /** Watched wallet cap and usage. */
  watchedAddresses: WebhookLimitUsage;
  /** Today's delivery budget. */
  deliveriesPerDay: WebhookDeliveryBudget;
  /** Paused rules on the account. */
  pausedSubscriptions: WebhookPausedSubscriptions;
  /** Why the caps are zero and what to do about it. Present only on a plan without webhook delivery. */
  notice?: string;
}

/** The window a preview answer covers. */
export interface WebhookWindow {
  /** Start (RFC 3339). Later than requested when a scan reached its row cap. */
  from: string;
  /** End (RFC 3339): the moment of the request. */
  to: string;
}

/** One occurrence a rule would have delivered. */
export interface WebhookOccurrence {
  /**
   * The occurrence's own timestamp. A real delivery's `observed_at` is this
   * plus the time it takes to see the occurrence.
   */
  observedAtEstimate: string;
  /** The `data` a delivery would carry. Wire keys. */
  data: Record<string, unknown>;
}

/** Parameters for a dry run. */
export interface WebhookDryRunParams {
  /** Event type to evaluate. */
  eventType: string;
  /** The configuration you would create, validated exactly as a create. */
  config?: WebhookSubscriptionConfig;
  /** Seconds of history to scan, ending now (60 to 86400, default 3600). */
  lookbackS?: number;
  /** Occurrences to return, newest first (1 to 200, default 100). */
  limit?: number;
}

/** Which occurrences a rule would have delivered over a recent window. */
export interface WebhookDryRunResult {
  /** Event type evaluated. */
  eventType: string;
  /** The window actually covered. */
  window: WebhookWindow;
  /** Occurrences that matched inside the window, before `limit`. */
  matched: number;
  /** True when fewer occurrences are returned than matched, or a scan cap narrowed the window. */
  truncated: boolean;
  /** Newest first, at most `limit`. */
  occurrences: WebhookOccurrence[];
}

/** Parameters for an estimate. */
export interface WebhookEstimateParams {
  /** Event type to evaluate. */
  eventType: string;
  /** The configuration you would create, validated exactly as a create. */
  config?: WebhookSubscriptionConfig;
  /** Days of history to evaluate, ending now (1 to 30, default 7). */
  lookbackDays?: number;
}

/** Matches in one 24 hour bin of the estimate window. */
export interface WebhookDayCount {
  /** UTC date the bin ends on. */
  date: string;
  /** Occurrences that would have been delivered in the bin. */
  count: number;
}

/** The daily rate the same configuration would have had at a different threshold. */
export interface WebhookEstimateRung {
  /** Threshold on the primary metric. */
  value: number;
  /** Deliveries a day at that threshold, everything else unchanged. */
  perDay: number;
}

/** Quantiles of the primary metric over the matched occurrences. */
export interface WebhookEstimateDistribution {
  /** Occurrences the quantiles are computed over. */
  n: number;
  /** Median. */
  p50: number;
  /** 90th percentile. */
  p90: number;
  /** 99th percentile. */
  p99: number;
  /** Largest value seen. */
  max: number;
}

/** How an estimate was produced. */
export interface WebhookEstimateBasis {
  /**
   * `exact` counted every occurrence in the window, `sampled` scaled the
   * counts from a capped scan, and `replayed` re-ran a windowed rule over
   * history at your parameters.
   */
  mode: 'exact' | 'sampled' | 'replayed';
  /** What qualifies the numbers, when anything does. */
  note: string | null;
}

/** How often a rule would have fired over the window, and how that varies with its threshold. */
export interface WebhookEstimateResult {
  /** Event type evaluated. */
  eventType: string;
  /** The window actually covered. */
  window: WebhookWindow;
  /** Days the answer covers. Shorter than requested when the event type has a shorter cap. */
  days: number;
  /** Occurrences that would have been delivered across the window. */
  total: number;
  /** One entry per day, oldest first, zero filled. */
  perDay: WebhookDayCount[];
  /** Median deliveries a day. */
  perDayP50: number;
  /** Busiest day. */
  perDayMax: number;
  /** The metric the ladder and the distribution are about. Null when the type has none. */
  primaryMetric: string | null;
  /** Ascending thresholds and the daily rate at each. Empty when there is no primary metric. */
  ladder: WebhookEstimateRung[];
  /** Quantiles of the primary metric. Null when there is none or nothing matched. */
  distribution: WebhookEstimateDistribution | null;
  /** Newest matches first, in the same shape the dry run returns. */
  sample: WebhookOccurrence[];
  /** How the answer was produced. */
  basis: WebhookEstimateBasis;
}
