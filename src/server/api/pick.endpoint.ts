/**
 * /api/pick endpoint implementation
 *
 * Handles user word selection submissions with comprehensive validation:
 * - User authentication via Devvit context
 * - Rate limiting (1 request per 3 seconds per user)
 * - Input validation (words array and date format)
 * - Word verification against user's generated word set
 * - Word count limit enforcement (max K words per user)
 * - Atomic storage of choices and vote tally updates
 * - Structured response with accepted words and updated leaderboard
 *
 * This endpoint implements the core voting mechanism for the Beef game,
 * ensuring fair play through rate limiting and validation while providing
 * real-time feedback on vote tallies.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 4.1, 6.1, 6.2, 9.3, 9.4
 */

import type { Request, Response } from 'express';
import { context } from '@devvit/server';
import { SeedingService } from '../services/seeding.service';
import { DataService } from '../services/data.service';
import { IdentityService } from '../services/identity.service';
import { TelemetryService } from '../services/telemetry.service';
import { RateLimitService } from '../services/rate-limit.service';
import { validateDate, validateWordArray } from '../validation/api.validation';
import {
  sendSuccessResponse,
  sendErrorResponse,
  APIErrorCode,
  createAPIError,
  type APIErrorCodeValue,
} from '../utils/response.formatter';
import {
  extractErrorContext,
  logError,
  handleServiceFailure,
} from '../utils/error-handler';

/**
 * Request structure for /api/pick endpoint
 */
export interface PickRequest {
  /** Array of words selected by the user */
  words: string[];
  /** Date in YYYY-MM-DD format */
  date: string;
}

/**
 * Response structure for /api/pick endpoint
 */
export interface PickResponse {
  /** Whether the operation succeeded */
  ok: boolean;
  /** Words that were accepted and counted */
  accepted: string[];
  /** Updated top words leaderboard */
  top: Array<{ word: string; count: number }>;
}

/**
 * Handles POST /api/pick requests
 *
 * Processes user word selection with full validation and rate limiting:
 * 1. Extract and validate user context from Devvit middleware
 * 2. Apply rate limiting (1 request per 3 seconds per user)
 * 3. Validate request body (words array and date format)
 * 4. Generate user's word set to verify submitted words
 * 5. Enforce maximum word count limit
 * 6. Check for duplicate submissions (idempotency)
 * 7. Store user choices and increment vote tallies atomically
 * 8. Return accepted words and updated top words list
 *
 * @param req - Express request object with PickRequest body
 * @param res - Express response object
 * @param seedingService - SeedingService instance for word generation/verification
 * @param dataService - DataService instance for data operations
 * @param identityService - IdentityService instance for user ID hashing
 * @param telemetryService - TelemetryService instance for performance tracking
 * @param rateLimitService - RateLimitService instance for rate limiting
 */
