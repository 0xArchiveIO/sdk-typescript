import type { HttpClient } from '../http';
import type { ApiResponse, WalletClassification, WalletClassifyParams } from '../types';
import { WalletClassificationResponseSchema } from '../schemas';

/**
 * Wallet classification: precomputed daily behavioral metrics for active
 * wallets (order and fill counts, cancel and fill rates, maker ratio, volume,
 * fees, realized PnL, TWAP and priority-gas usage and more), with filtering,
 * sorting and offset paging. Hyperliquid core and HIP-3.
 *
 * Wallet positions and account summaries are on `positions`.
 *
 * @example
 * ```typescript
 * const page = await client.hyperliquid.wallets.classify({
 *   sort: 'total_volume_usd',
 *   min_orders: 1000,
 *   limit: 100,
 * });
 * console.log(`${page.total} wallets on ${page.date}`);
 * for (const w of page.wallets) console.log(w.address, w.metrics.makerRatio);
 * ```
 */
export class WalletsResource {
  constructor(
    private http: HttpClient,
    private basePath: string = '/v1/hyperliquid'
  ) {}

  /**
   * Classify active wallets for one daily snapshot (yesterday by default).
   *
   * Page with `offset` (capped at 100000) and `limit` (1 to 1000) against
   * `total`.
   *
   * @param params - Filters, sort, page and snapshot date, in the API's parameter names
   */
  async classify(params: WalletClassifyParams = {}): Promise<WalletClassification> {
    const response = await this.http.get<ApiResponse<WalletClassification>>(
      `${this.basePath}/wallets/classify`,
      params as unknown as Record<string, unknown>,
      this.http.validationEnabled ? WalletClassificationResponseSchema : undefined
    );
    return response.data;
  }
}
