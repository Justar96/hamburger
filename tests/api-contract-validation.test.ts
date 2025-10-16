/**
 * Unit tests for API contract validation functions
 * 
 * These tests verify that the schema validation functions used in the
 * API contract tests work correctly without requiring a running server.
 */

import { describe, it, expect } from 'vitest';

// Schema validation helpers (copied from contract tests)
function validateErrorResponseSchema(data: any): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof data.error === 'object' &&
    data.error !== null &&
    typeof data.error.code === 'string' &&
    typeof data.error.message === 'string' &&
    typeof data.timestamp === 'number'
  );
}

function validateInitResponseSchema(data: any): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof data.seedPreview === 'string' &&
    Array.isArray(data.myWords) &&
    data.myWords.every((word: any) => typeof word === 'string') &&
    typeof data.progress === 'object' &&
    data.progress !== null &&
    Array.isArray(data.progress.top) &&
    typeof data.progress.totalVotes === 'number' &&
    typeof data.progress.uniqueVoters === 'number' &&
    typeof data.timeLeftSec === 'number' &&
    typeof data.timestamp === 'number'
  );
}

function validatePickResponseSchema(data: any): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof data.ok === 'boolean' &&
    Array.isArray(data.accepted) &&
    data.accepted.every((word: any) => typeof word === 'string') &&
    Array.isArray(data.top) &&
    data.top.every((entry: any) => 
      typeof entry === 'object' &&
      typeof entry.word === 'string' &&
      typeof entry.count === 'number'
    ) &&
    typeof data.timestamp === 'number'
  );
}

function validateProgressResponseSchema(data: any): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    Array.isArray(data.top) &&
    data.top.every((entry: any) => 
      typeof entry === 'object' &&
      typeof entry.word === 'string' &&
      typeof entry.count === 'number'
    ) &&
    Array.isArray(data.my) &&
    data.my.every((word: any) => typeof word === 'string') &&
    typeof data.timeLeftSec === 'number' &&
    typeof data.timestamp === 'number'
  );
}

describe('API Contract Validation Functions', () => {
  describe('validateErrorResponseSchema', () => {
    it('should validate correct error response structure', () => {
      const validErrorResponse = {
        error: {
          code: 'INVALID_DATE',
          message: 'Date must be in YYYY-MM-DD format',
          details: {
            field: 'date',
            expected: 'YYYY-MM-DD format',
            received: 'invalid-date'
          }
        },
        timestamp: Date.now(),
        requestId: 'test_123_abc'
      };

      expect(validateErrorResponseSchema(validErrorResponse)).toBe(true);
    });

    it('should reject invalid error response structures', () => {
      const invalidResponses = [
        null,
        undefined,
        {},
        { error: null },
        { error: {} },
        { error: { code: 'TEST' } }, // missing message
        { error: { message: 'test' } }, // missing code
        { error: { code: 123, message: 'test' } }, // wrong type for code
        { error: { code: 'TEST', message: 123 } }, // wrong type for message
        { timestamp: 'not-a-number' },
        { error: { code: 'TEST', message: 'test' } }, // missing timestamp
      ];

      invalidResponses.forEach(response => {
        expect(validateErrorResponseSchema(response)).toBe(false);
      });
    });
  });

  describe('validateInitResponseSchema', () => {
    it('should validate correct init response structure', () => {
      const validInitResponse = {
        seedPreview: '8d23abc1',
        myWords: ['neon', 'rain', 'alley'],
        progress: {
          top: [
            { word: 'cyber', count: 15 },
            { word: 'neon', count: 12 }
          ],
          totalVotes: 27,
          uniqueVoters: 8
        },
        timeLeftSec: 43200,
        timestamp: Date.now()
      };

      expect(validateInitResponseSchema(validInitResponse)).toBe(true);
    });

    it('should reject invalid init response structures', () => {
      const invalidResponses = [
        null,
        {},
        { seedPreview: 123 }, // wrong type
        { seedPreview: 'test', myWords: 'not-array' },
        { seedPreview: 'test', myWords: [123] }, // non-string in array
        { seedPreview: 'test', myWords: [], progress: null },
        { seedPreview: 'test', myWords: [], progress: { top: 'not-array' } },
        { seedPreview: 'test', myWords: [], progress: { top: [], totalVotes: 'not-number' } },
      ];

      invalidResponses.forEach(response => {
        expect(validateInitResponseSchema(response)).toBe(false);
      });
    });
  });

  describe('validatePickResponseSchema', () => {
    it('should validate correct pick response structure', () => {
      const validPickResponse = {
        ok: true,
        accepted: ['neon', 'cyber'],
        top: [
          { word: 'cyber', count: 16 },
          { word: 'neon', count: 13 }
        ],
        timestamp: Date.now()
      };

      expect(validatePickResponseSchema(validPickResponse)).toBe(true);
    });

    it('should reject invalid pick response structures', () => {
      const invalidResponses = [
        null,
        {},
        { ok: 'not-boolean' },
        { ok: true, accepted: 'not-array' },
        { ok: true, accepted: [123] }, // non-string in array
        { ok: true, accepted: [], top: 'not-array' },
        { ok: true, accepted: [], top: [{ word: 123 }] }, // wrong type in top array
      ];

      invalidResponses.forEach(response => {
        expect(validatePickResponseSchema(response)).toBe(false);
      });
    });
  });

  describe('validateProgressResponseSchema', () => {
    it('should validate correct progress response structure', () => {
      const validProgressResponse = {
        top: [
          { word: 'cyber', count: 16 },
          { word: 'neon', count: 13 }
        ],
        my: ['neon', 'rain'],
        timeLeftSec: 43200,
        timestamp: Date.now()
      };

      expect(validateProgressResponseSchema(validProgressResponse)).toBe(true);
    });

    it('should reject invalid progress response structures', () => {
      const invalidResponses = [
        null,
        {},
        { top: 'not-array' },
        { top: [{ word: 123 }] }, // wrong type in top array
        { top: [], my: 'not-array' },
        { top: [], my: [123] }, // non-string in my array
        { top: [], my: [], timeLeftSec: 'not-number' },
      ];

      invalidResponses.forEach(response => {
        expect(validateProgressResponseSchema(response)).toBe(false);
      });
    });
  });

  describe('Schema validation edge cases', () => {
    it('should handle empty arrays correctly', () => {
      const responseWithEmptyArrays = {
        top: [],
        my: [],
        timeLeftSec: 0,
        timestamp: Date.now()
      };

      expect(validateProgressResponseSchema(responseWithEmptyArrays)).toBe(true);
    });

    it('should handle optional fields correctly', () => {
      const errorWithoutDetails = {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Something went wrong'
        },
        timestamp: Date.now()
      };

      expect(validateErrorResponseSchema(errorWithoutDetails)).toBe(true);
    });

    it('should validate nested object structures strictly', () => {
      const responseWithInvalidNesting = {
        top: [
          { word: 'test', count: 5, extraField: 'should-not-break-validation' }
        ],
        my: ['test'],
        timeLeftSec: 100,
        timestamp: Date.now()
      };

      // Should still validate because we only check required fields
      expect(validateProgressResponseSchema(responseWithInvalidNesting)).toBe(true);
    });
  });
});