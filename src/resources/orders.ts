import type { HttpClient } from '../http';
import type { ApiResponse, CursorResponse, CursorPaginationParams } from '../types';

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
}
