/**
 * /api/progress endpoint implementation
 *
 * Provides current voting progress and countdown information for a specific date:
 * - Current top words from Redis sorted set
 * - User's previously submitted choices (if any)
 * - Time remaining until cutoff (23:00 Bangkok time)
 * - Handles past dates by returning final results with timeLeftSec=0
 * - Sets appropriate cache headers for performance
 *
 * This endpoint enables real-time progress tracking for the collaborative
 * voting game, allowing clients to display live updates and countdown timers.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 6.1, 6.2, 9.3
 */

import type { Request, Response } from 'express';
import { context } from '@devvit/server';
import { DataService } from '../services/data.service';
import { IdentityService } from '../services/identity.service';
import { TelemetryService } from '../services/telemetry.service';
import { validateDate } from '../validation/api.validation';
import {
  sendSuccessResponse,
  sendErrorResponse,
  APIErrorCode,
  createAPIError,
} from '../utils/response.formatter';

/**
 * Response structure for /api/progress endpoint
 */
export interface ProgressResponse {
  /** Current top words leaderboard */
  top: Array<{ word: string; count: number }>;
  /** User's previously submitted choices (empty array if none) */
  my: string[];
  /** Seconds remaining until 23:00 Bangkok time (0 if past cutoff) */
  timeLeftSec: number;
}

/**
 * Handles GET /api/progress requests
 *
 * Processes progress tracking requests with validation and caching:
 * 1. Extract and validate user context from Devvit middleware
 * 2. Validate date parameter format
 * 3. Retrieve current top words from Redis sorted set
 * 4. Get user's previously submitted choices (if any)
 * 5. Calculate time remaining until cutoff (23:00 Bangkok)
 * 6. Handle past dates by returning final results with timeLeftSec=0
 * 7. Set appropriate cache headers for performance
 * 8. Return structured response with progress data
 *
 * @param req - Express request object with date query parameter
 * @param res - Express response object
 * @param dataService - DataService instance for data operations
 * @param identityService - IdentityService instance for user ID hashing
 * @param telemetryService - TelemetryService instance for performance tracking
 */
export async function handleProgress(
  req: Request,
  res: Response,
  dataService: DataService,
  identityService: IdentityService,
  telemetryService: TelemetryService
): Promise<void> {
  const startTime = Date.now();
  let requestId: string | undefined;

  try {
    // Generate request ID for tracing
    requestId = `progress_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

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

    // Retrieve current top words from Redis sorted set
    const topWords = await dataService.getTopWords(date, 10);

    // Get user's previously submitted choices (if any)
    const userChoices = await dataService.getUserChoices(date, userHash);
    const myChoices = userChoices || [];

    // Calculate time remaining until cutoff (23:00 Bangkok)
    const timeLeftSec = calculateTimeLeft(date);

    // Set appropriate cache headers for performance
    // Cache for 30 seconds to balance freshness with performance
    // Use shorter cache for current day, longer for past days
    const cacheMaxAge = timeLeftSec > 0 ? 30 : 300; // 30s for active, 5min for past
    res.set('Cache-Control', `public, max-age=${cacheMaxAge}`);
    res.set('ETag', `"${date}-${topWords.length}-${Date.now()}"`.substring(0, 32));

    // Build response
    const response: ProgressResponse = {
      top: topWords,
      my: myChoices,
      timeLeftSec,
    };

    // Record performance telemetry
    const latency = Date.now() - startTime;
    await telemetryService.recordLatency(date, latency);
    await telemetryService.incrementCounter(date, 'progress_requests');

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
    await telemetryService.incrementCounter(date, 'progress_errors');

    // Log error with context
    console.error('Progress endpoint error:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      requestId,
      date: req.query.date,
      timestamp: new Date().toISOString(),
    });

    // Send error response
    const apiError = createAPIError(
      APIErrorCode.INTERNAL_ERROR,
      'Failed to retrieve progress data',
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
 * returns 0 (not negative). This handles past dates by returning final results.
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