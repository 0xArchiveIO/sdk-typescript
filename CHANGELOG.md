# Changelog

All notable changes to `@0xarchive/sdk` are documented in this file.

The format is loosely based on Keep a Changelog, and the project follows
semantic versioning.

## 1.12.0 (2026-10-05)

This release adopts the 0xArchive API contract `2026-10-01`. Every REST
request sends `0xArchive-Version: 2026-10-01` and the WebSocket client
connects with `version=2026-10-01`; the SDK parses the response shapes of that
version. The changes this brings are listed under Added and Changed.

### Added
- API version: `API_VERSION` (`2026-10-01`) and `API_VERSION_HEADER`, sent on
  every REST request (including the raw web3 subscribe requests) and as the
  WebSocket `version` query parameter.
- Error codes: `ERROR_CODES` and the `ErrorCode` union (`invalid_parameter`,
  `invalid_symbol`, `invalid_interval`, `invalid_cursor`,
  `invalid_time_range`, `range_before_coverage`, `historical_range_exceeded`,
  `historical_depth_exceeded`, `unsupported_for_venue`, `route_not_found`,
  `not_found`, `unauthorized`, `forbidden`, `insufficient_credits`,
  `rate_limited`, `conflict`, `upstream_unavailable`, `internal_error`, the
  WebSocket-only `slow_consumer` and `endpoint_unsupported`, and the
  route-specific `positions_unavailable`, `api_key_limit_reached` and
  `oauth_not_permitted`), `WEBSOCKET_ONLY_ERROR_CODES` and `isErrorCode()`.
- `OxArchiveError` exposes `status` (the HTTP status, the same value as
  `code`), `param` and `validValues` (the refused parameter and what it
  accepts) and `body` (the whole error body, for fields such as
  `availableOn` on `unsupported_for_venue`), beside `errorCode` and
  `requestId`. A non-JSON error body now keeps its HTTP status instead of
  surfacing as a 500 parse error.
- WebSocket error messages expose `errorCode` (copied from the wire's
  `error_code`), and `ws.onServerError()` receives every
  `{"type":"error"}` message. `slow_consumer` means the connection fell
  behind a stream and messages were dropped: re-subscribe, or restart the
  replay, to resync.
- Pagination: every paged method returns `hasMore` beside `nextCursor`, read
  from `meta.hasMore` (true exactly when a cursor was returned, where an
  older server omits it), and returns `meta`. The positions iterators stop
  when `hasMore` is false.
- `meta.symbol` and `meta.venue` on `ApiMeta` (and `ApiMetaSchema`): the
  canonical public symbol and venue (`hyperliquid`, `hip3`, `hip4`, `spot`,
  `lighter`, `rh-lighter`) that per-symbol routes return. `VENUES` and the
  `Venue` type list the venue names.
- `client.capabilities()` (`GET /v1/capabilities`): one typed `Capability`
  row per venue and datatype with the REST routes, WebSocket channels, live
  and replay flags, first served instant (`availableFrom`), cadence, page
  limit, intervals and notes. Zod: `CapabilitySchema`,
  `CapabilitiesResponseSchema`.
- `WS_CHANNEL_CAPABILITIES`: one table of every WebSocket channel with its
  venue, datatype and live, replay and bulk-replay flags, mirroring
  `/v1/capabilities`. `WS_LIVE_CHANNELS`, `WS_REPLAY_CHANNELS` and
  `WS_BULK_REPLAY_CHANNELS` are derived from it, and the client's live and
  replay checks read it.
- WebSocket replay of every L4 channel on HIP-3, HIP-4 and Spot
  (`hip3_l4_diffs`, `hip3_l4_orders`, `hip4_l4_diffs`, `hip4_l4_orders`,
  `spot_l4_diffs`, `spot_l4_orders`) and of the full-depth channels
  (`orderbook_full`, `hip3_orderbook_full`), like core L4: single-channel,
  an explicit `end`, `speed` ignored, an `l4_snapshot` anchor then ordered
  `l4_batch` pages. Types `L4Channel`, `WsBulkReplayChannel`,
  `WsBulkReplayOptions` and `WsBulkReplay`.
