import { type HttpClient, cursorPage } from '../http';
import type {
  ApiResponse,
  CursorResponse,
  UsdcFlowEvent,
  UsdcFlowKind,
  UsdcFlowsIterateParams,
  UsdcFlowsParams,
  UsdcFlowVolumeBucket,
  UsdcFlowVolumeInterval,
  UsdcFlowVolumeIterateParams,
  UsdcFlowVolumeParams,
} from '../types';
import { UsdcFlowEventArrayResponseSchema, UsdcFlowVolumeBucketArrayResponseSchema } from '../schemas';
import { checkLimit, checkOneOf, pinnedEnd, requireStart, walkCursor } from './paging';

/** The flow directions the events route filters on. */
export const USDC_FLOW_KINDS: readonly UsdcFlowKind[] = ['deposit', 'withdraw', 'evm_in', 'evm_out'];

/** Bucket widths the USDC flow volume route accepts. */
export const USDC_FLOW_VOLUME_INTERVALS: readonly UsdcFlowVolumeInterval[] = [
  '1m', '5m', '15m', '30m', '1h', '4h', '1d',
];

/** Largest page the USDC flow routes accept. */
export const USDC_FLOWS_MAX_LIMIT = 1000;

const MIN_USD_MAX = 1e12;

/**
 * USDC entering and leaving HyperCore, on Hyperliquid
 * (`client.hyperliquid.usdcFlows`; HIP-3 has no USDC flow routes).
 *
 * `deposit` and `withdraw` are the Arbitrum bridge; `evm_in` and `evm_out`
 * are USDC to and from HyperEVM (which also carries CCTP). Every event names
 * the HyperCore account (`user`). Coverage starts at the first flow,
 * 2025-09-27 09:33 UTC.
 *
 * Included with the Build, Pro, Scale and Enterprise plans; a Free key gets
 * {@link PlanRequiredError}.
 *
 * @example
 * ```typescript
 * // Withdrawals of $1M or more over a day, every page
 * for await (const e of client.hyperliquid.usdcFlows.iterate({
 *   start: '2026-11-02', end: '2026-11-03', kind: 'withdraw', minUsd: 1_000_000,
 * })) {
 *   console.log(e.id, e.timestamp, e.amountUsd, e.user);
 * }
 *
 * // Hourly totals
 * const totals = await client.hyperliquid.usdcFlows.volume({
 *   start: '2026-11-02', end: '2026-11-03', interval: '1h', limit: 24,
 * });
 * ```
 */
export class UsdcFlowsResource {
  constructor(
    private http: HttpClient,
    private basePath: string = '/v1/hyperliquid',
  ) {}

  /**
   * Get one page of USDC flow events, oldest first in execution order.
   *
   * Join pages and dedupe on `id` (`block:index`): `(timestamp, txHash)` is
   * not unique, since one bridge batch can carry up to 10 withdrawals under
   * one hash and time. Events in the last 3 hours can still be added after
   * you read them, so re-read that span and dedupe on `id`. While
   * `nextCursor` is set, pass it back with the other parameters unchanged and
   * stop when it is absent: a page reads at most 31 days, so with a high
   * `minUsd` a page can be empty and still have more to follow.
   *
   * @param params - Window (default the 24 hours before now), cursor, page size (default 100, max 1000), `minUsd` and `kind`
   * @returns Events, `nextCursor` and `hasMore`, and `meta`
   */
  async history(params: UsdcFlowsParams = {}): Promise<CursorResponse<UsdcFlowEvent[]>> {
    checkEventParams(params);
    const response = await this.http.get<ApiResponse<UsdcFlowEvent[]>>(
      `${this.basePath}/usdc-flows`,
      {
        start: params.start,
        end: params.end,
        cursor: params.cursor,
        limit: params.limit,
        min_usd: params.minUsd,
        kind: params.kind,
      },
      this.http.validationEnabled ? UsdcFlowEventArrayResponseSchema : undefined,
    );
    return cursorPage(response);
  }

  /**
   * Yield every USDC flow event of `[start, end]`, following `nextCursor`
   * until it is absent, through empty pages too. Every page is requested
   * with the same window and filters; when `end` is left out it is fixed to
   * the current time before the first request.
   *
   * @param params - `start` (required), `end`, page size, `minUsd` and `kind`
   */
  iterate(params: UsdcFlowsIterateParams): AsyncGenerator<UsdcFlowEvent, void, undefined> {
    requireStart(params?.start, 'usdcFlows.iterate()');
    checkEventParams(params);
    const window: UsdcFlowsParams = { ...params, end: pinnedEnd(params.end) };
    return walkCursor((cursor) => this.history({ ...window, cursor }));
  }

  /**
   * Get one page of USDC flow totals per bucket.
   *
   * One bucket per interval, zeros included, for the buckets whose open is
   * in `[start, end]`, never past the bucket still filling and never before
   * the bucket of the first flow. Totals count every flow, so this route
   * takes no `minUsd` or `kind`. `netUsd` is deposits plus HyperEVM inflows
   * less withdrawals and HyperEVM outflows.
   *
   * @param params - Window (default the 24 hours before now), interval (default `1h`), cursor and page size (default 100, max 1000)
   * @returns Buckets, `nextCursor` and `hasMore`, and `meta`
   */
  async volume(params: UsdcFlowVolumeParams = {}): Promise<CursorResponse<UsdcFlowVolumeBucket[]>> {
    checkVolumeParams(params);
    const response = await this.http.get<ApiResponse<UsdcFlowVolumeBucket[]>>(
      `${this.basePath}/usdc-flows/volume`,
      {
        start: params.start,
        end: params.end,
        interval: params.interval,
        cursor: params.cursor,
        limit: params.limit,
      },
      this.http.validationEnabled ? UsdcFlowVolumeBucketArrayResponseSchema : undefined,
    );
    return cursorPage(response);
  }

  /**
   * Yield every USDC flow total bucket of `[start, end]`, following
   * `nextCursor` until it is absent. When `end` is left out it is fixed to
   * the current time before the first request.
   *
   * @param params - `start` (required), `end`, interval and page size
   */
  iterateVolume(params: UsdcFlowVolumeIterateParams): AsyncGenerator<UsdcFlowVolumeBucket, void, undefined> {
    requireStart(params?.start, 'usdcFlows.iterateVolume()');
    checkVolumeParams(params);
    const window: UsdcFlowVolumeParams = { ...params, end: pinnedEnd(params.end) };
    return walkCursor((cursor) => this.volume({ ...window, cursor }));
  }
}

function checkEventParams(params: UsdcFlowsParams): void {
  checkLimit(params.limit, USDC_FLOWS_MAX_LIMIT, 'USDC flows');
  checkOneOf(params.kind, USDC_FLOW_KINDS, 'kind', 'USDC flows');
  if (
    params.minUsd !== undefined &&
    (typeof params.minUsd !== 'number' || !Number.isFinite(params.minUsd) || params.minUsd < 0 || params.minUsd > MIN_USD_MAX)
  ) {
    throw new RangeError('minUsd must be a number from 0 to 1e12 for USDC flows');
  }
}

function checkVolumeParams(params: UsdcFlowVolumeParams): void {
  checkOneOf(params.interval, USDC_FLOW_VOLUME_INTERVALS, 'interval', 'USDC flow volume');
  checkLimit(params.limit, USDC_FLOWS_MAX_LIMIT, 'USDC flow volume');
}
