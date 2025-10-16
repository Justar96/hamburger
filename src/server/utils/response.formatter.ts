/**
 * Response formatter utility for Phase 3 Client API endpoints.
 *
 * Provides standardized response formatting for:
 * - Success responses with consistent structure
 * - Error responses with structured error codes
 * - HTTP status code mapping for different error types
 * - Response timestamps and request tracing
 *
 * This module ensures all API endpoints return consistent response formats
 * that client applications can handle predictably.
 *
 * Requirements: 5.5, 5.6, 7.1, 7.2, 7.3, 7.4, 7.5
 */

// Import validation error codes
import { APIErrorCode as ValidationErrorCode } from '../validation/api.validation';

/**
 * Additional API error codes specific to response formatting and HTTP operations.
 * These extend the validation error codes for complete API error coverage.
 */
export enum AdditionalAPIErrorCode {
  /** User authentication failed or context missing */
  UNAUTHORIZED = 'UNAUTHORIZED',
  /** Rate limit exceeded for the current user */
  RATE_LIMITED = 'RATE_LIMITED',
  /** Internal server error or unexpected failure */
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  /** Duplicate submission detected (idempotency check) */
  DUPLICATE_SUBMISSION = 'DUPLICATE_SUBMISSION',
  /** Service temporarily unavailable */
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
}

// Combine all error codes for complete coverage
export const APIErrorCode = {
  // Import validation error codes
  INVALID_DATE: ValidationErrorCode.INVALID_DATE,
  INVALID_WORDS: ValidationErrorCode.INVALID_WORDS,
  WORD_COUNT_EXCEEDED: ValidationErrorCode.WORD_COUNT_EXCEEDED,
  MISSING_PARAMETER: ValidationErrorCode.MISSING_PARAMETER,
  INVALID_TYPE: ValidationErrorCode.INVALID_TYPE,
  // Add additional API error codes
  UNAUTHORIZED: AdditionalAPIErrorCode.UNAUTHORIZED,
  RATE_LIMITED: AdditionalAPIErrorCode.RATE_LIMITED,
  INTERNAL_ERROR: AdditionalAPIErrorCode.INTERNAL_ERROR,
  DUPLICATE_SUBMISSION: AdditionalAPIErrorCode.DUPLICATE_SUBMISSION,
  SERVICE_UNAVAILABLE: AdditionalAPIErrorCode.SERVICE_UNAVAILABLE,
} as const;

export type APIErrorCode = ValidationErrorCode | AdditionalAPIErrorCode;

/**
 * Structured API error information.
 * Provides consistent error format across all endpoints.
 */
export interface APIError {
  /** Machine-readable error code for client handling */
  code: APIErrorCode;
  /** Human-readable error message */
  message: string;
  /** Optional additional error context and details */
  details?: {
    /** Field name that caused the error (for validation errors) */
    field?: string;
    /** Expected format or value */
    expected?: string;
    /** Actual value received */
    received?: unknown;
    /** Retry-after seconds (for rate limiting) */
    retryAfterSeconds?: number;
    /** Additional context-specific information */
    [key: string]: unknown;
  };
}

/**
 * Success response data structure.
 * Generic type allows for flexible data while maintaining consistent structure.
 */
export interface SuccessResponseData<T = Record<string, unknown>> {
  /** Response data (spread into response root) */
  data?: T;
  /** Unix timestamp when response was generated */
  timestamp: number;
  /** Optional request ID for tracing */
  requestId?: string;
}

/**
 * Error response data structure.
 * Provides consistent error response format.
 */
export interface ErrorResponseData {
  /** Structured error information */
  error: APIError;
  /** Unix timestamp when response was generated */
  timestamp: number;
  /** Optional request ID for tracing */
  requestId?: string;
}

/**
 * Union type for all API responses.
 * Ensures type safety across success and error responses.
 */
export type APIResponse<T = Record<string, unknown>> =
  | (T & { timestamp: number; requestId?: string })
  | ErrorResponseData;

/**
 * HTTP status code mapping for different error types.
 * Maps API error codes to appropriate HTTP status codes.
 */
