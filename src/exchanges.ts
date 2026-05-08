import type { HttpClient } from './http';
import type { ApiResponse, CursorResponse, CoinFreshness, CoinSummary, PriceSnapshot, PriceHistoryParams } from './types';
import {
  OrderBookResource,
  TradesResource,
  InstrumentsResource,
  LighterInstrumentsResource,
  Hip3InstrumentsResource,
  Hip4InstrumentsResource,
  Hip4OutcomesResource,
  FundingResource,
  OpenInterestResource,
  CandlesResource,
  LiquidationsResource,
  OrdersResource,
  L4OrderBookResource,
  L2OrderBookResource,
  L3OrderBookResource,
  SpotPairsResource,
  SpotTwapResource,
} from './resources';
import {
  CoinFreshnessResponseSchema,
  CoinSummaryResponseSchema,
  PriceSnapshotArrayResponseSchema,
} from './schemas';

/**
 * Hyperliquid exchange client
 *
 * Access Hyperliquid market data through the 0xarchive API.
 *
 * @example
 * ```typescript
 * const client = new OxArchive({ apiKey: '...' });
 * const orderbook = await client.hyperliquid.orderbook.get('BTC');
 * const trades = await client.hyperliquid.trades.list('ETH', { start, end });
 * ```
 */
export class HyperliquidClient {
  /**
   * Order book data (L2 snapshots from April 2023)
   */
  public readonly orderbook: OrderBookResource;

  /**
   * Trade/fill history
   */
  public readonly trades: TradesResource;

  /**
   * Trading instruments metadata
   */
  public readonly instruments: InstrumentsResource;

  /**
   * Funding rates
   */
  public readonly funding: FundingResource;

  /**
   * Open interest
   */
  public readonly openInterest: OpenInterestResource;

  /**
   * OHLCV candle data
   */
  public readonly candles: CandlesResource;

  /**
   * Liquidation events (May 2025+)
   */
  public readonly liquidations: LiquidationsResource;

  /**
   * Order history, flow, and TP/SL
   */
  public readonly orders: OrdersResource;

  /**
   * L4 order book (snapshots, diffs, history)
   */
  public readonly l4Orderbook: L4OrderBookResource;

  /**
   * L2 full-depth order book (derived from L4)
   */
  public readonly l2Orderbook: L2OrderBookResource;

  /**
   * HIP-3 builder-deployed perpetuals (February 2026+)
   */
  public readonly hip3: Hip3Client;

  /**
   * HIP-4 outcome markets (binary YES/NO; May 2026+)
   */
  public readonly hip4: Hip4Client;

