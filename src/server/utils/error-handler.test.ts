/**
 * Unit tests for comprehensive error handling utilities.
 *
 * Tests cover:
 * - Error classification (4xx vs 5xx)
 * - Error context extraction
 * - Structured error logging
 * - Service failure handling
 * - Privacy protection (no raw user IDs)
 * - Request ID tracing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request } from 'express';
import {
  classifyError,
  extractErrorContext,
  logError,
  handleServiceFailure,
  isHashedUserId,
  sanitizeErrorDetails,
  ErrorClass,
} from './error-handler';
import { APIErrorCode } from './response.formatter';

describe('Error Handler', () => {
  describe('classifyError', () => {
    it('should classify validation errors as CLIENT_ERROR', () => {
      expect(classifyError(APIErrorCode.INVALID_DATE)).toBe(
        ErrorClass.CLIENT_ERROR
      );
      expect(classifyError(APIErrorCode.INVALID_WORDS)).toBe(
        ErrorClass.CLIENT_ERROR
      );
      expect(classifyError(APIErrorCode.WORD_COUNT_EXCEEDED)).toBe(
        ErrorClass.CLIENT_ERROR
      );
    });

    it('should classify authentication errors as CLIENT_ERROR', () => {
      expect(classifyError(APIErrorCode.UNAUTHORIZED)).toBe(
        ErrorClass.CLIENT_ERROR
      );
    });

    it('should classify rate limiting as CLIENT_ERROR', () => {
      expect(classifyError(APIErrorCode.RATE_LIMITED)).toBe(
        ErrorClass.CLIENT_ERROR
      );
    });

    it('should classify internal errors as SERVER_ERROR', () => {
      expect(classifyError(APIErrorCode.INTERNAL_ERROR)).toBe(
        ErrorClass.SERVER_ERROR
      );
    });

    it('should classify service unavailable as SERVER_ERROR', () => {
      expect(classifyError(APIErrorCode.SERVICE_UNAVAILABLE)).toBe(
        ErrorClass.SERVER_ERROR
      );
    });
  });

  describe('extractErrorContext', () => {
    it('should extract basic request context', () => {
      const req = {
        method: 'GET',
        path: '/api/init',
        query: { date: '2025-10-15' },
      } as unknown as Request;

      const context = extractErrorContext(req, 'req123');

      expect(context.requestId).toBe('req123');
      expect(context.method).toBe('GET');
      expect(context.path).toBe('/api/init');
      expect(context.date).toBe('2025-10-15');
      expect(context.timestamp).toBeDefined();
    });

    it('should include userHash when provided', () => {
      const req = {
        method: 'POST',
        path: '/api/pick',
        query: {},
        body: { date: '2025-10-15' },
      } as unknown as Request;

      const userHash = 'a'.repeat(64); // Valid hashed user ID
      const context = extractErrorContext(req, 'req123', userHash, 'pick');

      expect(context.userHash).toBe(userHash);
      expect(context.operation).toBe('pick');
    });

    it('should extract date from query or body', () => {
      const reqWithQuery = {
        method: 'GET',
        path: '/api/progress',
        query: { date: '2025-10-15' },
        body: {},
      } as unknown as Request;

      const contextQuery = extractErrorContext(reqWithQuery, 'req123');
      expect(contextQuery.date).toBe('2025-10-15');

      const reqWithBody = {
        method: 'POST',
        path: '/api/pick',
        query: {},
        body: { date: '2025-10-16' },
      } as unknown as Request;

      const contextBody = extractErrorContext(reqWithBody, 'req123');
      expect(contextBody.date).toBe('2025-10-16');
    });

    it('should include metadata when provided', () => {
      const req = {
        method: 'POST',
        path: '/api/pick',
        query: {},
        body: {},
      } as unknown as Request;

      const metadata = { wordCount: 5, attempt: 2 };
      const context = extractErrorContext(
        req,
        'req123',
        undefined,
        'pick',
        metadata
      );

      expect(context.metadata).toEqual(metadata);
    });
  });

  describe('logError', () => {
    beforeEach(() => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('should log client errors at info level', () => {
      const error = new Error('Invalid date format');
      const context = {
        requestId: 'req123',
        method: 'GET',
        path: '/api/init',
        timestamp: new Date().toISOString(),
      };

      logError(error, context, APIErrorCode.INVALID_DATE);

      expect(console.log).toHaveBeenCalledWith(
        '[CLIENT_ERROR]',
        expect.stringContaining('Invalid date format')
      );
      expect(console.error).not.toHaveBeenCalled();
    });

    it('should log server errors at error level with stack trace', () => {
      const error = new Error('Redis connection failed');
      const context = {
        requestId: 'req123',
        method: 'POST',
        path: '/api/pick',
        timestamp: new Date().toISOString(),
      };

      logError(error, context, APIErrorCode.INTERNAL_ERROR);

      expect(console.error).toHaveBeenCalledWith(
        '[SERVER_ERROR]',
        expect.stringContaining('Redis connection failed')
      );
      expect(console.error).toHaveBeenCalledWith(
        '[SERVER_ERROR]',
        expect.stringContaining('stack')
      );
    });

    it('should handle string errors', () => {
      const context = {
        requestId: 'req123',
        method: 'GET',
        path: '/api/progress',
        timestamp: new Date().toISOString(),
      };

      logError('Something went wrong', context, APIErrorCode.INTERNAL_ERROR);

      expect(console.error).toHaveBeenCalledWith(
        '[SERVER_ERROR]',
        expect.stringContaining('Something went wrong')
      );
    });

    it('should include error context in log output', () => {
      const error = new Error('Test error');
      const context = {
        requestId: 'req123',
        method: 'POST',
        path: '/api/pick',
        userHash: 'a'.repeat(64),
        date: '2025-10-15',
        operation: 'pick',
        timestamp: new Date().toISOString(),
      };

      logError(error, context, APIErrorCode.INTERNAL_ERROR);

      const logCall = (console.error as any).mock.calls[0][1] as string;
      expect(logCall).toContain('req123');
      expect(logCall).toContain('POST');
      expect(logCall).toContain('/api/pick');
      expect(logCall).toContain('2025-10-15');
    });
  });

  describe('handleServiceFailure', () => {
    beforeEach(() => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('should return APIError for critical service failures', () => {
      const error = new Error('Redis connection timeout');
      const context = {
        requestId: 'req123',
        method: 'POST',
        path: '/api/pick',
        timestamp: new Date().toISOString(),
      };

      const apiError = handleServiceFailure(
        error,
        'DataService',
        context,
        true
      );

      expect(apiError).toBeDefined();
      expect(apiError?.code).toBe(APIErrorCode.SERVICE_UNAVAILABLE);
      expect(apiError?.message).toContain('DataService');
      expect(console.error).toHaveBeenCalledWith(
        '[SERVICE_FAILURE]',
        expect.stringContaining('DataService')
      );
    });

    it('should return null for non-critical service failures', () => {
      const error = new Error('Telemetry write failed');
      const context = {
        requestId: 'req123',
        method: 'GET',
        path: '/api/init',
        timestamp: new Date().toISOString(),
      };

      const apiError = handleServiceFailure(
        error,
        'TelemetryService',
        context,
        false
      );

      expect(apiError).toBeNull();
      expect(console.log).toHaveBeenCalledWith(
        '[SERVICE_DEGRADATION]',
        expect.stringContaining('TelemetryService')
      );
    });

    it('should include service name and context in error details', () => {
      const error = new Error('Service error');
      const context = {
        requestId: 'req123',
        method: 'POST',
        path: '/api/pick',
        userHash: 'a'.repeat(64),
        timestamp: new Date().toISOString(),
      };

      const apiError = handleServiceFailure(
        error,
        'SeedingService',
        context,
        true
      );

      expect(apiError?.details?.service).toBe('SeedingService');
      expect(apiError?.details?.requestId).toBe('req123');
    });
  });

  describe('isHashedUserId', () => {
    it('should return true for valid hashed user IDs', () => {
      const validHash = 'a'.repeat(64); // 64-character hex string
      expect(isHashedUserId(validHash)).toBe(true);

      const validHash2 =
        '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      expect(isHashedUserId(validHash2)).toBe(true);
    });

    it('should return false for invalid hashed user IDs', () => {
      expect(isHashedUserId('short')).toBe(false);
      expect(isHashedUserId('a'.repeat(63))).toBe(false); // Too short
      expect(isHashedUserId('a'.repeat(65))).toBe(false); // Too long
      expect(isHashedUserId('g'.repeat(64))).toBe(false); // Invalid hex character
      expect(isHashedUserId('user123')).toBe(false); // Raw user ID
    });
  });

  describe('sanitizeErrorDetails', () => {
    it('should redact sensitive keys', () => {
      const details = {
        field: 'date',
        password: 'secret123',
        token: 'abc123',
        apiKey: 'key123',
        normalField: 'value',
      };

      const sanitized = sanitizeErrorDetails(details);

      expect(sanitized.field).toBe('date');
      expect(sanitized.normalField).toBe('value');
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.token).toBe('[REDACTED]');
      expect(sanitized.apiKey).toBe('[REDACTED]');
    });

    it('should validate user IDs are hashed', () => {
      const details = {
        userId: 'user123', // Raw user ID
        field: 'test',
      };

      const sanitized = sanitizeErrorDetails(details);

      expect(sanitized.userId).toBe('[INVALID_USER_ID_FORMAT]');
      expect(sanitized.field).toBe('test');
    });

    it('should allow valid hashed user IDs', () => {
      const validHash = 'a'.repeat(64);
      const details = {
        userId: validHash,
        field: 'test',
      };

      const sanitized = sanitizeErrorDetails(details);

      expect(sanitized.userId).toBe(validHash);
    });

    it('should handle nested sensitive keys', () => {
      const details = {
        authorization: 'Bearer token123',
        cookie: 'session=abc',
        data: { value: 'test' },
      };

      const sanitized = sanitizeErrorDetails(details);

      expect(sanitized.authorization).toBe('[REDACTED]');
      expect(sanitized.cookie).toBe('[REDACTED]');
      expect(sanitized.data).toEqual({ value: 'test' });
    });
  });
});