const ERROR_STATUS_MAP: Record<string, number> = {
  // 400 Bad Request - Client validation errors
  [APIErrorCode.INVALID_DATE]: 400,
  [APIErrorCode.INVALID_WORDS]: 400,
  [APIErrorCode.WORD_COUNT_EXCEEDED]: 400,
  [APIErrorCode.MISSING_PARAMETER]: 400,
  [APIErrorCode.INVALID_TYPE]: 400,
  [APIErrorCode.DUPLICATE_SUBMISSION]: 400,

  // 401 Unauthorized - Authentication errors
  [APIErrorCode.UNAUTHORIZED]: 401,

  // 429 Too Many Requests - Rate limiting
  [APIErrorCode.RATE_LIMITED]: 429,

  // 500 Internal Server Error - Server errors
  [APIErrorCode.INTERNAL_ERROR]: 500,

  // 503 Service Unavailable - Temporary service issues
  [APIErrorCode.SERVICE_UNAVAILABLE]: 503,
};

/**
 * Formats a successful API response with consistent structure.
 *
 * Creates a standardized success response that includes:
 * - All data fields spread into the response root (no wrapper)
 * - Response timestamp for client-side caching and debugging
 * - Optional request ID for distributed tracing
 *
 * @param data - Response data to include (optional)
 * @param requestId - Optional request ID for tracing
 * @returns Formatted success response
 *
 * @example
 * ```typescript
 * // Simple success response
 * const response = formatSuccessResponse({ message: 'Success' });
 * // Returns: { message: 'Success', timestamp: 1728950400000 }
 *
 * // API endpoint response
 * const initResponse = formatSuccessResponse({
 *   seedPreview: '8d23abc1',
 *   myWords: ['neon', 'rain', 'alley'],
 *   progress: { top: [...], totalVotes: 156 },
 *   timeLeftSec: 43200
 * });
 * ```
 */
export function formatSuccessResponse<T extends Record<string, unknown>>(
  data?: T | null,
  requestId?: string
): T & { timestamp: number; requestId?: string } {
  const response = {
    ...(data || {}),
    timestamp: Date.now(),
  } as T & { timestamp: number; requestId?: string };

  if (requestId) {
    response.requestId = requestId;
  }

  return response;
}

/**
 * Formats an error API response with consistent structure.
 *
 * Creates a standardized error response that includes:
 * - Structured error object with code, message, and optional details
 * - Response timestamp for debugging and logging
 * - Optional request ID for distributed tracing
 *
 * Handles multiple input types:
 * - APIError objects (used as-is)
 * - Error objects (converted to APIError)
 * - String messages (converted to APIError)
 * - Unknown types (converted to generic internal error)
 *
 * @param error - Error information (APIError, Error, string, or unknown)
 * @param defaultCode - Default error code for non-APIError inputs
 * @param requestId - Optional request ID for tracing
 * @returns Formatted error response
 *
 * @example
 * ```typescript
 * // Structured API error
 * const apiError: APIError = {
 *   code: APIErrorCode.INVALID_DATE,
 *   message: 'Date must be in YYYY-MM-DD format',
 *   details: { field: 'date', expected: 'YYYY-MM-DD', received: '2025/10/15' }
 * };
 * const response = formatErrorResponse(apiError);
 *
 * // Simple string error
 * const response = formatErrorResponse('Rate limit exceeded', APIErrorCode.RATE_LIMITED);
 *
 * // Error object
 * const response = formatErrorResponse(new Error('Database connection failed'));
 * ```
 */
export function formatErrorResponse(
  error: APIError | Error | string | unknown,
  defaultCode: APIErrorCode = APIErrorCode.INTERNAL_ERROR,
  requestId?: string
): ErrorResponseData {
  let apiError: APIError;

  // Handle different error input types
  if (isAPIError(error)) {
    // Use APIError as-is
    apiError = error;
  } else if (error instanceof Error) {
    // Convert Error object to APIError
    apiError = {
      code: defaultCode,
      message: error.message || 'An unexpected error occurred',
    };
  } else if (typeof error === 'string') {
    // Convert string to APIError
    apiError = {
      code: defaultCode,
      message: error || 'An unexpected error occurred',
    };
  } else {
    // Handle unknown error types
    apiError = {
      code: APIErrorCode.INTERNAL_ERROR,
      message: 'An unexpected error occurred',
    };
  }

  const response: ErrorResponseData = {
    error: apiError,
    timestamp: Date.now(),
  };

  if (requestId) {
    response.requestId = requestId;
  }

  return response;
}

