/**
 * /api/init endpoint implementation
 *
 * Provides initial game state for a specific date including:
 * - User's personal word set (generated from seeding engine)
 * - Current progress data (top words, vote counts)
 * - Time remaining until 23:00 Bangkok time
 * - Daily seed preview for display
 *
 * This endpoint handles the complete initialization flow:
 * 1. Extract and validate user context from Devvit middleware
 * 2. Generate or retrieve daily seed using SeedingService
 * 3. Generate user's personal word set using seeding engine
 * 4. Fetch current progress data (top words, vote counts)
 * 5. Calculate time remaining until cutoff
 * 6. Return structured response
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 6.1, 6.2, 9.1, 9.2
 */

import type { Request, Response } from 'express';
import { context } from '@devvit/server';
import { SeedingService } from '../services/seeding.service';
import { DataService } from '../services/data.service';
import { IdentityService } from '../services/identity.service';
import { TelemetryService } from '../services/telemetry.service';
import { PostDataService } from '../services/postdata.service';
import { validateDate } from '../validation/api.validation';
import {
  sendSuccessResponse,
  sendErrorResponse,
  APIErrorCode,
  createAPIError,
} from '../utils/response.formatter';

/**
 * Response structure for /api/init endpoint
 */
export interface InitResponse {
  /** First 8 characters of daily seed for display */
  seedPreview: string;
  /** User's generated word set */
  myWords: string[];
  /** Current voting progress data */
  progress: {
    /** Top N words with vote counts */
    top: Array<{ word: string; count: number }>;
    /** Total votes cast today */
    totalVotes: number;
    /** Number of unique participants */
    uniqueVoters: number;
  };
  /** Seconds remaining until 23:00 Bangkok time */
  timeLeftSec: number;
}

/**
 * Handles GET /api/init requests
 *
 * Extracts user context, validates date parameter, generates user words,
 * fetches progress data, and returns structured response.
 *
 * @param req - Express request object with date query parameter
 * @param res - Express response object
 * @param seedingService - SeedingService instance for word generation
 * @param dataService - DataService instance for data operations
 * @param identityService - IdentityService instance for user ID hashing
 * @param telemetryService - TelemetryService instance for performance tracking
 */
export async function handleInit(
  req: Request,
  res: Response,
  seedingService: SeedingService,
  dataService: DataService,
  identityService: IdentityService,
  telemetryService: TelemetryService
): Promise<void> {
  const startTime = Date.now();
  let requestId: string | undefined;

  try {
    // Generate request ID for tracing
    requestId = `init_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Extract user context from Devvit middleware
    let userId: string;
    try {
      const contextUserId = context.userId;
      if (!contextUserId) {
        throw new Error('User ID not available in context');
      }
      userId = contextUserId;
    } catch (error) {
      const apiError = createAPIError(
        APIErrorCode.UNAUTHORIZED,
        'User authentication required',
        {
          reason: 'User context not available',
          details: error instanceof Error ? error.message : 'Unknown error',
        }
      );
      return sendErrorResponse(
        res,
        apiError,
        APIErrorCode.UNAUTHORIZED,
        requestId
      );
    }

    // Validate date parameter
    const dateParam = req.query.date as string;
    const dateValidation = validateDate(dateParam, 'date');
    if (!dateValidation.isValid) {
      const apiError = createAPIError(
        APIErrorCode.INVALID_DATE,
        'Invalid date parameter',
        {
          field: 'date',
          expected: 'YYYY-MM-DD format',
          received: dateParam,
          errors: dateValidation.errors,
        }
      );
      return sendErrorResponse(
        res,
        apiError,
        APIErrorCode.INVALID_DATE,
        requestId
      );
    }

    const date = dateParam;

    // Hash user ID for privacy
    const userHash = identityService.hashUserId(userId);

    // Generate or retrieve daily seed
    let seedData = await dataService.getSeed(date);
    if (!seedData) {
      seedData = await seedingService.generateDailySeed(date);
    }

    // Generate user's personal word set (default 12 words)
    const myWords = await seedingService.generateUserWords(userId, date, 12);

    // Fetch current progress data
    const topWords = await dataService.getTopWords(date, 10);

    // Calculate total votes and unique voters
    const totalVotes = topWords.reduce((sum, entry) => sum + entry.count, 0);

    // Get unique voters count (approximate - count of user choice entries)
    // Note: This is an approximation since we don't have a direct count
    // In a real implementation, we might track this separately
    const uniqueVoters = Math.min(
      totalVotes,
      topWords.length > 0 ? Math.ceil(totalVotes / (topWords.length || 1)) : 0
    );

    // Calculate time remaining until 23:00 Bangkok time
    const timeLeftSec = calculateTimeLeft(date);

    // Build response
    const response: InitResponse = {
      seedPreview: seedData.seedHex.substring(0, 8),
      myWords,
      progress: {
        top: topWords,
        totalVotes,
        uniqueVoters,
      },
      timeLeftSec,
    };

    // Record performance telemetry
    const latency = Date.now() - startTime;
    await telemetryService.recordLatency(date, latency);
    await telemetryService.incrementCounter(date, 'init_requests');

    // Send success response
    sendSuccessResponse(
      res,
      response as unknown as Record<string, unknown>,
      requestId
    );
  } catch (error) {
    // Record error telemetry
    const date =
      (req.query.date as string) || new Date().toISOString().split('T')[0];
    await telemetryService.incrementCounter(date, 'init_errors');

    // Log error with context
    console.error('Init endpoint error:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      requestId,
      date: req.query.date,
      timestamp: new Date().toISOString(),
    });

    // Send error response
    const apiError = createAPIError(
      APIErrorCode.INTERNAL_ERROR,
      'Failed to initialize game state',
      {
        requestId,
        timestamp: Date.now(),
      }
    );
    sendErrorResponse(res, apiError, APIErrorCode.INTERNAL_ERROR, requestId);
  }
}

/**
 * Calculates seconds remaining until 23:00 Bangkok time (UTC+7) on the given date.
 *
 * If the current time is already past 23:00 Bangkok on the given date,
 * returns 0 (not negative).
 *
 * @param date - Date in YYYY-MM-DD format
 * @returns Seconds remaining until 23:00 Bangkok time, or 0 if already past
 */
function calculateTimeLeft(date: string): number {
  // Parse date and set time to 23:00 in Bangkok timezone (UTC+7)
  const targetDate = new Date(`${date}T23:00:00+07:00`);
  const now = new Date();

  const diffMs = targetDate.getTime() - now.getTime();

  // Return 0 if time has already passed (don't return negative)
  return Math.max(0, Math.floor(diffMs / 1000));
}
