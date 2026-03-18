import type { HttpClient } from './http';
import type { ApiResponse, CursorResponse, CoinFreshness, CoinSummary, PriceSnapshot, PriceHistoryParams } from './types';
import {
  OrderBookResource,
  TradesResource,
  InstrumentsResource,
  LighterInstrumentsResource,
  Hip3InstrumentsResource,
  FundingResource,
  OpenInterestResource,
  CandlesResource,
  LiquidationsResource,
  OrdersResource,
  L4OrderBookResource,
  L3OrderBookResource,
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
   * HIP-3 builder-deployed perpetuals (February 2026+)
   */
  public readonly hip3: Hip3Client;

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
    this.hip3 = new Hip3Client(http);
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
