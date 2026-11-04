import { type HttpClient, cursorPage } from '../http';
import type {
  ApiResponse,
  BreadthMaCurrentParams,
  BreadthMaHistoryParams,
  BreadthMaInterval,
  BreadthMaIterateParams,
  BreadthMaLength,
  BreadthMaReading,
  CursorResponse,
} from '../types';
import { BreadthMaReadingArrayResponseSchema, BreadthMaReadingResponseSchema } from '../schemas';
import { checkLimit, checkOneOf, pinnedEnd, requireStart, walkCursor } from './paging';

/** Moving-average lengths, in days, the breadth routes accept. */
export const BREADTH_MA_LENGTHS: readonly BreadthMaLength[] = [5, 20, 50, 200];

/** Bucket widths the moving-average breadth history route accepts. */
export const BREADTH_MA_INTERVALS: readonly BreadthMaInterval[] = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];

/** Largest page the moving-average breadth history route accepts. */
export const BREADTH_MA_MAX_LIMIT = 1000;

function checkLength(n: unknown): asserts n is BreadthMaLength {
  if (n === undefined || n === null) {
    throw new TypeError('n is required: the moving average length in days, 5, 20, 50 or 200');
  }
  if (!BREADTH_MA_LENGTHS.includes(n as BreadthMaLength)) {
    throw new RangeError('n must be one of 5, 20, 50, 200 for moving-average breadth');
  }
}

/**
 * Breadth above the n-day moving average: the share of the venue's perps
 * whose price is above the mean of their daily closes over the n UTC days
 * before the reading's day, with the quartiles of how far above or below.
 * Hyperliquid core (`client.hyperliquid.breadthMa`) and HIP-3
 * (`client.hyperliquid.hip3.breadthMa`).
 *
 * `n` is required (5, 20, 50 or 200), and each length starts on its own
 * date. Hyperliquid: n = 5 from 2025-03-27, 20 from 2025-04-11, 50 from
 * 2025-05-11, 200 from 2025-10-08. HIP-3: n = 5 from 2025-12-27, 20 from
 * 2026-01-11, 50 from 2026-02-10, 200 from 2026-07-10 (all 00:00 UTC).
 *
 * Every perp the venue ever listed is a candidate from its first 1m bar. A
 * delisted perp stays a candidate and is counted in `excludedStalePrice`
 * from 24 hours after its last trade, and a perp younger than n days counts
 * in `excludedShortHistory`, so `coverageRatio` depends on `n`, is not a
 * data-quality ratio and is not comparable with above-VWAP breadth.
 * `valuePct` and `distance` are null when nothing is eligible, never 0.
 *
 * Included with the Build, Pro, Scale and Enterprise plans; a Free key gets
 * {@link PlanRequiredError}.
 *
 * @example
 * ```typescript
 * const now = await client.hyperliquid.breadthMa.current({ n: 200 });
 * console.log(now.calculatedAt, now.valuePct, now.distance.median);
 *
 * const daily = await client.hyperliquid.hip3.breadthMa.history({
 *   n: 50, start: '2026-10-01', end: '2026-11-01', interval: '1d',
 * });
 * ```
 */
export class BreadthMaResource {
  constructor(
    private http: HttpClient,
    private basePath: string = '/v1/hyperliquid',
  ) {}

  /**
   * Get the newest 1m reading, as of about 4 minutes before now, on the
   * minute. The route takes `n` only. A 503 `upstream_unavailable` right
   * after a server restart is retryable.
   *
   * @param params - `n`: the moving average length in days (5, 20, 50 or 200)
   */
  async current(params: BreadthMaCurrentParams): Promise<BreadthMaReading> {
    checkLength(params?.n);
    const response = await this.http.get<ApiResponse<BreadthMaReading>>(
      `${this.basePath}/breadth/above-ma/current`,
      { n: params.n },
      this.http.validationEnabled ? BreadthMaReadingResponseSchema : undefined,
    );
    return response.data;
  }

  /**
   * Get one page of readings, one per bucket, oldest first.
   *
   * A page holds the buckets whose open is in `[start, end]`. Each bucket
   * carries its last reading, as of its end (`calculatedAt`); the bucket
   * still forming is as of about 4 minutes before now. Percentages are never
   * averaged across buckets, and neither should yours be. While `nextCursor`
   * is set, pass it back with the other parameters unchanged, and stop when
   * it is absent. The cursor is opaque and is not the above-VWAP breadth
   * cursor. Set `start` and `end` when paging; the default window is the 24
   * hours before now and moves with the clock.
   *
   * @param params - `n` (required), window, interval (default `1m`), cursor and page size (default 100, max 1000)
   * @returns Readings, `nextCursor` and `hasMore`, and `meta` (`coverageFrom` and `notice` before n's first reading)
   */
  async history(params: BreadthMaHistoryParams): Promise<CursorResponse<BreadthMaReading[]>> {
    checkHistoryParams(params);
    const response = await this.http.get<ApiResponse<BreadthMaReading[]>>(
      `${this.basePath}/breadth/above-ma`,
      {
        n: params.n,
        start: params.start,
        end: params.end,
        interval: params.interval,
        cursor: params.cursor,
        limit: params.limit,
      },
      this.http.validationEnabled ? BreadthMaReadingArrayResponseSchema : undefined,
    );
    return cursorPage(response);
  }

  /**
   * Yield every reading of `[start, end]`, following `nextCursor` until it
   * is absent. Every page is requested with the same `n`, window, interval
   * and page size; when `end` is left out it is fixed to the current time
   * before the first request.
   *
   * @param params - `n` and `start` (required), `end`, interval and page size
   */
  iterate(params: BreadthMaIterateParams): AsyncGenerator<BreadthMaReading, void, undefined> {
    checkLength(params?.n);
    requireStart(params.start, 'breadthMa.iterate()');
    checkHistoryParams(params);
    const window: BreadthMaHistoryParams = { ...params, end: pinnedEnd(params.end) };
    return walkCursor((cursor) => this.history({ ...window, cursor }));
  }
}

function checkHistoryParams(params: BreadthMaHistoryParams): void {
  checkLength(params?.n);
  checkOneOf(params.interval, BREADTH_MA_INTERVALS, 'interval', 'moving-average breadth');
  checkLimit(params.limit, BREADTH_MA_MAX_LIMIT, 'moving-average breadth');
}
