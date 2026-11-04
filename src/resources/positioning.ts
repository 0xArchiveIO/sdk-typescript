import { type HttpClient, cursorPage } from '../http';
import type {
  ApiResponse,
  CursorResponse,
  PositioningParams,
  PositioningReading,
  PositioningWindow,
} from '../types';
import { PositioningReadingArrayResponseSchema } from '../schemas';

/** Trailing windows the positioning routes accept. */
export const POSITIONING_WINDOWS: readonly PositioningWindow[] = ['1h', '4h', '24h'];

/**
 * The positioning cross-section: every listed perp of Hyperliquid core
 * (`client.hyperliquid.positioning`) or HIP-3
 * (`client.hyperliquid.hip3.positioning`) over the current trailing window,
 * with its open interest change, taker buy and sell volume, liquidations and
 * typical move over windows of that length.
 *
 * Current window only: there is no history, paging or symbol filter (filter
 * the records yourself). One record per listed perp, sorted by symbol.
 *
 * Included with the Build, Pro, Scale and Enterprise plans; a Free key gets
 * {@link PlanRequiredError}.
 *
 * @example
 * ```typescript
 * const { data, meta } = await client.hyperliquid.positioning.current({ window: '4h' });
 * console.log(meta?.asOf);
 * const btc = data.find((r) => r.symbol === 'BTC');
 * ```
 */
export class PositioningResource {
  constructor(
    private http: HttpClient,
    private basePath: string = '/v1/hyperliquid',
  ) {}

  /**
   * Get the cross-section for the current window.
   *
   * The window is `[close - window, close)`, where the close is the newest
   * 5-minute boundary about 4 minutes behind now (`meta.asOf`). `oiStart`,
   * `oiEnd`, `markStart` and `markEnd` are null when that 5-minute bucket
   * has no reading, never 0. The `typical*` figures are the median absolute
   * move over windows of the same length sliding by 5 minutes across about
   * the last 6.9 days, null under 288 counted windows. A 503
   * `upstream_unavailable` ("still being prepared") is retryable.
   *
   * @param params - `window`: `'1h'`, `'4h'` or `'24h'` (required)
   * @returns One record per listed perp, with `meta.asOf` (the close); `hasMore` is false
   */
  async current(params: PositioningParams): Promise<CursorResponse<PositioningReading[]>> {
    if (params?.window === undefined || params.window === null) {
      throw new TypeError('window is required: the trailing window, 1h, 4h or 24h');
    }
    if (!POSITIONING_WINDOWS.includes(params.window)) {
      throw new RangeError('window must be one of 1h, 4h, 24h for positioning');
    }
    const response = await this.http.get<ApiResponse<PositioningReading[]>>(
      `${this.basePath}/positioning`,
      { window: params.window },
      this.http.validationEnabled ? PositioningReadingArrayResponseSchema : undefined,
    );
    return cursorPage(response);
  }
}
