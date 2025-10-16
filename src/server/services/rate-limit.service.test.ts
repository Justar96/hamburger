/**
 * Unit Tests for Rate Limiting Service
 *
 * Tests rate limit enforcement, TTL behavior, Redis failure scenarios,
 * and concurrent rate limit checks using mocked Redis operations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RateLimitService, type RateLimitResult } from './rate-limit.service';

// Mock Redis client interface
interface MockRedisClient {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
}

describe('RateLimitService', () => {
  let mockRedis: MockRedisClient;
  let rateLimitService: RateLimitService;
  let mockNow: number;

  beforeEach(() => {
    // Reset mocks
    mockRedis = {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
    };

    rateLimitService = new RateLimitService(mockRedis as any);

    // Mock Date.now() for predictable testing
    mockNow = 1728950400000; // Fixed timestamp
    vi.spyOn(Date, 'now').mockReturnValue(mockNow);
  });

  describe('checkRateLimit', () => {
    const testUserHash = 'test-user-hash-123';

    it('should allow request when no previous request exists', async () => {
      // Arrange
      mockRedis.get.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue('OK');

      // Act
      const result = await rateLimitService.checkRateLimit(testUserHash);

      // Assert
      expect(result).toEqual({ allowed: true });
      expect(mockRedis.get).toHaveBeenCalledWith(
        'rate_limit:test-user-hash-123'
      );
      expect(mockRedis.set).toHaveBeenCalledWith(
        'rate_limit:test-user-hash-123',
        mockNow.toString(),
        { expiration: new Date(mockNow + 5000) } // 5 second TTL
      );
    });

    it('should allow request when enough time has passed (>3 seconds)', async () => {
      // Arrange
      const lastRequestTime = mockNow - 4000; // 4 seconds ago
      mockRedis.get.mockResolvedValue(lastRequestTime.toString());
      mockRedis.set.mockResolvedValue('OK');

      // Act
      const result = await rateLimitService.checkRateLimit(testUserHash);

      // Assert
      expect(result).toEqual({ allowed: true });
      expect(mockRedis.set).toHaveBeenCalledWith(
        'rate_limit:test-user-hash-123',
        mockNow.toString(),
        { expiration: new Date(mockNow + 5000) }
      );
    });

    it('should allow request exactly at 3 second boundary', async () => {
      // Arrange
      const lastRequestTime = mockNow - 3000; // Exactly 3 seconds ago
      mockRedis.get.mockResolvedValue(lastRequestTime.toString());
      mockRedis.set.mockResolvedValue('OK');

      // Act
      const result = await rateLimitService.checkRateLimit(testUserHash);

      // Assert
      expect(result).toEqual({ allowed: true });
      expect(mockRedis.set).toHaveBeenCalled();
    });

    it('should deny request when within rate limit window (<3 seconds)', async () => {
      // Arrange
      const lastRequestTime = mockNow - 1500; // 1.5 seconds ago
      mockRedis.get.mockResolvedValue(lastRequestTime.toString());

      // Act
      const result = await rateLimitService.checkRateLimit(testUserHash);

      // Assert
      expect(result).toEqual({
        allowed: false,
        retryAfterSeconds: 2, // Math.ceil(3 - 1.5) = 2
      });
      expect(mockRedis.set).not.toHaveBeenCalled(); // Should not update timestamp
    });

    it('should calculate correct retry-after time for various intervals', async () => {
      const testCases = [
        { timeSinceLastRequest: 0.1, expectedRetryAfter: 3 }, // Just made request
        { timeSinceLastRequest: 1.0, expectedRetryAfter: 2 }, // 1 second ago
        { timeSinceLastRequest: 2.1, expectedRetryAfter: 1 }, // 2.1 seconds ago
        { timeSinceLastRequest: 2.9, expectedRetryAfter: 1 }, // 2.9 seconds ago
      ];

      for (const testCase of testCases) {
        // Arrange
        const lastRequestTime = mockNow - testCase.timeSinceLastRequest * 1000;
        mockRedis.get.mockResolvedValue(lastRequestTime.toString());

        // Act
        const result = await rateLimitService.checkRateLimit(testUserHash);

        // Assert
        expect(result).toEqual({
          allowed: false,
          retryAfterSeconds: testCase.expectedRetryAfter,
        });
      }
    });

    it('should handle different user hashes independently', async () => {
      // Arrange
      const userHash1 = 'user-hash-1';
      const userHash2 = 'user-hash-2';

      mockRedis.get.mockImplementation((key: string) => {
        if (key === 'rate_limit:user-hash-1') {
          return Promise.resolve((mockNow - 1000).toString()); // Rate limited
        }
        return Promise.resolve(null); // No previous request
      });
      mockRedis.set.mockResolvedValue('OK');

      // Act
      const result1 = await rateLimitService.checkRateLimit(userHash1);
      const result2 = await rateLimitService.checkRateLimit(userHash2);

      // Assert
      expect(result1).toEqual({ allowed: false, retryAfterSeconds: 2 });
      expect(result2).toEqual({ allowed: true });
    });
  });

  describe('Redis failure scenarios and graceful degradation', () => {
    const testUserHash = 'test-user-hash-123';

    it('should allow request when Redis get operation fails', async () => {
      // Arrange
      mockRedis.get.mockRejectedValue(new Error('Redis connection failed'));
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      // Act
      const result = await rateLimitService.checkRateLimit(testUserHash);

      // Assert
      expect(result).toEqual({ allowed: true });
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'Rate limit check failed for user test-user-hash-123'
        ),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('should allow request when Redis set operation fails', async () => {
      // Arrange
      mockRedis.get.mockResolvedValue(null);
      mockRedis.set.mockRejectedValue(new Error('Redis set failed'));
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      // Act
      const result = await rateLimitService.checkRateLimit(testUserHash);

      // Assert
      expect(result).toEqual({ allowed: true });
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should handle malformed timestamp data gracefully', async () => {
      // Arrange
      mockRedis.get.mockResolvedValue('invalid-timestamp');
      mockRedis.set.mockResolvedValue('OK');

      // Act
      const result = await rateLimitService.checkRateLimit(testUserHash);

      // Assert
      // parseInt('invalid-timestamp') returns NaN, which should be handled gracefully
      expect(result).toEqual({ allowed: true });
    });
  });

  describe('TTL behavior', () => {
    const testUserHash = 'test-user-hash-123';

    it('should set correct TTL expiration time', async () => {
      // Arrange
      mockRedis.get.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue('OK');

      // Act
      await rateLimitService.checkRateLimit(testUserHash);

      // Assert
      expect(mockRedis.set).toHaveBeenCalledWith(
        'rate_limit:test-user-hash-123',
        mockNow.toString(),
        { expiration: new Date(mockNow + 5000) } // 5 seconds from now
      );
    });

    it('should use consistent key format', async () => {
      // Arrange
      const userHashes = [
        'user1',
        'user-hash-with-dashes',
        'user_hash_with_underscores',
      ];
      mockRedis.get.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue('OK');

      // Act & Assert
      for (const userHash of userHashes) {
        await rateLimitService.checkRateLimit(userHash);
        expect(mockRedis.get).toHaveBeenCalledWith(`rate_limit:${userHash}`);
        expect(mockRedis.set).toHaveBeenCalledWith(
          `rate_limit:${userHash}`,
          expect.any(String),
          expect.any(Object)
        );
      }
    });
  });

  describe('clearRateLimit', () => {
    const testUserHash = 'test-user-hash-123';

    it('should delete the rate limit key', async () => {
      // Arrange
      mockRedis.del.mockResolvedValue(1);

      // Act
      await rateLimitService.clearRateLimit(testUserHash);

      // Assert
      expect(mockRedis.del).toHaveBeenCalledWith(
        'rate_limit:test-user-hash-123'
      );
    });

    it('should handle Redis delete failures gracefully', async () => {
      // Arrange
      mockRedis.del.mockRejectedValue(new Error('Redis delete failed'));
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      // Act & Assert
      await expect(
        rateLimitService.clearRateLimit(testUserHash)
      ).resolves.toBeUndefined();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'Failed to clear rate limit for user test-user-hash-123'
        ),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('getRateLimitStatus', () => {
    const testUserHash = 'test-user-hash-123';

    it('should return allowed when no previous request exists', async () => {
      // Arrange
      mockRedis.get.mockResolvedValue(null);

      // Act
      const result = await rateLimitService.getRateLimitStatus(testUserHash);

      // Assert
      expect(result).toEqual({ allowed: true });
      expect(mockRedis.set).not.toHaveBeenCalled(); // Should not update state
    });

    it('should return allowed when enough time has passed', async () => {
      // Arrange
      const lastRequestTime = mockNow - 4000; // 4 seconds ago
      mockRedis.get.mockResolvedValue(lastRequestTime.toString());

      // Act
      const result = await rateLimitService.getRateLimitStatus(testUserHash);

      // Assert
      expect(result).toEqual({ allowed: true });
      expect(mockRedis.set).not.toHaveBeenCalled();
    });

    it('should return rate limited status without updating state', async () => {
      // Arrange
      const lastRequestTime = mockNow - 1500; // 1.5 seconds ago
      mockRedis.get.mockResolvedValue(lastRequestTime.toString());

      // Act
      const result = await rateLimitService.getRateLimitStatus(testUserHash);

      // Assert
      expect(result).toEqual({
        allowed: false,
        retryAfterSeconds: 2,
      });
      expect(mockRedis.set).not.toHaveBeenCalled(); // Should not update timestamp
    });

    it('should handle Redis failures gracefully', async () => {
      // Arrange
      mockRedis.get.mockRejectedValue(new Error('Redis failed'));
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      // Act
      const result = await rateLimitService.getRateLimitStatus(testUserHash);

      // Assert
      expect(result).toEqual({ allowed: true });
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('concurrent rate limit checks', () => {
    const testUserHash = 'test-user-hash-123';

    it('should handle concurrent checks for the same user', async () => {
      // Arrange
      mockRedis.get.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue('OK');

      // Act - Make multiple concurrent requests
      const promises = Array(5)
        .fill(null)
        .map(() => rateLimitService.checkRateLimit(testUserHash));
      const results = await Promise.all(promises);

      // Assert - All should be allowed since we're mocking no previous request
      results.forEach(result => {
        expect(result.allowed).toBe(true);
      });
      expect(mockRedis.get).toHaveBeenCalledTimes(5);
      expect(mockRedis.set).toHaveBeenCalledTimes(5);
    });

    it('should handle concurrent checks for different users', async () => {
      // Arrange
      const userHashes = ['user1', 'user2', 'user3', 'user4', 'user5'];
      mockRedis.get.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue('OK');

      // Act
      const promises = userHashes.map(userHash =>
        rateLimitService.checkRateLimit(userHash)
      );
      const results = await Promise.all(promises);

      // Assert
      results.forEach(result => {
        expect(result.allowed).toBe(true);
      });
      expect(mockRedis.get).toHaveBeenCalledTimes(5);
      expect(mockRedis.set).toHaveBeenCalledTimes(5);

      // Verify correct keys were used
      userHashes.forEach(userHash => {
        expect(mockRedis.get).toHaveBeenCalledWith(`rate_limit:${userHash}`);
      });
    });

    it('should handle mixed concurrent scenarios (some rate limited, some allowed)', async () => {
      // Arrange
      const userHash1 = 'rate-limited-user';
      const userHash2 = 'allowed-user';

      mockRedis.get.mockImplementation((key: string) => {
        if (key === 'rate_limit:rate-limited-user') {
          return Promise.resolve((mockNow - 1000).toString()); // Rate limited
        }
        return Promise.resolve(null); // Allowed
      });
      mockRedis.set.mockResolvedValue('OK');

      // Act
      const [result1, result2] = await Promise.all([
        rateLimitService.checkRateLimit(userHash1),
        rateLimitService.checkRateLimit(userHash2),
      ]);

      // Assert
      expect(result1).toEqual({ allowed: false, retryAfterSeconds: 2 });
      expect(result2).toEqual({ allowed: true });
    });
  });

  describe('edge cases and boundary conditions', () => {
    const testUserHash = 'test-user-hash-123';

    it('should handle timestamp exactly at current time', async () => {
      // Arrange
      mockRedis.get.mockResolvedValue(mockNow.toString()); // Same timestamp

      // Act
      const result = await rateLimitService.checkRateLimit(testUserHash);

      // Assert
      expect(result).toEqual({ allowed: false, retryAfterSeconds: 3 });
    });

    it('should handle very old timestamps', async () => {
      // Arrange
      const veryOldTime = mockNow - 86400000; // 24 hours ago
      mockRedis.get.mockResolvedValue(veryOldTime.toString());
      mockRedis.set.mockResolvedValue('OK');

      // Act
      const result = await rateLimitService.checkRateLimit(testUserHash);

      // Assert
      expect(result).toEqual({ allowed: true });
    });

    it('should handle future timestamps gracefully', async () => {
      // Arrange
      const futureTime = mockNow + 10000; // 10 seconds in future
      mockRedis.get.mockResolvedValue(futureTime.toString());
      mockRedis.set.mockResolvedValue('OK');

      // Act
      const result = await rateLimitService.checkRateLimit(testUserHash);

      // Assert
      // Negative time difference should be handled gracefully
      expect(result.allowed).toBe(true);
    });

    it('should handle empty string timestamp', async () => {
      // Arrange
      mockRedis.get.mockResolvedValue('');
      mockRedis.set.mockResolvedValue('OK');

      // Act
      const result = await rateLimitService.checkRateLimit(testUserHash);

      // Assert
      expect(result).toEqual({ allowed: true });
    });
  });
});
