import type { HttpClient } from '../http';
import type {
  ApiResponse,
  CursorResponse,
  OrderBook,
  GetOrderBookParams,
  OrderBookHistoryParams,
} from '../types';
import { OrderBookResponseSchema, OrderBookArrayResponseSchema } from '../schemas';

/**
 * Order book API resource
 *
 * @example
 * ```typescript
 * // Get current order book
 * const orderbook = await client.orderbook.get('BTC');
 *
 * // Get order book at specific timestamp
 * const historical = await client.orderbook.get('ETH', {
 *   timestamp: 1704067200000,
 *   depth: 10
 * });
 *
 * // Get order book history
 * const history = await client.orderbook.history('BTC', {
 *   start: Date.now() - 86400000,
 *   end: Date.now(),
 *   limit: 100
 * });
 * ```
 */
export class OrderBookResource {
  constructor(private http: HttpClient) {}

  /**
   * Get order book snapshot for a coin
   *
   * @param coin - The coin symbol (e.g., 'BTC', 'ETH')
   * @param params - Optional parameters
   * @returns Order book snapshot
   */
  async get(coin: string, params?: GetOrderBookParams): Promise<OrderBook> {
    const response = await this.http.get<ApiResponse<OrderBook>>(
      `/v1/orderbook/${coin.toUpperCase()}`,
      params as Record<string, unknown>,
      this.http.validationEnabled ? OrderBookResponseSchema : undefined
    );
    return response.data;
  }

  /**
   * Get historical order book snapshots with cursor-based pagination
   *
   * @param coin - The coin symbol (e.g., 'BTC', 'ETH')
   * @param params - Time range and cursor pagination parameters (start and end are required)
   * @returns CursorResponse with order book snapshots and nextCursor for pagination
   *
   * @example
   * ```typescript
   * // First page
   * let result = await client.orderbook.history('BTC', {
   *   start: Date.now() - 86400000,
   *   end: Date.now(),
   *   limit: 1000
   * });
   *
   * // Subsequent pages
   * while (result.nextCursor) {
   *   result = await client.orderbook.history('BTC', {
   *     start: Date.now() - 86400000,
   *     end: Date.now(),
   *     cursor: result.nextCursor,
   *     limit: 1000
   *   });
   * }
   * ```
   */
  async history(
    coin: string,
    params: OrderBookHistoryParams
  ): Promise<CursorResponse<OrderBook[]>> {
    const response = await this.http.get<ApiResponse<OrderBook[]>>(
      `/v1/orderbook/${coin.toUpperCase()}/history`,
      params as unknown as Record<string, unknown>,
      this.http.validationEnabled ? OrderBookArrayResponseSchema : undefined
    );
    return {
      data: response.data,
      nextCursor: response.meta.nextCursor,
    };
  }
}
