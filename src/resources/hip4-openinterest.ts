import type { HttpClient } from '../http';
import type {
  ApiResponse,
  CursorResponse,
  Hip4OpenInterest,
  OpenInterestHistoryParams,
} from '../types';
import {
  Hip4OpenInterestArrayResponseSchema,
  Hip4OpenInterestResponseSchema,
} from '../schemas';

/**
 * HIP-4 per-side open interest API resource.
 *
 * HIP-4 has its own response contract because each record includes
 * `symbol`, `outcome_id`, and `side`. The generic `OpenInterestResource`
 * intentionally does not accept those family-specific fields.
 */
export class Hip4OpenInterestResource {
  constructor(
    private http: HttpClient,
    private basePath: string = '/v1/hyperliquid/hip4',
    private coinTransform: (coin: string) => string = encodeURIComponent,
  ) {}

  /**
   * Get per-side HIP-4 open interest history with cursor-based pagination.
   *
   * `markPrice` and `midPrice` are implied probabilities in [0, 1], not USD
   * prices. Data is served from May 2, 2026.
   */
  async history(
    symbol: string,
    params: OpenInterestHistoryParams,
  ): Promise<CursorResponse<Hip4OpenInterest[]>> {
    const response = await this.http.get<ApiResponse<Hip4OpenInterest[]>>(
      `${this.basePath}/openinterest/${this.coinTransform(symbol)}`,
      params as unknown as Record<string, unknown>,
      this.http.validationEnabled ? Hip4OpenInterestArrayResponseSchema : undefined,
    );
    return {
      data: response.data,
      nextCursor: response.meta.nextCursor,
    };
  }

  /** Get the current per-side HIP-4 open interest snapshot. */
  async current(symbol: string): Promise<Hip4OpenInterest> {
    const response = await this.http.get<ApiResponse<Hip4OpenInterest>>(
      `${this.basePath}/openinterest/${this.coinTransform(symbol)}/current`,
      undefined,
      this.http.validationEnabled ? Hip4OpenInterestResponseSchema : undefined,
    );
    return response.data;
  }
}
