import type { HttpClient } from '../http';
import type { ApiResponse, CursorResponse, CursorPaginationParams } from '../types';

export interface L3OrderBookParams {
  timestamp?: number | string;
  depth?: number;
}

/**
 * L3 Order Book API resource (Lighter only)
 *
 * Access Lighter.xyz L3 orderbook snapshots and history. The served snapshot
 * is order-level data capped at 250 orders per side.
 *
 * @example
 * ```typescript
 * // Get current L3 orderbook
 * const orderbook = await client.lighter.l3Orderbook.get('BTC');
 *
 * // Get L3 orderbook history
 * const history = await client.lighter.l3Orderbook.history('BTC', {
 *   start: Date.now() - 86400000,
 *   end: Date.now(),
 *   limit: 1000
 * });
 * ```
 */
export class L3OrderBookResource {
  constructor(
    private http: HttpClient,
    private basePath: string = '/v1',
    private coinTransform: (s: string) => string = (c) => c.toUpperCase()
  ) {}

  /**
   * Get L3 order book snapshot for a symbol
   *
   * @param symbol - The symbol (e.g., 'BTC', 'ETH')
   * @param params - Optional parameters (timestamp, depth; maximum 250 orders per side)
   * @returns L3 order book snapshot
   */
  async get(symbol: string, params?: L3OrderBookParams): Promise<any> {
    const response = await this.http.get<ApiResponse<any>>(
      `${this.basePath}/l3orderbook/${this.coinTransform(symbol)}`,
      params as Record<string, unknown>
    );
    return response.data;
  }

  /**
   * Get L3 order book history with cursor-based pagination
   *
   * @param symbol - The symbol (e.g., 'BTC', 'ETH')
   * @param params - Time range and cursor pagination parameters
   * @returns CursorResponse with L3 orderbook snapshots and nextCursor for pagination
   */
  async history(symbol: string, params: CursorPaginationParams): Promise<CursorResponse<any[]>> {
    const response = await this.http.get<ApiResponse<any[]>>(
      `${this.basePath}/l3orderbook/${this.coinTransform(symbol)}/history`,
      params as unknown as Record<string, unknown>
    );
    return { data: response.data, nextCursor: response.meta.nextCursor };
  }
}
