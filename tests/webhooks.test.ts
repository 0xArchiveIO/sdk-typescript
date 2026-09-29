import { afterEach, describe, expect, it, vi } from 'vitest';
import { OxArchive, OxArchiveError, WebhooksResource } from '../src';

const BASE = 'https://api.example.test';
const ENDPOINT_ID = '3c1f0a52-8d6b-4f0e-9b1a-6f2c4d8e9a10';
const SUBSCRIPTION_ID = '6b1d2c4e-1f0a-4c8e-9a2b-3d4e5f607182';
const DELIVERY_ID = '9d8e7f60-5a4b-4c3d-8e2f-1a0b9c8d7e6f';
const ADDRESS_ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

type Body = Record<string, unknown>;

function reply(body: Body, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

function stubFetch(...responses: Array<ReturnType<typeof reply>>) {
  const fetchMock = vi.fn();
  for (const response of responses) fetchMock.mockResolvedValueOnce(response);
  fetchMock.mockResolvedValue(reply({ success: true }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

interface SentRequest {
  method: string;
  url: URL;
  body: unknown;
}

function sent(fetchMock: ReturnType<typeof vi.fn>, call = 0): SentRequest {
  const [url, init] = fetchMock.mock.calls[call] as [string, RequestInit];
  return {
    method: String(init.method),
    url: new URL(url),
    body: init.body === undefined ? undefined : JSON.parse(String(init.body)),
  };
}

function client() {
  return new OxArchive({ apiKey: 'test-key', baseUrl: BASE });
}

// Wire-shaped rows, as the API sends them.
const ENDPOINT_ROW = {
  id: ENDPOINT_ID,
  url: 'https://example.com/webhooks/0xarchive',
  description: 'desk',
  status: 'active',
  consecutive_failures: 0,
  created_at: '2026-09-09T12:00:00Z',
};

const FILTERS = {
  venue: 'hyperliquid',
  symbols: ['BTC'],
  min_notional_usd: 250000,
  params: { max_age_s: 3600 },
  conditions: [{ metric: 'notional_usd', op: 'greater_than_or_equal', value: 250000 }],
};

const SUBSCRIPTION_ROW = {
  id: SUBSCRIPTION_ID,
  endpoint_id: ENDPOINT_ID,
  event_type: 'market.liquidation',
  filters: FILTERS,
  enabled: true,
  created_at: '2026-09-09T12:00:00Z',
  status: 'auto_paused',
  pause_message: 'Paused: the account reached its daily delivery limit.',
  paused_at: '2026-09-10T09:00:00Z',
  pause_reason: 'deliveries_per_day_cap',
  suppressed_count: 42,
  suppressed_first_at: '2026-09-10T09:00:01Z',
  suppressed_last_at: '2026-09-10T11:59:00Z',
  last_paused_at: null,
  last_resumed_at: null,
  last_pause_reason: null,
  last_suppressed_count: 0,
  last_suppressed_first_at: null,
  last_suppressed_last_at: null,
};

const GAP = {
  paused_at: '2026-09-10T09:00:00Z',
  resumed_at: '2026-09-10T12:00:00Z',
  replay_window: { start: '2026-09-10T09:00:00Z', end: '2026-09-10T12:00:00Z' },
  reason: 'deliveries_per_day_cap',
  pause_message: 'Paused: the account reached its daily delivery limit.',
  suppressed_count: 42,
  counted: true,
  suppressed_first_at: '2026-09-10T09:00:01Z',
  suppressed_last_at: '2026-09-10T11:59:00Z',
  note: 'Re-read the window from the REST routes.',
};

const OCCURRENCE = {
  observed_at_estimate: '2026-09-08T13:41:01.586Z',
  data: {
    venue: 'hyperliquid',
    symbol: 'BTC',
    notional_usd: 562419.19,
    closed_pnl: -8218.95,
    api_url: '/v1/hyperliquid/liquidations/BTC?start=1788874861586&end=1788874861587',
  },
};

describe('client.webhooks', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is a WebhooksResource on the root client', () => {
    expect(client().webhooks).toBeInstanceOf(WebhooksResource);
  });

  it('eventTypes() reads the catalog and keeps params, metrics, operators and the example verbatim', async () => {
    const fetchMock = stubFetch(
      reply({
        success: true,
        data: [
          {
            type: 'market.liquidation',
            schema_version: 1,
            live: true,
            scope: 'public',
            venues: ['hyperliquid', 'hip3'],
            filters: ['venue', 'symbols'],
            params: {
              max_age_s: { type: 'integer', unit: 's', default: 3600, min: 60, max: 86400 },
            },
            metrics: {
              notional_usd: { type: 'number', unit: 'USD' },
              notional_pct_oi: { type: 'number', unit: '%' },
            },
            cost_floor: { metric: 'notional_usd', min: 100 },
            latency_class: 'seconds',
            description: 'A liquidation.',
            filters_example: { venue: 'hyperliquid', min_notional_usd: 100000 },
            operators: { number: ['greater_than', 'greater_than_or_equal'], any: ['is_empty'] },
          },
        ],
      })
    );

    const catalog = await client().webhooks.eventTypes();

    const request = sent(fetchMock);
    expect(request.method).toBe('GET');
    expect(request.url.pathname).toBe('/v1/webhooks/event-types');
    expect(request.body).toBeUndefined();
    const [entry] = catalog;
    expect(entry.schemaVersion).toBe(1);
    expect(entry.latencyClass).toBe('seconds');
    expect(entry.costFloor).toEqual({ metric: 'notional_usd', min: 100 });
    expect(Object.keys(entry.params)).toEqual(['max_age_s']);
    expect(Object.keys(entry.metrics)).toEqual(['notional_usd', 'notional_pct_oi']);
    expect(entry.filtersExample).toEqual({ venue: 'hyperliquid', min_notional_usd: 100000 });
    expect(entry.operators?.number).toContain('greater_than_or_equal');
  });

  it('limits() reads plan allowances and usage', async () => {
    const fetchMock = stubFetch(
      reply({
        success: true,
        data: {
          plan: 'pro',
          plan_label: 'Pro',
          included: true,
          preview_included: true,
          endpoints: { used: 1, limit: 4, remaining: 3 },
          subscriptions: { used: 2, limit: 40, remaining: 38 },
          watched_addresses: { used: 3, limit: 15, remaining: 12 },
          deliveries_per_day: {
            used: 10,
            limit: 50000,
            remaining: 49990,
            unlimited: false,
            resets_at: '2026-09-11T00:00:00Z',
          },
          paused_subscriptions: { count: 0, earliest_paused_at: null, reasons: [] },
        },
      })
    );

    const limits = await client().webhooks.limits();

    const request = sent(fetchMock);
    expect(request.method).toBe('GET');
    expect(request.url.pathname).toBe('/v1/webhooks/limits');
    expect(limits.planLabel).toBe('Pro');
    expect(limits.previewIncluded).toBe(true);
    expect(limits.watchedAddresses).toEqual({ used: 3, limit: 15, remaining: 12 });
    expect(limits.deliveriesPerDay.resetsAt).toBe('2026-09-11T00:00:00Z');
    expect(limits.pausedSubscriptions.count).toBe(0);
  });

  it('listEndpoints() returns camelCased endpoints', async () => {
    const fetchMock = stubFetch(reply({ success: true, data: [ENDPOINT_ROW] }));

    const endpoints = await client().webhooks.listEndpoints();

    expect(sent(fetchMock).method).toBe('GET');
    expect(sent(fetchMock).url.pathname).toBe('/v1/webhooks/endpoints');
    expect(endpoints[0]).toMatchObject({ id: ENDPOINT_ID, consecutiveFailures: 0, createdAt: '2026-09-09T12:00:00Z' });
  });

  it('createEndpoint() posts url and description and returns the secret', async () => {
    const fetchMock = stubFetch(
      reply({
        success: true,
        data: { ...ENDPOINT_ROW, secret: 'whsec_test' },
        note: 'The secret is shown once.',
      })
    );

    const created = await client().webhooks.createEndpoint({ url: ENDPOINT_ROW.url, description: 'desk' });

    const request = sent(fetchMock);
    expect(request.method).toBe('POST');
    expect(request.url.pathname).toBe('/v1/webhooks/endpoints');
    expect(request.body).toEqual({ url: ENDPOINT_ROW.url, description: 'desk' });
    expect(created.secret).toBe('whsec_test');
    expect(created.status).toBe('active');
  });

  it('createEndpoint() sends an empty description when none is given', async () => {
    const fetchMock = stubFetch(reply({ success: true, data: { ...ENDPOINT_ROW, secret: 'whsec_test' } }));

    await client().webhooks.createEndpoint({ url: ENDPOINT_ROW.url });

    expect(sent(fetchMock).body).toEqual({ url: ENDPOINT_ROW.url, description: '' });
  });

  it('deleteEndpoint() sends DELETE to the endpoint', async () => {
    const fetchMock = stubFetch(reply({ success: true }));

    await expect(client().webhooks.deleteEndpoint(ENDPOINT_ID)).resolves.toBeUndefined();

    const request = sent(fetchMock);
    expect(request.method).toBe('DELETE');
    expect(request.url.pathname).toBe(`/v1/webhooks/endpoints/${ENDPOINT_ID}`);
    expect(request.body).toBeUndefined();
  });

  it('enableEndpoint() posts to /enable with no body', async () => {
    const fetchMock = stubFetch(reply({ success: true }));

    await expect(client().webhooks.enableEndpoint(ENDPOINT_ID)).resolves.toBeUndefined();

    const request = sent(fetchMock);
    expect(request.method).toBe('POST');
    expect(request.url.pathname).toBe(`/v1/webhooks/endpoints/${ENDPOINT_ID}/enable`);
    expect(request.body).toBeUndefined();
  });

  it('rotateSecret() posts to /rotate and returns the new secret', async () => {
    const fetchMock = stubFetch(
      reply({ success: true, data: { secret: 'whsec_new' }, note: 'The previous secret verifies for 24 hours.' })
    );

    const rotated = await client().webhooks.rotateSecret(ENDPOINT_ID);

    const request = sent(fetchMock);
    expect(request.method).toBe('POST');
    expect(request.url.pathname).toBe(`/v1/webhooks/endpoints/${ENDPOINT_ID}/rotate`);
    expect(rotated).toEqual({ secret: 'whsec_new' });
  });

  it('testEndpoint() posts to /test and returns the queued ids', async () => {
    const fetchMock = stubFetch(
      reply({ success: true, data: { delivery_id: DELIVERY_ID, event_id: '11111111-1111-4111-8111-111111111111' } })
    );

    const queued = await client().webhooks.testEndpoint(ENDPOINT_ID);

    const request = sent(fetchMock);
    expect(request.method).toBe('POST');
    expect(request.url.pathname).toBe(`/v1/webhooks/endpoints/${ENDPOINT_ID}/test`);
    expect(queued).toEqual({ deliveryId: DELIVERY_ID, eventId: '11111111-1111-4111-8111-111111111111' });
  });

  it('listDeliveries() sends limit and keeps each payload exactly as signed', async () => {
    const payload = {
      id: '04bade8a-659a-4609-a183-733163bc6a22',
      type: 'account.fill',
      schema_version: 1,
      observed_at: '2026-09-08T21:36:41.811Z',
      late_ms: 479,
      late: false,
      data: { notional_usd: 563400.79, buy_notional_usd: 563400.79, order_ids: ['539700803622'] },
    };
    const fetchMock = stubFetch(
      reply({
        success: true,
        data: [
          {
            id: DELIVERY_ID,
            event_id: payload.id,
            event_type: 'account.fill',
            state: 'failed',
            attempts: 2,
            last_status_code: 500,
            last_error: 'receiver returned 500',
            last_latency_ms: 120,
            next_attempt_at: '2026-09-08T21:37:11Z',
            delivered_at: null,
            created_at: '2026-09-08T21:36:42Z',
            payload,
          },
        ],
      })
    );

    const deliveries = await client().webhooks.listDeliveries(ENDPOINT_ID, { limit: 20 });

    const request = sent(fetchMock);
    expect(request.method).toBe('GET');
    expect(request.url.pathname).toBe(`/v1/webhooks/endpoints/${ENDPOINT_ID}/deliveries`);
    expect(request.url.searchParams.get('limit')).toBe('20');
    expect(deliveries[0]).toMatchObject({
      eventId: payload.id,
      eventType: 'account.fill',
      lastStatusCode: 500,
      lastLatencyMs: 120,
      nextAttemptAt: '2026-09-08T21:37:11Z',
    });
    expect(deliveries[0].payload).toEqual(payload);
  });

  it('listDeliveries() sends no query string when no limit is given', async () => {
    const fetchMock = stubFetch(reply({ success: true, data: [] }));

    await client().webhooks.listDeliveries(ENDPOINT_ID);

    expect(sent(fetchMock).url.search).toBe('');
  });

  it('redeliver() posts to the delivery and returns the re-queued record', async () => {
    const fetchMock = stubFetch(
      reply({
        success: true,
        data: {
          delivery_id: DELIVERY_ID,
          event_id: '04bade8a-659a-4609-a183-733163bc6a22',
          event_type: 'account.fill',
          state: 'pending',
          attempts: 0,
          next_attempt_at: '2026-09-08T22:00:00Z',
        },
        note: 'The record is reset in place.',
      })
    );

    const result = await client().webhooks.redeliver(DELIVERY_ID);

    const request = sent(fetchMock);
    expect(request.method).toBe('POST');
    expect(request.url.pathname).toBe(`/v1/webhooks/deliveries/${DELIVERY_ID}/redeliver`);
    expect(result).toEqual({
      deliveryId: DELIVERY_ID,
      eventId: '04bade8a-659a-4609-a183-733163bc6a22',
      eventType: 'account.fill',
      state: 'pending',
      attempts: 0,
      nextAttemptAt: '2026-09-08T22:00:00Z',
    });
  });

  it('listSubscriptions() camelCases the rule but keeps filters verbatim, with pause state', async () => {
    const fetchMock = stubFetch(reply({ success: true, data: [SUBSCRIPTION_ROW] }));

    const [subscription] = await client().webhooks.listSubscriptions();

    expect(sent(fetchMock).method).toBe('GET');
    expect(sent(fetchMock).url.pathname).toBe('/v1/webhooks/subscriptions');
    expect(subscription.endpointId).toBe(ENDPOINT_ID);
    expect(subscription.filters).toEqual(FILTERS);
    expect(subscription.status).toBe('auto_paused');
    expect(subscription.pauseReason).toBe('deliveries_per_day_cap');
    expect(subscription.pauseMessage).toContain('daily delivery limit');
    expect(subscription.suppressedCount).toBe(42);
    expect(subscription.lastSuppressedCount).toBe(0);
  });

  it('createSubscription() sends snake_case keys and the configuration unchanged', async () => {
    const fetchMock = stubFetch(reply({ success: true, data: SUBSCRIPTION_ROW }));
    const filters = {
      venue: 'hyperliquid',
      min_notional_usd: 250000,
      conditions: [{ metric: 'notional_usd', op: '>=' as const, value: 250000 }],
    };

    const subscription = await client().webhooks.createSubscription({
      endpointId: ENDPOINT_ID,
      eventType: 'market.liquidation',
      filters,
    });

    const request = sent(fetchMock);
    expect(request.method).toBe('POST');
    expect(request.url.pathname).toBe('/v1/webhooks/subscriptions');
    expect(request.body).toEqual({ endpoint_id: ENDPOINT_ID, event_type: 'market.liquidation', filters });
    expect(subscription.filters).toEqual(FILTERS);
  });

  it('createSubscription() sends an empty configuration when none is given', async () => {
    const fetchMock = stubFetch(reply({ success: true, data: SUBSCRIPTION_ROW }));

    await client().webhooks.createSubscription({ endpointId: ENDPOINT_ID, eventType: 'webhook.test' });

    expect(sent(fetchMock).body).toEqual({ endpoint_id: ENDPOINT_ID, event_type: 'webhook.test', filters: {} });
  });

  it('updateSubscription() sends PATCH with only the fields given', async () => {
    const fetchMock = stubFetch(
      reply({ success: true, data: SUBSCRIPTION_ROW }),
      reply({ success: true, data: SUBSCRIPTION_ROW }),
      reply({ success: true, data: SUBSCRIPTION_ROW })
    );
    const webhooks = client().webhooks;

    await webhooks.updateSubscription(SUBSCRIPTION_ID, { enabled: false });
    await webhooks.updateSubscription(SUBSCRIPTION_ID, { filters: { min_notional_usd: 50000 } });
    const updated = await webhooks.updateSubscription(SUBSCRIPTION_ID, {
      filters: { min_notional_usd: 50000 },
      enabled: true,
    });

    for (let call = 0; call < 3; call++) {
      expect(sent(fetchMock, call).method).toBe('PATCH');
      expect(sent(fetchMock, call).url.pathname).toBe(`/v1/webhooks/subscriptions/${SUBSCRIPTION_ID}`);
    }
    expect(sent(fetchMock, 0).body).toEqual({ enabled: false });
    expect(sent(fetchMock, 1).body).toEqual({ filters: { min_notional_usd: 50000 } });
    expect(sent(fetchMock, 2).body).toEqual({ filters: { min_notional_usd: 50000 }, enabled: true });
    expect(updated.filters).toEqual(FILTERS);
  });

  it('deleteSubscription() sends DELETE to the subscription', async () => {
    const fetchMock = stubFetch(reply({ success: true }));

    await expect(client().webhooks.deleteSubscription(SUBSCRIPTION_ID)).resolves.toBeUndefined();

    expect(sent(fetchMock).method).toBe('DELETE');
    expect(sent(fetchMock).url.pathname).toBe(`/v1/webhooks/subscriptions/${SUBSCRIPTION_ID}`);
  });

  it('resumeSubscription() posts to /resume and returns the subscription and the gap', async () => {
    const fetchMock = stubFetch(
      reply({ success: true, data: { ...SUBSCRIPTION_ROW, status: 'active' }, gap: GAP })
    );

    const result = await client().webhooks.resumeSubscription(SUBSCRIPTION_ID);

    const request = sent(fetchMock);
    expect(request.method).toBe('POST');
    expect(request.url.pathname).toBe(`/v1/webhooks/subscriptions/${SUBSCRIPTION_ID}/resume`);
    expect(request.body).toBeUndefined();
    expect(result.subscription.status).toBe('active');
    expect(result.subscription.filters).toEqual(FILTERS);
    expect(result.gap?.replayWindow).toEqual({ start: '2026-09-10T09:00:00Z', end: '2026-09-10T12:00:00Z' });
    expect(result.gap?.suppressedCount).toBe(42);
    expect(result.gap?.counted).toBe(true);
    expect(result.note).toBeUndefined();
  });

  it('resumeSubscription() reports a rule that was already serving with a null gap and the note', async () => {
    stubFetch(
      reply({
        success: true,
        data: { ...SUBSCRIPTION_ROW, status: 'active' },
        gap: null,
        note: 'This subscription was not paused.',
      })
    );

    const result = await client().webhooks.resumeSubscription(SUBSCRIPTION_ID);

    expect(result.gap).toBeNull();
    expect(result.note).toBe('This subscription was not paused.');
  });

  it('resumeAllSubscriptions() posts to /subscriptions/resume and returns the count and gap', async () => {
    const fetchMock = stubFetch(
      reply({
        success: true,
        data: [{ ...SUBSCRIPTION_ROW, status: 'active' }],
        resumed_count: 1,
        gap: { ...GAP, reason: null, reasons: ['deliveries_per_day_cap'], uncounted_subscriptions: 0 },
      })
    );

    const result = await client().webhooks.resumeAllSubscriptions();

    const request = sent(fetchMock);
    expect(request.method).toBe('POST');
    expect(request.url.pathname).toBe('/v1/webhooks/subscriptions/resume');
    expect(result.resumedCount).toBe(1);
    expect(result.subscriptions[0].filters).toEqual(FILTERS);
    expect(result.gap?.reasons).toEqual(['deliveries_per_day_cap']);
    expect(result.gap?.uncountedSubscriptions).toBe(0);
  });

  it('resumeAllSubscriptions() with nothing paused returns zero, a null gap and the note', async () => {
    stubFetch(reply({ success: true, data: [], resumed_count: 0, gap: null, note: 'Nothing was paused.' }));

    const result = await client().webhooks.resumeAllSubscriptions();

    expect(result).toEqual({ subscriptions: [], resumedCount: 0, gap: null, note: 'Nothing was paused.' });
  });

  it('dryRun() sends event_type, config, lookback_s and limit, and keeps occurrence data verbatim', async () => {
    const fetchMock = stubFetch(
      reply({
        success: true,
        data: {
          event_type: 'market.liquidation',
          window: { from: '2026-09-08T08:00:00.000Z', to: '2026-09-08T14:00:00.000Z' },
          matched: 12,
          truncated: true,
          occurrences: [OCCURRENCE],
        },
      })
    );
    const config = { venue: 'hyperliquid', symbols: ['BTC', 'ETH'], min_notional_usd: 250000 };

    const preview = await client().webhooks.dryRun({
      eventType: 'market.liquidation',
      config,
      lookbackS: 21600,
      limit: 5,
    });

    const request = sent(fetchMock);
    expect(request.method).toBe('POST');
    expect(request.url.pathname).toBe('/v1/webhooks/subscriptions/dry-run');
    expect(request.body).toEqual({ event_type: 'market.liquidation', config, lookback_s: 21600, limit: 5 });
    expect(preview.eventType).toBe('market.liquidation');
    expect(preview.matched).toBe(12);
    expect(preview.occurrences[0].observedAtEstimate).toBe(OCCURRENCE.observed_at_estimate);
    expect(preview.occurrences[0].data).toEqual(OCCURRENCE.data);
  });

  it('dryRun() leaves out the window and page size when not given', async () => {
    const fetchMock = stubFetch(
      reply({
        success: true,
        data: { event_type: 'account.fill', window: { from: 'a', to: 'b' }, matched: 0, truncated: false, occurrences: [] },
      })
    );

    await client().webhooks.dryRun({ eventType: 'account.fill' });

    expect(sent(fetchMock).body).toEqual({ event_type: 'account.fill', config: {} });
  });

  it('estimate() sends event_type, config and lookback_days, and parses the ladder and sample', async () => {
    const fetchMock = stubFetch(
      reply({
        success: true,
        data: {
          event_type: 'market.liquidation',
          window: { from: '2026-09-01T14:00:00.000Z', to: '2026-09-08T14:00:00.000Z' },
          days: 7,
          total: 84,
          per_day: [
            { date: '2026-09-02', count: 9 },
            { date: '2026-09-03', count: 31 },
          ],
          per_day_p50: 12.0,
          per_day_max: 31,
          primary_metric: 'notional_usd',
          ladder: [
            { value: 50000, per_day: 41.7 },
            { value: 250000, per_day: 12.0 },
          ],
          distribution: { n: 2140, p50: 4200, p90: 61000, p99: 380000, max: 2100000 },
          sample: [OCCURRENCE],
          basis: { mode: 'exact', note: null },
        },
      })
    );
    const config = { conditions: [{ metric: 'notional_usd', op: '>=' as const, value: 250000 }] };

    const estimate = await client().webhooks.estimate({
      eventType: 'market.liquidation',
      config,
      lookbackDays: 7,
    });

    const request = sent(fetchMock);
    expect(request.method).toBe('POST');
    expect(request.url.pathname).toBe('/v1/webhooks/subscriptions/estimate');
    expect(request.body).toEqual({ event_type: 'market.liquidation', config, lookback_days: 7 });
    expect(estimate.perDayP50).toBe(12);
    expect(estimate.perDayMax).toBe(31);
    expect(estimate.primaryMetric).toBe('notional_usd');
    expect(estimate.perDay).toHaveLength(2);
    expect(estimate.ladder[0]).toEqual({ value: 50000, perDay: 41.7 });
    expect(estimate.distribution?.p99).toBe(380000);
    expect(estimate.sample[0].data).toEqual(OCCURRENCE.data);
    expect(estimate.basis).toEqual({ mode: 'exact', note: null });
  });

  it('listAddresses() returns the rows with the plan allowance', async () => {
    const fetchMock = stubFetch(
      reply({
        success: true,
        data: [
          {
            id: ADDRESS_ID,
            address: '0xabc0000000000000000000000000000000000001',
            label: 'desk A',
            created_at: '2026-09-09T12:00:00Z',
          },
        ],
        limit: 15,
      })
    );

    const list = await client().webhooks.listAddresses();

    expect(sent(fetchMock).method).toBe('GET');
    expect(sent(fetchMock).url.pathname).toBe('/v1/webhooks/addresses');
    expect(list.limit).toBe(15);
    expect(list.addresses[0]).toEqual({
      id: ADDRESS_ID,
      address: '0xabc0000000000000000000000000000000000001',
      label: 'desk A',
      createdAt: '2026-09-09T12:00:00Z',
    });
  });

  it('addAddress() posts address and label', async () => {
    const fetchMock = stubFetch(
      reply({
        success: true,
        data: {
          id: ADDRESS_ID,
          address: '0xabc0000000000000000000000000000000000001',
          label: 'desk A',
          created_at: '2026-09-09T12:00:00Z',
        },
        limit: 15,
      }),
      reply({
        success: true,
        data: { id: ADDRESS_ID, address: '0xabc0000000000000000000000000000000000001', label: '', created_at: 'x' },
        limit: 15,
      })
    );
    const webhooks = client().webhooks;

    const added = await webhooks.addAddress({ address: '0xAbC0000000000000000000000000000000000001', label: 'desk A' });
    await webhooks.addAddress({ address: '0xAbC0000000000000000000000000000000000001' });

    expect(sent(fetchMock).method).toBe('POST');
    expect(sent(fetchMock).url.pathname).toBe('/v1/webhooks/addresses');
    expect(sent(fetchMock).body).toEqual({ address: '0xAbC0000000000000000000000000000000000001', label: 'desk A' });
    expect(sent(fetchMock, 1).body).toEqual({ address: '0xAbC0000000000000000000000000000000000001', label: '' });
    expect(added.createdAt).toBe('2026-09-09T12:00:00Z');
  });

  it('deleteAddress() sends DELETE to the watched address', async () => {
    const fetchMock = stubFetch(reply({ success: true }));

    await expect(client().webhooks.deleteAddress(ADDRESS_ID)).resolves.toBeUndefined();

    expect(sent(fetchMock).method).toBe('DELETE');
    expect(sent(fetchMock).url.pathname).toBe(`/v1/webhooks/addresses/${ADDRESS_ID}`);
  });

  it('percent-encodes ids in paths', async () => {
    const fetchMock = stubFetch(reply({ success: true }));

    await client().webhooks.deleteEndpoint('a/b?c');

    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/v1/webhooks/endpoints/a%2Fb%3Fc`);
  });

  it('covers all 21 webhook operations', () => {
    const methods = Object.getOwnPropertyNames(WebhooksResource.prototype).filter(
      (name) => name !== 'constructor' && name !== 'path'
    );
    expect(methods.sort()).toEqual(
      [
        'eventTypes',
        'limits',
        'listEndpoints',
        'createEndpoint',
        'deleteEndpoint',
        'enableEndpoint',
        'rotateSecret',
        'testEndpoint',
        'listDeliveries',
        'redeliver',
        'listSubscriptions',
        'createSubscription',
        'updateSubscription',
        'deleteSubscription',
        'resumeSubscription',
        'resumeAllSubscriptions',
        'dryRun',
        'estimate',
        'listAddresses',
        'addAddress',
        'deleteAddress',
      ].sort()
    );
  });

  it('raises OxArchiveError with the top-level request id and error code on a refusal', async () => {
    stubFetch(
      reply(
        {
          code: 400,
          error: 'Webhook delivery is not included on the Free plan.',
          error_code: 'plan_no_webhooks',
          request_id: 'req-123',
        },
        400
      )
    );

    const error = await client()
      .webhooks.createEndpoint({ url: ENDPOINT_ROW.url })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(OxArchiveError);
    expect(error).toMatchObject({
      code: 400,
      requestId: 'req-123',
      errorCode: 'plan_no_webhooks',
      message: 'Webhook delivery is not included on the Free plan.',
    });
  });
});
