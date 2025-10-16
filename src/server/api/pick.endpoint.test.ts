/**
 * Unit tests for /api/pick endpoint
 *
 * Tests the pick endpoint functionality including:
 * - User authentication validation
 * - Rate limiting enforcement
 * - Input validation (date and words)
 * - Word verification against user's generated set
 * - Duplicate submission handling (idempotency)
 * - Atomic storage operations
 * - Error handling and response formatting
 *
 * Uses mocked services to isolate endpoint logic and ensure fast test execution.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { handlePick } from './pick.endpoint';
import { APIErrorCode } from '../utils/response.formatter';

// Mock Devvit context
vi.mock('@devvit/server', () => ({
  context: {
    userId: 'test-user-123',
  },
}));

// Create mock services
const mockSeedingService = {
  generateUserWords: vi.fn(),
};

const mockDataService = {
  getUserChoices: vi.fn(),
  setUserChoices: vi.fn(),
  incrementTallies: vi.fn(),
  getTopWords: vi.fn(),
};

const mockIdentityService = {
  hashUserId: vi.fn(),
};

const mockTelemetryService = {
  recordLatency: vi.fn(),
  incrementCounter: vi.fn(),
};

const mockRateLimitService = {
  checkRateLimit: vi.fn(),
};

// Mock request and response objects
function createMockRequest(body: any): Partial<Request> {
  return {
    body,
  };
}

function createMockResponse(): Partial<Response> {
  const res = {
    json: vi.fn(),
    status: vi.fn(),
    set: vi.fn(),
  };

  // Chain status method
  res.status.mockReturnValue(res);

  return res;
}

describe('handlePick', () => {
  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Set up default mock implementations
    mockIdentityService.hashUserId.mockReturnValue('hashed-user-123');
    mockRateLimitService.checkRateLimit.mockResolvedValue({ allowed: true });
    mockSeedingService.generateUserWords.mockResolvedValue([
      'neon',
      'rain',
      'alley',
      'glowing',
      'mysterious',
      'wet',
      'chrome',
      'shadow',
      'electric',
      'dark',
      'bright',
      'cold',
    ]);
    mockDataService.getUserChoices.mockResolvedValue(null);
    mockDataService.setUserChoices.mockResolvedValue(undefined);
    mockDataService.incrementTallies.mockResolvedValue(undefined);
    mockDataService.getTopWords.mockResolvedValue([
      { word: 'neon', count: 42 },
      { word: 'rain', count: 38 },
      { word: 'alley', count: 35 },
    ]);
    mockTelemetryService.recordLatency.mockResolvedValue(undefined);
    mockTelemetryService.incrementCounter.mockResolvedValue(undefined);
  });

  describe('successful word submission', () => {
    it('should accept valid word submission and return updated leaderboard', async () => {
      const req = createMockRequest({
        words: ['neon', 'rain', 'alley'],
        date: '2025-10-15',
      });
      const res = createMockResponse();

      await handlePick(
        req as Request,
        res as Response,
        mockSeedingService as any,
        mockDataService as any,
        mockIdentityService as any,
        mockTelemetryService as any,
        mockRateLimitService as any
      );

      // Verify service calls
      expect(mockIdentityService.hashUserId).toHaveBeenCalledWith(
        'test-user-123'
      );
      expect(mockRateLimitService.checkRateLimit).toHaveBeenCalledWith(
        'hashed-user-123'
      );
      expect(mockSeedingService.generateUserWords).toHaveBeenCalledWith(
        'test-user-123',
        '2025-10-15',
        12
      );
      expect(mockDataService.getUserChoices).toHaveBeenCalledWith(
        '2025-10-15',
        'hashed-user-123'
      );
      expect(mockDataService.setUserChoices).toHaveBeenCalledWith(
        '2025-10-15',
        'hashed-user-123',
        ['neon', 'rain', 'alley']
      );
      expect(mockDataService.incrementTallies).toHaveBeenCalledWith(
        '2025-10-15',
        ['neon', 'rain', 'alley']
      );
      expect(mockDataService.getTopWords).toHaveBeenCalledWith(
        '2025-10-15',
        10
      );

      // Verify response
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          ok: true,
          accepted: ['neon', 'rain', 'alley'],
          top: [
            { word: 'neon', count: 42 },
            { word: 'rain', count: 38 },
            { word: 'alley', count: 35 },
          ],
          timestamp: expect.any(Number),
        })
      );
    });

    it('should handle single word submission', async () => {
      const req = createMockRequest({
        words: ['neon'],
        date: '2025-10-15',
      });
      const res = createMockResponse();

      await handlePick(
        req as Request,
        res as Response,
        mockSeedingService as any,
        mockDataService as any,
        mockIdentityService as any,
        mockTelemetryService as any,
        mockRateLimitService as any
      );

      expect(mockDataService.setUserChoices).toHaveBeenCalledWith(
        '2025-10-15',
        'hashed-user-123',
        ['neon']
      );
      expect(mockDataService.incrementTallies).toHaveBeenCalledWith(
        '2025-10-15',
        ['neon']
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          ok: true,
          accepted: ['neon'],
        })
      );
    });
  });

  describe('rate limiting', () => {
    it('should reject requests when rate limited', async () => {
      mockRateLimitService.checkRateLimit.mockResolvedValue({
        allowed: false,
        retryAfterSeconds: 2,
      });

      const req = createMockRequest({
        words: ['neon', 'rain'],
        date: '2025-10-15',
      });
      const res = createMockResponse();

      await handlePick(
        req as Request,
        res as Response,
        mockSeedingService as any,
        mockDataService as any,
        mockIdentityService as any,
        mockTelemetryService as any,
        mockRateLimitService as any
      );

      // Should set Retry-After header
      expect(res.set).toHaveBeenCalledWith('Retry-After', '2');

      // Should return 429 status
      expect(res.status).toHaveBeenCalledWith(429);

      // Should return rate limit error
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: APIErrorCode.RATE_LIMITED,
            message: 'Too many requests. Please wait before submitting again.',
            details: expect.objectContaining({
              retryAfterSeconds: 2,
            }),
          }),
        })
      );

      // Should not call data services
      expect(mockDataService.setUserChoices).not.toHaveBeenCalled();
      expect(mockDataService.incrementTallies).not.toHaveBeenCalled();
    });
  });

  describe('input validation', () => {
    it('should reject invalid date format', async () => {
      const req = createMockRequest({
        words: ['neon', 'rain'],
        date: '2025/10/15', // Invalid format
      });
      const res = createMockResponse();

      await handlePick(
        req as Request,
        res as Response,
        mockSeedingService as any,
        mockDataService as any,
        mockIdentityService as any,
        mockTelemetryService as any,
        mockRateLimitService as any
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: APIErrorCode.INVALID_DATE,
            message: 'Invalid date parameter',
          }),
        })
      );
    });

    it('should reject empty words array', async () => {
      const req = createMockRequest({
        words: [],
        date: '2025-10-15',
      });
      const res = createMockResponse();

      await handlePick(
        req as Request,
        res as Response,
        mockSeedingService as any,
        mockDataService as any,
        mockIdentityService as any,
        mockTelemetryService as any,
        mockRateLimitService as any
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: APIErrorCode.INVALID_WORDS,
            message: 'Invalid words array',
          }),
        })
      );
    });

    it('should reject non-array words parameter', async () => {
      const req = createMockRequest({
        words: 'neon,rain', // Should be array
        date: '2025-10-15',
      });
      const res = createMockResponse();

      await handlePick(
        req as Request,
        res as Response,
        mockSeedingService as any,
        mockDataService as any,
        mockIdentityService as any,
        mockTelemetryService as any,
        mockRateLimitService as any
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: APIErrorCode.INVALID_WORDS,
          }),
        })
      );
    });

    it('should reject words with non-string elements', async () => {
      const req = createMockRequest({
        words: ['neon', 123, 'rain'], // Contains number
        date: '2025-10-15',
      });
      const res = createMockResponse();

      await handlePick(
        req as Request,
        res as Response,
        mockSeedingService as any,
        mockDataService as any,
        mockIdentityService as any,
        mockTelemetryService as any,
        mockRateLimitService as any
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: APIErrorCode.INVALID_WORDS,
          }),
        })
      );
    });
  });

  describe('word verification', () => {
    it("should reject words not in user's generated word set", async () => {
      const req = createMockRequest({
        words: ['neon', 'invalid-word', 'rain'],
        date: '2025-10-15',
      });
      const res = createMockResponse();

      await handlePick(
        req as Request,
        res as Response,
        mockSeedingService as any,
        mockDataService as any,
        mockIdentityService as any,
        mockTelemetryService as any,
        mockRateLimitService as any
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: APIErrorCode.INVALID_WORDS,
            message: 'One or more words are not from your generated word set',
            details: expect.objectContaining({
              invalidWords: ['invalid-word'],
            }),
          }),
        })
      );

      // Should not store any data
      expect(mockDataService.setUserChoices).not.toHaveBeenCalled();
      expect(mockDataService.incrementTallies).not.toHaveBeenCalled();
    });

    it("should reject all words if none are in user's set", async () => {
      const req = createMockRequest({
        words: ['invalid1', 'invalid2'],
        date: '2025-10-15',
      });
      const res = createMockResponse();

      await handlePick(
        req as Request,
        res as Response,
        mockSeedingService as any,
        mockDataService as any,
        mockIdentityService as any,
        mockTelemetryService as any,
        mockRateLimitService as any
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            details: expect.objectContaining({
              invalidWords: ['invalid1', 'invalid2'],
            }),
          }),
        })
      );
    });
  });

  describe('duplicate submission handling', () => {
    it('should return existing submission for duplicate requests', async () => {
      // Mock existing choices
      mockDataService.getUserChoices.mockResolvedValue(['neon', 'rain']);

      const req = createMockRequest({
        words: ['neon', 'rain', 'alley'], // Different from existing
        date: '2025-10-15',
      });
      const res = createMockResponse();

      await handlePick(
        req as Request,
        res as Response,
        mockSeedingService as any,
        mockDataService as any,
        mockIdentityService as any,
        mockTelemetryService as any,
        mockRateLimitService as any
      );

      // Should return existing choices, not new ones
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          ok: true,
          accepted: ['neon', 'rain'], // Existing choices
        })
      );

      // Should not store new data
      expect(mockDataService.setUserChoices).not.toHaveBeenCalled();
      expect(mockDataService.incrementTallies).not.toHaveBeenCalled();

      // Should record duplicate telemetry
      expect(mockTelemetryService.incrementCounter).toHaveBeenCalledWith(
        '2025-10-15',
        'pick_duplicates'
      );
    });
  });

  describe('authentication', () => {
    it('should reject requests without user context', async () => {
      // Mock missing user context by temporarily changing the mock
      const originalMock = vi.mocked(await import('@devvit/server'));
      originalMock.context.userId = null as any;

      const req = createMockRequest({
        words: ['neon', 'rain'],
        date: '2025-10-15',
      });
      const res = createMockResponse();

      await handlePick(
        req as Request,
        res as Response,
        mockSeedingService as any,
        mockDataService as any,
        mockIdentityService as any,
        mockTelemetryService as any,
        mockRateLimitService as any
      );

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: APIErrorCode.UNAUTHORIZED,
            message: 'User authentication required',
          }),
        })
      );

      // Restore original mock
      originalMock.context.userId = 'test-user-123' as any;
    });
  });

  describe('error handling', () => {
    it('should handle seeding service errors gracefully', async () => {
      mockSeedingService.generateUserWords.mockRejectedValue(
        new Error('Seeding service error')
      );

      const req = createMockRequest({
        words: ['neon', 'rain'],
        date: '2025-10-15',
      });
      const res = createMockResponse();

      await handlePick(
        req as Request,
        res as Response,
        mockSeedingService as any,
        mockDataService as any,
        mockIdentityService as any,
        mockTelemetryService as any,
        mockRateLimitService as any
      );

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: APIErrorCode.INTERNAL_ERROR,
            message: 'Failed to process word selection',
          }),
        })
      );
    });

    it('should handle data service storage errors', async () => {
      mockDataService.setUserChoices.mockRejectedValue(
        new Error('Redis connection failed')
      );

      const req = createMockRequest({
        words: ['neon', 'rain'],
        date: '2025-10-15',
      });
      const res = createMockResponse();

      await handlePick(
        req as Request,
        res as Response,
        mockSeedingService as any,
        mockDataService as any,
        mockIdentityService as any,
        mockTelemetryService as any,
        mockRateLimitService as any
      );

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: APIErrorCode.INTERNAL_ERROR,
            message: 'Failed to store word choices',
          }),
        })
      );
    });

    it('should handle rate limit service errors gracefully', async () => {
      mockRateLimitService.checkRateLimit.mockRejectedValue(
        new Error('Rate limit service error')
      );

      const req = createMockRequest({
        words: ['neon', 'rain'],
        date: '2025-10-15',
      });
      const res = createMockResponse();

      await handlePick(
        req as Request,
        res as Response,
        mockSeedingService as any,
        mockDataService as any,
        mockIdentityService as any,
        mockTelemetryService as any,
        mockRateLimitService as any
      );

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: APIErrorCode.INTERNAL_ERROR,
          }),
        })
      );
    });
  });

  describe('telemetry', () => {
    it('should record performance telemetry for successful requests', async () => {
      // Ensure all data service methods succeed
      mockDataService.setUserChoices.mockResolvedValue(undefined);
      mockDataService.incrementTallies.mockResolvedValue(undefined);

      const req = createMockRequest({
        words: ['neon', 'rain'],
        date: '2025-10-15',
      });
      const res = createMockResponse();

      await handlePick(
        req as Request,
        res as Response,
        mockSeedingService as any,
        mockDataService as any,
        mockIdentityService as any,
        mockTelemetryService as any,
        mockRateLimitService as any
      );

      expect(mockTelemetryService.recordLatency).toHaveBeenCalledWith(
        '2025-10-15',
        expect.any(Number)
      );
      expect(mockTelemetryService.incrementCounter).toHaveBeenCalledWith(
        '2025-10-15',
        'pick_requests'
      );
    });

    it('should record error telemetry for failed requests', async () => {
      mockSeedingService.generateUserWords.mockRejectedValue(
        new Error('Test error')
      );

      const req = createMockRequest({
        words: ['neon', 'rain'],
        date: '2025-10-15',
      });
      const res = createMockResponse();

      await handlePick(
        req as Request,
        res as Response,
        mockSeedingService as any,
        mockDataService as any,
        mockIdentityService as any,
        mockTelemetryService as any,
        mockRateLimitService as any
      );

      expect(mockTelemetryService.incrementCounter).toHaveBeenCalledWith(
        '2025-10-15',
        'pick_errors'
      );
    });
  });
});
