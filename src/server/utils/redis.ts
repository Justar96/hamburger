/**
 * Redis Connection Management Utility
 *
 * Provides health check utilities for Redis connectivity.
 * In Devvit Web, redis is provided automatically via the @devvit/web/server package
 * and handles connection management internally.
 *
 * Redis Key Schema:
 * - health:check → Temporary test key (60s TTL) used for connectivity validation
 */

import { redis } from '@devvit/web/server';

/**
 * RedisConnection provides utility methods for Redis health checks.
 *
 * Note: Devvit's redis client is context-aware and manages connections automatically.
 * This class provides a simple interface for health validation.
 */
export class RedisConnection {
  /**
   * Gets the Redis client instance.
   *
   * @returns The redis client provided by Devvit
   */
  static getClient(): typeof redis {
    return redis;
  }

  /**
   * Validates Redis connectivity by performing a simple set/get operation.
   *
   * @returns Promise resolving to true if Redis is available, false otherwise
   */
  static async healthCheck(): Promise<boolean> {
    try {
      const client = this.getClient();
      const testKey = 'health:check';
      const testValue = Date.now().toString();

      // Perform a simple set operation with 60 second expiration
      await client.set(testKey, testValue, {
        expiration: new Date(Date.now() + 60000),
      });

      // Verify we can read it back
      const retrieved = await client.get(testKey);

      return retrieved === testValue;
    } catch (error) {
      console.error('Redis health check failed:', error);
      return false;
    }
  }
}
