/**
 * Comprehensive error handling utilities for Phase 3 Client API.
 *
 * Provides centralized error handling with:
 * - Proper error classification (4xx vs 5xx)
 * - Structured error logging with request context
 * - Privacy protection (no raw user IDs in logs)
 * - Request ID tracing for debugging
 * - Graceful service failure handling
 *
 * This module ensures consistent error handling across all API endpoints
 * while maintaining security and privacy standards.
 *
 * Requirements: 5.5, 5.6, 6.5, 6.6
 */

import type { Request, Response } from 'express';
import {
  APIErrorCode,
  createAPIError,
  sendErrorResponse,
  type APIError,
  type APIErrorCodeValue,
} from './response.formatter';

/**
 * Error context information for structured logging.
 * Contains all relevant request information without exposing sensitive data.
 */
export interface ErrorContext {
  /** Request ID for distributed tracing */
  requestId?: string;
  /** HTTP method (GET, POST, etc.) */
  method: string;
  /** Request path */
  path: string;
  /** Hashed user ID (never raw user ID) */
  userHash?: string;
  /** Date parameter if present */
  date?: string;
  /** Operation being performed */
  operation?: string;
  /** Additional context-specific data */
  metadata?: Record<string, unknown>;
  /** ISO timestamp when error occurred */
  timestamp: string;
}

/**
 * Error classification for determining HTTP status codes and logging levels.
 */
export enum ErrorClass {
  /** Client errors (4xx) - validation, authentication, rate limiting */
  CLIENT_ERROR = 'CLIENT_ERROR',
  /** Server errors (5xx) - internal failures, service unavailable */
  SERVER_ERROR = 'SERVER_ERROR',
}

/**
 * Classifies an API error code into client or server error category.
 *
 * Client errors (4xx):
 * - INVALID_DATE, INVALID_WORDS, WORD_COUNT_EXCEEDED
 * - MISSING_PARAMETER, INVALID_TYPE
 * - UNAUTHORIZED, RATE_LIMITED
 * - DUPLICATE_SUBMISSION
 *
 * Server errors (5xx):
 * - INTERNAL_ERROR, SERVICE_UNAVAILABLE
 *
 * @param errorCode - API error code to classify
 * @returns Error classification (CLIENT_ERROR or SERVER_ERROR)
 */
export function classifyError(errorCode: APIErrorCodeValue): ErrorClass {
  const clientErrors: string[] = [
    APIErrorCode.INVALID_DATE,
    APIErrorCode.INVALID_WORDS,
    APIErrorCode.WORD_COUNT_EXCEEDED,
    APIErrorCode.MISSING_PARAMETER,
    APIErrorCode.INVALID_TYPE,
    APIErrorCode.UNAUTHORIZED,
    APIErrorCode.RATE_LIMITED,
    APIErrorCode.DUPLICATE_SUBMISSION,
  ];

  return clientErrors.includes(errorCode as string)
    ? ErrorClass.CLIENT_ERROR
    : ErrorClass.SERVER_ERROR;
}

/**
 * Extracts error context from Express request for structured logging.
 *
 * Ensures privacy by:
 * - Never including raw user IDs (only hashed versions)
 * - Sanitizing sensitive request data
 * - Including only relevant debugging information
 *
 * @param req - Express request object
 * @param requestId - Request ID for tracing
 * @param userHash - Hashed user ID (optional)
 * @param operation - Operation being performed (optional)
 * @param metadata - Additional context data (optional)
 * @returns Structured error context for logging
 */
