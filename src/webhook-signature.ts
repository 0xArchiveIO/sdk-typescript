/**
 * Verification for 0xArchive webhook deliveries.
 *
 * Every delivery 0xArchive sends carries a `0xa-signature` header:
 *
 * ```
 * 0xa-signature: t=1758240000,v1=<64 lowercase hex>[,v1=<64 lowercase hex>]
 * ```
 *
 * `v1` is `HMAC-SHA256(secret, "<t>." + raw request body)`, hex encoded. The
 * key is the whole `whsec_...` string exactly as it was given to you: it is
 * not hex-decoded, not base64-decoded, and the prefix is not stripped. A
 * second `v1` appears for the 24 hours after a secret rotation, computed
 * over the same bytes with the previous secret, so a receiver that still
 * holds either secret keeps working through the roll.
 *
 * The one rule that decides whether your receiver works: **verify the raw
 * body**. The bytes on the wire are PostgreSQL's rendering of the stored
 * JSON, so they match neither the emitter's key order nor any JSON
 * library's default output. Re-serialising a parsed object produces
 * different bytes and every signature will fail.
 *
 * ```typescript
 * import express from 'express';
 * import { constructWebhookEvent, WebhookSignatureError } from '@0xarchive/sdk';
 *
 * const app = express();
 *
 * app.post(
 *   '/webhooks/0xarchive',
 *   express.raw({ type: 'application/json' }),
 *   async (req, res) => {
 *     try {
 *       const event = await constructWebhookEvent({
 *         payload: req.body,               // Buffer, never req.body after express.json()
 *         headers: req.headers,
 *         secret: process.env.OXARCHIVE_WEBHOOK_SECRET!,
 *       });
 *       res.sendStatus(202);               // acknowledge first
 *       void handle(event);                // process out of band
 *     } catch (err) {
 *       if (err instanceof WebhookSignatureError) return res.sendStatus(400);
 *       throw err;
 *     }
 *   }
 * );
 * ```
 *
 * @packageDocumentation
 */

/** Header carrying the signature envelope. Lookups are case-insensitive. */
export const WEBHOOK_SIGNATURE_HEADER = '0xa-signature';

/** Header carrying the event UUID. Stable across retries and redeliveries. */
export const WEBHOOK_EVENT_ID_HEADER = '0xa-event-id';

/** Header carrying the event type, for example `webhook.test`. */
export const WEBHOOK_EVENT_TYPE_HEADER = '0xa-event-type';

/** User agent 0xArchive delivers with. */
export const WEBHOOK_USER_AGENT = '0xArchive-Webhooks/1.0';

/**
 * Default replay window, in seconds. A delivery whose `t` is further than
 * this from your clock is rejected.
 *
 * Every attempt is signed at the moment it is sent, retries included, so a
 * legitimate delivery is never stale by more than network and clock skew.
 */
export const DEFAULT_WEBHOOK_TOLERANCE_SECONDS = 300;

/** Why a delivery was not accepted. */
export type WebhookVerificationFailure =
  /** No `0xa-signature` header was present. */
  | 'missing_signature_header'
  /** The header carried no usable `t` or no usable `v1`. */
  | 'malformed_signature_header'
  /** No secret was supplied, so nothing could be verified. */
  | 'missing_secret'
  /** `t` is outside the replay window. */
  | 'timestamp_out_of_tolerance'
  /** Every `v1` was checked against every secret and none matched. */
  | 'no_matching_signature'
  /** The signature verified but the body did not parse as JSON. */
  | 'invalid_payload';

/**
 * Thrown by {@link constructWebhookEvent} when a delivery cannot be
 * accepted. Answer these with a 4xx: a 5xx puts the same bad delivery back
 * on the retry ladder for 24 hours.
 */
export class WebhookSignatureError extends Error {
  /** Which check failed. */
  public readonly reason: WebhookVerificationFailure;

  constructor(reason: WebhookVerificationFailure, message: string) {
    super(message);
    this.name = 'WebhookSignatureError';
    this.reason = reason;
    // Keep `instanceof` working when the SDK is compiled to ES5 targets.
    Object.setPrototypeOf(this, WebhookSignatureError.prototype);
  }
}

/** Header bag shapes a receiver is likely to already have in hand. */
export type WebhookHeaders =
  | Record<string, string | string[] | undefined | null>
  | Map<string, string | string[] | undefined | null>
  | { get(name: string): string | null };

/** Raw body, exactly as it arrived. Never a parsed and re-serialised object. */
export type WebhookPayload = string | Uint8Array | ArrayBuffer;

