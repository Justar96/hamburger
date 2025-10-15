import { describe, it, expect } from 'vitest';
import { CryptoService } from '../src/server/services/crypto.service';

/**
 * Unit tests for CryptoService
 *
 * These tests verify:
 * - Deterministic seed generation (same input → same output)
 * - Different inputs produce different seeds
 * - Constructor validation of secret parameter
 * - Seed format and length (SHA256 = 64 hex characters)
 * - seedToInt64() conversion accuracy
 * - Daily seed generation
 * - User seed generation
 */

describe('CryptoService', () => {
  const TEST_SECRET = 'test-secret-for-unit-tests-should-be-long-and-random-64chars';
  const SHA256_HEX_LENGTH = 64;
  const SEED_TO_INT64_CHARS = 16;

  describe('constructor', () => {
    it('should throw error when secret is empty string', () => {
      expect(() => new CryptoService('')).toThrow('DAILY_SEED_SECRET is required');
      expect(() => new CryptoService('')).toThrow(
        'Please set this to a long, random string'
      );
    });

    it('should throw error when secret is not provided', () => {
      // @ts-expect-error Testing invalid input
      expect(() => new CryptoService()).toThrow('DAILY_SEED_SECRET is required');
    });

    it('should throw error when secret is null', () => {
      // @ts-expect-error Testing invalid input
      expect(() => new CryptoService(null)).toThrow('DAILY_SEED_SECRET is required');
    });

    it('should throw error when secret is undefined', () => {
      // @ts-expect-error Testing invalid input
      expect(() => new CryptoService(undefined)).toThrow(
        'DAILY_SEED_SECRET is required'
      );
    });

    it('should throw error when secret is not a string', () => {
      // @ts-expect-error Testing invalid input
      expect(() => new CryptoService(123)).toThrow('DAILY_SEED_SECRET is required');
      // @ts-expect-error Testing invalid input
      expect(() => new CryptoService({})).toThrow('DAILY_SEED_SECRET is required');
      // @ts-expect-error Testing invalid input
      expect(() => new CryptoService([])).toThrow('DAILY_SEED_SECRET is required');
    });

    it('should not throw when secret is valid', () => {
      expect(() => new CryptoService(TEST_SECRET)).not.toThrow();
      expect(() => new CryptoService('short')).not.toThrow();
      expect(() => new CryptoService('a')).not.toThrow();
    });

    it('should provide descriptive error message about configuration', () => {
      expect(() => new CryptoService('')).toThrow(
        /Please set this to a long, random string in your environment configuration/
      );
    });
  });

  describe('generateDailySeed()', () => {
    it('should generate deterministic daily seed (same date → same seed)', () => {
      const service = new CryptoService(TEST_SECRET);
      const date = '2025-10-15';

      const seed1 = service.generateDailySeed(date);
      const seed2 = service.generateDailySeed(date);
      const seed3 = service.generateDailySeed(date);

      expect(seed1).toBe(seed2);
      expect(seed2).toBe(seed3);
    });

    it('should produce different seeds for different dates', () => {
      const service = new CryptoService(TEST_SECRET);

      const seed1 = service.generateDailySeed('2025-10-15');
      const seed2 = service.generateDailySeed('2025-10-16');
      const seed3 = service.generateDailySeed('2025-10-17');

      expect(seed1).not.toBe(seed2);
      expect(seed2).not.toBe(seed3);
      expect(seed1).not.toBe(seed3);
    });

    it('should return 64-character hexadecimal string (SHA256 length)', () => {
      const service = new CryptoService(TEST_SECRET);

      const seed = service.generateDailySeed('2025-10-15');

      expect(seed).toHaveLength(SHA256_HEX_LENGTH);
      expect(seed).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should produce different seeds with different secrets', () => {
      const service1 = new CryptoService('secret1-for-testing');
      const service2 = new CryptoService('secret2-for-testing');

      const seed1 = service1.generateDailySeed('2025-10-15');
      const seed2 = service2.generateDailySeed('2025-10-15');

      expect(seed1).not.toBe(seed2);
    });

    it('should throw error for empty date string', () => {
      const service = new CryptoService(TEST_SECRET);

      expect(() => service.generateDailySeed('')).toThrow(
        'date must be a non-empty string'
      );
    });

    it('should throw error for invalid date types', () => {
      const service = new CryptoService(TEST_SECRET);

      // @ts-expect-error Testing invalid input
      expect(() => service.generateDailySeed(null)).toThrow(
        'date must be a non-empty string'
      );
      // @ts-expect-error Testing invalid input
      expect(() => service.generateDailySeed(undefined)).toThrow(
        'date must be a non-empty string'
      );
      // @ts-expect-error Testing invalid input
      expect(() => service.generateDailySeed(123)).toThrow(
        'date must be a non-empty string'
      );
    });

    it('should handle various date formats consistently', () => {
      const service = new CryptoService(TEST_SECRET);

      const seed1 = service.generateDailySeed('2025-10-15');
      const seed2 = service.generateDailySeed('2025-10-15');

      expect(seed1).toBe(seed2);

      // Different format should produce different seed
      const seed3 = service.generateDailySeed('2025/10/15');
      expect(seed1).not.toBe(seed3);
    });

    it('should be case-sensitive for date strings', () => {
      const service = new CryptoService(TEST_SECRET);

      const seed1 = service.generateDailySeed('2025-10-15');
      const seed2 = service.generateDailySeed('2025-10-15');

      expect(seed1).toBe(seed2);
    });

    it('should handle edge case dates', () => {
      const service = new CryptoService(TEST_SECRET);

      const seed1 = service.generateDailySeed('2000-01-01');
      const seed2 = service.generateDailySeed('2099-12-31');
      const seed3 = service.generateDailySeed('2024-02-29'); // Leap year

      expect(seed1).toHaveLength(SHA256_HEX_LENGTH);
      expect(seed2).toHaveLength(SHA256_HEX_LENGTH);
      expect(seed3).toHaveLength(SHA256_HEX_LENGTH);
      expect(seed1).not.toBe(seed2);
      expect(seed2).not.toBe(seed3);
    });

    it('should maintain consistency across multiple service instances', () => {
      const service1 = new CryptoService(TEST_SECRET);
      const service2 = new CryptoService(TEST_SECRET);
      const service3 = new CryptoService(TEST_SECRET);

      const date = '2025-10-15';
      const seed1 = service1.generateDailySeed(date);
      const seed2 = service2.generateDailySeed(date);
      const seed3 = service3.generateDailySeed(date);

      expect(seed1).toBe(seed2);
      expect(seed2).toBe(seed3);
    });
  });

  describe('generateUserSeed()', () => {
    it('should generate deterministic user seed (same user+date → same seed)', () => {
      const service = new CryptoService(TEST_SECRET);
      const dailySeed = service.generateDailySeed('2025-10-15');
      const userId = 'user123';

      const userSeed1 = service.generateUserSeed(dailySeed, userId);
      const userSeed2 = service.generateUserSeed(dailySeed, userId);
      const userSeed3 = service.generateUserSeed(dailySeed, userId);

      expect(userSeed1).toBe(userSeed2);
      expect(userSeed2).toBe(userSeed3);
    });

    it('should produce different seeds for different users', () => {
      const service = new CryptoService(TEST_SECRET);
      const dailySeed = service.generateDailySeed('2025-10-15');

      const userSeed1 = service.generateUserSeed(dailySeed, 'user123');
      const userSeed2 = service.generateUserSeed(dailySeed, 'user456');
      const userSeed3 = service.generateUserSeed(dailySeed, 'user789');

      expect(userSeed1).not.toBe(userSeed2);
      expect(userSeed2).not.toBe(userSeed3);
      expect(userSeed1).not.toBe(userSeed3);
    });

    it('should produce different seeds for different daily seeds', () => {
      const service = new CryptoService(TEST_SECRET);
      const userId = 'user123';

      const dailySeed1 = service.generateDailySeed('2025-10-15');
      const dailySeed2 = service.generateDailySeed('2025-10-16');

      const userSeed1 = service.generateUserSeed(dailySeed1, userId);
      const userSeed2 = service.generateUserSeed(dailySeed2, userId);

      expect(userSeed1).not.toBe(userSeed2);
    });

    it('should return 64-character hexadecimal string (SHA256 length)', () => {
      const service = new CryptoService(TEST_SECRET);
      const dailySeed = service.generateDailySeed('2025-10-15');

      const userSeed = service.generateUserSeed(dailySeed, 'user123');

      expect(userSeed).toHaveLength(SHA256_HEX_LENGTH);
      expect(userSeed).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should throw error for empty dailySeed', () => {
      const service = new CryptoService(TEST_SECRET);

      expect(() => service.generateUserSeed('', 'user123')).toThrow(
        'dailySeed must be a non-empty string'
      );
    });

    it('should throw error for invalid dailySeed types', () => {
      const service = new CryptoService(TEST_SECRET);

      // @ts-expect-error Testing invalid input
      expect(() => service.generateUserSeed(null, 'user123')).toThrow(
        'dailySeed must be a non-empty string'
      );
      // @ts-expect-error Testing invalid input
      expect(() => service.generateUserSeed(undefined, 'user123')).toThrow(
        'dailySeed must be a non-empty string'
      );
      // @ts-expect-error Testing invalid input
      expect(() => service.generateUserSeed(123, 'user123')).toThrow(
        'dailySeed must be a non-empty string'
      );
    });

    it('should throw error for empty userId', () => {
      const service = new CryptoService(TEST_SECRET);
      const dailySeed = service.generateDailySeed('2025-10-15');

      expect(() => service.generateUserSeed(dailySeed, '')).toThrow(
        'userId must be a non-empty string'
      );
    });

    it('should throw error for invalid userId types', () => {
      const service = new CryptoService(TEST_SECRET);
      const dailySeed = service.generateDailySeed('2025-10-15');

      // @ts-expect-error Testing invalid input
      expect(() => service.generateUserSeed(dailySeed, null)).toThrow(
        'userId must be a non-empty string'
      );
      // @ts-expect-error Testing invalid input
      expect(() => service.generateUserSeed(dailySeed, undefined)).toThrow(
        'userId must be a non-empty string'
      );
      // @ts-expect-error Testing invalid input
      expect(() => service.generateUserSeed(dailySeed, 123)).toThrow(
        'userId must be a non-empty string'
      );
    });

    it('should handle special characters in userId', () => {
      const service = new CryptoService(TEST_SECRET);
      const dailySeed = service.generateDailySeed('2025-10-15');

      const userSeed1 = service.generateUserSeed(dailySeed, 'user@example.com');
      const userSeed2 = service.generateUserSeed(dailySeed, 'user!#$%^&*()');
      const userSeed3 = service.generateUserSeed(dailySeed, '用户123');

      expect(userSeed1).toHaveLength(SHA256_HEX_LENGTH);
      expect(userSeed2).toHaveLength(SHA256_HEX_LENGTH);
      expect(userSeed3).toHaveLength(SHA256_HEX_LENGTH);
      expect(userSeed1).not.toBe(userSeed2);
      expect(userSeed2).not.toBe(userSeed3);
    });

    it('should be case-sensitive for userId', () => {
      const service = new CryptoService(TEST_SECRET);
      const dailySeed = service.generateDailySeed('2025-10-15');

      const userSeed1 = service.generateUserSeed(dailySeed, 'User123');
      const userSeed2 = service.generateUserSeed(dailySeed, 'user123');

      expect(userSeed1).not.toBe(userSeed2);
    });

    it('should maintain consistency across multiple service instances', () => {
      const service1 = new CryptoService(TEST_SECRET);
      const service2 = new CryptoService(TEST_SECRET);

      const dailySeed = service1.generateDailySeed('2025-10-15');
      const userId = 'user123';

      const userSeed1 = service1.generateUserSeed(dailySeed, userId);
      const userSeed2 = service2.generateUserSeed(dailySeed, userId);

      expect(userSeed1).toBe(userSeed2);
    });
  });

  describe('seedToInt64()', () => {
    it('should convert hex seed to BigInt correctly', () => {
      const service = new CryptoService(TEST_SECRET);
      const seed = service.generateDailySeed('2025-10-15');

      const int64 = service.seedToInt64(seed);

      expect(typeof int64).toBe('bigint');
      expect(int64).toBeGreaterThanOrEqual(0n);
    });

    it('should use first 16 hex characters (64 bits)', () => {
      const service = new CryptoService(TEST_SECRET);

      // Create a known hex string
      const testSeed = 'abcdef0123456789' + '0'.repeat(48);
      const int64 = service.seedToInt64(testSeed);

      // Verify it matches the first 16 characters
      const expected = BigInt('0xabcdef0123456789');
      expect(int64).toBe(expected);
    });

    it('should be deterministic (same seed → same BigInt)', () => {
      const service = new CryptoService(TEST_SECRET);
      const seed = service.generateDailySeed('2025-10-15');

      const int64_1 = service.seedToInt64(seed);
      const int64_2 = service.seedToInt64(seed);
      const int64_3 = service.seedToInt64(seed);

      expect(int64_1).toBe(int64_2);
      expect(int64_2).toBe(int64_3);
    });

    it('should produce different BigInts for different seeds', () => {
      const service = new CryptoService(TEST_SECRET);

      const seed1 = service.generateDailySeed('2025-10-15');
      const seed2 = service.generateDailySeed('2025-10-16');

      const int64_1 = service.seedToInt64(seed1);
      const int64_2 = service.seedToInt64(seed2);

      expect(int64_1).not.toBe(int64_2);
    });

    it('should throw error for empty seedHex', () => {
      const service = new CryptoService(TEST_SECRET);

      expect(() => service.seedToInt64('')).toThrow('seedHex must be a non-empty string');
    });

    it('should throw error for invalid seedHex types', () => {
      const service = new CryptoService(TEST_SECRET);

      // @ts-expect-error Testing invalid input
      expect(() => service.seedToInt64(null)).toThrow(
        'seedHex must be a non-empty string'
      );
      // @ts-expect-error Testing invalid input
      expect(() => service.seedToInt64(undefined)).toThrow(
        'seedHex must be a non-empty string'
      );
      // @ts-expect-error Testing invalid input
      expect(() => service.seedToInt64(123)).toThrow(
        'seedHex must be a non-empty string'
      );
    });

    it('should throw error for seedHex shorter than 16 characters', () => {
      const service = new CryptoService(TEST_SECRET);

      expect(() => service.seedToInt64('abc')).toThrow(
        'seedHex must be at least 16 characters long'
      );
      expect(() => service.seedToInt64('abcdef012345678')).toThrow(
        'seedHex must be at least 16 characters long'
      );
    });

    it('should accept seedHex exactly 16 characters', () => {
      const service = new CryptoService(TEST_SECRET);

      expect(() => service.seedToInt64('abcdef0123456789')).not.toThrow();
    });

    it('should accept seedHex longer than 16 characters', () => {
      const service = new CryptoService(TEST_SECRET);
      const seed = service.generateDailySeed('2025-10-15');

      expect(seed.length).toBe(SHA256_HEX_LENGTH);
      expect(() => service.seedToInt64(seed)).not.toThrow();
    });

    it('should handle all-zero seed', () => {
      const service = new CryptoService(TEST_SECRET);
      const zeroSeed = '0'.repeat(64);

      const int64 = service.seedToInt64(zeroSeed);

      expect(int64).toBe(0n);
    });

    it('should handle maximum value seed', () => {
      const service = new CryptoService(TEST_SECRET);
      const maxSeed = 'f'.repeat(64);

      const int64 = service.seedToInt64(maxSeed);

      expect(int64).toBe(BigInt('0xffffffffffffffff'));
    });

    it('should correctly parse hex digits', () => {
      const service = new CryptoService(TEST_SECRET);

      const testCases = [
        { seed: '0000000000000001' + '0'.repeat(48), expected: 1n },
        { seed: '000000000000000a' + '0'.repeat(48), expected: 10n },
        { seed: '000000000000000f' + '0'.repeat(48), expected: 15n },
        { seed: '0000000000000010' + '0'.repeat(48), expected: 16n },
        { seed: '00000000000000ff' + '0'.repeat(48), expected: 255n },
      ];

      testCases.forEach(({ seed, expected }) => {
        const int64 = service.seedToInt64(seed);
        expect(int64).toBe(expected);
      });
    });
  });

  describe('Security properties', () => {
    it('should not expose secret in seed output', () => {
      const secret = 'my-secret-key-for-testing';
      const service = new CryptoService(secret);

      const seed = service.generateDailySeed('2025-10-15');

      expect(seed).not.toContain(secret);
      expect(seed).not.toContain('my-secret');
    });

    it('should not expose date in seed output (one-way hash)', () => {
      const service = new CryptoService(TEST_SECRET);
      const date = '2025-10-15';

      const seed = service.generateDailySeed(date);

      expect(seed).not.toContain(date);
      expect(seed).not.toContain('2025');
      expect(seed).not.toContain('10');
      expect(seed).not.toContain('15');
    });

    it('should not expose userId in user seed output', () => {
      const service = new CryptoService(TEST_SECRET);
      const dailySeed = service.generateDailySeed('2025-10-15');
      const userId = 'user123';

      const userSeed = service.generateUserSeed(dailySeed, userId);

      expect(userSeed).not.toContain(userId);
      expect(userSeed).not.toContain('user');
      expect(userSeed).not.toContain('123');
    });

    it('should produce cryptographically strong seeds (no obvious patterns)', () => {
      const service = new CryptoService(TEST_SECRET);

      // Sequential dates should produce non-sequential seeds
      const seed1 = service.generateDailySeed('2025-10-15');
      const seed2 = service.generateDailySeed('2025-10-16');
      const seed3 = service.generateDailySeed('2025-10-17');

      // Seeds should not be sequential or have obvious patterns
      const num1 = parseInt(seed1.substring(0, 8), 16);
      const num2 = parseInt(seed2.substring(0, 8), 16);
      const num3 = parseInt(seed3.substring(0, 8), 16);

      expect(Math.abs(num2 - num1)).toBeGreaterThan(1000);
      expect(Math.abs(num3 - num2)).toBeGreaterThan(1000);
    });
  });

  describe('Real-world usage patterns', () => {
    it('should handle typical date range (year of dates)', () => {
      const service = new CryptoService(TEST_SECRET);
      const seeds = new Set<string>();

      // Generate seeds for 365 days
      for (let day = 1; day <= 365; day++) {
        const date = `2025-${String(Math.floor((day - 1) / 31) + 1).padStart(2, '0')}-${String(((day - 1) % 31) + 1).padStart(2, '0')}`;
        const seed = service.generateDailySeed(date);
        seeds.add(seed);
      }

      // All seeds should be unique (no collisions)
      expect(seeds.size).toBe(365);
    });

    it('should handle multiple users per day', () => {
      const service = new CryptoService(TEST_SECRET);
      const dailySeed = service.generateDailySeed('2025-10-15');
      const userSeeds = new Set<string>();

      // Generate seeds for 1000 users
      for (let i = 0; i < 1000; i++) {
        const userId = `user${i}`;
        const userSeed = service.generateUserSeed(dailySeed, userId);
        userSeeds.add(userSeed);
      }

      // All user seeds should be unique
      expect(userSeeds.size).toBe(1000);
    });

    it('should maintain consistency in full workflow', () => {
      const service = new CryptoService(TEST_SECRET);
      const date = '2025-10-15';
      const userId = 'user123';

      // Full workflow: daily seed → user seed → int64
      const dailySeed = service.generateDailySeed(date);
      const userSeed = service.generateUserSeed(dailySeed, userId);
      const int64 = service.seedToInt64(userSeed);

      // Repeat workflow
      const dailySeed2 = service.generateDailySeed(date);
      const userSeed2 = service.generateUserSeed(dailySeed2, userId);
      const int64_2 = service.seedToInt64(userSeed2);

      // All steps should be deterministic
      expect(dailySeed).toBe(dailySeed2);
      expect(userSeed).toBe(userSeed2);
      expect(int64).toBe(int64_2);
    });

    it('should handle hashed user IDs (from IdentityService)', () => {
      const service = new CryptoService(TEST_SECRET);
      const dailySeed = service.generateDailySeed('2025-10-15');

      // Simulate hashed user IDs (64-char hex strings)
      const hashedUserId1 = 'a'.repeat(64);
      const hashedUserId2 = 'b'.repeat(64);

      const userSeed1 = service.generateUserSeed(dailySeed, hashedUserId1);
      const userSeed2 = service.generateUserSeed(dailySeed, hashedUserId2);

      expect(userSeed1).toHaveLength(SHA256_HEX_LENGTH);
      expect(userSeed2).toHaveLength(SHA256_HEX_LENGTH);
      expect(userSeed1).not.toBe(userSeed2);
    });
  });

  describe('Performance characteristics', () => {
    it('should generate daily seeds quickly', () => {
      const service = new CryptoService(TEST_SECRET);
      const iterations = 1000;

      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        service.generateDailySeed(`2025-10-${String(i % 30 + 1).padStart(2, '0')}`);
      }
      const end = performance.now();

      const avgTime = (end - start) / iterations;
      expect(avgTime).toBeLessThan(1); // Should be sub-millisecond
    });

    it('should generate user seeds quickly', () => {
      const service = new CryptoService(TEST_SECRET);
      const dailySeed = service.generateDailySeed('2025-10-15');
      const iterations = 1000;

      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        service.generateUserSeed(dailySeed, `user${i}`);
      }
      const end = performance.now();

      const avgTime = (end - start) / iterations;
      expect(avgTime).toBeLessThan(1); // Should be sub-millisecond
    });

    it('should convert seeds to int64 quickly', () => {
      const service = new CryptoService(TEST_SECRET);
      const seed = service.generateDailySeed('2025-10-15');
      const iterations = 10000;

      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        service.seedToInt64(seed);
      }
      const end = performance.now();

      const avgTime = (end - start) / iterations;
      expect(avgTime).toBeLessThan(0.1); // Should be very fast
    });
  });
});
