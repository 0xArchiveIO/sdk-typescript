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
  WebhookLimits,
  WebhookRedeliveryResult,
  WebhookResumeGap,
  WebhookSubscription,
  WebhookSubscriptionResumeAllResult,
  WebhookSubscriptionResumeResult,
  WebhookTestFireResult,
  WebhookWatchedAddress,
  WebhookWatchedAddressList,
} from '../types';

/**
 * Response keys whose values are customer or market data rather than wire
 * fields, and so must survive the SDK's snake_case to camelCase pass
 * untouched.
 *
 * A subscription's `filters` is sent back to the API as is, so rewriting
 * `min_notional_usd` to `minNotionalUsd` would make the round trip fail. A
 * delivery's `payload` is the exact JSON that was signed, and an occurrence's
 * `data` is what a delivery would carry. The catalog's `params`, `metrics`
 * and `operators` are keyed by parameter name, metric name and metric type,
 * which are the names conditions are written against.
 *
 * The key itself is still renamed; only the value underneath is copied as it
 * arrived.
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

/** Watched-address responses carry the plan allowance beside the rows. */
interface WatchedAddressResponse<T> extends ApiResponse<T> {
  limit: number;
}

/** A single resume answers with the subscription, the gap it closed and an optional note. */
interface ResumeResponse extends ApiResponse<WebhookSubscription> {
  gap?: WebhookResumeGap | null;
  note?: string;
}

/** A bulk resume answers with the resumed subscriptions and the gap across them. */
interface ResumeAllResponse extends ApiResponse<WebhookSubscription[]> {
  resumedCount?: number;
  gap?: WebhookResumeGap | null;
  note?: string;
}

/**
 * Webhooks: push delivery of market, account, archive, export and billing
 * events, signed and retried.
 *
 * Three objects make a working integration. An **endpoint** is a URL of
 * yours plus the signing secret deliveries are signed with. A
 * **subscription** is one rule: an event type, a configuration, and the
 * endpoint its matches go to. A **watched address** puts a wallet in scope
 * for address-scoped events such as `account.fill`.
 *
 * Every rule can be tried before it exists. {@link WebhooksResource.estimate}
 * answers "how often would this have fired?" over up to 30 days, and
 * {@link WebhooksResource.dryRun} returns the occurrences it would have
 * delivered over up to 24 hours. Both validate the configuration exactly as
 * a create does.
 *
 * Pair this resource with `verifyWebhookSignature` or `constructWebhookEvent`
 * on your receiver.
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
 * // 4. Prove the receiver works end to end with a real signed delivery.
 * await client.webhooks.testEndpoint(endpoint.id);
 * ```
 */
export class WebhooksResource {
  constructor(private http: HttpClient, private basePath: string = '/v1/webhooks') {}

  private path(...segments: string[]): string {
    return [this.basePath, ...segments.map((segment) => encodeURIComponent(segment))].join('/');
  }

  // ===========================================================================
  // Catalog and limits
  // ===========================================================================

  /**
   * List every event type, with the filters, parameters, metrics and
   * operators each one accepts.
   *
   * This is the authority on what a subscription may say. Types with
   * `live: false` are published but do not yet accept subscriptions.
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

  /**
   * What your plan allows for webhooks and what is in use: endpoints,
   * subscriptions, watched wallets, today's delivery budget and how many
   * subscriptions are paused.
   *
   * `included` is false on a plan without webhook delivery; the estimate and
   * the dry run stay available on every plan (`previewIncluded`).
   */
  async limits(): Promise<WebhookLimits> {
    const response = await this.http.get<ApiResponse<WebhookLimits>>(`${this.basePath}/limits`);
    return response.data;
  }

  // ===========================================================================
  // Endpoints
  // ===========================================================================

