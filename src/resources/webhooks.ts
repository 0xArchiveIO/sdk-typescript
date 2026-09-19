import type { HttpClient, KeyPreserver } from '../http';
import type {
  AddWebhookAddressParams,
  ApiResponse,
  CreateWebhookEndpointParams,
  CreateWebhookSubscriptionParams,
  CreatedWebhookEndpoint,
  ListWebhookDeliveriesParams,
  RotatedWebhookSecret,
  UpdateWebhookSubscriptionParams,
  WebhookDelivery,
  WebhookDryRunParams,
  WebhookDryRunResult,
  WebhookEndpoint,
  WebhookEstimateParams,
  WebhookEstimateResult,
  WebhookEventTypeDeclaration,
  WebhookRedeliveryResult,
  WebhookSubscription,
  WebhookTestFireResult,
  WebhookWatchedAddress,
  WebhookWatchedAddressList,
} from '../types';

/**
 * Response keys whose values are customer or market data rather than wire
 * fields, and so must survive the SDK's snake_case to camelCase pass
 * untouched.
 *
 * A subscription's `filters` is replayed to the API verbatim, so rewriting
 * `min_notional_usd` to `minNotionalUsd` would make the round trip reject
 * it. A delivery's `payload` is the exact JSON that was signed, so
 * rewriting it would make it unverifiable and would not match what the
 * receiver saw. The catalog's `params` and `metrics` are keyed by parameter
 * and metric name, which are the names conditions are written against.
 *
 * The key itself is still renamed; only the value underneath is copied as
 * it arrived.
 *
 * @internal Exported for testing
 */
export const preserveWebhookJson: KeyPreserver = (path) => {
  const key = path[path.length - 1];
  if (
    key === 'payload' ||
    key === 'filters' ||
    key === 'config' ||
    key === 'params' ||
    key === 'metrics' ||
    key === 'operators' ||
    key === 'filters_example'
  ) {
    return true;
  }
  // An occurrence's own `data`, never the response envelope's `data`.
  return key === 'data' && path.length > 1;
};

/** Watched-address list responses carry the plan allowance beside the rows. */
interface WatchedAddressListResponse extends ApiResponse<WebhookWatchedAddress[]> {
  limit: number;
}

/**
 * Webhooks: push delivery of market and account events, signed and retried.
 *
 * Three objects make a working integration. An **endpoint** is a URL of
 * yours plus the signing secret deliveries are signed with. A
 * **subscription** is one rule: an event type, a configuration, and the
 * endpoint its matches go to. A **watched address** puts one of your
 * wallets in scope for account events such as `account.fill`.
 *
 * Every rule can be tried before it exists. {@link WebhooksResource.estimate}
 * answers "how often would this have fired?" over up to 30 days, and
 * {@link WebhooksResource.dryRun} returns the actual occurrences it would
 * have delivered over up to 24 hours. Both validate the configuration
 * exactly as create does, so an error here is the error you would have hit
 * later.
 *
 * @example
 * ```typescript
 * // 1. Where should deliveries go? The secret is shown once: store it now.
 * const endpoint = await client.webhooks.createEndpoint({
 *   url: 'https://example.com/webhooks/0xarchive',
 *   description: 'trading desk',
 * });
 *
 * // 2. Try the rule before creating it.
 * const estimate = await client.webhooks.estimate({
 *   eventType: 'market.liquidation',
 *   config: { venue: 'hyperliquid', min_notional_usd: 250_000 },
 *   lookbackDays: 7,
 * });
 * console.log(`${estimate.perDayP50} deliveries a day, median`);
 *
 * // 3. Create it.
 * await client.webhooks.createSubscription({
 *   endpointId: endpoint.id,
 *   eventType: 'market.liquidation',
 *   filters: { venue: 'hyperliquid', min_notional_usd: 250_000 },
 * });
 *
 * // 4. Prove the receiver works end to end: a real signed delivery.
 * await client.webhooks.testEndpoint(endpoint.id);
 * ```
 */
