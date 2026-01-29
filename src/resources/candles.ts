import type { HttpClient } from '../http';
import type { ApiResponse, Candle, CandleHistoryParams, CursorResponse } from '../types';
import { CandleArrayResponseSchema } from '../schemas';

/**
 * Candles (OHLCV) API resource
 *
 * @example
 * ```typescript
 * // Get candle history with cursor-based pagination
 * let result = await client.hyperliquid.candles.history('BTC', {
 *   start: Date.now() - 86400000,
 *   end: Date.now(),
 *   interval: '1h',
 *   limit: 1000
 * });
 *
 * // Get all pages
 * const allCandles = [...result.data];
 * while (result.nextCursor) {
 *   result = await client.hyperliquid.candles.history('BTC', {
 *     start: Date.now() - 86400000,
 *     end: Date.now(),
 *     interval: '1h',
 *     cursor: result.nextCursor,
 *     limit: 1000
 *   });
 *   allCandles.push(...result.data);
 * }
 *
 * // Iterate through candles
 * for (const candle of allCandles) {
 *   console.log(`${candle.timestamp}: O=${candle.open} H=${candle.high} L=${candle.low} C=${candle.close}`);
 * }
 * ```
 */
export class CandlesResource {
  constructor(private http: HttpClient, private basePath: string = '/v1') {}

  /**
   * Get historical OHLCV candle data with cursor-based pagination
   *
   * @param coin - The coin symbol (e.g., 'BTC', 'ETH')
   * @param params - Time range, interval, and cursor pagination parameters (start and end are required)
   * @returns CursorResponse with candle records and nextCursor for pagination
   */
  async history(coin: string, params: CandleHistoryParams): Promise<CursorResponse<Candle[]>> {
    const response = await this.http.get<ApiResponse<Candle[]>>(
      `${this.basePath}/candles/${coin.toUpperCase()}`,
      params as unknown as Record<string, unknown>,
      this.http.validationEnabled ? CandleArrayResponseSchema : undefined
    );
    return {
      data: response.data,
      nextCursor: response.meta.nextCursor,
    };
  }
}