  /**
   * List your endpoints, oldest first. Secrets are never included: they are
   * shown once, at create and at rotate.
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
   * **The secret is returned exactly once.** Only {@link rotateSecret}
   * returns a new one. Destinations that resolve to a private or internal
   * address are refused, at creation and again on every delivery.
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
   * Delete an endpoint and every subscription pointing at it.
   *
   * @param endpointId - Endpoint id
   */
  async deleteEndpoint(endpointId: string): Promise<void> {
    await this.http.delete<ApiResponse<unknown>>(this.path('endpoints', endpointId));
  }

  /**
   * Put an endpoint back into service after you switched it off, or after a
   * long run of failed deliveries switched it off for you. Deliveries resume
   * on the next matching event; nothing missed while it was off is replayed.
   *
   * @param endpointId - Endpoint id
   */
  async enableEndpoint(endpointId: string): Promise<void> {
    await this.http.post<ApiResponse<unknown>>(this.path('endpoints', endpointId, 'enable'));
  }

  /**
   * Rotate an endpoint's signing secret.
   *
   * The new secret is returned once. The previous one keeps verifying for 24
   * hours: every delivery in that window carries two `v1` signatures, one
   * per secret, so a receiver holding either keeps working.
   *
   * @param endpointId - Endpoint id
   */
  async rotateSecret(endpointId: string): Promise<RotatedWebhookSecret> {
    const response = await this.http.post<ApiResponse<RotatedWebhookSecret>>(
      this.path('endpoints', endpointId, 'rotate')
    );
    return response.data;
  }

  /**
   * Queue a `webhook.test` delivery to an endpoint.
   *
   * It is a real signed delivery, so it checks your signature verification
   * end to end. It counts against today's delivery budget and is refused on
   * a plan without webhook delivery.
   *
   * @param endpointId - Endpoint id
   */
  async testEndpoint(endpointId: string): Promise<WebhookTestFireResult> {
    const response = await this.http.post<ApiResponse<WebhookTestFireResult>>(
      this.path('endpoints', endpointId, 'test')
    );
    return response.data;
  }

  // ===========================================================================
  // Deliveries
  // ===========================================================================

  /**
   * List an endpoint's delivery log, newest first, with each record's state,
   * attempt count, last status code, error and latency, and the payload as
   * sent (wire keys, exactly as signed).
   *
   * @param endpointId - Endpoint id
   * @param params - Row limit (default 50, clamped to 1 to 200)
   */
  async listDeliveries(
    endpointId: string,
    params?: ListWebhookDeliveriesParams
  ): Promise<WebhookDelivery[]> {
    const response = await this.http.get<ApiResponse<WebhookDelivery[]>>(
      this.path('endpoints', endpointId, 'deliveries'),
      params as unknown as Record<string, unknown>,
      undefined,
      preserveWebhookJson
    );
    return response.data;
  }

  /**
   * Queue a past delivery for another attempt.
   *
   * The delivery and event ids are unchanged, so a receiver that
   * deduplicates on the event id recognises it. The endpoint must be active,
   * and the repeat counts against today's delivery budget.
   *
   * @param deliveryId - Delivery id from {@link listDeliveries}
   */
  async redeliver(deliveryId: string): Promise<WebhookRedeliveryResult> {
    const response = await this.http.post<ApiResponse<WebhookRedeliveryResult>>(
      this.path('deliveries', deliveryId, 'redeliver')
    );
    return response.data;
  }

  // ===========================================================================
  // Subscriptions
  // ===========================================================================

