import type { HttpClient } from '../http';
import type {
  CoverageResponse,
  ExchangeCoverage,
  Incident,
  IncidentsResponse,
  LatencyResponse,
  ListIncidentsParams,
  SlaParams,
  SlaResponse,
  StatusResponse,
  SymbolCoverageOptions,
  SymbolCoverageResponse,
} from '../types';

/**
 * Data quality API resource
 *
 * Provides endpoints for monitoring data quality, coverage, incidents, and SLA metrics.
 *
 * @example
 * ```typescript
 * // Get system status
 * const status = await client.dataQuality.status();
 * console.log(`System status: ${status.status}`);
 *
 * // Get coverage for all exchanges
 * const coverage = await client.dataQuality.coverage();
 *
 * // Get symbol-specific coverage with gap detection
 * const btc = await client.dataQuality.symbolCoverage('hyperliquid', 'BTC');
 * console.log(`BTC OI completeness: ${btc.dataTypes.open_interest.completeness}%`);
 * for (const gap of btc.dataTypes.open_interest.gaps.slice(0, 5)) {
 *   console.log(`Gap: ${gap.start} - ${gap.end} (${gap.durationMinutes} min)`);
 * }
 * ```
 */
export class DataQualityResource {
  constructor(private http: HttpClient, private basePath: string = '/v1/data-quality') {}

  // ===========================================================================
  // Status Endpoints
  // ===========================================================================

  /**
   * Get overall system health status
   *
   * @returns StatusResponse with overall status, per-exchange status,
   *          per-data-type status, and active incident count
   *
   * @example
   * ```typescript
   * const status = await client.dataQuality.status();
   * console.log(`Overall: ${status.status}`);
   * for (const [exchange, info] of Object.entries(status.exchanges)) {
   *   console.log(`${exchange}: ${info.status}`);
   * }
   * ```
   */
  async status(): Promise<StatusResponse> {
    return this.http.get<StatusResponse>(`${this.basePath}/status`);
  }

  // ===========================================================================
  // Coverage Endpoints
  // ===========================================================================

  /**
   * Get data coverage summary for all exchanges
   *
   * @returns CoverageResponse with coverage info for all exchanges and data types
   *
   * @example
   * ```typescript
   * const coverage = await client.dataQuality.coverage();
   * for (const exchange of coverage.exchanges) {
   *   console.log(`${exchange.exchange}:`);
   *   for (const [dtype, info] of Object.entries(exchange.dataTypes)) {
   *     console.log(`  ${dtype}: ${info.totalRecords} records`);
   *   }
   * }
   * ```
   */
  async coverage(): Promise<CoverageResponse> {
    return this.http.get<CoverageResponse>(`${this.basePath}/coverage`);
  }

  /**
   * Get data coverage for a specific exchange
   *
   * @param exchange - Exchange name ('hyperliquid' or 'lighter')
   * @returns ExchangeCoverage with coverage info for all data types on this exchange
   *
   * @example
   * ```typescript
   * const hl = await client.dataQuality.exchangeCoverage('hyperliquid');
   * console.log(`Orderbook earliest: ${hl.dataTypes.orderbook.earliest}`);
   * ```
   */
  async exchangeCoverage(exchange: string): Promise<ExchangeCoverage> {
    return this.http.get<ExchangeCoverage>(
      `${this.basePath}/coverage/${exchange.toLowerCase()}`
    );
  }