export interface VerifyWebhookOptions {
  /**
   * The raw request body. A `Buffer`, `Uint8Array`, `ArrayBuffer`, or the
   * string you read off the wire before any JSON parser touched it.
   */
  payload: WebhookPayload;
  /**
   * The endpoint's signing secret, or several. Hold two during a rotation:
   * the new one and the one it replaced.
   */
  secret: string | string[];
  /** The `0xa-signature` header value, if you have it directly. */
  signature?: string;
  /** Or the whole header bag, which is also read for id and type. */
  headers?: WebhookHeaders;
  /**
   * Replay window in seconds (default {@link
   * DEFAULT_WEBHOOK_TOLERANCE_SECONDS}). `0` demands the same second;
   * `Number.POSITIVE_INFINITY` disables the check, which is only sensible
   * when replaying stored deliveries in a test.
   */
  toleranceSeconds?: number;
  /** Current time in Unix milliseconds. Defaults to `Date.now()`. */
  now?: number;
  /**
   * WebCrypto implementation to use. Defaults to `globalThis.crypto.subtle`.
   * Supply it explicitly only on a runtime that has no global WebCrypto, for
   * example `require('node:crypto').webcrypto.subtle`.
   */
  subtle?: SubtleCryptoLike;
}

/**
 * An imported HMAC key. Structurally whatever the runtime's WebCrypto
 * returns; the SDK only ever hands it straight back to `sign`.
 */
export interface WebhookCryptoKey {
  readonly type?: string;
}

/**
 * The slice of WebCrypto this helper uses, declared locally so the SDK
 * needs neither the DOM lib nor a Node-only import.
 */
export interface SubtleCryptoLike {
  importKey(
    format: 'raw',
    keyData: Uint8Array,
    algorithm: { name: 'HMAC'; hash: 'SHA-256' },
    extractable: boolean,
    keyUsages: ReadonlyArray<'sign'>
  ): Promise<WebhookCryptoKey>;
  sign(algorithm: 'HMAC', key: WebhookCryptoKey, data: Uint8Array): Promise<ArrayBuffer>;
}

/** A parsed `0xa-signature` header. */
export interface ParsedWebhookSignature {
  /** The `t` value exactly as it appeared. Used verbatim in the MAC input. */
  timestamp: string;
  /** Unix seconds, parsed from {@link timestamp} for the freshness check. */
  timestampSeconds: number;
  /** Every `v1` in the header, lowercased. One normally, two mid-rotation. */
  signatures: string[];
}

/**
 * The event envelope 0xArchive sends.
 *
 * Webhook payloads are wire JSON: unlike REST responses, which this SDK
 * camelCases, these keys reach you exactly as they were signed. Rewriting
 * them would mean rewriting the bytes the signature covers.
 */
export interface WebhookEvent<TData = unknown> {
  /** Event UUID. Stable across retries and manual redelivery: dedupe on it. */
  id: string;
  /** Event type, for example `account.fill` or `webhook.test`. */
  type: string;
  /** Envelope version. `1` today. */
  schema_version: number;
  /** RFC 3339 timestamp of when the detector observed the occurrence. */
  observed_at: string;
  /** Age of the occurrence when it was queued, in ms. Absent on test fires. */
  late_ms?: number | null;
  /** Whether `late_ms` crossed the engine's late threshold. */
  late?: boolean;
  /** The event body. Shape depends on `type`. */
  data: TData;
  [key: string]: unknown;
}

/** What a verified delivery told us, beyond the event itself. */
export interface WebhookDeliveryContext {
  /** Value of `0xa-event-id`, when headers were supplied. */
  eventId?: string;
  /** Value of `0xa-event-type`, when headers were supplied. */
  eventType?: string;
  /** Unix seconds the delivery was signed at. */
  signedAtSeconds: number;
}

const textEncoder = new TextEncoder();

function toBytes(payload: WebhookPayload): Uint8Array {
  if (typeof payload === 'string') {
    return textEncoder.encode(payload);
  }
  if (payload instanceof Uint8Array) {
    return payload;
  }
  return new Uint8Array(payload);
}

function toText(payload: WebhookPayload): string {
  if (typeof payload === 'string') {
    return payload;
  }
  return new TextDecoder('utf-8').decode(toBytes(payload));
}

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, '0');
  }
  return out;
}

function resolveSubtle(supplied?: SubtleCryptoLike): SubtleCryptoLike {
  if (supplied) return supplied;
  const webcrypto = (globalThis as { crypto?: { subtle?: unknown } }).crypto;
  if (webcrypto && webcrypto.subtle) {
    return webcrypto.subtle as unknown as SubtleCryptoLike;
  }
  throw new Error(
    'WebCrypto is not available in this runtime. Pass `subtle` explicitly, ' +
      "for example require('node:crypto').webcrypto.subtle."
  );
}

