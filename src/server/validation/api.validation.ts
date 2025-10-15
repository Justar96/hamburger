/**
 * Input validation module for Phase 3 Client API endpoints.
 *
 * Provides comprehensive validation for:
 * - Date format validation (YYYY-MM-DD)
 * - Word array validation (non-empty arrays of strings)
 * - Word count limit validation (max K words per submission)
 * - Structured error responses with specific error codes
 *
 * This module follows the existing validation patterns from SeedingService
 * and provides consistent error handling for all API endpoints.
 */

/**
 * Maximum number of words a user can submit per request.
 * This matches the MAX_WORD_COUNT from SeedingService to maintain consistency.
 */
export const MAX_WORDS_PER_SUBMISSION = 100;

/**
 * Minimum number of words required in a submission.
 */
export const MIN_WORDS_PER_SUBMISSION = 1;

/**
 * Regular expression for validating YYYY-MM-DD date format.
 * Matches the DATE_REGEX pattern from SeedingService.
 */
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Enumeration of API validation error codes.
 * These codes provide machine-readable error identification for client applications.
 */
export enum APIErrorCode {
  /** Date parameter is missing, invalid format, or not a valid date */
  INVALID_DATE = 'INVALID_DATE',
  /** Words array is missing, empty, contains non-strings, or has invalid structure */
  INVALID_WORDS = 'INVALID_WORDS',
  /** Word count exceeds the maximum allowed limit */
  WORD_COUNT_EXCEEDED = 'WORD_COUNT_EXCEEDED',
  /** Required parameter is missing from the request */
  MISSING_PARAMETER = 'MISSING_PARAMETER',
  /** Parameter has wrong type (e.g., string instead of array) */
  INVALID_TYPE = 'INVALID_TYPE',
}

/**
 * Detailed validation error information.
 * Provides structured error details for debugging and user feedback.
 */
export interface ValidationError {
  /** Machine-readable error code */
  code: APIErrorCode;
  /** Human-readable error message */
  message: string;
  /** Field name that caused the validation error */
  field: string;
  /** Additional context about the error (optional) */
  details?: {
    /** Expected format or value */
    expected?: string;
    /** Actual value received */
    received?: unknown;
    /** Additional context-specific information */
    [key: string]: unknown;
  };
}

/**
 * Result of a validation operation.
 * Contains success status and any validation errors encountered.
 */
export interface ValidationResult {
  /** Whether validation passed (true) or failed (false) */
  isValid: boolean;
  /** Array of validation errors (empty if isValid is true) */
  errors: ValidationError[];
}

/**
 * Validates a date string against YYYY-MM-DD format.
 *
 * Performs comprehensive date validation:
 * 1. Checks if date is provided and is a string
 * 2. Validates format using regex pattern
 * 3. Ensures the date is actually valid (not just formatted correctly)
 *
 * @param date - Date string to validate
 * @param fieldName - Name of the field being validated (for error messages)
 * @returns ValidationResult with success status and any errors
 *
 * @example
 * ```typescript
 * const result = validateDate('2025-10-15', 'date');
 * if (!result.isValid) {
 *   console.error('Date validation failed:', result.errors);
 * }
 * ```
 */
export function validateDate(
  date: unknown,
  fieldName: string = 'date'
): ValidationResult {
  const errors: ValidationError[] = [];

  // Check if date is provided
  if (date === undefined || date === null) {
    errors.push({
      code: APIErrorCode.MISSING_PARAMETER,
      message: `${fieldName} is required`,
      field: fieldName,
      details: {
        expected: 'string in YYYY-MM-DD format',
        received: date,
      },
    });
    return { isValid: false, errors };
  }

  // Check if date is a string
  if (typeof date !== 'string') {
    errors.push({
      code: APIErrorCode.INVALID_TYPE,
      message: `${fieldName} must be a string`,
      field: fieldName,
      details: {
        expected: 'string',
        received: typeof date,
      },
    });
    return { isValid: false, errors };
  }

  // Check if date is non-empty
  if (date.trim().length === 0) {
    errors.push({
      code: APIErrorCode.INVALID_DATE,
      message: `${fieldName} cannot be empty`,
      field: fieldName,
      details: {
        expected: 'non-empty string in YYYY-MM-DD format',
        received: date,
      },
    });
    return { isValid: false, errors };
  }

  // Check date format using regex
  if (!DATE_REGEX.test(date)) {
    errors.push({
      code: APIErrorCode.INVALID_DATE,
      message: `${fieldName} must be in YYYY-MM-DD format`,
      field: fieldName,
      details: {
        expected: 'YYYY-MM-DD format (e.g., "2025-10-15")',
        received: date,
      },
    });
    return { isValid: false, errors };
  }

  // Check if date is actually valid (not just formatted correctly)
  // JavaScript Date constructor is lenient, so we need to validate more strictly
  const [year, month, day] = date.split('-').map(Number);
  const parsedDate = new Date(year, month - 1, day); // month is 0-indexed

  // Check if the parsed date matches the input (catches invalid dates like Feb 30)
  if (
    isNaN(parsedDate.getTime()) ||
    parsedDate.getFullYear() !== year ||
    parsedDate.getMonth() !== month - 1 ||
    parsedDate.getDate() !== day
  ) {
    errors.push({
      code: APIErrorCode.INVALID_DATE,
      message: `${fieldName} must be a valid date`,
      field: fieldName,
      details: {
        expected: 'valid date in YYYY-MM-DD format',
        received: date,
      },
    });
    return { isValid: false, errors };
  }

  return { isValid: true, errors: [] };
}