  /**
   * Get data coverage for a specific symbol on an exchange
   *
   * Includes gap detection, empirical data cadence, and hour-level historical coverage.
   * Supports optional time bounds for gap detection (default: last 30 days).
   *
   * @param exchange - Exchange name ('hyperliquid' or 'lighter')
   * @param symbol - Symbol name (e.g., 'BTC', 'ETH')
   * @param options - Optional time bounds for gap detection window
   * @returns SymbolCoverageResponse with per-data-type coverage including gaps, cadence, and historical coverage
   *
   * @example
   * ```typescript
   * const btc = await client.dataQuality.symbolCoverage('hyperliquid', 'BTC');
   * const oi = btc.dataTypes.open_interest;
   * console.log(`OI completeness: ${oi.completeness}%`);
   * console.log(`Gaps found: ${oi.gaps.length}`);
   * for (const gap of oi.gaps.slice(0, 3)) {
   *   console.log(`  ${gap.durationMinutes} min gap at ${gap.start}`);
   * }
   *
   * // Check cadence
   * if (btc.dataTypes.orderbook.cadence) {
   *   console.log(`Cadence: ~${btc.dataTypes.orderbook.cadence.medianIntervalSeconds}s`);
   * }
   *
   * // Time-bounded (last 7 days)
   * const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
   * const btc7d = await client.dataQuality.symbolCoverage('hyperliquid', 'BTC', {
   *   from: weekAgo,
   *   to: Date.now(),
   * });
   * ```
   */
  async symbolCoverage(
    exchange: string,
    symbol: string,
    options?: SymbolCoverageOptions,
  ): Promise<SymbolCoverageResponse> {
    return this.http.get<SymbolCoverageResponse>(
      `${this.basePath}/coverage/${exchange.toLowerCase()}/${symbol.toUpperCase()}`,
      options as unknown as Record<string, unknown>
    );
  }

  // ===========================================================================
  // Incidents Endpoints
  // ===========================================================================

  /**
   * List incidents with filtering and pagination
   *
   * @param params - Filter and pagination options
   * @returns IncidentsResponse with list of incidents and pagination info
   *
   * @example
   * ```typescript
   * // Get all open incidents
   * const result = await client.dataQuality.listIncidents({ status: 'open' });
   * for (const incident of result.incidents) {
   *   console.log(`${incident.severity}: ${incident.title}`);
   * }
   * ```
   */
  async listIncidents(params?: ListIncidentsParams): Promise<IncidentsResponse> {
    return this.http.get<IncidentsResponse>(
      `${this.basePath}/incidents`,
      params as unknown as Record<string, unknown>
    );
  }

  /**
   * Get a specific incident by ID
   *
   * @param incidentId - The incident ID
   * @returns Incident details
   *
   * @example
   * ```typescript
   * const incident = await client.dataQuality.getIncident('inc_123');
   * console.log(`Status: ${incident.status}`);
   * console.log(`Root cause: ${incident.rootCause}`);
   * ```
   */
  async getIncident(incidentId: string): Promise<Incident> {
    return this.http.get<Incident>(`${this.basePath}/incidents/${incidentId}`);
  }

  // ===========================================================================
  // Latency Endpoints
  // ===========================================================================

  /**
   * Get current latency metrics for all exchanges
   *
   * @returns LatencyResponse with WebSocket, REST API, and data freshness metrics
   *
   * @example
   * ```typescript
   * const latency = await client.dataQuality.latency();
   * for (const [exchange, metrics] of Object.entries(latency.exchanges)) {
   *   console.log(`${exchange}:`);
   *   if (metrics.websocket) {
   *     console.log(`  WS current: ${metrics.websocket.currentMs}ms`);
   *   }
   *   console.log(`  OB lag: ${metrics.dataFreshness.orderbookLagMs}ms`);
   * }
   * ```
   */
  async latency(): Promise<LatencyResponse> {
    return this.http.get<LatencyResponse>(`${this.basePath}/latency`);
  }

  // ===========================================================================
  // SLA Endpoints
  // ===========================================================================

  /**
   * Get SLA compliance metrics for a specific month
   *
   * @param params - Optional year and month (defaults to current month)
   * @returns SlaResponse with SLA targets, actual metrics, and compliance status
   *
   * @example
   * ```typescript
   * const sla = await client.dataQuality.sla({ year: 2026, month: 1 });
   * console.log(`Period: ${sla.period}`);
   * console.log(`Uptime: ${sla.actual.uptime}% (${sla.actual.uptimeStatus})`);
   * console.log(`Completeness: ${sla.actual.dataCompleteness.overall}%`);
   * console.log(`API P99: ${sla.actual.apiLatencyP99Ms}ms`);
   * ```
   */
  async sla(params?: SlaParams): Promise<SlaResponse> {
    return this.http.get<SlaResponse>(
      `${this.basePath}/sla`,
      params as unknown as Record<string, unknown>
    );
  }
}
