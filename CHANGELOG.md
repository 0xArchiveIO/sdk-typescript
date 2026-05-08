# Changelog

All notable changes to `@0xarchive/sdk` are documented in this file.

The format is loosely based on Keep a Changelog and the project follows
semver in spirit.

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
- **HIP-4 WebSocket channels**: `hip4_orderbook`, `hip4_trades`,
  `hip4_open_interest` (realtime + replay) and `hip4_l4_diffs`,
  `hip4_l4_orders` (realtime only, Pro+).
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
- **No HIP-4 candles, funding, or liquidations.** HIP-4 outcome markets
  settle to 0/1 at expiry instead of streaming a funding curve, and there is
  no liquidation engine. The SDK intentionally does not expose these.
- **HIP-4 mark/mid prices are implied probabilities**, not USD. The SDK
  surfaces them on `OpenInterest`, `PriceSnapshot`, and `CoinSummary` types
  but they are bounded to `[0, 1]`. JSDoc on the HIP-4 client and types now
  calls this out explicitly.

## 1.5.0

- HIP-4 outcome markets initial REST coverage. Real-time WebSocket support,
  `outcome_settled` event, slug-based lookup, and `liquidations` /
  `hip3_liquidations` realtime promotion shipped in 1.6.0.
