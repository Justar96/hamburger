/**
 * Data Service for Redis Operations
 *
 * Provides an abstraction layer over Redis operations for managing daily seeds,
 * user choices, and vote tallies. Uses Redis native data structures for optimal
 * performance:
 * - Strings for seed data (JSON serialized)
 * - Hashes for user choices (one hash per day, field per user)
 * - Sorted Sets for tallies (efficient top-N queries and increments)
 *
 * All keys are automatically set with a 7-day TTL on first write.
 *
 * Redis Key Schema:
 * - seed:{date}     → String (JSON serialized SeedData)
 * - choices:{date}  → Hash (field: userIdHash, value: JSON array of words)
 * - tallies:{date}  → Sorted Set (member: word, score: count)
 */

import type { RedisClient } from '@devvit/web/server';
import { SeedData, UserChoices, TallyEntry } from '../types/data.types';

const TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

/**
 * DataService provides methods for storing and retrieving game data in Redis.
 *
 * @example
 * ```typescript
 * const dataService = new DataService(redis);
 *
 * // Store seed data
 * await dataService.setSeed('2025-10-14', {
 *   seedHex: '8d23abc...',
 *   theme: 'Nocturnal Cities',
 *   poolsVersion: 'v1',
 *   createdAt: Date.now()
 * });
 *
 * // Retrieve seed data
 * const seed = await dataService.getSeed('2025-10-14');
 *
 * // Store user choices
 * await dataService.setUserChoices('2025-10-14', 'hashedUserId', ['neon', 'rain']);
 *
 * // Increment tallies
 * await dataService.incrementTallies('2025-10-14', ['neon', 'rain', 'neon']);
 *
 * // Get top words
 * const topWords = await dataService.getTopWords('2025-10-14', 10);
 * ```
 */
export class DataService {
  constructor(private redis: RedisClient) {}

