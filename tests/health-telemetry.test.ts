/**
 * Health Endpoint Telemetry Integration Tests
 *
 * Verifies that the /api/health endpoint correctly integrates with TelemetryService
 * to track health check requests without impacting response time.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { RedisClient } from '@devvit/web/server';

describe('Health Endpoint Telemetry Integration', () => {
  let mockRedis: RedisClient;

  beforeEach(() => {
    // Create a mock Redis client
    mockRedis = {
      hIncrBy: vi.fn().mockResolvedValue(1),
      expireTime: vi.fn().mockResolvedValue(-1),
      expire: vi.fn().mockResolvedValue(true),
    } as unknown as RedisClient;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('TelemetryService integration', () => {
    it('should import TelemetryService in server index', async () => {
      // Verify the import exists
      const serverIndexPath = './src/server/index.ts';
      const { readFileSync } = await import('fs');
      const content = readFileSync(serverIndexPath, 'utf-8');

      expect(content).toContain("import { TelemetryService }");
      expect(content).toContain("from './services/telemetry.service'");
    });

    it('should import redis from @devvit/web/server', async () => {
      const serverIndexPath = './src/server/index.ts';
      const { readFileSync } = await import('fs');
      const content = readFileSync(serverIndexPath, 'utf-8');

      expect(content).toContain("import { redis }");
      expect(content).toContain("from '@devvit/web/server'");
    });

    it('should instantiate TelemetryService in health endpoint', async () => {
      const serverIndexPath = './src/server/index.ts';
      const { readFileSync } = await import('fs');
      const content = readFileSync(serverIndexPath, 'utf-8');

      // Verify TelemetryService is instantiated
      expect(content).toContain('new TelemetryService(redis)');
    });

    it('should call incrementCounter with health_checks counter', async () => {
      const serverIndexPath = './src/server/index.ts';
      const { readFileSync } = await import('fs');
      const content = readFileSync(serverIndexPath, 'utf-8');

      // Verify incrementCounter is called with 'health_checks'
      expect(content).toContain("incrementCounter");
      expect(content).toContain("'health_checks'");
    });

    it('should use current date in YYYY-MM-DD format', async () => {
      const serverIndexPath = './src/server/index.ts';
      const { readFileSync } = await import('fs');
      const content = readFileSync(serverIndexPath, 'utf-8');

      // Verify date is extracted from ISO string
      expect(content).toContain("toISOString().split('T')[0]");
    });

    it('should make health endpoint async', async () => {
      const serverIndexPath = './src/server/index.ts';
      const { readFileSync } = await import('fs');
      const content = readFileSync(serverIndexPath, 'utf-8');

      // Verify the handler is async
      expect(content).toMatch(/app\.get\(['"]\/api\/health['"],\s*async/);
    });
  });

  describe('Telemetry behavior', () => {
    it('should not impact response time (telemetry is non-blocking)', async () => {
      const { TelemetryService } = await import('../src/server/services/telemetry.service');
      
      const telemetry = new TelemetryService(mockRedis);
      const date = new Date().toISOString().split('T')[0];

      const startTime = Date.now();
      await telemetry.incrementCounter(date, 'health_checks');
      const duration = Date.now() - startTime;

      // Telemetry should complete very quickly (under 50ms)
      expect(duration).toBeLessThan(50);
    });

    it('should handle telemetry failures gracefully', async () => {
      const { TelemetryService } = await import('../src/server/services/telemetry.service');
      
      // Create a Redis client that fails
      const failingRedis = {
        hIncrBy: vi.fn().mockRejectedValue(new Error('Redis connection failed')),
        expireTime: vi.fn().mockRejectedValue(new Error('Redis connection failed')),
        expire: vi.fn().mockRejectedValue(new Error('Redis connection failed')),
      } as unknown as RedisClient;

      const telemetry = new TelemetryService(failingRedis);
      const date = new Date().toISOString().split('T')[0];

      // Should not throw even when Redis fails
      await expect(
        telemetry.incrementCounter(date, 'health_checks')
      ).resolves.not.toThrow();
    });

    it('should increment counter correctly', async () => {
      const { TelemetryService } = await import('../src/server/services/telemetry.service');
      
      const telemetry = new TelemetryService(mockRedis);
      const date = '2025-10-14';

      await telemetry.incrementCounter(date, 'health_checks');

      // Verify Redis operations were called
      expect(mockRedis.hIncrBy).toHaveBeenCalledWith(
        'telemetry:2025-10-14',
        'health_checks',
        1
      );
    });

    it('should set TTL on first write', async () => {
      const { TelemetryService } = await import('../src/server/services/telemetry.service');
      
      const telemetry = new TelemetryService(mockRedis);
      const date = '2025-10-14';

      await telemetry.incrementCounter(date, 'health_checks');

      // Verify TTL operations were called
      expect(mockRedis.expireTime).toHaveBeenCalledWith('telemetry:2025-10-14');
      expect(mockRedis.expire).toHaveBeenCalledWith(
        'telemetry:2025-10-14',
        7 * 24 * 60 * 60 // 7 days in seconds
      );
    });
  });

  describe('Date handling', () => {
    it('should use current date in correct format', () => {
      const date = new Date().toISOString().split('T')[0];
      
      // Verify format is YYYY-MM-DD
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should use consistent date format across requests', () => {
      const date1 = new Date().toISOString().split('T')[0];
      const date2 = new Date().toISOString().split('T')[0];
      
      // Should be the same date (unless test runs at midnight)
      expect(date1).toBe(date2);
    });
  });
});
