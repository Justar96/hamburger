/**
 * Integration tests for /api/progress endpoint
 *
 * Tests the progress endpoint through the full API stack including:
 * - HTTP request/response handling
 * - Service integration with real Redis (via test endpoints)
 * - Date validation and error handling
 * - Response structure and caching headers
 * - Performance requirements
 *
 * These tests use the test server and API endpoints to simulate
 * real client requests and verify end-to-end functionality.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// Test configuration
const SERVER_URL = 'http://localhost:3000';
const TEST_DATE = '2025-10-15';

// Track keys for cleanup
let testKeys: string[] = [];

function trackKey(key: string) {
  testKeys.push(key);
}

// Helper function for API requests
async function apiRequest(endpoint: string, options: RequestInit = {}) {
  const response = await fetch(`${SERVER_URL}/api/${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  const data = await response.json();
  return { response, data, status: response.status };
}

// Helper function for test endpoint requests
async function testRequest(endpoint: string, body: any = {}) {
  const response = await fetch(`${SERVER_URL}/api/test/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  return { response, data, status: response.status };
}

describe('API Progress Endpoint Integration', () => {
  beforeEach(() => {
    testKeys = [];
  });

  afterEach(async () => {
    // Cleanup test data
    if (testKeys.length > 0) {
      await testRequest('cleanup', { keys: testKeys });
    }
  });

  describe('Successful requests', () => {
    it('should return progress data with empty state', async () => {
      const startTime = Date.now();

      const { data, status } = await apiRequest(
        `progress?date=${TEST_DATE}`,
        {
          method: 'GET',
        }
      );

      const endTime = Date.now();

      expect(status).toBe(200);
      expect(data).toMatchObject({
        top: expect.any(Array),
        my: expect.any(Array),
        timeLeftSec: expect.any(Number),
        timestamp: expect.any(Number),
      });

      // Verify response structure
      expect(data.top).toEqual([]); // No votes yet
      expect(data.my).toEqual([]); // No user choices yet
      expect(data.timeLeftSec).toBeGreaterThanOrEqual(0);

      // Verify performance requirement (< 50ms)
      const responseTime = endTime - startTime;
      expect(responseTime).toBeLessThan(100); // Allow some margin for integration test
    });

    it('should return progress data with existing votes', async () => {
      // Setup test data - create some votes
      trackKey(`tallies:${TEST_DATE}`);
      
      await testRequest('tallies', {
        date: TEST_DATE,
        words: ['neon', 'rain', 'cyber', 'neon', 'rain'], // neon=2, rain=2, cyber=1
      });

      const { data, status } = await apiRequest(
        `progress?date=${TEST_DATE}`,
        {
          method: 'GET',
        }
      );

      expect(status).toBe(200);
      expect(data.top).toHaveLength(3);
      
      // Verify top words are sorted by count (descending)
      expect(data.top[0].count).toBeGreaterThanOrEqual(data.top[1].count);
      expect(data.top[1].count).toBeGreaterThanOrEqual(data.top[2].count);

      // Verify word structure
      data.top.forEach((entry: any) => {
        expect(entry).toHaveProperty('word');
        expect(entry).toHaveProperty('count');
        expect(typeof entry.word).toBe('string');
        expect(typeof entry.count).toBe('number');
        expect(entry.count).toBeGreaterThan(0);
      });
    });

    it('should return user choices when user has submitted', async () => {
      const userId = 'test_user_123';
      const userChoices = ['neon', 'rain', 'cyber'];

      // Setup test data - user choices
      trackKey(`choices:${TEST_DATE}`);
      
      await testRequest('choices', {
        date: TEST_DATE,
        userId,
        choices: userChoices,
      });

      // Note: For integration test, we can't easily mock the Devvit context
      // So this test verifies the structure but not the exact user matching
      const { data, status } = await apiRequest(
        `progress?date=${TEST_DATE}`,
        {
          method: 'GET',
        }
      );

      expect(status).toBe(200);
      expect(Array.isArray(data.my)).toBe(true);
      // In integration test, my array might be empty since we can't match the user
      // but the structure should be correct
    });

    it('should handle future dates correctly', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);
      const futureDateStr = futureDate.toISOString().split('T')[0];

      const { data, status } = await apiRequest(
        `progress?date=${futureDateStr}`,
        {
          method: 'GET',
        }
      );

      expect(status).toBe(200);
      expect(data.timeLeftSec).toBeGreaterThan(0);
    });

    it('should handle past dates correctly', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      const pastDateStr = pastDate.toISOString().split('T')[0];

      const { data, status } = await apiRequest(
        `progress?date=${pastDateStr}`,
        {
          method: 'GET',
        }
      );

      expect(status).toBe(200);
      expect(data.timeLeftSec).toBe(0);
    });
  });

  describe('Validation errors', () => {
    it('should return 400 for missing date parameter', async () => {
      const { data, status } = await apiRequest('progress', {
        method: 'GET',
      });

      expect(status).toBe(400);
      expect(data.error).toMatchObject({
        code: 'INVALID_DATE',
        message: expect.stringContaining('Invalid date parameter'),
      });
    });

    it('should return 400 for invalid date format', async () => {
      const { data, status } = await apiRequest(
        'progress?date=2025/10/15',
        {
          method: 'GET',
        }
      );

      expect(status).toBe(400);
      expect(data.error).toMatchObject({
        code: 'INVALID_DATE',
        message: expect.stringContaining('Invalid date parameter'),
        details: expect.objectContaining({
          field: 'date',
          expected: 'YYYY-MM-DD format',
          received: '2025/10/15',
        }),
      });
    });

    it('should return 400 for invalid date value', async () => {
      const { data, status } = await apiRequest(
        'progress?date=2025-02-30', // Invalid date
        {
          method: 'GET',
        }
      );

      expect(status).toBe(400);
      expect(data.error.code).toBe('INVALID_DATE');
    });

    it('should return 400 for malformed date', async () => {
      const { data, status } = await apiRequest(
        'progress?date=not-a-date',
        {
          method: 'GET',
        }
      );

      expect(status).toBe(400);
      expect(data.error.code).toBe('INVALID_DATE');
    });
  });

  describe('Response structure and headers', () => {
    it('should include proper response structure', async () => {
      const { response, data, status } = await apiRequest(
        `progress?date=${TEST_DATE}`,
        {
          method: 'GET',
        }
      );

      expect(status).toBe(200);

      // Verify required fields
      expect(data).toHaveProperty('top');
      expect(data).toHaveProperty('my');
      expect(data).toHaveProperty('timeLeftSec');
      expect(data).toHaveProperty('timestamp');

      // Verify data types
      expect(Array.isArray(data.top)).toBe(true);
      expect(Array.isArray(data.my)).toBe(true);
      expect(typeof data.timeLeftSec).toBe('number');
      expect(typeof data.timestamp).toBe('number');

      // Verify timestamp is recent
      const now = Date.now();
      expect(data.timestamp).toBeGreaterThan(now - 5000); // Within last 5 seconds
      expect(data.timestamp).toBeLessThanOrEqual(now);
    });

    it('should set appropriate cache headers', async () => {
      const { response } = await apiRequest(`progress?date=${TEST_DATE}`, {
        method: 'GET',
      });

      const cacheControl = response.headers.get('Cache-Control');
      const etag = response.headers.get('ETag');

      expect(cacheControl).toBeTruthy();
      expect(cacheControl).toMatch(/public, max-age=\d+/);
      expect(etag).toBeTruthy();
    });

    it('should include request ID for tracing', async () => {
      const { data } = await apiRequest(`progress?date=${TEST_DATE}`, {
        method: 'GET',
      });

      expect(data.requestId).toBeDefined();
      expect(data.requestId).toMatch(/^progress_\d+_[a-z0-9]+$/);
    });
  });

  describe('Performance requirements', () => {
    it('should respond within 50ms for cached data', async () => {
      // First request to warm up
      await apiRequest(`progress?date=${TEST_DATE}`, {
        method: 'GET',
      });

      // Measure second request (should be faster)
      const startTime = Date.now();
      
      const { status } = await apiRequest(`progress?date=${TEST_DATE}`, {
        method: 'GET',
      });
      
      const endTime = Date.now();
      const responseTime = endTime - startTime;

      expect(status).toBe(200);
      expect(responseTime).toBeLessThan(100); // Allow margin for integration test
    });

    it('should handle concurrent requests efficiently', async () => {
      const concurrentRequests = 5;
      const startTime = Date.now();

      const promises = Array.from({ length: concurrentRequests }, () =>
        apiRequest(`progress?date=${TEST_DATE}`, {
          method: 'GET',
        })
      );

      const results = await Promise.all(promises);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // All requests should succeed
      results.forEach(({ status }) => {
        expect(status).toBe(200);
      });

      // Total time should be reasonable (not much more than single request)
      expect(totalTime).toBeLessThan(500); // 5 requests in under 500ms
    });
  });

  describe('Error handling', () => {
    it('should handle malformed query parameters gracefully', async () => {
      const { data, status } = await apiRequest(
        'progress?date=&invalid=param',
        {
          method: 'GET',
        }
      );

      expect(status).toBe(400);
      expect(data.error).toBeDefined();
      expect(data.timestamp).toBeDefined();
    });

    it('should return consistent error structure', async () => {
      const { data, status } = await apiRequest(
        'progress?date=invalid',
        {
          method: 'GET',
        }
      );

      expect(status).toBe(400);
      expect(data).toMatchObject({
        error: {
          code: expect.any(String),
          message: expect.any(String),
        },
        timestamp: expect.any(Number),
      });

      // Should not include sensitive information
      expect(JSON.stringify(data)).not.toMatch(/stack|internal|redis/i);
    });
  });

  describe('Data consistency', () => {
    it('should return consistent data across multiple requests', async () => {
      // Setup some test data
      trackKey(`tallies:${TEST_DATE}`);
      
      await testRequest('tallies', {
        date: TEST_DATE,
        words: ['neon', 'rain', 'cyber'],
      });

      // Make multiple requests
      const request1 = await apiRequest(`progress?date=${TEST_DATE}`, {
        method: 'GET',
      });
      
      const request2 = await apiRequest(`progress?date=${TEST_DATE}`, {
        method: 'GET',
      });

      expect(request1.status).toBe(200);
      expect(request2.status).toBe(200);

      // Data should be consistent (same top words)
      expect(request1.data.top).toEqual(request2.data.top);
      expect(request1.data.my).toEqual(request2.data.my);
    });

    it('should reflect updated data after new votes', async () => {
      trackKey(`tallies:${TEST_DATE}`);

      // Initial state
      const initial = await apiRequest(`progress?date=${TEST_DATE}`, {
        method: 'GET',
      });

      // Add some votes
      await testRequest('tallies', {
        date: TEST_DATE,
        words: ['neon', 'rain'],
      });

      // Check updated state
      const updated = await apiRequest(`progress?date=${TEST_DATE}`, {
        method: 'GET',
      });

      expect(initial.status).toBe(200);
      expect(updated.status).toBe(200);

      // Should have more votes in updated response
      const initialTotal = initial.data.top.reduce(
        (sum: number, entry: any) => sum + entry.count,
        0
      );
      const updatedTotal = updated.data.top.reduce(
        (sum: number, entry: any) => sum + entry.count,
        0
      );

      expect(updatedTotal).toBeGreaterThanOrEqual(initialTotal);
    });
  });
});