- `side: 'buy' | 'sell'` on trade history (`trades.history()`,
  `trades.list()`, `hyperliquid.hip4.getTrades()`) and on `trades.recent()`
  (`recent(symbol, { limit, side })`; a number is still read as the limit),
  on every venue. The filter is applied by the API, so a full page holds
  `limit` matching trades and the cursor pages the filtered tape. Types
  `TradeSideFilter` and `RecentTradesParams`.
- `triggered` on order history (`OrderHistoryParams`, Hyperliquid core,
  HIP-3 and HIP-4): `true` keeps only trigger events, `false` leaves them out.
- `depth` on full-depth L2 history (`l2Orderbook.history()`, type
  `L2OrderBookHistoryParams`). `depth` on order book history
  (`OrderBookHistoryParams`) now takes effect on HIP-3, HIP-4 and Spot too.
- Method aliases that follow the contract's verbs (`get` point-in-time,
  `current`, `history` paged series, `list` catalogs), beside the existing
  names: `trades.history()` (the same call as `trades.list()`) and
  `spot.twap.history()` (the same call as `spot.twap.bySymbol()`).
- Types `L4OrderBookSnapshot` and `L4RestingOrder` for
  `l4Orderbook.get()`, and exported `OrderHistoryParams`, `OrderFlowParams`,
  `TpslParams` and `L4OrderBookParams`.
- `client.hyperliquid.breadth` (`current()`, `history()`): core Hyperliquid breadth above the
  UTC-session VWAP, the same shape as HIP-3 breadth.
- Lighter on Robinhood Chain, the second deployment of Lighter, as
  `client.rhLighter` (`/v1/rh-lighter`). It has the same resources as
  `client.lighter` except the L3 order book: `instruments`, `orderbook`,
  `trades` (`list()` and `recent()`), `candles`, `openInterest`, `funding`,
  `liquidations`, `positions`, `freshness()`, `summary()` and
  `priceHistory()`. Markets are quoted in USDG: perpetuals use uppercase
  symbols (`BTC`) and spot markets dashed symbols (`AAPL-USDG`). Trades and
  liquidations are served from 2026-06-26 20:10:26 UTC; order book, open
  interest and funding from 2026-08-22 18:43 UTC; candles from 2026-06-26
  20:10 UTC.
- `liquidations` on both Lighter clients (`client.lighter.liquidations` and
  `client.rhLighter.liquidations`): `history()` returns `LighterLiquidation`
  rows and `volume()` returns `LighterLiquidationVolume` buckets. On
  Robinhood Chain, rows from before live capture were backfilled from the
  venue's finalized export and have `source: 'bucket'` and an empty
  `rawJson`; rows captured live have `source: 'ws'` and the venue's raw JSON.
- WebSocket channels `rh_lighter_orderbook`, `rh_lighter_trades`,
  `rh_lighter_open_interest` and `rh_lighter_funding` (live and replay, with
  the same live payload shapes as the mainnet Lighter channels) and
  `rh_lighter_candles` (replay only). `ws.subscribeRhLighter()` and
  `ws.unsubscribeRhLighter()` accept short or full channel names;
  `onRhLighterOrderbook()`, `onRhLighterTrades()` and `onRhLighterStats()`
  keep Robinhood Chain data apart from mainnet Lighter and Hyperliquid data.
  `intervalMs` (100 to 5000) is accepted on `rh_lighter_orderbook`. Live
  Robinhood Chain data is served on `wss://api.0xarchive.io/ws`.
