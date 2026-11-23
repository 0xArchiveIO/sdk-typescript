import { type HttpClient, cursorPage } from '../http';
import type {
  ApiResponse,
  CursorResponse,
  MomentumCurrentParams,
  MomentumInterval,
  MomentumLookback,
  MomentumReturn,
  MomentumReturnsIterateParams,
  MomentumReturnsParams,
  MomentumScore,
  MomentumScoresParams,
  MomentumUniverse,
} from '../types';
import { MomentumReturnArrayResponseSchema, MomentumScoreArrayResponseSchema } from '../schemas';
import { checkLimit, checkOneOf, pinnedEnd, requireStart, walkCursor } from './paging';

/** Lookbacks the momentum factor routes accept. */
export const MOMENTUM_LOOKBACKS: readonly MomentumLookback[] = ['7d', '14d'];

/** Universes the momentum factor's returns are built on. */
export const MOMENTUM_UNIVERSES: readonly MomentumUniverse[] = ['top25', 'top50'];

/** Bucket widths the momentum factor's returns route accepts. */
export const MOMENTUM_INTERVALS: readonly MomentumInterval[] = ['1h', '1d'];

/** Largest page the momentum factor's returns route accepts. */
export const MOMENTUM_MAX_LIMIT = 1000;

function checkLookback(lookback: unknown): asserts lookback is MomentumLookback {
  if (lookback === undefined || lookback === null) {
    throw new TypeError('lookback is required for the momentum factor: 7d or 14d');
  }
  if (!MOMENTUM_LOOKBACKS.includes(lookback as MomentumLookback)) {
    throw new RangeError('lookback must be one of 7d, 14d for the momentum factor');
  }
}

/**
 * The momentum factor on Hyperliquid core perps
 * (`client.hyperliquid.factors.momentum`, method `momentum/1`): every perp's
 * momentum score at an hour, and the returns of the long-short factor built
 * from those scores.
 *
 * `lookback` is required on every call: `'7d'` or `'14d'`. A perp's score is
 * its close-to-close return over the lookback divided by the standard
 * deviation of its last 30 days of hourly returns.
 *
 * The factor's universe is the top 25 (`'top25'`, the default) or top 50
 * (`'top50'`) perps by 30-day dollar volume, re-picked every 30 days, with
 * delisted perps included while they traded. Every 168 hours (Saturdays
 * 00:00 UTC, earning from 01:00) it goes long the top fifth of the universe
 * on the score and short the bottom fifth, each leg weighted by inverse
 * volatility and summing to 1. Returns are gross of fees and funding.
 *
 * Scores and returns start 2025-05-24 01:00 UTC. A request that ends before
 * then is empty, with `meta.coverageFrom` and `meta.notice`. A 503
 * `upstream_unavailable` ("still being prepared") on the first request after
 * a server restart is retryable.
 *
 * Included with the Build, Pro, Scale and Enterprise plans; a Free key gets
 * {@link PlanRequiredError}.
 *
 * @example
 * ```typescript
 * const { data } = await client.hyperliquid.factors.momentum.current({ lookback: '7d' });
 * console.log(data[0].symbol, data[0].score, data[0].pctRank);
 *
 * const page = await client.hyperliquid.factors.momentum.returns({
 *   lookback: '14d', universe: 'top50', start: '2026-10-01', end: '2026-11-01',
 * });
 * ```
 */
export class MomentumResource {
  constructor(
    private http: HttpClient,
    private basePath: string = '/v1/hyperliquid',
  ) {}

  /**
   * Get every eligible perp's reading as of the close of one hour, strongest
   * first: the hour at or before `at` (default now; a later time gets the
   * newest reading). The response is never paged.
   *
   * @param params - `lookback` (required) and `at`
   * @returns One reading per eligible perp, and `meta` (`coverageFrom` and `notice` before coverage); `hasMore` is false
   */
  async get(params: MomentumScoresParams): Promise<CursorResponse<MomentumScore[]>> {
    checkLookback(params?.lookback);
    return fetchScores(this.http, `${this.basePath}/factors/momentum`, { lookback: params.lookback, at: params.at });
  }

