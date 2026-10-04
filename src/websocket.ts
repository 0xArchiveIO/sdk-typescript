/**
 * WebSocket client for 0xarchive real-time streaming and historical replay.
 * For large historical downloads, use the S3 Parquet bulk export at
 * https://www.0xarchive.io/data.
 *
 * The client connects with `version=2026-10-01` (`API_VERSION`), the API
 * contract this SDK parses: error messages carry `error_code`, and Lighter and
 * Robinhood Chain replay rows use the live payload shapes.
 *
 * @example Real-time streaming
 * ```typescript
 * const ws = new OxArchiveWs({ apiKey: 'ox_...' });
 * await ws.connect();
 * ws.onOrderbook((coin, ob) => console.log(`${coin}: ${ob.midPrice}`));
 * ws.subscribeOrderbook('BTC');
 * ```
 *
 * @example Live Lighter data
 * ```typescript
 * const ws = new OxArchiveWs({ apiKey: 'ox_...' });
 * ws.onLighterOrderbook((coin, book) => console.log(coin, book.levels[0][0]?.px));
 * await ws.connect();
 * ws.subscribeLighter('orderbook', 'BTC', { intervalMs: 250 });
 * ```
 *
 * @example Live Lighter on Robinhood Chain data
 * ```typescript
 * const ws = new OxArchiveWs({ apiKey: 'ox_...' });
 * ws.onRhLighterTrades((coin, legs) => console.log(coin, legs.length));
 * await ws.connect();
 * ws.subscribeRhLighter('trades', 'AAPL-USDG');
 * ```
 *
 * @example Historical replay (like Tardis.dev)
 * ```typescript
 * const ws = new OxArchiveWs({ apiKey: 'ox_...' });
 * ws.onHistoricalData((coin, timestamp, data) => {
 *   console.log(`${new Date(timestamp)}: ${data.mid_price}`);
 * });
 * await ws.connect();
 * ws.replay('orderbook', 'BTC', {
 *   start: Date.now() - 86400000,
 *   end: Date.now(),
 *   speed: 10 // 10x speed
 * });
 * ```
 */

import type {
  WsOptions,
  WsChannel,
  WsClientMessage,
  WsServerMessage,
  WsReplay,
  WsStandardReplayChannel,
  WsStandardReplayOptions,
  WsBulkReplayChannel,
  WsBulkReplayOptions,
  WsError,
  HyperliquidCoreL4Channel,
  HyperliquidL4LiveOnlyChannel,
  FullDepthL2Channel,
  CapabilityDatatype,
  LighterLiveChannel,
  LighterReplayOnlyChannel,
  RhLighterLiveChannel,
  RhLighterReplayOnlyChannel,
  LighterLiveOrderbook,
  LighterLiveTrade,
  LighterLiveStats,
  WsSubscribe,
  WsSubscribeOptions,
  WsConnectionState,
  WsEventHandlers,
  OrderBook,
  OrderbookDelta,
  PriceLevel,
  Trade,
  WsHistoricalData,
  WsHistoricalTickData,
  WsHistoricalBatch,
  WsReplayStarted,
  WsReplayCompleted,
  WsReplaySnapshot,
  WsStreamStarted,
  WsStreamCompleted,
  WsStreamProgress,
  WsGapDetected,
  WsOutcomeSettled,
} from './types';
import { API_VERSION, type Venue } from './contract';

const DEFAULT_WS_URL = 'wss://api.0xarchive.io/ws';
const DEFAULT_PING_INTERVAL = 30000; // 30 seconds
const DEFAULT_RECONNECT_DELAY = 1000;
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 10;

// =============================================================================
// WebSocket implementation
// =============================================================================

/** `readyState` of an open socket; the same value in every implementation. */
const SOCKET_OPEN = 1;

/**
 * The part of the WebSocket API the client uses. The runtime's global
 * `WebSocket` and the `ws` package both provide it.
 */