- Account positions on `client.hyperliquid.positions`,
  `client.hyperliquid.hip3.positions`, `client.lighter.positions` and
  `client.rhLighter.positions`: `get()` (live, or as of any instant),
  `history()`, `changes()`, `market()`, `marketSummary()`, `all()`,
  `account()` and `accountHistory()`. `account()` is the clearinghouse
  summary on Hyperliquid and HIP-3 and the account's position aggregates
  (totals, long/short value, position count) on Lighter and Robinhood
  Chain. Cursor
  iterators: `iterateHistory()`, `iterateChanges()`,
  `iterateAccountHistory()`, `iterateMarket()`, `iterateMarketSummary()` and
  `iterateAll()`. Wallet routes take a `0x` address on Hyperliquid and HIP-3
  (optional `dex` on HIP-3) and an integer account index on Lighter. `dex`
  (HIP-3 only) and `includeSystem` (Lighter only) are refused before sending
  on other clients. `iterateMarketSummary()` takes both `start` and `end` and
  sends the same window on every page; `marketSummary()` refuses a `cursor`
  without an explicit `end`, because a summary cursor is bound to its window.
- `client.lighter.accounts.byL1()` and `iterateByL1()`: Lighter account
  indices owned by an L1 address (mainnet).
- `client.dataQuality.positionsFreshness()`: one `PositionsFreshness` row per
  venue with the latest live and hourly snapshots, the live snapshot's age
  and quality, `stale`, `builtThrough` and `finalizedThrough`.
- Types `Position`, `PositionChange`, `MarketPosition`, `AccountSummary`,
  `MarketPositionsSummary`, `WalletPositions`, `LighterL1Accounts`,
  `PositionsResponse` and the positions parameter types, with Zod schemas.
- Response meta fields on `ApiMeta` (and in `ApiMetaSchema`, so validation
  keeps them): `finalizedThrough`, `requestedEnd`, `clampedTo`,
  `preliminaryRowCount`, `asOf`, `snapshotTs`, `source`, `quality`, `stale`,
  `totals` and `builtThrough`.
- `OxArchiveError.errorCode`: the API's stable error code, typed as
  `ErrorCode` or a route-specific string such as `snapshot_advanced` (a 409
  from a positions cursor whose snapshot was replaced).
- `OrderFlowParams.cursor` (Hyperliquid, HIP-3 and HIP-4). Order flow is
  paged: a page holds the oldest `limit` buckets of the window, and
  `nextCursor` is set while more may follow. Pass it back as `cursor` with
  the same `start`, `end` and `interval` until it is undefined.
  `orders.flow()` and `hyperliquid.hip4.getOrderFlow()` already sent any
  params they were given, so this adds the type and the docs.
- Webhooks: `client.webhooks` covers all 21 webhook routes. Catalog and
  limits (`eventTypes()`, `limits()`); endpoints (`listEndpoints()`,
  `createEndpoint()`, `deleteEndpoint()`, `enableEndpoint()`,
  `rotateSecret()`, `testEndpoint()`); deliveries (`listDeliveries()`,
  `redeliver()`); subscriptions (`listSubscriptions()`,
  `createSubscription()`, `updateSubscription()`, `deleteSubscription()`,
  `resumeSubscription()`, `resumeAllSubscriptions()`); the previews
  (`estimate()`, `dryRun()`); and watched wallets (`listAddresses()`,
  `addAddress()`, `deleteAddress()`). Subscriptions carry their pause state
  (`status`, `pauseReason`, `pauseMessage`, `suppressedCount` and the
  record of the previous pause), and a resume returns the window that was
  missed (`gap.replayWindow`).
- Webhook signature verification: `constructWebhookEvent()` verifies a
  delivery and returns the parsed event, `verifyWebhookSignature()` answers
  the same question as a boolean, and `assertWebhookSignature()` throws a
  `WebhookSignatureError` naming the check that failed. They take the raw
  body as a string, `Buffer`, `Uint8Array` or `ArrayBuffer` and refuse a
  parsed object, accept a delivery when any `v1` in `0xa-signature` matches
  any secret passed (so both signatures work during a secret rotation),
  compare in constant time, and enforce a 300 second replay window by
  default (`toleranceSeconds`). `createWebhookSignatureHeader()`,
  `parseWebhookSignatureHeader()` and `readWebhookHeader()` help test a
  receiver.
