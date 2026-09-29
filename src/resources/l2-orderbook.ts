import { type HttpClient, cursorPage } from '../http';
import type { ApiResponse, CursorResponse, CursorPaginationParams } from '../types';

export interface L2OrderBookParams {
  timestamp?: number | string;
  depth?: number;
}

/** Parameters for full-depth L2 history (`l2Orderbook.history()`). */
export interface L2OrderBookHistoryParams extends CursorPaginationParams {
  /** Price levels per side in each snapshot (default: every level). */
  depth?: number;
}

/**
 * L2 Full-Depth Order Book API resource (derived from L4 data)
 *
 * Access aggregated price-level orderbook snapshots, history, and tick-level diffs.
 * Served from 2026-03-11 01:03 UTC (the first L4 checkpoint), on Hyperliquid
 * core and HIP-3.
 *
 * @example
 * ```typescript
 * // Get current full-depth L2 orderbook
 * const orderbook = await client.hyperliquid.l2Orderbook.get('BTC');
 *
 * // Get L2 orderbook at a historical timestamp
 * const historical = await client.hyperliquid.l2Orderbook.get('BTC', {
 *   timestamp: 1711900800000
 * });
 *
 * // Get L2 orderbook history
 * const history = await client.hyperliquid.l2Orderbook.history('BTC', {
 *   start: Date.now() - 86400000,
 *   end: Date.now(),
 *   limit: 100
 * });
 * ```
 */
export class L2OrderBookResource {
  constructor(
    private http: HttpClient,
    private basePath: string = '/v1',
    private coinTransform: (s: string) => string = (c) => c.toUpperCase(),
  ) {}

  /** Get full-depth L2 order book snapshot. */
  async get(symbol: string, params?: L2OrderBookParams): Promise<any> {
    const coin = this.coinTransform(symbol);
    const query: Record<string, unknown> = {};
    if (params?.timestamp != null) query.timestamp = params.timestamp;
    if (params?.depth != null) query.depth = params.depth;

    const resp: ApiResponse<any> = await this.http.get(
      `${this.basePath}/orderbook/${coin}/l2`,
      query,
    );
    return resp.data;
  }

  /**
   * Get paginated L2 full-depth history. Each snapshot carries the full book,
   * or the best `depth` levels per side when `depth` is set.
   */
  async history(
    symbol: string,
    params: L2OrderBookHistoryParams,
  ): Promise<CursorResponse<any[]>> {
    const coin = this.coinTransform(symbol);
    const resp: ApiResponse<any[]> = await this.http.get(
      `${this.basePath}/orderbook/${coin}/l2/history`,
      params as unknown as Record<string, unknown>,
    );
    // http.get camelizes response keys, so the wire's next_cursor arrives as nextCursor
    return cursorPage(resp);
  }

  /** Get tick-level L2 order book diffs. */
  async diffs(
    symbol: string,
    params: CursorPaginationParams,
  ): Promise<CursorResponse<any[]>> {
    const coin = this.coinTransform(symbol);
    const resp: ApiResponse<any[]> = await this.http.get(
      `${this.basePath}/orderbook/${coin}/l2/diffs`,
      params as unknown as Record<string, unknown>,
    );
    return cursorPage(resp);
  }
}