interface SocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((event: unknown) => void) | null;
  onclose: ((event: { code: number; reason: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
}

type SocketConstructor = new (url: string) => SocketLike;

/** The runtime's global `WebSocket`, if it has one. */
function globalSocket(): SocketConstructor | undefined {
  const candidate = (globalThis as { WebSocket?: unknown }).WebSocket;
  return typeof candidate === 'function' ? (candidate as SocketConstructor) : undefined;
}

/** The global `WebSocket` as it was when the SDK loaded: the runtime's own. */
const BUILT_IN_SOCKET = globalSocket();

/** True in Node.js, and in runtimes that present a Node.js version. */
const IS_NODE = typeof process !== 'undefined' && typeof process.versions?.node === 'string';

/**
 * Whether to use the `ws` package rather than the global `WebSocket`. In
 * Node.js the client uses `ws`: Node.js 18 and 20 have no built-in
 * WebSocket, and the built-in one in some Node.js 24 releases closes the
 * connection when a compressed message is larger than about 4 MB once
 * decompressed, which an L4 snapshot of a large book is. A `WebSocket` the
 * caller assigned to `globalThis` is used as is, and so is the browser's.
 */
function prefersWsPackage(current: SocketConstructor | undefined): boolean {
  return current === undefined || (IS_NODE && current === BUILT_IN_SOCKET);
}

let wsPackage: Promise<SocketConstructor> | undefined;

/**
 * The `ws` package, a dependency of this SDK. It is loaded on first use
 * only, so browsers never load it. Where dynamic `import()` is unavailable
 * (some CommonJS test runners), it is loaded with `require`.
 */
function loadWsPackage(): Promise<SocketConstructor> {
  wsPackage ??= (import('ws') as Promise<unknown>)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    .catch(() => require('ws') as unknown)
    .then(
      (mod) => ((mod as { default?: unknown }).default ?? mod) as SocketConstructor,
      (error: unknown) => {
        wsPackage = undefined;
        throw error;
      },
    );
  return wsPackage;
}

/** The refusal when no WebSocket implementation can be found. */
export const NO_WEBSOCKET_ERROR =
  'This runtime has no global WebSocket and the "ws" package could not be loaded. ' +
  'Install "ws" (a dependency of @0xarchive/sdk).';

/** The refusal for a message sent while the client is not connected. */
export function notConnectedError(op: string): string {
  return `Cannot send "${op}": the WebSocket is not connected. Call connect() and wait for it to resolve first.`;
}

// =============================================================================
// Channel capabilities
// =============================================================================

/** What one WebSocket channel offers. */
export interface WsChannelCapability {
  /** The venue the channel belongs to (`/v1/capabilities` `venue`). */
  venue: Venue;
  /** The datatype the channel carries (`/v1/capabilities` `datatype`). */
  datatype: CapabilityDatatype;
  /** True when the channel streams live data (`/v1/capabilities` `live`). */
  live: boolean;
  /** True when the channel replays history. */
  replay: boolean;
  /**
   * True when the replay is bulk: single-channel, bounded by an explicit
   * `end`, `speed` ignored, delivered as an `l4_snapshot` anchor and ordered
   * `l4_batch` pages.
   */
  bulkReplay: boolean;
}

const offer = (
  venue: Venue,
  datatype: CapabilityDatatype,
  modes: { live?: boolean; replay?: boolean; bulk?: boolean },
): WsChannelCapability => ({
  venue,
  datatype,
  live: modes.live ?? false,
  replay: (modes.replay ?? false) || (modes.bulk ?? false),
  bulkReplay: modes.bulk ?? false,
});

const LIVE_AND_REPLAY = { live: true, replay: true } as const;
const LIVE_AND_BULK = { live: true, bulk: true } as const;
const LIVE_ONLY = { live: true } as const;
const REPLAY_ONLY = { replay: true } as const;
/** A channel the API accepts but neither streams nor replays: the data is REST only. */
const REST_ONLY = {} as const;

/**
 * Every WebSocket channel with the modes it offers. This one table mirrors
 * `GET /v1/capabilities` (`client.capabilities()`); the client's live and
 * replay checks read it, so a live subscription or replay the API does not
 * serve is refused before sending. `spot_twap` is listed with neither mode:
 * Spot TWAP statuses are served over REST only (`client.spot.twap`).
 */
export const WS_CHANNEL_CAPABILITIES: Readonly<Record<WsChannel, WsChannelCapability>> = Object.freeze({
  // Hyperliquid core
  orderbook: offer('hyperliquid', 'l2_orderbook', LIVE_AND_REPLAY),
  orderbook_full: offer('hyperliquid', 'l2_full_depth', LIVE_AND_BULK),
  l4_diffs: offer('hyperliquid', 'l4_diffs', LIVE_AND_BULK),
  l4_orders: offer('hyperliquid', 'l4_orders', LIVE_AND_BULK),
  trades: offer('hyperliquid', 'trades', LIVE_AND_REPLAY),
  candles: offer('hyperliquid', 'candles', REPLAY_ONLY),
  funding: offer('hyperliquid', 'funding', LIVE_AND_REPLAY),
  open_interest: offer('hyperliquid', 'oi', LIVE_AND_REPLAY),
  liquidations: offer('hyperliquid', 'liquidations', LIVE_AND_REPLAY),
  ticker: offer('hyperliquid', 'ticker', LIVE_ONLY),
  all_tickers: offer('hyperliquid', 'ticker', LIVE_ONLY),
  // HIP-3
  hip3_orderbook: offer('hip3', 'l2_orderbook', LIVE_AND_REPLAY),
  hip3_orderbook_full: offer('hip3', 'l2_full_depth', LIVE_AND_BULK),
  hip3_l4_diffs: offer('hip3', 'l4_diffs', LIVE_AND_BULK),
  hip3_l4_orders: offer('hip3', 'l4_orders', LIVE_AND_BULK),
  hip3_trades: offer('hip3', 'trades', LIVE_AND_REPLAY),
  hip3_candles: offer('hip3', 'candles', REPLAY_ONLY),
  hip3_funding: offer('hip3', 'funding', LIVE_AND_REPLAY),
  hip3_open_interest: offer('hip3', 'oi', LIVE_AND_REPLAY),
  hip3_liquidations: offer('hip3', 'liquidations', LIVE_AND_REPLAY),
  // HIP-4
  hip4_orderbook: offer('hip4', 'l2_orderbook', REPLAY_ONLY),
  hip4_l4_diffs: offer('hip4', 'l4_diffs', LIVE_AND_BULK),
  hip4_l4_orders: offer('hip4', 'l4_orders', LIVE_AND_BULK),
  hip4_trades: offer('hip4', 'trades', LIVE_AND_REPLAY),
  hip4_open_interest: offer('hip4', 'oi', REPLAY_ONLY),
  // Hyperliquid Spot
  spot_orderbook: offer('spot', 'l2_orderbook', LIVE_ONLY),
  spot_l4_diffs: offer('spot', 'l4_diffs', LIVE_AND_BULK),
  spot_l4_orders: offer('spot', 'l4_orders', LIVE_AND_BULK),
  spot_trades: offer('spot', 'trades', LIVE_ONLY),
  spot_twap: offer('spot', 'twap', REST_ONLY),
  // Lighter
  lighter_orderbook: offer('lighter', 'l2_orderbook', LIVE_AND_REPLAY),
  lighter_l3_orderbook: offer('lighter', 'l3_orderbook', REPLAY_ONLY),
  lighter_trades: offer('lighter', 'trades', LIVE_AND_REPLAY),
  lighter_candles: offer('lighter', 'candles', REPLAY_ONLY),
  lighter_funding: offer('lighter', 'funding', LIVE_AND_REPLAY),
  lighter_open_interest: offer('lighter', 'oi', LIVE_AND_REPLAY),
  // Lighter on Robinhood Chain
  rh_lighter_orderbook: offer('rh-lighter', 'l2_orderbook', LIVE_AND_REPLAY),
  rh_lighter_trades: offer('rh-lighter', 'trades', LIVE_AND_REPLAY),
  rh_lighter_candles: offer('rh-lighter', 'candles', REPLAY_ONLY),
  rh_lighter_funding: offer('rh-lighter', 'funding', LIVE_AND_REPLAY),
  rh_lighter_open_interest: offer('rh-lighter', 'oi', LIVE_AND_REPLAY),
});

const ALL_CHANNELS = Object.keys(WS_CHANNEL_CAPABILITIES) as WsChannel[];
const channelsWhere = (test: (c: WsChannelCapability) => boolean): ReadonlySet<WsChannel> =>
  new Set(ALL_CHANNELS.filter((channel) => test(WS_CHANNEL_CAPABILITIES[channel])));

/** Channels that accept live subscriptions. */
export const WS_LIVE_CHANNELS: ReadonlySet<WsChannel> = channelsWhere((c) => c.live);

/** Channels the API replays (timed or bulk). */
export const WS_REPLAY_CHANNELS: ReadonlySet<WsChannel> = channelsWhere((c) => c.replay);

/** Channels replayed in bulk: every L4 channel and the full-depth L2 channels. */
export const WS_BULK_REPLAY_CHANNELS: ReadonlySet<WsBulkReplayChannel> = channelsWhere(
  (c) => c.bulkReplay,
) as ReadonlySet<WsBulkReplayChannel>;

/** The capability row of a channel, or undefined for a name the SDK does not know. */
function capabilityOf(channel: WsChannel): WsChannelCapability | undefined {
  return (WS_CHANNEL_CAPABILITIES as Record<string, WsChannelCapability | undefined>)[channel];
}

/** Every Lighter channel. All six support historical replay. */
export const LIGHTER_REPLAY_CHANNELS: ReadonlySet<WsChannel> = channelsWhere(
  (c) => c.venue === 'lighter' && c.replay,
);

/** Lighter channels that also accept live subscriptions. */
export const LIGHTER_LIVE_CHANNELS: ReadonlySet<LighterLiveChannel> = channelsWhere(
  (c) => c.venue === 'lighter' && c.live,
) as ReadonlySet<LighterLiveChannel>;

/** Lighter channels that support historical replay only. */
export const LIGHTER_REPLAY_ONLY_CHANNELS: ReadonlySet<LighterReplayOnlyChannel> = channelsWhere(
  (c) => c.venue === 'lighter' && !c.live,
) as ReadonlySet<LighterReplayOnlyChannel>;

export const LIGHTER_SUBSCRIPTION_ERROR =
  'lighter_candles and lighter_l3_orderbook support replay, not live subscriptions. ' +
  'Use REST for current data or a replay request for stored history. Live Lighter ' +
  'subscriptions are available on lighter_orderbook, lighter_trades, ' +
  'lighter_open_interest and lighter_funding.';

/**
 * Every Lighter on Robinhood Chain channel. All five support historical
 * replay. Robinhood Chain is the second Lighter deployment; its channels are
 * a separate family from the mainnet `lighter_*` channels (one replay cannot
 * mix the two).
 */
export const RH_LIGHTER_REPLAY_CHANNELS: ReadonlySet<WsChannel> = channelsWhere(
  (c) => c.venue === 'rh-lighter' && c.replay,
);

/** Lighter on Robinhood Chain channels that also accept live subscriptions. */
export const RH_LIGHTER_LIVE_CHANNELS: ReadonlySet<RhLighterLiveChannel> = channelsWhere(
  (c) => c.venue === 'rh-lighter' && c.live,
) as ReadonlySet<RhLighterLiveChannel>;

/** Lighter on Robinhood Chain channels that support historical replay only. */
export const RH_LIGHTER_REPLAY_ONLY_CHANNELS: ReadonlySet<RhLighterReplayOnlyChannel> = channelsWhere(
  (c) => c.venue === 'rh-lighter' && !c.live,
) as ReadonlySet<RhLighterReplayOnlyChannel>;

export const RH_LIGHTER_SUBSCRIPTION_ERROR =
  'rh_lighter_candles supports replay, not live subscriptions. Use REST for current data ' +
  'or a replay request for stored history. Live Lighter on Robinhood Chain subscriptions ' +
  'are available on rh_lighter_orderbook, rh_lighter_trades, rh_lighter_open_interest ' +
  'and rh_lighter_funding.';

/** Smallest `intervalMs` accepted for a Lighter book subscription. */
export const LIGHTER_BOOK_INTERVAL_MIN_MS = 100;
/** Largest `intervalMs` accepted for a Lighter book subscription. */
export const LIGHTER_BOOK_INTERVAL_MAX_MS = 5000;

export const LIGHTER_INTERVAL_CHANNEL_ERROR = 'intervalMs is only supported on lighter_orderbook.';

/** The `intervalMs` refusal on a Robinhood Chain channel other than its book. */
export const RH_LIGHTER_INTERVAL_CHANNEL_ERROR = 'intervalMs is only supported on rh_lighter_orderbook.';

/** Channels that take `intervalMs`: the live book of each Lighter deployment. */
const LIGHTER_BOOK_CHANNELS: ReadonlySet<WsChannel> = new Set(['lighter_orderbook', 'rh_lighter_orderbook']);

/** Lighter symbols (either deployment) are case-insensitive on the server. */
function isLighterFamilyChannel(channel: WsChannel): boolean {
  const venue = capabilityOf(channel)?.venue;
  return venue === 'lighter' || venue === 'rh-lighter';
}

/** Hyperliquid core L4 channels. */
export const HYPERLIQUID_CORE_L4_REPLAY_CHANNELS: ReadonlySet<HyperliquidCoreL4Channel> = new Set([
  'l4_diffs',
  'l4_orders',
]);

/**
 * The HIP-3, HIP-4 and Spot L4 channels.
 *
 * @deprecated These channels now replay like the core L4 channels; see
 * {@link WS_BULK_REPLAY_CHANNELS}.
 */
export const HYPERLIQUID_L4_LIVE_ONLY_CHANNELS: ReadonlySet<HyperliquidL4LiveOnlyChannel> = new Set([
  'hip3_l4_diffs',
  'hip3_l4_orders',
  'hip4_l4_diffs',
  'hip4_l4_orders',
  'spot_l4_diffs',
  'spot_l4_orders',
]);

/**
 * Full-depth L2 order book channels (every price level). A subscription or a
 * replay starts with an `l4_snapshot` message holding the whole aggregated
 * book, followed by `l4_batch` messages of level changes.
 */
export const FULL_DEPTH_L2_CHANNELS: ReadonlySet<FullDepthL2Channel> = new Set([
  'orderbook_full',
  'hip3_orderbook_full',
]);

/** The refusal for a live subscription to a channel that only replays. */
export function replayOnlyError(channel: WsChannel): string {
  if (LIGHTER_REPLAY_ONLY_CHANNELS.has(channel as LighterReplayOnlyChannel)) return LIGHTER_SUBSCRIPTION_ERROR;
  if (RH_LIGHTER_REPLAY_ONLY_CHANNELS.has(channel as RhLighterReplayOnlyChannel)) return RH_LIGHTER_SUBSCRIPTION_ERROR;
  return (
    `${channel} supports replay, not live subscriptions. Use REST for current data ` +
    'or a replay request for stored history.'
  );
}

/** The refusal for a replay of a channel that only streams live. */
export function liveOnlyError(channel: WsChannel): string {
  return `${channel} is live only; the API does not replay it. Subscribe for live data or use REST for history.`;
}

/** The refusal for a live subscription or replay of a channel served over REST only. */
export function restOnlyError(channel: WsChannel): string {
  return `${channel} is served over REST only; the API neither streams nor replays it over WebSocket.`;
}

/** The refusal for a bulk replay without `end`. */
export function bulkReplayEndError(channel: WsChannel): string {
  return `${channel} replay requires an explicit end timestamp.`;
}

/** The refusal for a bulk channel inside a multi-channel replay. */
export function bulkReplayMultiError(channel: WsChannel): string {
  return `${channel} supports single-channel replay only; replay it with replay(), not multiReplay().`;
}

function validateLiveSubscription(channel: WsChannel, options?: WsSubscribeOptions): void {
  const capability = capabilityOf(channel);
  if (capability && !capability.live) {
    throw new Error(capability.replay ? replayOnlyError(channel) : restOnlyError(channel));
  }
  const intervalMs = options?.intervalMs;
  // `== null` also treats an explicit null from JavaScript callers as omitted.
  if (intervalMs == null) {
    return;
  }
  if (!LIGHTER_BOOK_CHANNELS.has(channel)) {
    // Name the book channel of the deployment the caller is using, as the
    // server does.
    throw new Error(
      RH_LIGHTER_REPLAY_CHANNELS.has(channel) ? RH_LIGHTER_INTERVAL_CHANNEL_ERROR : LIGHTER_INTERVAL_CHANNEL_ERROR,
    );
  }
  if (
    !Number.isInteger(intervalMs) ||
    intervalMs < LIGHTER_BOOK_INTERVAL_MIN_MS ||
    intervalMs > LIGHTER_BOOK_INTERVAL_MAX_MS
  ) {
    throw new Error(
      `intervalMs must be an integer between ${LIGHTER_BOOK_INTERVAL_MIN_MS} and ` +
        `${LIGHTER_BOOK_INTERVAL_MAX_MS} for ${channel} (got ${intervalMs}). ` +
        'Leave it out for one book a second.',
    );
  }
}

/** A live subscription the client re-sends after a reconnect. */
interface StoredSubscription {
  channel: WsChannel;
  coin?: string;
  intervalMs?: number;
}

/** Short and full channel names accepted by `subscribeLighter`. */
type LighterLiveChannelInput =
  | 'orderbook' | 'trades' | 'open_interest' | 'funding'
  | LighterLiveChannel;

function lighterLiveChannel(channel: LighterLiveChannelInput): LighterLiveChannel {
  return (channel.startsWith('lighter_') ? channel : `lighter_${channel}`) as LighterLiveChannel;
}

/** Short and full channel names accepted by `subscribeRhLighter`. */
type RhLighterLiveChannelInput =
  | 'orderbook' | 'trades' | 'open_interest' | 'funding'
  | RhLighterLiveChannel;

function rhLighterLiveChannel(channel: RhLighterLiveChannelInput): RhLighterLiveChannel {
  return (channel.startsWith('rh_lighter_') ? channel : `rh_lighter_${channel}`) as RhLighterLiveChannel;
}

function validateReplayChannel(channel: WsChannel, end: number | undefined, multiChannel: boolean): void {
  const capability = capabilityOf(channel);
  if (!capability) {
    // A channel the SDK does not know yet: let the API answer.
    return;
  }
  if (!capability.replay) {
    throw new Error(capability.live ? liveOnlyError(channel) : restOnlyError(channel));
  }
  if (capability.bulkReplay) {
    if (multiChannel) {
      throw new Error(bulkReplayMultiError(channel));
    }
    if (end === undefined || end === null) {
      throw new Error(bulkReplayEndError(channel));
    }
  }
}

/** True for a Lighter or Robinhood Chain book in the live shape (`{coin, time, levels}`). */
function isLiveShapedBook(raw: unknown): boolean {
  return !!raw && typeof raw === 'object' && 'levels' in raw && !('bids' in raw);
}

// Server idle timeout is 60 seconds. The SDK sends pings every 30 seconds
// to keep the connection alive. Browser WebSocket API automatically responds
// to WebSocket protocol-level ping frames from the server.

/**
 * Transform raw Hyperliquid trade format to SDK Trade type.
 * Raw format: { px, sz, side, time, hash, tid, users: [maker, taker] }
 * SDK format: { coin, side, price, size, timestamp, tx_hash, trade_id, maker_address, taker_address }
 */
function transformTrade(coin: string, raw: Record<string, unknown>): Trade {
  // Check if already in SDK format (from REST API or historical replay)
  if ('price' in raw && 'size' in raw) {
    return raw as unknown as Trade;
  }

  // Transform from Hyperliquid raw format
  const px = raw.px as string | undefined;
  const sz = raw.sz as string | undefined;
  const side = raw.side as string | undefined;
  const time = raw.time as number | undefined;
  const hash = raw.hash as string | undefined;
  const tid = raw.tid as number | undefined;

  // Extract user addresses from the users array (market-level WebSocket trades)
  // users[0] = maker address, users[1] = taker address
  const users = raw.users as string[] | undefined;
  const maker_address = users && users.length > 0 ? users[0] : undefined;
  const taker_address = users && users.length > 1 ? users[1] : undefined;

  // Also check for user_address field (for historical replay data)
  const user_address = raw.userAddress as string | undefined ?? raw.user_address as string | undefined;

  return {
    coin,
    side: (side === 'A' || side === 'B' ? side : 'B') as 'A' | 'B',
    price: px ?? '0',
    size: sz ?? '0',
    timestamp: time ? new Date(time).toISOString() : new Date().toISOString(),
    txHash: hash,
    tradeId: tid,
    makerAddress: maker_address,
    takerAddress: taker_address,
    userAddress: user_address,
  };
}

/**
 * Transform an array of raw Hyperliquid trades to SDK Trade types.
 */
function transformTrades(coin: string, rawTrades: unknown): Trade[] {
  if (!Array.isArray(rawTrades)) {
    // Single trade object
    return [transformTrade(coin, rawTrades as Record<string, unknown>)];
  }
  return rawTrades.map((raw) => transformTrade(coin, raw as Record<string, unknown>));
}

/**
 * Transform one live Lighter fill leg to the SDK Trade type. Each leg carries
 * one account (`users[0]`, a Lighter account index), so it maps to
 * `accountIndex` rather than to maker/taker addresses. Fields the live stream
 * does not carry (fee, fee token, closed PnL, direction) are left out.
 */
function transformLighterLiveTrade(coin: string, raw: LighterLiveTrade): Trade {
  const trade: Trade = {
    coin,
    side: raw.side === 'A' ? 'A' : 'B',
    price: raw.px ?? '0',
    size: raw.sz ?? '0',
    timestamp: typeof raw.time === 'number' ? new Date(raw.time).toISOString() : new Date().toISOString(),
  };
  if (typeof raw.tid === 'number') trade.tradeId = raw.tid;
  if (typeof raw.hash === 'string') trade.txHash = raw.hash;
  if (typeof raw.oid === 'number') trade.orderId = raw.oid;
  if (typeof raw.crossed === 'boolean') trade.crossed = raw.crossed;
  if (typeof raw.start_position === 'string') trade.startPosition = raw.start_position;
  if (Array.isArray(raw.users) && typeof raw.users[0] === 'string') trade.accountIndex = raw.users[0];
  return trade;
}

/** Normalise a live `lighter_trades` payload to an array of fill legs. */
function lighterLiveTrades(data: unknown): LighterLiveTrade[] {
  if (Array.isArray(data)) return data as LighterLiveTrade[];
  return data ? [data as LighterLiveTrade] : [];
}

/**
 * Transform raw Hyperliquid orderbook format to SDK OrderBook type.
 * Raw format: { coin, levels: [[{px, sz, n}, ...], [{px, sz, n}, ...]], time }
 * SDK format: { coin, timestamp, bids: [{px, sz, n}], asks: [{px, sz, n}], mid_price, spread, spread_bps }
 */
function transformOrderbook(coin: string, raw: Record<string, unknown>): OrderBook {
  // Check if already in SDK format (from REST API or historical replay)
  if ('bids' in raw && 'asks' in raw) {
    return raw as unknown as OrderBook;
  }

  // Transform from Hyperliquid raw format
  // levels is [[{px, sz, n}, ...], [{px, sz, n}, ...]] where [0]=bids, [1]=asks
  const levels = raw.levels as Array<Array<{ px: string; sz: string; n: number }>> | undefined;
  const time = raw.time as number | undefined;

  const bids: PriceLevel[] = [];
  const asks: PriceLevel[] = [];

  if (levels && levels.length >= 2) {
    // levels[0] = bids, levels[1] = asks
    // Each level is already {px, sz, n} object
    for (const level of levels[0] || []) {
      bids.push({ px: level.px, sz: level.sz, n: level.n });
    }
    for (const level of levels[1] || []) {
      asks.push({ px: level.px, sz: level.sz, n: level.n });
    }
  }

  // Calculate mid price and spread
  let midPrice: string | undefined;
  let spread: string | undefined;
  let spreadBps: string | undefined;

  if (bids.length > 0 && asks.length > 0) {
    const bestBid = parseFloat(bids[0].px);
    const bestAsk = parseFloat(asks[0].px);
    const mid = (bestBid + bestAsk) / 2;
    midPrice = mid.toString();
    spread = (bestAsk - bestBid).toString();
    spreadBps = ((bestAsk - bestBid) / mid * 10000).toFixed(2);
  }

  return {
    coin,
    timestamp: time ? new Date(time).toISOString() : new Date().toISOString(),
    bids,
    asks,
    midPrice,
    spread,
    spreadBps,
  };
}

/**
 * WebSocket client for supported live data and historical replay.
 *
 * Live subscriptions cover Hyperliquid channels and four channels on each
 * Lighter deployment: mainnet (`lighter_orderbook`, `lighter_trades`,
 * `lighter_open_interest`, `lighter_funding`) and Robinhood Chain
 * (`rh_lighter_orderbook`, `rh_lighter_trades`, `rh_lighter_open_interest`,
 * `rh_lighter_funding`). `candles`, `hip3_candles`, `hip4_orderbook`,
 * `hip4_open_interest`, `lighter_candles`, `lighter_l3_orderbook` and
 * `rh_lighter_candles` are replay-only, and `spot_twap` is served over REST
 * only. Live Lighter data, on either deployment, is served on
 * `wss://api.0xarchive.io/ws` (the default URL). `WS_CHANNEL_CAPABILITIES`
 * lists what every channel offers.
 *
 * Call `connect()` and wait for it to resolve before sending. A replay or
 * other request made while the client is connecting or reconnecting is
 * queued and sent once the socket opens; one made while it is disconnected
 * throws. Subscriptions are kept by the client and sent on every (re)connect.
 *
 * In Node.js the client connects with the `ws` package, a dependency of
 * this SDK: Node.js 18 and 20 have no built-in WebSocket, and the built-in
 * one in some Node.js 24 releases closes the connection on a compressed
 * message larger than about 4 MB once decompressed, which an L4 snapshot of
 * a large book is. In browsers it uses the built-in `WebSocket`. A
 * `WebSocket` assigned to `globalThis` by the caller is used as is.
 *
 * Server errors arrive as `{"type":"error"}` messages with a stable
 * `errorCode` (`onServerError()`). `slow_consumer` means the connection fell
 * behind a stream and messages were dropped: re-subscribe, or restart the
 * replay, to resync. `endpoint_unsupported` means the endpoint does not serve
 * the channel; the message names the one that does.
 *
 * **Keep-Alive:** The server sends WebSocket ping frames every 30 seconds
 * and will disconnect idle connections after 60 seconds. This SDK automatically
 * handles keep-alive by sending application-level pings at the configured interval
 * (default: 30 seconds). The browser WebSocket API automatically responds to
 * server ping frames.
 */
export class OxArchiveWs {
  private ws: SocketLike | null = null;
  private options: Required<WsOptions>;
  private handlers: WsEventHandlers = {};
  private subscriptions: Map<string, StoredSubscription> = new Map();
  /** Requests made while connecting or reconnecting, sent once the socket opens. */
  private pending: WsClientMessage[] = [];
  private state: WsConnectionState = 'disconnected';
  private reconnectAttempts = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  // Typed event handlers (separate from WsEventHandlers to avoid wrapping issues)
  private historicalDataHandlers: Array<(coin: string, timestamp: number, data: unknown) => void> = [];
  private historicalTickDataHandlers: Array<(coin: string, checkpoint: OrderBook, deltas: OrderbookDelta[]) => void> = [];
  private batchHandlers: Array<(coin: string, records: Array<{ timestamp: number; data: unknown }>) => void> = [];
  private replayStartHandlers: Array<(channel: WsChannel, coin: string, start: number, end: number, speed: number) => void> = [];
  private replayCompleteHandlers: Array<(channel: WsChannel, coin: string, snapshotsSent: number) => void> = [];
  private replaySnapshotHandlers: Array<(channel: WsChannel, coin: string, timestamp: number, data: unknown) => void> = [];
  private streamStartHandlers: Array<(channel: WsChannel, coin: string, start: number, end: number) => void> = [];
  private streamProgressHandlers: Array<(snapshotsSent: number) => void> = [];
  private streamCompleteHandlers: Array<(channel: WsChannel, coin: string, snapshotsSent: number) => void> = [];
  private orderbookHandlers: Array<(coin: string, data: OrderBook) => void> = [];
  private tradesHandlers: Array<(coin: string, data: Trade[]) => void> = [];
  private liquidationsHandlers: Array<(channel: WsChannel, coin: string, data: Trade[]) => void> = [];
  private gapHandlers: Array<(channel: WsChannel, coin: string, gapStart: number, gapEnd: number, durationMinutes: number) => void> = [];
  private outcomeSettledHandlers: Array<(coin: string, outcomeId: number, side: number, settlementValue?: number, settlementAt?: string) => void> = [];
  private serverErrorHandlers: Array<(error: WsError) => void> = [];
  private lighterOrderbookHandlers: Array<(coin: string, data: LighterLiveOrderbook) => void> = [];
  private lighterTradesHandlers: Array<(coin: string, data: LighterLiveTrade[]) => void> = [];
  private lighterStatsHandlers: Array<(channel: 'lighter_open_interest' | 'lighter_funding', coin: string, data: LighterLiveStats) => void> = [];
  private rhLighterOrderbookHandlers: Array<(coin: string, data: LighterLiveOrderbook) => void> = [];
  private rhLighterTradesHandlers: Array<(coin: string, data: LighterLiveTrade[]) => void> = [];
  private rhLighterStatsHandlers: Array<(channel: 'rh_lighter_open_interest' | 'rh_lighter_funding', coin: string, data: LighterLiveStats) => void> = [];

  constructor(options: WsOptions) {
    this.options = {
      apiKey: options.apiKey,
      wsUrl: options.wsUrl ?? DEFAULT_WS_URL,
      autoReconnect: options.autoReconnect ?? true,
      reconnectDelay: options.reconnectDelay ?? DEFAULT_RECONNECT_DELAY,
      maxReconnectAttempts: options.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS,
      pingInterval: options.pingInterval ?? DEFAULT_PING_INTERVAL,
    };
  }

  /**
   * Connect to the WebSocket server.
   *
   * Wait for the returned promise before calling `replay()`, `multiReplay()`
   * or the replay controls. A request made before the socket opens is queued
   * and sent when it opens, and discarded if the connection fails.
   *
   * In Node.js it connects with the `ws` package, a dependency of this SDK;
   * in browsers, with the built-in `WebSocket`.
   *
   * @returns Promise that resolves when connected
   * @example
   * ```typescript
   * await ws.connect();
   * ws.subscribeOrderbook('BTC');
   * ```
   */
  connect(handlers?: WsEventHandlers): Promise<void> {
    if (handlers) {
      this.handlers = handlers;
    }

    this.setState('connecting');

    const current = globalSocket();
    if (current && !prefersWsPackage(current)) {
      return this.open(current);
    }
    const openWith = (Socket: SocketConstructor): Promise<void> => {
      if (this.state === 'disconnected') {
        // disconnect() was called while the package loaded.
        return Promise.reject(new Error('WebSocket was disconnected before it connected'));
      }
      return this.open(Socket);
    };
    return loadWsPackage().then(openWith, () => {
      // Without the package, the runtime's own WebSocket is the fallback.
      if (current) return openWith(current);
      this.setState('disconnected');
      this.pending = [];
      throw new Error(NO_WEBSOCKET_ERROR);
    });
  }

  private open(Socket: SocketConstructor): Promise<void> {
    return new Promise((resolve, reject) => {
      const separator = this.options.wsUrl.includes('?') ? '&' : '?';
      const url =
        `${this.options.wsUrl}${separator}apiKey=${encodeURIComponent(this.options.apiKey)}` +
        `&version=${API_VERSION}`;
      const socket = new Socket(url);
      this.ws = socket;

      socket.onopen = () => {
        this.reconnectAttempts = 0;
        this.setState('connected');
        this.startPing();
        this.resubscribe();
        this.flushPending();
        this.handlers.onOpen?.();
        resolve();
      };

      socket.onclose = (event) => {
        this.stopPing();
        const wasConnecting = this.state === 'connecting';
        this.handlers.onClose?.(event.code, event.reason);

        // If initial connection failed, reject and don't auto-reconnect
        if (wasConnecting) {
          this.setState('disconnected');
          // A failed first connect drops what was queued for it; a failed
          // reconnect attempt keeps it for the next attempt.
          if (this.reconnectAttempts === 0) {
            this.pending = [];
          }
          reject(new Error(`WebSocket closed before connecting (code: ${event.code})`));
          return;
        }

        // Only auto-reconnect if we were previously connected
        if (this.options.autoReconnect && this.state !== 'disconnected') {
          this.scheduleReconnect();
        } else {
          this.setState('disconnected');
          this.pending = [];
        }
      };

      socket.onerror = () => {
        const error = new Error('WebSocket connection error');
        this.handlers.onError?.(error);
        // Note: onerror is usually followed by onclose, which will reject the promise
      };

      socket.onmessage = (event) => {
        try {
          const text = typeof event.data === 'string' ? event.data : String(event.data);
          const message = JSON.parse(text) as WsServerMessage;
          this.handleMessage(message);
        } catch {
          // Ignore parse errors for malformed messages
        }
      };
    });
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): void {
    this.setState('disconnected');
    this.stopPing();
    this.clearReconnectTimer();
    this.pending = [];

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
  }

  /**
   * Subscribe to a supported live channel.
   *
   * Live Lighter subscriptions are available on `lighter_orderbook`,
   * `lighter_trades`, `lighter_open_interest` and `lighter_funding`, and on
   * the Robinhood Chain deployment's `rh_lighter_orderbook`,
   * `rh_lighter_trades`, `rh_lighter_open_interest` and `rh_lighter_funding`.
   * Replay-only channels (`candles`, `hip3_candles`, `hip4_orderbook`,
   * `hip4_open_interest`, `lighter_candles`, `lighter_l3_orderbook`,
   * `rh_lighter_candles`) and the REST-only `spot_twap` throw here; use REST
   * for current data or a bounded replay for stored history.
   *
   * `orderbook_full` (Hyperliquid core) and `hip3_orderbook_full` (HIP-3)
   * stream the full-depth L2 book: an `l4_snapshot` message with every price
   * level, then `l4_batch` messages of level changes. Read them with
   * `onMessage`; see `WsL2FullDepthSnapshot` and `WsL2FullDepthBatch`.
   *
   * @param channel - Channel to subscribe to
   * @param coin - Symbol (e.g. 'BTC'); Lighter symbols are case-insensitive
   * @param options - `intervalMs` sets the book rate for `lighter_orderbook`
   *   and `rh_lighter_orderbook` only (100 to 5000 ms, default one book a second)
   * @throws Error for a replay-only or REST-only channel, or an `intervalMs`
   *   on another channel or outside 100 to 5000
   */
  subscribe(channel: WsChannel, coin?: string, options?: WsSubscribeOptions): void {
    validateLiveSubscription(channel, options);
    const subscription: StoredSubscription = { channel, coin };
    if (options?.intervalMs != null) {
      subscription.intervalMs = options.intervalMs;
    }
    // A repeat subscribe to the same channel and symbol replaces the stored
    // options, so a reconnect re-sends the latest interval.
    this.subscriptions.set(this.subscriptionKey(channel, coin), subscription);

    if (this.isConnected()) {
      this.send(this.subscribeMessage(subscription));
    }
  }

  /**
   * Subscribe to order book updates for a coin
   */
  subscribeOrderbook(coin: string): void {
    this.subscribe('orderbook', coin);
  }

  /**
   * Subscribe to trades for a coin
   */
  subscribeTrades(coin: string): void {
    this.subscribe('trades', coin);
  }

  /**
   * Subscribe to ticker updates for a coin
   */
  subscribeTicker(coin: string): void {
    this.subscribe('ticker', coin);
  }

  /**
   * Subscribe to all tickers
   */
  subscribeAllTickers(): void {
    this.subscribe('all_tickers');
  }

  /**
   * Unsubscribe from a channel
   */
  unsubscribe(channel: WsChannel, coin?: string): void {
    const key = this.subscriptionKey(channel, coin);
    this.subscriptions.delete(key);

    if (this.isConnected()) {
      this.send({ op: 'unsubscribe', channel, symbol: coin });
    }
  }

  /**
   * Unsubscribe from order book updates for a coin
   */
  unsubscribeOrderbook(coin: string): void {
    this.unsubscribe('orderbook', coin);
  }

  /**
   * Unsubscribe from trades for a coin
   */
  unsubscribeTrades(coin: string): void {
    this.unsubscribe('trades', coin);
  }

  /**
   * Unsubscribe from ticker updates for a coin
   */
  unsubscribeTicker(coin: string): void {
    this.unsubscribe('ticker', coin);
  }

  /**
   * Unsubscribe from all tickers
   */
  unsubscribeAllTickers(): void {
    this.unsubscribe('all_tickers');
  }

  /**
   * Subscribe to live liquidation events for a coin (Hyperliquid).
   *
   * Each message is a fill row with `is_liquidation: true`. Same wire shape as
   * trades. Live as of v1.6.0 (Hyperliquid + HIP-3 nodes); historical replay
   * also supported via `replay('liquidations', ...)`.
   */
  subscribeLiquidations(coin: string): void {
    this.subscribe('liquidations', coin);
  }

  /** Unsubscribe from live liquidation events (Hyperliquid). */
  unsubscribeLiquidations(coin: string): void {
    this.unsubscribe('liquidations', coin);
  }

  /**
   * Subscribe to live HIP-3 liquidation events for a coin.
   * Each message is a fill row with `is_liquidation: true`.
   */
  subscribeHip3Liquidations(coin: string): void {
    this.subscribe('hip3_liquidations', coin);
  }

  /** Unsubscribe from live HIP-3 liquidation events. */
  unsubscribeHip3Liquidations(coin: string): void {
    this.unsubscribe('hip3_liquidations', coin);
  }

  /**
   * Subscribe to a Hyperliquid Spot channel for a given dashed pair.
   *
   * @param channel One of `spot_orderbook`, `spot_trades`, `spot_l4_diffs`,
   *   `spot_l4_orders`. The short form (e.g. `'orderbook'`) is also accepted
   *   and the `spot_` prefix is added automatically. `spot_twap` is accepted
   *   for compatibility but throws: TWAP statuses are served over REST only
   *   (`client.spot.twap.history()`).
   * @param coin Spot dashed canonical symbol (e.g. `'HYPE-USDC'`).
   */
  subscribeSpot(
    channel:
      | 'orderbook' | 'trades' | 'l4_diffs' | 'l4_orders' | 'twap'
      | 'spot_orderbook' | 'spot_trades' | 'spot_l4_diffs' | 'spot_l4_orders' | 'spot_twap',
    coin: string,
  ): void {
    const fullChannel = (channel.startsWith('spot_') ? channel : `spot_${channel}`) as WsChannel;
    this.subscribe(fullChannel, coin);
  }

  /** Unsubscribe from a Hyperliquid Spot channel for a given dashed pair.
   * Accepts the short form (`'orderbook'`) or the full form (`'spot_orderbook'`). */
  unsubscribeSpot(
    channel:
      | 'orderbook' | 'trades' | 'l4_diffs' | 'l4_orders' | 'twap'
      | 'spot_orderbook' | 'spot_trades' | 'spot_l4_diffs' | 'spot_l4_orders' | 'spot_twap',
    coin: string,
  ): void {
    const fullChannel = (channel.startsWith('spot_') ? channel : `spot_${channel}`) as WsChannel;
    this.unsubscribe(fullChannel, coin);
  }

  /**
   * Subscribe to a live Lighter channel.
   *
   * @param channel One of `orderbook`, `trades`, `open_interest`, `funding`
   *   (or the full `lighter_*` form). Candles and L3 are replay-only.
   * @param symbol Lighter symbol, as listed by `client.lighter.instruments.list()`
   *   (case-insensitive; the server echoes it uppercase).
   * @param options `intervalMs` for `orderbook` only: send the newest book at
   *   most once per 100 to 5000 ms (default 1000).
   *
   * @example
   * ```typescript
   * ws.onLighterOrderbook((coin, book) => console.log(coin, book.levels[0][0]?.px));
   * ws.subscribeLighter('orderbook', 'BTC', { intervalMs: 250 });
   * ws.subscribeLighter('trades', 'BTC');
   * ```
   */
  subscribeLighter(
    channel: LighterLiveChannelInput,
    symbol: string,
    options?: WsSubscribeOptions,
  ): void {
    this.subscribe(lighterLiveChannel(channel), symbol, options);
  }

  /** Unsubscribe from a live Lighter channel. Accepts the short form
   * (`'orderbook'`) or the full form (`'lighter_orderbook'`). */
  unsubscribeLighter(channel: LighterLiveChannelInput, symbol: string): void {
    this.unsubscribe(lighterLiveChannel(channel), symbol);
  }

  /**
   * Subscribe to a live Lighter on Robinhood Chain channel (the second
   * Lighter deployment). Live payloads have the same shapes as mainnet
   * Lighter; register `onRhLighterOrderbook()`, `onRhLighterTrades()` and
   * `onRhLighterStats()` to keep them apart from mainnet and Hyperliquid data.
   * Served on `wss://api.0xarchive.io/ws` only.
   *
   * @param channel One of `orderbook`, `trades`, `open_interest`, `funding`
   *   (or the full `rh_lighter_*` form). Candles are replay-only.
   * @param symbol Symbol as listed by `client.rhLighter.instruments.list()`:
   *   perpetuals like `BTC`, spot like `AAPL-USDG` (case-insensitive; the
   *   server echoes it uppercase).
   * @param options `intervalMs` for `orderbook` only: send the newest book at
   *   most once per 100 to 5000 ms (default 1000).
   *
   * @example
   * ```typescript
   * ws.onRhLighterOrderbook((coin, book) => console.log(coin, book.levels[0][0]?.px));
   * ws.subscribeRhLighter('orderbook', 'BTC', { intervalMs: 500 });
   * ws.subscribeRhLighter('trades', 'AAPL-USDG');
   * ```
   */
  subscribeRhLighter(
    channel: RhLighterLiveChannelInput,
    symbol: string,
    options?: WsSubscribeOptions,
  ): void {
    this.subscribe(rhLighterLiveChannel(channel), symbol, options);
  }

  /** Unsubscribe from a live Lighter on Robinhood Chain channel. Accepts the
   * short form (`'orderbook'`) or the full form (`'rh_lighter_orderbook'`). */
  unsubscribeRhLighter(channel: RhLighterLiveChannelInput, symbol: string): void {
    this.unsubscribe(rhLighterLiveChannel(channel), symbol);
  }

  /**
   * Subscribe to a HIP-4 channel for a given outcome coin.
   *
   * @param channel One of `hip4_trades`, `hip4_l4_diffs`, `hip4_l4_orders`
   *   (the channels that stream live). `hip4_orderbook` and
   *   `hip4_open_interest` replay only, so a live subscription to them
   *   throws; use REST for the current book and open interest.
   * @param coin HIP-4 coin (e.g. `'#0'` or `'0'`). The bare numeric form is
   *   recommended; both are accepted by the backend.
   */
  subscribeHip4(
    channel:
      | 'orderbook' | 'trades' | 'open_interest' | 'l4_diffs' | 'l4_orders'
      | 'hip4_orderbook' | 'hip4_trades' | 'hip4_open_interest' | 'hip4_l4_diffs' | 'hip4_l4_orders',
    coin: string
  ): void {
    const fullChannel = (channel.startsWith('hip4_') ? channel : `hip4_${channel}`) as WsChannel;
    this.subscribe(fullChannel, coin);
  }

  /** Unsubscribe from a HIP-4 channel for a given outcome coin. Accepts the
   * short channel form (`'orderbook'`) or the full form (`'hip4_orderbook'`). */
  unsubscribeHip4(
    channel:
      | 'orderbook' | 'trades' | 'open_interest' | 'l4_diffs' | 'l4_orders'
      | 'hip4_orderbook' | 'hip4_trades' | 'hip4_open_interest' | 'hip4_l4_diffs' | 'hip4_l4_orders',
    coin: string
  ): void {
    const fullChannel = (channel.startsWith('hip4_') ? channel : `hip4_${channel}`) as WsChannel;
    this.unsubscribe(fullChannel, coin);
  }

  // ==========================================================================
  // Historical Replay (Option B) - Like Tardis.dev
  // ==========================================================================

  /**
   * Start a historical replay.
   *
   * Which channels replay is `WS_CHANNEL_CAPABILITIES` (it mirrors
   * `client.capabilities()`); a channel the API does not replay (`ticker`,
   * `all_tickers`, `spot_orderbook`, `spot_trades`, `spot_twap`) is refused
   * before sending.
   *
   * - Timed replay (every other channel) preserves the original timing,
   *   scaled by `speed`, and delivers `historical_data` messages. Lighter and
   *   Robinhood Chain rows use the live payload shapes
   *   (`LighterLiveOrderbook`, a one-leg `LighterLiveTrade[]`,
   *   `LighterLiveStats`).
   * - Bulk replay (every L4 channel, on core, HIP-3, HIP-4 and Spot, and the
   *   full-depth `orderbook_full` and `hip3_orderbook_full`) needs an
   *   explicit `end`, ignores `speed`, and is single-channel: an
   *   `l4_snapshot` anchored at the nearest checkpoint at or before `start`,
   *   then `l4_batch` pages in block order.
   *
   * @param channel - Data channel to replay
   * @param coin - Trading pair (e.g., 'BTC', 'ETH')
   * @param options - Replay options
   *
   * @example
   * ```typescript
   * ws.replay('orderbook', 'BTC', {
   *   start: Date.now() - 86400000, // 24 hours ago
   *   end: Date.now(),
   *   speed: 10 // 10x faster than real-time
   * });
   *
   * // Bulk: HIP-3 L4 diffs for one hour
   * ws.replay('hip3_l4_diffs', 'xyz:SP500', { start: t0, end: t0 + 3_600_000 });
   * ```
   */
  replay(
    channel: WsBulkReplayChannel,
    coin: string,
    options: WsBulkReplayOptions,
  ): void;
  replay(
    channel: WsStandardReplayChannel,
    coin: string,
    options: WsStandardReplayOptions,
  ): void;
  replay(
    channel: WsChannel,
    coin: string,
    options: {
      start: number;
      end?: number;
      speed?: number;
      granularity?: string;
      /** Candle interval for candles channel (1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w) */
      interval?: string;
    },
  ): void {
    validateReplayChannel(channel, options.end, false);
    this.send({
      op: 'replay',
      channel,
      symbol: coin,
      start: options.start,
      end: options.end,
      speed: options.speed ?? 1,
      granularity: options.granularity,
      interval: options.interval,
    } as WsReplay);
  }

  /**
   * Start a multi-channel historical replay with timing preserved.
   * Data from all channels is interleaved chronologically. Before the timeline
   * begins, `replay_snapshot` messages provide initial state for each channel.
   * Channels must come from one family (Hyperliquid, HIP-3, HIP-4, Lighter or
   * Lighter on Robinhood Chain); bulk channels (L4, full depth) replay alone.
   *
   * @param channels - Array of data channels to replay simultaneously
   * @param coin - Trading pair (e.g., 'BTC', 'ETH')
   * @param options - Replay options
   *
   * @example
   * ```typescript
   * ws.onReplaySnapshot((channel, coin, timestamp, data) => {
   *   console.log(`Initial ${channel} state at ${new Date(timestamp).toISOString()}`);
   * });
   * ws.onHistoricalData((coin, timestamp, data) => {
   *   // Interleaved data from all channels
   * });
   * ws.multiReplay(['orderbook', 'trades', 'funding'], 'BTC', {
   *   start: Date.now() - 86400000,
   *   speed: 10
   * });
   * ```
   */
  multiReplay(
    channels: WsStandardReplayChannel[],
    coin: string,
    options: WsStandardReplayOptions,
  ): void {
    for (const channel of channels) {
      validateReplayChannel(channel, options.end, true);
    }
    this.send({
      op: 'replay',
      channels,
      symbol: coin,
      start: options.start,
      end: options.end,
      speed: options.speed ?? 1,
      granularity: options.granularity,
      interval: options.interval,
    });
  }

  /**
   * Pause the current replay
   */
  replayPause(): void {
    this.send({ op: 'replay.pause' });
  }

  /**
   * Resume a paused replay
   */
  replayResume(): void {
    this.send({ op: 'replay.resume' });
  }

  /**
   * Seek to a specific timestamp in the replay
   * @param timestamp - Unix timestamp in milliseconds
   */
  replaySeek(timestamp: number): void {
    this.send({ op: 'replay.seek', timestamp });
  }

  /**
   * Stop the current replay
   */
  replayStop(): void {
    this.send({ op: 'replay.stop' });
  }

  // ==========================================================================
  // Bulk Streaming (discontinued)
  // ==========================================================================

  /**
   * Request a bulk stream of historical data for one channel.
   *
   * @deprecated Bulk streaming has been discontinued on the server. This
   * method still sends the request, but the server replies with an `error`
   * message (delivered to `onMessage`) and sends no data. For large dataset
   * downloads, use the S3 Parquet bulk export at https://www.0xarchive.io/data.
   * For paced historical data over WebSocket, use `replay()`.
   *
   * @param channel - Data channel to stream
   * @param coin - Trading pair (e.g., 'BTC', 'ETH')
   * @param options - Stream options
   */
  stream(
    channel: WsChannel,
    coin: string,
    options: {
      start: number;
      end: number;
      batchSize?: number;
      granularity?: string;
      /** Candle interval for candles channel (1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w) */
      interval?: string;
    }
  ): void {
    this.send({
      op: 'stream',
      channel,
      symbol: coin,
      start: options.start,
      end: options.end,
      batch_size: options.batchSize ?? 1000,
      granularity: options.granularity,
      interval: options.interval,
    });
  }

  /**
   * Request a multi-channel bulk stream of historical data.
   *
   * @deprecated Bulk streaming has been discontinued on the server. This
   * method still sends the request, but the server replies with an `error`
   * message (delivered to `onMessage`) and sends no data. For large dataset
   * downloads, use the S3 Parquet bulk export at https://www.0xarchive.io/data.
   * For paced multi-channel history over WebSocket, use `multiReplay()`.
   *
   * @param channels - Array of data channels to stream simultaneously
   * @param coin - Trading pair (e.g., 'BTC', 'ETH')
   * @param options - Stream options
   */
  multiStream(
    channels: WsChannel[],
    coin: string,
    options: {
      start: number;
      end: number;
      batchSize?: number;
      granularity?: string;
      interval?: string;
    }
  ): void {
    this.send({
      op: 'stream',
      channels,
      symbol: coin,
      start: options.start,
      end: options.end,
      batch_size: options.batchSize ?? 1000,
      granularity: options.granularity,
      interval: options.interval,
    });
  }

  /**
   * Stop the current bulk stream.
   *
   * @deprecated Bulk streaming has been discontinued on the server, so there
   * is never an active stream to stop. The server replies with an `error`
   * message (delivered to `onMessage`). For large dataset downloads, use the
   * S3 Parquet bulk export at https://www.0xarchive.io/data.
   */
  streamStop(): void {
    this.send({ op: 'stream.stop' });
  }

  // ==========================================================================
  // Event Handlers for Replay
  // ==========================================================================

  /**
   * Handle historical data points (timed replay). `data` is the channel's
   * row: on Lighter and Robinhood Chain channels it has the live payload
   * shape (`LighterLiveOrderbook` for books, an array of one
   * `LighterLiveTrade` leg for trades, `LighterLiveStats` for open interest
   * and funding). Bulk replay (L4, full depth) arrives as `l4_snapshot` and
   * `l4_batch` messages instead; read those with `onMessage`.
   */
  onHistoricalData<T = unknown>(
    handler: (coin: string, timestamp: number, data: T) => void
  ): void {
    this.historicalDataHandlers.push(handler as (coin: string, timestamp: number, data: unknown) => void);
  }

  /**
   * Handle historical tick data (granularity='tick' mode)
   * Receives a checkpoint (full orderbook) followed by incremental deltas.
   * This is for tick-level granularity on Lighter orderbook data. The server
   * sends the checkpoint as a live-shaped book (`{coin, time, levels}`); the
   * SDK converts it to an `OrderBook` before handlers run.
   */
  onHistoricalTickData(
    handler: (coin: string, checkpoint: OrderBook, deltas: OrderbookDelta[]) => void
  ): void {
    this.historicalTickDataHandlers.push(handler);
  }

  /**
   * Handle batched data (bulk stream mode).
   *
   * @deprecated Bulk streaming has been discontinued on the server, so this
   * handler is never called. For large dataset downloads, use the S3 Parquet
   * bulk export at https://www.0xarchive.io/data.
   */
  onBatch<T = unknown>(
    handler: (coin: string, records: Array<{ timestamp: number; data: T }>) => void
  ): void {
    this.batchHandlers.push(handler as (coin: string, records: Array<{ timestamp: number; data: unknown }>) => void);
  }

  /**
   * Handle replay started event
   */
  onReplayStart(
    handler: (channel: WsChannel, coin: string, start: number, end: number, speed: number) => void
  ): void {
    this.replayStartHandlers.push(handler);
  }

  /**
   * Handle replay completed event
   */
  onReplayComplete(
    handler: (channel: WsChannel, coin: string, snapshotsSent: number) => void
  ): void {
    this.replayCompleteHandlers.push(handler);
  }

  /**
   * Handle replay snapshot events (multi-channel mode).
   * Called with the initial state for each channel before the replay
   * timeline begins. Use this to initialize local state (e.g., set the current
   * orderbook or latest funding rate) before `historical_data` messages start
   * arriving.
   *
   * @param handler - Callback receiving channel, coin, timestamp (ms), and data payload
   *
   * @example
   * ```typescript
   * ws.onReplaySnapshot((channel, coin, timestamp, data) => {
   *   if (channel === 'orderbook') {
   *     currentOrderbook = data;
   *   } else if (channel === 'funding') {
   *     currentFundingRate = data;
   *   }
   * });
   * ```
   */
  onReplaySnapshot<T = unknown>(
    handler: (channel: WsChannel, coin: string, timestamp: number, data: T) => void
  ): void {
    this.replaySnapshotHandlers.push(handler as (channel: WsChannel, coin: string, timestamp: number, data: unknown) => void);
  }

  /**
   * Handle stream started event.
   *
   * @deprecated Bulk streaming has been discontinued on the server, so this
   * handler is never called. For large dataset downloads, use the S3 Parquet
   * bulk export at https://www.0xarchive.io/data.
   */
  onStreamStart(
    handler: (channel: WsChannel, coin: string, start: number, end: number) => void
  ): void {
    this.streamStartHandlers.push(handler);
  }

  /**
   * Handle stream progress event.
   *
   * @deprecated Bulk streaming has been discontinued on the server, so this
   * handler is never called. For large dataset downloads, use the S3 Parquet
   * bulk export at https://www.0xarchive.io/data.
   */
  onStreamProgress(
    handler: (snapshotsSent: number) => void
  ): void {
    this.streamProgressHandlers.push(handler);
  }

  /**
   * Handle stream completed event.
   *
   * @deprecated Bulk streaming has been discontinued on the server, so this
   * handler is never called. For large dataset downloads, use the S3 Parquet
   * bulk export at https://www.0xarchive.io/data.
   */
  onStreamComplete(
    handler: (channel: WsChannel, coin: string, snapshotsSent: number) => void
  ): void {
    this.streamCompleteHandlers.push(handler);
  }

  /**
   * Handle gap detected events during replay.
   * Called when there's a gap in the historical data exceeding the threshold.
   * Thresholds: 2 minutes for orderbook/candles/liquidations, 60 minutes for trades.
   *
   * @param handler - Callback receiving channel, coin, gap start/end timestamps (ms), and duration (minutes)
   *
   * @example
   * ```typescript
   * ws.onGap((channel, coin, gapStart, gapEnd, durationMinutes) => {
   *   console.warn(`Gap detected in ${channel} ${coin}: ${durationMinutes} minutes`);
   *   console.warn(`  From: ${new Date(gapStart).toISOString()}`);
   *   console.warn(`  To:   ${new Date(gapEnd).toISOString()}`);
   * });
   * ```
   */
  onGap(
    handler: (channel: WsChannel, coin: string, gapStart: number, gapEnd: number, durationMinutes: number) => void
  ): void {
    this.gapHandlers.push(handler);
  }

  /**
   * Get current connection state
   */
  getState(): WsConnectionState {
    return this.state;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === SOCKET_OPEN;
  }

  /**
   * Set event handlers after construction
   */
  on<K extends keyof WsEventHandlers>(event: K, handler: WsEventHandlers[K]): void {
    this.handlers[event] = handler;
  }

  /**
   * Helper to handle typed orderbook data
   */
  onOrderbook(handler: (coin: string, data: OrderBook) => void): void {
    this.orderbookHandlers.push(handler);
  }

  /**
   * Helper to handle typed trade data
   */
  onTrades(handler: (coin: string, data: Trade[]) => void): void {
    this.tradesHandlers.push(handler);
  }

  /**
   * Helper to handle live liquidation events for both `liquidations` and
   * `hip3_liquidations` channels. Each item is a fill row with
   * `is_liquidation: true`, surfaced as a `Trade` (the wire shape matches
   * trades exactly).
   *
   * @param handler Called with the channel, coin, and parsed Trade array.
   *
   * @example
   * ```typescript
   * ws.onLiquidations((channel, coin, fills) => {
   *   for (const f of fills) {
   *     console.log(`${channel} ${coin} liq: ${f.side} ${f.size}@${f.price}`);
   *   }
   * });
   * ws.subscribeLiquidations('BTC');
   * ws.subscribeHip3Liquidations('hyna:BTC');
   * ```
   */
  onLiquidations(handler: (channel: WsChannel, coin: string, data: Trade[]) => void): void {
    this.liquidationsHandlers.push(handler);
  }

  /**
   * Handle live `lighter_orderbook` messages as published: a full book of up to
   * 20 levels per side (`levels[0]` bids, `levels[1]` asks, best first), not a
   * diff. While any `onLighterOrderbook` handler is registered, Lighter books
   * are not passed to `onOrderbook`, so Lighter `BTC` is not mixed with
   * Hyperliquid `BTC`. Without one, `onOrderbook` receives them converted to
   * `OrderBook`.
   */
  onLighterOrderbook(handler: (coin: string, data: LighterLiveOrderbook) => void): void {
    this.lighterOrderbookHandlers.push(handler);
  }

  /**
   * Handle live `lighter_trades` messages as published. Each trade arrives as
   * two legs (one per side) sharing `tid`: count trades by distinct `tid` and
   * sum volume over one leg per `tid`. `fee`, `fee_token`, `closed_pnl` and
   * `dir` are null in live messages; the finalized record with fees is served
   * by `client.lighter.trades.history()`. While any `onLighterTrades` handler is
   * registered, Lighter trades are not passed to `onTrades`; without one,
   * `onTrades` receives them converted to `Trade` (one entry per leg, with the
   * account index in `accountIndex`).
   *
   * @example
   * ```typescript
   * ws.onLighterTrades((coin, legs) => {
   *   const trades = new Set(legs.map((leg) => leg.tid)).size;
   *   console.log(`${coin}: ${trades} trades`);
   * });
   * ws.subscribeLighter('trades', 'BTC');
   * ```
   */
  onLighterTrades(handler: (coin: string, data: LighterLiveTrade[]) => void): void {
    this.lighterTradesHandlers.push(handler);
  }

  /**
   * Handle live `lighter_open_interest` and `lighter_funding` messages. Both
   * channels carry the same `{coin, ctx}` message; `channel` says which
   * subscription delivered it. `ctx.funding` and `ctx.premium` are fractions.
   */
  onLighterStats(
    handler: (channel: 'lighter_open_interest' | 'lighter_funding', coin: string, data: LighterLiveStats) => void
  ): void {
    this.lighterStatsHandlers.push(handler);
  }

  /**
   * Handle live `rh_lighter_orderbook` messages (Lighter on Robinhood Chain)
   * as published: the same full top-20 book as `lighter_orderbook`. While any
   * `onRhLighterOrderbook` handler is registered, Robinhood Chain books are
   * not passed to `onOrderbook`; without one, `onOrderbook` receives them
   * converted to `OrderBook`.
   */
  onRhLighterOrderbook(handler: (coin: string, data: LighterLiveOrderbook) => void): void {
    this.rhLighterOrderbookHandlers.push(handler);
  }

  /**
   * Handle live `rh_lighter_trades` messages as published: two legs per trade
   * sharing `tid`, exactly like `lighter_trades`. While any
   * `onRhLighterTrades` handler is registered, Robinhood Chain trades are not
   * passed to `onTrades`; without one, `onTrades` receives them converted to
   * `Trade` (one entry per leg, with the account index in `accountIndex`).
   * The reconciled record is `client.rhLighter.trades.history()`.
   */
  onRhLighterTrades(handler: (coin: string, data: LighterLiveTrade[]) => void): void {
    this.rhLighterTradesHandlers.push(handler);
  }

  /**
   * Handle live `rh_lighter_open_interest` and `rh_lighter_funding` messages.
   * Both carry the same `{coin, ctx}` message as the mainnet stats channels;
   * `channel` says which subscription delivered it.
   */
  onRhLighterStats(
    handler: (channel: 'rh_lighter_open_interest' | 'rh_lighter_funding', coin: string, data: LighterLiveStats) => void
  ): void {
    this.rhLighterStatsHandlers.push(handler);
  }

  /**
   * Handle `{"type":"error"}` messages from the server. `errorCode` is the
   * stable code (see `ERROR_CODES`): for example `unsupported_for_venue` when
   * a channel does not offer the requested mode, `rate_limited` when
   * subscribing too fast, and `slow_consumer` when the connection fell behind
   * a stream and messages were dropped (re-subscribe, or restart the replay,
   * to resync).
   *
   * @example
   * ```typescript
   * ws.onServerError((error) => {
   *   if (error.errorCode === 'slow_consumer') {
   *     ws.unsubscribe('l4_diffs', 'BTC');
   *     ws.subscribe('l4_diffs', 'BTC');
   *   }
   * });
   * ```
   */
  onServerError(handler: (error: WsError) => void): void {
    this.serverErrorHandlers.push(handler);
  }

  /**
   * Handle HIP-4 outcome settlement events. Pushed once per `(outcome_id, side)`
   * when the outcome flips to settled. After this event the server proactively
   * unsubscribes the client from every hip4_* subscription on the settled coin —
   * treat the event as a terminal signal for that coin.
   *
   * @example
   * ```typescript
   * ws.onOutcomeSettled((coin, outcomeId, side, value, at) => {
   *   console.log(`${coin} (outcome ${outcomeId} side ${side}) settled to ${value} at ${at}`);
   * });
   * ```
   */
  onOutcomeSettled(
    handler: (coin: string, outcomeId: number, side: number, settlementValue?: number, settlementAt?: string) => void
  ): void {
    this.outcomeSettledHandlers.push(handler);
  }

  // Private methods

  /**
   * Send a request. While connecting or reconnecting it is queued and sent
   * once the socket opens. While disconnected it throws, except a stop
   * request, which has nothing to stop.
   */
  private send(message: WsClientMessage): void {
    if (this.sendNow(message)) {
      return;
    }
    if (this.state !== 'disconnected') {
      this.pending.push(message);
      return;
    }
    if (message.op === 'replay.stop' || message.op === 'stream.stop') {
      return;
    }
    throw new Error(notConnectedError(message.op));
  }

  /** Send now if the socket is open; false when it is not. */
  private sendNow(message: WsClientMessage): boolean {
    if (this.ws?.readyState !== SOCKET_OPEN) {
      return false;
    }
    this.ws.send(JSON.stringify(message));
    return true;
  }

  private flushPending(): void {
    const queued = this.pending;
    this.pending = [];
    for (const message of queued) {
      this.sendNow(message);
    }
  }

  private setState(state: WsConnectionState): void {
    this.state = state;
    this.handlers.onStateChange?.(state);
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      this.sendNow({ op: 'ping' });
    }, this.options.pingInterval);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private subscriptionKey(channel: WsChannel, coin?: string): string {
    if (!coin) return channel;
    // Lighter symbols (mainnet and Robinhood Chain) are case-insensitive on
    // the server, so 'btc' and 'BTC' are one subscription.
    const symbol = isLighterFamilyChannel(channel) ? coin.toUpperCase() : coin;
    return `${channel}:${symbol}`;
  }

  private subscribeMessage(subscription: StoredSubscription): WsSubscribe {
    // Wire field is `symbol`; `coin` is the deprecated alias kept on the
    // SDK surface for backward compatibility.
    const message: WsSubscribe = { op: 'subscribe', channel: subscription.channel, symbol: subscription.coin };
    if (subscription.intervalMs !== undefined) {
      message.interval_ms = subscription.intervalMs;
    }
    return message;
  }

  private resubscribe(): void {
    // Stored entries keep channel and symbol separately, so symbols that
    // contain ':' (HIP-3, e.g. 'km:US500') and Lighter book intervals survive
    // a reconnect intact.
    for (const subscription of this.subscriptions.values()) {
      this.send(this.subscribeMessage(subscription));
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      this.setState('disconnected');
      this.pending = [];
      return;
    }

    this.setState('reconnecting');
    this.reconnectAttempts++;

    const delay = this.options.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(() => {
        // Reconnect attempt failed: schedule another one, or give up once
        // reconnectAttempts reaches the limit (scheduleReconnect checks it).
        this.scheduleReconnect();
      });
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private handleMessage(message: WsServerMessage): void {
    if (message.type === 'error') {
      // Surface the wire's error_code as errorCode, as REST errors do.
      const code = (message as WsError).error_code;
      if (typeof code === 'string') {
        (message as WsError).errorCode = code;
      }
    } else if (message.type === 'historical_tick_data') {
      // Lighter tick replay sends its checkpoint in the live book shape
      // ({coin, time, levels}); handlers receive it as an OrderBook.
      const msg = message as WsHistoricalTickData;
      if (isLiveShapedBook(msg.checkpoint)) {
        msg.checkpoint = transformOrderbook(msg.coin, msg.checkpoint as unknown as Record<string, unknown>);
      }
    }

    // Call the generic onMessage handler first
    this.handlers.onMessage?.(message);

    // Dispatch to typed handlers based on message type
    switch (message.type) {
      case 'historical_data': {
        const msg = message as WsHistoricalData;
        for (const handler of this.historicalDataHandlers) {
          handler(msg.coin, msg.timestamp, msg.data);
        }
        break;
      }
      case 'historical_tick_data': {
        const msg = message as WsHistoricalTickData;
        for (const handler of this.historicalTickDataHandlers) {
          handler(msg.coin, msg.checkpoint, msg.deltas);
        }
        break;
      }
      case 'historical_batch': {
        const msg = message as WsHistoricalBatch;
        for (const handler of this.batchHandlers) {
          handler(msg.coin, msg.data as Array<{ timestamp: number; data: unknown }>);
        }
        break;
      }
      case 'replay_started': {
        const msg = message as WsReplayStarted;
        for (const handler of this.replayStartHandlers) {
          handler(msg.channel, msg.coin, msg.start, msg.end, msg.speed);
        }
        break;
      }
      case 'replay_completed': {
        const msg = message as WsReplayCompleted;
        for (const handler of this.replayCompleteHandlers) {
          handler(msg.channel, msg.coin, msg.snapshots_sent);
        }
        break;
      }
      case 'replay_snapshot': {
        const msg = message as WsReplaySnapshot;
        for (const handler of this.replaySnapshotHandlers) {
          handler(msg.channel, msg.coin, msg.timestamp, msg.data);
        }
        break;
      }
      case 'stream_started': {
        const msg = message as WsStreamStarted;
        for (const handler of this.streamStartHandlers) {
          handler(msg.channel, msg.coin, msg.start, msg.end);
        }
        break;
      }
      case 'stream_progress': {
        const msg = message as WsStreamProgress;
        for (const handler of this.streamProgressHandlers) {
          handler(msg.snapshots_sent);
        }
        break;
      }
      case 'stream_completed': {
        const msg = message as WsStreamCompleted;
        for (const handler of this.streamCompleteHandlers) {
          handler(msg.channel, msg.coin, msg.snapshots_sent);
        }
        break;
      }
      case 'gap_detected': {
        const msg = message as WsGapDetected;
        for (const handler of this.gapHandlers) {
          handler(msg.channel, msg.coin, msg.gap_start, msg.gap_end, msg.duration_minutes);
        }
        break;
      }
      case 'data': {
        if (RH_LIGHTER_REPLAY_CHANNELS.has(message.channel)) {
          this.dispatchRhLighter(message.channel, message.coin, message.data);
        } else if (message.channel === 'lighter_orderbook' && this.lighterOrderbookHandlers.length > 0) {
          // A Lighter-specific handler takes the book, so Lighter 'BTC' does
          // not reach onOrderbook alongside Hyperliquid 'BTC'.
          for (const handler of this.lighterOrderbookHandlers) {
            handler(message.coin, message.data as LighterLiveOrderbook);
          }
        } else if (
          message.channel === 'orderbook' ||
          message.channel === 'hip3_orderbook' ||
          message.channel === 'hip4_orderbook' ||
          message.channel === 'lighter_orderbook' ||
          message.channel === 'spot_orderbook'
        ) {
          // Transform raw orderbook payload to SDK OrderBook type. Covers the
          // bare `orderbook` channel plus all per-venue variants so a single
          // `onOrderbook` handler works regardless of which subscribe* helper
          // produced the data.
          const orderbook = transformOrderbook(message.coin, message.data as Record<string, unknown>);
          for (const handler of this.orderbookHandlers) {
            handler(message.coin, orderbook);
          }
        } else if (message.channel === 'lighter_trades') {
          const legs = lighterLiveTrades(message.data);
          if (this.lighterTradesHandlers.length > 0) {
            // A Lighter-specific handler takes the legs, so Lighter 'BTC'
            // does not reach onTrades alongside Hyperliquid 'BTC'.
            for (const handler of this.lighterTradesHandlers) {
              handler(message.coin, legs);
            }
          } else {
            // Live Lighter legs carry one account each, so they get their own
            // transform instead of the Hyperliquid users[maker, taker] mapping.
            const trades = legs.map((leg) => transformLighterLiveTrade(message.coin, leg));
            for (const handler of this.tradesHandlers) {
              handler(message.coin, trades);
            }
          }
        } else if (message.channel === 'lighter_open_interest' || message.channel === 'lighter_funding') {
          for (const handler of this.lighterStatsHandlers) {
            handler(message.channel, message.coin, message.data as LighterLiveStats);
          }
        } else if (
          message.channel === 'trades' ||
          message.channel === 'hip3_trades' ||
          message.channel === 'hip4_trades' ||
          message.channel === 'spot_trades'
        ) {
          // Transform raw trade payload to SDK Trade type. Covers the bare
          // `trades` channel plus all per-venue variants.
          const trades = transformTrades(message.coin, message.data);
          for (const handler of this.tradesHandlers) {
            handler(message.coin, trades);
          }
        } else if (message.channel === 'liquidations' || message.channel === 'hip3_liquidations') {
          // Liquidation messages share the trades wire shape (fill row with
          // is_liquidation: true). Reuse the trade transformer so consumers
          // get the same `Trade` type they already know.
          const fills = transformTrades(message.coin, message.data);
          for (const handler of this.liquidationsHandlers) {
            handler(message.channel, message.coin, fills);
          }
        }
        break;
      }
      case 'error': {
        for (const handler of this.serverErrorHandlers) {
          handler(message as WsError);
        }
        break;
      }
      case 'outcome_settled': {
        const msg = message as WsOutcomeSettled;
        for (const handler of this.outcomeSettledHandlers) {
          handler(msg.coin, msg.outcome_id, msg.side, msg.settlement_value, msg.settlement_at);
        }
        break;
      }
    }
  }

  /**
   * Live Lighter on Robinhood Chain data. The payloads have the mainnet Lighter
   * live shapes; they go to the `onRhLighter*` handlers when registered, so
   * they never mix with mainnet Lighter or Hyperliquid data of the same symbol.
   */
  private dispatchRhLighter(channel: WsChannel, coin: string, data: unknown): void {
    if (channel === 'rh_lighter_orderbook') {
      if (this.rhLighterOrderbookHandlers.length > 0) {
        for (const handler of this.rhLighterOrderbookHandlers) {
          handler(coin, data as LighterLiveOrderbook);
        }
      } else {
        const orderbook = transformOrderbook(coin, data as Record<string, unknown>);
        for (const handler of this.orderbookHandlers) {
          handler(coin, orderbook);
        }
      }
    } else if (channel === 'rh_lighter_trades') {
      const legs = lighterLiveTrades(data);
      if (this.rhLighterTradesHandlers.length > 0) {
        for (const handler of this.rhLighterTradesHandlers) {
          handler(coin, legs);
        }
      } else {
        const trades = legs.map((leg) => transformLighterLiveTrade(coin, leg));
        for (const handler of this.tradesHandlers) {
          handler(coin, trades);
        }
      }
    } else if (channel === 'rh_lighter_open_interest' || channel === 'rh_lighter_funding') {
      for (const handler of this.rhLighterStatsHandlers) {
        handler(channel, coin, data as LighterLiveStats);
      }
    }
  }
}