- Cumulative volume delta: `client.hyperliquid.cvd.history()` and
  `client.hyperliquid.hip3.cvd.history()` return taker buy and sell notional,
  delta and a running total per bucket (`1m` to `1w`, default `1h`), cursor
  paged. Pass `nextCursor` back unchanged with the same window; the running
  total restarts on every page.
- HIP-3 oracle: `client.hyperliquid.hip3.oracle.externalPrice()` (the latest
  deployer-pushed external price and mark price) and `discoveryBounds()`
  (the instantaneous discovery bounds around the reference price).
- HIP-4 questions: `client.hyperliquid.hip4.questions.list()` (cursor paged)
  and `get()`, with `listQuestions()` and `getQuestion()` on the HIP-4
  client. A question groups binary outcomes under one ballot.
- Wallet classification: `client.hyperliquid.wallets.classify()` and
  `client.hyperliquid.hip3.wallets.classify()` return precomputed daily
  behavioral metrics per wallet, with filters, sorting and offset paging.
- `client.symbols.list()`: the public symbol universe across every venue
  family, with coverage dates, data types, and coverage and size per data
  type.
- WebSocket channels `orderbook_full` (Hyperliquid core) and
  `hip3_orderbook_full` (HIP-3): the full-depth L2 book, live and replayed
  in bulk. A subscription or replay starts with an `l4_snapshot` message
  holding every price level and continues with `l4_batch` messages of level
  changes, typed as `WsL2FullDepthSnapshot` and `WsL2FullDepthBatch` and
  accepted by `WsServerMessageSchema`. `multiReplay()` refuses them before
  sending, because they replay alone.
- Types and Zod schemas for every new response.
- `account` on `lighter.l3Orderbook.get()` and `history()`: only the orders
  owned by one Lighter account index. Typed as `L3OrderBookParams` and
  `L3OrderBookHistoryParams`.

### Changed
- Response shapes of the `2026-10-01` API version:
  - Data quality (`client.dataQuality.*`) and `client.symbols.list()` read
    the standard `{ success, data, meta }` envelope and return its `data`,
    as before.
  - Record times that were integer milliseconds are RFC 3339 UTC strings,
    with the integer in a field ending `Ms`: `timestamp` and `timestampMs`
    on `CvdBucket`, `Hip3OracleDiscoveryBounds`, `Hip3OracleExternalPrice`,
    `LighterLiquidation` and `LighterLiquidationVolume`, and on the resting
    orders of an L4 snapshot (null when the queue time is unknown).
    `snapshotTs` on `LiquidationLevels`, `LiquidationLevelsHistoryItem` and
    `TriggerLevelsHistoryItem` is RFC 3339 and gains `snapshotTsMs`. Code
    that read the integer from `timestamp` reads `timestampMs`.
  - Lighter and Robinhood Chain WebSocket replay rows use the live payload
    shapes: `LighterLiveOrderbook` for books, an array of one
    `LighterLiveTrade` leg for trades, `LighterLiveStats` for open interest
    and funding. A tick-granularity replay's checkpoint is converted to an
    `OrderBook` before `onHistoricalTickData()` handlers run.
- The WebSocket client's live and replay checks follow
  `WS_CHANNEL_CAPABILITIES`. Replay is refused before sending for the
  live-only `ticker`, `all_tickers`, `spot_orderbook` and `spot_trades`; a
  live subscription for the replay-only `candles`, `hip3_candles`,
  `hip4_orderbook`, `hip4_open_interest`, `lighter_candles`,
  `lighter_l3_orderbook` and `rh_lighter_candles`; and both for `spot_twap`,
  whose data is served over REST only (`client.spot.twap`). The API accepts
  a live subscription to `hip4_orderbook`, `hip4_open_interest` and
  `spot_twap` but sends nothing on it, so `subscribe()`, `subscribeHip4()`
  and `subscribeSpot()` now throw for them instead of waiting on a channel
  that never streams; read the current HIP-4 book and open interest over
  REST. Bulk channels need an explicit `end` and are refused in
  `multiReplay()`. `WsReplayableChannel` and `WsStandardReplayChannel`
  follow the same table, `WsLiveOnlyChannel` lists the live-only channels
  and `WsRestOnlyChannel` the REST-only one; `WsCoreL4ReplayOptions` and
  `WsCoreL4Replay` are aliases of the bulk types, and
  `HyperliquidL4LiveOnlyChannel` is kept for compatibility.
