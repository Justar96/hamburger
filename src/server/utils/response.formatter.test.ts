/**
 * Unit tests for response formatter utility.
 *
 * Tests comprehensive response formatting functionality including:
 * - Success response structure consistency
 * - Error response formatting with various error codes
 * - HTTP status code mapping correctness
 * - Response timestamp and request tracing
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  formatSuccessResponse,
  formatErrorResponse,
  getHttpStatusForError,
  APIErrorCode,
  type APIError,
} from './response.formatter.js';

describe('Response Formatter', () => {
  beforeEach(() => {
    // Reset any mocked timers
    vi.useRealTimers();
  });

  describe('formatSuccessResponse', () => {
    it('should format success response with data and timestamp', () => {
      const testData = { message: 'test', count: 42 };
      const response = formatSuccessResponse(testData);

      expect(response).toMatchObject({
        ...testData,
        timestamp: expect.any(Number),
      });
      expect(response.timestamp).toBeGreaterThan(0);
      expect(response.timestamp).toBeLessThanOrEqual(Date.now());
    });

    it('should format success response without data', () => {
      const response = formatSuccessResponse();

      expect(response).toEqual({
        timestamp: expect.any(Number),
      });
      expect(response.timestamp).toBeGreaterThan(0);
    });

    it('should format success response with null data', () => {
      const response = formatSuccessResponse(null);

      expect(response).toEqual({
        timestamp: expect.any(Number),
      });
      expect(response.timestamp).toBeGreaterThan(0);
    });

    it('should format success response with undefined data', () => {
      const response = formatSuccessResponse(undefined);

      expect(response).toEqual({
        timestamp: expect.any(Number),
      });
      expect(response.timestamp).toBeGreaterThan(0);
    });

    it('should format success response with complex nested data', () => {
      const complexData = {
        seedPreview: '8d23abc1',
        myWords: ['neon', 'rain', 'alley'],
        progress: {
          top: [
            { word: 'neon', count: 42 },
            { word: 'rain', count: 38 },
          ],
          totalVotes: 156,
          uniqueVoters: 89,
        },
        timeLeftSec: 43200,
      };

      const response = formatSuccessResponse(complexData);

      expect(response).toMatchObject({
        ...complexData,
        timestamp: expect.any(Number),
      });
    });

    it('should use consistent timestamp format', () => {
      const mockTime = 1728950400000; // Fixed timestamp
      vi.setSystemTime(new Date(mockTime));

      const response = formatSuccessResponse({ test: true });

      expect(response.timestamp).toBe(mockTime);
    });
  });

  describe('formatErrorResponse', () => {
    it('should format error response with APIError object', () => {
      const apiError: APIError = {
        code: APIErrorCode.INVALID_DATE,
        message: 'Date must be in YYYY-MM-DD format',
        details: {
          field: 'date',
          expected: 'YYYY-MM-DD format',
          received: '2025/10/15',
        },
      };

      const response = formatErrorResponse(apiError);

      expect(response).toEqual({
        error: apiError,
        timestamp: expect.any(Number),
      });
      expect(response.timestamp).toBeGreaterThan(0);
    });

    it('should format error response with string error', () => {
      const errorMessage = 'Something went wrong';
      const response = formatErrorResponse(errorMessage);

      expect(response).toEqual({
        error: {
          code: APIErrorCode.INTERNAL_ERROR,
          message: errorMessage,
        },
        timestamp: expect.any(Number),
      });
    });

    it('should format error response with Error object', () => {
      const error = new Error('Database connection failed');
      const response = formatErrorResponse(error);

      expect(response).toEqual({
        error: {
          code: APIErrorCode.INTERNAL_ERROR,
          message: 'Database connection failed',
        },
        timestamp: expect.any(Number),
      });
    });

    it('should format error response with custom error code for string', () => {
      const errorMessage = 'Rate limit exceeded';
      const response = formatErrorResponse(
        errorMessage,
        APIErrorCode.RATE_LIMITED
      );

      expect(response).toEqual({
        error: {
          code: APIErrorCode.RATE_LIMITED,
          message: errorMessage,
        },
        timestamp: expect.any(Number),
      });
    });

    it('should format error response with request ID', () => {
      const apiError: APIError = {
        code: APIErrorCode.UNAUTHORIZED,
        message: 'User context not found',
      };
      const requestId = 'req_123456789';

      const response = formatErrorResponse(apiError, undefined, requestId);

      expect(response).toEqual({
        error: apiError,
        timestamp: expect.any(Number),
        requestId,
      });
    });

    it('should handle unknown error types gracefully', () => {
      const unknownError = { someProperty: 'value' };
      const response = formatErrorResponse(unknownError as any);

      expect(response).toEqual({
        error: {
          code: APIErrorCode.INTERNAL_ERROR,
          message: 'An unexpected error occurred',
        },
        timestamp: expect.any(Number),
      });
    });

    it('should preserve all error details', () => {
      const detailedError: APIError = {
        code: APIErrorCode.WORD_COUNT_EXCEEDED,
        message: 'Too many words submitted',
        details: {
          field: 'words',
          maxAllowed: 100,
          received: 150,
          invalidWords: ['word1', 'word2'],
        },
      };

      const response = formatErrorResponse(detailedError);

      expect(response.error).toEqual(detailedError);
      expect(response.error.details).toEqual(detailedError.details);
    });
  });

  describe('getHttpStatusForError', () => {
    it('should return 400 for validation errors', () => {
      expect(getHttpStatusForError(APIErrorCode.INVALID_DATE)).toBe(400);
      expect(getHttpStatusForError(APIErrorCode.INVALID_WORDS)).toBe(400);
      expect(getHttpStatusForError(APIErrorCode.WORD_COUNT_EXCEEDED)).toBe(400);
      expect(getHttpStatusForError(APIErrorCode.MISSING_PARAMETER)).toBe(400);
      expect(getHttpStatusForError(APIErrorCode.INVALID_TYPE)).toBe(400);
    });

    it('should return 401 for authentication errors', () => {
      expect(getHttpStatusForError(APIErrorCode.UNAUTHORIZED)).toBe(401);
    });

    it('should return 429 for rate limiting errors', () => {
      expect(getHttpStatusForError(APIErrorCode.RATE_LIMITED)).toBe(429);
    });

    it('should return 500 for internal errors', () => {
      expect(getHttpStatusForError(APIErrorCode.INTERNAL_ERROR)).toBe(500);
    });

    it('should return 500 for unknown error codes', () => {
      expect(getHttpStatusForError('UNKNOWN_ERROR' as APIErrorCode)).toBe(500);
    });

    it('should handle all defined error codes', () => {
      // Test all error codes from validation module
      const validationCodes = [
        APIErrorCode.INVALID_DATE,
        APIErrorCode.INVALID_WORDS,
        APIErrorCode.WORD_COUNT_EXCEEDED,
        APIErrorCode.MISSING_PARAMETER,
        APIErrorCode.INVALID_TYPE,
      ];

      validationCodes.forEach(code => {
        expect(getHttpStatusForError(code)).toBe(400);
      });

      // Test additional API error codes
      expect(getHttpStatusForError(APIErrorCode.UNAUTHORIZED)).toBe(401);
      expect(getHttpStatusForError(APIErrorCode.RATE_LIMITED)).toBe(429);
      expect(getHttpStatusForError(APIErrorCode.INTERNAL_ERROR)).toBe(500);
    });
  });

  describe('Response structure consistency', () => {
    it('should ensure success responses never have error field', () => {
      const response = formatSuccessResponse({ data: 'test' });

      expect(response).not.toHaveProperty('error');
      expect(response).toHaveProperty('timestamp');
    });

    it('should ensure error responses never have data fields mixed with error', () => {
      const response = formatErrorResponse('Test error');

      expect(response).toHaveProperty('error');
      expect(response).toHaveProperty('timestamp');
      expect(response).not.toHaveProperty('data');
      expect(response).not.toHaveProperty('success');
    });

    it('should maintain consistent timestamp format across response types', () => {
      const mockTime = 1728950400000;
      vi.setSystemTime(new Date(mockTime));

      const successResponse = formatSuccessResponse({ test: true });
      const errorResponse = formatErrorResponse('Test error');

      expect(successResponse.timestamp).toBe(mockTime);
      expect(errorResponse.timestamp).toBe(mockTime);
      expect(typeof successResponse.timestamp).toBe('number');
      expect(typeof errorResponse.timestamp).toBe('number');
    });
  });

  describe('Type safety and interfaces', () => {
    it('should properly type success response data', () => {
      interface TestData extends Record<string, unknown> {
        message: string;
        count: number;
      }

      const testData: TestData = { message: 'test', count: 42 };
      const response = formatSuccessResponse(testData);

      // TypeScript should infer the correct type
      expect(response.message).toBe('test');
      expect(response.count).toBe(42);
      expect(response.timestamp).toBeTypeOf('number');
    });

    it('should properly type error response structure', () => {
      const response = formatErrorResponse('Test error');

      expect(response.error).toHaveProperty('code');
      expect(response.error).toHaveProperty('message');
      expect(response.error.code).toBeTypeOf('string');
      expect(response.error.message).toBeTypeOf('string');
    });

    it('should handle optional request ID in error responses', () => {
      const responseWithoutId = formatErrorResponse('Test error');
      const responseWithId = formatErrorResponse(
        'Test error',
        undefined,
        'req_123'
      );

      expect(responseWithoutId).not.toHaveProperty('requestId');
      expect(responseWithId).toHaveProperty('requestId');
      expect(responseWithId.requestId).toBe('req_123');
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle empty string errors', () => {
      const response = formatErrorResponse('');

      expect(response.error.code).toBe(APIErrorCode.INTERNAL_ERROR);
      expect(response.error.message).toBe('An unexpected error occurred');
    });

    it('should handle null and undefined errors', () => {
      const nullResponse = formatErrorResponse(null as any);
      const undefinedResponse = formatErrorResponse(undefined as any);

      expect(nullResponse.error.code).toBe(APIErrorCode.INTERNAL_ERROR);
      expect(undefinedResponse.error.code).toBe(APIErrorCode.INTERNAL_ERROR);
    });

    it('should handle Error objects with empty messages', () => {
      const error = new Error('');
      const response = formatErrorResponse(error);

      expect(response.error.code).toBe(APIErrorCode.INTERNAL_ERROR);
      expect(response.error.message).toBe('An unexpected error occurred');
    });

    it('should preserve error details even for converted errors', () => {
      const error = new Error('Database error');
      error.stack = 'Error: Database error\n    at test.js:1:1';

      const response = formatErrorResponse(error);

      expect(response.error.code).toBe(APIErrorCode.INTERNAL_ERROR);
      expect(response.error.message).toBe('Database error');
      // Stack trace should not be included in API response for security
      expect(response.error).not.toHaveProperty('stack');
    });
  });

  describe('Performance and memory considerations', () => {
    it('should not modify original data objects', () => {
      const originalData = { message: 'test', nested: { value: 42 } };
      const dataCopy = JSON.parse(JSON.stringify(originalData));

      formatSuccessResponse(originalData);

      expect(originalData).toEqual(dataCopy);
    });

    it('should handle large data objects efficiently', () => {
      const largeData = {
        words: Array.from({ length: 1000 }, (_, i) => `word${i}`),
        metadata: {
          generated: Date.now(),
          version: '1.0.0',
        },
      };

      const response = formatSuccessResponse(largeData);

      expect(response.words).toHaveLength(1000);
      expect(response.metadata).toEqual(largeData.metadata);
      expect(response.timestamp).toBeTypeOf('number');
    });
  });
});
