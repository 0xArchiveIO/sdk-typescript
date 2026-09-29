import type { HttpClient } from '../http';
import type { ApiResponse, Hip3OracleDiscoveryBounds, Hip3OracleExternalPrice } from '../types';
import {
  Hip3OracleDiscoveryBoundsResponseSchema,
  Hip3OracleExternalPriceResponseSchema,
} from '../schemas';

/**
 * HIP-3 oracle reads: the deployer-pushed external price and the current
 * discovery bounds of a builder-deployed market.
 *
 * Symbols keep their builder prefix and case (e.g. `km:US500`).
 *
 * @example
 * ```typescript
 * const px = await client.hyperliquid.hip3.oracle.externalPrice('km:US500');
 * const bounds = await client.hyperliquid.hip3.oracle.discoveryBounds('km:US500');
 * console.log(px.externalPrice, bounds.lowerBound, bounds.upperBound);
 * ```
 */
export class Hip3OracleResource {
  constructor(
    private http: HttpClient,
    private basePath: string = '/v1/hyperliquid/hip3'
  ) {}

  /**
   * Get the instantaneous discovery bounds for a HIP-3 market, derived from
   * the current reference price (the external price when available,
   * otherwise the mark price) and the market's max leverage. The full
   * ratcheted range can be wider when deployer-specific reset configuration
   * applies.
   *
   * @param symbol - HIP-3 symbol with builder prefix (case-sensitive), e.g. 'km:US500'
   */
  async discoveryBounds(symbol: string): Promise<Hip3OracleDiscoveryBounds> {
    const response = await this.http.get<ApiResponse<Hip3OracleDiscoveryBounds>>(
      `${this.basePath}/oracle/discovery-bounds/${symbol}`,
      undefined,
      this.http.validationEnabled ? Hip3OracleDiscoveryBoundsResponseSchema : undefined
    );
    return response.data;
  }

  /**
   * Get the latest deployer-pushed external reference price and mark price
   * for a HIP-3 market.
   *
   * @param symbol - HIP-3 symbol with builder prefix (case-sensitive), e.g. 'km:US500'
   */
  async externalPrice(symbol: string): Promise<Hip3OracleExternalPrice> {
    const response = await this.http.get<ApiResponse<Hip3OracleExternalPrice>>(
      `${this.basePath}/oracle/external-price/${symbol}`,
      undefined,
      this.http.validationEnabled ? Hip3OracleExternalPriceResponseSchema : undefined
    );
    return response.data;
  }
}