/**
 * Read one header case-insensitively from any of the bag shapes a server
 * hands you. Repeated headers are rejoined with commas, which is how the
 * signature grammar reads them anyway.
 */
export function readWebhookHeader(headers: WebhookHeaders, name: string): string | undefined {
  const wanted = name.toLowerCase();
  const flatten = (value: string | string[] | undefined | null): string | undefined => {
    if (value === undefined || value === null) return undefined;
    return Array.isArray(value) ? value.join(',') : value;
  };

  if (headers instanceof Map) {
    for (const [key, value] of headers) {
      if (key.toLowerCase() === wanted) return flatten(value);
    }
    return undefined;
  }

  const getter = (headers as { get?: unknown }).get;
  if (typeof getter === 'function') {
    const value = (headers as { get(n: string): string | null }).get(name);
    return value === null || value === undefined ? undefined : value;
  }

  for (const [key, value] of Object.entries(
    headers as Record<string, string | string[] | undefined | null>
  )) {
    if (key.toLowerCase() === wanted) return flatten(value);
  }
  return undefined;
}

/**
 * Parse a `0xa-signature` header.
 *
 * Collects **every** `v1`, not just the first: during a rotation the header
 * carries two, and a receiver that reads only one fails intermittently for
 * 24 hours. Returns `null` when the header carries no usable `t` or no
 * usable `v1`.
 */
export function parseWebhookSignatureHeader(header: string): ParsedWebhookSignature | null {
  let timestamp: string | undefined;
  const signatures: string[] = [];

  for (const element of header.split(',')) {
    const part = element.trim();
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const key = part.slice(0, eq);
    const value = part.slice(eq + 1);
    if (key === 't') {
      // Keep the literal substring: it is what the MAC was computed over.
      if (timestamp === undefined && /^\d+$/.test(value)) timestamp = value;
    } else if (key === 'v1') {
      if (value.length > 0) signatures.push(value.toLowerCase());
    }
  }

  if (timestamp === undefined || signatures.length === 0) return null;
  return { timestamp, timestampSeconds: Number(timestamp), signatures };
}