/**
 * Gets the appropriate HTTP status code for an API error code.
 *
 * Maps API error codes to standard HTTP status codes:
 * - 400: Validation and client errors
 * - 401: Authentication errors
 * - 429: Rate limiting errors
 * - 500: Internal server errors
 * - 503: Service unavailable errors
 *
 * @param errorCode - API error code to map
 * @returns HTTP status code (defaults to 500 for unknown codes)
 *
 * @example
 * ```typescript
 * const status = getHttpStatusForError(APIErrorCode.INVALID_DATE); // 400
 * const status = getHttpStatusForError(APIErrorCode.RATE_LIMITED); // 429
 * const status = getHttpStatusForError(APIErrorCode.INTERNAL_ERROR); // 500
 * ```
 */
export function getHttpStatusForError(errorCode: APIErrorCode): number {
  return ERROR_STATUS_MAP[errorCode] || 500;
}

/**
 * Type guard to check if an object is an APIError.
 *
 * @param error - Object to check
 * @returns True if object is an APIError
 */
function isAPIError(error: unknown): error is APIError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    typeof (error as APIError).code === 'string' &&
    typeof (error as APIError).message === 'string'
  );
}

/**
 * Utility function to create a standardized API error object.
 *
 * Provides a convenient way to create APIError objects with consistent structure.
 *
 * @param code - Error code
 * @param message - Error message
 * @param details - Optional error details
 * @returns APIError object
 *
 * @example
 * ```typescript
 * const error = createAPIError(
 *   APIErrorCode.WORD_COUNT_EXCEEDED,
 *   'Too many words submitted',
 *   { field: 'words', maxAllowed: 100, received: 150 }
 * );
 * ```
 */
export function createAPIError(
  code: APIErrorCode,
  message: string,
  details?: APIError['details']
): APIError {
  const error: APIError = { code, message };

  if (details) {
    error.details = details;
  }

  return error;
}

/**
 * Utility function to send a formatted success response via Express.
 *
 * Combines response formatting with Express response sending for convenience.
 *
 * @param res - Express response object
 * @param data - Response data
 * @param requestId - Optional request ID
 *
 * @example
 * ```typescript
 * sendSuccessResponse(res, {
 *   seedPreview: '8d23abc1',
 *   myWords: ['neon', 'rain'],
 *   timeLeftSec: 43200
 * });
 * ```
 */
export function sendSuccessResponse<T extends Record<string, unknown>>(
  res: any, // Express Response type
  data?: T,
  requestId?: string
): void {
  const response = formatSuccessResponse(data, requestId);
  res.json(response);
}

/**
 * Utility function to send a formatted error response via Express.
 *
 * Combines error formatting, status code mapping, and Express response sending.
 *
 * @param res - Express response object
 * @param error - Error information
 * @param defaultCode - Default error code for non-APIError inputs
 * @param requestId - Optional request ID
 *
 * @example
 * ```typescript
 * sendErrorResponse(res, 'Rate limit exceeded', APIErrorCode.RATE_LIMITED);
 * // Sends 429 status with formatted error response
 *
 * const apiError = createAPIError(APIErrorCode.INVALID_DATE, 'Invalid date format');
 * sendErrorResponse(res, apiError);
 * // Sends 400 status with formatted error response
 * ```
 */
export function sendErrorResponse(
  res: any, // Express Response type
  error: APIError | Error | string | unknown,
  defaultCode: APIErrorCode = APIErrorCode.INTERNAL_ERROR,
  requestId?: string
): void {
  const response = formatErrorResponse(error, defaultCode, requestId);
  const statusCode = getHttpStatusForError(response.error.code);

  res.status(statusCode).json(response);
}
