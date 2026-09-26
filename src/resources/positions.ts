import type { z } from 'zod';
import type { HttpClient } from '../http';
import type {
  AccountSummary,
  ApiResponse,
  Hip3PositionsGetParams,
  Hip3PositionsRangeParams,
  LighterAccountsByL1Params,
  LighterL1Account,
  LighterL1Accounts,
  LighterPositionsBulkParams,
  LighterPositionsMarketParams,
  LighterPositionsMarketSummaryParams,
  MarketPosition,
  MarketPositionsSummary,
  Position,
  PositionChange,
  PositionsAccountHistoryParams,
  PositionsAccountParams,
  PositionsBulkParams,
  PositionsGetParams,
  PositionsMarketParams,
  PositionsMarketSummaryParams,
  PositionsRangeParams,
  PositionsResponse,
  PositionsTime,
  WalletPositions,
} from '../types';
import {
  AccountSummaryArrayResponseSchema,
  LighterL1AccountsResponseSchema,
  MarketPositionArrayResponseSchema,
  MarketPositionsSummaryArrayResponseSchema,
  PositionArrayResponseSchema,
  PositionChangeArrayResponseSchema,
  WalletPositionsResponseSchema,
} from '../schemas';

const HOUR_MS = 3_600_000;

/**
 * A Lighter account index: a non-negative integer. Pass a string or a bigint
 * for indices above `Number.MAX_SAFE_INTEGER`.
 */
export type LighterAccountIndex = number | string | bigint;

type Query = Record<string, unknown>;

/**
 * Convert a positions time value (Unix ms, an ISO 8601 string, or a Date) to
 * integer Unix milliseconds, the only form the positions routes accept.
 *
 * @internal Exported for testing
 */
export function toEpochMs(value: PositionsTime, field: string): number {
  let ms: number;
  if (value instanceof Date) {
    ms = value.getTime();
  } else if (typeof value === 'number') {
    ms = value;
  } else if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    ms = Number(value.trim());
  } else if (typeof value === 'string') {
    ms = Date.parse(value);
  } else {
    ms = Number.NaN;
  }
  if (!Number.isFinite(ms)) {
    throw new TypeError(`${field} must be Unix milliseconds, an ISO 8601 string, or a Date`);
  }
  return Math.trunc(ms);
}

function optionalMs(value: PositionsTime | undefined, field: string): number | undefined {
  return value === undefined || value === null ? undefined : toEpochMs(value, field);
}

function requiredMs(value: PositionsTime | undefined, field: string): number {
  if (value === undefined || value === null) {
    throw new TypeError(`${field} is required`);
  }
  return toEpochMs(value, field);
}

/** Snapshot hours are exact UTC hours; anything else is refused before sending. */
function hourMs(value: PositionsTime, field = 'hour'): number {
  const ms = toEpochMs(value, field);
  if (ms % HOUR_MS !== 0) {
    throw new RangeError(`${field} must be an exact UTC hour (Unix milliseconds divisible by 3600000)`);
  }
  return ms;
}

function accountIndexPath(value: LighterAccountIndex): string {
  let text: string;
  if (typeof value === 'bigint') {
    text = value.toString();
  } else if (typeof value === 'number') {
    text = Number.isSafeInteger(value) ? String(value) : '';
  } else {
    text = String(value).trim();
  }
  if (!/^\d+$/.test(text)) {
    throw new TypeError(
      'accountIndex must be a non-negative integer Lighter account index. ' +
        'Resolve a mainnet L1 address with client.lighter.accounts.byL1().',
    );
  }
  return text;
}

/**
 * Follow `nextCursor` until the last page. Pages can be empty and still carry
 * a cursor (a window with hours that hold no rows), so only a missing or
 * repeated cursor ends the walk.
 */
async function* followCursor<P, T>(
  fetchPage: (cursor: string | undefined) => Promise<PositionsResponse<P>>,
  rows: (data: P) => T[],
  startCursor?: string,
): AsyncGenerator<T, void, undefined> {
  let cursor = startCursor;
  const seen = new Set<string>();
  for (;;) {
    const page = await fetchPage(cursor);
    for (const row of rows(page.data)) {
      yield row;
    }
    const next = page.nextCursor;
    if (!next || seen.has(next)) {
      return;
    }
    seen.add(next);
    cursor = next;
  }
}

const asRows = <T>(data: T[]): T[] => data;

/** Request plumbing shared by the Hyperliquid and Lighter positions resources. */
abstract class PositionsRoutes {
  constructor(
    protected readonly http: HttpClient,
    protected readonly basePath: string,
    protected readonly symbolTransform: (symbol: string) => string,
  ) {}

