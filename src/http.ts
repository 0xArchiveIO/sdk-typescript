import type { z } from 'zod';
import type { ApiResponse, ApiError } from './types';
import { OxArchiveError } from './types';

/**
 * Convert a snake_case string to camelCase
 * @internal Exported for testing
 */
export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Recursively transform all object keys from snake_case to camelCase
 * @internal Exported for testing
 */
export function transformKeys(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(transformKeys);
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[snakeToCamel(key)] = transformKeys(value);
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

  /**
   * Make a GET request to the API
   *
   * @param path - API endpoint path
   * @param params - Query parameters
   * @param schema - Optional Zod schema for validation (used when validation is enabled)
   */
  async get<T>(
    path: string,
    params?: Record<string, unknown>,
    schema?: z.ZodType<T>
  ): Promise<T> {
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
        method: 'GET',
        headers: {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const rawData = await response.json();
      // Transform snake_case keys to camelCase for JavaScript conventions
      const data = transformKeys(rawData) as Record<string, unknown>;

      if (!response.ok) {
        const error = data as unknown as ApiError;
        const apiResponse = data as unknown as ApiResponse<unknown>;
        throw new OxArchiveError(
          error.error || `Request failed with status ${response.status}`,
          response.status,
          apiResponse.meta?.requestId
        );
      }

      // Validate response if validation is enabled and schema is provided
      if (this.validate && schema) {
        const result = schema.safeParse(data);
        if (!result.success) {
          const apiResponse = data as unknown as ApiResponse<unknown>;
          throw new OxArchiveError(
            `Response validation failed: ${result.error.message}`,
            422,
            apiResponse.meta?.requestId
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
