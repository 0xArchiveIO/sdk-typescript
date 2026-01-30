import type { HttpClient } from '../http';
import type { ApiResponse, CursorResponse, Liquidation, LiquidationHistoryParams, LiquidationsByUserParams } from '../types';
import { LiquidationArrayResponseSchema } from '../schemas';

/**
 * Liquidations API resource
 *
 * Retrieve historical liquidation events from Hyperliquid.
 *
 * Note: Liquidation data is available from May 25, 2025 onwards.
 *
 * @example
 * ```typescript
 * // Get recent liquidations for a coin
 * let result = await client.hyperliquid.liquidations.history('BTC', {
 *   start: Date.now() - 86400000,
 *   end: Date.now(),
 *   limit: 1000
 * });
 *
 * // Get all pages
 * const allLiquidations = [...result.data];
 * while (result.nextCursor) {
 *   result = await client.hyperliquid.liquidations.history('BTC', {
 *     start: Date.now() - 86400000,
 *     end: Date.now(),
 *     cursor: result.nextCursor,
 *     limit: 1000
 *   });
 *   allLiquidations.push(...result.data);
 * }
 *
 * // Get liquidations for a specific user
 * const userLiquidations = await client.hyperliquid.liquidations.byUser('0x1234...', {
 *   start: Date.now() - 86400000 * 7,
 *   end: Date.now()
 * });
 * ```
 */
export class LiquidationsResource {
  constructor(private http: HttpClient, private basePath: string = '/v1') {}

  /**
   * Get liquidation history for a coin with cursor-based pagination
   *
   * @param coin - The coin symbol (e.g., 'BTC', 'ETH')
   * @param params - Time range and cursor pagination parameters (start and end are required)
   * @returns CursorResponse with liquidation records and nextCursor for pagination
   */
  async history(coin: string, params: LiquidationHistoryParams): Promise<CursorResponse<Liquidation[]>> {
    const response = await this.http.get<ApiResponse<Liquidation[]>>(
      `${this.basePath}/liquidations/${coin.toUpperCase()}`,
      params as unknown as Record<string, unknown>,
      this.http.validationEnabled ? LiquidationArrayResponseSchema : undefined
    );
    return {
      data: response.data,
      nextCursor: response.meta.nextCursor,
    };
  }

  /**
   * Get liquidation history for a specific user
   *
   * This returns liquidations where the user was either:
   * - The liquidated party (their position was liquidated)
   * - The liquidator (they executed the liquidation)
   *
   * @param userAddress - User's wallet address (e.g., '0x1234...')
   * @param params - Time range and cursor pagination parameters (start and end are required)
   * @returns CursorResponse with liquidation records and nextCursor for pagination
   */
  async byUser(userAddress: string, params: LiquidationsByUserParams): Promise<CursorResponse<Liquidation[]>> {
    const response = await this.http.get<ApiResponse<Liquidation[]>>(
      `${this.basePath}/liquidations/user/${userAddress}`,
      params as unknown as Record<string, unknown>,
      this.http.validationEnabled ? LiquidationArrayResponseSchema : undefined
    );
    return {
      data: response.data,
      nextCursor: response.meta.nextCursor,
    };
  }
}
