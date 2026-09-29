import { createHmac, webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  assertWebhookSignature,
  constructWebhookEvent,
  createWebhookSignatureHeader,
  DEFAULT_WEBHOOK_TOLERANCE_SECONDS,
  parseWebhookSignatureHeader,
  readWebhookHeader,
  verifyWebhookSignature,
  WebhookSignatureError,
  WEBHOOK_SIGNATURE_HEADER,
} from '../src';

// Fixed vectors, also published in the README so receivers in other
// languages can check themselves. The body is 186 bytes with no trailing
// newline, so the signed string `<t>.<body>` is 197 bytes.
const T = 1758240000;
const BODY =
  '{"id": "11111111-1111-4111-8111-111111111111", "data": {"message": "Test event from 0xArchive."}, ' +
  '"type": "webhook.test", "observed_at": "2026-09-19T00:00:00+00:00", "schema_version": 1}';
const SECRET = `whsec_${'0'.repeat(64)}`;
const PREVIOUS = `whsec_${'1'.repeat(64)}`;
const V1_SECRET = '027f40e95c9aa4e8097c22493f6f019ad25407ddf35b13103f95e5501d49ec0b';
const V1_PREVIOUS = 'f8e6ae6781adad70ed0f94773fa2745147b718136e83fc22cafa09ded928095c';
const HEADER = `t=${T},v1=${V1_SECRET}`;
const ROTATION_HEADER = `t=${T},v1=${V1_SECRET},v1=${V1_PREVIOUS}`;
const NOW = T * 1000;

describe('webhook signature fixtures', () => {
  it('match an independent HMAC-SHA256 over "<t>.<raw body>" keyed with the whole secret', () => {
    expect(Buffer.byteLength(BODY)).toBe(186);
    const mac = (secret: string) => createHmac('sha256', secret).update(`${T}.${BODY}`).digest('hex');
    expect(mac(SECRET)).toBe(V1_SECRET);
    expect(mac(PREVIOUS)).toBe(V1_PREVIOUS);
  });

  it('createWebhookSignatureHeader() reproduces the header, one v1 per secret', async () => {
    await expect(createWebhookSignatureHeader({ payload: BODY, secret: SECRET, timestamp: T })).resolves.toBe(HEADER);
    await expect(
      createWebhookSignatureHeader({ payload: BODY, secret: [SECRET, PREVIOUS], timestamp: T })
    ).resolves.toBe(ROTATION_HEADER);
  });
});

