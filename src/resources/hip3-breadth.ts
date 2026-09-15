import type { HttpClient } from '../http';
import type {
  ApiResponse,
  CursorResponse,
  Hip3BreadthHistoryParams,
  Hip3BreadthSnapshot,
} from '../types';
import {
  Hip3BreadthArrayResponseSchema,
  Hip3BreadthResponseSchema,
} from '../schemas';

/**
 * HIP-3 market breadth above the current UTC-session VWAP.
 *
 * The aggregate is available from the current route and from history beginning
 * 2026-08-28. When no instruments are eligible, `valuePct` is `null`, not 0.
 */
export class Hip3BreadthResource {
  constructor(
    private http: HttpClient,
    private basePath: string = '/v1/hyperliquid/hip3',
  ) {}

  /** Get the latest validated HIP-3 breadth snapshot. */
  async current(): Promise<Hip3BreadthSnapshot> {
    const response = await this.http.get<ApiResponse<Hip3BreadthSnapshot>>(
      `${this.basePath}/breadth/above-vwap/current`,
      undefined,
      this.http.validationEnabled ? Hip3BreadthResponseSchema : undefined,
    );
    return response.data;
  }

  /**
   * Get historical HIP-3 breadth snapshots in ascending calculation order.
   *
   * The route is aggregate-only. Downsampled intervals select the last stored
   * snapshot in each bucket rather than averaging percentages whose eligible
   * denominators may vary.
   */
  async history(
    params: Hip3BreadthHistoryParams = {},
  ): Promise<CursorResponse<Hip3BreadthSnapshot[]>> {
    if (params.limit !== undefined &&
      (!Number.isInteger(params.limit) || params.limit < 1 || params.limit > 1000)) {
      throw new Error('limit must be between 1 and 1000');
    }

    const response = await this.http.get<ApiResponse<Hip3BreadthSnapshot[]>>(
      `${this.basePath}/breadth/above-vwap`,
      params as unknown as Record<string, unknown>,
      this.http.validationEnabled ? Hip3BreadthArrayResponseSchema : undefined,
    );
    return {
      data: response.data,
      nextCursor: response.meta.nextCursor,
    };
  }
}
