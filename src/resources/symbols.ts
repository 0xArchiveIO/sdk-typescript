import type { HttpClient, KeyPreserver } from '../http';
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
    const response = await this.http.get<{ symbols: SymbolEntry[] }>(
      '/v1/symbols',
      undefined,
      this.http.validationEnabled ? SymbolsResponseSchema : undefined,
      preserveSymbolMaps
    );
    return response.symbols;
  }
}
