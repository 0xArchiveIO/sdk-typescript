import type { HttpClient } from '../http';
import type { ApiResponse, Trade, GetTradesCursorParams, CursorResponse } from '../types';
import { TradeArrayResponseSchema } from '../schemas';

/**
 * Trades API resource
 *
 * @example
 * ```typescript
 * // Get recent trades
 * const trades = await client.trades.recent('BTC');
 *
 * // Get trade history with cursor-based pagination (recommended)
 * let result = await client.trades.list('BTC', {
 *   start: Date.now() - 86400000,
 *   end: Date.now(),
 *   limit: 1000
 * });
 *
 * // Get all pages
 * const allTrades = [...result.data];
 * while (result.nextCursor) {
 *   result = await client.trades.list('BTC', {
 *     start: Date.now() - 86400000,
 *     end: Date.now(),
 *     cursor: result.nextCursor,
 *     limit: 1000
 *   });
 *   allTrades.push(...result.data);
 * }
 * ```
 */
export class TradesResource {
  constructor(private http: HttpClient) {}

  /**
   * Get trade history for a coin using cursor-based pagination
   *
   * Uses cursor-based pagination by default, which is more efficient for large datasets.
   * Use the `nextCursor` from the response as the `cursor` parameter to get the next page.
   *
   * @param coin - The coin symbol (e.g., 'BTC', 'ETH')
   * @param params - Time range and cursor pagination parameters (start and end are required)
   * @returns Object with trades array and nextCursor for pagination
   *
   * @example
   * ```typescript
   * // First page
   * let result = await client.trades.list('BTC', {
   *   start: Date.now() - 86400000,
   *   end: Date.now(),
   *   limit: 1000
   * });
   *
   * // Subsequent pages
   * while (result.nextCursor) {
   *   result = await client.trades.list('BTC', {
   *     start: Date.now() - 86400000,
   *     end: Date.now(),
   *     cursor: result.nextCursor,
   *     limit: 1000
   *   });
   * }
   * ```
   */
  async list(coin: string, params: GetTradesCursorParams): Promise<CursorResponse<Trade[]>> {
    const response = await this.http.get<ApiResponse<Trade[]>>(
      `/v1/trades/${coin.toUpperCase()}`,
      params as unknown as Record<string, unknown>,
      this.http.validationEnabled ? TradeArrayResponseSchema : undefined
    );
    return {
      data: response.data,
      nextCursor: response.meta.nextCursor,
    };
  }

  /**
   * Get most recent trades for a coin
   *
   * @param coin - The coin symbol (e.g., 'BTC', 'ETH')
   * @param limit - Number of trades to return (default: 100)
   * @returns Array of recent trades
   */
  async recent(coin: string, limit?: number): Promise<Trade[]> {
    const response = await this.http.get<ApiResponse<Trade[]>>(
      `/v1/trades/${coin.toUpperCase()}/recent`,
      { limit },
      this.http.validationEnabled ? TradeArrayResponseSchema : undefined
    );
    return response.data;
  }

}
