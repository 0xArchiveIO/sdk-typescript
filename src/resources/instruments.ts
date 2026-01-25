import type { HttpClient } from '../http';
import type { ApiResponse, Instrument } from '../types';
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
  constructor(private http: HttpClient) {}

  /**
   * List all available trading instruments
   *
   * @returns Array of instruments
   */
  async list(): Promise<Instrument[]> {
    const response = await this.http.get<ApiResponse<Instrument[]>>(
      '/v1/instruments',
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
      `/v1/instruments/${coin.toUpperCase()}`,
      undefined,
      this.http.validationEnabled ? InstrumentResponseSchema : undefined
    );
    return response.data;
  }
}
