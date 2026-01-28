import type { HttpClient } from '../http';
import type { ApiResponse, Instrument, LighterInstrument } from '../types';
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
