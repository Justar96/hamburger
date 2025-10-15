import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { IdentityService } from '../src/server/services/identity.service';

/**
 * Unit tests for Identity Service
 *
 * These tests verify:
 * - Deterministic hashing (same input → same output)
 * - Different inputs produce different hashes
 * - Constructor validation of USER_ID_PEPPER
 * - Hash format and length (SHA256 = 64 hex characters)
 * - verifyHash() functionality
 */

describe('IdentityService', () => {
  const ORIGINAL_ENV = process.env;
  const TEST_PEPPER = 'test-pepper-for-unit-tests-should-be-long-and-random';
  const SHA256_HEX_LENGTH = 64;

  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    // Restore original environment after each test
    process.env = ORIGINAL_ENV;
  });

  describe('constructor', () => {
    it('should throw error when USER_ID_PEPPER is not set', () => {
      delete process.env.USER_ID_PEPPER;

      expect(() => new IdentityService()).toThrow('USER_ID_PEPPER');
      expect(() => new IdentityService()).toThrow('environment variable is required');
    });

    it('should throw error when USER_ID_PEPPER is empty string', () => {
      process.env.USER_ID_PEPPER = '';

      expect(() => new IdentityService()).toThrow('USER_ID_PEPPER');
    });

    it('should not throw when USER_ID_PEPPER is set', () => {
      process.env.USER_ID_PEPPER = TEST_PEPPER;

      expect(() => new IdentityService()).not.toThrow();
    });

    it('should provide descriptive error message about configuration', () => {
      delete process.env.USER_ID_PEPPER;

      expect(() => new IdentityService()).toThrow(
        /Please set this to a long, random string/
      );
    });

    it('should throw error when USER_ID_PEPPER is too short', () => {
      process.env.USER_ID_PEPPER = 'short';

      expect(() => new IdentityService()).toThrow(
        'USER_ID_PEPPER must be at least 32 characters long for adequate security.'
      );
    });
  });

  describe('hashUserId()', () => {
    it('should hash user ID deterministically (same input → same output)', () => {
      process.env.USER_ID_PEPPER = TEST_PEPPER;
      const service = new IdentityService();

      const hash1 = service.hashUserId('t2_user123');
      const hash2 = service.hashUserId('t2_user123');
      const hash3 = service.hashUserId('t2_user123');

      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });

    it('should produce different hashes for different user IDs', () => {
      process.env.USER_ID_PEPPER = TEST_PEPPER;
      const service = new IdentityService();

      const hash1 = service.hashUserId('t2_user123');
      const hash2 = service.hashUserId('t2_user456');
      const hash3 = service.hashUserId('t2_user789');

      expect(hash1).not.toBe(hash2);
      expect(hash2).not.toBe(hash3);
      expect(hash1).not.toBe(hash3);
    });

    it('should return 64-character hexadecimal string (SHA256 length)', () => {
      process.env.USER_ID_PEPPER = TEST_PEPPER;
      const service = new IdentityService();

      const hash = service.hashUserId('t2_user123');

      expect(hash).toHaveLength(SHA256_HEX_LENGTH);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should produce different hashes with different peppers', () => {
      process.env.USER_ID_PEPPER = 'pepper1-long-enough-for-security-requirements-32chars';
      const service1 = new IdentityService();
      const hash1 = service1.hashUserId('t2_user123');

      process.env.USER_ID_PEPPER = 'pepper2-long-enough-for-security-requirements-32chars';
      const service2 = new IdentityService();
      const hash2 = service2.hashUserId('t2_user123');

      expect(hash1).not.toBe(hash2);
    });

    it('should throw error for empty user ID string', () => {
      process.env.USER_ID_PEPPER = TEST_PEPPER;
      const service = new IdentityService();

      expect(() => service.hashUserId('')).toThrow('userId must be a non-empty string');
    });

    it('should handle special characters in user ID', () => {
      process.env.USER_ID_PEPPER = TEST_PEPPER;
      const service = new IdentityService();

      const hash1 = service.hashUserId('user@example.com');
      const hash2 = service.hashUserId('user!#$%^&*()');
      const hash3 = service.hashUserId('用户123');

      expect(hash1).toHaveLength(SHA256_HEX_LENGTH);
      expect(hash2).toHaveLength(SHA256_HEX_LENGTH);
      expect(hash3).toHaveLength(SHA256_HEX_LENGTH);
      expect(hash1).not.toBe(hash2);
      expect(hash2).not.toBe(hash3);
    });

    it('should be case-sensitive for user IDs', () => {
      process.env.USER_ID_PEPPER = TEST_PEPPER;
      const service = new IdentityService();

      const hash1 = service.hashUserId('t2_User123');
      const hash2 = service.hashUserId('t2_user123');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verifyHash()', () => {
    it('should return true when hash matches user ID', () => {
      process.env.USER_ID_PEPPER = TEST_PEPPER;
      const service = new IdentityService();

      const userId = 't2_user123';
      const hash = service.hashUserId(userId);
      const isValid = service.verifyHash(userId, hash);

      expect(isValid).toBe(true);
    });

    it('should return false when hash does not match user ID', () => {
      process.env.USER_ID_PEPPER = TEST_PEPPER;
      const service = new IdentityService();

      const hash = service.hashUserId('t2_user123');
      const isValid = service.verifyHash('t2_different', hash);

      expect(isValid).toBe(false);
    });

    it('should return false for invalid hash format', () => {
      process.env.USER_ID_PEPPER = TEST_PEPPER;
      const service = new IdentityService();

      const isValid = service.verifyHash('t2_user123', 'invalid-hash');

      expect(isValid).toBe(false);
    });

    it('should return false for empty hash', () => {
      process.env.USER_ID_PEPPER = TEST_PEPPER;
      const service = new IdentityService();

      const isValid = service.verifyHash('t2_user123', '');

      expect(isValid).toBe(false);
    });

    it('should work correctly with multiple verifications', () => {
      process.env.USER_ID_PEPPER = TEST_PEPPER;
      const service = new IdentityService();

      const userId = 't2_user123';
      const hash = service.hashUserId(userId);

      expect(service.verifyHash(userId, hash)).toBe(true);
      expect(service.verifyHash(userId, hash)).toBe(true);
      expect(service.verifyHash('t2_other', hash)).toBe(false);
      expect(service.verifyHash(userId, hash)).toBe(true);
    });
  });

  describe('Security properties', () => {
    it('should not expose raw user ID in hash output', () => {
      process.env.USER_ID_PEPPER = TEST_PEPPER;
      const service = new IdentityService();

      const userId = 't2_user123';
      const hash = service.hashUserId(userId);

      expect(hash).not.toContain(userId);
      expect(hash).not.toContain('user123');
      expect(hash).not.toContain('t2_');
    });

    it('should not expose pepper in hash output', () => {
      process.env.USER_ID_PEPPER = TEST_PEPPER;
      const service = new IdentityService();

      const hash = service.hashUserId('t2_user123');

      expect(hash).not.toContain(TEST_PEPPER);
      expect(hash).not.toContain('test-pepper');
    });

    it('should produce cryptographically strong hashes (no obvious patterns)', () => {
      process.env.USER_ID_PEPPER = TEST_PEPPER;
      const service = new IdentityService();

      // Sequential user IDs should produce non-sequential hashes
      const hash1 = service.hashUserId('user1');
      const hash2 = service.hashUserId('user2');
      const hash3 = service.hashUserId('user3');

      // Hashes should not be sequential or have obvious patterns
      const num1 = parseInt(hash1.substring(0, 8), 16);
      const num2 = parseInt(hash2.substring(0, 8), 16);
      const num3 = parseInt(hash3.substring(0, 8), 16);

      expect(Math.abs(num2 - num1)).toBeGreaterThan(1000);
      expect(Math.abs(num3 - num2)).toBeGreaterThan(1000);
    });
  });

  describe('Real-world usage patterns', () => {
    it('should handle Reddit-style user IDs', () => {
      process.env.USER_ID_PEPPER = TEST_PEPPER;
      const service = new IdentityService();

      const redditIds = [
        't2_abc123',
        't2_xyz789',
        't2_1a2b3c4d',
        't2_longusername123',
      ];

      const hashes = redditIds.map((id) => service.hashUserId(id));

      // All hashes should be valid
      hashes.forEach((hash) => {
        expect(hash).toHaveLength(SHA256_HEX_LENGTH);
        expect(hash).toMatch(/^[0-9a-f]{64}$/);
      });

      // All hashes should be unique
      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(redditIds.length);
    });

    it('should maintain consistency across multiple service instances', () => {
      process.env.USER_ID_PEPPER = TEST_PEPPER;

      const service1 = new IdentityService();
      const service2 = new IdentityService();
      const service3 = new IdentityService();

      const userId = 't2_user123';
      const hash1 = service1.hashUserId(userId);
      const hash2 = service2.hashUserId(userId);
      const hash3 = service3.hashUserId(userId);

      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });
  });
});