  /**
   * Get the newest reading: every eligible perp, strongest first. The route
   * takes `lookback` only.
   *
   * @param params - `lookback`: `'7d'` or `'14d'` (required)
   * @returns One reading per eligible perp; `hasMore` is false
   */
  async current(params: MomentumCurrentParams): Promise<CursorResponse<MomentumScore[]>> {
    checkLookback(params?.lookback);
    return fetchScores(this.http, `${this.basePath}/factors/momentum/current`, { lookback: params.lookback });
  }

  /**
   * Get one page of the factor's returns, one per bucket, oldest first.
   *
   * A page holds the buckets whose open is in `[start, end]`. A bucket's
   * `ret` is the sum of the factor's hourly returns over the `hours` it holds
   * (simple, not compounded), with each leg's return and the legs' sizes in
   * force at its last hour. While `nextCursor` is set, pass it back with the
   * other parameters unchanged, and stop when it is absent. Set `end` when
   * paging; the default window is the 30 days before now and moves with the
   * clock.
   *
   * @param params - `lookback` (required), universe (default `top25`), window, interval (default `1d`), `holdings`, cursor and page size (default 100, max 1000)
   * @returns Buckets, `nextCursor` and `hasMore`, and `meta` (`coverageFrom` and `notice` before coverage)
   */
  async returns(params: MomentumReturnsParams): Promise<CursorResponse<MomentumReturn[]>> {
    checkReturnsParams(params);
    const response = await this.http.get<ApiResponse<MomentumReturn[]>>(
      `${this.basePath}/factors/momentum/returns`,
      {
        lookback: params.lookback,
        universe: params.universe,
        start: params.start,
        end: params.end,
        interval: params.interval,
        holdings: params.holdings,
        cursor: params.cursor,
        limit: params.limit,
      },
      this.http.validationEnabled ? MomentumReturnArrayResponseSchema : undefined,
    );
    return cursorPage(response);
  }

  /**
   * Yield every bucket of `[start, end]`, following `nextCursor` until it is
   * absent. Every page is requested with the same lookback, universe,
   * window, interval, `holdings` and page size; when `end` is left out it is
   * fixed to the current time before the first request.
   *
   * @param params - `lookback` and `start` (required), `end`, universe, interval, `holdings` and page size
   */
  iterateReturns(params: MomentumReturnsIterateParams): AsyncGenerator<MomentumReturn, void, undefined> {
    checkLookback(params?.lookback);
    requireStart(params.start, 'factors.momentum.iterateReturns()');
    checkReturnsParams(params);
    const window: MomentumReturnsParams = { ...params, end: pinnedEnd(params.end) };
    return walkCursor((cursor) => this.returns({ ...window, cursor }));
  }
}

/**
 * Factors on Hyperliquid core perps (`client.hyperliquid.factors`). Included
 * with the Build, Pro, Scale and Enterprise plans.
 */
export class FactorsResource {
  /** The momentum factor: every perp's score at an hour, and the long-short factor's returns (from 2025-05-24 01:00 UTC). */
  public readonly momentum: MomentumResource;

  constructor(http: HttpClient, basePath: string = '/v1/hyperliquid') {
    this.momentum = new MomentumResource(http, basePath);
  }
}

async function fetchScores(
  http: HttpClient,
  path: string,
  query: Record<string, unknown>,
): Promise<CursorResponse<MomentumScore[]>> {
  const response = await http.get<ApiResponse<MomentumScore[]>>(
    path,
    query,
    http.validationEnabled ? MomentumScoreArrayResponseSchema : undefined,
  );
  return cursorPage(response);
}

function checkReturnsParams(params: MomentumReturnsParams): void {
  checkLookback(params?.lookback);
  checkOneOf(params.universe, MOMENTUM_UNIVERSES, 'universe', 'the momentum factor');
  checkOneOf(params.interval, MOMENTUM_INTERVALS, 'interval', 'the momentum factor');
  checkLimit(params.limit, MOMENTUM_MAX_LIMIT, 'the momentum factor');
  if (params.holdings !== undefined && typeof params.holdings !== 'boolean') {
    throw new TypeError('holdings must be true or false for the momentum factor');
  }
}