  protected async page<T>(
    path: string,
    query: Query | undefined,
    schema: z.ZodTypeAny,
  ): Promise<PositionsResponse<T>> {
    const response = await this.http.get<ApiResponse<T>>(
      `${this.basePath}${path}`,
      query,
      this.http.validationEnabled ? (schema as unknown as z.ZodType<ApiResponse<T>>) : undefined,
    );
    return {
      data: response.data,
      nextCursor: response.meta?.nextCursor,
      meta: response.meta,
    };
  }

  protected symbolFilter(symbol: string | undefined): string | undefined {
    return symbol === undefined || symbol === '' ? undefined : this.symbolTransform(symbol);
  }

  protected getQuery(params: Hip3PositionsGetParams | undefined): Query {
    return {
      timestamp: optionalMs(params?.timestamp, 'timestamp'),
      symbol: this.symbolFilter(params?.symbol),
      dex: params?.dex,
      cursor: params?.cursor,
      limit: params?.limit,
    };
  }

  protected rangeQuery(params: Hip3PositionsRangeParams): Query {
    return {
      start: requiredMs(params?.start, 'start'),
      end: requiredMs(params?.end, 'end'),
      symbol: this.symbolFilter(params.symbol),
      dex: params.dex,
      cursor: params.cursor,
      limit: params.limit,
    };
  }

  protected marketQuery(params: LighterPositionsMarketParams | undefined): Query {
    return {
      hour: params?.hour === undefined ? undefined : hourMs(params.hour),
      side: params?.side,
      min_value: params?.minValue,
      include_system: params?.includeSystem,
      cursor: params?.cursor,
      limit: params?.limit,
    };
  }

  protected summaryQuery(params: LighterPositionsMarketSummaryParams | undefined): Query {
    return {
      start: optionalMs(params?.start, 'start'),
      end: optionalMs(params?.end, 'end'),
      include_system: params?.includeSystem,
      cursor: params?.cursor,
      limit: params?.limit,
    };
  }

  protected bulkQuery(params: LighterPositionsBulkParams): Query {
    if (params?.hour === undefined || params?.hour === null) {
      throw new TypeError('hour is required');
    }
    return {
      hour: hourMs(params.hour),
      include_system: params.includeSystem,
      cursor: params.cursor,
      limit: params.limit,
    };
  }

  protected marketPage(symbol: string, params?: LighterPositionsMarketParams): Promise<PositionsResponse<MarketPosition[]>> {
    return this.page<MarketPosition[]>(
      `/positions/${this.symbolTransform(symbol)}`,
      this.marketQuery(params),
      MarketPositionArrayResponseSchema,
    );
  }

  protected summaryPage(
    symbol: string,
    params?: LighterPositionsMarketSummaryParams,
  ): Promise<PositionsResponse<MarketPositionsSummary[]>> {
    return this.page<MarketPositionsSummary[]>(
      `/positions/${this.symbolTransform(symbol)}/summary`,
      this.summaryQuery(params),
      MarketPositionsSummaryArrayResponseSchema,
    );
  }

  protected bulkPage(params: LighterPositionsBulkParams): Promise<PositionsResponse<MarketPosition[]>> {
    return this.page<MarketPosition[]>('/positions', this.bulkQuery(params), MarketPositionArrayResponseSchema);
  }
}

/**
 * Account positions for Hyperliquid core (`client.hyperliquid.positions`).
 * HIP-3 uses {@link Hip3PositionsResource}, which adds the `dex` filter.
 *
 * Wallet routes take a `0x` address. Reads without a `timestamp` serve the
 * latest live snapshot (refreshed about every 5 minutes); an exact hour with a
 * committed snapshot serves that hour; any other instant is reconstructed
 * from the change log. Coverage: the change log from 2025-05-25 on core and
 * 2025-10-13 on HIP-3; hourly snapshots from 2026-06-07.
 *
 * Every method returns `{ data, nextCursor, meta }`. Check `meta.asOf`,
 * `meta.source`, `meta.quality`, `meta.stale`, `meta.builtThrough` and
 * `meta.finalizedThrough` before relying on a read. A 409 with
 * `errorCode === 'snapshot_advanced'` means a market cursor's snapshot was
 * replaced: restart without a cursor.
 *
 * @example
 * ```typescript
 * const { data, meta } = await client.hyperliquid.positions.get('0xabc...');
 * for (const p of data.positions) console.log(p.symbol, p.size, p.unrealizedPnl);
 * console.log(`as of ${meta.asOf} (${meta.source}, ${meta.quality})`);
 *
 * for await (const leg of client.hyperliquid.positions.iterateChanges('0xabc...', {
 *   start: Date.now() - 7 * 86_400_000,
 *   end: Date.now(),
 *   symbol: 'BTC',
 * })) {
 *   console.log(leg.timestamp, leg.eventType, leg.endPosition);
 * }
 * ```
 */