/**
 * Validates an array of words for API submission.
 *
 * Performs comprehensive word array validation:
 * 1. Checks if words parameter is provided
 * 2. Validates it's an array
 * 3. Ensures array is not empty
 * 4. Validates each element is a string
 * 5. Checks for empty strings
 * 6. Enforces word count limits
 *
 * @param words - Array of words to validate
 * @param fieldName - Name of the field being validated (for error messages)
 * @returns ValidationResult with success status and any errors
 *
 * @example
 * ```typescript
 * const result = validateWordArray(['neon', 'rain', 'alley'], 'words');
 * if (!result.isValid) {
 *   console.error('Word validation failed:', result.errors);
 * }
 * ```
 */
export function validateWordArray(
  words: unknown,
  fieldName: string = 'words'
): ValidationResult {
  const errors: ValidationError[] = [];

  // Check if words is provided
  if (words === undefined || words === null) {
    errors.push({
      code: APIErrorCode.MISSING_PARAMETER,
      message: `${fieldName} is required`,
      field: fieldName,
      details: {
        expected: 'array of strings',
        received: words,
      },
    });
    return { isValid: false, errors };
  }

  // Check if words is an array
  if (!Array.isArray(words)) {
    errors.push({
      code: APIErrorCode.INVALID_TYPE,
      message: `${fieldName} must be an array`,
      field: fieldName,
      details: {
        expected: 'array',
        received: typeof words,
      },
    });
    return { isValid: false, errors };
  }

  // Check if array is not empty
  if (words.length === 0) {
    errors.push({
      code: APIErrorCode.INVALID_WORDS,
      message: `${fieldName} cannot be empty`,
      field: fieldName,
      details: {
        expected: `array with ${MIN_WORDS_PER_SUBMISSION}-${MAX_WORDS_PER_SUBMISSION} strings`,
        received: 'empty array',
      },
    });
    return { isValid: false, errors };
  }

  // Check word count limits
  if (words.length > MAX_WORDS_PER_SUBMISSION) {
    errors.push({
      code: APIErrorCode.WORD_COUNT_EXCEEDED,
      message: `${fieldName} cannot contain more than ${MAX_WORDS_PER_SUBMISSION} words`,
      field: fieldName,
      details: {
        expected: `maximum ${MAX_WORDS_PER_SUBMISSION} words`,
        received: `${words.length} words`,
        maxAllowed: MAX_WORDS_PER_SUBMISSION,
      },
    });
    return { isValid: false, errors };
  }

  // Validate each word in the array
  const invalidWords: Array<{ index: number; value: unknown; reason: string }> =
    [];

  for (let i = 0; i < words.length; i++) {
    const word = words[i];

    // Check if word is a string
    if (typeof word !== 'string') {
      invalidWords.push({
        index: i,
        value: word,
        reason: `must be a string, got ${typeof word}`,
      });
      continue;
    }

    // Check if word is not empty
    if (word.trim().length === 0) {
      invalidWords.push({
        index: i,
        value: word,
        reason: 'cannot be empty or whitespace-only',
      });
    }
  }

  // If there are invalid words, add error
  if (invalidWords.length > 0) {
    errors.push({
      code: APIErrorCode.INVALID_WORDS,
      message: `${fieldName} contains invalid elements`,
      field: fieldName,
      details: {
        expected: 'array of non-empty strings',
        invalidWords: invalidWords,
        totalInvalid: invalidWords.length,
      },
    });
    return { isValid: false, errors };
  }

  return { isValid: true, errors: [] };
}

