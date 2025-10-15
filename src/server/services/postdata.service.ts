/**
 * PostData Service for Client Data Generation
 *
 * Generates PostData objects that are embedded in Reddit posts for initial client rendering.
 * Must stay within the 2KB Devvit platform limit through intelligent truncation.
 *
 * Key Features:
 * - Calculates time remaining until 23:00 Bangkok time (UTC+7)
 * - Truncates teaserTop array iteratively to fit 2KB limit
 * - Validates PostData structure and size
 * - Measures UTF-8 byte size accurately
 *
 * @example
 * ```typescript
 * const postData = PostDataService.generate(
 *   '2025-10-14',
 *   'Nocturnal Cities',
 *   '8d23abc1234567890abcdef',
 *   [
 *     { word: 'neon', count: 42 },
 *     { word: 'rain', count: 38 },
 *     { word: 'alley', count: 35 }
 *   ]
 * );
 * // Returns PostData within 2KB limit
 * ```
 */

import { PostData, TallyEntry } from '../types/data.types';

/**
 * PostDataService generates client-facing PostData within the 2KB platform limit.
 *
 * All methods are static as the service maintains no state.
 */
export class PostDataService {
  /** Maximum allowed size for PostData in bytes (Devvit platform constraint) */
  private static readonly MAX_SIZE_BYTES = 2000;

  /** Bangkok timezone offset in minutes (UTC+7) */
  private static readonly BANGKOK_TZ_OFFSET_MINUTES = 7 * 60;

  /**
   * Generates PostData for client consumption, ensuring it stays within 2KB limit.
   *
   * The method iteratively truncates the teaserTop array if the serialized PostData
   * exceeds the size limit. Top words are prioritized (kept first).
   *
   * @param date - Date in YYYY-MM-DD format
   * @param theme - Daily theme describing the word pool category
   * @param seedHex - Full seed hex string (will be truncated to 8 chars for preview)
   * @param topWords - Array of top-voted words with counts (sorted by count descending)
   * @returns PostData object guaranteed to be ≤ 2KB when serialized
   * @throws {Error} If PostData exceeds 2KB even with minimal content (no teaserTop words)
   *
   * @example
   * ```typescript
   * const postData = PostDataService.generate(
   *   '2025-10-14',
   *   'Nocturnal Cities',
   *   '8d23abc1234567890abcdef',
   *   [
   *     { word: 'neon', count: 42 },
   *     { word: 'rain', count: 38 }
   *   ]
   * );
   * console.log(postData.seedPreview); // '8d23abc1'
   * console.log(postData.teaserTop); // ['neon', 'rain']
   * ```
   */
  static generate(
    date: string,
    theme: string,
    seedHex: string,
    topWords: TallyEntry[]
  ): PostData {
    const timeLeftSec = this.calculateTimeLeft(date);
    const seedPreview = seedHex.substring(0, 8);

    // Start with all top words
    let teaserTop = topWords.map((t) => t.word);

    // Build initial PostData
    let postData: PostData = {
      date,
      theme,
      seedPreview,
      teaserTop,
      timeLeftSec,
    };

    // Iteratively truncate teaserTop if size exceeds limit
    while (
      this.getSize(postData) > this.MAX_SIZE_BYTES &&
      teaserTop.length > 0
    ) {
      teaserTop = teaserTop.slice(0, -1);
      postData = { ...postData, teaserTop };
    }

    // Verify we're within limit even after truncation
    const finalSize = this.getSize(postData);
    if (finalSize > this.MAX_SIZE_BYTES) {
      throw new Error(
        `PostData exceeds ${this.MAX_SIZE_BYTES} bytes (${finalSize} bytes) even with minimal content`
      );
    }

    return postData;
  }

  /**
   * Calculates the UTF-8 byte size of PostData when JSON serialized.
   *
   * Uses Buffer.byteLength to accurately measure UTF-8 encoding size,
   * which is critical for multi-byte characters.
   *
   * @param data - PostData object to measure
   * @returns Size in bytes of the JSON-serialized PostData
   * @private
   *
   * @example
   * ```typescript
   * const size = PostDataService.getSize(postData);
   * console.log(size); // 1847 (bytes)
   * ```
   */
  private static getSize(data: PostData): number {
    const json = JSON.stringify(data);
    return Buffer.byteLength(json, 'utf8');
  }

  /**
   * Calculates seconds remaining until 23:00 Bangkok time (UTC+7) on the given date.
   *
   * If the current time is already past 23:00 Bangkok on the given date,
   * returns 0 (not negative).
   *
   * @param date - Date in YYYY-MM-DD format
   * @returns Seconds remaining until 23:00 Bangkok time, or 0 if already past
   * @private
   *
   * @example
   * ```typescript
   * // Current time: 2025-10-14 15:00:00 UTC (22:00 Bangkok)
   * const timeLeft = PostDataService.calculateTimeLeft('2025-10-14');
   * console.log(timeLeft); // 3600 (1 hour remaining)
   * ```
   */
  private static calculateTimeLeft(date: string): number {
    // Parse date and set time to 23:00 in Bangkok timezone (UTC+7)
    const targetDate = new Date(`${date}T23:00:00+07:00`);
    const now = new Date();

    const diffMs = targetDate.getTime() - now.getTime();

    // Return 0 if time has already passed (don't return negative)
    return Math.max(0, Math.floor(diffMs / 1000));
  }

  /**
   * Validates PostData structure and size constraints.
   *
   * Useful for testing and debugging. Checks:
   * - Size is within 2KB limit
   * - Date format is YYYY-MM-DD
   * - timeLeftSec is non-negative
   *
   * @param data - PostData object to validate
   * @returns Validation result with size and any error messages
   *
   * @example
   * ```typescript
   * const result = PostDataService.validate(postData);
   * if (!result.valid) {
   *   console.error('Validation errors:', result.errors);
   * }
   * console.log('PostData size:', result.size, 'bytes');
   * ```
   */
  static validate(data: PostData): {
    valid: boolean;
    size: number;
    errors: string[];
  } {
    const errors: string[] = [];
    const size = this.getSize(data);

    // Check size constraint
    if (size > this.MAX_SIZE_BYTES) {
      errors.push(
        `Size ${size} bytes exceeds limit of ${this.MAX_SIZE_BYTES} bytes`
      );
    }

    // Check date format (YYYY-MM-DD)
    if (!data.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
      errors.push('Invalid date format (expected YYYY-MM-DD)');
    }

    // Check timeLeftSec is non-negative
    if (data.timeLeftSec < 0) {
      errors.push('timeLeftSec cannot be negative');
    }

    return {
      valid: errors.length === 0,
      size,
      errors,
    };
  }
}
