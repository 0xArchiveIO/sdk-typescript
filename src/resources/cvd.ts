import type { HttpClient } from '../http';
import type { ApiResponse, CursorResponse, CvdBucket, CvdParams } from '../types';
import { CvdBucketArrayResponseSchema } from '../schemas';

/**
 * Cumulative volume delta (CVD): taker buy and sell notional per time bucket,
 * their difference, and a running total. Hyperliquid core and HIP-3.
 *
 * Buckets are labelled by their open time in UTC and are omitted when they
 * hold no trades. A page holds up to `limit` buckets (default 500, max
 * 10000). While `nextCursor` is set, pass it back unchanged as `cursor` with
 * the same `start`, `end` and `interval`, and stop when it is undefined. Below
 * `1h` a page can hold fewer than `limit` buckets and still carry a cursor, so
 * stop on the cursor, not on a short page.
 *
 * `cumulativeDelta` runs from the first bucket of each response, so it
 * restarts on every page; rebuild it from `delta` when joining pages.
 *
 * @example
 * ```typescript
 * const window = { start: Date.now() - 86_400_000, end: Date.now(), interval: '5m' as const };
 * const buckets = [];
 * let page = await client.hyperliquid.cvd.history('BTC', window);
 * buckets.push(...page.data);
 * while (page.nextCursor) {
 *   page = await client.hyperliquid.cvd.history('BTC', { ...window, cursor: page.nextCursor });
 *   buckets.push(...page.data);
 * }
 * let running = 0;
 * const cvd = buckets.map((b) => ({ timestamp: b.timestamp, cvd: (running += b.delta) }));
 * ```
 */
export class CvdResource {
  constructor(
    private http: HttpClient,
    private basePath: string = '/v1/hyperliquid',
    private coinTransform: (s: string) => string = (c) => c.toUpperCase()
  ) {}

  /**
   * Get one page of CVD buckets for a symbol.
   *
   * Without `start` or `cursor`, returns the newest `limit` buckets of the 24
   * hours before `end` (or before now), with no cursor.
   *
   * @param symbol - The symbol (e.g. 'BTC'; HIP-3 symbols keep their prefix and case, e.g. 'km:US500')
   * @param params - Window, interval (default `1h`), cursor and page size
   * @returns Buckets, `nextCursor` while more may follow, and `meta` (its `notice` says when a response is one page of several)
   */
  async history(symbol: string, params: CvdParams = {}): Promise<CursorResponse<CvdBucket[]>> {
    const response = await this.http.get<ApiResponse<CvdBucket[]>>(
      `${this.basePath}/cvd/${this.coinTransform(symbol)}`,
      params as unknown as Record<string, unknown>,
      this.http.validationEnabled ? CvdBucketArrayResponseSchema : undefined
    );
    return {
      data: response.data,
      nextCursor: response.meta?.nextCursor,
      meta: response.meta,
    };
  }
}
