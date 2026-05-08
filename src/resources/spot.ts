import type { HttpClient } from '../http';
import type {
  ApiResponse,
  CursorResponse,
  CursorPaginationParams,
  SpotPair,
  SpotTwapStatus,
} from '../types';

/**
 * Hyperliquid Spot pairs API resource.
 *
 * Pairs are the spot equivalent of HIP-3 / Hyperliquid `instruments`. Symbols
 * are dashed canonical (`HYPE-USDC`, `PURR-USDC`); the server resolves the
 * dashed form to Hyperliquid's wire formats (`PURR/USDC`, `@107`) internally.
 *
 * @example
 * ```typescript
 * const pairs = await client.spot.pairs.list();
 * const hype = await client.spot.pairs.get('HYPE-USDC');
 * ```
 */
export class SpotPairsResource {
  constructor(
    private http: HttpClient,
    private basePath: string = '/v1/hyperliquid/spot',
    private coinTransform: (s: string) => string = (c) => c.toUpperCase(),
  ) {}

  /** List every active spot pair. */
  async list(): Promise<SpotPair[]> {
    const response = await this.http.get<ApiResponse<SpotPair[]>>(
      `${this.basePath}/pairs`,
    );
    return response.data;
  }

  /**
   * Get a specific spot pair by dashed symbol (e.g. `HYPE-USDC`).
   */
  async get(symbol: string): Promise<SpotPair> {
    const response = await this.http.get<ApiResponse<SpotPair>>(
      `${this.basePath}/pairs/${this.coinTransform(symbol)}`,
    );
    return response.data;
  }
}

/**
 * Hyperliquid Spot TWAP statuses.
 *
 * TWAP statuses come from the L4 order stream (Singapore node). They can be
 * looked up by symbol (every TWAP touching this pair) or by user wallet
 * address (every TWAP this user has placed across all spot pairs).
 *
 * Live coverage from 2026-05-05.
 *
 * @example
 * ```typescript
 * const bySymbol = await client.spot.twap.bySymbol('HYPE-USDC', {
 *   start: Date.now() - 86_400_000,
 *   end: Date.now(),
 * });
 * const byUser = await client.spot.twap.byUser('0xabc...', {
 *   start: Date.now() - 86_400_000,
 *   end: Date.now(),
 * });
 * ```
 */
export class SpotTwapResource {
  constructor(
    private http: HttpClient,
    private basePath: string = '/v1/hyperliquid/spot',
    private coinTransform: (s: string) => string = (c) => c.toUpperCase(),
  ) {}

  /** TWAP statuses for a single spot pair. */
  async bySymbol(
    symbol: string,
    params: CursorPaginationParams,
  ): Promise<CursorResponse<SpotTwapStatus[]>> {
    const response = await this.http.get<ApiResponse<SpotTwapStatus[]>>(
      `${this.basePath}/twap/${this.coinTransform(symbol)}`,
      params as unknown as Record<string, unknown>,
    );
    return { data: response.data, nextCursor: response.meta.nextCursor };
  }

  /** TWAP statuses for a single user wallet across every spot pair. */
  async byUser(
    user: string,
    params: CursorPaginationParams,
  ): Promise<CursorResponse<SpotTwapStatus[]>> {
    const response = await this.http.get<ApiResponse<SpotTwapStatus[]>>(
      `${this.basePath}/twap/user/${user}`,
      params as unknown as Record<string, unknown>,
    );
    return { data: response.data, nextCursor: response.meta.nextCursor };
  }
}
