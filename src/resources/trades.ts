import type { HttpClient } from '../http';
import type { ApiResponse, Trade, GetTradesCursorParams, CursorResponse } from '../types';
import { TradeArrayResponseSchema } from '../schemas';

/**
 * Trades API resource
 *
 * @example
 * ```typescript
 * // Get trade history with cursor-based pagination (recommended)
 * let result = await client.hyperliquid.trades.list('BTC', {
 *   start: Date.now() - 86400000,
 *   end: Date.now(),
 *   limit: 1000
 * });
 *
 * // Get all pages
 * const allTrades = [...result.data];
 * while (result.nextCursor) {
 *   result = await client.hyperliquid.trades.list('BTC', {
 *     start: Date.now() - 86400000,
 *     end: Date.now(),
 *     cursor: result.nextCursor,
 *     limit: 1000
 *   });
 *   allTrades.push(...result.data);
 * }
 *
 * // Get recent trades (Lighter only - has real-time data)
 * const recent = await client.lighter.trades.recent('BTC');
 * ```
 */
export class TradesResource {
  constructor(
    private http: HttpClient,
    private basePath: string = '/v1',
    private coinTransform: (coin: string) => string = (c) => c.toUpperCase()
  ) {}

  /**
   * Get trade history for a symbol using cursor-based pagination
   *
   * Uses cursor-based pagination by default, which is more efficient for large datasets.
   * Use the `nextCursor` from the response as the `cursor` parameter to get the next page.
   *
   * @param symbol - The symbol (e.g., 'BTC', 'ETH')
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
  async list(symbol: string, params: GetTradesCursorParams): Promise<CursorResponse<Trade[]>> {
    const response = await this.http.get<ApiResponse<Trade[]>>(
      `${this.basePath}/trades/${this.coinTransform(symbol)}`,
      params as unknown as Record<string, unknown>,
      this.http.validationEnabled ? TradeArrayResponseSchema : undefined
    );
    return {
      data: response.data,
      nextCursor: response.meta.nextCursor,
    };
  }

  /**
   * Get most recent trades for a symbol.
   *
   * Note: This method is available for Lighter (client.lighter.trades.recent())
   * and HIP-3 (client.hyperliquid.hip3.trades.recent()) which have real-time data
   * ingestion. Hyperliquid uses hourly backfill so this endpoint is not available
   * for Hyperliquid.
   *
   * @param symbol - The symbol (e.g., 'BTC', 'ETH')
   * @param limit - Number of trades to return (default: 100)
   * @returns Array of recent trades
   */
  async recent(symbol: string, limit?: number): Promise<Trade[]> {
    const response = await this.http.get<ApiResponse<Trade[]>>(
      `${this.basePath}/trades/${this.coinTransform(symbol)}/recent`,
      { limit },
      this.http.validationEnabled ? TradeArrayResponseSchema : undefined
    );
    return response.data;
  }

}
