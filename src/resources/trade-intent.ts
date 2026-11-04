import { type HttpClient, cursorPage } from '../http';
import type {
  ApiResponse,
  CursorResponse,
  TradeIntentBucket,
  TradeIntentInterval,
  TradeIntentIterateParams,
  TradeIntentParams,
} from '../types';
import { TradeIntentBucketArrayResponseSchema } from '../schemas';
import { checkLimit, checkOneOf, checkSymbol, pinnedEnd, requireStart, walkCursor } from './paging';

/** Bucket widths the trade intent routes accept. */
export const TRADE_INTENT_INTERVALS: readonly TradeIntentInterval[] = [
  '1s', '5s', '15s', '1m', '5m', '15m', '1h', '4h', '1d',
];

/** Largest page the trade intent routes accept. */
export const TRADE_INTENT_MAX_LIMIT = 2000;

/**
 * Trade intent: why one market traded, bucket by bucket. Hyperliquid core
 * (`client.hyperliquid.tradeIntent`) and HIP-3
 * (`client.hyperliquid.hip3.tradeIntent`).
 *
 * Each bucket splits the market's USD volume by intent: new longs and shorts
 * (`openLong`, `openShort`), profit taken (`tpLong`, `tpShort`), stopped out
 * (`stopLong`, `stopShort`: closes at a loss, liquidations and
 * auto-deleveraging) and flips through zero (`flipLs`, `flipSl`). Both sides
 * of every trade count; market makers' legs are in `mmUsd` only. Then the
 * market's trailing-72-hour winners and losers as aggregates (no wallet is
 * named): their net and gross position, how many there are, and what they
 * bought less what they sold.
 *
 * Coverage: hourly intervals (`1h`, `4h`, `1d`) from 2025-05-25 15:00 UTC on
 * Hyperliquid and 2025-10-13 12:00 UTC on HIP-3; minute intervals (`1m`,
 * `5m`, `15m`) from 2026-07-14 00:00 UTC; second intervals (`1s`, `5s`,
 * `15s`) for the last 3 days. A window that ends before its interval's
 * coverage is empty, with `meta.coverageFrom` and `meta.notice`. A market
 * idle for more than 7 days has no buckets there: a gap, not zero.
 *
 * Included with the Build, Pro, Scale and Enterprise plans; a Free key gets
 * {@link PlanRequiredError}.
 *
 * @example
 * ```typescript
 * const page = await client.hyperliquid.tradeIntent.history('BTC', {
 *   start: '2026-11-02T00:00:00Z',
 *   end: '2026-11-02T06:00:00Z',
 *   interval: '1h',
 * });
 * for (const b of page.data) console.log(b.timestamp, b.openLong, b.stopLong, b.mmUsd);
 *
 * // Every bucket of a window, following the cursor
 * for await (const b of client.hyperliquid.hip3.tradeIntent.iterate('xyz:XYZ100', {
 *   start: '2026-11-01', end: '2026-11-02', interval: '15m',
 * })) {
 *   console.log(b.timestamp, b.winnersFlow, b.losersFlow);
 * }
 * ```
 */
export class TradeIntentResource {
  constructor(
    private http: HttpClient,
    private basePath: string = '/v1/hyperliquid',
    private coinTransform: (s: string) => string = (c) => c.toUpperCase(),
  ) {}

  /**
   * Get one page of trade intent buckets for a market.
   *
   * A page holds the buckets whose open is in `[start, end]`, oldest first,
   * never past the bucket holding now; pages never split a bucket. While
   * `nextCursor` is set, pass it back as `cursor` with `start`, `end` and
   * `interval` unchanged, and stop when it is absent: a page can hold fewer
   * than `limit` buckets, or none, and still not be the last. Set `start` and
   * `end` when paging; without them each request takes the 24 hours before
   * its own now.
   *
   * `meta.builtThrough` says how far the series is built, and
   * `meta.preliminaryRowCount` counts the buckets of the hour still open. A
   * 503 `upstream_unavailable` for a read that took too long is retryable:
   * lower `limit` or narrow the window.
   *
   * @param symbol - The market (`BTC`; HIP-3 symbols keep their prefix and case, e.g. `xyz:XYZ100`)
   * @param params - Window, interval (default `1h`), cursor and page size (default 500, max 2000)
   * @returns Buckets, `nextCursor` and `hasMore`, and `meta` with `symbol`, `venue` and `builtThrough`
   */
  async history(symbol: string, params: TradeIntentParams = {}): Promise<CursorResponse<TradeIntentBucket[]>> {
    checkSymbol(symbol);
    checkOneOf(params.interval, TRADE_INTENT_INTERVALS, 'interval', 'trade intent');
    checkLimit(params.limit, TRADE_INTENT_MAX_LIMIT, 'trade intent');
    const response = await this.http.get<ApiResponse<TradeIntentBucket[]>>(
      `${this.basePath}/trade-intent/${this.coinTransform(symbol)}`,
      {
        start: params.start,
        end: params.end,
        interval: params.interval,
        cursor: params.cursor,
        limit: params.limit,
      },
      this.http.validationEnabled ? TradeIntentBucketArrayResponseSchema : undefined,
    );
    return cursorPage(response);
  }

  /**
   * Yield every trade intent bucket of `[start, end]`, following
   * `nextCursor` until it is absent (never stopping on a short or empty
   * page). Every page is requested with the same `start`, `end`, `interval`
   * and `limit`; when `end` is left out it is fixed to the current time
   * before the first request.
   *
   * @param symbol - The market
   * @param params - `start` (required), `end`, `interval` and page size
   */
  iterate(symbol: string, params: TradeIntentIterateParams): AsyncGenerator<TradeIntentBucket, void, undefined> {
    checkSymbol(symbol);
    requireStart(params?.start, 'tradeIntent.iterate()');
    checkOneOf(params.interval, TRADE_INTENT_INTERVALS, 'interval', 'trade intent');
    checkLimit(params.limit, TRADE_INTENT_MAX_LIMIT, 'trade intent');
    const window: TradeIntentParams = { ...params, end: pinnedEnd(params.end) };
    return walkCursor((cursor) => this.history(symbol, { ...window, cursor }));
  }
}