  private http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
    const basePath = '/v1/hyperliquid';
    this.orderbook = new OrderBookResource(http, basePath);
    this.trades = new TradesResource(http, basePath);
    this.instruments = new InstrumentsResource(http, basePath);
    this.funding = new FundingResource(http, basePath);
    this.openInterest = new OpenInterestResource(http, basePath);
    this.candles = new CandlesResource(http, basePath);
    this.liquidations = new LiquidationsResource(http, basePath);
    this.orders = new OrdersResource(http, basePath);
    this.l4Orderbook = new L4OrderBookResource(http, basePath);
    this.l2Orderbook = new L2OrderBookResource(http, basePath);
    this.hip3 = new Hip3Client(http);
    this.hip4 = new Hip4Client(http);
  }

  /**
   * Get per-symbol data freshness across all data types
   *
   * @param symbol - The symbol (e.g., 'BTC', 'ETH')
   * @returns Per-symbol freshness with last_updated and lag_ms for each data type
   */
  async freshness(symbol: string): Promise<CoinFreshness> {
    const response = await this.http.get<ApiResponse<CoinFreshness>>(
      `/v1/hyperliquid/freshness/${symbol.toUpperCase()}`,
      undefined,
      this.http.validationEnabled ? CoinFreshnessResponseSchema as any : undefined
    );
    return response.data;
  }

  /**
   * Get combined market summary (price, funding, OI, volume, liquidations) in one call
   *
   * @param symbol - The symbol (e.g., 'BTC', 'ETH')
   * @returns Combined market summary
   */
  async summary(symbol: string): Promise<CoinSummary> {
    const response = await this.http.get<ApiResponse<CoinSummary>>(
      `/v1/hyperliquid/summary/${symbol.toUpperCase()}`,
      undefined,
      this.http.validationEnabled ? CoinSummaryResponseSchema as any : undefined
    );
    return response.data;
  }

  /**
   * Get mark/oracle/mid price history (projected from OI data)
   *
   * @param symbol - The symbol (e.g., 'BTC', 'ETH')
   * @param params - Time range, cursor, and interval parameters
   * @returns CursorResponse with price snapshots
   */
  async priceHistory(symbol: string, params: PriceHistoryParams): Promise<CursorResponse<PriceSnapshot[]>> {
    const response = await this.http.get<ApiResponse<PriceSnapshot[]>>(
      `/v1/hyperliquid/prices/${symbol.toUpperCase()}`,
      params as unknown as Record<string, unknown>,
      this.http.validationEnabled ? PriceSnapshotArrayResponseSchema as any : undefined
    );
    return {
      data: response.data,
      nextCursor: response.meta.nextCursor,
    };
  }
}

/**
 * HIP-3 builder-deployed perpetuals client
 *
 * Access Hyperliquid HIP-3 builder perps data through the 0xarchive API.
 * Free: km:US500 only. Build+: all coins. Orderbook: Pro+.
 *
 * @example
 * ```typescript
 * const client = new OxArchive({ apiKey: '...' });
 * const orderbook = await client.hyperliquid.hip3.orderbook.get('xyz:XYZ100');
 * const trades = await client.hyperliquid.hip3.trades.recent('xyz:XYZ100');
 * ```
 */
export class Hip3Client {
  /**
   * HIP-3 instruments with latest market data
   */
  public readonly instruments: Hip3InstrumentsResource;

  /**
   * Order book snapshots (February 2026+)
   */
  public readonly orderbook: OrderBookResource;

  /**
   * Trade/fill history
   */
  public readonly trades: TradesResource;

  /**
   * Funding rates
   */
  public readonly funding: FundingResource;

  /**
   * Open interest
   */
  public readonly openInterest: OpenInterestResource;

  /**
   * OHLCV candle data
   */
  public readonly candles: CandlesResource;

  /**
   * Liquidation events
   */
  public readonly liquidations: LiquidationsResource;

  /**
   * Order history, flow, and TP/SL
   */
  public readonly orders: OrdersResource;

  /**
   * L4 order book (snapshots, diffs, history)
   */
  public readonly l4Orderbook: L4OrderBookResource;

  /**
   * L2 full-depth order book (derived from L4)
   */
  public readonly l2Orderbook: L2OrderBookResource;