export class HyperliquidPositionsResource extends PositionsRoutes {
  constructor(
    http: HttpClient,
    basePath: string = '/v1/hyperliquid',
    symbolTransform: (symbol: string) => string = (s) => s.toUpperCase(),
  ) {
    super(http, basePath, symbolTransform);
  }

  private walletPath(address: string, suffix: string): string {
    return `/wallets/${encodeURIComponent(address)}${suffix}`;
  }

  /**
   * Positions of one wallet: the latest live snapshot, or the state as of
   * `timestamp`. `data.account` holds the account summary on the first page;
   * `data.accountSeen` explains an empty result.
   */
  async get(address: string, params?: PositionsGetParams): Promise<PositionsResponse<WalletPositions>> {
    return this.page<WalletPositions>(
      this.walletPath(address, '/positions'),
      this.getQuery(params),
      WalletPositionsResponseSchema,
    );
  }

  /** Hourly position rows of one wallet over `[start, end)`. */
  async history(address: string, params: PositionsRangeParams): Promise<PositionsResponse<Position[]>> {
    return this.page<Position[]>(
      this.walletPath(address, '/positions/history'),
      this.rangeQuery(params),
      PositionArrayResponseSchema,
    );
  }

  /** Change-log legs of one wallet over `[start, end)`, clamped to `meta.builtThrough`. */
  async changes(address: string, params: PositionsRangeParams): Promise<PositionsResponse<PositionChange[]>> {
    return this.page<PositionChange[]>(
      this.walletPath(address, '/positions/changes'),
      this.rangeQuery(params),
      PositionChangeArrayResponseSchema,
    );
  }

  /**
   * Account summary at the latest live snapshot: one row on core; on HIP-3
   * one row per dex (or the one `dex` asked for).
   */
  async account(address: string, params?: PositionsAccountParams): Promise<PositionsResponse<AccountSummary[]>> {
    return this.page<AccountSummary[]>(
      this.walletPath(address, '/account'),
      { dex: params?.dex },
      AccountSummaryArrayResponseSchema,
    );
  }

  /** Hourly account summaries over `[start, end)`. */
  async accountHistory(
    address: string,
    params: PositionsAccountHistoryParams,
  ): Promise<PositionsResponse<AccountSummary[]>> {
    return this.page<AccountSummary[]>(
      this.walletPath(address, '/account/history'),
      {
        start: requiredMs(params?.start, 'start'),
        end: requiredMs(params?.end, 'end'),
        dex: params.dex,
        cursor: params.cursor,
        limit: params.limit,
      },
      AccountSummaryArrayResponseSchema,
    );
  }

  /**
   * Every open position in one market, largest position value first, at the
   * latest live snapshot or at `hour`. `meta.totals` (first page) holds the
   * long/short summary of the whole filtered set.
   */
  async market(symbol: string, params?: PositionsMarketParams): Promise<PositionsResponse<MarketPosition[]>> {
    return this.marketPage(symbol, params);
  }

  /**
   * Long/short counts, sizes, values, average entries and top-10 shares of one
   * market: the latest live snapshot (no `start`/`end`), or an hourly series.
   */
  async marketSummary(
    symbol: string,
    params?: PositionsMarketSummaryParams,
  ): Promise<PositionsResponse<MarketPositionsSummary[]>> {
    return this.summaryPage(symbol, params);
  }

  /** Every open position across markets at one committed hour (bulk). */
  async all(params: PositionsBulkParams): Promise<PositionsResponse<MarketPosition[]>> {
    return this.bulkPage(params);
  }

  /** Iterate every hourly position row of a wallet, following cursors. */
  iterateHistory(address: string, params: PositionsRangeParams): AsyncGenerator<Position, void, undefined> {
    return followCursor((cursor) => this.history(address, { ...params, cursor }), asRows, params.cursor);
  }

  /** Iterate every change-log leg of a wallet, following cursors. */
  iterateChanges(address: string, params: PositionsRangeParams): AsyncGenerator<PositionChange, void, undefined> {
    return followCursor((cursor) => this.changes(address, { ...params, cursor }), asRows, params.cursor);
  }

