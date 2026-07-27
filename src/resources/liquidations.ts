import type { HttpClient } from '../http';
import type {
  ApiResponse,
  CursorResponse,
  LevelsHistoryParams,
  Liquidation,
  LiquidationHistoryParams,
  LiquidationLevels,
  LiquidationLevelsHistoryItem,
  LiquidationLevelsParams,
  LiquidationsByUserParams,
  LiquidationVolume,
  LiquidationVolumeParams,
} from '../types';
import {
  LiquidationArrayResponseSchema,
  LiquidationLevelsHistoryResponseSchema,
  LiquidationLevelsResponseSchema,
  LiquidationVolumeArrayResponseSchema,
} from '../schemas';

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
  constructor(
    private http: HttpClient,
    private basePath: string = '/v1',
    private coinTransform: (coin: string) => string = (c) => c.toUpperCase()
  ) {}

  /**
   * Get liquidation history for a symbol with cursor-based pagination
   *
   * @param symbol - The symbol (e.g., 'BTC', 'ETH')
   * @param params - Time range and cursor pagination parameters (start and end are required)
   * @returns CursorResponse with liquidation records and nextCursor for pagination
   */
  async history(symbol: string, params: LiquidationHistoryParams): Promise<CursorResponse<Liquidation[]>> {
    const response = await this.http.get<ApiResponse<Liquidation[]>>(
      `${this.basePath}/liquidations/${this.coinTransform(symbol)}`,
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

  /**
   * Get aggregated liquidation volume in time-bucketed intervals
   *
   * Returns pre-aggregated data with total/long/short USD volumes per bucket,
   * reducing data transfer by 100-1000x compared to individual liquidation records.
   *
   * @param symbol - The symbol (e.g., 'BTC', 'ETH')
   * @param params - Time range, cursor, and interval parameters
   * @returns CursorResponse with liquidation volume buckets
   */
  async volume(symbol: string, params: LiquidationVolumeParams): Promise<CursorResponse<LiquidationVolume[]>> {
    const response = await this.http.get<ApiResponse<LiquidationVolume[]>>(
      `${this.basePath}/liquidations/${this.coinTransform(symbol)}/volume`,
      params as unknown as Record<string, unknown>,
      this.http.validationEnabled ? LiquidationVolumeArrayResponseSchema as any : undefined
    );
    return {
      data: response.data,
      nextCursor: response.meta.nextCursor,
    };
  }

  /**
   * Get projected forced-liquidation levels for a symbol
   *
   * Computed from clearinghouse positions and margin state, bucketed around
   * the snapshot mark price. Snapshots refresh roughly every 45 minutes;
   * pass `at` (epoch ms) for a point-in-time read. History begins 2026-07-27.
   *
   * Note: these are projected forced liquidations, not the pending
   * trigger-order map (see `orders.triggerLevels` for that).
   *
   * @param symbol - The symbol (e.g., 'BTC', or 'xyz:TSLA' on HIP-3)
   * @param params - Range, bucket count, side filter, and optional at
   * @returns Liquidation levels for one snapshot
   */
  async levels(symbol: string, params?: LiquidationLevelsParams): Promise<LiquidationLevels> {
    const response = await this.http.get<ApiResponse<LiquidationLevels>>(
      `${this.basePath}/liquidations/${this.coinTransform(symbol)}/levels`,
      params as unknown as Record<string, unknown>,
      this.http.validationEnabled ? LiquidationLevelsResponseSchema : undefined
    );
    return response.data;
  }

  /**
   * Get historical liquidation-levels snapshots with cursor pagination
   *
   * Ascending by snapshot time (about every 45 minutes, retained from
   * 2026-07-27). Pass `summary: true` to list snapshots without histograms.
   *
   * @param symbol - The symbol (e.g., 'BTC', or 'xyz:TSLA' on HIP-3)
   * @param params - Time range, cursor pagination, summary, and re-binning parameters
   * @returns CursorResponse with snapshots and nextCursor for pagination
   */
  async levelsHistory(
    symbol: string,
    params?: LevelsHistoryParams
  ): Promise<CursorResponse<LiquidationLevelsHistoryItem[]>> {
    const response = await this.http.get<ApiResponse<LiquidationLevelsHistoryItem[]>>(
      `${this.basePath}/liquidations/${this.coinTransform(symbol)}/levels/history`,
      params as unknown as Record<string, unknown>,
      this.http.validationEnabled ? LiquidationLevelsHistoryResponseSchema : undefined
    );
    return {
      data: response.data,
      nextCursor: response.meta.nextCursor,
    };
  }
}