  private http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
    const basePath = '/v1/hyperliquid/hip3';
    // HIP-3 coins use case-sensitive symbols like 'xyz:XYZ100' — do not uppercase
    const coinTransform = (c: string) => c;
    this.instruments = new Hip3InstrumentsResource(http, basePath, coinTransform);
    this.orderbook = new OrderBookResource(http, basePath, coinTransform);
    this.trades = new TradesResource(http, basePath, coinTransform);
    this.funding = new FundingResource(http, basePath, coinTransform);
    this.openInterest = new OpenInterestResource(http, basePath, coinTransform);
    this.candles = new CandlesResource(http, basePath, coinTransform);
    this.liquidations = new LiquidationsResource(http, basePath, coinTransform);
    this.orders = new OrdersResource(http, basePath, coinTransform);
    this.l4Orderbook = new L4OrderBookResource(http, basePath, coinTransform);
    this.l2Orderbook = new L2OrderBookResource(http, basePath, coinTransform);
  }

  /**
   * Get per-symbol data freshness across all data types
   *
   * @param symbol - The symbol (case-sensitive, e.g., 'km:US500')
   * @returns Per-symbol freshness with last_updated and lag_ms for each data type
   */
  async freshness(symbol: string): Promise<CoinFreshness> {
    const response = await this.http.get<ApiResponse<CoinFreshness>>(
      `/v1/hyperliquid/hip3/freshness/${symbol}`,
      undefined,
      this.http.validationEnabled ? CoinFreshnessResponseSchema as any : undefined
    );
    return response.data;
  }

  /**
   * Get combined market summary (price, funding, OI) in one call
   *
   * @param symbol - The symbol (case-sensitive, e.g., 'km:US500')
   * @returns Combined market summary
   */
  async summary(symbol: string): Promise<CoinSummary> {
    const response = await this.http.get<ApiResponse<CoinSummary>>(
      `/v1/hyperliquid/hip3/summary/${symbol}`,
      undefined,
      this.http.validationEnabled ? CoinSummaryResponseSchema as any : undefined
    );
    return response.data;
  }

  /**
   * Get mark/oracle/mid price history (projected from OI data)
   *
   * @param symbol - The symbol (case-sensitive, e.g., 'km:US500')
   * @param params - Time range, cursor, and interval parameters
   * @returns CursorResponse with price snapshots
   */
  async priceHistory(symbol: string, params: PriceHistoryParams): Promise<CursorResponse<PriceSnapshot[]>> {
    const response = await this.http.get<ApiResponse<PriceSnapshot[]>>(
      `/v1/hyperliquid/hip3/prices/${symbol}`,
      params as unknown as Record<string, unknown>,
      this.http.validationEnabled ? PriceSnapshotArrayResponseSchema as any : undefined
    );
    return {
      data: response.data,
      nextCursor: response.meta.nextCursor,
    };
  }
}

/**
 * HIP-4 outcome-market client
 *
 * Access Hyperliquid HIP-4 binary outcome markets through the 0xarchive API.
 *
 * Coin format: `#<10*outcome_id + side>` (e.g. `#0` is outcome 0 / Yes, `#1` is outcome 0 / No).
 * The backend accepts both the bare numeric form (`0`, `1`) and the on-chain
 * `#`-prefixed form (`#0`, `#1`). The SDK URL-encodes coins on the wire so that
 * the `#`-prefixed form survives transit (`#` is the URL-fragment delimiter and
 * would otherwise be stripped by `fetch`). Either form works; pass whichever is
 * convenient.
 *
 * `mark_price` (and `midPrice`) for HIP-4 is an implied probability in [0, 1],
 * not a USD price. HIP-4 markets are fully collateralized so there are no
 * funding rates, no liquidations, and no candles by design.
 *
 * Tier gating mirrors HIP-3: Pro+ for L4 / full orderbook / orders, Build+ for everything else.
 *
 * @example
 * ```typescript
 * const client = new OxArchive({ apiKey: '...' });
 *
 * // Both forms work — the SDK encodes `#` to `%23` on the wire so the
 * // path makes it through `fetch` intact.
 * const orderbook = await client.hyperliquid.hip4.getOrderbook('#0');
 * const orderbookAlt = await client.hyperliquid.hip4.getOrderbook('0');
 *
 * // Filter outcomes by slug
 * const outcomes = await client.hyperliquid.hip4.listOutcomes({ isSettled: false });
 * const bySlug = await client.hyperliquid.hip4.getOutcomeBySlug('btc-above-78213-may-04-0600');
 * ```
 */
export class Hip4Client {
  /**
   * HIP-4 per-side instruments (one row per `#N`).
   */
  public readonly instruments: Hip4InstrumentsResource;

  /**
   * HIP-4 per-outcome aggregates (one row per outcome). HIP-4-specific, no HIP-3 analog.
   */
  public readonly outcomes: Hip4OutcomesResource;

