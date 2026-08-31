# Changelog

All notable changes to `@0xarchive/sdk` are documented in this file.

The format is loosely based on Keep a Changelog and the project follows
semver in spirit.

## 1.9.1 (2026-08-31)

### Added
- **Hyperliquid Spot candles**: `client.spot.candles.history()` now wraps
  `GET /v1/hyperliquid/spot/candles/{symbol}`. Coverage starts at
  `2025-03-22T10:50:22Z`; the route supports `1m`, `5m`, `15m`, `30m`, `1h`,
  `4h`, `1d`, and `1w`, accepts up to 1000 rows, and returns opaque cursors.

### Changed
- Documented the Free plan history window: Free includes every market, route,
  schema, and served depth, with history limited to the most recent rolling
  30 days and a maximum 30-day span per request or replay. Build and above
  keep the full retained archive. Plans gate capacity and Free's 30-day
  history window, not route families, schemas, or served depth.
- Spot documentation and types now distinguish the served candle route from
  the still-unsupported funding, open-interest, and liquidation resources.

## 1.9.0 (2026-08-22)

### Added
- **HIP-4 candles**: `client.hyperliquid.hip4.candles.history()` now exposes
  typed OHLCV history for outcome sides. Coverage is served from 2026-05-02;
  candle OHLC values are implied probabilities in `[0, 1]`.

### Changed
- HIP-4 coverage copy now distinguishes served candles and outcome-side open
  interest (approximately 10-second updates) from the unsupported funding
  resource. The SDK still does not expose HIP-4 funding.
- Route-family cadence copy no longer describes all omitted OI/funding intervals
  as raw approximately one-minute data. Lighter L3 depth is documented as 250
  orders per side, and Lighter trades as per-fill maker/taker context where
  served.
- HIP-4 WebSocket docs now distinguish live trades/L4/settlement delivery from
  stored-replay-only L2 and OI while those live bridges are paused.

## 1.8.0 (2026-07-27)

### Added
- **Liquidation levels**: `client.hyperliquid.liquidations.levels(symbol, params?)`
  and the HIP-3 equivalent. Projected forced-liquidation levels computed from
  clearinghouse positions and margin state, bucketed around the snapshot mark
  price. Snapshots refresh about every 45 minutes; `params.at` (epoch ms)
  serves a point-in-time read. `params.side` filters one side.
- **Liquidation levels history**: `liquidations.levelsHistory(symbol, params?)`
  with cursor pagination (`start`/`end`/`limit`/`cursor`) and `summary: true`
  for cheap snapshot discovery. History is retained from 2026-07-27.
- **Trigger levels**: `client.hyperliquid.orders.triggerLevels(symbol, params?)`
  and the HIP-3 equivalent. Pending stop-loss and take-profit trigger orders
  grouped into price buckets, with `asOf` freshness and side totals.
- **Trigger levels history**: `orders.triggerLevelsHistory(symbol, params?)`,
  15-minute snapshot cadence, same pagination and summary mode.
- New exported types (`LiquidationLevels`, `TriggerLevels`, bucket and history
  item types, `LevelsHistoryParams`, `LevelsSide`) and Zod schemas for
  response validation.
- **`meta.coverageFrom` / `meta.notice`**: empty responses for range windows
  that end before a symbol's coverage begins now carry the coverage start date
  and an advisory notice.

### Changed
- The server-side `/liquidations/{symbol}/levels` endpoints now serve
  projected forced-liquidation levels. Before 2026-07-27 (2026-07-23 on
  Hyperliquid core) those paths served the pending trigger-order map, which
  now lives at `/orders/{symbol}/trigger-levels`.

### Fixed
- **L2 full-depth pagination**: `l2Orderbook.history()` and `.diffs()` read
  the raw `meta.next_cursor` key, but the HTTP layer camelizes response keys,
  so the cursor was always undefined and pagination stopped after one page.
  Both now read `meta.nextCursor`.
