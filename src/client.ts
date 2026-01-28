import type { ClientOptions } from './types';
import { HttpClient } from './http';
import { HyperliquidClient, LighterClient } from './exchanges';
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
 * Supports multiple exchanges:
 * - `client.hyperliquid` - Hyperliquid perpetuals (April 2023+)
 * - `client.lighter` - Lighter.xyz perpetuals
 *
 * @example
 * ```typescript
 * import { OxArchive } from '@0xarchive/sdk';
 *
 * const client = new OxArchive({ apiKey: 'ox_your_api_key' });
 *
 * // Hyperliquid data
 * const hlOrderbook = await client.hyperliquid.orderbook.get('BTC');
 * console.log(`BTC mid price: ${hlOrderbook.mid_price}`);
 *
 * // Lighter.xyz data
 * const lighterOrderbook = await client.lighter.orderbook.get('BTC');
 *
 * // Get historical data
 * const history = await client.hyperliquid.orderbook.history('ETH', {
 *   start: Date.now() - 86400000,
 *   end: Date.now(),
 *   limit: 100
 * });
 *
 * // List all instruments
 * const instruments = await client.hyperliquid.instruments.list();
 * ```
 *
 * Legacy usage (deprecated, will be removed in v2.0):
 * ```typescript
 * // These still work but use client.hyperliquid.* instead
 * const orderbook = await client.orderbook.get('BTC');  // deprecated
 * ```
 */
export class OxArchive {
  private http: HttpClient;

  /**
   * Hyperliquid exchange data (orderbook, trades, funding, OI from April 2023)
   */
  public readonly hyperliquid: HyperliquidClient;

  /**
   * Lighter.xyz exchange data (August 2025+)
   */
  public readonly lighter: LighterClient;

  /**
   * @deprecated Use client.hyperliquid.orderbook instead
   */
  public readonly orderbook: OrderBookResource;

  /**
   * @deprecated Use client.hyperliquid.trades instead
   */
  public readonly trades: TradesResource;

  /**
   * @deprecated Use client.hyperliquid.instruments instead
   */
  public readonly instruments: InstrumentsResource;

  /**
   * @deprecated Use client.hyperliquid.funding instead
   */
  public readonly funding: FundingResource;

  /**
   * @deprecated Use client.hyperliquid.openInterest instead
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

    // Exchange-specific clients (recommended)
    this.hyperliquid = new HyperliquidClient(this.http);
    this.lighter = new LighterClient(this.http);

    // Legacy resource namespaces (deprecated - use client.hyperliquid.* instead)
    // These will be removed in v2.0
    // Note: Using /v1/hyperliquid base path for backward compatibility
    const legacyBase = '/v1/hyperliquid';
    this.orderbook = new OrderBookResource(this.http, legacyBase);
    this.trades = new TradesResource(this.http, legacyBase);
    this.instruments = new InstrumentsResource(this.http, legacyBase);
    this.funding = new FundingResource(this.http, legacyBase);
    this.openInterest = new OpenInterestResource(this.http, legacyBase);
  }
}
