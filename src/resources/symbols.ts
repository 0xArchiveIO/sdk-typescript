import { type HttpClient, type KeyPreserver, unwrapEnvelope } from '../http';
import type { z } from 'zod';
import type { SymbolEntry } from '../types';
import { SymbolsResponseSchema } from '../schemas';

/**
 * `coverageByType` and `sizePerDay` are keyed by data type (for example
 * `l4_orderbook`); those keys are data, so they keep the API's spelling.
 *
 * @internal Exported for testing
 */
export const preserveSymbolMaps: KeyPreserver = (path) => {
  const key = path[path.length - 1];
  return key === 'coverage_by_type' || key === 'size_per_day';
};

/**
 * The public symbol universe across every venue family, with coverage dates
 * and available data types per symbol.
 *
 * @example
 * ```typescript
 * const symbols = await client.symbols.list();
 * const hip3 = symbols.filter((s) => s.exchange === 'hip3');
 * const btc = symbols.find((s) => s.exchange === 'hyperliquid' && s.symbol === 'BTC');
 * console.log(btc?.dataTypes, btc?.coverageByType?.['trades']);
 * ```
 */
export class SymbolsResource {
  constructor(private http: HttpClient) {}

  /**
   * List every public symbol: venue family (`exchange`), coverage start and
   * end, available data types, earliest coverage per data type, estimated
   * size per day, and HIP-4 outcome metadata where it applies.
   *
   * The list is large (every HIP-4 outcome side is an entry), so cache it
   * rather than calling it per request.
   */
  async list(): Promise<SymbolEntry[]> {
    const body = await this.http.get<unknown>(
      '/v1/symbols',
      undefined,
      this.http.validationEnabled ? (SymbolsResponseSchema as unknown as z.ZodType<unknown>) : undefined,
      preserveSymbolMaps
    );
    // The API version the SDK sends returns the list as the envelope's
    // `data`; the older body carried it as `symbols`.
    const payload = unwrapEnvelope<SymbolEntry[] | { symbols: SymbolEntry[] }>(body);
    return Array.isArray(payload) ? payload : payload.symbols;
  }
}