/** Constant-time comparison of two equal-length lowercase hex strings. */
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function hmacSha256Hex(
  secret: string,
  message: Uint8Array,
  subtle: SubtleCryptoLike
): Promise<string> {
  const key = await subtle.importKey(
    'raw',
    // The key is the whole `whsec_...` string. Do not strip the prefix and
    // do not decode the hex: these are the literal ASCII bytes.
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await subtle.sign('HMAC', key, message);
  return toHex(new Uint8Array(mac));
}

function normalizeSecrets(secret: string | string[]): string[] {
  const list = Array.isArray(secret) ? secret : [secret];
  return list.map((s) => (typeof s === 'string' ? s.trim() : '')).filter((s) => s.length > 0);
}

function resolveSignatureHeader(options: VerifyWebhookOptions): string | undefined {
  if (options.signature !== undefined) return options.signature;
  if (options.headers) return readWebhookHeader(options.headers, WEBHOOK_SIGNATURE_HEADER);
  return undefined;
}

/**
 * Build the byte string that is signed: `<t>.<raw body>`, one ASCII full
 * stop, no newline, nothing else.
 */
function signedPayload(timestamp: string, body: Uint8Array): Uint8Array {
  const prefix = textEncoder.encode(`${timestamp}.`);
  const out = new Uint8Array(prefix.length + body.length);
  out.set(prefix, 0);
  out.set(body, prefix.length);
  return out;
}

/**
 * Compute a `0xa-signature` header value the way 0xArchive does.
 *
 * Useful for testing your own receiver without waiting for a delivery. It
 * is not needed to verify one.
 *
 * @param options.payload - Raw body bytes to sign
 * @param options.secret - Signing secret, or several to emit one `v1` each
 * @param options.timestamp - Unix seconds (defaults to now)
 */
export async function createWebhookSignatureHeader(options: {
  payload: WebhookPayload;
  secret: string | string[];
  timestamp?: number;
  subtle?: SubtleCryptoLike;
}): Promise<string> {
  const secrets = normalizeSecrets(options.secret);
  if (secrets.length === 0) {
    throw new WebhookSignatureError('missing_secret', 'At least one signing secret is required.');
  }
  const subtle = resolveSubtle(options.subtle);
  const seconds = Math.floor(options.timestamp ?? Date.now() / 1000);
  const timestamp = String(seconds);
  const message = signedPayload(timestamp, toBytes(options.payload));
  const macs = await Promise.all(secrets.map((s) => hmacSha256Hex(s, message, subtle)));
  return [`t=${timestamp}`, ...macs.map((m) => `v1=${m}`)].join(',');
}

/**
 * Verify a delivery's signature against the raw body.
 *
 * Returns `true` only when the header is well formed, `t` is inside the
 * replay window, and some `v1` matches some secret under a constant-time
 * comparison. Never throws for a delivery that simply fails to verify; it
 * throws only when the call itself is unusable, such as no secret at all.
 *
 * @example
 * ```typescript
 * const ok = await verifyWebhookSignature({
 *   payload: rawBody,                 // string or bytes, never a re-serialised object
 *   headers: req.headers,
 *   secret: [currentSecret, previousSecret],
 * });
 * if (!ok) return res.status(400).send('bad signature');
 * ```
 */
export async function verifyWebhookSignature(options: VerifyWebhookOptions): Promise<boolean> {
  try {
    await assertWebhookSignature(options);
    return true;
  } catch (error) {
    if (error instanceof WebhookSignatureError && error.reason !== 'missing_secret') {
      return false;
    }
    throw error;
  }
}

/**
 * Verify a delivery and return what it was signed with, or throw
 * {@link WebhookSignatureError} naming the check that failed.
 */
export async function assertWebhookSignature(
  options: VerifyWebhookOptions
): Promise<WebhookDeliveryContext> {
  const secrets = normalizeSecrets(options.secret);
  if (secrets.length === 0) {
    throw new WebhookSignatureError(
      'missing_secret',
      'At least one signing secret is required to verify a delivery.'
    );
  }

  const header = resolveSignatureHeader(options);
  if (header === undefined || header.trim().length === 0) {
    throw new WebhookSignatureError(
      'missing_signature_header',
      `No ${WEBHOOK_SIGNATURE_HEADER} header on this request.`
    );
  }

  const parsed = parseWebhookSignatureHeader(header);
  if (parsed === null) {
    throw new WebhookSignatureError(
      'malformed_signature_header',
      `Could not read a timestamp and at least one v1 signature from ${WEBHOOK_SIGNATURE_HEADER}.`
    );
  }

  const tolerance = options.toleranceSeconds ?? DEFAULT_WEBHOOK_TOLERANCE_SECONDS;
  const nowSeconds = Math.floor((options.now ?? Date.now()) / 1000);
  const age = Math.abs(nowSeconds - parsed.timestampSeconds);
  if (age > tolerance) {
    throw new WebhookSignatureError(
      'timestamp_out_of_tolerance',
      `Delivery was signed ${age}s from now, outside the ${tolerance}s replay window.`
    );
  }

  const subtle = resolveSubtle(options.subtle);
  const message = signedPayload(parsed.timestamp, toBytes(options.payload));

  let matched = false;
  for (const secret of secrets) {
    const expected = await hmacSha256Hex(secret, message, subtle);
    for (const candidate of parsed.signatures) {
      // No early exit: every candidate is compared in full so the loop
      // leaks nothing about where a forgery first differs.
      if (constantTimeEquals(candidate, expected)) matched = true;
    }
  }

  if (!matched) {
    throw new WebhookSignatureError(
      'no_matching_signature',
      'No signature in the header matched any of the secrets supplied. ' +
        'Verify the RAW request body, not a re-serialised object, and keep the ' +
        'previous secret for 24 hours after a rotation.'
    );
  }

  return {
    eventId: options.headers
      ? readWebhookHeader(options.headers, WEBHOOK_EVENT_ID_HEADER)
      : undefined,
    eventType: options.headers
      ? readWebhookHeader(options.headers, WEBHOOK_EVENT_TYPE_HEADER)
      : undefined,
    signedAtSeconds: parsed.timestampSeconds,
  };
}

/**
 * Verify a delivery and return the parsed event.
 *
 * Throws {@link WebhookSignatureError} if anything about the delivery is
 * wrong; answer that with a 4xx and log it. Deduplicate accepted events on
 * `event.id`, which is the signed copy of the `0xa-event-id` header and is
 * reused by retries and by manual redelivery.
 */
export async function constructWebhookEvent<TData = unknown>(
  options: VerifyWebhookOptions
): Promise<WebhookEvent<TData>> {
  await assertWebhookSignature(options);
  let parsed: unknown;
  try {
    parsed = JSON.parse(toText(options.payload));
  } catch {
    throw new WebhookSignatureError(
      'invalid_payload',
      'Delivery signature verified but the body is not valid JSON.'
    );
  }
  return parsed as WebhookEvent<TData>;
}