  /** Iterate every hourly account summary of a wallet, following cursors. */
  iterateAccountHistory(
    address: string,
    params: PositionsAccountHistoryParams,
  ): AsyncGenerator<AccountSummary, void, undefined> {
    return followCursor((cursor) => this.accountHistory(address, { ...params, cursor }), asRows, params.cursor);
  }

  /** Iterate every open position in one market at one snapshot, following cursors. */
  iterateMarket(symbol: string, params?: PositionsMarketParams): AsyncGenerator<MarketPosition, void, undefined> {
    return followCursor((cursor) => this.market(symbol, { ...params, cursor }), asRows, params?.cursor);
  }

  /** Iterate an hourly market summary series, following cursors. */
  iterateMarketSummary(
    symbol: string,
    params: PositionsMarketSummaryParams,
  ): AsyncGenerator<MarketPositionsSummary, void, undefined> {
    return followCursor((cursor) => this.marketSummary(symbol, { ...params, cursor }), asRows, params.cursor);
  }

  /** Iterate every open position at one hour across markets, following cursors. */
  iterateAll(params: PositionsBulkParams): AsyncGenerator<MarketPosition, void, undefined> {
    return followCursor((cursor) => this.all({ ...params, cursor }), asRows, params.cursor);
  }
}

/**
 * Account positions for HIP-3 (`client.hyperliquid.hip3.positions`). Same
 * methods as {@link HyperliquidPositionsResource}, plus an optional `dex`
 * filter on wallet and account reads. HIP-3 symbols are case-sensitive and
 * dex-prefixed (e.g. `xyz:TSLA`). An `account` read without a `dex` returns
 * one row per dex; `get` includes `data.account` only when `dex` is set.
 */
export class Hip3PositionsResource extends HyperliquidPositionsResource {
  constructor(http: HttpClient, basePath: string = '/v1/hyperliquid/hip3') {
    super(http, basePath, (s) => s);
  }

  override get(address: string, params?: Hip3PositionsGetParams): Promise<PositionsResponse<WalletPositions>> {
    return super.get(address, params);
  }

  override history(address: string, params: Hip3PositionsRangeParams): Promise<PositionsResponse<Position[]>> {
    return super.history(address, params);
  }

  override changes(address: string, params: Hip3PositionsRangeParams): Promise<PositionsResponse<PositionChange[]>> {
    return super.changes(address, params);
  }

  override iterateHistory(address: string, params: Hip3PositionsRangeParams): AsyncGenerator<Position, void, undefined> {
    return super.iterateHistory(address, params);
  }

  override iterateChanges(
    address: string,
    params: Hip3PositionsRangeParams,
  ): AsyncGenerator<PositionChange, void, undefined> {
    return super.iterateChanges(address, params);
  }
}

/**
 * Account positions for Lighter (`client.lighter.positions`, mainnet) and
 * Lighter on Robinhood Chain (`client.rhLighter.positions`).
 *
 * Account routes take an integer Lighter account index (resolve a mainnet L1
 * address with `client.lighter.accounts.byL1()`). The live snapshot refreshes
 * about every 2 minutes and hourly snapshots cover the whole history: mainnet
 * from 2025-01-17, Robinhood Chain from 2026-06-26. Perpetual markets only.
 * Settlement, insurance and other system accounts are left out of market
 * routes unless `includeSystem: true`, and every row names its `accountKind`.
 *
 * @example
 * ```typescript
 * const { data } = await client.lighter.positions.get(281474976623827);
 * const btcLongs = await client.rhLighter.positions.market('BTC', { side: 'long', minValue: 10_000 });
 * console.log(btcLongs.meta.totals?.longCount);
 * ```
 */
export class LighterPositionsResource extends PositionsRoutes {
  constructor(
    http: HttpClient,
    basePath: string = '/v1/lighter',
    symbolTransform: (symbol: string) => string = (s) => s.toUpperCase(),
  ) {
    super(http, basePath, symbolTransform);
  }

  private accountPath(accountIndex: LighterAccountIndex, suffix: string): string {
    return `/accounts/${accountIndexPath(accountIndex)}${suffix}`;
  }

  /**
   * Positions of one account: the latest live snapshot, or the state as of
   * `timestamp`. `data.account` carries the account's position aggregates on
   * the first page of a snapshot read without a `symbol` filter.
   */
  async get(accountIndex: LighterAccountIndex, params?: PositionsGetParams): Promise<PositionsResponse<WalletPositions>> {
    return this.page<WalletPositions>(
      this.accountPath(accountIndex, '/positions'),
      this.getQuery(params),
      WalletPositionsResponseSchema,
    );
  }

