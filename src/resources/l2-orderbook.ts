import type { HttpClient } from '../http';
import type { ApiResponse, CursorResponse, CursorPaginationParams } from '../types';

export interface L2OrderBookParams {
  timestamp?: number | string;
  depth?: number;
}

/**
 * L2 Full-Depth Order Book API resource (derived from L4 data)
 *
 * Access aggregated price-level orderbook snapshots, history, and tick-level diffs.
 * Data available from March 10, 2026.
 *
 * @example
 * ```typescript
 * // Get current full-depth L2 orderbook
 * const orderbook = await client.hyperliquid.l2Orderbook.get('BTC');
 *
 * // Get L2 orderbook at a historical timestamp
 * const historical = await client.hyperliquid.l2Orderbook.get('BTC', {
 *   timestamp: 1711900800000
 * });
 *
 * // Get L2 orderbook history
 * const history = await client.hyperliquid.l2Orderbook.history('BTC', {
 *   start: Date.now() - 86400000,
 *   end: Date.now(),
 *   limit: 100
 * });
 * ```
 */
export class L2OrderBookResource {
  constructor(
    private http: HttpClient,
    private basePath: string = '/v1',
    private coinTransform: (s: string) => string = (c) => c.toUpperCase(),
  ) {}

  /** Get full-depth L2 order book snapshot. */
  async get(symbol: string, params?: L2OrderBookParams): Promise<any> {
    const coin = this.coinTransform(symbol);
    const query: Record<string, unknown> = {};
    if (params?.timestamp != null) query.timestamp = params.timestamp;
    if (params?.depth != null) query.depth = params.depth;

    const resp: ApiResponse<any> = await this.http.get(
      `${this.basePath}/orderbook/${coin}/l2`,
      query,
    );
    return resp.data;
  }

  /** Get paginated L2 full-depth history. */
  async history(
    symbol: string,
    params: CursorPaginationParams & { depth?: number },
  ): Promise<CursorResponse<any[]>> {
    const coin = this.coinTransform(symbol);
    const resp: ApiResponse<any[]> & { meta?: { next_cursor?: string } } =
      await this.http.get(
        `${this.basePath}/orderbook/${coin}/l2/history`,
        params as unknown as Record<string, unknown>,
      );
    return {
      data: resp.data,
      nextCursor: resp.meta?.next_cursor ?? undefined,
    };
  }

  /** Get tick-level L2 order book diffs. */
  async diffs(
    symbol: string,
    params: CursorPaginationParams,
  ): Promise<CursorResponse<any[]>> {
    const coin = this.coinTransform(symbol);
    const resp: ApiResponse<any[]> & { meta?: { next_cursor?: string } } =
      await this.http.get(
        `${this.basePath}/orderbook/${coin}/l2/diffs`,
        params as unknown as Record<string, unknown>,
      );
    return {
      data: resp.data,
      nextCursor: resp.meta?.next_cursor ?? undefined,
    };
  }
}
