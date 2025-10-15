/**
 * Telemetry Service for Performance Tracking
 *
 * Provides methods for tracking application performance metrics including:
 * - Request counters (requests, errors, etc.)
 * - Latency samples for p95 calculation
 *
 * Uses Redis data structures:
 * - Hashes for counters (telemetry:{date})
 * - Sorted Sets for latency samples (telemetry:{date}:p95)
 *
 * Key Design Principles:
 * - Non-blocking: telemetry failures never crash the application
 * - Automatic trimming: keeps only the most recent 1000 p95 samples
 * - Timestamp-based FIFO eviction for latency samples
 *
 * Redis Key Schema:
 * - telemetry:{date}      → Hash (field: counter name, value: count)
 * - telemetry:{date}:p95  → Sorted Set (member: timestamp:latencyMs, score: timestamp)
 */

import type { RedisClient } from '@devvit/web/server';
import { TelemetryData } from '../types/data.types';

const TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const MAX_P95_SAMPLES = 1000;

/**
 * TelemetryService provides methods for tracking performance metrics.
 *
 * All methods are designed to fail gracefully - telemetry failures are logged
 * but never throw errors that could crash the application.
 *
 * @example
 * ```typescript
 * const telemetry = new TelemetryService(redis);
 *
 * // Increment request counter
 * await telemetry.incrementCounter('2025-10-14', 'requests');
 *
 * // Record latency sample
 * await telemetry.recordLatency('2025-10-14', 45.3);
 *
 * // Get telemetry data
 * const data = await telemetry.getTelemetry('2025-10-14');
 * const p95 = telemetry.calculateP95(data.p95Samples);
 * ```
 */
export class TelemetryService {
  constructor(private redis: RedisClient) {}

  /**
   * Increments a counter for a specific date.
   *
   * Uses Redis hIncrBy for atomic increment operations.
   * Sets 7-day TTL on first write to the hash.
   *
   * This method never throws - failures are logged but don't crash the app.
   *
   * @param date - Date in YYYY-MM-DD format
   * @param counter - Counter name (e.g., 'requests', 'errors', 'health_checks')
   *
   * @example
   * ```typescript
   * await telemetry.incrementCounter('2025-10-14', 'requests');
   * await telemetry.incrementCounter('2025-10-14', 'errors');
   * ```
   */
  async incrementCounter(date: string, counter: string): Promise<void> {
    const key = `telemetry:${date}`;

    try {
      await this.redis.hIncrBy(key, counter, 1);

      // Set expiration on first write
      await this.ensureTTL(key);
    } catch (error) {
      // Telemetry failures should not crash the app
      console.error(
        `Telemetry increment failed for counter "${counter}" on date ${date}:`,
        error
      );
    }
  }

  /**
   * Records a latency sample for p95 calculation.
   *
   * Uses Redis sorted set with timestamp as score for FIFO trimming.
   * Automatically trims to keep only the most recent 1000 samples.
   * Sets 7-day TTL on first write.
   *
   * This method never throws - failures are logged but don't crash the app.
   *
   * @param date - Date in YYYY-MM-DD format
   * @param latencyMs - Latency in milliseconds
   *
   * @example
   * ```typescript
   * const start = Date.now();
   * // ... perform operation ...
   * const latency = Date.now() - start;
   * await telemetry.recordLatency('2025-10-14', latency);
   * ```
   */
  async recordLatency(date: string, latencyMs: number): Promise<void> {
    const key = `telemetry:${date}:p95`;

    try {
      const timestamp = Date.now();

      // Add to sorted set with timestamp as score for FIFO trimming
      await this.redis.zAdd(key, {
        member: `${timestamp}:${latencyMs}`,
        score: timestamp,
      });

      // Trim to most recent N samples
      const count = await this.redis.zCard(key);
      if (count > MAX_P95_SAMPLES) {
        // Remove oldest samples (lowest scores)
        await this.redis.zRemRangeByRank(key, 0, count - MAX_P95_SAMPLES - 1);
      }

      // Set expiration on first write
      await this.ensureTTL(key);
    } catch (error) {
      // Telemetry failures should not crash the app
      console.error(
        `Telemetry latency recording failed for date ${date}:`,
        error
      );
    }
  }

  /**
   * Retrieves telemetry data for a specific date.
   *
   * Returns counters and p95 samples. If retrieval fails, returns default values
   * (zeros and empty array) rather than throwing.
   *
   * @param date - Date in YYYY-MM-DD format
   * @returns TelemetryData with counters and p95 samples
   *
   * @example
   * ```typescript
   * const data = await telemetry.getTelemetry('2025-10-14');
   * console.log(data.requests); // 1523
   * console.log(data.errors); // 3
   * console.log(data.p95Samples.length); // 1000
   * ```
   */
  async getTelemetry(date: string): Promise<TelemetryData> {
    const key = `telemetry:${date}`;
    const p95Key = `telemetry:${date}:p95`;

    try {
      // Get all counters from hash
      const counters = await this.redis.hGetAll(key);

      // Get all p95 samples from sorted set
      const p95Entries = await this.redis.zRange(p95Key, 0, -1);

      // Extract latency values from "timestamp:latency" format
      const p95Samples = p95Entries.map(
        (result: { member: string; score: number }) => {
          const [, latency] = result.member.split(':');
          return parseFloat(latency);
        }
      );

      return {
        requests: parseInt(counters.requests || '0', 10),
        errors: parseInt(counters.errors || '0', 10),
        p95Samples,
      };
    } catch (error) {
      // Telemetry failures should not crash the app
      console.error(`Telemetry retrieval failed for date ${date}:`, error);
      return { requests: 0, errors: 0, p95Samples: [] };
    }
  }

  /**
   * Calculates the 95th percentile from an array of latency samples.
   *
   * This is a client-side calculation (not stored in Redis).
   * Returns 0 if the samples array is empty.
   *
   * @param samples - Array of latency values in milliseconds
   * @returns 95th percentile value, or 0 if no samples
   *
   * @example
   * ```typescript
   * const samples = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
   * const p95 = telemetry.calculateP95(samples);
   * console.log(p95); // 95
   * ```
   */
  calculateP95(samples: number[]): number {
    if (samples.length === 0) {
      return 0;
    }

    // Sort samples in ascending order
    const sorted = [...samples].sort((a, b) => a - b);

    // Calculate 95th percentile index
    const index = Math.ceil(sorted.length * 0.95) - 1;

    return sorted[index];
  }

  /**
   * Ensures a key has TTL set. If TTL is not set (returns -1), sets it to 7 days.
   *
   * This is called after first write to ensure automatic cleanup of old data.
   * Failures are logged but don't throw - TTL setting is not critical.
   *
   * @param key - Redis key to check and set TTL for
   * @private
   */
  private async ensureTTL(key: string): Promise<void> {
    try {
      const expireTime = await this.redis.expireTime(key);

      // expireTime of -1 means key exists but has no expiration
      // expireTime of -2 means key doesn't exist
      if (expireTime === -1) {
        await this.redis.expire(key, TTL_SECONDS);
      }
    } catch (error) {
      // Log but don't throw - TTL setting is not critical for functionality
      console.error(`Failed to set TTL for key ${key}:`, error);
    }
  }
}