export class WebhooksResource {
  constructor(private http: HttpClient, private basePath: string = '/v1/webhooks') {}

  // ===========================================================================
  // Catalog
  // ===========================================================================

  /**
   * List every event type, with the filters, parameters, metrics, and
   * operators each one accepts.
   *
   * This is the only source of truth for what a subscription may say. Types
   * with `live: false` are announced but not yet accepting subscriptions.
   *
   * @example
   * ```typescript
   * const catalog = await client.webhooks.eventTypes();
   * const liquidation = catalog.find((e) => e.type === 'market.liquidation');
   * console.log(Object.keys(liquidation!.metrics)); // what conditions can test
   * ```
   */
  async eventTypes(): Promise<WebhookEventTypeDeclaration[]> {
    const response = await this.http.get<ApiResponse<WebhookEventTypeDeclaration[]>>(
      `${this.basePath}/event-types`,
      undefined,
      undefined,
      preserveWebhookJson
    );
    return response.data;
  }

  // ===========================================================================
  // Endpoints
  // ===========================================================================

  /**
   * List your endpoints. Secrets are never included: they are shown once,
   * at create and at rotate.
   */
  async listEndpoints(): Promise<WebhookEndpoint[]> {
    const response = await this.http.get<ApiResponse<WebhookEndpoint[]>>(
      `${this.basePath}/endpoints`
    );
    return response.data;
  }

  /**
   * Create an endpoint and get its signing secret.
   *
   * **The secret is returned exactly once.** No other route ever returns
   * it; the only way to get a new one is {@link rotateSecret}.
   *
   * The URL must be reachable over HTTPS and is checked at create time and
   * again on every delivery, so private and loopback addresses are
   * rejected. Use a tunnel while developing locally.
   *
   * @param params - Destination URL and an optional label
   */
  async createEndpoint(params: CreateWebhookEndpointParams): Promise<CreatedWebhookEndpoint> {
    const response = await this.http.post<ApiResponse<CreatedWebhookEndpoint>>(
      `${this.basePath}/endpoints`,
      { url: params.url, description: params.description ?? '' }
    );
    return response.data;
  }

  /**
   * Delete an endpoint. Its subscriptions go with it.
   *
   * @param endpointId - Endpoint id
   */
  async deleteEndpoint(endpointId: string): Promise<void> {
    await this.http.delete<ApiResponse<unknown>>(
      `${this.basePath}/endpoints/${encodeURIComponent(endpointId)}`
    );
  }

  /**
   * Rotate an endpoint's signing secret.
   *
   * The new secret is returned once. The previous one keeps verifying for
   * 24 hours: every delivery in that window carries two `v1` signatures,
   * one per secret, so hold both, deploy, then drop the old one. Only one
   * previous secret is ever carried, so rotating twice inside the window
   * invalidates the first secret immediately.
   *
   * @param endpointId - Endpoint id
   */
  async rotateSecret(endpointId: string): Promise<RotatedWebhookSecret> {
    const response = await this.http.post<ApiResponse<RotatedWebhookSecret>>(
      `${this.basePath}/endpoints/${encodeURIComponent(endpointId)}/rotate`
    );
    return response.data;
  }

  /**
   * Re-enable an endpoint.
   *
   * An endpoint auto-disables after 10 consecutive failed deliveries
   * spanning at least 6 hours. Fix the receiver first: re-enabling a
   * receiver that still fails just starts the count again.
   *
   * @param endpointId - Endpoint id
   */
  async enableEndpoint(endpointId: string): Promise<void> {
    await this.http.post<ApiResponse<unknown>>(
      `${this.basePath}/endpoints/${encodeURIComponent(endpointId)}/enable`
    );
  }

