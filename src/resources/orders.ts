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

/**
 * Order history filters, sent in the API's parameter names. Hyperliquid core,
 * HIP-3 and HIP-4 only: Spot order history takes no filters.
 */
export interface OrderHistoryParams extends CursorPaginationParams {
  user?: string;
  status?: string;
  order_type?: string;
}

export interface OrderFlowParams {
  start: number | string;
  end: number | string;
  /** Bucket width: '1m' (default), '5m', '15m' or '1h'. */
  interval?: string;
  /**
   * The previous response's `nextCursor`. The page starts at the bucket
   * after it; send it with the same `start`, `end` and `interval`.
   */
  cursor?: number | string;
  /** Buckets per page (default 1000, max 10000). */
  limit?: number;
}

export interface TpslParams extends CursorPaginationParams {
  user?: string;
  triggered?: boolean;
}

/**
 * Order lifecycle history, the order route Hyperliquid Spot serves
 * (`client.spot.orders`). Spot order history takes the time range and
 * cursor only.
 *
 * @example
 * ```typescript
 * const result = await client.spot.orders.history('HYPE-USDC', {
 *   start: Date.now() - 3600000,
 *   end: Date.now(),
 *   limit: 1000
 * });
 * ```
 */
export class OrderHistoryResource<P extends CursorPaginationParams = CursorPaginationParams> {
  constructor(
    protected http: HttpClient,
    protected basePath: string = '/v1',
    protected coinTransform: (s: string) => string = (c) => c.toUpperCase()
  ) {}

  /**
   * Get order history for a symbol with cursor-based pagination
   *
   * @param symbol - The symbol (e.g., 'BTC', 'ETH')
   * @param params - Time range, cursor pagination, and filter parameters where the family supports them
   * @returns CursorResponse with order records and nextCursor for pagination
   */
  async history(symbol: string, params: P): Promise<CursorResponse<any[]>> {
    const response = await this.http.get<ApiResponse<any[]>>(
      `${this.basePath}/orders/${this.coinTransform(symbol)}/history`,
      params as unknown as Record<string, unknown>
    );
    return { data: response.data, nextCursor: response.meta.nextCursor };
  }
}

/**
 * Order history with filters, order flow and TP/SL orders, the order routes
 * HIP-4 serves (`client.hyperliquid.hip4.orders`). Trigger levels are on
 * Hyperliquid core and HIP-3 only.
 */
export class OrderFlowResource extends OrderHistoryResource<OrderHistoryParams> {
  /**
   * Get order flow for a symbol, one page of time buckets
   *
   * Buckets are labelled by their open time in UTC, and buckets with no
   * events are omitted. A page holds the oldest `limit` buckets of the
   * window; while `nextCursor` is set, pass it back as `cursor` with the
   * same `start`, `end` and `interval`, and stop when it is undefined.
   *
   * @param symbol - The symbol (e.g., 'BTC', 'ETH')
   * @param params - Time range, interval, and cursor pagination parameters
   * @returns CursorResponse with order flow buckets and nextCursor for pagination
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

/**
 * Orders API resource: history, flow, TP/SL and trigger levels, the order
 * routes Hyperliquid core and HIP-3 serve.
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
export class OrdersResource extends OrderFlowResource {
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