  /**
   * Stores seed data for a specific date.
   *
   * @param date - Date in YYYY-MM-DD format
   * @param seed - Seed data to store
   * @throws {Error} If Redis operation fails
   *
   * @example
   * ```typescript
   * await dataService.setSeed('2025-10-14', {
   *   seedHex: '8d23abc...',
   *   theme: 'Nocturnal Cities',
   *   poolsVersion: 'v1',
   *   createdAt: 1728950400
   * });
   * ```
   */
  async setSeed(date: string, seed: SeedData): Promise<void> {
    const key = `seed:${date}`;
    const value = JSON.stringify(seed);

    try {
      await this.redis.set(key, value, {
        expiration: new Date(Date.now() + TTL_SECONDS * 1000),
      });
    } catch (error) {
      throw new Error(
        `Failed to set seed for date ${date}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Retrieves seed data for a specific date.
   *
   * @param date - Date in YYYY-MM-DD format
   * @returns Seed data if found, null otherwise
   * @throws {Error} If Redis operation fails or data is malformed
   *
   * @example
   * ```typescript
   * const seed = await dataService.getSeed('2025-10-14');
   * if (seed) {
   *   console.log(seed.theme); // "Nocturnal Cities"
   * }
   * ```
   */
  async getSeed(date: string): Promise<SeedData | null> {
    const key = `seed:${date}`;

    try {
      const data = await this.redis.get(key);

      if (!data) {
        return null;
      }

      return JSON.parse(data) as SeedData;
    } catch (error) {
      throw new Error(
        `Failed to get seed for date ${date}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Stores user's word choices for a specific date.
   *
   * Uses Redis hash to store all users' choices for a day in a single key.
   * Sets 7-day TTL on first write to the hash.
   *
   * @param date - Date in YYYY-MM-DD format
   * @param userIdHash - Hashed user ID (from IdentityService)
   * @param choices - Array of word strings selected by the user
   * @throws {Error} If Redis operation fails
   *
   * @example
   * ```typescript
   * await dataService.setUserChoices(
   *   '2025-10-14',
   *   'a3f2b1c4...',
   *   ['neon', 'rain', 'alley']
   * );
   * ```
   */
  async setUserChoices(
    date: string,
    userIdHash: string,
    choices: UserChoices
  ): Promise<void> {
    const key = `choices:${date}`;
    const value = JSON.stringify(choices);

    try {
      await this.redis.hSet(key, { [userIdHash]: value });

      // Set expiration on first write
      await this.ensureTTL(key);
    } catch (error) {
      throw new Error(
        `Failed to set user choices for date ${date}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Retrieves user's word choices for a specific date.
   *
   * @param date - Date in YYYY-MM-DD format
   * @param userIdHash - Hashed user ID (from IdentityService)
   * @returns Array of word strings if found, null otherwise
   * @throws {Error} If Redis operation fails or data is malformed
   *
   * @example
   * ```typescript
   * const choices = await dataService.getUserChoices('2025-10-14', 'a3f2b1c4...');
   * if (choices) {
   *   console.log(choices); // ['neon', 'rain', 'alley']
   * }
   * ```
   */
  async getUserChoices(
    date: string,
    userIdHash: string
  ): Promise<UserChoices | null> {
    const key = `choices:${date}`;

    try {
      const data = await this.redis.hGet(key, userIdHash);

      if (!data) {
        return null;
      }

      return JSON.parse(data) as UserChoices;
    } catch (error) {
      throw new Error(
        `Failed to get user choices for date ${date}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Increments vote tallies for multiple words.
   *
   * Uses Redis sorted set with zIncrBy for atomic increments.
   * Each word's score represents its total vote count.
   * Sets 7-day TTL on first write.
   *
   * @param date - Date in YYYY-MM-DD format
   * @param words - Array of words to increment (duplicates will increment multiple times)
   * @throws {Error} If Redis operation fails
   *
   * @example
   * ```typescript
   * // Increment 'neon' by 2, 'rain' by 1
   * await dataService.incrementTallies('2025-10-14', ['neon', 'rain', 'neon']);
   * ```
   */
  async incrementTallies(date: string, words: string[]): Promise<void> {
    const key = `tallies:${date}`;

    try {
      // Increment each word atomically
      for (const word of words) {
        await this.redis.zIncrBy(key, word, 1);
      }

      // Set expiration on first write
      await this.ensureTTL(key);
    } catch (error) {
      throw new Error(
        `Failed to increment tallies for date ${date}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Retrieves the top N words by vote count for a specific date.
   *
   * Uses Redis sorted set zRange with reverse option to get highest scores first.
   * Returns results in descending order by count.
   *
   * @param date - Date in YYYY-MM-DD format
   * @param limit - Maximum number of words to return
   * @returns Array of TallyEntry objects sorted by count (descending)
   * @throws {Error} If Redis operation fails
   *
   * @example
   * ```typescript
   * const topWords = await dataService.getTopWords('2025-10-14', 10);
   * // Returns: [{ word: 'neon', count: 42 }, { word: 'rain', count: 38 }, ...]
   * ```
   */
  async getTopWords(date: string, limit: number): Promise<TallyEntry[]> {
    const key = `tallies:${date}`;

    try {
      // Get top N members with scores in descending order
      const results = await this.redis.zRange(key, 0, limit - 1, {
        by: 'rank',
        reverse: true,
      });

      return results.map((result: { member: string; score: number }) => ({
        word: result.member,
        count: result.score,
      }));
    } catch (error) {
      throw new Error(
        `Failed to get top words for date ${date}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Retrieves the vote count for a specific word on a specific date.
   *
   * Uses Redis sorted set zScore to get the count efficiently.
   *
   * @param date - Date in YYYY-MM-DD format
   * @param word - The word to get the count for
   * @returns Vote count for the word, or 0 if word has no votes
   * @throws {Error} If Redis operation fails
   *
   * @example
   * ```typescript
   * const count = await dataService.getTallyCount('2025-10-14', 'neon');
   * console.log(count); // 42
   * ```
   */
  async getTallyCount(date: string, word: string): Promise<number> {
    const key = `tallies:${date}`;

    try {
      const score = await this.redis.zScore(key, word);
      return score ?? 0;
    } catch (error) {
      throw new Error(
        `Failed to get tally count for word "${word}" on date ${date}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Ensures a key has TTL set. If TTL is not set (returns -1), sets it to 7 days.
   *
   * This is called after first write to hash and sorted set keys to ensure
   * automatic cleanup of old data.
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