  /** List your rules across every endpoint, with their configuration and pause state. */
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
   * The configuration is checked against the event type's catalog entry
   * before anything is stored, so an unknown key, an undeclared parameter,
   * an out-of-range value or a condition on an undeclared metric is refused
   * rather than dropped. Addresses in the configuration must already be on
   * your watched list.
   *
   * @param params - Endpoint, event type and configuration
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
   * Edit a rule in place. A `filters` you send replaces the stored
   * configuration wholesale and is validated as at create; `enabled` switches
   * the rule on or off without touching its configuration. A field left out
   * is left alone.
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
      this.path('subscriptions', subscriptionId),
      body,
      undefined,
      preserveWebhookJson
    );
    return response.data;
  }

  /**
   * Delete a rule. Its endpoint and other rules are untouched.
   *
   * @param subscriptionId - Subscription id
   */
  async deleteSubscription(subscriptionId: string): Promise<void> {
    await this.http.delete<ApiResponse<unknown>>(this.path('subscriptions', subscriptionId));
  }

  /**
   * Put one paused rule back into service.
   *
   * Nothing is buffered while a rule is paused, so the result carries the
   * window that was missed (`gap.replayWindow`) instead of replaying it. A
   * rule that is already serving is left as it is, with `gap` null. Your own
   * `enabled` switch is never touched.
   *
   * @param subscriptionId - Subscription id
   */
  async resumeSubscription(subscriptionId: string): Promise<WebhookSubscriptionResumeResult> {
    const response = await this.http.post<ResumeResponse>(
      this.path('subscriptions', subscriptionId, 'resume'),
      undefined,
      undefined,
      preserveWebhookJson
    );
    return {
      subscription: response.data,
      gap: response.gap ?? null,
      ...(response.note !== undefined ? { note: response.note } : {}),
    };
  }

  /**
   * Put every paused rule on the account back into service in one call.
   *
   * The daily delivery limit is counted per account while pauses are written
   * per rule, so this is usually the call you want after a pause. If nothing
   * is paused, nothing changes and `note` says so.
   */
  async resumeAllSubscriptions(): Promise<WebhookSubscriptionResumeAllResult> {
    const response = await this.http.post<ResumeAllResponse>(
      `${this.basePath}/subscriptions/resume`,
      undefined,
      undefined,
      preserveWebhookJson
    );
    return {
      subscriptions: response.data ?? [],
      resumedCount: response.resumedCount ?? 0,
      gap: response.gap ?? null,
      ...(response.note !== undefined ? { note: response.note } : {}),
    };
  }

  /**
   * Ask which occurrences a rule would have delivered over a recent window,
   * without creating anything.
   *
   * Returns the occurrences themselves, newest first. Available on every
   * plan, for `account.fill`, `account.transfer` and `market.liquidation`.
   * Estimates and dry runs share a budget of six calls a minute.
   *
   * @param params - Event type, configuration, window and page size
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
   * Comes back with a per-day series, the median and busiest day, the
   * distribution of the primary metric, a sample of matches, and a ladder of
   * the daily rate at other thresholds. Available on every plan. Estimates
   * and dry runs share a budget of six calls a minute.
   *
   * @param params - Event type, configuration and window in days
   *
   * @example
   * ```typescript
   * const estimate = await client.webhooks.estimate({
   *   eventType: 'market.liquidation',
   *   config: { conditions: [{ metric: 'notional_usd', op: '>=', value: 250_000 }] },
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

  /** List the wallets in scope for address-scoped events, and how many your plan allows. */
  async listAddresses(): Promise<WebhookWatchedAddressList> {
    const response = await this.http.get<WatchedAddressResponse<WebhookWatchedAddress[]>>(
      `${this.basePath}/addresses`
    );
    return { addresses: response.data, limit: response.limit };
  }

  /**
   * Watch a wallet, putting it in scope for address-scoped events such as
   * `account.fill` and `account.transfer`.
   *
   * Adding a wallet you already watch returns the existing row and does not
   * count against the cap again. Hyperliquid bridge system addresses are
   * refused.
   *
   * @param params - Address and an optional label
   */
  async addAddress(params: AddWebhookAddressParams): Promise<WebhookWatchedAddress> {
    const response = await this.http.post<WatchedAddressResponse<WebhookWatchedAddress>>(
      `${this.basePath}/addresses`,
      { address: params.address, label: params.label ?? '' }
    );
    return response.data;
  }

  /**
   * Stop watching a wallet. Subscriptions that name it keep their stored
   * configuration, so remove it from those rules too if needed.
   *
   * @param addressId - Watched-address id
   */
  async deleteAddress(addressId: string): Promise<void> {
    await this.http.delete<ApiResponse<unknown>>(this.path('addresses', addressId));
  }
}
