import type { HttpClient } from '../http';
import type {
  ApiResponse,
  CursorResponse,
  CursorPaginationParams,
  LevelsHistoryParams,
  TriggerLevels,
  TriggerLevelsHistoryItem,
  TriggerLevelsParams,
} from '../types';
import { TriggerLevelsHistoryResponseSchema, TriggerLevelsResponseSchema } from '../schemas';

export interface OrderHistoryParams extends CursorPaginationParams {
  user?: string;
  status?: string;
  order_type?: string;
}

export interface OrderFlowParams {
  start: number | string;
  end: number | string;
  interval?: string;
  limit?: number;
}

export interface TpslParams extends CursorPaginationParams {
  user?: string;
  triggered?: boolean;
}

/**
 * Orders API resource
 *
 * @example
 * ```typescript
 * // Get order history
 * const result = await client.hyperliquid.orders.history('BTC', {
 *   start: Date.now() - 86400000,
 *   end: Date.now(),
 *   limit: 1000
 * });
 *
 * // Get order flow
 * const flow = await client.hyperliquid.orders.flow('BTC', {
 *   start: Date.now() - 86400000,
 *   end: Date.now(),
 *   interval: '1h'
 * });
 *
 * // Get TP/SL orders
 * const tpsl = await client.hyperliquid.orders.tpsl('BTC', {
 *   start: Date.now() - 86400000,
 *   end: Date.now()
 * });
 * ```
 */
export class OrdersResource {
  constructor(
    private http: HttpClient,
    private basePath: string = '/v1',
    private coinTransform: (s: string) => string = (c) => c.toUpperCase()
  ) {}

  /**
   * Get order history for a symbol with cursor-based pagination
   *
   * @param symbol - The symbol (e.g., 'BTC', 'ETH')
   * @param params - Time range, cursor pagination, and filter parameters
   * @returns CursorResponse with order records and nextCursor for pagination
   */
  async history(symbol: string, params: OrderHistoryParams): Promise<CursorResponse<any[]>> {
    const response = await this.http.get<ApiResponse<any[]>>(
      `${this.basePath}/orders/${this.coinTransform(symbol)}/history`,
      params as unknown as Record<string, unknown>
    );
    return { data: response.data, nextCursor: response.meta.nextCursor };
  }

  /**
   * Get order flow for a symbol
   *
   * @param symbol - The symbol (e.g., 'BTC', 'ETH')
   * @param params - Time range and interval parameters
   * @returns CursorResponse with order flow records
   */
  async flow(symbol: string, params: OrderFlowParams): Promise<CursorResponse<any[]>> {
    const response = await this.http.get<ApiResponse<any[]>>(
      `${this.basePath}/orders/${this.coinTransform(symbol)}/flow`,
      params as unknown as Record<string, unknown>
    );
    return { data: response.data, nextCursor: response.meta.nextCursor };
  }

  /**
   * Get TP/SL orders for a symbol with cursor-based pagination
   *
   * @param symbol - The symbol (e.g., 'BTC', 'ETH')
   * @param params - Time range, cursor pagination, and filter parameters
   * @returns CursorResponse with TP/SL order records
   */
  async tpsl(symbol: string, params: TpslParams): Promise<CursorResponse<any[]>> {
    const response = await this.http.get<ApiResponse<any[]>>(
      `${this.basePath}/orders/${this.coinTransform(symbol)}/tpsl`,
      params as unknown as Record<string, unknown>
    );
    return { data: response.data, nextCursor: response.meta.nextCursor };
  }

  /**
   * Get the pending trigger-order map for a symbol
   *
   * Currently pending stop-loss and take-profit trigger orders grouped into
   * price buckets near the current mid/mark price. Voluntary trigger orders,
   * not projected forced liquidations (see `liquidations.levels` for those).
   * The response's `asOf` is the server read time.
   *
   * @param symbol - The symbol (e.g., 'BTC', or 'xyz:TSLA' on HIP-3)
   * @param params - Range, bucket count, and side filter
   * @returns Trigger-levels map for the current state
   */
  async triggerLevels(symbol: string, params?: TriggerLevelsParams): Promise<TriggerLevels> {
    const response = await this.http.get<ApiResponse<TriggerLevels>>(
      `${this.basePath}/orders/${this.coinTransform(symbol)}/trigger-levels`,
      params as unknown as Record<string, unknown>,
      this.http.validationEnabled ? TriggerLevelsResponseSchema : undefined
    );
    return response.data;
  }

  /**
   * Get historical trigger-levels snapshots with cursor pagination
   *
   * Ascending by snapshot time (15-minute cadence, retained from 2026-07-27).
   * Pass `summary: true` to list snapshots without histograms.
   *
   * @param symbol - The symbol (e.g., 'BTC', or 'xyz:TSLA' on HIP-3)
   * @param params - Time range, cursor pagination, summary, and re-binning parameters
   * @returns CursorResponse with snapshots and nextCursor for pagination
   */
  async triggerLevelsHistory(
    symbol: string,
    params?: LevelsHistoryParams
  ): Promise<CursorResponse<TriggerLevelsHistoryItem[]>> {
    const response = await this.http.get<ApiResponse<TriggerLevelsHistoryItem[]>>(
      `${this.basePath}/orders/${this.coinTransform(symbol)}/trigger-levels/history`,
      params as unknown as Record<string, unknown>,
      this.http.validationEnabled ? TriggerLevelsHistoryResponseSchema : undefined
    );
    return {
      data: response.data,
      nextCursor: response.meta.nextCursor,
    };
  }
}