  /**
   * L2 orderbook snapshots (Pro+).
   */
  public readonly orderbook: OrderBookResource;

  /**
   * Trade/fill history.
   */
  public readonly trades: TradesResource;

  /**
   * Open interest (per side).
   */
  public readonly openInterest: OpenInterestResource;

  /**
   * Order history, flow, and TP/SL (Pro+).
   */
  public readonly orders: OrdersResource;

  /**
   * L4 orderbook (snapshots, diffs, history).
   */
  public readonly l4Orderbook: L4OrderBookResource;

  /**
   * L2 full-depth orderbook (derived from L4).
   */
  public readonly l2Orderbook: L2OrderBookResource;

  private http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
    const basePath = '/v1/hyperliquid/hip4';
    // HIP-4 coins like `#0` contain `#`, which `fetch` (and the WHATWG URL
    // parser underneath it) treats as a URL fragment delimiter. Without
    // encoding, the path `/v1/.../trades/#0/recent` arrives at the server as
    // `/v1/.../trades/` and the rest is silently dropped — the user gets a
    // 404 with an empty body and a confusing `Unexpected end of JSON input`
    // from the JSON parser. Encoding `#` to `%23` makes both the bare form
    // (`'0'`) and the canonical `#`-prefixed form (`'#0'`, the form the API
    // returns in `coin` fields) work. `encodeURIComponent` is a no-op for
    // the bare-numeric form, so this is purely additive.
    const coinTransform = (c: string) => encodeURIComponent(c);
    this.instruments = new Hip4InstrumentsResource(http, basePath, coinTransform);
    this.outcomes = new Hip4OutcomesResource(http, basePath);
    this.orderbook = new OrderBookResource(http, basePath, coinTransform);
    this.trades = new TradesResource(http, basePath, coinTransform);
    this.openInterest = new OpenInterestResource(http, basePath, coinTransform);
    this.orders = new OrdersResource(http, basePath, coinTransform);
    this.l4Orderbook = new L4OrderBookResource(http, basePath, coinTransform);
    this.l2Orderbook = new L2OrderBookResource(http, basePath, coinTransform);
  }

  /** @internal Encode a HIP-4 coin for use in URL paths. */
  private encodeCoin(coin: string): string {
    return encodeURIComponent(coin);
  }

  /**
   * List per-outcome aggregates. `aggregatedOi` is omitted on list responses.
   */
  async listOutcomes(params?: import('./types').Hip4ListOutcomesParams): Promise<CursorResponse<import('./types').Hip4OutcomeAggregate[]>> {
    return this.outcomes.list(params);
  }

  /**
   * Get a single outcome aggregate (includes `aggregatedOi`).
   */
  async getOutcome(outcomeId: number | string): Promise<import('./types').Hip4OutcomeAggregate> {
    return this.outcomes.get(outcomeId);
  }

  /**
   * Look up an outcome aggregate by slug. Accepts the per-outcome slug
   * (e.g. `btc-above-78213-may-04-0600`) OR a per-side slug
   * (e.g. `btc-above-78213-yes-may-04-0600`). Includes `aggregatedOi`.
   */
  async getOutcomeBySlug(slug: string): Promise<import('./types').Hip4OutcomeAggregate> {
    return this.outcomes.getBySlug(slug);
  }

  /**
   * List all per-side instruments (one row per `#N`).
   */
  async getInstruments(): Promise<import('./types').Hip4Outcome[]> {
    return this.instruments.list();
  }

  /**
   * Get a single per-side instrument by coin (e.g. `#0`).
   */
  async getInstrument(coin: string): Promise<import('./types').Hip4Outcome> {
    return this.instruments.get(coin);
  }

  /**
   * Get current L2 orderbook snapshot for a HIP-4 coin (Pro+).
   * @param coin Coin string with leading `#` (e.g. `#0`).
   */
  async getOrderbook(coin: string, params?: import('./types').GetOrderBookParams) {
    return this.orderbook.get(coin, params);
  }

  /**
   * Get historical L2 orderbook snapshots for a HIP-4 coin (Pro+).
   */
  async getOrderbookHistory(coin: string, params: import('./types').OrderBookHistoryParams) {
    return this.orderbook.history(coin, params);
  }

  /**
   * Get historical fills for a HIP-4 coin.
   */
  async getTrades(coin: string, params: import('./types').GetTradesCursorParams) {
    return this.trades.list(coin, params);
  }

  /**
   * Get most recent N fills for a HIP-4 coin (latest first).
   */
  async getTradesRecent(coin: string, limit?: number) {
    return this.trades.recent(coin, limit);
  }

  /**
   * Get per-side open interest history for a HIP-4 coin.
   * Note: `markPrice` on the response is an implied probability (0..1), not USD.
   */
  async getOpenInterest(coin: string, params: import('./types').OpenInterestHistoryParams) {
    return this.openInterest.history(coin, params);
  }

  /**
   * Get current per-side open interest for a HIP-4 coin.
   * Note: `markPrice` on the response is an implied probability (0..1), not USD.
   */
  async getOpenInterestCurrent(coin: string) {
    return this.openInterest.current(coin);
  }

  /**
   * Get combined market summary for a HIP-4 coin.
   * @param coin Either bare numeric form (`'0'`) or `#`-prefixed form (`'#0'`). The SDK URL-encodes `#` so both work.
   */
  async getSummary(coin: string): Promise<CoinSummary> {
    const response = await this.http.get<ApiResponse<CoinSummary>>(
      `/v1/hyperliquid/hip4/summary/${this.encodeCoin(coin)}`,
      undefined,
      this.http.validationEnabled ? CoinSummaryResponseSchema as any : undefined
    );
    return response.data;
  }

  /**
   * Get per-symbol data freshness across all HIP-4 data types.
   * @param coin Either bare numeric form (`'0'`) or `#`-prefixed form (`'#0'`). The SDK URL-encodes `#` so both work.
   */
  async getFreshness(coin: string): Promise<CoinFreshness> {
    const response = await this.http.get<ApiResponse<CoinFreshness>>(
      `/v1/hyperliquid/hip4/freshness/${this.encodeCoin(coin)}`,
      undefined,
      this.http.validationEnabled ? CoinFreshnessResponseSchema as any : undefined
    );
    return response.data;
  }

  /**
   * Get mid-price history for a HIP-4 coin.
   * Note: returned `markPrice`/`midPrice` are probabilities (0..1), not USD.
   * @param coin Either bare numeric form (`'0'`) or `#`-prefixed form (`'#0'`). The SDK URL-encodes `#` so both work.
   */
  async getPrices(coin: string, params: PriceHistoryParams): Promise<CursorResponse<PriceSnapshot[]>> {
    const response = await this.http.get<ApiResponse<PriceSnapshot[]>>(
      `/v1/hyperliquid/hip4/prices/${this.encodeCoin(coin)}`,
      params as unknown as Record<string, unknown>,
      this.http.validationEnabled ? PriceSnapshotArrayResponseSchema as any : undefined
    );
    return {
      data: response.data,
      nextCursor: response.meta.nextCursor,
    };
  }

  /**
   * Get order lifecycle events for a HIP-4 coin (Pro+).
   */
  async getOrderHistory(coin: string, params: import('./resources/orders').OrderHistoryParams) {
    return this.orders.history(coin, params);
  }

  /**
   * Get time-bucketed order-flow aggregates for a HIP-4 coin (Pro+).
   */
  async getOrderFlow(coin: string, params: import('./resources/orders').OrderFlowParams) {
    return this.orders.flow(coin, params);
  }

  /**
   * Get TP/SL orders for a HIP-4 coin (Pro+).
   */
  async getTpsl(coin: string, params: import('./resources/orders').TpslParams) {
    return this.orders.tpsl(coin, params);
  }

  /**
   * Get full L4 reconstruction (current) for a HIP-4 coin (Pro+).
   */
  async getL4Orderbook(coin: string, params?: import('./resources/l4-orderbook').L4OrderBookParams) {
    return this.l4Orderbook.get(coin, params);
  }

  /**
   * Get L4 diffs (event stream) for a HIP-4 coin (Pro+).
   */
  async getL4Diffs(coin: string, params: import('./types').CursorPaginationParams) {
    return this.l4Orderbook.diffs(coin, params);
  }

  /**
   * Get L4 checkpoint history for a HIP-4 coin (Build+; hard cap limit=10).
   */
  async getL4History(coin: string, params: import('./types').CursorPaginationParams) {
    return this.l4Orderbook.history(coin, params);
  }
}

