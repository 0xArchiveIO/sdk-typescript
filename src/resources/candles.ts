import type { HttpClient } from '../http';
import type { ApiResponse, Candle, CandleHistoryParams, CursorResponse } from '../types';
import { CandleArrayResponseSchema } from '../schemas';

/**
 * Candles (OHLCV) API resource.
 *
 * The resource is mounted only on clients whose family exposes a candle route.
 * Family-specific limits and coverage are documented on the owning client;
 * the API currently supports the shared 1m-through-1w interval set. Maximum
 * `limit` is route-specific: 10,000 for core Hyperliquid and Lighter, and
 * 1,000 for HIP-3, HIP-4, and Hyperliquid Spot. Pagination cursors are opaque
 * strings.
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
  constructor(
    private http: HttpClient,
    private basePath: string = '/v1',
    private coinTransform: (coin: string) => string = (c) => c.toUpperCase(),
    private maxLimit: number = 10_000,
  ) {}

  /**
   * Get historical OHLCV candle data with cursor-based pagination
   *
   * @param symbol - The symbol (e.g., 'BTC', 'ETH')
   * @param params - Time range, interval, and cursor pagination parameters (start and end are required)
   * @returns CursorResponse with candle records and nextCursor for pagination
   */
  async history(symbol: string, params: CandleHistoryParams): Promise<CursorResponse<Candle[]>> {
    if (params.limit !== undefined && (!Number.isInteger(params.limit) || params.limit < 1 || params.limit > this.maxLimit)) {
      throw new RangeError(`limit must be between 1 and ${this.maxLimit} for this candle route`);
    }
    const normalizeTimestamp = (value: number | string, field: 'start' | 'end') => {
      const timestamp = typeof value === 'number'
        ? value
        : /^\d+$/.test(value)
          ? Number(value)
          : Date.parse(value);
      if (!Number.isFinite(timestamp)) {
        throw new TypeError(`${field} must be an integer millisecond timestamp or valid ISO date string`);
      }
      return Math.trunc(timestamp);
    };
    const query = {
      ...params,
      start: normalizeTimestamp(params.start, 'start'),
      end: normalizeTimestamp(params.end, 'end'),
    };
    const response = await this.http.get<ApiResponse<Candle[]>>(
      `${this.basePath}/candles/${this.coinTransform(symbol)}`,
      query as unknown as Record<string, unknown>,
      this.http.validationEnabled ? CandleArrayResponseSchema : undefined
    );
    return {
      data: response.data,
      nextCursor: response.meta.nextCursor,
    };
  }
}
