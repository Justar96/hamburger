import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TelemetryService } from '../src/server/services/telemetry.service';
import type { RedisClient } from '@devvit/web/server';

/**
 * Unit tests for Telemetry Service
 *
 * These tests verify:
 * - incrementCounter() increments correctly
 * - recordLatency() stores samples in sorted set
 * - Automatic trimming keeps only most recent 1000 samples
 * - getTelemetry() retrieves data correctly
 * - calculateP95() computes correct percentile
 * - Telemetry failures don't throw errors
 * - TTL is set on telemetry keys
 */

const TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const MAX_P95_SAMPLES = 1000;
const TEST_DATE = '2025-10-14';

describe('TelemetryService', () => {
  let mockRedis: RedisClient;
  let telemetryService: TelemetryService;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Create mock Redis client with all required methods
    mockRedis = {
      hIncrBy: vi.fn(),
      zAdd: vi.fn(),
      zCard: vi.fn(),
      zRemRangeByRank: vi.fn(),
      zRange: vi.fn(),
      hGetAll: vi.fn(),
      expireTime: vi.fn(),
      expire: vi.fn(),
    } as unknown as RedisClient;

    telemetryService = new TelemetryService(mockRedis);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.restoreAllMocks();
  });

  describe('incrementCounter()', () => {
    it('should increment counter correctly', async () => {
      vi.mocked(mockRedis.hIncrBy).mockResolvedValue(1);
      vi.mocked(mockRedis.expireTime).mockResolvedValue(-1);
      vi.mocked(mockRedis.expire).mockResolvedValue(undefined);

      await telemetryService.incrementCounter(TEST_DATE, 'requests');

      expect(mockRedis.hIncrBy).toHaveBeenCalledWith(
        `telemetry:${TEST_DATE}`,
        'requests',
        1
      );
    });

    it('should increment different counter types', async () => {
      vi.mocked(mockRedis.hIncrBy).mockResolvedValue(1);
      vi.mocked(mockRedis.expireTime).mockResolvedValue(-1);
      vi.mocked(mockRedis.expire).mockResolvedValue(undefined);

      await telemetryService.incrementCounter(TEST_DATE, 'requests');
      await telemetryService.incrementCounter(TEST_DATE, 'errors');
      await telemetryService.incrementCounter(TEST_DATE, 'health_checks');

      expect(mockRedis.hIncrBy).toHaveBeenCalledWith(
        `telemetry:${TEST_DATE}`,
        'requests',
        1
      );
      expect(mockRedis.hIncrBy).toHaveBeenCalledWith(
        `telemetry:${TEST_DATE}`,
        'errors',
        1
      );
      expect(mockRedis.hIncrBy).toHaveBeenCalledWith(
        `telemetry:${TEST_DATE}`,
        'health_checks',
        1
      );
    });

    it('should set TTL on first write to telemetry hash', async () => {
      vi.mocked(mockRedis.hIncrBy).mockResolvedValue(1);
      vi.mocked(mockRedis.expireTime).mockResolvedValue(-1); // No TTL set
      vi.mocked(mockRedis.expire).mockResolvedValue(undefined);

      await telemetryService.incrementCounter(TEST_DATE, 'requests');

      expect(mockRedis.expireTime).toHaveBeenCalledWith(`telemetry:${TEST_DATE}`);
      expect(mockRedis.expire).toHaveBeenCalledWith(`telemetry:${TEST_DATE}`, TTL_SECONDS);
    });

    it('should not set TTL if already set on telemetry hash', async () => {
      vi.mocked(mockRedis.hIncrBy).mockResolvedValue(1);
      vi.mocked(mockRedis.expireTime).mockResolvedValue(Date.now() + 100000); // TTL already set
      vi.mocked(mockRedis.expire).mockResolvedValue(undefined);

      await telemetryService.incrementCounter(TEST_DATE, 'requests');

      expect(mockRedis.expireTime).toHaveBeenCalledWith(`telemetry:${TEST_DATE}`);
      expect(mockRedis.expire).not.toHaveBeenCalled();
    });

    it('should not throw when increment fails', async () => {
      vi.mocked(mockRedis.hIncrBy).mockRejectedValue(new Error('Redis connection failed'));

      await expect(
        telemetryService.incrementCounter(TEST_DATE, 'requests')
      ).resolves.not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Telemetry increment failed'),
        expect.any(Error)
      );
    });

    it('should not throw when TTL setting fails', async () => {
      vi.mocked(mockRedis.hIncrBy).mockResolvedValue(1);
      vi.mocked(mockRedis.expireTime).mockRejectedValue(new Error('TTL check failed'));

      await expect(
        telemetryService.incrementCounter(TEST_DATE, 'requests')
      ).resolves.not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to set TTL'),
        expect.any(Error)
      );
    });

    it('should handle multiple increments to same counter', async () => {
      vi.mocked(mockRedis.hIncrBy)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(3);
      vi.mocked(mockRedis.expireTime).mockResolvedValue(-1);
      vi.mocked(mockRedis.expire).mockResolvedValue(undefined);

      await telemetryService.incrementCounter(TEST_DATE, 'requests');
      await telemetryService.incrementCounter(TEST_DATE, 'requests');
      await telemetryService.incrementCounter(TEST_DATE, 'requests');

      expect(mockRedis.hIncrBy).toHaveBeenCalledTimes(3);
      expect(mockRedis.hIncrBy).toHaveBeenCalledWith(
        `telemetry:${TEST_DATE}`,
        'requests',
        1
      );
    });
  });

  describe('recordLatency()', () => {
    it('should store latency sample in sorted set', async () => {
      const latencyMs = 45.3;
      const mockTimestamp = 1728950400000;

      vi.spyOn(Date, 'now').mockReturnValue(mockTimestamp);
      vi.mocked(mockRedis.zAdd).mockResolvedValue(1);
      vi.mocked(mockRedis.zCard).mockResolvedValue(1);
      vi.mocked(mockRedis.expireTime).mockResolvedValue(-1);
      vi.mocked(mockRedis.expire).mockResolvedValue(undefined);

      await telemetryService.recordLatency(TEST_DATE, latencyMs);

      expect(mockRedis.zAdd).toHaveBeenCalledWith(`telemetry:${TEST_DATE}:p95`, {
        member: `${mockTimestamp}:${latencyMs}`,
        score: mockTimestamp,
      });
    });

    it('should use timestamp as score for FIFO trimming', async () => {
      const latencyMs = 100;
      const timestamp1 = 1728950400000;
      const timestamp2 = 1728950401000;

      vi.spyOn(Date, 'now')
        .mockReturnValueOnce(timestamp1)
        .mockReturnValueOnce(timestamp2);
      vi.mocked(mockRedis.zAdd).mockResolvedValue(1);
      vi.mocked(mockRedis.zCard).mockResolvedValue(1);
      vi.mocked(mockRedis.expireTime).mockResolvedValue(-1);
      vi.mocked(mockRedis.expire).mockResolvedValue(undefined);

      await telemetryService.recordLatency(TEST_DATE, latencyMs);
      await telemetryService.recordLatency(TEST_DATE, latencyMs);

      expect(mockRedis.zAdd).toHaveBeenNthCalledWith(1, `telemetry:${TEST_DATE}:p95`, {
        member: `${timestamp1}:${latencyMs}`,
        score: timestamp1,
      });
      expect(mockRedis.zAdd).toHaveBeenNthCalledWith(2, `telemetry:${TEST_DATE}:p95`, {
        member: `${timestamp2}:${latencyMs}`,
        score: timestamp2,
      });
    });

    it('should trim to most recent 1000 samples when limit exceeded', async () => {
      const latencyMs = 50;
      const mockTimestamp = 1728950400000;

      vi.spyOn(Date, 'now').mockReturnValue(mockTimestamp);
      vi.mocked(mockRedis.zAdd).mockResolvedValue(1);
      vi.mocked(mockRedis.zCard).mockResolvedValue(MAX_P95_SAMPLES + 1); // Over limit
      vi.mocked(mockRedis.zRemRangeByRank).mockResolvedValue(1);
      vi.mocked(mockRedis.expireTime).mockResolvedValue(-1);
      vi.mocked(mockRedis.expire).mockResolvedValue(undefined);

      await telemetryService.recordLatency(TEST_DATE, latencyMs);

      expect(mockRedis.zCard).toHaveBeenCalledWith(`telemetry:${TEST_DATE}:p95`);
      expect(mockRedis.zRemRangeByRank).toHaveBeenCalledWith(
        `telemetry:${TEST_DATE}:p95`,
        0,
        0 // Remove 1 oldest sample (1001 - 1000 - 1)
      );
    });

    it('should trim multiple samples when far over limit', async () => {
      const latencyMs = 50;
      const mockTimestamp = 1728950400000;

      vi.spyOn(Date, 'now').mockReturnValue(mockTimestamp);
      vi.mocked(mockRedis.zAdd).mockResolvedValue(1);
      vi.mocked(mockRedis.zCard).mockResolvedValue(MAX_P95_SAMPLES + 50); // 50 over limit
      vi.mocked(mockRedis.zRemRangeByRank).mockResolvedValue(50);
      vi.mocked(mockRedis.expireTime).mockResolvedValue(-1);
      vi.mocked(mockRedis.expire).mockResolvedValue(undefined);

      await telemetryService.recordLatency(TEST_DATE, latencyMs);

      expect(mockRedis.zRemRangeByRank).toHaveBeenCalledWith(
        `telemetry:${TEST_DATE}:p95`,
        0,
        49 // Remove 50 oldest samples (1050 - 1000 - 1)
      );
    });

    it('should not trim when under limit', async () => {
      const latencyMs = 50;
      const mockTimestamp = 1728950400000;

      vi.spyOn(Date, 'now').mockReturnValue(mockTimestamp);
      vi.mocked(mockRedis.zAdd).mockResolvedValue(1);
      vi.mocked(mockRedis.zCard).mockResolvedValue(500); // Under limit
      vi.mocked(mockRedis.expireTime).mockResolvedValue(-1);
      vi.mocked(mockRedis.expire).mockResolvedValue(undefined);

      await telemetryService.recordLatency(TEST_DATE, latencyMs);

      expect(mockRedis.zRemRangeByRank).not.toHaveBeenCalled();
    });

    it('should not trim when exactly at limit', async () => {
      const latencyMs = 50;
      const mockTimestamp = 1728950400000;

      vi.spyOn(Date, 'now').mockReturnValue(mockTimestamp);
      vi.mocked(mockRedis.zAdd).mockResolvedValue(1);
      vi.mocked(mockRedis.zCard).mockResolvedValue(MAX_P95_SAMPLES); // Exactly at limit
      vi.mocked(mockRedis.expireTime).mockResolvedValue(-1);
      vi.mocked(mockRedis.expire).mockResolvedValue(undefined);

      await telemetryService.recordLatency(TEST_DATE, latencyMs);

      expect(mockRedis.zRemRangeByRank).not.toHaveBeenCalled();
    });

    it('should set TTL on first write to p95 sorted set', async () => {
      const latencyMs = 50;
      const mockTimestamp = 1728950400000;

      vi.spyOn(Date, 'now').mockReturnValue(mockTimestamp);
      vi.mocked(mockRedis.zAdd).mockResolvedValue(1);
      vi.mocked(mockRedis.zCard).mockResolvedValue(1);
      vi.mocked(mockRedis.expireTime).mockResolvedValue(-1); // No TTL set
      vi.mocked(mockRedis.expire).mockResolvedValue(undefined);

      await telemetryService.recordLatency(TEST_DATE, latencyMs);

      expect(mockRedis.expireTime).toHaveBeenCalledWith(`telemetry:${TEST_DATE}:p95`);
      expect(mockRedis.expire).toHaveBeenCalledWith(`telemetry:${TEST_DATE}:p95`, TTL_SECONDS);
    });

    it('should not set TTL if already set on p95 sorted set', async () => {
      const latencyMs = 50;
      const mockTimestamp = 1728950400000;

      vi.spyOn(Date, 'now').mockReturnValue(mockTimestamp);
      vi.mocked(mockRedis.zAdd).mockResolvedValue(1);
      vi.mocked(mockRedis.zCard).mockResolvedValue(1);
      vi.mocked(mockRedis.expireTime).mockResolvedValue(Date.now() + 100000); // TTL already set
      vi.mocked(mockRedis.expire).mockResolvedValue(undefined);

      await telemetryService.recordLatency(TEST_DATE, latencyMs);

      expect(mockRedis.expireTime).toHaveBeenCalledWith(`telemetry:${TEST_DATE}:p95`);
      expect(mockRedis.expire).not.toHaveBeenCalled();
    });

    it('should not throw when recordLatency fails', async () => {
      vi.mocked(mockRedis.zAdd).mockRejectedValue(new Error('Redis write failed'));

      await expect(
        telemetryService.recordLatency(TEST_DATE, 50)
      ).resolves.not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Telemetry latency recording failed'),
        expect.any(Error)
      );
    });

    it('should handle decimal latency values', async () => {
      const latencyMs = 45.678;
      const mockTimestamp = 1728950400000;

      vi.spyOn(Date, 'now').mockReturnValue(mockTimestamp);
      vi.mocked(mockRedis.zAdd).mockResolvedValue(1);
      vi.mocked(mockRedis.zCard).mockResolvedValue(1);
      vi.mocked(mockRedis.expireTime).mockResolvedValue(-1);
      vi.mocked(mockRedis.expire).mockResolvedValue(undefined);

      await telemetryService.recordLatency(TEST_DATE, latencyMs);

      expect(mockRedis.zAdd).toHaveBeenCalledWith(`telemetry:${TEST_DATE}:p95`, {
        member: `${mockTimestamp}:${latencyMs}`,
        score: mockTimestamp,
      });
    });

    it('should handle very large latency values', async () => {
      const latencyMs = 9999.99;
      const mockTimestamp = 1728950400000;

      vi.spyOn(Date, 'now').mockReturnValue(mockTimestamp);
      vi.mocked(mockRedis.zAdd).mockResolvedValue(1);
      vi.mocked(mockRedis.zCard).mockResolvedValue(1);
      vi.mocked(mockRedis.expireTime).mockResolvedValue(-1);
      vi.mocked(mockRedis.expire).mockResolvedValue(undefined);

      await telemetryService.recordLatency(TEST_DATE, latencyMs);

      expect(mockRedis.zAdd).toHaveBeenCalledWith(`telemetry:${TEST_DATE}:p95`, {
        member: `${mockTimestamp}:${latencyMs}`,
        score: mockTimestamp,
      });
    });
  });

  describe('getTelemetry()', () => {
    it('should retrieve counters and p95 samples correctly', async () => {
      const mockCounters = {
        requests: '1523',
        errors: '3',
        health_checks: '42',
      };

      const mockP95Entries = [
        { member: '1728950400000:45.3', score: 1728950400000 },
        { member: '1728950401000:52.1', score: 1728950401000 },
        { member: '1728950402000:38.7', score: 1728950402000 },
      ];

      vi.mocked(mockRedis.hGetAll).mockResolvedValue(mockCounters);
      vi.mocked(mockRedis.zRange).mockResolvedValue(mockP95Entries);

      const result = await telemetryService.getTelemetry(TEST_DATE);

      expect(mockRedis.hGetAll).toHaveBeenCalledWith(`telemetry:${TEST_DATE}`);
      expect(mockRedis.zRange).toHaveBeenCalledWith(`telemetry:${TEST_DATE}:p95`, 0, -1);

      expect(result).toEqual({
        requests: 1523,
        errors: 3,
        p95Samples: [45.3, 52.1, 38.7],
      });
    });

    it('should return zero counters when no data exists', async () => {
      vi.mocked(mockRedis.hGetAll).mockResolvedValue({});
      vi.mocked(mockRedis.zRange).mockResolvedValue([]);

      const result = await telemetryService.getTelemetry(TEST_DATE);

      expect(result).toEqual({
        requests: 0,
        errors: 0,
        p95Samples: [],
      });
    });

    it('should handle missing specific counters', async () => {
      const mockCounters = {
        requests: '100',
        // errors counter missing
      };

      vi.mocked(mockRedis.hGetAll).mockResolvedValue(mockCounters);
      vi.mocked(mockRedis.zRange).mockResolvedValue([]);

      const result = await telemetryService.getTelemetry(TEST_DATE);

      expect(result).toEqual({
        requests: 100,
        errors: 0, // Should default to 0
        p95Samples: [],
      });
    });

    it('should parse latency values from member strings correctly', async () => {
      const mockP95Entries = [
        { member: '1728950400000:10.5', score: 1728950400000 },
        { member: '1728950401000:20.75', score: 1728950401000 },
        { member: '1728950402000:30.123', score: 1728950402000 },
      ];

      vi.mocked(mockRedis.hGetAll).mockResolvedValue({});
      vi.mocked(mockRedis.zRange).mockResolvedValue(mockP95Entries);

      const result = await telemetryService.getTelemetry(TEST_DATE);

      expect(result.p95Samples).toEqual([10.5, 20.75, 30.123]);
    });

    it('should handle large number of p95 samples', async () => {
      const mockP95Entries = Array.from({ length: 1000 }, (_, i) => ({
        member: `${1728950400000 + i}:${50 + i * 0.1}`,
        score: 1728950400000 + i,
      }));

      vi.mocked(mockRedis.hGetAll).mockResolvedValue({});
      vi.mocked(mockRedis.zRange).mockResolvedValue(mockP95Entries);

      const result = await telemetryService.getTelemetry(TEST_DATE);

      expect(result.p95Samples).toHaveLength(1000);
      expect(result.p95Samples[0]).toBe(50);
      expect(result.p95Samples[999]).toBeCloseTo(149.9, 1);
    });

    it('should not throw when getTelemetry fails', async () => {
      vi.mocked(mockRedis.hGetAll).mockRejectedValue(new Error('Redis read failed'));

      const result = await telemetryService.getTelemetry(TEST_DATE);

      expect(result).toEqual({
        requests: 0,
        errors: 0,
        p95Samples: [],
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Telemetry retrieval failed'),
        expect.any(Error)
      );
    });

    it('should return default values when zRange fails', async () => {
      vi.mocked(mockRedis.hGetAll).mockResolvedValue({ requests: '100' });
      vi.mocked(mockRedis.zRange).mockRejectedValue(new Error('zRange failed'));

      const result = await telemetryService.getTelemetry(TEST_DATE);

      expect(result).toEqual({
        requests: 0,
        errors: 0,
        p95Samples: [],
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Telemetry retrieval failed'),
        expect.any(Error)
      );
    });

    it('should handle counter values as strings and convert to numbers', async () => {
      const mockCounters = {
        requests: '999999',
        errors: '0',
      };

      vi.mocked(mockRedis.hGetAll).mockResolvedValue(mockCounters);
      vi.mocked(mockRedis.zRange).mockResolvedValue([]);

      const result = await telemetryService.getTelemetry(TEST_DATE);

      expect(result.requests).toBe(999999);
      expect(result.errors).toBe(0);
      expect(typeof result.requests).toBe('number');
      expect(typeof result.errors).toBe('number');
    });
  });

  describe('calculateP95()', () => {
    it('should calculate 95th percentile correctly for 100 samples', () => {
      const samples = Array.from({ length: 100 }, (_, i) => i + 1); // 1 to 100

      const p95 = telemetryService.calculateP95(samples);

      expect(p95).toBe(95);
    });

    it('should calculate 95th percentile correctly for 20 samples', () => {
      const samples = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200];

      const p95 = telemetryService.calculateP95(samples);

      // 95th percentile of 20 samples: ceil(20 * 0.95) - 1 = 19 - 1 = 18 (0-indexed)
      expect(p95).toBe(190);
    });

    it('should return 0 for empty array', () => {
      const p95 = telemetryService.calculateP95([]);

      expect(p95).toBe(0);
    });

    it('should return the only value for single-element array', () => {
      const p95 = telemetryService.calculateP95([42]);

      expect(p95).toBe(42);
    });

    it('should handle unsorted input correctly', () => {
      const samples = [100, 20, 80, 40, 60, 90, 10, 50, 30, 70];

      const p95 = telemetryService.calculateP95(samples);

      // Sorted: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
      // 95th percentile: ceil(10 * 0.95) - 1 = 10 - 1 = 9 (0-indexed)
      expect(p95).toBe(100);
    });

    it('should not mutate the original array', () => {
      const samples = [50, 30, 70, 10, 90];
      const originalSamples = [...samples];

      telemetryService.calculateP95(samples);

      expect(samples).toEqual(originalSamples);
    });

    it('should handle decimal values', () => {
      const samples = [10.5, 20.3, 30.7, 40.2, 50.9, 60.1, 70.4, 80.8, 90.6, 100.0];

      const p95 = telemetryService.calculateP95(samples);

      expect(p95).toBe(100.0);
    });

    it('should handle duplicate values', () => {
      const samples = [50, 50, 50, 50, 50, 50, 50, 50, 50, 100];

      const p95 = telemetryService.calculateP95(samples);

      // Sorted: [50, 50, 50, 50, 50, 50, 50, 50, 50, 100]
      // 95th percentile: ceil(10 * 0.95) - 1 = 10 - 1 = 9 (0-indexed)
      expect(p95).toBe(100);
    });

    it('should handle all identical values', () => {
      const samples = Array(100).fill(42);

      const p95 = telemetryService.calculateP95(samples);

      expect(p95).toBe(42);
    });

    it('should calculate correctly for 1000 samples', () => {
      const samples = Array.from({ length: 1000 }, (_, i) => i + 1); // 1 to 1000

      const p95 = telemetryService.calculateP95(samples);

      // 95th percentile: ceil(1000 * 0.95) - 1 = 950 - 1 = 949 (0-indexed)
      expect(p95).toBe(950);
    });

    it('should handle negative values', () => {
      const samples = [-100, -50, 0, 50, 100];

      const p95 = telemetryService.calculateP95(samples);

      // Sorted: [-100, -50, 0, 50, 100]
      // 95th percentile: ceil(5 * 0.95) - 1 = 5 - 1 = 4 (0-indexed)
      expect(p95).toBe(100);
    });

    it('should handle very large values', () => {
      const samples = [1, 2, 3, 4, 5, 6, 7, 8, 9, 999999];

      const p95 = telemetryService.calculateP95(samples);

      expect(p95).toBe(999999);
    });

    it('should calculate correctly for 2 samples', () => {
      const samples = [10, 20];

      const p95 = telemetryService.calculateP95(samples);

      // ceil(2 * 0.95) - 1 = 2 - 1 = 1 (0-indexed)
      expect(p95).toBe(20);
    });

    it('should calculate correctly for 10 samples', () => {
      const samples = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

      const p95 = telemetryService.calculateP95(samples);

      // ceil(10 * 0.95) - 1 = 10 - 1 = 9 (0-indexed)
      expect(p95).toBe(10);
    });
  });

  describe('Redis key naming conventions', () => {
    it('should use correct key format for telemetry counters', async () => {
      vi.mocked(mockRedis.hIncrBy).mockResolvedValue(1);
      vi.mocked(mockRedis.expireTime).mockResolvedValue(-1);
      vi.mocked(mockRedis.expire).mockResolvedValue(undefined);

      await telemetryService.incrementCounter('2025-10-14', 'requests');

      expect(mockRedis.hIncrBy).toHaveBeenCalledWith(
        'telemetry:2025-10-14',
        expect.any(String),
        expect.any(Number)
      );
    });

    it('should use correct key format for p95 samples', async () => {
      const mockTimestamp = 1728950400000;
      vi.spyOn(Date, 'now').mockReturnValue(mockTimestamp);
      vi.mocked(mockRedis.zAdd).mockResolvedValue(1);
      vi.mocked(mockRedis.zCard).mockResolvedValue(1);
      vi.mocked(mockRedis.expireTime).mockResolvedValue(-1);
      vi.mocked(mockRedis.expire).mockResolvedValue(undefined);

      await telemetryService.recordLatency('2025-10-14', 50);

      expect(mockRedis.zAdd).toHaveBeenCalledWith(
        'telemetry:2025-10-14:p95',
        expect.any(Object)
      );
    });

    it('should handle different date formats consistently', async () => {
      const dates = ['2025-01-01', '2025-12-31', '2024-02-29'];

      vi.mocked(mockRedis.hGetAll).mockResolvedValue({});
      vi.mocked(mockRedis.zRange).mockResolvedValue([]);

      for (const date of dates) {
        await telemetryService.getTelemetry(date);
        expect(mockRedis.hGetAll).toHaveBeenCalledWith(`telemetry:${date}`);
        expect(mockRedis.zRange).toHaveBeenCalledWith(`telemetry:${date}:p95`, 0, -1);
      }
    });
  });

  describe('Error handling and graceful degradation', () => {
    it('should log error but not throw when hIncrBy fails', async () => {
      vi.mocked(mockRedis.hIncrBy).mockRejectedValue(new Error('Connection timeout'));

      await expect(
        telemetryService.incrementCounter(TEST_DATE, 'requests')
      ).resolves.not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Telemetry increment failed for counter "requests"'),
        expect.any(Error)
      );
    });

    it('should log error but not throw when zAdd fails', async () => {
      vi.mocked(mockRedis.zAdd).mockRejectedValue(new Error('Write failed'));

      await expect(
        telemetryService.recordLatency(TEST_DATE, 50)
      ).resolves.not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Telemetry latency recording failed'),
        expect.any(Error)
      );
    });

    it('should return default values when hGetAll fails', async () => {
      vi.mocked(mockRedis.hGetAll).mockRejectedValue(new Error('Read failed'));

      const result = await telemetryService.getTelemetry(TEST_DATE);

      expect(result).toEqual({
        requests: 0,
        errors: 0,
        p95Samples: [],
      });
    });

    it('should log error but not throw when zCard fails', async () => {
      const mockTimestamp = 1728950400000;
      vi.spyOn(Date, 'now').mockReturnValue(mockTimestamp);
      vi.mocked(mockRedis.zAdd).mockResolvedValue(1);
      vi.mocked(mockRedis.zCard).mockRejectedValue(new Error('zCard failed'));

      await expect(
        telemetryService.recordLatency(TEST_DATE, 50)
      ).resolves.not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Telemetry latency recording failed'),
        expect.any(Error)
      );
    });

    it('should log error but not throw when zRemRangeByRank fails', async () => {
      const mockTimestamp = 1728950400000;
      vi.spyOn(Date, 'now').mockReturnValue(mockTimestamp);
      vi.mocked(mockRedis.zAdd).mockResolvedValue(1);
      vi.mocked(mockRedis.zCard).mockResolvedValue(MAX_P95_SAMPLES + 1);
      vi.mocked(mockRedis.zRemRangeByRank).mockRejectedValue(new Error('Trim failed'));
      vi.mocked(mockRedis.expireTime).mockResolvedValue(-1);
      vi.mocked(mockRedis.expire).mockResolvedValue(undefined);

      await expect(
        telemetryService.recordLatency(TEST_DATE, 50)
      ).resolves.not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Telemetry latency recording failed'),
        expect.any(Error)
      );
    });

    it('should handle multiple consecutive failures gracefully', async () => {
      vi.mocked(mockRedis.hIncrBy).mockRejectedValue(new Error('Failure 1'));

      await telemetryService.incrementCounter(TEST_DATE, 'requests');
      await telemetryService.incrementCounter(TEST_DATE, 'errors');
      await telemetryService.incrementCounter(TEST_DATE, 'health_checks');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(3);
    });
  });

  describe('TTL behavior', () => {
    it('should set TTL to 7 days on first write', async () => {
      vi.mocked(mockRedis.hIncrBy).mockResolvedValue(1);
      vi.mocked(mockRedis.expireTime).mockResolvedValue(-1);
      vi.mocked(mockRedis.expire).mockResolvedValue(undefined);

      await telemetryService.incrementCounter(TEST_DATE, 'requests');

      expect(mockRedis.expire).toHaveBeenCalledWith(`telemetry:${TEST_DATE}`, TTL_SECONDS);
    });

    it('should not set TTL when key already has expiration', async () => {
      vi.mocked(mockRedis.hIncrBy).mockResolvedValue(1);
      vi.mocked(mockRedis.expireTime).mockResolvedValue(Date.now() + 500000);

      await telemetryService.incrementCounter(TEST_DATE, 'requests');

      expect(mockRedis.expire).not.toHaveBeenCalled();
    });

    it('should handle expireTime returning -2 (key does not exist)', async () => {
      vi.mocked(mockRedis.hIncrBy).mockResolvedValue(1);
      vi.mocked(mockRedis.expireTime).mockResolvedValue(-2); // Key doesn't exist

      await telemetryService.incrementCounter(TEST_DATE, 'requests');

      expect(mockRedis.expire).not.toHaveBeenCalled();
    });

    it('should set TTL on p95 key independently from counter key', async () => {
      const mockTimestamp = 1728950400000;
      vi.spyOn(Date, 'now').mockReturnValue(mockTimestamp);
      vi.mocked(mockRedis.zAdd).mockResolvedValue(1);
      vi.mocked(mockRedis.zCard).mockResolvedValue(1);
      vi.mocked(mockRedis.expireTime).mockResolvedValue(-1);
      vi.mocked(mockRedis.expire).mockResolvedValue(undefined);

      await telemetryService.recordLatency(TEST_DATE, 50);

      expect(mockRedis.expire).toHaveBeenCalledWith(`telemetry:${TEST_DATE}:p95`, TTL_SECONDS);
    });
  });

  describe('Integration scenarios', () => {
    it('should handle full telemetry workflow', async () => {
      // Increment counters
      vi.mocked(mockRedis.hIncrBy).mockResolvedValue(1);
      vi.mocked(mockRedis.expireTime).mockResolvedValue(-1);
      vi.mocked(mockRedis.expire).mockResolvedValue(undefined);

      await telemetryService.incrementCounter(TEST_DATE, 'requests');
      await telemetryService.incrementCounter(TEST_DATE, 'requests');
      await telemetryService.incrementCounter(TEST_DATE, 'errors');

      // Record latencies
      const mockTimestamp = 1728950400000;
      vi.spyOn(Date, 'now').mockReturnValue(mockTimestamp);
      vi.mocked(mockRedis.zAdd).mockResolvedValue(1);
      vi.mocked(mockRedis.zCard).mockResolvedValue(1);

      await telemetryService.recordLatency(TEST_DATE, 45.3);
      await telemetryService.recordLatency(TEST_DATE, 52.1);

      // Retrieve telemetry
      vi.mocked(mockRedis.hGetAll).mockResolvedValue({
        requests: '2',
        errors: '1',
      });
      vi.mocked(mockRedis.zRange).mockResolvedValue([
        { member: '1728950400000:45.3', score: 1728950400000 },
        { member: '1728950400000:52.1', score: 1728950400000 },
      ]);

      const result = await telemetryService.getTelemetry(TEST_DATE);

      expect(result.requests).toBe(2);
      expect(result.errors).toBe(1);
      expect(result.p95Samples).toEqual([45.3, 52.1]);

      // Calculate p95
      const p95 = telemetryService.calculateP95(result.p95Samples);
      expect(p95).toBe(52.1);
    });

    it('should handle concurrent operations on same date', async () => {
      vi.mocked(mockRedis.hIncrBy).mockResolvedValue(1);
      vi.mocked(mockRedis.expireTime).mockResolvedValue(-1);
      vi.mocked(mockRedis.expire).mockResolvedValue(undefined);

      const mockTimestamp = 1728950400000;
      vi.spyOn(Date, 'now').mockReturnValue(mockTimestamp);
      vi.mocked(mockRedis.zAdd).mockResolvedValue(1);
      vi.mocked(mockRedis.zCard).mockResolvedValue(1);

      // Simulate concurrent operations
      await Promise.all([
        telemetryService.incrementCounter(TEST_DATE, 'requests'),
        telemetryService.incrementCounter(TEST_DATE, 'requests'),
        telemetryService.recordLatency(TEST_DATE, 50),
        telemetryService.recordLatency(TEST_DATE, 60),
      ]);

      expect(mockRedis.hIncrBy).toHaveBeenCalledTimes(2);
      expect(mockRedis.zAdd).toHaveBeenCalledTimes(2);
    });

    it('should handle operations across different dates', async () => {
      const dates = ['2025-10-14', '2025-10-15', '2025-10-16'];

      vi.mocked(mockRedis.hIncrBy).mockResolvedValue(1);
      vi.mocked(mockRedis.expireTime).mockResolvedValue(-1);
      vi.mocked(mockRedis.expire).mockResolvedValue(undefined);

      for (const date of dates) {
        await telemetryService.incrementCounter(date, 'requests');
      }

      expect(mockRedis.hIncrBy).toHaveBeenCalledWith('telemetry:2025-10-14', 'requests', 1);
      expect(mockRedis.hIncrBy).toHaveBeenCalledWith('telemetry:2025-10-15', 'requests', 1);
      expect(mockRedis.hIncrBy).toHaveBeenCalledWith('telemetry:2025-10-16', 'requests', 1);
    });
  });
});
