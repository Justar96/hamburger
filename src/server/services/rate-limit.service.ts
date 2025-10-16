/**
 * Rate Limiting Service for API Endpoints
 *
 * Provides Redis-based rate limiting specifically for the /api/pick endpoint.
 * Implements a sliding window approach using Redis keys with TTL for automatic cleanup.
 *
 * Rate Limiting Strategy:
 * - 1 request per 3 seconds per user
 * - Uses hashed user ID as rate limit key
 * - 5-second TTL for automatic cleanup
 * - Returns structured results with retry-after information
 * - Graceful degradation on Redis failures
 *
 * Redis Key Schema:
 * - rate_limit:{userHash} → String (timestamp of last request, 5s TTL)
 */

import type { RedisClient } from '@devvit/web/server';

const RATE_LIMIT_WINDOW_SECONDS = 3; // 1 request per 3 seconds
const RATE_LIMIT_TTL_SECONDS = 5; // Key expires after 5 seconds

/**
 * Result of a rate limit check operation.
 */
export interface RateLimitResult {
  /** Whether the request is allowed (not rate limited) */
  allowed: boolean;
  /** Number of seconds to wait before retrying (only present when allowed=false) */
  retryAfterSeconds?: number;
}

/**
 * RateLimitService provides rate limiting functionality for API endpoints.
 *
 * Uses Redis to track request timestamps per user with automatic TTL cleanup.
 * Designed specifically for the /api/pick endpoint to prevent abuse.
 *
 * @example
 * ```typescript
 * const rateLimitService = new RateLimitService(redis);
 *
 * // Check if user can make a request
 * const result = await rateLimitService.checkRateLimit('hashedUserId');
 * if (!result.allowed) {
 *   return res.status(429).json({
 *     error: {
 *       code: 'RATE_LIMITED',
 *       message: 'Too many requests. Please wait before submitting again.',
 *       details: { retryAfterSeconds: result.retryAfterSeconds }
 *     }
 *   });
 * }
 * ```
 */
export class RateLimitService {
  constructor(private redis: RedisClient) {}

  /**
   * Checks if a user is within their rate limit and updates the rate limit state.
   *
   * Uses a simple timestamp-based approach:
   * 1. Get the last request timestamp for the user
   * 2. If no previous request or enough time has passed, allow the request
   * 3. If rate limited, calculate retry-after time
   * 4. Update the timestamp for allowed requests
   *
   * @param userHash - Hashed user ID (from IdentityService)
   * @returns Promise resolving to RateLimitResult
   *
   * @example
   * ```typescript
   * const result = await rateLimitService.checkRateLimit('a3f2b1c4...');
   * if (result.allowed) {
   *   // Process the request
   * } else {
   *   // Return 429 with retry-after: result.retryAfterSeconds
   * }
   * ```
   */
  async checkRateLimit(userHash: string): Promise<RateLimitResult> {
    const key = `rate_limit:${userHash}`;
    const now = Date.now();

    try {
      // Get the last request timestamp
      const lastRequestData = await this.redis.get(key);

      if (lastRequestData) {
        const lastRequestTime = parseInt(lastRequestData, 10);
        const timeSinceLastRequest = (now - lastRequestTime) / 1000; // Convert to seconds

        // Handle future timestamps or invalid data gracefully by allowing the request
        if (isNaN(lastRequestTime) || timeSinceLastRequest < 0) {
          // Invalid or future timestamp - allow request and reset
        } else if (timeSinceLastRequest < RATE_LIMIT_WINDOW_SECONDS) {
          // Rate limited - calculate retry after time
          const retryAfterSeconds = Math.ceil(
            RATE_LIMIT_WINDOW_SECONDS - timeSinceLastRequest
          );

          return {
            allowed: false,
            retryAfterSeconds,
          };
        }
      }

      // Request is allowed - update the timestamp
      await this.redis.set(key, now.toString(), {
        expiration: new Date(Date.now() + RATE_LIMIT_TTL_SECONDS * 1000),
      });

      return {
        allowed: true,
      };
    } catch (error) {
      // Graceful degradation - if Redis fails, allow the request
      // This prevents Redis outages from blocking all API requests
      console.error(`Rate limit check failed for user ${userHash}:`, error);

      return {
        allowed: true,
      };
    }
  }

  /**
   * Clears the rate limit for a specific user.
   *
   * Useful for testing or administrative purposes.
   * In production, rate limits automatically expire via TTL.
   *
   * @param userHash - Hashed user ID to clear rate limit for
   * @returns Promise resolving when the operation completes
   *
   * @example
   * ```typescript
   * // Clear rate limit for testing
   * await rateLimitService.clearRateLimit('testUserHash');
   * ```
   */
  async clearRateLimit(userHash: string): Promise<void> {
    const key = `rate_limit:${userHash}`;

    try {
      await this.redis.del(key);
    } catch (error) {
      // Log but don't throw - clearing rate limits is not critical
      console.error(`Failed to clear rate limit for user ${userHash}:`, error);
    }
  }

  /**
   * Gets the current rate limit status for a user without updating it.
   *
   * Useful for checking rate limit status without consuming a request.
   *
   * @param userHash - Hashed user ID to check
   * @returns Promise resolving to rate limit information
   *
   * @example
   * ```typescript
   * const status = await rateLimitService.getRateLimitStatus('userHash');
   * if (!status.allowed) {
   *   console.log(`User rate limited for ${status.retryAfterSeconds} more seconds`);
   * }
   * ```
   */
  async getRateLimitStatus(userHash: string): Promise<RateLimitResult> {
    const key = `rate_limit:${userHash}`;
    const now = Date.now();

    try {
      const lastRequestData = await this.redis.get(key);

      if (!lastRequestData) {
        return { allowed: true };
      }

      const lastRequestTime = parseInt(lastRequestData, 10);
      const timeSinceLastRequest = (now - lastRequestTime) / 1000;

      // Handle future timestamps or invalid data gracefully
      if (
        isNaN(lastRequestTime) ||
        timeSinceLastRequest < 0 ||
        timeSinceLastRequest >= RATE_LIMIT_WINDOW_SECONDS
      ) {
        return { allowed: true };
      }

      const retryAfterSeconds = Math.ceil(
        RATE_LIMIT_WINDOW_SECONDS - timeSinceLastRequest
      );

      return {
        allowed: false,
        retryAfterSeconds,
      };
    } catch (error) {
      // Graceful degradation
      console.error(
        `Rate limit status check failed for user ${userHash}:`,
        error
      );
      return { allowed: true };
    }
  }
}
