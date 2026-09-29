/**
 * The dated API contract this SDK is built against.
 *
 * Every REST request sends `0xArchive-Version: 2026-10-01` and every
 * WebSocket connection opens with `version=2026-10-01`. The API shapes its
 * responses for that version: the standard `{ success, data, meta }`
 * envelope on every route, RFC 3339 record times with integer milliseconds in
 * `*_ms` fields, the stable `error_code` set below, and the live payload
 * shapes on Lighter and Robinhood Chain replay.
 */

/** The API version this SDK sends and parses. */
export const API_VERSION = '2026-10-01';

/** Request header that selects the API version (echoed on every response). */
export const API_VERSION_HEADER = '0xArchive-Version';

/**
 * The stable public error codes. Every non-2xx response carries one as
 * `error_code` (`OxArchiveError.errorCode`), and every WebSocket
 * `{"type":"error"}` message carries one too. Branch on these strings, not
 * on the message text.
 *
 * - `invalid_parameter`: a parameter failed to parse or validate.
 * - `invalid_symbol`: the symbol is not listed on this venue.
 * - `invalid_interval`: the interval is not one this route accepts.
 * - `invalid_cursor`: the cursor is malformed, stale, or was issued for other filters.
 * - `invalid_time_range`: `start` is after `end`, or a time could not be parsed.
 * - `range_before_coverage`: the whole range ends before the dataset's first served instant.
 * - `historical_range_exceeded`: the requested span exceeds the plan's per-request limit.
 * - `historical_depth_exceeded`: the request reaches further back than the plan's history window.
 * - `unsupported_for_venue`: the datatype (or WebSocket mode) is not offered on this venue.
 * - `route_not_found`: no route matches the path.
 * - `not_found`: the route exists but the resource id does not.
 * - `unauthorized`, `forbidden`, `insufficient_credits`, `rate_limited`, `conflict`.
 * - `upstream_unavailable`: a dependency is unavailable; retry later.
 * - `internal_error`.
 * - `slow_consumer` (WebSocket only): the connection fell behind a stream and
 *   messages were dropped. Re-subscribe, or restart the replay, to resync.
 * - `endpoint_unsupported` (WebSocket only): this endpoint does not serve the
 *   channel or operation; the message names the endpoint that does.
 * - `positions_unavailable`, `api_key_limit_reached`, `oauth_not_permitted`:
 *   route-specific codes that are part of the public set.
 */
export const ERROR_CODES = [
  'invalid_parameter',
  'invalid_symbol',
  'invalid_interval',
  'invalid_cursor',
  'invalid_time_range',
  'range_before_coverage',
  'historical_range_exceeded',
  'historical_depth_exceeded',
  'unsupported_for_venue',
  'route_not_found',
  'not_found',
  'unauthorized',
  'forbidden',
  'insufficient_credits',
  'rate_limited',
  'conflict',
  'upstream_unavailable',
  'internal_error',
  'slow_consumer',
  'endpoint_unsupported',
  'positions_unavailable',
  'api_key_limit_reached',
  'oauth_not_permitted',
] as const;

/** One of the stable public error codes ({@link ERROR_CODES}). */
export type ErrorCode = (typeof ERROR_CODES)[number];

/** Error codes only the WebSocket sends. */
export const WEBSOCKET_ONLY_ERROR_CODES = ['slow_consumer', 'endpoint_unsupported'] as const;

/** An error code only the WebSocket sends. */
export type WebSocketOnlyErrorCode = (typeof WEBSOCKET_ONLY_ERROR_CODES)[number];

const ERROR_CODE_SET: ReadonlySet<string> = new Set(ERROR_CODES);

/** True when `value` is one of the stable public error codes. */
export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && ERROR_CODE_SET.has(value);
}

/**
 * The public venue names, as sent in `meta.venue` and in `/v1/capabilities`:
 * Hyperliquid core, HIP-3, HIP-4, Hyperliquid spot, Lighter, and Lighter on
 * Robinhood Chain.
 */
export const VENUES = ['hyperliquid', 'hip3', 'hip4', 'spot', 'lighter', 'rh-lighter'] as const;

/** A public venue name ({@link VENUES}). */
export type Venue = (typeof VENUES)[number];
