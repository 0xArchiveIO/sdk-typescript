import type { HttpClient } from '../http';
import type {
  ApiResponse,
  CursorResponse,
  LighterLiquidation,
  LighterLiquidationVolume,
  LiquidationHistoryParams,
  LiquidationVolumeParams,
} from '../types';
import {
  LighterLiquidationArrayResponseSchema,
  LighterLiquidationVolumeArrayResponseSchema,
} from '../schemas';

/**
 * Lighter liquidations, on both deployments: `client.lighter.liquidations`
 * (mainnet) and `client.rhLighter.liquidations` (Robinhood Chain).
 *
 * Rows are Lighter liquidation trades (`LighterLiquidation`), which name both
 * accounts of the trade and each side's state before it, rather than the
 * Hyperliquid `Liquidation` shape. Volume buckets carry the total notional
 * and the count (`LighterLiquidationVolume`).
 *
 * Robinhood Chain liquidations start at the venue launch (2026-06-26 20:10:26
 * UTC), the same floor as its trades. Rows from before live capture were
 * backfilled from the venue's finalized export and have `source: 'bucket'`
 * and an empty `rawJson`; rows captured live have `source: 'ws'` and the
 * venue's raw JSON in `rawJson`.
 *
 * @example
 * ```typescript
 * let page = await client.rhLighter.liquidations.history('BTC', {
 *   start: Date.now() - 86_400_000,
 *   end: Date.now(),
 *   limit: 1000,
 * });
 * while (page.nextCursor) {
 *   page = await client.rhLighter.liquidations.history('BTC', {
 *     start: Date.now() - 86_400_000,
 *     end: Date.now(),
 *     cursor: page.nextCursor,
 *     limit: 1000,
 *   });
 * }
 *
 * const hourly = await client.lighter.liquidations.volume('ETH', {
 *   start: Date.now() - 7 * 86_400_000,
 *   end: Date.now(),
 *   interval: '1h',
 * });
 * ```
 */
export class LighterLiquidationsResource {
  constructor(
    private http: HttpClient,
    private basePath: string = '/v1/lighter',
    private coinTransform: (coin: string) => string = (c) => c.toUpperCase(),
  ) {}

  /**
   * Liquidation trades for a market with cursor pagination.
   *
   * @param symbol - Market symbol (e.g. 'BTC')
   * @param params - Time range and cursor pagination (start and end are required)
   */
  async history(
    symbol: string,
    params: LiquidationHistoryParams,
  ): Promise<CursorResponse<LighterLiquidation[]>> {
    const response = await this.http.get<ApiResponse<LighterLiquidation[]>>(
      `${this.basePath}/liquidations/${this.coinTransform(symbol)}`,
      params as unknown as Record<string, unknown>,
      this.http.validationEnabled ? LighterLiquidationArrayResponseSchema : undefined,
    );
    return {
      data: response.data,
      nextCursor: response.meta.nextCursor,
      meta: response.meta,
    };
  }

  /**
   * Liquidation volume in time buckets (default `1h`; `5m`, `15m`, `30m`,
   * `1h`, `4h`, `1d`).
   *
   * @param symbol - Market symbol (e.g. 'BTC')
   * @param params - Time range, cursor pagination and interval
   */
  async volume(
    symbol: string,
    params: LiquidationVolumeParams,
  ): Promise<CursorResponse<LighterLiquidationVolume[]>> {
    const response = await this.http.get<ApiResponse<LighterLiquidationVolume[]>>(
      `${this.basePath}/liquidations/${this.coinTransform(symbol)}/volume`,
      params as unknown as Record<string, unknown>,
      this.http.validationEnabled ? LighterLiquidationVolumeArrayResponseSchema : undefined,
    );
    return {
      data: response.data,
      nextCursor: response.meta.nextCursor,
      meta: response.meta,
    };
  }
}