describe('verifyWebhookSignature', () => {
  it('accepts a valid delivery from a string body', async () => {
    await expect(
      verifyWebhookSignature({ payload: BODY, signature: HEADER, secret: SECRET, now: NOW })
    ).resolves.toBe(true);
  });

  it('accepts the same body as a Buffer, a Uint8Array and an ArrayBuffer', async () => {
    const buffer = Buffer.from(BODY, 'utf8');
    const bytes = new Uint8Array(buffer);
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    for (const payload of [buffer, bytes, arrayBuffer]) {
      await expect(verifyWebhookSignature({ payload, signature: HEADER, secret: SECRET, now: NOW })).resolves.toBe(
        true
      );
    }
  });

  it('accepts a byte view into a larger buffer', async () => {
    const padded = Buffer.from(`xxxx${BODY}yyyy`, 'utf8');
    const view = new DataView(padded.buffer, padded.byteOffset + 4, Buffer.byteLength(BODY));
    await expect(verifyWebhookSignature({ payload: view, signature: HEADER, secret: SECRET, now: NOW })).resolves.toBe(
      true
    );
  });

  it('rejects a tampered body', async () => {
    const tampered = BODY.replace('Test event', 'Test evenT');
    await expect(
      verifyWebhookSignature({ payload: tampered, signature: HEADER, secret: SECRET, now: NOW })
    ).resolves.toBe(false);
    await expect(
      assertWebhookSignature({ payload: tampered, signature: HEADER, secret: SECRET, now: NOW })
    ).rejects.toMatchObject({ reason: 'no_matching_signature' });
  });

  it('rejects a re-serialised body, which is not the bytes that were signed', async () => {
    const reserialised = JSON.stringify(JSON.parse(BODY));
    await expect(
      verifyWebhookSignature({ payload: reserialised, signature: HEADER, secret: SECRET, now: NOW })
    ).resolves.toBe(false);
  });

  it('rejects the wrong secret and a tampered signature', async () => {
    await expect(
      verifyWebhookSignature({ payload: BODY, signature: HEADER, secret: `whsec_${'2'.repeat(64)}`, now: NOW })
    ).resolves.toBe(false);
    const flipped = `t=${T},v1=${V1_SECRET.slice(0, -1)}${V1_SECRET.endsWith('b') ? 'c' : 'b'}`;
    await expect(verifyWebhookSignature({ payload: BODY, signature: flipped, secret: SECRET, now: NOW })).resolves.toBe(
      false
    );
  });

  it('rejects a signature over a different timestamp', async () => {
    // Same digest, but the header claims another second: the MAC covers t.
    await expect(
      verifyWebhookSignature({ payload: BODY, signature: `t=${T + 1},v1=${V1_SECRET}`, secret: SECRET, now: NOW })
    ).resolves.toBe(false);
  });

  describe('during a secret rotation (two v1 signatures)', () => {
    it('accepts with only the new secret', async () => {
      await expect(
        verifyWebhookSignature({ payload: BODY, signature: ROTATION_HEADER, secret: SECRET, now: NOW })
      ).resolves.toBe(true);
    });

    it('accepts with only the previous secret, which matches the second v1', async () => {
      await expect(
        verifyWebhookSignature({ payload: BODY, signature: ROTATION_HEADER, secret: PREVIOUS, now: NOW })
      ).resolves.toBe(true);
      // The single-signature header does not carry the previous secret's digest.
      await expect(
        verifyWebhookSignature({ payload: BODY, signature: HEADER, secret: PREVIOUS, now: NOW })
      ).resolves.toBe(false);
    });

    it('accepts when holding both secrets, in either order', async () => {
      for (const secret of [
        [SECRET, PREVIOUS],
        [PREVIOUS, SECRET],
      ]) {
        await expect(
          verifyWebhookSignature({ payload: BODY, signature: ROTATION_HEADER, secret, now: NOW })
        ).resolves.toBe(true);
      }
    });

    it('accepts the v1 values in either order and in upper case', async () => {
      const reversed = `t=${T},v1=${V1_PREVIOUS.toUpperCase()},v1=${V1_SECRET.toUpperCase()}`;
      await expect(verifyWebhookSignature({ payload: BODY, signature: reversed, secret: SECRET, now: NOW })).resolves.toBe(
        true
      );
    });

    it('rejects a tampered body even with both secrets', async () => {
      await expect(
        verifyWebhookSignature({ payload: `${BODY} `, signature: ROTATION_HEADER, secret: [SECRET, PREVIOUS], now: NOW })
      ).resolves.toBe(false);
    });
  });

  describe('replay window', () => {
    it(`defaults to ${DEFAULT_WEBHOOK_TOLERANCE_SECONDS} seconds, inclusive`, async () => {
      const at = (offsetSeconds: number) =>
        verifyWebhookSignature({ payload: BODY, signature: HEADER, secret: SECRET, now: NOW + offsetSeconds * 1000 });
      await expect(at(300)).resolves.toBe(true);
      await expect(at(-300)).resolves.toBe(true);
      await expect(at(301)).resolves.toBe(false);
      await expect(at(-301)).resolves.toBe(false);
    });

    it('rejects an expired timestamp with timestamp_out_of_tolerance', async () => {
      await expect(
        assertWebhookSignature({ payload: BODY, signature: HEADER, secret: SECRET, now: NOW + 3_600_000 })
      ).rejects.toMatchObject({ name: 'WebhookSignatureError', reason: 'timestamp_out_of_tolerance' });
    });

    it('rejects a timestamp too far in the future', async () => {
      await expect(
        assertWebhookSignature({ payload: BODY, signature: HEADER, secret: SECRET, now: NOW - 3_600_000 })
      ).rejects.toMatchObject({ reason: 'timestamp_out_of_tolerance' });
    });

    it('honors toleranceSeconds, including Infinity for stored deliveries', async () => {
      const late = NOW + 3_600_000;
      await expect(
        verifyWebhookSignature({ payload: BODY, signature: HEADER, secret: SECRET, now: late, toleranceSeconds: 3600 })
      ).resolves.toBe(true);
      await expect(
        verifyWebhookSignature({
          payload: BODY,
          signature: HEADER,
          secret: SECRET,
          now: late,
          toleranceSeconds: Number.POSITIVE_INFINITY,
        })
      ).resolves.toBe(true);
      await expect(
        verifyWebhookSignature({ payload: BODY, signature: HEADER, secret: SECRET, now: NOW + 1000, toleranceSeconds: 0 })
      ).resolves.toBe(false);
    });

    it('refuses a NaN or negative tolerance instead of switching the check off', async () => {
      for (const toleranceSeconds of [Number.NaN, -1]) {
        await expect(
          verifyWebhookSignature({ payload: BODY, signature: HEADER, secret: SECRET, now: NOW, toleranceSeconds })
        ).rejects.toThrow(TypeError);
      }
      await expect(
        verifyWebhookSignature({ payload: BODY, signature: HEADER, secret: SECRET, now: Number.NaN })
      ).rejects.toThrow(TypeError);
    });

    it('checks against the current clock by default', async () => {
      const t = Math.floor(Date.now() / 1000);
      const header = await createWebhookSignatureHeader({ payload: BODY, secret: SECRET, timestamp: t });
      await expect(verifyWebhookSignature({ payload: BODY, signature: header, secret: SECRET })).resolves.toBe(true);
      await expect(verifyWebhookSignature({ payload: BODY, signature: HEADER, secret: SECRET })).resolves.toBe(false);
    });
  });

  describe('headers and malformed input', () => {
    it('reads the header case-insensitively from a plain object, a Map and a Headers instance', async () => {
      const bags = [
        { '0XA-Signature': HEADER, 'content-type': 'application/json' },
        new Map([[WEBHOOK_SIGNATURE_HEADER, HEADER]]),
        new Headers({ [WEBHOOK_SIGNATURE_HEADER]: HEADER }),
      ];
      for (const headers of bags) {
        await expect(verifyWebhookSignature({ payload: BODY, headers, secret: SECRET, now: NOW })).resolves.toBe(true);
      }
    });

    it('rejects a missing header', async () => {
      await expect(
        assertWebhookSignature({ payload: BODY, headers: {}, secret: SECRET, now: NOW })
      ).rejects.toMatchObject({ reason: 'missing_signature_header' });
      await expect(verifyWebhookSignature({ payload: BODY, secret: SECRET, now: NOW })).resolves.toBe(false);
    });

    it.each([
      'garbage',
      `v1=${V1_SECRET}`,
      `t=${T}`,
      `t=abc,v1=${V1_SECRET}`,
      `t=${T},v0=${V1_SECRET}`,
      `t=${T},v1=`,
    ])('rejects the malformed header %s', async (signature) => {
      await expect(
        assertWebhookSignature({ payload: BODY, signature, secret: SECRET, now: NOW })
      ).rejects.toMatchObject({ reason: 'malformed_signature_header' });
    });

    it('throws on a missing secret rather than answering false', async () => {
      await expect(verifyWebhookSignature({ payload: BODY, signature: HEADER, secret: '', now: NOW })).rejects.toMatchObject(
        { reason: 'missing_secret' }
      );
      await expect(verifyWebhookSignature({ payload: BODY, signature: HEADER, secret: [], now: NOW })).rejects.toBeInstanceOf(
        WebhookSignatureError
      );
    });

    it('refuses a parsed object in place of the raw body', async () => {
      const parsed = JSON.parse(BODY) as unknown as string;
      await expect(
        verifyWebhookSignature({ payload: parsed, signature: HEADER, secret: SECRET, now: NOW })
      ).rejects.toThrow(/raw request body/);
    });

    it('uses an explicitly supplied WebCrypto implementation', async () => {
      await expect(
        verifyWebhookSignature({
          payload: BODY,
          signature: HEADER,
          secret: SECRET,
          now: NOW,
          subtle: webcrypto.subtle as never,
        })
      ).resolves.toBe(true);
    });
  });

  it('parseWebhookSignatureHeader() keeps the literal timestamp and every v1', () => {
    expect(parseWebhookSignatureHeader(` t=${T} , v1=${V1_SECRET.toUpperCase()},v1=${V1_PREVIOUS}`)).toEqual({
      timestamp: String(T),
      timestampSeconds: T,
      signatures: [V1_SECRET, V1_PREVIOUS],
    });
    expect(parseWebhookSignatureHeader('t=1')).toBeNull();
  });

  it('readWebhookHeader() joins repeated values with commas', () => {
    expect(readWebhookHeader({ [WEBHOOK_SIGNATURE_HEADER]: [`t=${T}`, `v1=${V1_SECRET}`] }, '0xa-signature')).toBe(
      HEADER
    );
    expect(readWebhookHeader({}, '0xa-signature')).toBeUndefined();
  });
});

