/**
 * Unit tests for /api/progress endpoint
 *
 * Tests the progress endpoint functionality including:
 * - User authentication and context validation
 * - Date parameter validation
 * - Data retrieval from services
 * - Time calculation logic
 * - Response formatting
 * - Error handling scenarios
 * - Cache header setting
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { handleProgress } from './progress.endpoint';
import { DataService } from '../services/data.service';
import { IdentityService } from '../services/identity.service';
import { TelemetryService } from '../services/telemetry.service';
import { APIErrorCode } from '../utils/response.formatter';

// Mock the Devvit context
vi.mock('@devvit/server', () => ({
  context: {
    userId: 't2_testuser123',
  },
}));

describe('Progress Endpoint', () => {
  let mockDataService: DataService;
  let mockIdentityService: IdentityService;
  let mockTelemetryService: TelemetryService;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let responseData: any;
  let statusCode: number;
  let headers: Record<string, string>;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Mock services
    mockDataService = {
      getTopWords: vi.fn(),
      getUserChoices: vi.fn(),
    } as any;

    mockIdentityService = {
      hashUserId: vi.fn(),
    } as any;

    mockTelemetryService = {
      recordLatency: vi.fn(),
      incrementCounter: vi.fn(),
    } as any;

    // Mock request and response
    responseData = null;
    statusCode = 200;
    headers = {};

    mockReq = {
      query: {
        date: '2025-10-15',
      },
    };

    mockRes = {
      json: vi.fn(data => {
        responseData = data;
        return mockRes;
      }),
      status: vi.fn(code => {
        statusCode = code;
        return mockRes;
      }),
      set: vi.fn((key, value) => {
        headers[key] = value;
        return mockRes;
      }),
    } as any;

    // Setup default mock implementations
    (mockIdentityService.hashUserId as any).mockReturnValue('hashed_user_123');
    (mockDataService.getTopWords as any).mockResolvedValue([
      { word: 'neon', count: 15 },
      { word: 'rain', count: 12 },
      { word: 'alley', count: 8 },
    ]);
    (mockDataService.getUserChoices as any).mockResolvedValue([
      'neon',
      'rain',
      'cyber',
    ]);
    (mockTelemetryService.recordLatency as any).mockResolvedValue(undefined);
    (mockTelemetryService.incrementCounter as any).mockResolvedValue(undefined);
  });

  describe('Successful requests', () => {
    it('should return progress data with user choices', async () => {
      await handleProgress(
        mockReq as Request,
        mockRes as Response,
        mockDataService,
        mockIdentityService,
        mockTelemetryService
      );

      expect(statusCode).toBe(200);
      expect(responseData).toMatchObject({
        top: [
          { word: 'neon', count: 15 },
          { word: 'rain', count: 12 },
          { word: 'alley', count: 8 },
        ],
        my: ['neon', 'rain', 'cyber'],
        timeLeftSec: expect.any(Number),
        timestamp: expect.any(Number),
      });

      // Verify service calls
      expect(mockIdentityService.hashUserId).toHaveBeenCalledWith(
        't2_testuser123'
      );
      expect(mockDataService.getTopWords).toHaveBeenCalledWith(
        '2025-10-15',
        10
      );
      expect(mockDataService.getUserChoices).toHaveBeenCalledWith(
        '2025-10-15',
        'hashed_user_123'
      );
    });

    it('should return empty user choices when user has not submitted', async () => {
      (mockDataService.getUserChoices as any).mockResolvedValue(null);

      await handleProgress(
        mockReq as Request,
        mockRes as Response,
        mockDataService,
        mockIdentityService,
        mockTelemetryService
      );

      expect(statusCode).toBe(200);
      expect(responseData.my).toEqual([]);
    });

    it('should set appropriate cache headers for active voting', async () => {
      // Mock a future date to ensure positive timeLeftSec
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);
      const futureDateStr = futureDate.toISOString().split('T')[0];

      mockReq.query = { date: futureDateStr };

      await handleProgress(
        mockReq as Request,
        mockRes as Response,
        mockDataService,
        mockIdentityService,
        mockTelemetryService
      );

      expect(headers['Cache-Control']).toBe('public, max-age=30');
      expect(headers['ETag']).toBeDefined();
    });

    it('should set longer cache headers for past dates', async () => {
      // Mock a past date to ensure timeLeftSec = 0
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      const pastDateStr = pastDate.toISOString().split('T')[0];

      mockReq.query = { date: pastDateStr };

      await handleProgress(
        mockReq as Request,
        mockRes as Response,
        mockDataService,
        mockIdentityService,
        mockTelemetryService
      );

      expect(responseData.timeLeftSec).toBe(0);
      expect(headers['Cache-Control']).toBe('public, max-age=300');
    });

    it('should record telemetry for successful requests', async () => {
      await handleProgress(
        mockReq as Request,
        mockRes as Response,
        mockDataService,
        mockIdentityService,
        mockTelemetryService
      );

      expect(mockTelemetryService.recordLatency).toHaveBeenCalledWith(
        '2025-10-15',
        expect.any(Number)
      );
      expect(mockTelemetryService.incrementCounter).toHaveBeenCalledWith(
        '2025-10-15',
        'progress_requests'
      );
    });
  });

  describe('Authentication errors', () => {
    it('should return 401 when user context is missing', async () => {
      // Import the mocked module and modify it
      const devvitModule = await import('@devvit/server');
      const originalUserId = devvitModule.context.userId;

      // Temporarily set userId to null
      (devvitModule.context as any).userId = null;

      await handleProgress(
        mockReq as Request,
        mockRes as Response,
        mockDataService,
        mockIdentityService,
        mockTelemetryService
      );

      expect(statusCode).toBe(401);
      expect(responseData.error.code).toBe(APIErrorCode.UNAUTHORIZED);
      expect(responseData.error.message).toBe('User authentication required');

      // Restore the original value
      (devvitModule.context as any).userId = originalUserId;
    });
  });

  describe('Validation errors', () => {
    it('should return 400 for missing date parameter', async () => {
      mockReq.query = {};

      await handleProgress(
        mockReq as Request,
        mockRes as Response,
        mockDataService,
        mockIdentityService,
        mockTelemetryService
      );

      expect(statusCode).toBe(400);
      expect(responseData.error.code).toBe(APIErrorCode.INVALID_DATE);
      expect(responseData.error.message).toBe('Invalid date parameter');
    });

    it('should return 400 for invalid date format', async () => {
      mockReq.query = { date: '2025/10/15' };

      await handleProgress(
        mockReq as Request,
        mockRes as Response,
        mockDataService,
        mockIdentityService,
        mockTelemetryService
      );

      expect(statusCode).toBe(400);
      expect(responseData.error.code).toBe(APIErrorCode.INVALID_DATE);
      expect(responseData.error.details.expected).toBe('YYYY-MM-DD format');
      expect(responseData.error.details.received).toBe('2025/10/15');
    });

    it('should return 400 for invalid date value', async () => {
      mockReq.query = { date: '2025-02-30' }; // Invalid date

      await handleProgress(
        mockReq as Request,
        mockRes as Response,
        mockDataService,
        mockIdentityService,
        mockTelemetryService
      );

      expect(statusCode).toBe(400);
      expect(responseData.error.code).toBe(APIErrorCode.INVALID_DATE);
    });
  });

  describe('Service errors', () => {
    it('should handle data service errors gracefully', async () => {
      (mockDataService.getTopWords as any).mockRejectedValue(
        new Error('Redis connection failed')
      );

      await handleProgress(
        mockReq as Request,
        mockRes as Response,
        mockDataService,
        mockIdentityService,
        mockTelemetryService
      );

      // Should return 503 for Redis connection failures
      expect(statusCode).toBe(503);
      expect(responseData.error.code).toBe(APIErrorCode.SERVICE_UNAVAILABLE);
      expect(responseData.error.message).toBe(
        'Service temporarily unavailable'
      );
    });

    it('should record error telemetry on failures', async () => {
      (mockDataService.getTopWords as any).mockRejectedValue(
        new Error('Service error')
      );

      await handleProgress(
        mockReq as Request,
        mockRes as Response,
        mockDataService,
        mockIdentityService,
        mockTelemetryService
      );

      expect(mockTelemetryService.incrementCounter).toHaveBeenCalledWith(
        '2025-10-15',
        'progress_errors'
      );
    });
  });

  describe('Time calculation', () => {
    it('should return positive timeLeftSec for future dates', async () => {
      // Use a date far in the future to ensure positive result
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      const futureDateStr = futureDate.toISOString().split('T')[0];

      mockReq.query = { date: futureDateStr };

      await handleProgress(
        mockReq as Request,
        mockRes as Response,
        mockDataService,
        mockIdentityService,
        mockTelemetryService
      );

      expect(responseData.timeLeftSec).toBeGreaterThan(0);
    });

    it('should return 0 timeLeftSec for past dates', async () => {
      // Use a date far in the past to ensure 0 result
      const pastDate = new Date();
      pastDate.setFullYear(pastDate.getFullYear() - 1);
      const pastDateStr = pastDate.toISOString().split('T')[0];

      mockReq.query = { date: pastDateStr };

      await handleProgress(
        mockReq as Request,
        mockRes as Response,
        mockDataService,
        mockIdentityService,
        mockTelemetryService
      );

      expect(responseData.timeLeftSec).toBe(0);
    });
  });

  describe('Response structure', () => {
    it('should include request ID in response', async () => {
      await handleProgress(
        mockReq as Request,
        mockRes as Response,
        mockDataService,
        mockIdentityService,
        mockTelemetryService
      );

      expect(responseData.requestId).toMatch(/^progress_\d+_[a-z0-9]+$/);
    });

    it('should include timestamp in response', async () => {
      const beforeTime = Date.now();

      await handleProgress(
        mockReq as Request,
        mockRes as Response,
        mockDataService,
        mockIdentityService,
        mockTelemetryService
      );

      const afterTime = Date.now();

      expect(responseData.timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(responseData.timestamp).toBeLessThanOrEqual(afterTime);
    });

    it('should have correct response structure', async () => {
      await handleProgress(
        mockReq as Request,
        mockRes as Response,
        mockDataService,
        mockIdentityService,
        mockTelemetryService
      );

      expect(responseData).toHaveProperty('top');
      expect(responseData).toHaveProperty('my');
      expect(responseData).toHaveProperty('timeLeftSec');
      expect(responseData).toHaveProperty('timestamp');
      expect(responseData).toHaveProperty('requestId');

      expect(Array.isArray(responseData.top)).toBe(true);
      expect(Array.isArray(responseData.my)).toBe(true);
      expect(typeof responseData.timeLeftSec).toBe('number');
    });
  });
});