- Requests sent over the WebSocket before it is open are no longer dropped
  without notice. While the client is connecting or reconnecting,
  `replay()`, `multiReplay()` and the replay controls are queued and sent
  once the socket opens (and discarded if the first connect fails). While it
  is disconnected they throw an error that says to call and await
  `connect()`; `replayStop()` and `streamStop()` do nothing then, since
  nothing is running. Subscriptions are unchanged: they are kept and sent on
  every connect.
- `trades.recent()` on Hyperliquid core, which has no recent route, throws
  with `errorCode` `route_not_found`, the code the API would send.
- `LiquidationLevelsParams.at` also takes an ISO 8601 string, converted like
  every other time parameter.
- `trades.list()` now also returns `meta`, so Lighter callers (both
  deployments) can read the finalization boundary (`meta.finalizedThrough`)
  and see when the requested window was clamped (`meta.clampedTo`,
  `meta.requestedEnd`). `CursorResponse` gains an optional `meta` field.
- `LighterClient` now extends `LighterDeploymentClient`, the resources shared
  by both Lighter deployments. Its public API is unchanged apart from the new
  `liquidations`, `positions` and `accounts` resources.
- `OiFundingInterval` includes `'1m'`. The API serves 1-minute buckets
  on funding, open interest, price, liquidation-volume and breadth history
  for every venue, and every params type that uses `OiFundingInterval`
  accepts it.
- `OrderFlowParams.interval` documents the buckets the API serves: `'1m'`
  (the default), `'5m'`, `'15m'` and `'1h'`.
- The HTTP layer gained `PATCH` and `DELETE`, which the webhook routes need,
  and every verb now shares one request path. Behaviour for existing
  resources is unchanged.
- Response key conversion can leave a subtree exactly as the API sent it.
  A webhook subscription's `filters`, a delivery's `payload`, an
  occurrence's `data`, the event catalog's `params`, `metrics`, `operators`
  and `filtersExample`, and the symbol list's `coverageByType` and
  `sizePerDay` keep their keys, because those keys are data. Every other
  response is converted as before.
- Parameters the API ignores are no longer offered: `user`, `status` and
  `order_type` on Spot order history (`client.spot.orders.history()`). The
  route returned the same rows with or without them. Hyperliquid core,
  HIP-3 and HIP-4 order history keep their filters.

### Removed
- Methods that called routes the API does not serve, so they always failed
  with a 404: `hyperliquid.hip4.l2Orderbook` (`get()`, `history()` and
  `diffs()`), `hyperliquid.hip4.orders.triggerLevels()` and
  `triggerLevelsHistory()`, `spot.orders.flow()`, `tpsl()`,
  `triggerLevels()` and `triggerLevelsHistory()`, and
  `hyperliquid.hip3.liquidations.byUser()`. The same methods remain where
  the API serves them: full-depth L2 on Hyperliquid core and HIP-3, trigger
  levels on core and HIP-3, order flow and TP/SL on core, HIP-3 and HIP-4,
  and liquidations by user on core.

### Fixed
- The WebSocket client works on every Node.js version. It used the global
  `WebSocket`, which Node.js 18 and 20 do not have, so `connect()` failed
  there with `WebSocket is not defined`; and the built-in `WebSocket` of
  some Node.js 24 releases closes the connection on a compressed message
  larger than about 4 MB once decompressed, which a BTC L4 snapshot is. In
  Node.js the client now connects with the `ws` package, already a
  dependency of the SDK, and falls back to the built-in `WebSocket` only if
  `ws` cannot be loaded. Browsers keep the built-in `WebSocket`, and a
  `WebSocket` assigned to `globalThis` by the caller is used as is.
