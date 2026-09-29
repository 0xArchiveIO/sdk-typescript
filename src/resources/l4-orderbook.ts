import { type HttpClient, cursorPage } from '../http';
import type { ApiResponse, CursorResponse, CursorPaginationParams } from '../types';

export interface L4OrderBookParams {
  timestamp?: number | string;
  depth?: number;
}

/**
 * L4 Order Book API resource
 *
 * Access L4 orderbook snapshots, diffs, and history.
 *
 * @example
 * ```typescript
 * // Get current L4 orderbook
 * const orderbook = await client.hyperliquid.l4Orderbook.get('BTC');
 *
 * // Get L4 orderbook diffs
 * const diffs = await client.hyperliquid.l4Orderbook.diffs('BTC', {
 *   start: Date.now() - 86400000,
 *   end: Date.now(),
 *   limit: 1000
 * });
 *
 * // Get L4 orderbook history
 * const history = await client.hyperliquid.l4Orderbook.history('BTC', {
 *   start: Date.now() - 86400000,
 *   end: Date.now(),
 *   limit: 1000
 * });
 * ```
 */
export class L4OrderBookResource {
  constructor(
    private http: HttpClient,
    private basePath: string = '/v1',
    private coinTransform: (s: string) => string = (c) => c.toUpperCase()
  ) {}

  /**
   * Get L4 order book snapshot for a symbol
   *
   * The snapshot has the shape of `L4OrderBookSnapshot`: every resting
   * order with its owner, and the time it took its place in the queue as
   * `timestamp` (RFC 3339 UTC) and `timestampMs` (Unix ms); both are null
   * when the queue time is unknown.
   *
   * @param symbol - The symbol (e.g., 'BTC', 'ETH')
   * @param params - Optional parameters (timestamp, depth)
   * @returns L4 order book snapshot
   */
  async get(symbol: string, params?: L4OrderBookParams): Promise<any> {
    const response = await this.http.get<ApiResponse<any>>(
      `${this.basePath}/orderbook/${this.coinTransform(symbol)}/l4`,
      params as Record<string, unknown>
    );
    return response.data;
  }

  /**
   * Get L4 order book diffs with cursor-based pagination
   *
   * @param symbol - The symbol (e.g., 'BTC', 'ETH')
   * @param params - Time range and cursor pagination parameters
   * @returns CursorResponse with L4 orderbook diffs and nextCursor for pagination
   */
  async diffs(symbol: string, params: CursorPaginationParams): Promise<CursorResponse<any[]>> {
    const response = await this.http.get<ApiResponse<any[]>>(
      `${this.basePath}/orderbook/${this.coinTransform(symbol)}/l4/diffs`,
      params as unknown as Record<string, unknown>
    );
    return cursorPage(response);
  }

  /**
   * Get L4 order book history with cursor-based pagination
   *
   * @param symbol - The symbol (e.g., 'BTC', 'ETH')
   * @param params - Time range and cursor pagination parameters
   * @returns CursorResponse with L4 orderbook snapshots and nextCursor for pagination
   */
  async history(symbol: string, params: CursorPaginationParams): Promise<CursorResponse<any[]>> {
    const response = await this.http.get<ApiResponse<any[]>>(
      `${this.basePath}/orderbook/${this.coinTransform(symbol)}/l4/history`,
      params as unknown as Record<string, unknown>
    );
    return cursorPage(response);
  }
}
