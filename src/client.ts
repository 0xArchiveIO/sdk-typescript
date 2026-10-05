import type { z } from 'zod';
import type { ApiResponse, Capability, ClientOptions } from './types';
import { HttpClient } from './http';
import { CapabilitiesResponseSchema } from './schemas';
import { HyperliquidClient, LighterClient, RhLighterClient, SpotClient } from './exchanges';
import {
  OrderBookResource,
  TradesResource,
  InstrumentsResource,
  FundingResource,
  OpenInterestResource,
  DataQualityResource,
  Web3Resource,
  WebhooksResource,
  SymbolsResource,
} from './resources';

const DEFAULT_BASE_URL = 'https://api.0xarchive.io';
const DEFAULT_TIMEOUT = 30000;

/**
 * 0xarchive API client
 *
 * Two venues: Hyperliquid and Lighter. Lighter has two deployments: mainnet
 * and Robinhood Chain.
 * - `client.hyperliquid` - Hyperliquid perpetuals (order book from 2023-04-15)
 *   - `client.hyperliquid.hip3` - Hyperliquid HIP-3 builder perps under the Hyperliquid namespace
 *   - `client.hyperliquid.hip4` - Hyperliquid HIP-4 outcome markets
 * - `client.spot` - Hyperliquid Spot (candles from 2025-03-22 10:50 UTC;
 *   trades from 2025-03-22 10:50:22 UTC; order book, L4 and TWAP from 2026-05-05)
 * - `client.lighter` - Lighter, mainnet deployment
 * - `client.rhLighter` - Lighter, Robinhood Chain deployment (USDG-quoted)
 *
 * Webhook management is on `client.webhooks`, and the public symbol
 * universe with coverage per symbol on `client.symbols`. What each venue
 * serves, over REST and WebSocket, and from when, is `client.capabilities()`.
 *
 * Every request sends `0xArchive-Version: 2026-10-01` (`API_VERSION`), the
 * API contract this SDK parses. Failed requests throw `OxArchiveError`, whose
 * `errorCode` is one of `ERROR_CODES`.
 *
 * Account positions are on `client.hyperliquid.positions`,
 * `client.hyperliquid.hip3.positions`, `client.lighter.positions` and
 * `client.rhLighter.positions`.
 *
 * @example
 * ```typescript
 * import { OxArchive } from '@0xarchive/sdk';
 *
 * const client = new OxArchive({ apiKey: '0xa_your_api_key' });
 *
 * // Hyperliquid data
 * const hlOrderbook = await client.hyperliquid.orderbook.get('BTC');
 * console.log(`BTC mid price: ${hlOrderbook.mid_price}`);
 *
 * // Lighter data (mainnet, and the Robinhood Chain deployment)
 * const lighterOrderbook = await client.lighter.orderbook.get('BTC');
 * const rhOrderbook = await client.rhLighter.orderbook.get('BTC');
 *
 * // Account positions
 * const { data: wallet } = await client.hyperliquid.positions.get('0xabc...');
 *
 * // Hyperliquid HIP-3 data
 * const hip3Orderbook = await client.hyperliquid.hip3.orderbook.get('km:US500');
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
   * Lighter exchange data, mainnet deployment. Trade history begins January 17, 2025; exact starts vary by market and data type.
   */
  public readonly lighter: LighterClient;

  /**
   * Lighter on Robinhood Chain: the second Lighter deployment (USDG-quoted;
   * perpetuals like `BTC`, spot like `AAPL-USDG`). The same resources as
   * `client.lighter` except the L3 order book. Trades and liquidations from
   * 2026-06-26 20:10:26 UTC; order book, open interest and funding from
   * 2026-08-22 18:43 UTC.
   */
  public readonly rhLighter: RhLighterClient;

  /**
   * Hyperliquid Spot exchange data. Candle history is served from
   * 2025-03-22 10:50 UTC and trades from 2025-03-22 10:50:22 UTC; order book,
   * L4, and TWAP statuses from 2026-05-05. Symbols are dashed
   * canonical (e.g. `HYPE-USDC`).
   */
  public readonly spot: SpotClient;

  /**
   * Data quality metrics: status, coverage, incidents, latency, SLA
   */
  public readonly dataQuality: DataQualityResource;

  /**
   * Wallet-based auth: get API keys via SIWE signature
   */
  public readonly web3: Web3Resource;

  /**
   * Webhooks: endpoints, subscriptions, watched wallets, deliveries, the
   * event catalog, plan limits and the estimate and dry-run previews. Pair
   * with `verifyWebhookSignature` or `constructWebhookEvent` on your receiver.
   */
  public readonly webhooks: WebhooksResource;

  /**
   * The public symbol universe across every venue family, with coverage
   * dates and data types per symbol (`GET /v1/symbols`).
   */
  public readonly symbols: SymbolsResource;

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
    this.rhLighter = new RhLighterClient(this.http);
    this.spot = new SpotClient(this.http);

    // Data quality monitoring (cross-exchange)
    this.dataQuality = new DataQualityResource(this.http);

    // Web3 wallet-based authentication
    this.web3 = new Web3Resource(this.http);

    // Webhooks (endpoints, subscriptions, watched addresses, deliveries)
    this.webhooks = new WebhooksResource(this.http);

    // Public symbol universe (cross-venue)
    this.symbols = new SymbolsResource(this.http);

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

  /**
   * What each venue serves (`GET /v1/capabilities`): one row per venue and
   * datatype with the REST routes, the WebSocket channels and whether they
   * stream live and replay, the first served instant (`availableFrom`),
   * cadence, page limit and accepted intervals. Public and cached by the API
   * for five minutes; no credits are used.
   *
   * @example
   * ```typescript
   * const rows = await client.capabilities();
   * const replayable = rows.filter((r) => r.replay).flatMap((r) => r.wsChannels);
   * const hip3Trades = rows.find((r) => r.venue === 'hip3' && r.datatype === 'trades');
   * console.log(hip3Trades?.availableFrom, hip3Trades?.pageLimit);
   * ```
   */
  async capabilities(): Promise<Capability[]> {
    const response = await this.http.get<ApiResponse<Capability[]>>(
      '/v1/capabilities',
      undefined,
      this.http.validationEnabled
        ? (CapabilitiesResponseSchema as unknown as z.ZodType<ApiResponse<Capability[]>>)
        : undefined
    );
    return response.data;
  }
}
