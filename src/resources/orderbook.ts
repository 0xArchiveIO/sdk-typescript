import type { HttpClient } from '../http';
import type {
  ApiResponse,
  CursorResponse,
  OrderBook,
  GetOrderBookParams,
  OrderBookHistoryParams,
  OrderbookDelta,
} from '../types';
import { OrderBookResponseSchema, OrderBookArrayResponseSchema } from '../schemas';
import {
  OrderBookReconstructor,
  type TickData,
  type ReconstructedOrderBook,
  type ReconstructOptions,
} from '../orderbook-reconstructor';

/**
 * Parameters for tick-level orderbook history (Enterprise tier only)
 */
export interface TickHistoryParams {
  /** Start timestamp (Unix ms or ISO string) - REQUIRED */
  start: number | string;
  /** End timestamp (Unix ms or ISO string) - REQUIRED */
  end: number | string;
  /** Number of price levels in checkpoint (default: all) */
  depth?: number;
}

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
 *
 * // Enterprise: Get tick-level data with reconstruction
 * const snapshots = await client.lighter.orderbook.historyReconstructed('BTC', {
 *   start: Date.now() - 3600000,
 *   end: Date.now()
 * });
 *
 * // Enterprise: Get raw tick data for custom reconstruction
 * const tickData = await client.lighter.orderbook.historyTick('BTC', {
 *   start: Date.now() - 3600000,
 *   end: Date.now()
 * });
 * ```
 */
export class OrderBookResource {
  constructor(private http: HttpClient, private basePath: string = '/v1') {}

  /**
   * Get order book snapshot for a coin
   *
   * @param coin - The coin symbol (e.g., 'BTC', 'ETH')
   * @param params - Optional parameters
   * @returns Order book snapshot
   */
  async get(coin: string, params?: GetOrderBookParams): Promise<OrderBook> {
    const response = await this.http.get<ApiResponse<OrderBook>>(
      `${this.basePath}/orderbook/${coin.toUpperCase()}`,
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
      `${this.basePath}/orderbook/${coin.toUpperCase()}/history`,
      params as unknown as Record<string, unknown>,
      this.http.validationEnabled ? OrderBookArrayResponseSchema : undefined
    );
    return {
      data: response.data,
      nextCursor: response.meta.nextCursor,
    };
  }

  /**
   * Get raw tick-level orderbook data (Enterprise tier only).
   *
   * Returns a checkpoint (full orderbook state) and array of deltas.
   * Use this when you want to implement custom reconstruction logic
   * (e.g., in Rust for maximum performance).
   *
   * For automatic reconstruction, use `historyReconstructed()` instead.
   *
   * @param coin - The coin symbol (e.g., 'BTC', 'ETH')
   * @param params - Time range parameters
   * @returns Tick data with checkpoint and deltas
   *
   * @example
   * ```typescript
   * const tickData = await client.lighter.orderbook.historyTick('BTC', {
   *   start: Date.now() - 3600000,
   *   end: Date.now()
   * });
   *
   * console.log('Checkpoint:', tickData.checkpoint);
   * console.log('Deltas:', tickData.deltas.length);
   *
   * // Implement your own reconstruction...
   * for (const delta of tickData.deltas) {
   *   // delta: { timestamp, side, price, size, sequence }
   * }
   * ```
   */
  async historyTick(
    coin: string,
    params: TickHistoryParams
  ): Promise<TickData> {
    const response = await this.http.get<{
      success: boolean;
      checkpoint?: OrderBook;
      deltas?: OrderbookDelta[];
      granularity?: string;
      error?: string;
      message?: string;
    }>(
      `${this.basePath}/orderbook/${coin.toUpperCase()}/history`,
      {
        ...params,
        granularity: 'tick',
      } as Record<string, unknown>
    );

    // Check if tick-level data was returned
    if (!response.checkpoint || !response.deltas) {
      const errorMsg = response.error || response.message ||
        'Tick-level orderbook data requires Enterprise tier. ' +
        'Upgrade your subscription or use a different granularity.';
      throw new Error(errorMsg);
    }

    return {
      checkpoint: response.checkpoint,
      deltas: response.deltas,
    };
  }

  /**
   * Get reconstructed tick-level orderbook history (Enterprise tier only).
   *
   * Fetches raw tick data and reconstructs full orderbook state at each delta.
   * All reconstruction happens client-side for optimal server performance.
   *
   * For large time ranges, consider using `historyTick()` with the
   * `OrderBookReconstructor.iterate()` method for memory efficiency.
   *
   * @param coin - The coin symbol (e.g., 'BTC', 'ETH')
   * @param params - Time range parameters
   * @param options - Reconstruction options
   * @returns Array of reconstructed orderbook snapshots
   *
   * @example
   * ```typescript
   * // Get all snapshots
   * const snapshots = await client.lighter.orderbook.historyReconstructed('BTC', {
   *   start: Date.now() - 3600000,
   *   end: Date.now()
   * });
   *
   * for (const ob of snapshots) {
   *   console.log(ob.timestamp, 'Best bid:', ob.bids[0]?.px, 'Best ask:', ob.asks[0]?.px);
   * }
   *
   * // Get only final state
   * const [final] = await client.lighter.orderbook.historyReconstructed('BTC',
   *   { start, end },
   *   { emitAll: false }
   * );
   * ```
   */
  async historyReconstructed(
    coin: string,
    params: TickHistoryParams,
    options: ReconstructOptions = {}
  ): Promise<ReconstructedOrderBook[]> {
    const tickData = await this.historyTick(coin, params);
    const reconstructor = new OrderBookReconstructor();
    return reconstructor.reconstructAll(tickData.checkpoint, tickData.deltas, options);
  }

  /**
   * Create a reconstructor for streaming tick-level data.
   *
   * Returns an OrderBookReconstructor instance that you can use
   * to process tick data incrementally or with custom logic.
   *
   * @returns A new OrderBookReconstructor instance
   *
   * @example
   * ```typescript
   * const reconstructor = client.lighter.orderbook.createReconstructor();
   * const tickData = await client.lighter.orderbook.historyTick('BTC', { start, end });
   *
   * // Memory-efficient iteration
   * for (const snapshot of reconstructor.iterate(tickData.checkpoint, tickData.deltas)) {
   *   // Process each snapshot
   *   if (someCondition(snapshot)) break; // Early exit if needed
   * }
   *
   * // Check for gaps
   * const gaps = OrderBookReconstructor.detectGaps(tickData.deltas);
   * if (gaps.length > 0) {
   *   console.warn('Sequence gaps detected:', gaps);
   * }
   * ```
   */
  createReconstructor(): OrderBookReconstructor {
    return new OrderBookReconstructor();
  }
}