  /**
   * Queue a `webhook.test` delivery to an endpoint.
   *
   * It goes out through the same dispatcher, signed the same way, so it is
   * a genuine end-to-end check of your signature verification rather than a
   * simulation.
   *
   * @param endpointId - Endpoint id
   */
  async testEndpoint(endpointId: string): Promise<WebhookTestFireResult> {
    const response = await this.http.post<ApiResponse<WebhookTestFireResult>>(
      `${this.basePath}/endpoints/${encodeURIComponent(endpointId)}/test`
    );
    return response.data;
  }

  // ===========================================================================
  // Deliveries
  // ===========================================================================

  /**
   * List recent deliveries for an endpoint, newest first, with each
   * attempt's status, error, latency, and the exact payload that was sent.
   *
   * @param endpointId - Endpoint id
   * @param params - Row limit (defaults to 50 server-side)
   */
  async listDeliveries(
    endpointId: string,
    params?: ListWebhookDeliveriesParams
  ): Promise<WebhookDelivery[]> {
    const response = await this.http.get<ApiResponse<WebhookDelivery[]>>(
      `${this.basePath}/endpoints/${encodeURIComponent(endpointId)}/deliveries`,
      params as unknown as Record<string, unknown>,
      undefined,
      preserveWebhookJson
    );
    return response.data;
  }

  /**
   * Send a past delivery again.
   *
   * The new attempt reuses the original `eventId`, so a receiver that
   * deduplicates correctly will recognise it. The endpoint must be active.
   *
   * @param deliveryId - Delivery id from {@link listDeliveries}
   */
  async redeliver(deliveryId: string): Promise<WebhookRedeliveryResult> {
    const response = await this.http.post<ApiResponse<WebhookRedeliveryResult>>(
      `${this.basePath}/deliveries/${encodeURIComponent(deliveryId)}/redeliver`
    );
    return response.data;
  }

  // ===========================================================================
  // Subscriptions
  // ===========================================================================

  /** List your rules across every endpoint. */
  async listSubscriptions(): Promise<WebhookSubscription[]> {
    const response = await this.http.get<ApiResponse<WebhookSubscription[]>>(
      `${this.basePath}/subscriptions`,
      undefined,
      undefined,
      preserveWebhookJson
    );
    return response.data;
  }

  /**
   * Create a rule.
   *
   * The configuration is validated against the event type's declaration and
   * stored normalised: operator spellings become canonical, addresses are
   * lowercased, and declared parameters you did not set are filled in with
   * their defaults. Anything undeclared is rejected rather than ignored.
   *
   * @param params - Endpoint, event type, and configuration
   */
  async createSubscription(
    params: CreateWebhookSubscriptionParams
  ): Promise<WebhookSubscription> {
    const response = await this.http.post<ApiResponse<WebhookSubscription>>(
      `${this.basePath}/subscriptions`,
      {
        endpoint_id: params.endpointId,
        event_type: params.eventType,
        filters: params.filters ?? {},
      },
      undefined,
      preserveWebhookJson
    );
    return response.data;
  }

  /**
   * Edit a rule in place. Supplying `filters` replaces the configuration
   * wholesale, so send the whole object, not a patch of it.
   *
   * @param subscriptionId - Subscription id
   * @param params - New configuration, new enabled state, or both
   */
  async updateSubscription(
    subscriptionId: string,
    params: UpdateWebhookSubscriptionParams
  ): Promise<WebhookSubscription> {
    const body: Record<string, unknown> = {};
    if (params.filters !== undefined) body.filters = params.filters;
    if (params.enabled !== undefined) body.enabled = params.enabled;
    const response = await this.http.patch<ApiResponse<WebhookSubscription>>(
      `${this.basePath}/subscriptions/${encodeURIComponent(subscriptionId)}`,
      body,
      undefined,
      preserveWebhookJson
    );
    return response.data;
  }

  /**
   * Delete a rule.
   *
   * @param subscriptionId - Subscription id
   */
  async deleteSubscription(subscriptionId: string): Promise<void> {
    await this.http.delete<ApiResponse<unknown>>(
      `${this.basePath}/subscriptions/${encodeURIComponent(subscriptionId)}`
    );
  }

