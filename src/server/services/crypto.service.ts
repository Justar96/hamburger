/**
 * Crypto Service for Deterministic Seed Generation
 *
 * Provides cryptographic seed generation for the seeding engine using HMAC-SHA256.
 * Ensures deterministic seed generation (same inputs always produce same outputs)
 * for auditability and reproducibility of word generation.
 *
 * Security Requirements:
 * - DAILY_SEED_SECRET environment variable must be set
 * - Secret should be a long, random string (64 characters recommended)
 * - Secret must remain consistent across all deployments
 * - Seeds are deterministic but not reversible
 *
 * Seed Generation Flow:
 * 1. Daily Seed: HMAC-SHA256(DAILY_SEED_SECRET, date)
 * 2. User Seed: HMAC-SHA256(dailySeed, userId)
 * 3. PRNG Seed: First 64 bits of user seed as BigInt
 */

import crypto from 'crypto';

const HMAC_ALGORITHM = 'sha256';
const SEED_ENCODING = 'hex';
const SEED_TO_INT64_CHARS = 16;

/**
 * CryptoService handles deterministic seed generation for the seeding engine.
 *
 * Uses HMAC-SHA256 to create cryptographically secure, deterministic seeds:
 * - Daily seeds are consistent for a given date
 * - User seeds are unique per user but deterministic
 * - Seeds can be converted to 64-bit integers for PRNG initialization
 *
 * @example
 * ```typescript
 * const cryptoService = new CryptoService('my-secret-key');
 * const dailySeed = cryptoService.generateDailySeed('2025-10-15');
 * const userSeed = cryptoService.generateUserSeed(dailySeed, 'user123');
 * const prngSeed = cryptoService.seedToInt64(userSeed);
 * ```
 */
export class CryptoService {
  private readonly secret: string;

  /**
   * Creates a new CryptoService instance.
   *
   * @param secret - The secret key for HMAC operations (typically DAILY_SEED_SECRET)
   * @throws {Error} If secret is empty or invalid
   */
  constructor(secret: string) {
    if (!secret || typeof secret !== 'string' || secret.length === 0) {
      throw new Error(
        'DAILY_SEED_SECRET is required for seed generation. ' +
          'Please set this to a long, random string in your environment configuration.'
      );
    }

    this.secret = secret;
  }

  /**
   * Generates a daily seed using HMAC-SHA256(secret, date).
   *
   * This method is deterministic: the same date will always produce the same seed.
   * The seed is a 64-character hexadecimal string (256 bits).
   *
   * @param date - Date string in YYYY-MM-DD format
   * @returns A 64-character hexadecimal seed string
   * @throws {Error} If date is empty or invalid
   *
   * @example
   * ```typescript
   * const seed1 = cryptoService.generateDailySeed('2025-10-15');
   * const seed2 = cryptoService.generateDailySeed('2025-10-15');
   * console.log(seed1 === seed2); // true (deterministic)
   * console.log(seed1.length); // 64 (SHA256 hex length)
   * ```
   */
  generateDailySeed(date: string): string {
    if (!date || typeof date !== 'string') {
      throw new Error('date must be a non-empty string');
    }

    const hmac = crypto.createHmac(HMAC_ALGORITHM, this.secret);
    hmac.update(date);
    return hmac.digest(SEED_ENCODING);
  }

  /**
   * Generates a user-specific seed using HMAC-SHA256(dailySeed, userId).
   *
   * This method is deterministic: the same dailySeed and userId will always
   * produce the same user seed. This creates per-user variation while maintaining
   * daily consistency.
   *
   * @param dailySeed - Daily seed hex string (from generateDailySeed)
   * @param userId - User identifier (typically hashed user ID)
   * @returns A 64-character hexadecimal seed string
   * @throws {Error} If dailySeed or userId is empty or invalid
   *
   * @example
   * ```typescript
   * const dailySeed = cryptoService.generateDailySeed('2025-10-15');
   * const userSeed1 = cryptoService.generateUserSeed(dailySeed, 'user123');
   * const userSeed2 = cryptoService.generateUserSeed(dailySeed, 'user123');
   * console.log(userSeed1 === userSeed2); // true (deterministic)
   *
   * const userSeed3 = cryptoService.generateUserSeed(dailySeed, 'user456');
   * console.log(userSeed1 === userSeed3); // false (different users)
   * ```
   */
  generateUserSeed(dailySeed: string, userId: string): string {
    if (!dailySeed || typeof dailySeed !== 'string') {
      throw new Error('dailySeed must be a non-empty string');
    }

    if (!userId || typeof userId !== 'string') {
      throw new Error('userId must be a non-empty string');
    }

    const hmac = crypto.createHmac(HMAC_ALGORITHM, dailySeed);
    hmac.update(userId);
    return hmac.digest(SEED_ENCODING);
  }

  /**
   * Converts a hex seed to a 64-bit integer for PRNG initialization.
   *
   * Takes the first 16 hex characters (64 bits) of the seed and converts
   * them to a BigInt. This provides the initial state for the PRNG.
   *
   * @param seedHex - Hexadecimal seed string (at least 16 characters)
   * @returns A 64-bit BigInt value
   * @throws {Error} If seedHex is invalid or too short
   *
   * @example
   * ```typescript
   * const seed = cryptoService.generateDailySeed('2025-10-15');
   * const int64 = cryptoService.seedToInt64(seed);
   * console.log(typeof int64); // 'bigint'
   * console.log(int64 >= 0n); // true
   * ```
   */
  seedToInt64(seedHex: string): bigint {
    if (!seedHex || typeof seedHex !== 'string') {
      throw new Error('seedHex must be a non-empty string');
    }

    if (seedHex.length < SEED_TO_INT64_CHARS) {
      throw new Error(
        `seedHex must be at least ${SEED_TO_INT64_CHARS} characters long`
      );
    }

    const hexSubstring = seedHex.substring(0, SEED_TO_INT64_CHARS);
    return BigInt('0x' + hexSubstring);
  }
}
