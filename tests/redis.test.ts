import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RedisConnection } from '../src/server/utils/redis';

/**
 * Unit tests for Redis connection management
 * 
 * These tests verify:
 * - Health check functionality
 * - Error handling and descriptive error messages
 * - Redis availability detection
 */

const HEALTH_CHECK_KEY = 'health:check';
const EXPIRATION_SECONDS = 60;
const EXPIRATION_MS = EXPIRATION_SECONDS * 1000;
const EXPIRATION_TOLERANCE_MS = 1000; // Allow 1 second tolerance for timing

describe('RedisConnection', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.restoreAllMocks();
  });

  describe('getClient()', () => {
    it('should return the redis client instance', () => {
      const client = RedisConnection.getClient();
      
      expect(client).toBeDefined();
      expect(client).toHaveProperty('set');
      expect(client).toHaveProperty('get');
    });

    it('should return the same client instance on multiple calls', () => {
      const client1 = RedisConnection.getClient();
      const client2 = RedisConnection.getClient();
      
      expect(client1).toBe(client2);
    });
  });

  describe('healthCheck()', () => {
    it('should return true when Redis is available and operations succeed', async () => {
      const client = RedisConnection.getClient();
      let capturedValue: string;
      
      const mockSet = vi.spyOn(client, 'set').mockImplementation(async (_key, value) => {
        capturedValue = value as string;
        return 'OK';
      });
      const mockGet = vi.spyOn(client, 'get').mockImplementation(async () => capturedValue);

      const result = await RedisConnection.healthCheck();

      expect(result).toBe(true);
      expect(mockSet).toHaveBeenCalledWith(
        HEALTH_CHECK_KEY,
        expect.any(String),
        expect.objectContaining({ expiration: expect.any(Date) })
      );
      expect(mockGet).toHaveBeenCalledWith(HEALTH_CHECK_KEY);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should return false and log error when Redis set operation fails', async () => {
      const client = RedisConnection.getClient();
      const testError = new Error('Redis connection timeout');
      
      vi.spyOn(client, 'set').mockRejectedValue(testError);

      const result = await RedisConnection.healthCheck();

      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Redis health check failed:', testError);
    });

    it('should return false and log error when Redis get operation fails', async () => {
      const client = RedisConnection.getClient();
      const testError = new Error('Redis read timeout');
      
      vi.spyOn(client, 'set').mockResolvedValue('OK');
      vi.spyOn(client, 'get').mockRejectedValue(testError);

      const result = await RedisConnection.healthCheck();

      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Redis health check failed:', testError);
    });

    it('should return false when retrieved value does not match set value', async () => {
      const client = RedisConnection.getClient();
      
      vi.spyOn(client, 'set').mockResolvedValue('OK');
      vi.spyOn(client, 'get').mockResolvedValue('wrong-value');

      const result = await RedisConnection.healthCheck();

      expect(result).toBe(false);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should set expiration time correctly on health check key', async () => {
      const client = RedisConnection.getClient();
      const beforeTime = Date.now();
      let capturedValue: string;
      
      const mockSet = vi.spyOn(client, 'set').mockImplementation(async (_key, value) => {
        capturedValue = value as string;
        return 'OK';
      });
      vi.spyOn(client, 'get').mockImplementation(async () => capturedValue);

      await RedisConnection.healthCheck();

      const afterTime = Date.now();
      const setCall = mockSet.mock.calls[0];
      const expirationDate = setCall[2]?.expiration as Date;
      
      expect(expirationDate).toBeInstanceOf(Date);
      
      const expirationTime = expirationDate.getTime();
      const expectedMin = beforeTime + EXPIRATION_MS - EXPIRATION_TOLERANCE_MS;
      const expectedMax = afterTime + EXPIRATION_MS + EXPIRATION_TOLERANCE_MS;
      
      expect(expirationTime).toBeGreaterThanOrEqual(expectedMin);
      expect(expirationTime).toBeLessThanOrEqual(expectedMax);
    });
  });

  describe('Error handling patterns', () => {
    it('should not throw errors from healthCheck, only return false', async () => {
      const client = RedisConnection.getClient();
      vi.spyOn(client, 'set').mockRejectedValue(new Error('Fatal error'));

      await expect(RedisConnection.healthCheck()).resolves.toBe(false);
    });

    it('should handle multiple consecutive failures gracefully', async () => {
      const client = RedisConnection.getClient();
      vi.spyOn(client, 'set').mockRejectedValue(new Error('Persistent failure'));

      const result1 = await RedisConnection.healthCheck();
      const result2 = await RedisConnection.healthCheck();
      const result3 = await RedisConnection.healthCheck();

      expect(result1).toBe(false);
      expect(result2).toBe(false);
      expect(result3).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(3);
    });
  });
});
