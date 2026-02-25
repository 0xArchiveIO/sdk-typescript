import { type HttpClient, transformKeys } from '../http';
import {
  type SiweChallenge,
  type Web3SignupResult,
  type Web3KeysList,
  type Web3RevokeResult,
  type Web3PaymentRequired,
  type Web3SubscribeResult,
  OxArchiveError,
} from '../types';

/**
 * Wallet-based authentication: get API keys via SIWE signature.
 *
 * No API key is required for these endpoints. Use an Ethereum wallet to
 * create a free-tier account, list keys, or revoke keys — all programmatically.
 *
 * @example
 * ```typescript
 * const client = new OxArchive({ apiKey: 'placeholder' });
 *
 * // Step 1: Get a challenge
 * const challenge = await client.web3.challenge('0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18');
 *
 * // Step 2: Sign the message with your wallet, then submit
 * const result = await client.web3.signup(challenge.message, signature);
 * console.log(`API key: ${result.apiKey}`);
 * ```
 */
export class Web3Resource {
  constructor(private http: HttpClient) {}

  /**
   * Get a SIWE challenge message to sign.
   *
   * @param address - Ethereum wallet address
   * @returns SIWE message and nonce. Sign the message with personal_sign (EIP-191).
   */
  async challenge(address: string): Promise<SiweChallenge> {
    return this.http.post<SiweChallenge>('/v1/auth/web3/challenge', { address });
  }

  /**
   * Create a free-tier account and get an API key.
   *
   * @param message - The SIWE message from {@link challenge}
   * @param signature - Hex-encoded signature from personal_sign
   * @returns API key, tier, and wallet address
   */
  async signup(message: string, signature: string): Promise<Web3SignupResult> {
    return this.http.post<Web3SignupResult>('/v1/web3/signup', { message, signature });
  }

  /**
   * List all API keys for the authenticated wallet.
   *
   * @param message - The SIWE message from {@link challenge}
   * @param signature - Hex-encoded signature from personal_sign
   * @returns List of API keys and wallet address
   */
  async listKeys(message: string, signature: string): Promise<Web3KeysList> {
    return this.http.post<Web3KeysList>('/v1/web3/keys', { message, signature });
  }

  /**
   * Revoke a specific API key.
   *
   * @param message - The SIWE message from {@link challenge}
   * @param signature - Hex-encoded signature from personal_sign
   * @param keyId - UUID of the key to revoke
   * @returns Confirmation message and wallet address
   */
  async revokeKey(message: string, signature: string, keyId: string): Promise<Web3RevokeResult> {
    return this.http.post<Web3RevokeResult>('/v1/web3/keys/revoke', {
      message,
      signature,
      key_id: keyId,
    });
  }

  /**
   * Get pricing info for a paid subscription (x402 flow, step 1).
   *
   * Returns the payment details needed to sign a USDC transfer on Base.
   * After signing, pass the payment signature to {@link subscribe}.
   *
   * @param tier - Subscription tier: 'build' ($49/mo) or 'pro' ($199/mo)
   * @returns Payment details (amount, asset, network, pay-to address)
   */
  async subscribeQuote(tier: 'build' | 'pro'): Promise<Web3PaymentRequired> {
    const url = `${this.http.getBaseUrl()}/v1/web3/subscribe`;
    const timeout = this.http.getTimeout();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const rawData = await response.json();
      const data = transformKeys(rawData) as Record<string, unknown>;
      if (response.status === 402) {
        return (data as Record<string, unknown>).payment as unknown as Web3PaymentRequired;
      }
      throw new OxArchiveError(
        (data as Record<string, unknown>).error as string || `Unexpected status ${response.status}`,
        response.status
      );
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof OxArchiveError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new OxArchiveError(`Request timeout after ${timeout}ms`, 408);
      }
      throw new OxArchiveError(
        error instanceof Error ? error.message : 'Unknown error', 500
      );
    }
  }

  /**
   * Complete a paid subscription with a signed x402 payment (step 2).
   *
   * Requires a payment signature from signing a USDC transfer (EIP-3009)
   * for the amount returned by {@link subscribeQuote}.
   *
   * @param tier - Subscription tier: 'build' or 'pro'
   * @param paymentSignature - Signed x402 payment (from EIP-3009 USDC transfer on Base)
   * @returns API key, tier, expiration, and wallet address
   */
  async subscribe(tier: 'build' | 'pro', paymentSignature: string): Promise<Web3SubscribeResult> {
    const url = `${this.http.getBaseUrl()}/v1/web3/subscribe`;
    const timeout = this.http.getTimeout();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'payment-signature': paymentSignature,
        },
        body: JSON.stringify({ tier }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const rawData = await response.json();
      const data = transformKeys(rawData) as Record<string, unknown>;
      if (!response.ok) {
        throw new OxArchiveError(
          (data as Record<string, unknown>).error as string || 'Subscribe failed',
          response.status
        );
      }
      return data as unknown as Web3SubscribeResult;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof OxArchiveError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new OxArchiveError(`Request timeout after ${timeout}ms`, 408);
      }
      throw new OxArchiveError(
        error instanceof Error ? error.message : 'Unknown error', 500
      );
    }
  }
}