- Type declarations per module format: the `exports` map now points
  `import` at `index.d.mts` and `require` at `index.d.ts`. TypeScript
  projects that compile as ES modules with `moduleResolution` `node16` or
  `nodenext` failed to type-check `import OxArchive from '@0xarchive/sdk'`,
  because the declarations were read as CommonJS. The JavaScript entry
  points are unchanged.
- `side` on trade history takes `'buy'` or `'sell'` (`TradeSideFilter`),
  the values the API accepts. Up to 1.11.0 `GetTradesCursorParams.side` was
  typed `TradeSide` (`'A' | 'B'`), which the API refuses with
  `invalid_parameter`.
- `hip4.outcomes.getBySlug()` URL-encodes the slug. Slugs with spaces,
  colons, `#` or `/` reached the wrong route before.
- `spot.freshness()` returns `SpotFreshness`, the buckets Spot reports: order
  book, trades, L4 checkpoints and diffs, order lifecycle and TWAP. It was
  typed as `CoinFreshness`, whose funding and open interest Spot never
  sends, so it failed with `validate: true`.
- `CoinFreshness.funding` is optional, because HIP-4 has no funding;
  `hyperliquid.hip4.getFreshness()` failed with `validate: true`.
  `CoinFreshness.symbol` is typed and kept under validation.
- `dataQuality.symbolCoverage()` URL-encodes the symbol, so HIP-4 sides such
  as `#0` reach the API; symbols keep their case (`km:US500`, `HYPE-USDC`).
  Its examples read `dataTypes.openInterest`, the key the SDK returns.
- `OxArchiveError.requestId` is set on failed requests. An error response
  carries `request_id` at the top level rather than under `meta`, so it was
  undefined on every error before.
- `hyperliquid.hip4.outcomes.list()` and `listOutcomes()` send `isSettled` as
  `is_settled`, the parameter the API reads. Before, the filter was ignored
  and settled and live outcomes came back alike.
- Times without a time zone are UTC on every method. Before, a date-time
  string without an offset (`'2026-09-01T00:00:00'`) was read as the
  machine's local time where the SDK parsed it (candles, tick-level order
  book history, positions), so the same call asked for a different window
  on machines in different time zones. Every other route sent time strings
  to the API unchanged, and the API refuses anything but Unix milliseconds,
  so an ISO string for `start`, `end` or `timestamp` failed there. Every
  time parameter now goes through one helper: ISO 8601 strings are
  converted to Unix milliseconds, a date alone is midnight UTC, an
  offset-less date-time is UTC, and a `Z` or `+hh:mm` offset is honored.

### Documentation
- README sections for the API version, method names, pagination with
  `hasMore`, capabilities, error codes, bulk WebSocket replay and WebSocket
  errors, and the response time formats. The WebSocket channel tables follow
  `/v1/capabilities`.
- The venue is named Lighter (not Lighter.xyz) in the README and doc
  comments.
- The README's order-flow example follows `nextCursor` with the same
  window.
- README sections for webhooks (setup, previews, plans and pauses,
  verifying a delivery with test vectors, secret rotation, deliveries,
  watched wallets), CVD, the HIP-3 oracle, HIP-4 questions, wallet
  classification, the symbol universe and the full-depth WebSocket channels.
