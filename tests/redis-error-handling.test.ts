/**
 * Redis Error Handling Tests
 *
 * Tests that verify Redis failures are handled gracefully and don't crash the service.
 * These tests focus on the requirement that Redis failures should be logged but
 * allow the service to continue operating where possible.
 *
 * Requirements: 10.6, 10.7
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SeedingService } from '../src/server/services/seeding.service';
import { DataService } from '../src/server/services/data.service';
import { TelemetryService } from '../src/server/services/telemetry.service';
import type { RedisClient } from '@devvit/web/server';

describe('Redis Error Handling', () => {
  let originalEnv: Record<string, string | undefined>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let mockRedis: RedisClient;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    process.env.DAILY_SEED_SECRET = 'a'.repeat(64);

    // Setup console spies
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Setup mock Redis
    mockRedis = {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
      hIncrBy: vi.fn(),
      hGetAll: vi.fn(),
      zAdd: vi.fn(),
      zIncrBy: vi.fn(),
      zRange: vi.fn(),
      zRevRangeWithScores: vi.fn(),
      expire: vi.fn(),
    } as unknown as RedisClient;
  });

  afterEach(() => {
    // Restore environment
    Object.keys(process.env).forEach(key => {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    });
    Object.assign(process.env, originalEnv);

    // Restore console methods
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  describe('SeedingService Redis Error Handling', () => {
    it('should log but throw when Redis fails during seed storage', async () => {
      // Mock Redis to fail on set operation
      vi.mocked(mockRedis.set).mockRejectedValue(new Error('Redis connection timeout'));
      vi.mocked(mockRedis.get).mockResolvedValue(null);

      const service = new SeedingService(mockRedis);

      // generateDailySeed should throw because it needs to store the seed
      await expect(service.generateDailySeed('2025-10-15')).rejects.toThrow('Redis connection timeout');

      // Verify error was logged with full context
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('"operation":"generateDailySeed"')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to set seed for date 2025-10-15: Redis connection timeout')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('"inputs":{"date":"2025-10-15"}')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('"timestamp"')
      );
    });

    it('should log but throw when Redis fails during seed retrieval', async () => {
      // Mock Redis to fail on get operation
      vi.mocked(mockRedis.get).mockRejectedValue(new Error('Redis connection lost'));

      const service = new SeedingService(mockRedis);

      // generateUserWords should throw because it can't retrieve existing seed
      await expect(service.generateUserWords('user123', '2025-10-15', 12)).rejects.toThrow('Redis connection lost');

      // Verify error was logged with full context
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('"operation":"generateUserWords"')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to get seed for date 2025-10-15: Redis connection lost')
      );
    });

    it('should handle intermittent Redis failures gracefully', async () => {
      // Mock Redis to fail first, then succeed
      vi.mocked(mockRedis.get)
        .mockRejectedValueOnce(new Error('Temporary connection issue'))
        .mockResolvedValue(null);
      vi.mocked(mockRedis.set).mockResolvedValue(undefined);

      const service = new SeedingService(mockRedis);

      // First call should fail
      await expect(service.generateUserWords('user123', '2025-10-15', 12)).rejects.toThrow('Temporary connection issue');

      // Second call should succeed (Redis is working again)
      const words = await service.generateUserWords('user456', '2025-10-15', 12);
      expect(Array.isArray(words)).toBe(true);
      expect(words.length).toBe(12);
    });
  });

  describe('DataService Redis Error Handling', () => {
    it('should provide detailed error context for Redis failures', async () => {
      // Mock Redis to fail with network error
      vi.mocked(mockRedis.get).mockRejectedValue(new Error('ECONNREFUSED: Connection refused'));

      const dataService = new DataService(mockRedis);

      await expect(dataService.getSeed('2025-10-15')).rejects.toThrow(
        'Failed to get seed for date 2025-10-15: ECONNREFUSED: Connection refused'
      );
    });

    it('should handle Redis timeout errors gracefully', async () => {
      // Mock Redis to fail with timeout
      vi.mocked(mockRedis.set).mockRejectedValue(new Error('Command timed out after 5000ms'));

      const dataService = new DataService(mockRedis);
      const seedData = {
        seedHex: 'a'.repeat(64),
        theme: 'Test Theme',
        poolsVersion: 'v1',
        createdAt: Date.now()
      };

      await expect(dataService.setSeed('2025-10-15', seedData)).rejects.toThrow(
        'Command timed out after 5000ms'
      );
    });

    it('should handle Redis memory errors gracefully', async () => {
      // Mock Redis to fail with out of memory error
      vi.mocked(mockRedis.zIncrBy).mockRejectedValue(new Error('OOM command not allowed when used memory > maxmemory'));

      const dataService = new DataService(mockRedis);

      await expect(dataService.incrementTallies('2025-10-15', ['word1', 'word2'])).rejects.toThrow(
        'OOM command not allowed'
      );
    });
  });

  describe('TelemetryService Redis Error Handling', () => {
    it('should log but not throw when Redis fails during telemetry operations', async () => {
      // Mock Redis to fail on hIncrBy operation
      vi.mocked(mockRedis.hIncrBy).mockRejectedValue(new Error('Redis connection timeout'));

      const telemetryService = new TelemetryService(mockRedis);

      // incrementCounter should not throw (graceful degradation)
      await expect(telemetryService.incrementCounter('2025-10-15', 'test_counter')).resolves.not.toThrow();

      // Verify error was logged (TelemetryService uses console.error with message and error object)
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Telemetry increment failed for counter "test_counter" on date 2025-10-15:',
        expect.objectContaining({
          message: 'Redis connection timeout'
        })
      );
    });

    it('should continue operating when Redis is unavailable for telemetry', async () => {
      // Mock all Redis operations to fail
      vi.mocked(mockRedis.hIncrBy).mockRejectedValue(new Error('Redis unavailable'));
      vi.mocked(mockRedis.hGetAll).mockRejectedValue(new Error('Redis unavailable'));
      vi.mocked(mockRedis.zAdd).mockRejectedValue(new Error('Redis unavailable'));
      vi.mocked(mockRedis.zRange).mockRejectedValue(new Error('Redis unavailable'));

      const telemetryService = new TelemetryService(mockRedis);

      // All operations should complete without throwing
      await expect(telemetryService.incrementCounter('2025-10-15', 'counter1')).resolves.not.toThrow();
      await expect(telemetryService.recordLatency('2025-10-15', 150)).resolves.not.toThrow();

      // getTelemetry should return default data when Redis fails
      const telemetry = await telemetryService.getTelemetry('2025-10-15');
      expect(telemetry).toEqual({
        requests: 0,
        errors: 0,
        p95Samples: []
      });

      // Verify errors were logged for each operation
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Telemetry increment failed for counter "counter1"'),
        expect.any(Error)
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Telemetry latency recording failed'),
        expect.any(Error)
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Telemetry retrieval failed'),
        expect.any(Error)
      );
    });
  });

  describe('Redis Error Recovery', () => {
    it('should recover gracefully when Redis comes back online', async () => {
      // Mock Redis to fail initially, then succeed
      let callCount = 0;
      vi.mocked(mockRedis.get).mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.reject(new Error('Redis temporarily unavailable'));
        }
        return Promise.resolve(null);
      });
      vi.mocked(mockRedis.set).mockResolvedValue(undefined);

      const service = new SeedingService(mockRedis);

      // First two calls should fail
      await expect(service.generateUserWords('user1', '2025-10-15', 12)).rejects.toThrow('Redis temporarily unavailable');
      await expect(service.generateUserWords('user2', '2025-10-15', 12)).rejects.toThrow('Redis temporarily unavailable');

      // Third call should succeed (Redis is back online)
      const words = await service.generateUserWords('user3', '2025-10-15', 12);
      expect(Array.isArray(words)).toBe(true);
      expect(words.length).toBe(12);

      // Verify errors were logged for failed attempts
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
    });

    it('should handle partial Redis failures (some operations succeed, others fail)', async () => {
      // Mock Redis get to succeed but set to fail
      vi.mocked(mockRedis.get).mockResolvedValue(JSON.stringify({
        seedHex: 'a'.repeat(64),
        theme: 'Nocturnal Cities',
        poolsVersion: 'v1',
        createdAt: Date.now()
      }));
      vi.mocked(mockRedis.set).mockRejectedValue(new Error('Redis write timeout'));

      const service = new SeedingService(mockRedis);

      // Should succeed because it can read existing seed (no need to write)
      const words = await service.generateUserWords('user123', '2025-10-15', 12);
      expect(Array.isArray(words)).toBe(true);
      expect(words.length).toBe(12);

      // No errors should be logged because set operation wasn't needed
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe('Redis Error Message Quality', () => {
    it('should provide detailed Redis error context', async () => {
      const redisErrors = [
        'ECONNREFUSED: Connection refused',
        'ETIMEDOUT: Connection timed out',
        'ENOTFOUND: getaddrinfo ENOTFOUND redis-server',
        'OOM command not allowed when used memory > maxmemory',
        'READONLY You can\'t write against a read only replica',
        'NOAUTH Authentication required'
      ];

      const dataService = new DataService(mockRedis);

      for (const errorMessage of redisErrors) {
        vi.mocked(mockRedis.get).mockRejectedValue(new Error(errorMessage));

        try {
          await dataService.getSeed('2025-10-15');
        } catch (error) {
          const fullError = error instanceof Error ? error.message : String(error);
          
          // Verify error includes original Redis error and context
          expect(fullError).toContain('Failed to get seed for date 2025-10-15');
          expect(fullError).toContain(errorMessage);
        }
      }
    });

    it('should distinguish between different types of Redis failures', async () => {
      const errorTypes = [
        { error: 'ECONNREFUSED', type: 'connection' },
        { error: 'ETIMEDOUT', type: 'timeout' },
        { error: 'OOM command not allowed', type: 'memory' },
        { error: 'NOAUTH Authentication required', type: 'auth' }
      ];

      const dataService = new DataService(mockRedis);

      for (const { error, type } of errorTypes) {
        vi.mocked(mockRedis.get).mockRejectedValue(new Error(error));

        try {
          await dataService.getSeed('2025-10-15');
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          
          // Each error type should be identifiable from the message
          expect(errorMessage).toContain(error);
          
          // Verify we can categorize the error type
          if (type === 'connection') {
            expect(errorMessage).toMatch(/ECONNREFUSED|Connection refused/);
          } else if (type === 'timeout') {
            expect(errorMessage).toMatch(/ETIMEDOUT|timed out/);
          } else if (type === 'memory') {
            expect(errorMessage).toMatch(/OOM|memory/);
          } else if (type === 'auth') {
            expect(errorMessage).toMatch(/NOAUTH|Authentication/);
          }
        }
      }
    });
  });
});