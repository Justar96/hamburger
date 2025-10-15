/**
 * Identity Service for User ID Hashing
 *
 * Provides privacy-preserving user identification through SHA256 hashing with pepper.
 * Ensures deterministic hashing (same user ID always produces the same hash) while
 * preventing rainbow table attacks through the use of a secret pepper value.
 *
 * Security Requirements:
 * - USER_ID_PEPPER environment variable must be set
 * - Pepper should be a long, random string (minimum 32 characters recommended)
 * - Pepper must remain consistent across all deployments
 * - Raw user IDs must never appear in logs or storage
 */

import crypto from 'crypto';

const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';
const EXPECTED_HASH_LENGTH = 64;

/**
 * IdentityService handles secure, deterministic hashing of user IDs.
 *
 * Uses SHA256 with a secret pepper to create one-way hashes that:
 * - Protect user privacy (hashes cannot be reversed)
 * - Maintain determinism (same user always gets same hash)
 * - Prevent rainbow table attacks (pepper adds secret salt)
 *
 * @example
 * ```typescript
 * const identityService = new IdentityService();
 * const hashedId = identityService.hashUserId('t2_user123');
 * // Returns: "a3f2b1c4d5e6..." (64-character hex string)
 * ```
 */
export class IdentityService {
  private readonly pepper: string;

  /**
   * Creates a new IdentityService instance.
   *
   * @throws {Error} If USER_ID_PEPPER environment variable is not set or invalid
   */
  constructor() {
    this.pepper = process.env.USER_ID_PEPPER || '';

    if (!this.pepper) {
      throw new Error(
        'USER_ID_PEPPER environment variable is required for user identity hashing. ' +
          'Please set this to a long, random string in your environment configuration.'
      );
    }

    if (this.pepper.length < 32) {
      throw new Error(
        'USER_ID_PEPPER must be at least 32 characters long for adequate security.'
      );
    }
  }

  /**
   * Hashes a user ID using SHA256 with pepper.
   *
   * This method is deterministic: the same userId will always produce the same hash.
   * The hash is a 64-character hexadecimal string (256 bits).
   *
   * @param userId - The user ID to hash (e.g., Reddit user ID like "t2_user123")
   * @returns A 64-character hexadecimal hash string
   * @throws {Error} If userId is empty or invalid
   *
   * @example
   * ```typescript
   * const hash1 = identityService.hashUserId('t2_user123');
   * const hash2 = identityService.hashUserId('t2_user123');
   * console.log(hash1 === hash2); // true (deterministic)
   * console.log(hash1.length); // 64 (SHA256 hex length)
   * ```
   */
  hashUserId(userId: string): string {
    if (!userId || typeof userId !== 'string') {
      throw new Error('userId must be a non-empty string');
    }

    const input = userId + this.pepper;
    const hash = crypto
      .createHash(HASH_ALGORITHM)
      .update(input)
      .digest(HASH_ENCODING);

    return hash;
  }

  /**
   * Verifies that a hash matches a given user ID.
   *
   * This method is primarily for testing and debugging purposes.
   * It re-hashes the userId and compares it to the provided hash using
   * constant-time comparison to prevent timing attacks.
   *
   * @param userId - The user ID to verify
   * @param hash - The hash to verify against
   * @returns true if the hash matches the userId, false otherwise
   *
   * @example
   * ```typescript
   * const hash = identityService.hashUserId('t2_user123');
   * const isValid = identityService.verifyHash('t2_user123', hash);
   * console.log(isValid); // true
   *
   * const isInvalid = identityService.verifyHash('t2_different', hash);
   * console.log(isInvalid); // false
   * ```
   */
  verifyHash(userId: string, hash: string): boolean {
    if (!hash || typeof hash !== 'string' || hash.length !== EXPECTED_HASH_LENGTH) {
      return false;
    }

    try {
      const computedHash = this.hashUserId(userId);
      return crypto.timingSafeEqual(
        Buffer.from(computedHash, HASH_ENCODING),
        Buffer.from(hash, HASH_ENCODING)
      );
    } catch {
      return false;
    }
  }
}
