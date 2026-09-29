import { type HttpClient, cursorPage } from '../http';
import type {
  ApiResponse,
  Trade,
  GetTradesCursorParams,
  CursorResponse,
  RecentTradesParams,
} from '../types';
import { OxArchiveError } from '../types';
import { TradeArrayResponseSchema } from '../schemas';

/**
 * Trades API resource
 *
 * Lighter trade routes are fill-grain: describe returned rows as individual
 * fills with maker/taker context where the route provides it, not as complete
 * order history.
 *
 * @example
 * ```typescript
 * // Trade history, one page at a time (history() and list() are the same call)
 * const window = { start: Date.now() - 86400000, end: Date.now(), limit: 1000 };
 * let result = await client.hyperliquid.trades.history('BTC', window);
 * const allTrades = [...result.data];
 * while (result.hasMore) {
 *   result = await client.hyperliquid.trades.history('BTC', { ...window, cursor: result.nextCursor });
 *   allTrades.push(...result.data);
 * }
 *
 * // Only taker buys
 * const buys = await client.hyperliquid.trades.history('BTC', { ...window, side: 'buy' });
 *
 * // Most recent trades (HIP-3, HIP-4, Spot and Lighter)
 * const recent = await client.lighter.trades.recent('BTC', { limit: 50, side: 'sell' });
 * ```
 */
export class TradesResource {
  constructor(
    private http: HttpClient,
    private basePath: string = '/v1',
    private coinTransform: (coin: string) => string = (c) => c.toUpperCase()
  ) {}

  /**
   * Get trade history for a symbol, one page at a time. The same call as
   * {@link history}.
   *
   * While `hasMore` is true, pass `nextCursor` back as `cursor` with the same
   * `start`, `end` and `side`. `side: 'buy'` or `'sell'` filters on the
   * server, so a full page still holds `limit` matching trades.
   *
   * On Lighter (mainnet and Robinhood Chain) this route serves reconciled
   * trades only: the window is clamped to the finalization boundary, which is
   * returned as `meta.finalizedThrough` (with `meta.clampedTo` and
   * `meta.requestedEnd` when the requested `end` was past it). Use `recent()`
   * for the preliminary tier.
   *
   * @param symbol - The symbol (e.g., 'BTC', 'ETH')
   * @param params - Time range, cursor pagination and optional `side` (start and end are required)
   * @returns One page: `data`, `nextCursor`, `hasMore` and `meta`
   *
   * @example
   * ```typescript
   * const window = { start: Date.now() - 86400000, end: Date.now(), limit: 1000 };
   * let result = await client.hyperliquid.trades.list('BTC', window);
   * while (result.hasMore) {
   *   result = await client.hyperliquid.trades.list('BTC', { ...window, cursor: result.nextCursor });
   * }
   * ```
   */
  async list(symbol: string, params: GetTradesCursorParams): Promise<CursorResponse<Trade[]>> {
    const response = await this.http.get<ApiResponse<Trade[]>>(
      `${this.basePath}/trades/${this.coinTransform(symbol)}`,
      params as unknown as Record<string, unknown>,
      this.http.validationEnabled ? TradeArrayResponseSchema : undefined
    );
    return cursorPage(response);
  }

  /**
   * Get trade history for a symbol, one page at a time (paged series). The
   * same call as {@link list}, named like the other history methods.
   *
   * @param symbol - The symbol (e.g., 'BTC', 'ETH')
   * @param params - Time range, cursor, limit and optional `side`
   * @returns One page: `data`, `nextCursor`, `hasMore` and `meta`
   */
  async history(symbol: string, params: GetTradesCursorParams): Promise<CursorResponse<Trade[]>> {
    return this.list(symbol, params);
  }

  /**
   * Get most recent trades for a symbol.
   *
   * Available on Lighter (`client.lighter.trades.recent()` and
   * `client.rhLighter.trades.recent()`, the preliminary tier: rows past the
   * finalization boundary are not yet reconciled), HIP-3
   * (`client.hyperliquid.hip3.trades.recent()`), HIP-4
   * (`client.hyperliquid.hip4.trades.recent()`) and Spot
   * (`client.spot.trades.recent()`). Hyperliquid core has no recent route:
   * calling `client.hyperliquid.trades.recent()` (or the legacy
   * `client.trades.recent()`) throws an `OxArchiveError` with `errorCode`
   * `route_not_found` before sending; use `history()` with a time range.
   *
   * @param symbol - The symbol (e.g., 'BTC', 'ETH')
   * @param limitOrParams - Number of trades to return (default 100), or
   *   `{ limit, side }` to keep only buys or only sells
   * @returns Array of recent trades
   * @throws {OxArchiveError} When called on the bare Hyperliquid namespace.
   */
  async recent(symbol: string, limitOrParams?: number | RecentTradesParams): Promise<Trade[]> {
    const params: RecentTradesParams =
      typeof limitOrParams === 'number' ? { limit: limitOrParams } : { ...(limitOrParams ?? {}) };

    // Guard: Hyperliquid (bare namespace) does not expose `/trades/{symbol}/recent`.
    // Only HIP-3 (`/v1/hyperliquid/hip3`), HIP-4 (`/v1/hyperliquid/hip4`), and
    // Lighter (`/v1/lighter`, `/v1/rh-lighter`) have real-time recent endpoints. Without this
    // check, callers get a 404-with-empty-body that surfaces as
    // "Unexpected end of JSON input" — confusing and unhelpful.
    if (this.basePath === '/v1/hyperliquid' || this.basePath === '/v1') {
      throw new OxArchiveError(
        'trades.recent() is not available on Hyperliquid (no real-time ingestion). ' +
          'Use client.hyperliquid.trades.history(symbol, { start, end }) with a time range, ' +
          'or call recent() on a real-time namespace: client.hyperliquid.hip3.trades.recent(), ' +
          'client.hyperliquid.hip4.trades.recent(), client.spot.trades.recent(), or client.lighter.trades.recent().',
        404,
        undefined,
        'route_not_found'
      );
    }
    const response = await this.http.get<ApiResponse<Trade[]>>(
      `${this.basePath}/trades/${this.coinTransform(symbol)}/recent`,
      { limit: params.limit, side: params.side },
      this.http.validationEnabled ? TradeArrayResponseSchema : undefined
    );
    return response.data;
  }

}
