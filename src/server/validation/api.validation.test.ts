/**
 * Unit tests for API validation module.
 *
 * Tests all validation functions with various input scenarios:
 * - Valid inputs (should pass)
 * - Invalid inputs (should fail with appropriate errors)
 * - Edge cases and boundary conditions
 * - Error message formatting and structure
 */

import { describe, it, expect } from 'vitest';
import {
  validateDate,
  validateWordArray,
  validateWordCount,
  validateMultiple,
  formatValidationErrors,
  APIErrorCode,
  MAX_WORDS_PER_SUBMISSION,
  MIN_WORDS_PER_SUBMISSION,
  type ValidationError,
} from './api.validation';

describe('API Validation Module', () => {
  describe('validateDate', () => {
    describe('valid dates', () => {
      it('should accept valid YYYY-MM-DD format', () => {
        const testCases = [
          '2025-10-15',
          '2024-01-01',
          '2023-12-31',
          '2025-02-28',
          '2024-02-29', // leap year
        ];

        testCases.forEach(date => {
          const result = validateDate(date);
          expect(result.isValid).toBe(true);
          expect(result.errors).toHaveLength(0);
        });
      });
    });

    describe('invalid dates', () => {
      it('should reject missing date', () => {
        const testCases = [undefined, null];

        testCases.forEach(date => {
          const result = validateDate(date);
          expect(result.isValid).toBe(false);
          expect(result.errors).toHaveLength(1);
          expect(result.errors[0].code).toBe(APIErrorCode.MISSING_PARAMETER);
          expect(result.errors[0].field).toBe('date');
        });
      });

      it('should reject non-string types', () => {
        const testCases = [123, true, {}, [], new Date()];

        testCases.forEach(date => {
          const result = validateDate(date);
          expect(result.isValid).toBe(false);
          expect(result.errors).toHaveLength(1);
          expect(result.errors[0].code).toBe(APIErrorCode.INVALID_TYPE);
          expect(result.errors[0].field).toBe('date');
        });
      });

      it('should reject empty strings', () => {
        const testCases = ['', '   ', '\t', '\n'];

        testCases.forEach(date => {
          const result = validateDate(date);
          expect(result.isValid).toBe(false);
          expect(result.errors).toHaveLength(1);
          expect(result.errors[0].code).toBe(APIErrorCode.INVALID_DATE);
          expect(result.errors[0].field).toBe('date');
        });
      });

      it('should reject invalid date formats', () => {
        const testCases = [
          '2025/10/15', // wrong separators
          '15-10-2025', // wrong order
          '2025-10-1', // missing zero padding
          '25-10-15', // 2-digit year
          '2025-13-01', // invalid month
          '2025-10-32', // invalid day
          '2025-10', // incomplete
          '2025-10-15T00:00:00Z', // with time
          'not-a-date', // completely invalid
        ];

        testCases.forEach(date => {
          const result = validateDate(date);
          expect(result.isValid).toBe(false);
          expect(result.errors).toHaveLength(1);
          expect(result.errors[0].code).toBe(APIErrorCode.INVALID_DATE);
          expect(result.errors[0].field).toBe('date');
        });
      });

      it('should reject invalid dates that match format', () => {
        const testCases = [
          '2025-02-30', // February 30th doesn't exist
          '2023-02-29', // Not a leap year
          '2025-04-31', // April only has 30 days
          '0000-01-01', // Year 0
          '2025-00-01', // Month 0
          '2025-01-00', // Day 0
        ];

        testCases.forEach(date => {
          const result = validateDate(date);
          expect(result.isValid).toBe(false);
          expect(result.errors).toHaveLength(1);
          expect(result.errors[0].code).toBe(APIErrorCode.INVALID_DATE);
          expect(result.errors[0].field).toBe('date');
        });
      });

      it('should use custom field name in errors', () => {
        const result = validateDate('invalid', 'customField');
        expect(result.isValid).toBe(false);
        expect(result.errors[0].field).toBe('customField');
        expect(result.errors[0].message).toContain('customField');
      });
    });
  });

  describe('validateWordArray', () => {
    describe('valid word arrays', () => {
      it('should accept valid word arrays', () => {
        const testCases = [
          ['word'],
          ['neon', 'rain'],
          ['neon', 'rain', 'alley', 'midnight', 'glow'],
          ['a', 'b', 'c'], // single character words
          ['word with spaces'], // words with spaces
          Array.from(
            { length: MAX_WORDS_PER_SUBMISSION },
            (_, i) => `word${i}`
          ), // max length
        ];

        testCases.forEach(words => {
          const result = validateWordArray(words);
          expect(result.isValid).toBe(true);
          expect(result.errors).toHaveLength(0);
        });
      });
    });

    describe('invalid word arrays', () => {
      it('should reject missing words', () => {
        const testCases = [undefined, null];

        testCases.forEach(words => {
          const result = validateWordArray(words);
          expect(result.isValid).toBe(false);
          expect(result.errors).toHaveLength(1);
          expect(result.errors[0].code).toBe(APIErrorCode.MISSING_PARAMETER);
          expect(result.errors[0].field).toBe('words');
        });
      });

      it('should reject non-array types', () => {
        const testCases = ['not an array', 123, true, {}, new Date()];

        testCases.forEach(words => {
          const result = validateWordArray(words);
          expect(result.isValid).toBe(false);
          expect(result.errors).toHaveLength(1);
          expect(result.errors[0].code).toBe(APIErrorCode.INVALID_TYPE);
          expect(result.errors[0].field).toBe('words');
        });
      });

      it('should reject empty arrays', () => {
        const result = validateWordArray([]);
        expect(result.isValid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe(APIErrorCode.INVALID_WORDS);
        expect(result.errors[0].field).toBe('words');
      });

      it('should reject arrays exceeding max word count', () => {
        const tooManyWords = Array.from(
          { length: MAX_WORDS_PER_SUBMISSION + 1 },
          (_, i) => `word${i}`
        );
        const result = validateWordArray(tooManyWords);
        expect(result.isValid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe(APIErrorCode.WORD_COUNT_EXCEEDED);
        expect(result.errors[0].field).toBe('words');
        expect(result.errors[0].details?.maxAllowed).toBe(
          MAX_WORDS_PER_SUBMISSION
        );
      });

      it('should reject arrays with non-string elements', () => {
        const testCases = [
          ['valid', 123, 'word'],
          ['valid', null, 'word'],
          ['valid', undefined, 'word'],
          ['valid', true, 'word'],
          ['valid', {}, 'word'],
          ['valid', [], 'word'],
        ];

        testCases.forEach(words => {
          const result = validateWordArray(words);
          expect(result.isValid).toBe(false);
          expect(result.errors).toHaveLength(1);
          expect(result.errors[0].code).toBe(APIErrorCode.INVALID_WORDS);
          expect(result.errors[0].field).toBe('words');
          expect(result.errors[0].details?.invalidWords).toBeDefined();
        });
      });

      it('should reject arrays with empty strings', () => {
        const testCases = [
          ['valid', '', 'word'],
          ['valid', '   ', 'word'],
          ['valid', '\t', 'word'],
          ['valid', '\n', 'word'],
        ];

        testCases.forEach(words => {
          const result = validateWordArray(words);
          expect(result.isValid).toBe(false);
          expect(result.errors).toHaveLength(1);
          expect(result.errors[0].code).toBe(APIErrorCode.INVALID_WORDS);
          expect(result.errors[0].field).toBe('words');
        });
      });

      it('should provide detailed error information for invalid elements', () => {
        const words = ['valid', 123, '', null, 'another-valid'];
        const result = validateWordArray(words);

        expect(result.isValid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].details?.invalidWords).toHaveLength(3); // 123, '', null
        expect(result.errors[0].details?.totalInvalid).toBe(3);
      });

      it('should use custom field name in errors', () => {
        const result = validateWordArray([], 'customWords');
        expect(result.isValid).toBe(false);
        expect(result.errors[0].field).toBe('customWords');
        expect(result.errors[0].message).toContain('customWords');
      });
    });
  });

  describe('validateWordCount', () => {
    describe('valid word counts', () => {
      it('should accept valid word counts', () => {
        const testCases = [
          MIN_WORDS_PER_SUBMISSION,
          5,
          12,
          50,
          MAX_WORDS_PER_SUBMISSION,
        ];

        testCases.forEach(count => {
          const result = validateWordCount(count);
          expect(result.isValid).toBe(true);
          expect(result.errors).toHaveLength(0);
        });
      });
    });

    describe('invalid word counts', () => {
      it('should reject missing count', () => {
        const testCases = [undefined, null];

        testCases.forEach(count => {
          const result = validateWordCount(count);
          expect(result.isValid).toBe(false);
          expect(result.errors).toHaveLength(1);
          expect(result.errors[0].code).toBe(APIErrorCode.MISSING_PARAMETER);
          expect(result.errors[0].field).toBe('wordCount');
        });
      });

      it('should reject non-number types', () => {
        const testCases = ['5', true, {}, [], new Date()];

        testCases.forEach(count => {
          const result = validateWordCount(count);
          expect(result.isValid).toBe(false);
          expect(result.errors).toHaveLength(1);
          expect(result.errors[0].code).toBe(APIErrorCode.INVALID_TYPE);
          expect(result.errors[0].field).toBe('wordCount');
        });
      });

      it('should reject counts outside valid range', () => {
        const testCases = [
          0,
          -1,
          -10,
          MAX_WORDS_PER_SUBMISSION + 1,
          1000,
          Infinity,
          -Infinity,
          NaN,
        ];

        testCases.forEach(count => {
          const result = validateWordCount(count);
          expect(result.isValid).toBe(false);
          expect(result.errors).toHaveLength(1);
          expect(result.errors[0].code).toBe(APIErrorCode.WORD_COUNT_EXCEEDED);
          expect(result.errors[0].field).toBe('wordCount');
        });
      });

      it('should use custom field name in errors', () => {
        const result = validateWordCount(0, 'customCount');
        expect(result.isValid).toBe(false);
        expect(result.errors[0].field).toBe('customCount');
        expect(result.errors[0].message).toContain('customCount');
      });
    });
  });

  describe('validateMultiple', () => {
    it('should return valid when all validations pass', () => {
      const validations = [
        () => validateDate('2025-10-15'),
        () => validateWordArray(['neon', 'rain']),
        () => validateWordCount(5),
      ];

      const result = validateMultiple(validations);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return invalid when any validation fails', () => {
      const validations = [
        () => validateDate('2025-10-15'), // valid
        () => validateWordArray([]), // invalid - empty
        () => validateWordCount(5), // valid
      ];

      const result = validateMultiple(validations);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe(APIErrorCode.INVALID_WORDS);
    });

    it('should combine errors from multiple failed validations', () => {
      const validations = [
        () => validateDate('invalid-date'), // invalid
        () => validateWordArray([]), // invalid
        () => validateWordCount(-1), // invalid
      ];

      const result = validateMultiple(validations);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(3);

      const errorCodes = result.errors.map(e => e.code);
      expect(errorCodes).toContain(APIErrorCode.INVALID_DATE);
      expect(errorCodes).toContain(APIErrorCode.INVALID_WORDS);
      expect(errorCodes).toContain(APIErrorCode.WORD_COUNT_EXCEEDED);
    });

    it('should handle empty validation array', () => {
      const result = validateMultiple([]);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('formatValidationErrors', () => {
    it('should format single error correctly', () => {
      const errors: ValidationError[] = [
        {
          code: APIErrorCode.INVALID_DATE,
          message: 'date must be in YYYY-MM-DD format',
          field: 'date',
          details: {
            expected: 'YYYY-MM-DD format',
            received: 'invalid-date',
          },
        },
      ];

      const formatted = formatValidationErrors(errors);

      expect(formatted.error.code).toBe(APIErrorCode.INVALID_DATE);
      expect(formatted.error.message).toBe('date must be in YYYY-MM-DD format');
      expect(formatted.error.details.errors).toEqual(errors);
      expect(formatted.error.details.count).toBe(1);
    });

    it('should format multiple errors correctly', () => {
      const errors: ValidationError[] = [
        {
          code: APIErrorCode.INVALID_DATE,
          message: 'date must be in YYYY-MM-DD format',
          field: 'date',
        },
        {
          code: APIErrorCode.INVALID_WORDS,
          message: 'words cannot be empty',
          field: 'words',
        },
      ];

      const formatted = formatValidationErrors(errors);

      expect(formatted.error.code).toBe('VALIDATION_FAILED');
      expect(formatted.error.message).toBe('Validation failed for 2 field(s)');
      expect(formatted.error.details.errors).toEqual(errors);
      expect(formatted.error.details.count).toBe(2);
    });

    it('should handle empty error array', () => {
      const formatted = formatValidationErrors([]);

      expect(formatted.error.code).toBe('VALIDATION_FAILED');
      expect(formatted.error.message).toBe('Validation failed for 0 field(s)');
      expect(formatted.error.details.errors).toEqual([]);
      expect(formatted.error.details.count).toBe(0);
    });
  });

  describe('constants', () => {
    it('should export correct word count limits', () => {
      expect(MIN_WORDS_PER_SUBMISSION).toBe(1);
      expect(MAX_WORDS_PER_SUBMISSION).toBe(100);
    });

    it('should have consistent limits with seeding service', () => {
      // These should match the constants from SeedingService
      expect(MIN_WORDS_PER_SUBMISSION).toBe(1);
      expect(MAX_WORDS_PER_SUBMISSION).toBe(100);
    });
  });

  describe('error structure consistency', () => {
    it('should have consistent error structure across all validation functions', () => {
      const dateResult = validateDate('invalid');
      const wordsResult = validateWordArray([]);
      const countResult = validateWordCount(-1);

      const allErrors = [
        ...dateResult.errors,
        ...wordsResult.errors,
        ...countResult.errors,
      ];

      allErrors.forEach(error => {
        expect(error).toHaveProperty('code');
        expect(error).toHaveProperty('message');
        expect(error).toHaveProperty('field');
        expect(typeof error.code).toBe('string');
        expect(typeof error.message).toBe('string');
        expect(typeof error.field).toBe('string');
      });
    });

    it('should include details in error objects when appropriate', () => {
      const result = validateDate('invalid-date');

      expect(result.errors[0].details).toBeDefined();
      expect(result.errors[0].details?.expected).toBeDefined();
      expect(result.errors[0].details?.received).toBeDefined();
    });
  });
});