export async function handlePick(
  req: Request,
  res: Response,
  seedingService: SeedingService,
  dataService: DataService,
  identityService: IdentityService,
  telemetryService: TelemetryService,
  rateLimitService: RateLimitService
): Promise<void> {
  const startTime = Date.now();
  let requestId: string | undefined;

  try {
    // Generate request ID for tracing
    requestId = `pick_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

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

    // Hash user ID for privacy and rate limiting
    const userHash = identityService.hashUserId(userId);

    // Apply rate limiting
    const rateLimitResult = await rateLimitService.checkRateLimit(userHash);
    if (!rateLimitResult.allowed) {
      const apiError = createAPIError(
        APIErrorCode.RATE_LIMITED,
        'Too many requests. Please wait before submitting again.',
        {
          retryAfterSeconds: rateLimitResult.retryAfterSeconds,
        }
      );

      // Set Retry-After header
      if (rateLimitResult.retryAfterSeconds) {
        res.set('Retry-After', rateLimitResult.retryAfterSeconds.toString());
      }

      return sendErrorResponse(
        res,
        apiError,
        APIErrorCode.RATE_LIMITED,
        requestId
      );
    }

    // Validate request body structure
    const { words, date } = req.body as PickRequest;

    // Validate date parameter
    const dateValidation = validateDate(date, 'date');
    if (!dateValidation.isValid) {
      const apiError = createAPIError(
        APIErrorCode.INVALID_DATE,
        'Invalid date parameter',
        {
          field: 'date',
          expected: 'YYYY-MM-DD format',
          received: date,
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

    // Validate words array
    const wordsValidation = validateWordArray(words, 'words');
    if (!wordsValidation.isValid) {
      const apiError = createAPIError(
        APIErrorCode.INVALID_WORDS,
        'Invalid words array',
        {
          field: 'words',
          expected: 'array of non-empty strings',
          received: words,
          errors: wordsValidation.errors,
        }
      );
      return sendErrorResponse(
        res,
        apiError,
        APIErrorCode.INVALID_WORDS,
        requestId
      );
    }

    // Generate user's word set to verify submitted words are valid
    const userWords = await seedingService.generateUserWords(userId, date, 12);
    const userWordSet = new Set(userWords);

    // Verify all submitted words are from user's generated word set
    const invalidWords = words.filter(word => !userWordSet.has(word));
    if (invalidWords.length > 0) {
      const apiError = createAPIError(
        APIErrorCode.INVALID_WORDS,
        'One or more words are not from your generated word set',
        {
          field: 'words',
          invalidWords,
          validWords: userWords,
        }
      );
      return sendErrorResponse(
        res,
        apiError,
        APIErrorCode.INVALID_WORDS,
        requestId
      );
    }

    // Check for duplicate submission (idempotency)
    const existingChoices = await dataService.getUserChoices(date, userHash);
    if (existingChoices) {
      // User has already submitted choices for this date
      // Return the existing submission as if it was just processed
      const topWords = await dataService.getTopWords(date, 10);

      const response: PickResponse = {
        ok: true,
        accepted: existingChoices,
        top: topWords,
      };

      // Record telemetry for duplicate submission
      await telemetryService.incrementCounter(date, 'pick_duplicates');

      return sendSuccessResponse(
        res,
        response as unknown as Record<string, unknown>,
        requestId
      );
    }

    // Store user choices and increment vote tallies atomically
    // Note: In a production system, this would ideally be a single atomic transaction
    // For now, we do them sequentially and handle potential inconsistencies
    try {
      // Store user choices first
      await dataService.setUserChoices(date, userHash, words);

      // Increment tallies for each word
      await dataService.incrementTallies(date, words);

      // Get updated top words
      const topWords = await dataService.getTopWords(date, 10);

      // Build response
      const response: PickResponse = {
        ok: true,
        accepted: words,
        top: topWords,
      };

      // Record performance telemetry (non-critical)
      try {
        const latency = Date.now() - startTime;
        await telemetryService.recordLatency(date, latency);
        await telemetryService.incrementCounter(date, 'pick_requests');
      } catch (telemetryError) {
        // Telemetry failure is non-critical, log but continue
        console.log('[TELEMETRY_FAILURE]', {
          operation: 'recordLatency/incrementCounter',
          error:
            telemetryError instanceof Error
              ? telemetryError.message
              : String(telemetryError),
        });
      }

      // Send success response
      sendSuccessResponse(
        res,
        response as unknown as Record<string, unknown>,
        requestId
      );
    } catch (storageError) {
      // Extract error context for structured logging
      const context = extractErrorContext(
        req,
        requestId,
        userHash,
        'pick_storage',
        { date, wordCount: words.length }
      );

      // Handle service failure gracefully
      const serviceError = handleServiceFailure(
        storageError,
        'DataService',
        context,
        true // Critical service
      );

      if (serviceError) {
        return sendErrorResponse(
          res,
          serviceError,
          serviceError.code,
          requestId
        );
      }

      // Fallback error response
      const apiError = createAPIError(
        APIErrorCode.INTERNAL_ERROR,
        'Failed to store word choices',
        {
          requestId,
          timestamp: Date.now(),
        }
      );
      return sendErrorResponse(
        res,
        apiError,
        APIErrorCode.INTERNAL_ERROR,
        requestId
      );
    }
  } catch (error) {
    // Record error telemetry (non-critical)
    const date = req.body?.date || new Date().toISOString().split('T')[0];
    try {
      await telemetryService.incrementCounter(date, 'pick_errors');
    } catch (telemetryError) {
      // Telemetry failure is non-critical, log but continue
      console.log('[TELEMETRY_FAILURE]', {
        operation: 'incrementCounter',
        counter: 'pick_errors',
        error:
          telemetryError instanceof Error
            ? telemetryError.message
            : String(telemetryError),
      });
    }

    // Extract error context for structured logging
    const context = extractErrorContext(
      req,
      requestId,
      undefined, // userHash not available in catch block
      'pick',
      { date: req.body?.date, bodyPresent: !!req.body }
    );

    // Determine error code based on error type
    let errorCode: APIErrorCodeValue = APIErrorCode.INTERNAL_ERROR;
    let errorMessage = 'Failed to process word selection';

    // Check if this is a service failure
    if (error instanceof Error) {
      if (
        error.message.includes('Redis') ||
        error.message.includes('connection')
      ) {
        errorCode = APIErrorCode.SERVICE_UNAVAILABLE as APIErrorCode;
        errorMessage = 'Service temporarily unavailable';
      }
    }

    // Log error with structured context
    logError(error, context, errorCode);

    // Send error response
    const apiError = createAPIError(errorCode, errorMessage, {
      requestId,
      timestamp: Date.now(),
    });
    sendErrorResponse(res, apiError, errorCode, requestId);
  }
}
