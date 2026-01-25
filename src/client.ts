import type { ClientOptions } from './types';
import { HttpClient } from './http';
import {
  OrderBookResource,
  TradesResource,
  InstrumentsResource,
  FundingResource,
  OpenInterestResource,
} from './resources';

const DEFAULT_BASE_URL = 'https://api.0xarchive.io';
const DEFAULT_TIMEOUT = 30000;

/**
 * 0xarchive API client
 *
 * @example
 * ```typescript
 * import { OxArchive } from '@0xarchive/sdk';
 *
 * const client = new OxArchive({ apiKey: 'ox_your_api_key' });
 *
 * // Get current order book
 * const orderbook = await client.orderbook.get('BTC');
 * console.log(`BTC mid price: ${orderbook.mid_price}`);
 *
 * // Get historical data
 * const history = await client.orderbook.history('ETH', {
 *   start: Date.now() - 86400000,
 *   end: Date.now(),
 *   limit: 100
 * });
 *
 * // List all instruments
 * const instruments = await client.instruments.list();
 * ```
 */
export class OxArchive {
  private http: HttpClient;

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
   * Create a new 0xarchive client
   *
   * @param options - Client configuration options
   */
  constructor(options: ClientOptions) {
    if (!options.apiKey) {
      throw new Error('API key is required. Get one at https://0xarchive.io/signup');
    }

    this.http = new HttpClient({
      baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
      apiKey: options.apiKey,
      timeout: options.timeout ?? DEFAULT_TIMEOUT,
      validate: options.validate ?? false,
    });

    // Initialize resource namespaces
    this.orderbook = new OrderBookResource(this.http);
    this.trades = new TradesResource(this.http);
    this.instruments = new InstrumentsResource(this.http);
    this.funding = new FundingResource(this.http);
    this.openInterest = new OpenInterestResource(this.http);
  }
}