/**
 * Validates word count against submission limits.
 *
 * This is a specialized validation for checking if a word count
 * is within acceptable limits for API submissions.
 *
 * @param count - Number of words to validate
 * @param fieldName - Name of the field being validated (for error messages)
 * @returns ValidationResult with success status and any errors
 *
 * @example
 * ```typescript
 * const result = validateWordCount(5, 'wordCount');
 * if (!result.isValid) {
 *   console.error('Word count validation failed:', result.errors);
 * }
 * ```
 */
export function validateWordCount(
  count: unknown,
  fieldName: string = 'wordCount'
): ValidationResult {
  const errors: ValidationError[] = [];

  // Check if count is provided
  if (count === undefined || count === null) {
    errors.push({
      code: APIErrorCode.MISSING_PARAMETER,
      message: `${fieldName} is required`,
      field: fieldName,
      details: {
        expected: 'number',
        received: count,
      },
    });
    return { isValid: false, errors };
  }

  // Check if count is a number
  if (typeof count !== 'number') {
    errors.push({
      code: APIErrorCode.INVALID_TYPE,
      message: `${fieldName} must be a number`,
      field: fieldName,
      details: {
        expected: 'number',
        received: typeof count,
      },
    });
    return { isValid: false, errors };
  }

  // Check if count is within valid range (also handles NaN, Infinity, -Infinity)
  if (
    isNaN(count) ||
    !isFinite(count) ||
    count < MIN_WORDS_PER_SUBMISSION ||
    count > MAX_WORDS_PER_SUBMISSION
  ) {
    errors.push({
      code: APIErrorCode.WORD_COUNT_EXCEEDED,
      message: `${fieldName} must be between ${MIN_WORDS_PER_SUBMISSION} and ${MAX_WORDS_PER_SUBMISSION}`,
      field: fieldName,
      details: {
        expected: `number between ${MIN_WORDS_PER_SUBMISSION} and ${MAX_WORDS_PER_SUBMISSION}`,
        received: count,
        minAllowed: MIN_WORDS_PER_SUBMISSION,
        maxAllowed: MAX_WORDS_PER_SUBMISSION,
      },
    });
    return { isValid: false, errors };
  }

  return { isValid: true, errors: [] };
}

/**
 * Validates multiple fields at once and combines results.
 *
 * This utility function allows validating multiple fields in a single call
 * and returns a combined result with all validation errors.
 *
 * @param validations - Array of validation functions to execute
 * @returns Combined ValidationResult with all errors
 *
 * @example
 * ```typescript
 * const result = validateMultiple([
 *   () => validateDate(requestData.date, 'date'),
 *   () => validateWordArray(requestData.words, 'words')
 * ]);
 *
 * if (!result.isValid) {
 *   return res.status(400).json({ errors: result.errors });
 * }
 * ```
 */
export function validateMultiple(
  validations: Array<() => ValidationResult>
): ValidationResult {
  const allErrors: ValidationError[] = [];
  let isValid = true;

  for (const validation of validations) {
    const result = validation();
    if (!result.isValid) {
      isValid = false;
      allErrors.push(...result.errors);
    }
  }

  return {
    isValid,
    errors: allErrors,
  };
}

/**
 * Converts validation errors to a structured API error response.
 *
 * This utility function formats validation errors into the standard
 * API error response format expected by client applications.
 *
 * @param errors - Array of validation errors
 * @returns Structured error response object
 *
 * @example
 * ```typescript
 * const validationResult = validateDate(date);
 * if (!validationResult.isValid) {
 *   const errorResponse = formatValidationErrors(validationResult.errors);
 *   return res.status(400).json(errorResponse);
 * }
 * ```
 */
export function formatValidationErrors(errors: ValidationError[]) {
  return {
    error: {
      code: errors.length === 1 ? errors[0].code : 'VALIDATION_FAILED',
      message:
        errors.length === 1
          ? errors[0].message
          : `Validation failed for ${errors.length} field(s)`,
      details: {
        errors: errors,
        count: errors.length,
      },
    },
  };
}
