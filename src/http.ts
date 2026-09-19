import type { z } from 'zod';
import type { ApiResponse, ApiError } from './types';
import { OxArchiveError } from './types';

/**
 * Convert a snake_case string to camelCase.
 *
 * Only `_` followed by a lowercase letter is collapsed. Underscores before
 * digits are preserved so that, e.g., `value_1_test` becomes `value_1Test`
 * (not `value1Test`), matching the JS convention of treating numbers as
 * delimiters rather than word starts.
 *
 * @internal Exported for testing
 */
export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, char) => char.toUpperCase());
}

/**
 * Decides whether a value should be left exactly as the API sent it.
 *
 * Called with the key path of the value being considered, outermost key
 * first and the value's own key last. Array indices are not part of the
 * path, so `data.deliveries[3].payload` is `['data', 'deliveries',
 * 'payload']`.
 *
 * Returning `true` renames the key itself (the SDK convention still
 * applies) but copies the value underneath verbatim, keys included. That is
 * what free-form JSON needs: webhook event payloads, subscription filter
 * objects, and the event catalog's parameter and metric maps are customer
 * or market data whose keys carry meaning, not wire-format fields to be
 * translated.
 */
export type KeyPreserver = (path: readonly string[]) => boolean;

/**
 * Recursively transform all object keys from snake_case to camelCase.
 *
 * @param obj - Parsed JSON to transform
 * @param preserve - Optional predicate marking subtrees to copy verbatim
 * @param path - Key path of `obj` (internal; used to feed `preserve`)
 * @internal Exported for testing
 */
export function transformKeys(
  obj: unknown,
  preserve?: KeyPreserver,
  path: readonly string[] = []
): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => transformKeys(item, preserve, path));
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const childPath = preserve ? [...path, key] : path;
      result[snakeToCamel(key)] =
        preserve && preserve(childPath) ? value : transformKeys(value, preserve, childPath);
    }
    return result;
  }

  return obj;
}

export interface HttpClientOptions {
  baseUrl: string;
  apiKey: string;
  timeout: number;
  /** Enable runtime validation of API responses using Zod schemas (default: false) */
  validate?: boolean;
}

/**
 * Pull the request id out of a parsed response envelope.
 *
 * Success envelopes carry it under `meta`. The error envelope does not have
 * a `meta` at all: it is `{ code, error, request_id }`, which reaches this
 * point already camelCased to `requestId` at the top level. Reading only
 * `meta` therefore left {@link OxArchiveError.requestId} undefined on every
 * error, which is the one case support actually needs it for.
 */
function requestIdOf(data: unknown): string | undefined {
  const envelope = data as Partial<ApiResponse<unknown>> & { requestId?: unknown };
  const fromMeta = envelope?.meta?.requestId;
  if (typeof fromMeta === 'string') return fromMeta;
  return typeof envelope?.requestId === 'string' ? envelope.requestId : undefined;
}

/** Per-request options shared by every verb. */
export interface RequestOptions<T> {
  /** Query string parameters (GET) */
  params?: Record<string, unknown>;
  /** JSON request body. Sent verbatim: request keys are never rewritten. */
  body?: Record<string, unknown>;
  /** Zod schema used when validation is enabled */
  schema?: z.ZodType<T>;
  /** Subtrees of the response to copy verbatim instead of camelCasing */
  preserve?: KeyPreserver;
}

/**
 * Internal HTTP client for making API requests
 */
export class HttpClient {
  private baseUrl: string;
  private apiKey: string;
  private timeout: number;
  private validate: boolean;

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.apiKey = options.apiKey;
    this.timeout = options.timeout;
    this.validate = options.validate ?? false;
  }

  /** Whether validation is enabled */
  get validationEnabled(): boolean {
    return this.validate;
  }

  /** Base URL for raw requests (used by web3 subscribe) */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /** Timeout in ms for raw requests (used by web3 subscribe) */
  getTimeout(): number {
    return this.timeout;
  }

  /**
   * Make a GET request to the API
   *
   * @param path - API endpoint path
   * @param params - Query parameters
   * @param schema - Optional Zod schema for validation (used when validation is enabled)
   * @param preserve - Optional predicate marking response subtrees to copy verbatim
   */
  async get<T>(
    path: string,
    params?: Record<string, unknown>,
    schema?: z.ZodType<T>,
    preserve?: KeyPreserver
  ): Promise<T> {
    return this.request<T>('GET', path, { params, schema, preserve });
  }

  /**
   * Make a POST request to the API
   *
   * @param path - API endpoint path
   * @param body - JSON request body
   * @param schema - Optional Zod schema for validation (used when validation is enabled)
   * @param preserve - Optional predicate marking response subtrees to copy verbatim
   */
  async post<T>(
    path: string,
    body?: Record<string, unknown>,
    schema?: z.ZodType<T>,
    preserve?: KeyPreserver
  ): Promise<T> {
    return this.request<T>('POST', path, { body, schema, preserve });
  }

  /**
   * Make a PATCH request to the API
   *
   * @param path - API endpoint path
   * @param body - JSON request body
   * @param schema - Optional Zod schema for validation (used when validation is enabled)
   * @param preserve - Optional predicate marking response subtrees to copy verbatim
   */
  async patch<T>(
    path: string,
    body?: Record<string, unknown>,
    schema?: z.ZodType<T>,
    preserve?: KeyPreserver
  ): Promise<T> {
    return this.request<T>('PATCH', path, { body, schema, preserve });
  }

  /**
   * Make a DELETE request to the API
   *
   * @param path - API endpoint path
   * @param schema - Optional Zod schema for validation (used when validation is enabled)
   */
  async delete<T>(path: string, schema?: z.ZodType<T>): Promise<T> {
    return this.request<T>('DELETE', path, { schema });
  }

  /**
   * Single request path for every verb: build the URL, apply the timeout,
   * parse the envelope, raise {@link OxArchiveError} on a non-2xx, then
   * optionally validate.
   */
  private async request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    options: RequestOptions<T> = {}
  ): Promise<T> {
    const { params, body, schema, preserve } = options;
    const url = new URL(`${this.baseUrl}${path}`);

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          // Convert Date objects to Unix milliseconds
          if (value instanceof Date) {
            url.searchParams.set(key, String(value.getTime()));
          } else {
            url.searchParams.set(key, String(value));
          }
        }
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url.toString(), {
        method,
        headers: {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const rawData = await response.json();
      // Transform snake_case keys to camelCase for JavaScript conventions
      const data = transformKeys(rawData, preserve) as Record<string, unknown>;

      if (!response.ok) {
        const error = data as unknown as ApiError;
        throw new OxArchiveError(
          error.error || `Request failed with status ${response.status}`,
          response.status,
          requestIdOf(data)
        );
      }

      // Validate response if validation is enabled and schema is provided
      if (this.validate && schema) {
        const result = schema.safeParse(data);
        if (!result.success) {
          throw new OxArchiveError(
            `Response validation failed: ${result.error.message}`,
            422,
            requestIdOf(data)
          );
        }
        return result.data;
      }

      return data as T;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof OxArchiveError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new OxArchiveError(`Request timeout after ${this.timeout}ms`, 408);
      }

      throw new OxArchiveError(
        error instanceof Error ? error.message : 'Unknown error',
        500
      );
    }
  }
}