/**
 * Hyperliquid Spot exchange client.
 *
 * Access Hyperliquid Spot data through the 0xarchive API. Symbols are
 * dashed canonical (`HYPE-USDC`, `PURR-USDC`); the server resolves the
 * dashed form to Hyperliquid's wire formats (`PURR/USDC`, `@107`)
 * internally.
 *
 * Spot has no funding, no open interest, no liquidations, and no candles
 * by design (those are perpetual constructs). The SDK intentionally omits
 * those resources from the spot client.
 *
 * Coverage:
 * - Trades: from 2025-03-22 (HL S3 backfill).
 * - Orderbook, L4 diffs, L4 orders, TWAP statuses: live from 2026-05-05.
 *
 * Tier gating mirrors HIP-3: Pro+ for L4 / order lifecycle, Build+ for
 * everything else.
 *
 * @example
 * ```typescript
 * const client = new OxArchive({ apiKey: '0xa_...' });
 *
 * const orderbook = await client.spot.orderbook.get('HYPE-USDC');
 * const recentTrades = await client.spot.trades.recent('HYPE-USDC');
 * const pairs = await client.spot.pairs.list();
 *
 * // L4 (Pro+)
 * const l4 = await client.spot.l4Orderbook.get('HYPE-USDC');
 * const diffs = await client.spot.l4Orderbook.diffs('HYPE-USDC', { start, end });
 *
 * // TWAP statuses (Build+)
 * const byUser = await client.spot.twap.byUser('0xabc...', { start, end });
 * ```
 */