  /**
   * Ask what a rule would have delivered over a recent window, without
   * creating anything.
   *
   * Returns the occurrences themselves, newest first, so you can look at
   * what you would have been woken up for. Available on every plan,
   * including Free.
   *
   * @param params - Event type, configuration, window, and page size
   *
   * @example
   * ```typescript
   * const preview = await client.webhooks.dryRun({
   *   eventType: 'market.liquidation',
   *   config: { venue: 'hyperliquid', min_notional_usd: 1_000_000 },
   *   lookbackS: 86_400,
   * });
   * console.log(`${preview.matched} in the last 24h`);
   * ```
   */
  async dryRun(params: WebhookDryRunParams): Promise<WebhookDryRunResult> {
    const response = await this.http.post<ApiResponse<WebhookDryRunResult>>(
      `${this.basePath}/subscriptions/dry-run`,
      {
        event_type: params.eventType,
        config: params.config ?? {},
        ...(params.lookbackS !== undefined ? { lookback_s: params.lookbackS } : {}),
        ...(params.limit !== undefined ? { limit: params.limit } : {}),
      },
      undefined,
      preserveWebhookJson
    );
    return response.data;
  }

  /**
   * Ask how often a rule would have fired over up to 30 days, without
   * creating anything.
   *
   * Comes back with a per-day series, a median and a busiest day, a sample
   * of matches, and a ladder showing the rate at other thresholds, which is
   * the fastest way to turn "too noisy" into a number. Available on every
   * plan, including Free.
   *
   * @param params - Event type, configuration, and window in days
   *
   * @example
   * ```typescript
   * const estimate = await client.webhooks.estimate({
   *   eventType: 'account.fill',
   *   config: { min_notional_usd: 25_000 },
   *   lookbackDays: 7,
   * });
   * for (const rung of estimate.ladder) {
   *   console.log(`>= ${rung.value}: ${rung.perDay}/day`);
   * }
   * ```
   */
  async estimate(params: WebhookEstimateParams): Promise<WebhookEstimateResult> {
    const response = await this.http.post<ApiResponse<WebhookEstimateResult>>(
      `${this.basePath}/subscriptions/estimate`,
      {
        event_type: params.eventType,
        config: params.config ?? {},
        ...(params.lookbackDays !== undefined ? { lookback_days: params.lookbackDays } : {}),
      },
      undefined,
      preserveWebhookJson
    );
    return response.data;
  }

  // ===========================================================================
  // Watched addresses
  // ===========================================================================

  /**
   * List the wallets in scope for account events, and how many your plan
   * allows.
   */
  async listAddresses(): Promise<WebhookWatchedAddressList> {
    const response = await this.http.get<WatchedAddressListResponse>(
      `${this.basePath}/addresses`
    );
    return { addresses: response.data, limit: response.limit };
  }

  /**
   * Watch a wallet, putting it in scope for account events such as
   * `account.fill` and `account.transfer`.
   *
   * Adding an address you already watch is idempotent. Hyperliquid bridge
   * system addresses are refused: they are a counterparty to every bridge
   * move of their token, not an account.
   *
   * @param params - Address and an optional label
   */
  async addAddress(params: AddWebhookAddressParams): Promise<WebhookWatchedAddress> {
    const response = await this.http.post<ApiResponse<WebhookWatchedAddress>>(
      `${this.basePath}/addresses`,
      { address: params.address, label: params.label ?? '' }
    );
    return response.data;
  }

  /**
   * Stop watching a wallet.
   *
   * @param addressId - Watched-address id
   */
  async deleteAddress(addressId: string): Promise<void> {
    await this.http.delete<ApiResponse<unknown>>(
      `${this.basePath}/addresses/${encodeURIComponent(addressId)}`
    );
  }
}