- **`SpotPair` type rewritten to the actual wire shape** (pairIndex, name,
  isCanonical, token ids/names/decimals, baseTokenAddress, deployerFeeShare,
  first/last timestamps). The previous fields (baseAsset, quoteAsset,
  wireSymbol, assetIndex, szDecimals, pxDecimals, isActive, markPrice,
  midPrice, latestTimestamp) never existed on the wire and were always
  undefined at runtime.
- **`SpotTwapStatus`**: renamed phantom `filledSize`/`filledNotional` to the
  wire's `executedSize`/`executedNotional` (numbers), and added
  `blockNumber`, `blockTime`, `startedAt`.

## 1.7.1 (2026-06-29)

- Remove tier-gating language from doc comments, open-catalog rollout.

## 1.7.0 (2026-05-06)

### Added
- **Hyperliquid Spot support**. New top-level client `client.spot` mirroring
  the HIP-3 surface, minus the perp-only constructs (no funding, no open
  interest, no liquidations, no candles). Symbols are dashed canonical
  (`HYPE-USDC`, `PURR-USDC`); the server resolves the dashed form to
  Hyperliquid's wire formats (`PURR/USDC`, `@107`) internally.
  - REST resources: `client.spot.pairs` (list/get), `client.spot.orderbook`
    (current + history), `client.spot.trades` (list/recent),
    `client.spot.orders` (Pro+ history), `client.spot.l4Orderbook` (Pro+
    snapshot, Pro+ diffs, Build+ checkpoint history),
    `client.spot.twap` (by symbol or by user wallet),
    `client.spot.freshness(symbol)`.
  - WebSocket channels: `spot_orderbook`, `spot_trades` (Build+),
    `spot_l4_diffs`, `spot_l4_orders` (Pro+), `spot_twap` (Build+).
  - New helpers on `OxArchiveWs`: `subscribeSpot(channel, coin)` and
    `unsubscribeSpot(channel, coin)`. Short forms accepted
    (`'orderbook'` is rewritten to `'spot_orderbook'`).
  - `spot_orderbook` data routes through the existing `onOrderbook` handler;
    `spot_trades` data routes through the existing `onTrades` handler.
  - New types: `SpotPair`, `SpotTwapStatus`. New exported class: `SpotClient`.
  - Coverage: trades from 2025-03-22 (S3 backfill); orderbook, L4, and TWAP
    statuses live from 2026-05-05.

### Notes
- **No spot funding, open interest, liquidations, or candles.** Those are
  perpetual constructs. The SDK intentionally does not expose them on the
  spot client. `/v1/hyperliquid/spot/candles/{symbol}` returns 501 by
  design and is not wrapped.
- Spot pre-2025-03-22 trade history is unrecoverable from any free public
  archive (Hyperliquid did not publish spot fills before that date).

## 1.6.0 — 2026-05-04

### Added
- **Real-time WebSocket support for liquidations**. The `liquidations` and
  `hip3_liquidations` channels now stream live (Hyperliquid + HIP-3 nodes) in
  addition to historical replay. Each item is a fill row with
  `is_liquidation: true`, sharing the trade wire shape.
  - New helpers on `OxArchiveWs`: `subscribeLiquidations(coin)`,
    `unsubscribeLiquidations(coin)`, `subscribeHip3Liquidations(coin)`,
    `unsubscribeHip3Liquidations(coin)`.
  - New typed event handler: `onLiquidations((channel, coin, fills) => ...)`
    where `fills` is `Trade[]`.
- **HIP-4 WebSocket channel helpers**: `hip4_trades` (live + replay),
  `hip4_orderbook` and `hip4_open_interest` (stored replay; live bridges
  currently paused), and `hip4_l4_diffs` / `hip4_l4_orders` (live only).
  - New helpers: `subscribeHip4(channel, coin)`, `unsubscribeHip4(channel, coin)`.
  - `hip4_orderbook` data routes through the existing `onOrderbook` handler.
  - `hip4_trades` data routes through the existing `onTrades` handler.