export class SpotClient {
  /** Spot pair metadata (one row per dashed symbol). */
  public readonly pairs: SpotPairsResource;

  /** L2 order book snapshots (live from 2026-05-05). */
  public readonly orderbook: OrderBookResource;

  /** Trade history (S3 backfill from 2025-03-22, live since). */
  public readonly trades: TradesResource;

  /** Order lifecycle events (Pro+; live from 2026-05-05). */
  public readonly orders: OrdersResource;

  /** L4 order book: snapshots, diffs, and checkpoint history. */
  public readonly l4Orderbook: L4OrderBookResource;

  /** TWAP statuses by symbol or by user wallet (Build+). */
  public readonly twap: SpotTwapResource;

  private http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
    const basePath = '/v1/hyperliquid/spot';
    // Spot symbols are dashed canonical (HYPE-USDC). Uppercasing is a no-op
    // for already-canonical input and forgiving for lowercased input.
    const coinTransform = (c: string) => c.toUpperCase();
    this.pairs = new SpotPairsResource(http, basePath, coinTransform);
    this.orderbook = new OrderBookResource(http, basePath, coinTransform);
    this.trades = new TradesResource(http, basePath, coinTransform);
    this.orders = new OrdersResource(http, basePath, coinTransform);
    this.l4Orderbook = new L4OrderBookResource(http, basePath, coinTransform);
    this.twap = new SpotTwapResource(http, basePath, coinTransform);
  }

  /**
   * Get per-symbol data freshness across all spot data types.
   *
   * @param symbol Dashed canonical (e.g. `HYPE-USDC`).
   */
  async freshness(symbol: string): Promise<CoinFreshness> {
    const response = await this.http.get<ApiResponse<CoinFreshness>>(
      `/v1/hyperliquid/spot/freshness/${symbol.toUpperCase()}`,
      undefined,
      this.http.validationEnabled ? CoinFreshnessResponseSchema as any : undefined,
    );
    return response.data;
  }
}

