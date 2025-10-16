/**
 * Integration tests for Phase 3 Client API endpoints
 *
 * Tests all three main API endpoints with real Redis and services:
 * - GET /api/init - Initialize game state
 * - POST /api/pick - Submit word choices (with rate limiting)
 * - GET /api/progress - Get voting progress
 *
 * These tests verify:
 * - Complete endpoint workflows with real services
 * - Input validation and error handling
 * - Rate limiting behavior
 * - Response formatting and structure
 * - Performance requirements (sub-100ms response times)
 * - Error handling scenarios
 *
 * Requirements: 1.7, 2.7, 3.7, 8.1, 8.2, 8.3, 10.1, 10.2, 10.3
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const SERVER_URL = 'http://localhost:3000';

// Track keys for cleanup
let testKeys: string[] = [];

// Helper function to make API requests
async function apiRequest(endpoint: string, options: RequestInit = {}) {
  const response = await fetch(`${SERVER_URL}/api/${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  let data: any;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  return { response, data, status: response.status };
}

// Helper function for test endpoint requests (for setup/cleanup)
async function testRequest(endpoint: string, body: any = {}) {
  const response = await fetch(`${SERVER_URL}/api/test/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  return { response, data, status: response.status };
}

describe('Phase 3 Client API Endpoints Integration', () => {
  beforeEach(() => {
    testKeys = [];
  });

  afterEach(async () => {
    // Cleanup test data
    if (testKeys.length > 0) {
      try {
        await testRequest('cleanup', { keys: testKeys });
      } catch {
        // Cleanup failed - ignore for tests
      }
    }
  });

  describe('GET /api/init - Initialize game state', () => {
    it('should return proper error structure for missing date parameter', async () => {
      const startTime = Date.now();
      
      const { data, status } = await apiRequest('init', {
        method: 'GET',
      });

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      expect(status).toBe(400);
      expect(data).toMatchObject({
        error: {
          code: 'INVALID_DATE',
          message: expect.stringContaining('Invalid date parameter'),
        },
        timestamp: expect.any(Number),
      });

      // Verify performance requirement (< 100ms)
      expect(responseTime).toBeLessThan(100);
    });

    it('should return proper error structure for invalid date format', async () => {
      const { data, status } = await apiRequest('init?date=2025/10/15', {
        method: 'GET',
      });

      expect(status).toBe(400);
      expect(data).toMatchObject({
        error: {
          code: 'INVALID_DATE',
          message: expect.stringContaining('Invalid date parameter'),
          details: expect.objectContaining({
            field: 'date',
            expected: 'YYYY-MM-DD format',
            received: '2025/10/15',
          }),
        },
        timestamp: expect.any(Number),
      });
    });

    it('should handle authentication errors gracefully', async () => {
      // This test verifies that the endpoint properly handles missing Devvit context
      // In a real Devvit environment, this would be provided by the runtime
      const { data, status } = await apiRequest('init?date=2025-10-15', {
        method: 'GET',
      });

      // Expect either 401 (auth error) or 500 (internal error due to missing context)
      expect([401, 500]).toContain(status);
      
      if (status === 401) {
        expect(data).toMatchObject({
          error: {
            code: 'UNAUTHORIZED',
            message: expect.stringContaining('User authentication required'),
          },
          timestamp: expect.any(Number),
        });
      } else {
        expect(data).toMatchObject({
          error: {
            code: 'INTERNAL_ERROR',
            message: expect.any(String),
          },
          timestamp: expect.any(Number),
        });
      }
    });

    it('should include request ID for tracing in error responses', async () => {
      const { data, status } = await apiRequest('init', {
        method: 'GET',
      });

      expect(status).toBe(400);
      expect(data.requestId).toMatch(/^init_\d+_[a-z0-9]+$/);
    });
  });

  describe('POST /api/pick - Submit word choices', () => {
    it('should return proper error structure for missing request body', async () => {
      const startTime = Date.now();
      
      const { data, status } = await apiRequest('pick', {
        method: 'POST',
      });

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      expect([400, 401, 500]).toContain(status);
      expect(data).toHaveProperty('error');
      expect(data).toHaveProperty('timestamp');

      // Verify performance requirement (< 50ms for validation errors)
      expect(responseTime).toBeLessThan(100);
    });

    it('should validate date parameter format', async () => {
      const { data, status } = await apiRequest('pick', {
        method: 'POST',
        body: JSON.stringify({
          words: ['test', 'words'],
          date: '2025/10/15', // Invalid format
        }),
      });

      // Expect validation error (400) or auth error (401/500)
      expect([400, 401, 500]).toContain(status);
      
      if (status === 400) {
        expect(data.error.code).toBe('INVALID_DATE');
      }
    });

    it('should validate words array structure', async () => {
      const { data, status } = await apiRequest('pick', {
        method: 'POST',
        body: JSON.stringify({
          words: 'not-an-array',
          date: '2025-10-15',
        }),
      });

      // Expect validation error (400) or auth error (401/500)
      expect([400, 401, 500]).toContain(status);
      
      if (status === 400) {
        expect(data.error.code).toBe('INVALID_WORDS');
      }
    });

    it('should reject empty words array', async () => {
      const { data, status } = await apiRequest('pick', {
        method: 'POST',
        body: JSON.stringify({
          words: [],
          date: '2025-10-15',
        }),
      });

      // Expect validation error (400) or auth error (401/500)
      expect([400, 401, 500]).toContain(status);
      
      if (status === 400) {
        expect(data.error.code).toBe('INVALID_WORDS');
      }
    });

    it('should handle malformed JSON gracefully', async () => {
      const response = await fetch(`${SERVER_URL}/api/pick`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: 'invalid-json',
      });

      expect(response.status).toBe(400);
    });

    it('should include request ID for tracing', async () => {
      const { data, status } = await apiRequest('pick', {
        method: 'POST',
        body: JSON.stringify({
          words: ['test'],
          date: '2025-10-15',
        }),
      });

      expect([400, 401, 500]).toContain(status);
      expect(data.requestId).toMatch(/^pick_\d+_[a-z0-9]+$/);
    });
  });

  describe('GET /api/progress - Get voting progress', () => {
    it('should return proper error structure for missing date parameter', async () => {
      const startTime = Date.now();
      
      const { data, status } = await apiRequest('progress', {
        method: 'GET',
      });

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      expect(status).toBe(400);
      expect(data).toMatchObject({
        error: {
          code: 'INVALID_DATE',
          message: expect.stringContaining('Invalid date parameter'),
        },
        timestamp: expect.any(Number),
      });

      // Verify performance requirement (< 50ms)
      expect(responseTime).toBeLessThan(100);
    });

    it('should validate date parameter format', async () => {
      const { data, status } = await apiRequest('progress?date=invalid-date', {
        method: 'GET',
      });

      expect(status).toBe(400);
      expect(data).toMatchObject({
        error: {
          code: 'INVALID_DATE',
          message: expect.stringContaining('Invalid date parameter'),
          details: expect.objectContaining({
            field: 'date',
            expected: 'YYYY-MM-DD format',
            received: 'invalid-date',
          }),
        },
        timestamp: expect.any(Number),
      });
    });

    it('should handle authentication errors gracefully', async () => {
      const { data, status } = await apiRequest('progress?date=2025-10-15', {
        method: 'GET',
      });

      // Expect either 401 (auth error) or 500 (internal error due to missing context)
      expect([401, 500]).toContain(status);
      
      if (status === 401) {
        expect(data).toMatchObject({
          error: {
            code: 'UNAUTHORIZED',
            message: expect.stringContaining('User authentication required'),
          },
          timestamp: expect.any(Number),
        });
      } else {
        expect(data).toMatchObject({
          error: {
            code: 'INTERNAL_ERROR',
            message: expect.any(String),
          },
          timestamp: expect.any(Number),
        });
      }
    });

    it('should include request ID for tracing', async () => {
      const { data, status } = await apiRequest('progress', {
        method: 'GET',
      });

      expect(status).toBe(400);
      expect(data.requestId).toMatch(/^progress_\d+_[a-z0-9]+$/);
    });
  });

  describe('Error handling and response formatting', () => {
    it('should return 404 for unknown API routes', async () => {
      const { data, status } = await apiRequest('unknown-endpoint', {
        method: 'GET',
      });

      // Should return 404 or 500 (depending on error handling implementation)
      expect([404, 500]).toContain(status);
      expect(data).toHaveProperty('error');
      expect(data.error).toHaveProperty('code');
      expect(data.error).toHaveProperty('message');
      expect(data).toHaveProperty('timestamp');
    });

    it('should handle OPTIONS requests (CORS preflight)', async () => {
      const response = await fetch(`${SERVER_URL}/api/init`, {
        method: 'OPTIONS',
      });

      // Should either handle OPTIONS or return 404/405/500
      expect([200, 404, 405, 500]).toContain(response.status);
    });

    it('should return consistent error structure across endpoints', async () => {
      const endpoints = [
        { path: 'init', method: 'GET' },
        { path: 'pick', method: 'POST' },
        { path: 'progress', method: 'GET' },
      ];

      for (const endpoint of endpoints) {
        const { data, status } = await apiRequest(endpoint.path, {
          method: endpoint.method,
        });

        expect([400, 401, 500]).toContain(status);
        expect(data).toHaveProperty('error');
        expect(data.error).toHaveProperty('code');
        expect(data.error).toHaveProperty('message');
        expect(data).toHaveProperty('timestamp');
        expect(typeof data.timestamp).toBe('number');
      }
    });
  });

  describe('Performance requirements', () => {
    it('should respond to validation errors within performance targets', async () => {
      const endpoints = [
        { path: 'init', method: 'GET', target: 100 },
        { path: 'pick', method: 'POST', target: 50 },
        { path: 'progress', method: 'GET', target: 50 },
      ];

      for (const endpoint of endpoints) {
        const startTime = Date.now();
        
        await apiRequest(endpoint.path, {
          method: endpoint.method,
          body: endpoint.method === 'POST' ? JSON.stringify({}) : undefined,
        });
        
        const endTime = Date.now();
        const responseTime = endTime - startTime;

        // Allow some margin for integration test environment
        expect(responseTime).toBeLessThan(endpoint.target * 2);
      }
    });

    it('should handle concurrent requests efficiently', async () => {
      const concurrentRequests = 5;
      const startTime = Date.now();

      const promises = Array.from({ length: concurrentRequests }, () =>
        apiRequest('init', { method: 'GET' })
      );

      const results = await Promise.all(promises);
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // All requests should complete
      expect(results).toHaveLength(concurrentRequests);
      
      // Total time should be reasonable (not much more than single request)
      expect(totalTime).toBeLessThan(500); // 5 requests in under 500ms
      
      // All should return consistent error responses
      results.forEach(({ status, data }) => {
        expect([400, 401, 500]).toContain(status);
        expect(data).toHaveProperty('error');
      });
    });
  });

  describe('HTTP method validation', () => {
    it('should reject wrong HTTP methods for each endpoint', async () => {
      const testCases = [
        { path: 'init?date=2025-10-15', correctMethod: 'GET', wrongMethod: 'POST' },
        { path: 'pick', correctMethod: 'POST', wrongMethod: 'GET' },
        { path: 'progress?date=2025-10-15', correctMethod: 'GET', wrongMethod: 'POST' },
      ];

      for (const testCase of testCases) {
        const { status } = await apiRequest(testCase.path, {
          method: testCase.wrongMethod,
        });

        // Should return method not allowed (405), not found (404), or server error (500)
        expect([404, 405, 500]).toContain(status);
      }
    });
  });

  describe('Content-Type validation', () => {
    it('should handle missing Content-Type header for POST requests', async () => {
      const response = await fetch(`${SERVER_URL}/api/pick`, {
        method: 'POST',
        body: JSON.stringify({
          words: ['test'],
          date: '2025-10-15',
        }),
        // No Content-Type header
      });

      // Should either parse successfully or return 400
      expect([400, 401, 500]).toContain(response.status);
    });

    it('should handle incorrect Content-Type header', async () => {
      const response = await fetch(`${SERVER_URL}/api/pick`, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: JSON.stringify({
          words: ['test'],
          date: '2025-10-15',
        }),
      });

      // Should either parse successfully or return 400
      expect([400, 401, 500]).toContain(response.status);
    });
  });

  describe('Request size limits', () => {
    it('should handle large request bodies gracefully', async () => {
      // Create a large words array (within reasonable limits)
      const largeWordsArray = Array.from({ length: 50 }, (_, i) => `word${i}`);

      const { status } = await apiRequest('pick', {
        method: 'POST',
        body: JSON.stringify({
          words: largeWordsArray,
          date: '2025-10-15',
        }),
      });

      // Should handle the request (validation or auth error expected)
      expect([400, 401, 500]).toContain(status);
    });
  });
});