  /** Hourly position rows of one account over `[start, end)`. */
  async history(accountIndex: LighterAccountIndex, params: PositionsRangeParams): Promise<PositionsResponse<Position[]>> {
    return this.page<Position[]>(
      this.accountPath(accountIndex, '/positions/history'),
      this.rangeQuery(params),
      PositionArrayResponseSchema,
    );
  }

  /** Change-log legs of one account over `[start, end)`, clamped to `meta.builtThrough`. */
  async changes(
    accountIndex: LighterAccountIndex,
    params: PositionsRangeParams,
  ): Promise<PositionsResponse<PositionChange[]>> {
    return this.page<PositionChange[]>(
      this.accountPath(accountIndex, '/positions/changes'),
      this.rangeQuery(params),
      PositionChangeArrayResponseSchema,
    );
  }

  /**
   * Every open position in one perpetual market, largest position value
   * first, at the latest live snapshot or at `hour`. `meta.totals` (first
   * page) holds the long/short summary of the whole filtered set.
   */
  async market(symbol: string, params?: LighterPositionsMarketParams): Promise<PositionsResponse<MarketPosition[]>> {
    return this.marketPage(symbol, params);
  }

  /** Long/short summary of one market: the latest live snapshot, or an hourly series. */
  async marketSummary(
    symbol: string,
    params?: LighterPositionsMarketSummaryParams,
  ): Promise<PositionsResponse<MarketPositionsSummary[]>> {
    return this.summaryPage(symbol, params);
  }

  /** Every open position across markets at one committed hour (bulk). */
  async all(params: LighterPositionsBulkParams): Promise<PositionsResponse<MarketPosition[]>> {
    return this.bulkPage(params);
  }

  /** Iterate every hourly position row of an account, following cursors. */
  iterateHistory(accountIndex: LighterAccountIndex, params: PositionsRangeParams): AsyncGenerator<Position, void, undefined> {
    return followCursor((cursor) => this.history(accountIndex, { ...params, cursor }), asRows, params.cursor);
  }

  /** Iterate every change-log leg of an account, following cursors. */
  iterateChanges(
    accountIndex: LighterAccountIndex,
    params: PositionsRangeParams,
  ): AsyncGenerator<PositionChange, void, undefined> {
    return followCursor((cursor) => this.changes(accountIndex, { ...params, cursor }), asRows, params.cursor);
  }

  /** Iterate every open position in one market at one snapshot, following cursors. */
  iterateMarket(symbol: string, params?: LighterPositionsMarketParams): AsyncGenerator<MarketPosition, void, undefined> {
    return followCursor((cursor) => this.market(symbol, { ...params, cursor }), asRows, params?.cursor);
  }

  /** Iterate an hourly market summary series, following cursors. */
  iterateMarketSummary(
    symbol: string,
    params: LighterPositionsMarketSummaryParams,
  ): AsyncGenerator<MarketPositionsSummary, void, undefined> {
    return followCursor((cursor) => this.marketSummary(symbol, { ...params, cursor }), asRows, params.cursor);
  }

  /** Iterate every open position at one hour across markets, following cursors. */
  iterateAll(params: LighterPositionsBulkParams): AsyncGenerator<MarketPosition, void, undefined> {
    return followCursor((cursor) => this.all({ ...params, cursor }), asRows, params.cursor);
  }
}

/**
 * Lighter account lookup (`client.lighter.accounts`, mainnet only).
 *
 * @example
 * ```typescript
 * const { data } = await client.lighter.accounts.byL1('0xabc...');
 * console.log(`${data.totalAccounts} accounts`, data.accounts.map((a) => a.accountIndex));
 * ```
 */
export class LighterAccountsResource extends PositionsRoutes {
  constructor(http: HttpClient, basePath: string = '/v1/lighter') {
    super(http, basePath, (s) => s);
  }

  /** Account indices owned by an L1 (`0x`) address, with `totalAccounts`. */
  async byL1(l1Address: string, params?: LighterAccountsByL1Params): Promise<PositionsResponse<LighterL1Accounts>> {
    return this.page<LighterL1Accounts>(
      '/accounts',
      { l1_address: l1Address, cursor: params?.cursor, limit: params?.limit },
      LighterL1AccountsResponseSchema,
    );
  }

  /** Iterate every account owned by an L1 address, following cursors. */
  iterateByL1(l1Address: string, params?: LighterAccountsByL1Params): AsyncGenerator<LighterL1Account, void, undefined> {
    return followCursor(
      (cursor) => this.byL1(l1Address, { ...params, cursor }),
      (data) => data.accounts,
      params?.cursor,
    );
  }
}
