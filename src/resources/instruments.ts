import type { HttpClient } from '../http';
import type { ApiResponse, Hip3Instrument, Instrument, LighterInstrument } from '../types';
import { InstrumentResponseSchema, InstrumentArrayResponseSchema } from '../schemas';

/**
 * Instruments API resource
 *
 * @example
 * ```typescript
 * // List all instruments
 * const instruments = await client.instruments.list();
 *
 * // Get specific instrument
 * const btc = await client.instruments.get('BTC');
 * ```
 */
export class InstrumentsResource {
  constructor(private http: HttpClient, private basePath: string = '/v1') {}

  /**
   * List all available trading instruments
   *
   * @returns Array of instruments
   */
  async list(): Promise<Instrument[]> {
    const response = await this.http.get<ApiResponse<Instrument[]>>(
      `${this.basePath}/instruments`,
      undefined,
      this.http.validationEnabled ? InstrumentArrayResponseSchema : undefined
    );
    return response.data;
  }

  /**
   * Get a specific instrument by coin symbol
   *
   * @param coin - The coin symbol (e.g., 'BTC', 'ETH')
   * @returns Instrument details
   */
  async get(coin: string): Promise<Instrument> {
    const response = await this.http.get<ApiResponse<Instrument>>(
      `${this.basePath}/instruments/${coin.toUpperCase()}`,
      undefined,
      this.http.validationEnabled ? InstrumentResponseSchema : undefined
    );
    return response.data;
  }
}

/**
 * Lighter.xyz Instruments API resource
 *
 * Lighter instruments have a different schema than Hyperliquid with more
 * detailed market configuration including fees and minimum amounts.
 *
 * @example
 * ```typescript
 * // List all Lighter instruments
 * const instruments = await client.lighter.instruments.list();
 *
 * // Get specific instrument
 * const btc = await client.lighter.instruments.get('BTC');
 * console.log(`Taker fee: ${btc.takerFee}`);
 * ```
 */
export class LighterInstrumentsResource {
  constructor(private http: HttpClient, private basePath: string = '/v1/lighter') {}

  /**
   * List all available Lighter trading instruments
   *
   * @returns Array of Lighter instruments with full market configuration
   */
  async list(): Promise<LighterInstrument[]> {
    const response = await this.http.get<ApiResponse<LighterInstrument[]>>(
      `${this.basePath}/instruments`
    );
    return response.data;
  }

  /**
   * Get a specific Lighter instrument by coin symbol
   *
   * @param coin - The coin symbol (e.g., 'BTC', 'ETH')
   * @returns Lighter instrument details with full market configuration
   */
  async get(coin: string): Promise<LighterInstrument> {
    const response = await this.http.get<ApiResponse<LighterInstrument>>(
      `${this.basePath}/instruments/${coin.toUpperCase()}`
    );
    return response.data;
  }
}

/**
 * HIP-3 Builder Perps Instruments API resource
 *
 * HIP-3 instruments are derived from live market data and include
 * mark price, open interest, and mid price context.
 *
 * @example
 * ```typescript
 * // List all HIP-3 instruments
 * const instruments = await client.hyperliquid.hip3.instruments.list();
 *
 * // Get specific instrument
 * const us500 = await client.hyperliquid.hip3.instruments.get('km:US500');
 * console.log(`Mark price: ${us500.markPrice}`);
 * ```
 */
export class Hip3InstrumentsResource {
  private coinTransform: (c: string) => string;

  constructor(
    private http: HttpClient,
    private basePath: string = '/v1/hyperliquid/hip3',
    coinTransform?: (c: string) => string
  ) {
    this.coinTransform = coinTransform || ((c) => c);
  }

  /**
   * List all available HIP-3 instruments with latest market data
   *
   * @returns Array of HIP-3 instruments
   */
  async list(): Promise<Hip3Instrument[]> {
    const response = await this.http.get<ApiResponse<Hip3Instrument[]>>(
      `${this.basePath}/instruments`
    );
    return response.data;
  }

  /**
   * Get a specific HIP-3 instrument by coin name
   *
   * @param coin - The coin name (e.g., 'km:US500', 'xyz:XYZ100'). Case-sensitive.
   * @returns HIP-3 instrument details with latest market data
   */
  async get(coin: string): Promise<Hip3Instrument> {
    coin = this.coinTransform(coin);
    const response = await this.http.get<ApiResponse<Hip3Instrument>>(
      `${this.basePath}/instruments/${coin}`
    );
    return response.data;
  }
}