- **HIP-4 settlement event**: new `outcome_settled` server message added to
  the discriminated union `WsServerMessage`. Pushed once per
  `(outcome_id, side)` when an outcome settles. After delivery the server
  unsubscribes the client from every `hip4_*` subscription on the settled
  coin — treat it as a terminal signal.
  - New typed event handler: `onOutcomeSettled((coin, outcomeId, side, value, at) => ...)`.
  - New type: `WsOutcomeSettled`.
  - New schema: `WsOutcomeSettledSchema`.
- **HIP-4 outcome lookup by slug**:
  - New REST endpoint wrapper: `Hip4OutcomesResource.getBySlug(slug)`.
  - New flat method: `client.hyperliquid.hip4.getOutcomeBySlug(slug)`.
  - New `slug` filter on `listOutcomes({ slug, isSettled })`.
- **Expanded HIP-4 response types**:
  - `Hip4Outcome` now exposes `displayTitle`, `slug`, `settlementValue`,
    `settlementAt`.
  - `Hip4OutcomeAggregate` now exposes `displayTitle`, `slug`, `outcomePair`.
  - `Hip4OutcomeSideSpec` now exposes `displayTitle`, `slug`.

### Fixed
- **HIP-4 fragment bug (critical)**: when a HIP-4 coin like `'#20'` (the
  canonical form returned by the API in `coin` fields) was passed to the
  client, `fetch` parsed `#` as the URL fragment delimiter and silently
  dropped the rest of the path. Calls like
  `client.hyperliquid.hip4.trades.recent('#20')` and
  `openInterest.current('#20')` 404'd with empty bodies, surfacing as
  "Unexpected end of JSON input". The SDK now URL-encodes `#` to `%23` on
  the wire across every HIP-4 resource (`orderbook`, `trades`,
  `openInterest`, `orders`, `l4Orderbook`, `l2Orderbook`, `instruments`,
  and the flat `getSummary` / `getFreshness` / `getPrices` methods). Both
  the bare numeric form (`'0'`) and the `#`-prefixed form (`'#0'`) now work
  uniformly. (Reverts the 1.5.0 behavior change that "passed `#` through
  verbatim" — it broke the canonical form.)
- **`client.hyperliquid.trades.recent()` no longer surfaces an opaque JSON
  parse error.** Hyperliquid's REST API has no `/trades/{symbol}/recent`
  endpoint (only HIP-3, HIP-4, and Lighter do — the others have real-time
  ingestion). Calling it on `client.hyperliquid.trades` (or the legacy
  `client.trades`) now throws a structured `OxArchiveError` directing the
  caller to `trades.list(symbol, { start, end })` or to one of the venues
  that does support the endpoint.

### Changed
- `Hip4ListOutcomesParams` now includes optional `slug?: string` filter.
- `WsChannelSchema` updated to enumerate every current channel including
  `hip4_*`, `lighter_l3_orderbook`, `hip3_liquidations`, and the L4 channel
  variants (the older schema was missing several entries).

### Notes
- **HIP-4 funding and liquidations remain unsupported.** HIP-4 outcome markets
  settle to 0/1 at expiry instead of streaming a funding curve, and there is
  no liquidation engine. Candle history was added after this release and is
  exposed by the current SDK under `client.hyperliquid.hip4.candles`.
- **HIP-4 mark/mid prices are implied probabilities**, not USD. The SDK
  surfaces them on `OpenInterest`, `PriceSnapshot`, and `CoinSummary` types
  but they are bounded to `[0, 1]`. JSDoc on the HIP-4 client and types now
  calls this out explicitly.

## 1.5.0

- HIP-4 outcome markets initial REST coverage. Real-time WebSocket support,
  `outcome_settled` event, slug-based lookup, and `liquidations` /
  `hip3_liquidations` realtime promotion shipped in 1.6.0.
