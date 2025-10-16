/**
 * Unit tests for /api/init endpoint
 *
 * Tests the initialization endpoint functionality including:
 * - User context extraction and validation
 * - Date parameter validation
 * - Seed generation and retrieval
 * - User word generation
 * - Progress data fetching
 * - Time calculation
 * - Error handling scenarios
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { handleInit } from './init.endpoint';
import { SeedingService } from '../services/seeding.service';
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

// Mock services
const mockSeedingService = {
  generateDailySeed: vi.fn(),
  generateUserWords: vi.fn(),
} as unknown as SeedingService;

const mockDataService = {
  getSeed: vi.fn(),
  getTopWords: vi.fn(),
} as unknown as DataService;

const mockIdentityService = {
  hashUserId: vi.fn(),
} as unknown as IdentityService;

const mockTelemetryService = {
  recordLatency: vi.fn(),
  incrementCounter: vi.fn(),
} as unknown as TelemetryService;

// Mock Express request and response
const createMockRequest = (query: Record<string, string> = {}): Request =>
  ({
    query,
    method: 'GET',
    path: '/api/init',
  }) as Request;

const createMockResponse = (): Response => {
  const res = {
    json: vi.fn(),
    status: vi.fn(),
    statusCode: 200,
  } as unknown as Response;

  // Make status chainable
  (res.status as any).mockReturnValue(res);

  return res;
};

describe('handleInit', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock implementations
    (mockIdentityService.hashUserId as any).mockReturnValue('hasheduser123');
    (mockDataService.getSeed as any).mockResolvedValue({
      seedHex: '8d23abc1234567890abcdef0123456789abcdef01',
      theme: 'Test Theme',
      poolsVersion: 'v1',
      createdAt: Date.now(),
    });
    (mockSeedingService.generateUserWords as any).mockResolvedValue([
      'neon',
      'rain',
      'alley',
      'midnight',
      'glow',
      'urban',
      'shadow',
      'light',
      'street',
      'city',
      'night',
      'bright',
    ]);
    (mockDataService.getTopWords as any).mockResolvedValue([
      { word: 'neon', count: 42 },
      { word: 'rain', count: 38 },
      { word: 'alley', count: 35 },
    ]);
    (mockTelemetryService.recordLatency as any).mockResolvedValue(undefined);
    (mockTelemetryService.incrementCounter as any).mockResolvedValue(undefined);
  });

  it('should successfully initialize game state with valid date', async () => {
    const req = createMockRequest({ date: '2025-10-15' });
    const res = createMockResponse();

    await handleInit(
      req,
      res,
      mockSeedingService,
      mockDataService,
      mockIdentityService,
      mockTelemetryService
    );

    // Verify services were called correctly
    expect(mockIdentityService.hashUserId).toHaveBeenCalledWith(
      't2_testuser123'
    );
    expect(mockDataService.getSeed).toHaveBeenCalledWith('2025-10-15');
    expect(mockSeedingService.generateUserWords).toHaveBeenCalledWith(
      't2_testuser123',
      '2025-10-15',
      12
    );
    expect(mockDataService.getTopWords).toHaveBeenCalledWith('2025-10-15', 10);

    // Verify response structure
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        seedPreview: '8d23abc1',
        myWords: expect.arrayContaining(['neon', 'rain', 'alley']),
        progress: expect.objectContaining({
          top: expect.arrayContaining([
            { word: 'neon', count: 42 },
            { word: 'rain', count: 38 },
            { word: 'alley', count: 35 },
          ]),
          totalVotes: 115, // 42 + 38 + 35
          uniqueVoters: expect.any(Number),
        }),
        timeLeftSec: expect.any(Number),
        timestamp: expect.any(Number),
      })
    );

    // Verify telemetry was recorded
    expect(mockTelemetryService.recordLatency).toHaveBeenCalledWith(
      '2025-10-15',
      expect.any(Number)
    );
    expect(mockTelemetryService.incrementCounter).toHaveBeenCalledWith(
      '2025-10-15',
      'init_requests'
    );
  });

  it('should return 400 for invalid date format', async () => {
    const req = createMockRequest({ date: '2025/10/15' });
    const res = createMockResponse();

    await handleInit(
      req,
      res,
      mockSeedingService,
      mockDataService,
      mockIdentityService,
      mockTelemetryService
    );

    // Verify error response
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: APIErrorCode.INVALID_DATE,
          message: expect.stringContaining('Invalid date parameter'),
        }),
      })
    );

    // Verify services were not called
    expect(mockSeedingService.generateUserWords).not.toHaveBeenCalled();
    expect(mockDataService.getTopWords).not.toHaveBeenCalled();
  });

  it('should return 400 for missing date parameter', async () => {
    const req = createMockRequest({});
    const res = createMockResponse();

    await handleInit(
      req,
      res,
      mockSeedingService,
      mockDataService,
      mockIdentityService,
      mockTelemetryService
    );

    // Verify error response
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: APIErrorCode.INVALID_DATE,
          message: expect.stringContaining('Invalid date parameter'),
        }),
      })
    );
  });

  it('should generate daily seed if not exists', async () => {
    // Mock getSeed to return null (seed doesn't exist)
    (mockDataService.getSeed as any).mockResolvedValue(null);
    (mockSeedingService.generateDailySeed as any).mockResolvedValue({
      seedHex: 'newseed1234567890abcdef0123456789abcdef01',
      theme: 'Generated Theme',
      poolsVersion: 'v1',
      createdAt: Date.now(),
    });

    const req = createMockRequest({ date: '2025-10-15' });
    const res = createMockResponse();

    await handleInit(
      req,
      res,
      mockSeedingService,
      mockDataService,
      mockIdentityService,
      mockTelemetryService
    );

    // Verify seed generation was called
    expect(mockSeedingService.generateDailySeed).toHaveBeenCalledWith(
      '2025-10-15'
    );

    // Verify response uses generated seed
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        seedPreview: 'newseed1',
      })
    );
  });

  it('should handle service errors gracefully', async () => {
    // Mock service to throw error
    (mockSeedingService.generateUserWords as any).mockRejectedValue(
      new Error('Service unavailable')
    );

    const req = createMockRequest({ date: '2025-10-15' });
    const res = createMockResponse();

    await handleInit(
      req,
      res,
      mockSeedingService,
      mockDataService,
      mockIdentityService,
      mockTelemetryService
    );

    // Verify error response
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: APIErrorCode.INTERNAL_ERROR,
          message: expect.stringContaining('Failed to initialize game state'),
        }),
      })
    );

    // Verify error telemetry was recorded
    expect(mockTelemetryService.incrementCounter).toHaveBeenCalledWith(
      '2025-10-15',
      'init_errors'
    );
  });

  it('should calculate time remaining correctly', async () => {
    const req = createMockRequest({ date: '2025-10-15' });
    const res = createMockResponse();

    await handleInit(
      req,
      res,
      mockSeedingService,
      mockDataService,
      mockIdentityService,
      mockTelemetryService
    );

    // Verify timeLeftSec is included and is a non-negative number
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        timeLeftSec: expect.any(Number),
      })
    );

    const responseCall = (res.json as any).mock.calls[0][0];
    expect(responseCall.timeLeftSec).toBeGreaterThanOrEqual(0);
  });

  it('should include request ID in responses', async () => {
    const req = createMockRequest({ date: '2025-10-15' });
    const res = createMockResponse();

    await handleInit(
      req,
      res,
      mockSeedingService,
      mockDataService,
      mockIdentityService,
      mockTelemetryService
    );

    // Verify requestId is included
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: expect.stringMatching(/^init_\d+_[a-z0-9]+$/),
      })
    );
  });
});
