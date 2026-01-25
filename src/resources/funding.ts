import type { HttpClient } from '../http';
import type { ApiResponse, CursorResponse, FundingRate, FundingHistoryParams } from '../types';
import { FundingRateResponseSchema, FundingRateArrayResponseSchema } from '../schemas';

/**
 * Funding rates API resource
 *
 * @example
 * ```typescript
 * // Get current funding rate
 * const current = await client.funding.current('BTC');
 *
 * // Get funding rate history with cursor-based pagination
 * let result = await client.funding.history('ETH', {
 *   start: Date.now() - 86400000 * 7,
 *   end: Date.now(),
 *   limit: 1000
 * });
 *
 * // Get all pages
 * const allRates = [...result.data];
 * while (result.nextCursor) {
 *   result = await client.funding.history('ETH', {
 *     start: Date.now() - 86400000 * 7,
 *     end: Date.now(),
 *     cursor: result.nextCursor,
 *     limit: 1000
 *   });
 *   allRates.push(...result.data);
 * }
 * ```
 */
export class FundingResource {
  constructor(private http: HttpClient) {}

  /**
   * Get funding rate history for a coin with cursor-based pagination
   *
   * @param coin - The coin symbol (e.g., 'BTC', 'ETH')
   * @param params - Time range and cursor pagination parameters (start and end are required)
   * @returns CursorResponse with funding rate records and nextCursor for pagination
   */
  async history(coin: string, params: FundingHistoryParams): Promise<CursorResponse<FundingRate[]>> {
    const response = await this.http.get<ApiResponse<FundingRate[]>>(
      `/v1/funding/${coin.toUpperCase()}`,
      params as unknown as Record<string, unknown>,
      this.http.validationEnabled ? FundingRateArrayResponseSchema : undefined
    );
    return {
      data: response.data,
      nextCursor: response.meta.nextCursor,
    };
  }

  /**
   * Get current funding rate for a coin
   *
   * @param coin - The coin symbol (e.g., 'BTC', 'ETH')
   * @returns Current funding rate
   */
  async current(coin: string): Promise<FundingRate> {
    const response = await this.http.get<ApiResponse<FundingRate>>(
      `/v1/funding/${coin.toUpperCase()}/current`,
      undefined,
      this.http.validationEnabled ? FundingRateResponseSchema : undefined
    );
    return response.data;
  }
}