describe('constructWebhookEvent', () => {
  it('verifies and returns the parsed event with wire keys', async () => {
    const event = await constructWebhookEvent({ payload: Buffer.from(BODY), signature: HEADER, secret: SECRET, now: NOW });
    expect(event).toEqual({
      id: '11111111-1111-4111-8111-111111111111',
      data: { message: 'Test event from 0xArchive.' },
      type: 'webhook.test',
      observed_at: '2026-09-19T00:00:00+00:00',
      schema_version: 1,
    });
  });

  it('reports the event id and type headers through assertWebhookSignature()', async () => {
    const context = await assertWebhookSignature({
      payload: BODY,
      headers: {
        '0xa-signature': HEADER,
        '0xa-event-id': '11111111-1111-4111-8111-111111111111',
        '0xa-event-type': 'webhook.test',
      },
      secret: SECRET,
      now: NOW,
    });
    expect(context).toEqual({
      eventId: '11111111-1111-4111-8111-111111111111',
      eventType: 'webhook.test',
      signedAtSeconds: T,
    });
  });

  it('throws WebhookSignatureError before parsing when the signature fails', async () => {
    await expect(
      constructWebhookEvent({ payload: `${BODY}\n`, signature: HEADER, secret: SECRET, now: NOW })
    ).rejects.toMatchObject({ reason: 'no_matching_signature' });
  });

  it('throws invalid_payload when a signed body is not JSON', async () => {
    const raw = 'not json';
    const signature = await createWebhookSignatureHeader({ payload: raw, secret: SECRET, timestamp: T });
    await expect(constructWebhookEvent({ payload: raw, signature, secret: SECRET, now: NOW })).rejects.toMatchObject({
      reason: 'invalid_payload',
    });
  });
});
