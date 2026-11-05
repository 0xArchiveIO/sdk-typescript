import { type HttpClient, cursorPage } from '../http';
import type { ApiResponse, CursorResponse, NewsIterateParams, NewsParams, NewsStory } from '../types';
import { NewsStoryArrayResponseSchema } from '../schemas';
import { toUnixMs } from '../time';
import { checkLimit, checkOneOf, pinnedEnd, walkCursor } from './paging';

/** Largest page the news routes accept. */
export const NEWS_MAX_LIMIT = 500;

/** Most markets `symbols` takes. */
export const NEWS_MAX_SYMBOLS = 20;

/** The weights `minWeight` accepts. */
export const NEWS_WEIGHTS: readonly (1 | 2 | 3)[] = [1, 2, 3];

function symbolList(symbols: NewsParams['symbols']): string | undefined {
  if (symbols === undefined) return undefined;
  const parts = (typeof symbols === 'string' ? [symbols] : [...symbols])
    .flatMap((s) => s.split(','))
    .map((s) => s.trim())
    .filter((s) => s !== '');
  if (parts.length > NEWS_MAX_SYMBOLS) {
    throw new RangeError(`symbols takes at most ${NEWS_MAX_SYMBOLS} markets for news`);
  }
  return parts.length > 0 ? parts.join(',') : undefined;
}

function checkParams(params: NewsParams | undefined): void {
  checkLimit(params?.limit, NEWS_MAX_LIMIT, 'news');
  checkOneOf(params?.minWeight, NEWS_WEIGHTS, 'minWeight', 'news');
}

/**
 * Headlines and our own market events as stories, with what the first market
 * named did in the minutes after: `client.hyperliquid.news` (perps),
 * `client.hyperliquid.hip3.news` and `client.lighter.news`. Each returns the
 * stories whose lead report names a market on that venue.
 *
 * A story carries the reports that joined it (`reports`), the markets it
 * names (`markets`) and, when a market was matched, `reaction`: the 1 and 5
 * minute windows after `firstSeenAt`, with `movePct`, `moveZ` and `moveLevel`,
 * liquidations, open interest and depth. A reaction is a measurement, not a
 * cause. Story moves are mostly noise: treat a move as typical unless
 * `moveLevel` is `unusual` or `large`.
 *
 * Public-display stories only: sources the API is not licensed to
 * redistribute do not appear. Included with the Build, Pro, Scale and
 * Enterprise plans; a Free key gets {@link PlanRequiredError}.
 *
 * @example
 * ```typescript
 * const page = await client.hyperliquid.news.list({ symbols: 'BTC', minWeight: 2, limit: 20 });
 * for (const s of page.data) console.log(s.firstSeenAt, s.headline, s.source);
 *
 * for await (const s of client.lighter.news.iterate({ start: '2026-11-04' })) {
 *   if (s.reaction?.windows['5m']?.moveLevel === 'large') console.log(s.headline);
 * }
 * ```
 */
export class NewsResource {
  constructor(
    private http: HttpClient,
    private basePath: string = '/v1/hyperliquid',
  ) {}

  /**
   * Get one page of stories, newest first by `firstSeenAt`.
   *
   * While `nextCursor` is set, pass it back as `cursor` with the other
   * parameters unchanged.
   *
   * @param params - Filters, window (default the 24 hours before now), `asOf`, cursor and page size (default 100, max 500)
   * @returns Stories, `nextCursor` and `hasMore`, and `meta`
   */
  async list(params: NewsParams = {}): Promise<CursorResponse<NewsStory[]>> {
    checkParams(params);
    const response = await this.http.get<ApiResponse<NewsStory[]>>(
      `${this.basePath}/news`,
      {
        symbols: symbolList(params.symbols),
        topic: params.topic,
        min_weight: params.minWeight,
        start: params.start,
        end: params.end,
        as_of: params.asOf === undefined ? undefined : toUnixMs(params.asOf, 'asOf'),
        cursor: params.cursor,
        limit: params.limit,
      },
      this.http.validationEnabled ? NewsStoryArrayResponseSchema : undefined,
    );
    return cursorPage(response);
  }

  /**
   * Yield every story of `[start, end]`, newest first, following
   * `nextCursor` until it is absent. Every page is requested with the same
   * window and filters; when `end` is left out it is fixed to the current
   * time before the first request. Pass `asOf` to read the whole walk
   * against one version of the feed.
   *
   * @param params - Filters, window, `asOf` and page size
   */
  iterate(params: NewsIterateParams = {}): AsyncGenerator<NewsStory, void, undefined> {
    checkParams(params);
    const window: NewsParams = { ...params, end: pinnedEnd(params.end) };
    return walkCursor((cursor) => this.list({ ...window, cursor }));
  }
}
