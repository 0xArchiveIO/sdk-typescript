import { afterEach, describe, expect, it, vi } from 'vitest';
import { OxArchive } from '../src';

afterEach(() => vi.unstubAllGlobals());

describe('HIP-4 outcome by slug', () => {
  it('URL-encodes the slug as one path segment', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: true, data: { outcome_id: 1 }, meta: { count: 1, request_id: 'r' } }),
      text: async () => '{}',
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new OxArchive({ apiKey: 'test-key', baseUrl: 'https://api.example.test' });

    await client.hyperliquid.hip4.outcomes.getBySlug('june-fed-rate-change-no change: #2/3');

    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain('/v1/hyperliquid/hip4/outcomes/by-slug/june-fed-rate-change-no%20change%3A%20%232%2F3');
  });
});
