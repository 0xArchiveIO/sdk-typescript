import type { HttpClient } from './http';
import {
  OrderBookResource,
  TradesResource,
  InstrumentsResource,
  LighterInstrumentsResource,
  FundingResource,
  OpenInterestResource,
  CandlesResource,
  LiquidationsResource,
} from './resources';

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
   * HIP-3 builder-deployed perpetuals (Pro+ only, February 2026+)
   */
  public readonly hip3: Hip3Client;

  constructor(http: HttpClient) {
    const basePath = '/v1/hyperliquid';
    this.orderbook = new OrderBookResource(http, basePath);
    this.trades = new TradesResource(http, basePath);
    this.instruments = new InstrumentsResource(http, basePath);
    this.funding = new FundingResource(http, basePath);
    this.openInterest = new OpenInterestResource(http, basePath);
    this.candles = new CandlesResource(http, basePath);
    this.liquidations = new LiquidationsResource(http, basePath);
    this.hip3 = new Hip3Client(http);
  }
}

/**
 * HIP-3 builder-deployed perpetuals client
 *
 * Access Hyperliquid HIP-3 builder perps data through the 0xarchive API.
 * Requires Pro tier or higher.
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

  constructor(http: HttpClient) {
    const basePath = '/v1/hyperliquid/hip3';
    // HIP-3 coins use case-sensitive symbols like 'xyz:XYZ100' — do not uppercase
    const coinTransform = (c: string) => c;
    this.orderbook = new OrderBookResource(http, basePath, coinTransform);
    this.trades = new TradesResource(http, basePath, coinTransform);
    this.funding = new FundingResource(http, basePath, coinTransform);
    this.openInterest = new OpenInterestResource(http, basePath, coinTransform);
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

  constructor(http: HttpClient) {
    const basePath = '/v1/lighter';
    this.orderbook = new OrderBookResource(http, basePath);
    this.trades = new TradesResource(http, basePath);
    this.instruments = new LighterInstrumentsResource(http, basePath);
    this.funding = new FundingResource(http, basePath);
    this.openInterest = new OpenInterestResource(http, basePath);
    this.candles = new CandlesResource(http, basePath);
  }
}