/**
 * Lighter.xyz exchange client
 *
 * Access Lighter.xyz market data through the 0xarchive API.
 *
 * @example
 * ```typescript
 * const client = new OxArchive({ apiKey: '...' });
 * const orderbook = await client.lighter.orderbook.get('BTC');
 * const trades = await client.lighter.trades.list('ETH', { start, end });
 * const instruments = await client.lighter.instruments.list();
 * console.log(`ETH taker fee: ${instruments[0].takerFee}`);
 * ```
 */
export class LighterClient {
  /**
   * Order book data (L2 snapshots)
   */
  public readonly orderbook: OrderBookResource;

  /**
   * Trade/fill history
   */
  public readonly trades: TradesResource;

  /**
   * Trading instruments metadata (returns LighterInstrument with fees, min amounts, etc.)
   */
  public readonly instruments: LighterInstrumentsResource;

  /**
   * Funding rates
   */
  public readonly funding: FundingResource;

  /**
   * Open interest
   */
  public readonly openInterest: OpenInterestResource;

  /**
   * OHLCV candle data
   */
  public readonly candles: CandlesResource;

  /**
   * L3 order book (Lighter only)
   */
  public readonly l3Orderbook: L3OrderBookResource;

  private http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
    const basePath = '/v1/lighter';
    this.orderbook = new OrderBookResource(http, basePath);
    this.trades = new TradesResource(http, basePath);
    this.instruments = new LighterInstrumentsResource(http, basePath);
    this.funding = new FundingResource(http, basePath);
    this.openInterest = new OpenInterestResource(http, basePath);
    this.candles = new CandlesResource(http, basePath);
    this.l3Orderbook = new L3OrderBookResource(http, basePath);
  }

  /**
   * Get per-symbol data freshness across all data types
   *
   * @param symbol - The symbol (e.g., 'BTC', 'ETH')
   * @returns Per-symbol freshness with last_updated and lag_ms for each data type
   */
  async freshness(symbol: string): Promise<CoinFreshness> {
    const response = await this.http.get<ApiResponse<CoinFreshness>>(
      `/v1/lighter/freshness/${symbol.toUpperCase()}`,
      undefined,
      this.http.validationEnabled ? CoinFreshnessResponseSchema as any : undefined
    );
    return response.data;
  }

  /**
   * Get combined market summary (price, funding, OI) in one call
   *
   * @param symbol - The symbol (e.g., 'BTC', 'ETH')
   * @returns Combined market summary
   */
  async summary(symbol: string): Promise<CoinSummary> {
    const response = await this.http.get<ApiResponse<CoinSummary>>(
      `/v1/lighter/summary/${symbol.toUpperCase()}`,
      undefined,
      this.http.validationEnabled ? CoinSummaryResponseSchema as any : undefined
    );
    return response.data;
  }

  /**
   * Get mark/oracle price history (projected from OI data)
   *
   * @param symbol - The symbol (e.g., 'BTC', 'ETH')
   * @param params - Time range, cursor, and interval parameters
   * @returns CursorResponse with price snapshots
   */
  async priceHistory(symbol: string, params: PriceHistoryParams): Promise<CursorResponse<PriceSnapshot[]>> {
    const response = await this.http.get<ApiResponse<PriceSnapshot[]>>(
      `/v1/lighter/prices/${symbol.toUpperCase()}`,
      params as unknown as Record<string, unknown>,
      this.http.validationEnabled ? PriceSnapshotArrayResponseSchema as any : undefined
    );
    return {
      data: response.data,
      nextCursor: response.meta.nextCursor,
    };
  }
}