- The README's coverage table lists each dataset's first served instant as
  `/v1/capabilities` reports it, replacing month-level dates such as
  "February 2026+" and "April 2023+". For example, HIP-3 trades are served
  from 2025-10-13 12:24 UTC, HIP-3 L4 and order history from 2026-03-11
  01:03 UTC, and Hyperliquid liquidations from 2025-12-22 (was "May
  2025+"). Robinhood Chain candles are listed as served from 2026-06-26
  20:10 UTC.
- The README no longer pins market counts for Spot and Robinhood Chain;
  `client.spot.pairs.list()` and `client.rhLighter.instruments.list()`
  return the current set.
- README examples use windows relative to now, so they run on every plan,
  including Free's 30-day history window. HIP-4 examples look up a current
  outcome before reading its market data, and HIP-3 examples use markets
  that are trading (`xyz:SP500`, `xyz:TSLA`). Every WebSocket example awaits
  `connect()` before a replay. The note on Hyperliquid core trades no
  longer describes how they are collected; it points to `history()` over a
  recent window and to the live `trades` channel, since core has no
  recent-trades route. Spot TWAP is documented as REST only.
- The HIP-3 coin table is removed, since builders list and delist markets;
  call `client.hyperliquid.hip3.instruments.list()` for the current set.
- Documentation links point at docs.0xarchive.io.

### Development
- vitest 3.2 (was 2.x), the patched line. It installs cleanly with the npm
  bundled with Node 20 and 22.

## 1.11.0 (2026-09-25)

Versions 1.9.0, 1.9.1 and 1.10.0 were not published to npm, so upgrading
from npm goes straight from 1.8.0 to 1.11.0. This release includes their
changes, listed in the sections below.

### Added
- Live WebSocket subscriptions for four Lighter.xyz channels:
  `lighter_orderbook`, `lighter_trades`, `lighter_open_interest` and
  `lighter_funding`, served on `wss://api.0xarchive.io/ws` (the client
  default). They use the same subscribe, ack and `data` envelope as
  Hyperliquid live data and the same symbols as
  `client.lighter.instruments.list()`.
- `ws.subscribeLighter(channel, symbol, options?)` and
  `ws.unsubscribeLighter(channel, symbol)`, accepting the short
  (`'orderbook'`) or full (`'lighter_orderbook'`) channel name.
- `intervalMs` subscribe option (`WsSubscribeOptions`), sent as
  `interval_ms`. Live Lighter books default to one per second; pass 100 to
  5000 to choose the rate. Each book sent is one metered message. It is
  accepted on `lighter_orderbook` only, is checked before anything is sent,
  and is re-sent on reconnect.
- `onLighterOrderbook()`, `onLighterTrades()` and `onLighterStats()`
  handlers with typed payloads: `LighterLiveOrderbook` (a full top-20 book per
  message), `LighterLiveTrade` (two legs per trade sharing `tid`) and
  `LighterLiveStats` / `LighterLiveAssetCtx` (the message shared by
  `lighter_open_interest` and `lighter_funding`), plus matching Zod schemas.
- `Trade.accountIndex`: the Lighter account index of a fill's owner, set on
  live Lighter trade legs and present on Lighter REST trades.
- `symbol` on `WsSubscribed`, `WsUnsubscribed` and `WsData`.
- `LighterLiveChannel`, `LighterReplayOnlyChannel` and `WsSubscribeOptions`
  types.

### Changed
- `subscribe()` no longer throws for the four live Lighter channels.
  `lighter_candles` and `lighter_l3_orderbook` remain replay-only and still
  throw before sending; the error text now names those two channels.
- Live Lighter books and trades go to `onLighterOrderbook()` and
  `onLighterTrades()` when those are registered, so Lighter `BTC` is not mixed
  with Hyperliquid `BTC`. Without them they still reach `onOrderbook()` and
  `onTrades()`. Converted Lighter trades carry `accountIndex`, `orderId`,
  `crossed` and `startPosition` instead of a maker address; fee, fee token,
  closed PnL and direction are not in live messages. Live trades are
  preliminary; `client.lighter.trades.list()` serves the reconciled record.
- Lighter replay is unchanged. Replay rows keep their existing shapes, which
  differ from the live payloads.

### Deprecated
- Bulk streaming: `ws.stream()`, `ws.multiStream()` and `ws.streamStop()`;
  the `onBatch()`, `onStreamStart()`, `onStreamProgress()` and
  `onStreamComplete()` handlers; and the `WsStream`, `WsStreamStop`,
  `WsStreamStarted`, `WsStreamProgress`, `WsHistoricalBatch`,
  `TimestampedRecord`, `WsStreamCompleted` and `WsStreamStopped` types with
  their Zod schemas. The server has discontinued bulk streaming and answers a
  stream request with an error message instead of data. They stay in the SDK
  so existing code still compiles. For large downloads, use the S3 Parquet
  bulk export at https://www.0xarchive.io/data. For paced history over
  WebSocket, use `ws.replay()` or `ws.multiReplay()`.

### Fixed
- Reconnect re-sent HIP-3 subscriptions with a truncated symbol (for example
  `km` instead of `km:US500`). Stored subscriptions now keep channel, symbol
  and options separately.

## 1.10.0 (2026-09-23)

Versions 1.9.0 and 1.9.1 were not published to npm. This release includes
their changes, listed in the sections below, and aligns the TypeScript,
Python and Rust SDKs on one version.

### Changed
- Trade `fee`, `closedPnl` and `startPosition` are now returned as `"0"` when
  the venue recorded a zero, instead of being omitted. A missing value now
  means the source did not record it (for example fills from 2025-03-22 to
  2025-05-25), never zero. This is a server-side change and applies to every
  SDK version.
- HIP-3 and HIP-4 trades now include `fee`, `feeToken`, `closedPnl` and
  `startPosition`.

## 1.9.1 (2026-08-31)

### Added
- **Hyperliquid Spot candles**: `client.spot.candles.history()` now wraps
  `GET /v1/hyperliquid/spot/candles/{symbol}`. Coverage starts at
  `2025-03-22T10:50:22Z`; the route supports `1m`, `5m`, `15m`, `30m`, `1h`,
  `4h`, `1d`, and `1w`, accepts up to 1000 rows, and returns numeric-string
  cursors that callers should pass through unchanged.

### Changed
- Documented the Free plan history window: Free includes every market, route,
  schema, and served depth, with history limited to the most recent rolling
  30 days and a maximum 30-day span per request or replay. Build and above
  keep the full retained archive. Plans gate capacity and Free's 30-day
  history window, not route families, schemas, or served depth.
- Spot documentation and types now distinguish the served candle route from
  the still-unsupported funding, open-interest, and liquidation resources.
- Lighter WebSocket channels are explicitly available for bounded historical
  replay, not live subscriptions; current data remains available through REST.
- HIP-3 breadth above the current UTC-session VWAP is available through
  `client.hyperliquid.hip3.breadth.current()` and `.history()`. History begins
  on 2026-08-28; `valuePct` is `null` when no instruments are eligible.
- Hyperliquid core `l4_diffs` and `l4_orders` replay now documents the exact
  `l4_snapshot` then ordered `l4_batch` sequence. HIP-3, HIP-4, and Spot L4
  remain live-only.
- Projected forced-liquidation price levels refresh about every five minutes.
- **Breaking unit correction:** Lighter `funding_rate` is fractional and
  non-annualized. Consumers that compensated for the former percent units
  must update their conversion.

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
  price. Snapshots refresh about every five minutes; `params.at` (epoch ms)
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
  - Coverage: trades from 2025-03-22; orderbook, L4, and TWAP
    statuses live from 2026-05-05.

### Notes
- **No spot funding, open interest, liquidations, or candles.** Those are
  perpetual constructs. The SDK intentionally does not expose them on the
  spot client. `/v1/hyperliquid/spot/candles/{symbol}` returns 501 by
  design and is not wrapped.
- Spot pre-2025-03-22 trade history is unrecoverable from any free public
  archive (Hyperliquid did not publish spot fills before that date).

## 1.6.0 (2026-05-04)

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
  coin; treat it as a terminal signal.
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
  verbatim", which broke the canonical form.)
- **`client.hyperliquid.trades.recent()` no longer surfaces an opaque JSON
  parse error.** Hyperliquid's REST API has no `/trades/{symbol}/recent`
  endpoint (only HIP-3, HIP-4, and Lighter do; the others have real-time
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
