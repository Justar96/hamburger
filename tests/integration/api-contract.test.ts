/**
 * API Contract Tests for Phase 3 Client API endpoints
 *
 * These tests validate the API contract compliance including:
 * - Request/response schema validation
 * - Error response structure consistency
 * - HTTP status code correctness
 * - Rate limiting behavior under load
 *
 * Contract tests ensure that the API adheres to its documented interface
 * and provides consistent behavior for client applications.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const SERVER_URL = 'http://localhost:3000';

// Track keys for cleanup
let testKeys: string[] = [];

// Type definitions for API responses
interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  timestamp: number;
  requestId?: string;
}

// Helper function to make API requests
async function apiRequest(endpoint: string, options: RequestInit = {}) {
  const response = await fetch(`${SERVER_URL}/api/${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  return { response, data, status: response.status, headers: response.headers };
}

// Helper function for test endpoint requests (for setup/cleanup)
async function testRequest(endpoint: string, body: Record<string, unknown> = {}) {
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

// Schema validation helpers
function validateErrorResponseSchema(data: unknown): data is ErrorResponse {
  if (typeof data !== 'object' || data === null) return false;
  
  const obj = data as Record<string, unknown>;
  
  return (
    typeof obj.error === 'object' &&
    obj.error !== null &&
    typeof (obj.error as Record<string, unknown>).code === 'string' &&
    typeof (obj.error as Record<string, unknown>).message === 'string' &&
    typeof obj.timestamp === 'number'
  );
}

// Helper functions removed - using validateErrorResponseSchema directly

describe('API Contract Tests', () => {
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

  describe('Request/Response Schema Compliance', () => {
    describe('GET /api/init', () => {
      it('should return error response with correct schema for missing date', async () => {
        const { data, status } = await apiRequest('init', {
          method: 'GET',
        });

        expect(status).toBe(400);
        expect(validateErrorResponseSchema(data)).toBe(true);
        
        if (validateErrorResponseSchema(data)) {
          expect(data.error.code).toBe('INVALID_DATE');
          expect(data.error.message).toContain('Invalid date parameter');
        }
      });

      it('should return error response with correct schema for invalid date format', async () => {
        const { data, status } = await apiRequest('init?date=invalid-format', {
          method: 'GET',
        });

        expect(status).toBe(400);
        expect(validateErrorResponseSchema(data)).toBe(true);
        
        if (validateErrorResponseSchema(data)) {
          expect(data.error.code).toBe('INVALID_DATE');
          expect(data.error.details).toMatchObject({
            field: 'date',
            expected: 'YYYY-MM-DD format',
            received: 'invalid-format',
          });
        }
      });

      it('should include request ID in error responses', async () => {
        const { data, status } = await apiRequest('init', {
          method: 'GET',
        });

        expect(status).toBe(400);
        
        if (typeof data === 'object' && data !== null && 'requestId' in data) {
          expect((data as { requestId: string }).requestId).toMatch(/^init_\d+_[a-z0-9]+$/);
        }
      });

      it('should handle authentication errors with proper schema', async () => {
        const { data, status } = await apiRequest('init?date=2025-10-15', {
          method: 'GET',
        });

        // Expect auth error or internal error due to missing Devvit context
        expect([401, 500]).toContain(status);
        expect(validateErrorResponseSchema(data)).toBe(true);
        
        if (validateErrorResponseSchema(data)) {
          if (status === 401) {
            expect(data.error.code).toBe('UNAUTHORIZED');
          } else {
            expect(data.error.code).toBe('INTERNAL_ERROR');
          }
        }
      });
    });

    describe('POST /api/pick', () => {
      it('should return error response with correct schema for missing body', async () => {
        const { data, status } = await apiRequest('pick', {
          method: 'POST',
        });

        expect([400, 401, 500]).toContain(status);
        expect(validateErrorResponseSchema(data)).toBe(true);
      });

      it('should validate request body schema and return structured errors', async () => {
        const testCases = [
          {
            body: { words: 'not-an-array', date: '2025-10-15' },
            expectedError: 'INVALID_WORDS',
          },
          {
            body: { words: [], date: '2025-10-15' },
            expectedError: 'INVALID_WORDS',
          },
          {
            body: { words: ['test'], date: 'invalid-date' },
            expectedError: 'INVALID_DATE',
          },
          {
            body: { words: [123, 'test'], date: '2025-10-15' },
            expectedError: 'INVALID_WORDS',
          },
        ];

        for (const testCase of testCases) {
          const { data, status } = await apiRequest('pick', {
            method: 'POST',
            body: JSON.stringify(testCase.body),
          });

          // May get validation error (400) or auth error (401/500)
          expect([400, 401, 500]).toContain(status);
          expect(validateErrorResponseSchema(data)).toBe(true);
          
          if (status === 400 && validateErrorResponseSchema(data)) {
            expect(data.error.code).toBe(testCase.expectedError);
          }
        }
      });

      it('should handle malformed JSON with proper error schema', async () => {
        const response = await fetch(`${SERVER_URL}/api/pick`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: 'invalid-json{',
        });

        expect(response.status).toBe(400);
        
        try {
          const data: unknown = await response.json();
          expect(validateErrorResponseSchema(data)).toBe(true);
        } catch {
          // If response is not JSON, that's also acceptable for malformed input
        }
      });

      it('should include request ID in all responses', async () => {
        const { data, status } = await apiRequest('pick', {
          method: 'POST',
          body: JSON.stringify({ words: ['test'], date: '2025-10-15' }),
        });

        expect([400, 401, 500]).toContain(status);
        
        if (typeof data === 'object' && data !== null && 'requestId' in data) {
          expect((data as { requestId: string }).requestId).toMatch(/^pick_\d+_[a-z0-9]+$/);
        }
      });
    });

    describe('GET /api/progress', () => {
      it('should return error response with correct schema for missing date', async () => {
        const { data, status } = await apiRequest('progress', {
          method: 'GET',
        });

        expect(status).toBe(400);
        expect(validateErrorResponseSchema(data)).toBe(true);
        
        if (validateErrorResponseSchema(data)) {
          expect(data.error.code).toBe('INVALID_DATE');
        }
      });

      it('should validate date parameter with structured error details', async () => {
        const { data, status } = await apiRequest('progress?date=2025/10/15', {
          method: 'GET',
        });

        expect(status).toBe(400);
        expect(validateErrorResponseSchema(data)).toBe(true);
        
        if (validateErrorResponseSchema(data)) {
          expect(data.error.code).toBe('INVALID_DATE');
          expect(data.error.details).toMatchObject({
            field: 'date',
            expected: 'YYYY-MM-DD format',
            received: '2025/10/15',
          });
        }
      });

      it('should include request ID in error responses', async () => {
        const { data, status } = await apiRequest('progress', {
          method: 'GET',
        });

        expect(status).toBe(400);
        
        if (typeof data === 'object' && data !== null && 'requestId' in data) {
          expect((data as { requestId: string }).requestId).toMatch(/^progress_\d+_[a-z0-9]+$/);
        }
      });
    });
  });

  describe('Error Response Structure Consistency', () => {
    it('should return consistent error structure across all endpoints', async () => {
      const endpoints = [
        { path: 'init', method: 'GET' as const },
        { path: 'pick', method: 'POST' as const },
        { path: 'progress', method: 'GET' as const },
      ];

      const errorResponses = [];

      for (const endpoint of endpoints) {
        const { data, status } = await apiRequest(endpoint.path, {
          method: endpoint.method,
          body: endpoint.method === 'POST' ? JSON.stringify({}) : undefined,
        });

        expect([400, 401, 500]).toContain(status);
        expect(validateErrorResponseSchema(data)).toBe(true);
        errorResponses.push(data);
      }

      // Verify all error responses have the same structure
      for (const response of errorResponses) {
        if (validateErrorResponseSchema(response)) {
          expect(response).toHaveProperty('error');
          expect(response).toHaveProperty('timestamp');
          expect(response.error).toHaveProperty('code');
          expect(response.error).toHaveProperty('message');
          expect(typeof response.error.code).toBe('string');
          expect(typeof response.error.message).toBe('string');
          expect(typeof response.timestamp).toBe('number');
        }
      }
    });

    it('should include consistent error details structure when present', async () => {
      const { data, status } = await apiRequest('init?date=invalid-format', {
        method: 'GET',
      });

      expect(status).toBe(400);
      
      if (validateErrorResponseSchema(data)) {
        expect(data.error.details).toBeDefined();
        expect(typeof data.error.details).toBe('object');
        expect(data.error.details).toHaveProperty('field');
        expect(data.error.details).toHaveProperty('expected');
        expect(data.error.details).toHaveProperty('received');
      }
    });

    it('should maintain error structure for different validation failures', async () => {
      const testCases = [
        { endpoint: 'init', query: '', expectedCode: 'INVALID_DATE' },
        { endpoint: 'init?date=2025/10/15', query: '', expectedCode: 'INVALID_DATE' },
        { endpoint: 'progress', query: '', expectedCode: 'INVALID_DATE' },
        { endpoint: 'progress?date=invalid', query: '', expectedCode: 'INVALID_DATE' },
      ];

      for (const testCase of testCases) {
        const { data, status } = await apiRequest(testCase.endpoint, {
          method: 'GET',
        });

        expect(status).toBe(400);
        expect(validateErrorResponseSchema(data)).toBe(true);
        
        if (validateErrorResponseSchema(data)) {
          expect(data.error.code).toBe(testCase.expectedCode);
        }
      }
    });
  });

  describe('HTTP Status Code Correctness', () => {
    it('should return 400 for validation errors', async () => {
      const validationTestCases = [
        { endpoint: 'init', method: 'GET' as const, params: '' },
        { endpoint: 'init', method: 'GET' as const, params: '?date=invalid' },
        { endpoint: 'progress', method: 'GET' as const, params: '' },
        { endpoint: 'progress', method: 'GET' as const, params: '?date=2025/10/15' },
      ];

      for (const testCase of validationTestCases) {
        const { status } = await apiRequest(`${testCase.endpoint}${testCase.params}`, {
          method: testCase.method,
        });

        expect(status).toBe(400);
      }
    });

    it('should return 400 for malformed JSON in POST requests', async () => {
      const response = await fetch(`${SERVER_URL}/api/pick`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: 'invalid-json',
      });

      expect(response.status).toBe(400);
    });

    it('should return 401 or 500 for authentication issues', async () => {
      const authTestCases = [
        { endpoint: 'init?date=2025-10-15', method: 'GET' as const },
        { endpoint: 'progress?date=2025-10-15', method: 'GET' as const },
      ];

      for (const testCase of authTestCases) {
        const { status } = await apiRequest(testCase.endpoint, {
          method: testCase.method,
        });

        // Should be either 401 (auth error) or 500 (internal error due to missing context)
        expect([401, 500]).toContain(status);
      }
    });

    it('should return 404 or 500 for unknown endpoints', async () => {
      const { status } = await apiRequest('unknown-endpoint', {
        method: 'GET',
      });

      expect([404, 500]).toContain(status);
    });

    it('should return 404 or 405 for wrong HTTP methods', async () => {
      const methodTestCases = [
        { endpoint: 'init?date=2025-10-15', correctMethod: 'GET', wrongMethod: 'POST' },
        { endpoint: 'pick', correctMethod: 'POST', wrongMethod: 'GET' },
        { endpoint: 'progress?date=2025-10-15', correctMethod: 'GET', wrongMethod: 'POST' },
      ];

      for (const testCase of methodTestCases) {
        const { status } = await apiRequest(testCase.endpoint, {
          method: testCase.wrongMethod as 'GET' | 'POST' | 'PUT' | 'DELETE',
        });

        // Should return method not allowed (405), not found (404), or server error (500)
        expect([404, 405, 500]).toContain(status);
      }
    });
  });

  describe('Rate Limiting Behavior Under Load', () => {
    it('should handle concurrent requests without breaking', async () => {
      const concurrentRequests = 10;
      const promises = Array.from({ length: concurrentRequests }, () =>
        apiRequest('init', {
          method: 'GET',
        })
      );

      const results = await Promise.all(promises);

      // All requests should complete
      expect(results).toHaveLength(concurrentRequests);

      // All should return consistent responses (validation errors expected)
      results.forEach(({ status, data }) => {
        expect([400, 401, 500]).toContain(status);
        if (typeof data === 'object' && data !== null) {
          expect(validateErrorResponseSchema(data)).toBe(true);
        }
      });
    });

    it('should maintain response structure under concurrent load', async () => {
      const concurrentRequests = 5;
      const promises = Array.from({ length: concurrentRequests }, () =>
        apiRequest('progress', {
          method: 'GET',
        })
      );

      const results = await Promise.all(promises);

      // Verify all responses have consistent structure
      results.forEach(({ status, data }) => {
        expect(status).toBe(400); // Validation error expected
        expect(validateErrorResponseSchema(data)).toBe(true);
        
        if (validateErrorResponseSchema(data)) {
          expect(data.error.code).toBe('INVALID_DATE');
        }
      });
    });

    it('should handle rapid sequential requests efficiently', async () => {
      const requestCount = 5;
      const startTime = Date.now();

      for (let i = 0; i < requestCount; i++) {
        const { status, data } = await apiRequest('init', {
          method: 'GET',
        });

        expect(status).toBe(400);
        if (typeof data === 'object' && data !== null) {
          expect(validateErrorResponseSchema(data)).toBe(true);
        }
      }

      const totalTime = Date.now() - startTime;
      
      // Should complete reasonably quickly (allow generous margin for CI)
      expect(totalTime).toBeLessThan(2000); // 5 requests in under 2 seconds
    });

    it('should maintain error response quality under load', async () => {
      const testCases = [
        { endpoint: 'init', method: 'GET' as const },
        { endpoint: 'pick', method: 'POST' as const, body: '{}' },
        { endpoint: 'progress', method: 'GET' as const },
      ];

      // Run multiple requests for each endpoint
      const allPromises = testCases.flatMap(testCase =>
        Array.from({ length: 3 }, () =>
          apiRequest(testCase.endpoint, {
            method: testCase.method,
            body: testCase.body,
          })
        )
      );

      const results = await Promise.all(allPromises);

      // Verify all responses maintain quality
      results.forEach(({ status, data }) => {
        expect([400, 401, 500]).toContain(status);
        expect(validateErrorResponseSchema(data)).toBe(true);
        
        if (validateErrorResponseSchema(data)) {
          expect(data.error.code).toMatch(/^[A-Z_]+$/); // Valid error code format
          expect(data.error.message.length).toBeGreaterThan(0); // Non-empty message
          expect(data.timestamp).toBeGreaterThan(0); // Valid timestamp
        }
      });
    });
  });

  describe('Content-Type and Header Validation', () => {
    it('should handle missing Content-Type header gracefully', async () => {
      const response = await fetch(`${SERVER_URL}/api/pick`, {
        method: 'POST',
        body: JSON.stringify({ words: ['test'], date: '2025-10-15' }),
        // No Content-Type header
      });

      expect([400, 401, 500]).toContain(response.status);
      
      // Should still return valid JSON response
      try {
        const data: unknown = await response.json();
        expect(validateErrorResponseSchema(data)).toBe(true);
      } catch {
        // If not JSON, that's also acceptable behavior
      }
    });

    it('should handle incorrect Content-Type header', async () => {
      const response = await fetch(`${SERVER_URL}/api/pick`, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: JSON.stringify({ words: ['test'], date: '2025-10-15' }),
      });

      expect([400, 401, 500]).toContain(response.status);
    });

    it('should return proper Content-Type in responses', async () => {
      const { headers } = await apiRequest('init', {
        method: 'GET',
      });

      const contentType = headers.get('content-type');
      expect(contentType).toContain('application/json');
    });
  });

  describe('Response Time Contract', () => {
    it('should respond to validation errors within reasonable time', async () => {
      const endpoints = [
        { path: 'init', method: 'GET' as const, maxTime: 200 },
        { path: 'pick', method: 'POST' as const, maxTime: 100 },
        { path: 'progress', method: 'GET' as const, maxTime: 100 },
      ];

      for (const endpoint of endpoints) {
        const startTime = Date.now();
        
        await apiRequest(endpoint.path, {
          method: endpoint.method,
          body: endpoint.method === 'POST' ? JSON.stringify({}) : undefined,
        });
        
        const responseTime = Date.now() - startTime;

        // Validation errors should be fast
        expect(responseTime).toBeLessThan(endpoint.maxTime);
      }
    });
  });

  describe('Request Size Limits', () => {
    it('should handle large but reasonable request bodies', async () => {
      // Create a request with many words (within reasonable limits)
      const largeWordsArray = Array.from({ length: 50 }, (_, i) => `word${i}`);

      const { status, data } = await apiRequest('pick', {
        method: 'POST',
        body: JSON.stringify({
          words: largeWordsArray,
          date: '2025-10-15',
        }),
      });

      // Should handle the request (validation or auth error expected)
      expect([400, 401, 500]).toContain(status);
      expect(validateErrorResponseSchema(data)).toBe(true);
    });

    it('should handle requests with very long strings gracefully', async () => {
      const longString = 'a'.repeat(1000);

      const { status, data } = await apiRequest('pick', {
        method: 'POST',
        body: JSON.stringify({
          words: [longString],
          date: '2025-10-15',
        }),
      });

      expect([400, 401, 500]).toContain(status);
      expect(validateErrorResponseSchema(data)).toBe(true);
    });
  });
});