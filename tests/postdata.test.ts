import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PostDataService } from '../src/server/services/postdata.service';
import { TallyEntry } from '../src/server/types/data.types';

/**
 * Unit tests for PostData Service
 *
 * These tests verify:
 * - generate() creates valid PostData structure
 * - getSize() correctly measures UTF-8 byte size
 * - calculateTimeLeft() returns correct seconds until 23:00 Bangkok
 * - Truncation logic when content exceeds 2KB
 * - validate() catches invalid date formats
 * - validate() catches negative timeLeftSec
 * - seedPreview is first 8 characters of seedHex
 */

describe('PostDataService', () => {
  const MOCK_DATE = '2025-10-14';
  const MOCK_THEME = 'Nocturnal Cities';
  const MOCK_SEED_HEX = '8d23abc1234567890abcdef1234567890abcdef1234567890abcdef12345678';
  const MOCK_TOP_WORDS: TallyEntry[] = [
    { word: 'neon', count: 42 },
    { word: 'rain', count: 38 },
    { word: 'alley', count: 35 },
    { word: 'midnight', count: 32 },
    { word: 'glow', count: 28 },
  ];

  describe('generate()', () => {
    it('should create valid PostData structure with all required fields', () => {
      const postData = PostDataService.generate(
        MOCK_DATE,
        MOCK_THEME,
        MOCK_SEED_HEX,
        MOCK_TOP_WORDS
      );

      expect(postData).toHaveProperty('date');
      expect(postData).toHaveProperty('theme');
      expect(postData).toHaveProperty('seedPreview');
      expect(postData).toHaveProperty('teaserTop');
      expect(postData).toHaveProperty('timeLeftSec');

      expect(postData.date).toBe(MOCK_DATE);
      expect(postData.theme).toBe(MOCK_THEME);
      expect(Array.isArray(postData.teaserTop)).toBe(true);
      expect(typeof postData.timeLeftSec).toBe('number');
    });

    it('should extract seedPreview as first 8 characters of seedHex', () => {
      const postData = PostDataService.generate(
        MOCK_DATE,
        MOCK_THEME,
        MOCK_SEED_HEX,
        MOCK_TOP_WORDS
      );

      expect(postData.seedPreview).toBe('8d23abc1');
      expect(postData.seedPreview).toHaveLength(8);
    });

    it('should handle seedHex shorter than 8 characters', () => {
      const shortSeed = '8d23';
      const postData = PostDataService.generate(
        MOCK_DATE,
        MOCK_THEME,
        shortSeed,
        MOCK_TOP_WORDS
      );

      expect(postData.seedPreview).toBe('8d23');
    });

    it('should include all top words in teaserTop when size permits', () => {
      const postData = PostDataService.generate(
        MOCK_DATE,
        MOCK_THEME,
        MOCK_SEED_HEX,
        MOCK_TOP_WORDS
      );

      expect(postData.teaserTop).toEqual(['neon', 'rain', 'alley', 'midnight', 'glow']);
    });

    it('should stay within 2KB size limit', () => {
      const postData = PostDataService.generate(
        MOCK_DATE,
        MOCK_THEME,
        MOCK_SEED_HEX,
        MOCK_TOP_WORDS
      );

      const size = Buffer.byteLength(JSON.stringify(postData), 'utf8');
      expect(size).toBeLessThanOrEqual(2000);
    });

    it('should truncate teaserTop when content exceeds 2KB', () => {
      // Create a large array of words that will exceed 2KB
      const largeWordList: TallyEntry[] = [];
      for (let i = 0; i < 500; i++) {
        largeWordList.push({
          word: `verylongwordname${i}withextracharacters`,
          count: 500 - i,
        });
      }

      const postData = PostDataService.generate(
        MOCK_DATE,
        MOCK_THEME,
        MOCK_SEED_HEX,
        largeWordList
      );

      const size = Buffer.byteLength(JSON.stringify(postData), 'utf8');
      expect(size).toBeLessThanOrEqual(2000);
      expect(postData.teaserTop.length).toBeLessThan(largeWordList.length);
    });

    it('should prioritize top words when truncating (keep first words)', () => {
      // Create a large array that will require truncation
      const largeWordList: TallyEntry[] = [];
      for (let i = 0; i < 300; i++) {
        largeWordList.push({
          word: `word${i}withsomeextracharacters`,
          count: 300 - i,
        });
      }

      const postData = PostDataService.generate(
        MOCK_DATE,
        MOCK_THEME,
        MOCK_SEED_HEX,
        largeWordList
      );

      // First word should always be included (highest count)
      expect(postData.teaserTop[0]).toBe('word0withsomeextracharacters');

      // Verify words are in order (not shuffled)
      for (let i = 1; i < postData.teaserTop.length; i++) {
        const expectedWord = `word${i}withsomeextracharacters`;
        expect(postData.teaserTop[i]).toBe(expectedWord);
      }
    });

    it('should throw error if PostData exceeds 2KB even with no teaserTop words', () => {
      // Create a theme that's extremely long to make base PostData exceed 2KB
      const hugeTheme = 'x'.repeat(2500);

      expect(() =>
        PostDataService.generate(MOCK_DATE, hugeTheme, MOCK_SEED_HEX, MOCK_TOP_WORDS)
      ).toThrow(/exceeds 2000 bytes.*even with minimal content/);
    });

    it('should handle empty topWords array', () => {
      const postData = PostDataService.generate(
        MOCK_DATE,
        MOCK_THEME,
        MOCK_SEED_HEX,
        []
      );

      expect(postData.teaserTop).toEqual([]);
      expect(postData.date).toBe(MOCK_DATE);
      expect(postData.theme).toBe(MOCK_THEME);
    });

    it('should handle UTF-8 multi-byte characters correctly', () => {
      const unicodeWords: TallyEntry[] = [
        { word: '日本語', count: 10 },
        { word: 'émojis', count: 9 },
        { word: '中文', count: 8 },
        { word: 'Ελληνικά', count: 7 },
      ];

      const postData = PostDataService.generate(
        MOCK_DATE,
        MOCK_THEME,
        MOCK_SEED_HEX,
        unicodeWords
      );

      const size = Buffer.byteLength(JSON.stringify(postData), 'utf8');
      expect(size).toBeLessThanOrEqual(2000);
      expect(postData.teaserTop).toContain('日本語');
    });
  });

  describe('calculateTimeLeft()', () => {
    beforeEach(() => {
      // Reset any time mocks before each test
      vi.useRealTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return positive seconds when time is before 23:00 Bangkok', () => {
      // Mock current time: 2025-10-14 10:00:00 UTC (17:00 Bangkok = UTC+7)
      // Target: 2025-10-14 23:00:00 Bangkok (16:00:00 UTC)
      const mockNow = new Date('2025-10-14T10:00:00Z');
      vi.setSystemTime(mockNow);

      const postData = PostDataService.generate(
        '2025-10-14',
        MOCK_THEME,
        MOCK_SEED_HEX,
        MOCK_TOP_WORDS
      );

      // 23:00 Bangkok = 16:00 UTC
      // Current: 10:00 UTC
      // Difference: 6 hours = 21600 seconds
      expect(postData.timeLeftSec).toBe(21600);
    });

    it('should return 0 when current time is past 23:00 Bangkok', () => {
      // Mock current time: 2025-10-14 17:00:00 UTC (00:00 next day Bangkok)
      const mockNow = new Date('2025-10-14T17:00:00Z');
      vi.setSystemTime(mockNow);

      const postData = PostDataService.generate(
        '2025-10-14',
        MOCK_THEME,
        MOCK_SEED_HEX,
        MOCK_TOP_WORDS
      );

      expect(postData.timeLeftSec).toBe(0);
    });

    it('should return 0 when current time is exactly 23:00 Bangkok', () => {
      // Mock current time: 2025-10-14 16:00:00 UTC (23:00 Bangkok)
      const mockNow = new Date('2025-10-14T16:00:00Z');
      vi.setSystemTime(mockNow);

      const postData = PostDataService.generate(
        '2025-10-14',
        MOCK_THEME,
        MOCK_SEED_HEX,
        MOCK_TOP_WORDS
      );

      expect(postData.timeLeftSec).toBe(0);
    });

    it('should calculate correct time remaining with minutes and seconds', () => {
      // Mock current time: 2025-10-14 15:30:45 UTC (22:30:45 Bangkok)
      // Target: 2025-10-14 23:00:00 Bangkok (16:00:00 UTC)
      // Difference: 29 minutes 15 seconds = 1755 seconds
      const mockNow = new Date('2025-10-14T15:30:45Z');
      vi.setSystemTime(mockNow);

      const postData = PostDataService.generate(
        '2025-10-14',
        MOCK_THEME,
        MOCK_SEED_HEX,
        MOCK_TOP_WORDS
      );

      expect(postData.timeLeftSec).toBe(1755);
    });

    it('should handle date in the past correctly', () => {
      // Current time is way past the target date
      const mockNow = new Date('2025-10-20T10:00:00Z');
      vi.setSystemTime(mockNow);

      const postData = PostDataService.generate(
        '2025-10-14',
        MOCK_THEME,
        MOCK_SEED_HEX,
        MOCK_TOP_WORDS
      );

      expect(postData.timeLeftSec).toBe(0);
    });

    it('should handle date in the future correctly', () => {
      // Mock current time: 2025-10-10 10:00:00 UTC
      // Target: 2025-10-14 23:00:00 Bangkok (2025-10-14 16:00:00 UTC)
      // Difference: 4 days + 6 hours = 4*86400 + 6*3600 = 367200 seconds
      const mockNow = new Date('2025-10-10T10:00:00Z');
      vi.setSystemTime(mockNow);

      const postData = PostDataService.generate(
        '2025-10-14',
        MOCK_THEME,
        MOCK_SEED_HEX,
        MOCK_TOP_WORDS
      );

      expect(postData.timeLeftSec).toBe(367200);
    });

    it('should always return integer seconds (no decimals)', () => {
      // Mock time with milliseconds
      const mockNow = new Date('2025-10-14T15:30:45.678Z');
      vi.setSystemTime(mockNow);

      const postData = PostDataService.generate(
        '2025-10-14',
        MOCK_THEME,
        MOCK_SEED_HEX,
        MOCK_TOP_WORDS
      );

      expect(Number.isInteger(postData.timeLeftSec)).toBe(true);
    });
  });

  describe('validate()', () => {
    it('should return valid=true for properly formatted PostData', () => {
      const postData = PostDataService.generate(
        MOCK_DATE,
        MOCK_THEME,
        MOCK_SEED_HEX,
        MOCK_TOP_WORDS
      );

      const result = PostDataService.validate(postData);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.size).toBeGreaterThan(0);
      expect(result.size).toBeLessThanOrEqual(2000);
    });

    it('should catch invalid date format (not YYYY-MM-DD)', () => {
      const invalidPostData = {
        date: '10/14/2025', // Wrong format
        theme: MOCK_THEME,
        seedPreview: '8d23abc1',
        teaserTop: ['neon', 'rain'],
        timeLeftSec: 3600,
      };

      const result = PostDataService.validate(invalidPostData);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid date format (expected YYYY-MM-DD)');
    });

    it('should catch date with wrong separator', () => {
      const invalidPostData = {
        date: '2025/10/14', // Wrong separator
        theme: MOCK_THEME,
        seedPreview: '8d23abc1',
        teaserTop: ['neon'],
        timeLeftSec: 3600,
      };

      const result = PostDataService.validate(invalidPostData);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid date format (expected YYYY-MM-DD)');
    });

    it('should catch date with missing leading zeros', () => {
      const invalidPostData = {
        date: '2025-1-4', // Missing leading zeros
        theme: MOCK_THEME,
        seedPreview: '8d23abc1',
        teaserTop: ['neon'],
        timeLeftSec: 3600,
      };

      const result = PostDataService.validate(invalidPostData);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid date format (expected YYYY-MM-DD)');
    });

    it('should catch negative timeLeftSec', () => {
      const invalidPostData = {
        date: MOCK_DATE,
        theme: MOCK_THEME,
        seedPreview: '8d23abc1',
        teaserTop: ['neon', 'rain'],
        timeLeftSec: -100, // Negative value
      };

      const result = PostDataService.validate(invalidPostData);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('timeLeftSec cannot be negative');
    });

    it('should allow timeLeftSec of 0', () => {
      const validPostData = {
        date: MOCK_DATE,
        theme: MOCK_THEME,
        seedPreview: '8d23abc1',
        teaserTop: ['neon'],
        timeLeftSec: 0, // Zero is valid
      };

      const result = PostDataService.validate(validPostData);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should catch PostData exceeding 2KB size limit', () => {
      const hugePostData = {
        date: MOCK_DATE,
        theme: 'x'.repeat(2500), // Make it huge
        seedPreview: '8d23abc1',
        teaserTop: ['neon'],
        timeLeftSec: 3600,
      };

      const result = PostDataService.validate(hugePostData);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toMatch(/exceeds limit of 2000 bytes/);
      expect(result.size).toBeGreaterThan(2000);
    });

    it('should return accurate size in bytes', () => {
      const postData = PostDataService.generate(
        MOCK_DATE,
        MOCK_THEME,
        MOCK_SEED_HEX,
        MOCK_TOP_WORDS
      );

      const result = PostDataService.validate(postData);
      const manualSize = Buffer.byteLength(JSON.stringify(postData), 'utf8');

      expect(result.size).toBe(manualSize);
    });

    it('should report multiple errors when multiple issues exist', () => {
      const invalidPostData = {
        date: 'invalid-date',
        theme: 'x'.repeat(2500),
        seedPreview: '8d23abc1',
        teaserTop: ['neon'],
        timeLeftSec: -50,
      };

      const result = PostDataService.validate(invalidPostData);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
      expect(result.errors).toContain('Invalid date format (expected YYYY-MM-DD)');
      expect(result.errors).toContain('timeLeftSec cannot be negative');
    });

    it('should correctly measure UTF-8 byte size for multi-byte characters', () => {
      const unicodePostData = {
        date: MOCK_DATE,
        theme: '日本語テーマ', // Multi-byte characters
        seedPreview: '8d23abc1',
        teaserTop: ['émoji', '中文'],
        timeLeftSec: 3600,
      };

      const result = PostDataService.validate(unicodePostData);
      const manualSize = Buffer.byteLength(JSON.stringify(unicodePostData), 'utf8');

      expect(result.size).toBe(manualSize);
      // UTF-8 size should be larger than character count
      expect(result.size).toBeGreaterThan(JSON.stringify(unicodePostData).length);
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle very long theme strings', () => {
      const longTheme = 'A'.repeat(500);
      const postData = PostDataService.generate(
        MOCK_DATE,
        longTheme,
        MOCK_SEED_HEX,
        MOCK_TOP_WORDS
      );

      const size = Buffer.byteLength(JSON.stringify(postData), 'utf8');
      expect(size).toBeLessThanOrEqual(2000);
    });

    it('should handle single word in topWords', () => {
      const singleWord: TallyEntry[] = [{ word: 'neon', count: 42 }];
      const postData = PostDataService.generate(
        MOCK_DATE,
        MOCK_THEME,
        MOCK_SEED_HEX,
        singleWord
      );

      expect(postData.teaserTop).toEqual(['neon']);
    });

    it('should handle words with special characters', () => {
      const specialWords: TallyEntry[] = [
        { word: "can't", count: 10 },
        { word: 'hello-world', count: 9 },
        { word: 'test@123', count: 8 },
      ];

      const postData = PostDataService.generate(
        MOCK_DATE,
        MOCK_THEME,
        MOCK_SEED_HEX,
        specialWords
      );

      expect(postData.teaserTop).toContain("can't");
      expect(postData.teaserTop).toContain('hello-world');
    });

    it('should handle very short seedHex', () => {
      const shortSeed = 'abc';
      const postData = PostDataService.generate(
        MOCK_DATE,
        MOCK_THEME,
        shortSeed,
        MOCK_TOP_WORDS
      );

      expect(postData.seedPreview).toBe('abc');
    });

    it('should handle empty seedHex', () => {
      const emptySeed = '';
      const postData = PostDataService.generate(
        MOCK_DATE,
        MOCK_THEME,
        emptySeed,
        MOCK_TOP_WORDS
      );

      expect(postData.seedPreview).toBe('');
    });
  });

  describe('Integration with real-world scenarios', () => {
    it('should generate PostData that matches expected structure for client', () => {
      const postData = PostDataService.generate(
        MOCK_DATE,
        MOCK_THEME,
        MOCK_SEED_HEX,
        MOCK_TOP_WORDS
      );

      // Verify structure matches what client expects
      expect(typeof postData.date).toBe('string');
      expect(typeof postData.theme).toBe('string');
      expect(typeof postData.seedPreview).toBe('string');
      expect(Array.isArray(postData.teaserTop)).toBe(true);
      expect(typeof postData.timeLeftSec).toBe('number');

      // Verify it's JSON serializable
      const json = JSON.stringify(postData);
      const parsed = JSON.parse(json);
      expect(parsed).toEqual(postData);
    });

    it('should handle realistic word counts (100+ words)', () => {
      const realisticWords: TallyEntry[] = [];
      for (let i = 0; i < 150; i++) {
        realisticWords.push({
          word: `word${i}`,
          count: 150 - i,
        });
      }

      const postData = PostDataService.generate(
        MOCK_DATE,
        MOCK_THEME,
        MOCK_SEED_HEX,
        realisticWords
      );

      const size = Buffer.byteLength(JSON.stringify(postData), 'utf8');
      expect(size).toBeLessThanOrEqual(2000);
      expect(postData.teaserTop.length).toBeGreaterThan(0);
    });

    it('should be deterministic (same input produces same output)', () => {
      const postData1 = PostDataService.generate(
        MOCK_DATE,
        MOCK_THEME,
        MOCK_SEED_HEX,
        MOCK_TOP_WORDS
      );

      const postData2 = PostDataService.generate(
        MOCK_DATE,
        MOCK_THEME,
        MOCK_SEED_HEX,
        MOCK_TOP_WORDS
      );

      // Note: timeLeftSec will differ if time passes between calls
      // So we compare everything except timeLeftSec
      expect(postData1.date).toBe(postData2.date);
      expect(postData1.theme).toBe(postData2.theme);
      expect(postData1.seedPreview).toBe(postData2.seedPreview);
      expect(postData1.teaserTop).toEqual(postData2.teaserTop);
    });
  });
});
