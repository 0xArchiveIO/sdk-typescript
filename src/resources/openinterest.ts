import type { HttpClient } from '../http';
import type { ApiResponse, CursorResponse, OpenInterest, OpenInterestHistoryParams } from '../types';
import { OpenInterestResponseSchema, OpenInterestArrayResponseSchema } from '../schemas';

/**
 * Open interest API resource
 *
 * @example
 * ```typescript
 * // Get current open interest
 * const current = await client.openInterest.current('BTC');
 *
 * // Get open interest history with cursor-based pagination
 * let result = await client.openInterest.history('ETH', {
 *   start: Date.now() - 86400000,
 *   end: Date.now(),
 *   limit: 1000
 * });
 *
 * // Get all pages
 * const allRecords = [...result.data];
 * while (result.nextCursor) {
 *   result = await client.openInterest.history('ETH', {
 *     start: Date.now() - 86400000,
 *     end: Date.now(),
 *     cursor: result.nextCursor,
 *     limit: 1000
 *   });
 *   allRecords.push(...result.data);
 * }
 * ```
 */
export class OpenInterestResource {
  constructor(
    private http: HttpClient,
    private basePath: string = '/v1',
    private coinTransform: (coin: string) => string = (c) => c.toUpperCase()
  ) {}

  /**
   * Get open interest history for a symbol with cursor-based pagination
   *
   * @param symbol - The symbol (e.g., 'BTC', 'ETH')
   * @param params - Time range and cursor pagination parameters (start and end are required)
   * @returns CursorResponse with open interest records and nextCursor for pagination
   */
  async history(symbol: string, params: OpenInterestHistoryParams): Promise<CursorResponse<OpenInterest[]>> {
    const response = await this.http.get<ApiResponse<OpenInterest[]>>(
      `${this.basePath}/openinterest/${this.coinTransform(symbol)}`,
      params as unknown as Record<string, unknown>,
      this.http.validationEnabled ? OpenInterestArrayResponseSchema : undefined
    );
    return {
      data: response.data,
      nextCursor: response.meta.nextCursor,
    };
  }

  /**
   * Get current open interest for a symbol
   *
   * @param symbol - The symbol (e.g., 'BTC', 'ETH')
   * @returns Current open interest
   */
  async current(symbol: string): Promise<OpenInterest> {
    const response = await this.http.get<ApiResponse<OpenInterest>>(
      `${this.basePath}/openinterest/${this.coinTransform(symbol)}/current`,
      undefined,
      this.http.validationEnabled ? OpenInterestResponseSchema : undefined
    );
    return response.data;
  }
}