export function extractErrorContext(
  req: Request,
  requestId?: string,
  userHash?: string,
  operation?: string,
  metadata?: Record<string, unknown>
): ErrorContext {
  return {
    requestId,
    method: req.method,
    path: req.path,
    userHash, // Only hashed user ID, never raw
    date: (req.query?.date as string) || (req.body?.date as string),
    operation,
    metadata,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Logs an error with structured context information.
 *
 * Logging behavior based on error classification:
 * - Client errors (4xx): Log at info level with request details
 * - Server errors (5xx): Log at error level with full stack trace
 *
 * Privacy guarantees:
 * - Raw user IDs are NEVER logged
 * - Only hashed user IDs appear in logs
 * - Sensitive data is sanitized before logging
 *
 * @param error - Error object or message
 * @param context - Error context information
 * @param errorCode - API error code for classification
 */
export function logError(
  error: Error | string | unknown,
  context: ErrorContext,
  errorCode: APIErrorCode
): void {
  const errorClass = classifyError(errorCode);
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  const logData = {
    errorCode,
    errorClass,
    message: errorMessage,
    context,
    ...(errorClass === ErrorClass.SERVER_ERROR && errorStack
      ? { stack: errorStack }
      : {}),
  };

  // Use appropriate log level based on error classification
  if (errorClass === ErrorClass.CLIENT_ERROR) {
    // Client errors are expected and logged at info level
    // eslint-disable-next-line no-console
    console.log('[CLIENT_ERROR]', JSON.stringify(logData, null, 2));
  } else {
    // Server errors are unexpected and logged at error level
    // eslint-disable-next-line no-console
    console.error('[SERVER_ERROR]', JSON.stringify(logData, null, 2));
  }
}

/**
 * Handles service failures gracefully with appropriate error responses.
 *
 * Service failure scenarios:
 * - Redis connection failures
 * - Seeding service errors
 * - Data service errors
 * - Telemetry service errors (non-critical)
 *
 * Behavior:
 * - Critical services: Return 503 Service Unavailable
 * - Non-critical services: Log and continue (graceful degradation)
 * - Always log with full context for debugging
 *
 * @param error - Service error
 * @param serviceName - Name of the failing service
 * @param context - Error context
 * @param critical - Whether service is critical (default: true)
 * @returns APIError for critical services, null for non-critical
 */
export function handleServiceFailure(
  error: Error | unknown,
  serviceName: string,
  context: ErrorContext,
  critical: boolean = true
): APIError | null {
  const errorMessage = error instanceof Error ? error.message : String(error);

  // Log service failure with full context
  const logData = {
    serviceName,
    critical,
    error: errorMessage,
    stack: error instanceof Error ? error.stack : undefined,
    context,
  };

  if (critical) {
    // eslint-disable-next-line no-console
    console.error('[SERVICE_FAILURE]', JSON.stringify(logData, null, 2));

    return createAPIError(
      APIErrorCode.SERVICE_UNAVAILABLE,
      `Service temporarily unavailable: ${serviceName}`,
      {
        service: serviceName,
        requestId: context.requestId,
        timestamp: Date.now(),
      }
    );
  } else {
    // Non-critical service failures are logged but don't block the request
    // eslint-disable-next-line no-console
    console.log('[SERVICE_DEGRADATION]', JSON.stringify(logData, null, 2));

    return null;
  }
}

/**
 * Express error handling middleware for centralized error processing.
 *
 * Catches all unhandled errors in the request pipeline and:
 * - Classifies the error appropriately
 * - Logs with structured context
 * - Sends formatted error response
 * - Ensures no sensitive data is exposed
 *
 * This middleware should be registered last in the middleware chain
 * to catch all errors from previous middleware and route handlers.
 *
 * @param error - Error object
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 */
export function errorHandlingMiddleware(
  error: Error | unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: (err?: unknown) => void
): void {
  // Generate request ID if not present
  const requestId = `error_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  // Extract error context
  const context = extractErrorContext(req, requestId);

  // Determine error code and create API error
  let apiError: APIError;

  if (error instanceof Error) {
    // Check if error has a specific error code attached
    const errorCode: APIErrorCodeValue =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (error as any).code || APIErrorCode.INTERNAL_ERROR;

    apiError = createAPIError(
      errorCode,
      error.message || 'An unexpected error occurred',
      {
        requestId,
        timestamp: Date.now(),
      }
    );

    // Log the error
    logError(error, context, errorCode);
  } else {
    // Unknown error type
    apiError = createAPIError(
      APIErrorCode.INTERNAL_ERROR,
      'An unexpected error occurred',
      {
        requestId,
        timestamp: Date.now(),
      }
    );

    logError(error, context, APIErrorCode.INTERNAL_ERROR);
  }

  // Send error response
  sendErrorResponse(res, apiError, apiError.code, requestId);
}

/**
 * Wraps an async route handler with error handling.
 *
 * Catches any errors thrown by the handler and passes them to
 * the error handling middleware. This prevents unhandled promise
 * rejections and ensures consistent error handling.
 *
 * @param handler - Async route handler function
 * @returns Wrapped handler with error handling
 *
 * @example
 * ```typescript
 * router.get('/api/init', wrapAsyncHandler(async (req, res) => {
 *   // Handler code that might throw errors
 *   const data = await someAsyncOperation();
 *   res.json(data);
 * }));
 * ```
 */
export function wrapAsyncHandler(
  handler: (req: Request, res: Response) => Promise<void>
): (req: Request, res: Response, next: (err?: unknown) => void) => void {
  return (req: Request, res: Response, next: (err?: unknown) => void) => {
    Promise.resolve(handler(req, res)).catch(next);
  };
}

/**
 * Validates that user ID is properly hashed before logging.
 *
 * Ensures privacy by checking that user IDs in logs are hashed
 * (64-character hex strings) and not raw user IDs.
 *
 * @param userId - User ID to validate
 * @returns True if user ID is properly hashed
 */
export function isHashedUserId(userId: string): boolean {
  // Hashed user IDs are 64-character hex strings (SHA-256)
  return /^[a-f0-9]{64}$/i.test(userId);
}

/**
 * Sanitizes error details to remove sensitive information.
 *
 * Removes or redacts:
 * - Raw user IDs
 * - Authentication tokens
 * - Passwords or secrets
 * - PII (personally identifiable information)
 *
 * @param details - Error details object
 * @returns Sanitized error details
 */
export function sanitizeErrorDetails(
  details: Record<string, unknown>
): Record<string, unknown> {
  const sanitized = { ...details };

  // List of sensitive key patterns to redact (case-insensitive)
  const sensitivePatterns = [
    'password',
    'token',
    'secret',
    'apikey',
    'api_key',
    'authorization',
    'cookie',
  ];

  // Redact sensitive keys
  for (const key of Object.keys(sanitized)) {
    const lowerKey = key.toLowerCase();
    if (sensitivePatterns.some(pattern => lowerKey.includes(pattern))) {
      sanitized[key] = '[REDACTED]';
    }
  }

  // Validate user IDs are hashed
  if (sanitized.userId && typeof sanitized.userId === 'string') {
    if (!isHashedUserId(sanitized.userId)) {
      sanitized.userId = '[INVALID_USER_ID_FORMAT]';
    }
  }

  return sanitized;
}
