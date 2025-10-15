/**
 * Seeding Service - Main Orchestrator for Deterministic Word Generation
 *
 * This service coordinates all components of the seeding engine to generate
 * unique, reproducible word sets for each user on each day. It combines:
 * - CryptoService for seed generation
 * - PRNG for deterministic randomization
 * - WordSelectionService for balanced word selection
 * - DataService for seed persistence
 *
 * Key Features:
 * - Deterministic: Same user + date always produces same words
 * - Fair: Balanced slot coverage and cluster diversity
 * - Auditable: Seeds stored in Redis for debugging
 * - Fast: Sub-millisecond word generation
 *
 * Word Generation Flow:
 * 1. Generate or retrieve daily seed from Redis
 * 2. Generate user-specific seed from daily seed + userId
 * 3. Initialize PRNG with user seed
 * 4. Apply selection algorithms:
 *    - Slot coverage (1+ word per semantic slot)
 *    - Diversity selection (fill remaining budget)
 *    - Wildcard selection (2-3 random words)
 * 5. Return final word array
 *
 * @example
 * ```typescript
 * const seedingService = new SeedingService(dataService);
 *
 * // Generate words for a user
 * const words = await seedingService.generateUserWords('user123', '2025-10-15', 12);
 * // Returns: ['neon', 'glowing', 'rain', 'mysterious', 'wet', ...]
 *
 * // Same user + date = same words (deterministic)
 * const words2 = await seedingService.generateUserWords('user123', '2025-10-15', 12);
 * console.log(words === words2); // true (arrays are equal)
 * ```
 */

import fs from 'fs';
import path from 'path';
import type { RedisClient } from '@devvit/web/server';
import { CryptoService } from './crypto.service.js';
import { PRNG } from './prng.service.js';
import { WordSelectionService } from './word-selection.service.js';
import { DataService } from './data.service.js';
import { WordPools, Theme, LexiconMap } from '../types/seeding.types.js';
import { SeedData } from '../types/data.types.js';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MIN_WORD_COUNT = 1;
const MAX_WORD_COUNT = 100;
const DEFAULT_WORD_COUNT = 12;
const WILDCARD_COUNT = 2;

/**
 * Check if debug logging is enabled via DEBUG_SEEDING environment variable.
 */
function isDebugEnabled(): boolean {
  return process.env.DEBUG_SEEDING === 'true';
}

/**
 * Hash a user ID for logging (first 8 characters).
 * Ensures no raw user IDs are logged.
 */
function hashUserIdForLog(userId: string): string {
  return userId.substring(0, 8) + '...';
}

/**
 * SeedingService orchestrates deterministic word generation for the Beef game.
 *
 * This is the main entry point for word generation. It loads word pools and lexicon
 * at startup, validates environment configuration, and provides a clean API for
 * generating user-specific word sets.
 */
export class SeedingService {
  private readonly crypto: CryptoService;
  private readonly pools: WordPools;
  private readonly lexicon: LexiconMap;
  private readonly dataService: DataService;
  private readonly wordSelection: WordSelectionService;

  /**
   * Creates a new SeedingService instance.
   *
   * Validates DAILY_SEED_SECRET environment variable and loads word pools
   * and lexicon from data files. Throws errors if configuration is invalid
   * or files are missing/malformed.
   *
   * @param redis - Redis client for seed persistence
   * @throws {Error} If DAILY_SEED_SECRET is missing
   * @throws {Error} If pool or lexicon files are missing or malformed
   *
   * @example
   * ```typescript
   * const seedingService = new SeedingService(redis);
   * // Service is ready to generate words
   * ```
   */
  constructor(redis: RedisClient) {
    // Validate DAILY_SEED_SECRET
    const secret = process.env.DAILY_SEED_SECRET;
    if (!secret) {
      throw new Error(
        'DAILY_SEED_SECRET environment variable is required. ' +
          'Please set this to a long, random string (64 characters recommended) ' +
          'in your environment configuration.'
      );
    }

    // Initialize services
    this.crypto = new CryptoService(secret);
    this.dataService = new DataService(redis);
    this.wordSelection = new WordSelectionService();

    // Load pools and lexicon
    this.pools = this.loadPools();
    this.lexicon = this.loadLexicon();

    console.log(
      `SeedingService initialized with pools version ${this.pools.version} ` +
        `(${Object.keys(this.pools.themes).length} themes, ` +
        `${Object.keys(this.lexicon.mappings).length} words)`
    );
  }

  /**
   * Generates daily seed and stores it in Redis.
   *
   * Creates a deterministic seed for the given date using HMAC-SHA256.
   * Selects a daily theme deterministically from the seed. Stores the
   * SeedData in Redis for auditability and retrieval.
   *
   * @param date - Date in YYYY-MM-DD format
   * @returns SeedData object containing seed, theme, and metadata
   * @throws {Error} If date format is invalid
   * @throws {Error} If Redis operation fails
   *
   * @example
   * ```typescript
   * const seedData = await seedingService.generateDailySeed('2025-10-15');
   * // Returns: {
   * //   seedHex: '8d23abc...',
   * //   theme: 'Nocturnal Cities',
   * //   poolsVersion: 'v1',
   * //   createdAt: 1729036800
   * // }
   * ```
   */
  async generateDailySeed(date: string): Promise<SeedData> {
    try {
      this.validateDate(date);

      const seedHex = this.crypto.generateDailySeed(date);
      const theme = this.selectDailyTheme(seedHex);

      const seedData: SeedData = {
        seedHex,
        theme: theme.name,
        poolsVersion: this.pools.version,
        createdAt: Math.floor(Date.now() / 1000),
      };

      await this.dataService.setSeed(date, seedData);

      // Structured logging: date, seedPreview, theme
      console.log(
        JSON.stringify({
          operation: 'generateDailySeed',
          date,
          seedPreview: seedHex.substring(0, 8),
          theme: theme.name,
          poolsVersion: this.pools.version,
          timestamp: new Date().toISOString(),
        })
      );

      return seedData;
    } catch (error) {
      // Error logging with full context
      console.error(
        JSON.stringify({
          operation: 'generateDailySeed',
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          inputs: { date },
          timestamp: new Date().toISOString(),
        })
      );
      throw error;
    }
  }

  /**
   * Generates user-specific word set.
   *
   * This is the main word generation method. It orchestrates the full flow:
   * 1. Get or create daily seed
   * 2. Generate user-specific seed
   * 3. Initialize PRNG
   * 4. Apply selection algorithms (slot coverage, diversity, wildcards)
   * 5. Return final word array
   *
   * The method is deterministic: same userId + date always produces same words.
   *
   * @param userId - User identifier (typically hashed user ID)
   * @param date - Date in YYYY-MM-DD format
   * @param count - Number of words to generate (default: 12, max: 100)
   * @returns Array of selected words
   * @throws {Error} If inputs are invalid
   * @throws {Error} If Redis operations fail
   *
   * @example
   * ```typescript
   * const words = await seedingService.generateUserWords('user123', '2025-10-15', 12);
   * // Returns: ['neon', 'glowing', 'rain', 'mysterious', 'wet', ...]
   *
   * // Deterministic - same inputs produce same outputs
   * const words2 = await seedingService.generateUserWords('user123', '2025-10-15', 12);
   * console.log(JSON.stringify(words) === JSON.stringify(words2)); // true
   * ```
   */
  async generateUserWords(
    userId: string,
    date: string,
    count: number = DEFAULT_WORD_COUNT
  ): Promise<string[]> {
    try {
      this.validateInputs(userId, date, count);

      // Hash userId for logging AFTER validation
      const userIdHash = hashUserIdForLog(userId);

      // Get or create daily seed
      let seedData = await this.dataService.getSeed(date);
      if (!seedData) {
        seedData = await this.generateDailySeed(date);
      }

      // Generate user-specific seed
      const userSeed = this.crypto.generateUserSeed(seedData.seedHex, userId);
      const seed64 = this.crypto.seedToInt64(userSeed);

      if (isDebugEnabled()) {
        console.log(
          JSON.stringify({
            debug: 'generateUserWords:init',
            userIdHash,
            date,
            count,
            userSeedPreview: userSeed.substring(0, 8),
            seed64: seed64.toString(),
            theme: seedData.theme,
            timestamp: new Date().toISOString(),
          })
        );
      }

      // Initialize PRNG
      const prng = new PRNG(seed64);

      // Get theme
      const theme = this.getTheme(seedData.theme);

      // Apply selection algorithms
      const usedClusters = new Set<string>();
      const selected: string[] = [];

      // 1. Slot coverage - ensure at least one word from each semantic slot
      const slotWords = this.wordSelection.selectSlotCoverage(
        theme,
        prng,
        usedClusters
      );
      selected.push(...slotWords);

      if (isDebugEnabled()) {
        console.log(
          JSON.stringify({
            debug: 'generateUserWords:slotCoverage',
            userIdHash,
            slotWords,
            usedClusters: Array.from(usedClusters),
            timestamp: new Date().toISOString(),
          })
        );
      }

      // 2. Fill remaining budget with diverse words (reserve space for wildcards)
      const remaining = count - selected.length - WILDCARD_COUNT;
      if (remaining > 0) {
        const allWords = this.wordSelection.getAllWords(theme);
        const diverse = this.wordSelection.selectWithDiversity(
          allWords,
          remaining,
          prng,
          usedClusters,
          this.lexicon
        );
        selected.push(...diverse);

        if (isDebugEnabled()) {
          console.log(
            JSON.stringify({
              debug: 'generateUserWords:diversity',
              userIdHash,
              diverseWords: diverse,
              usedClusters: Array.from(usedClusters),
              timestamp: new Date().toISOString(),
            })
          );
        }
      }

      // 3. Add wildcard words for variety
      const wildcardCount = Math.min(WILDCARD_COUNT, count - selected.length);
      if (wildcardCount > 0) {
        const allWords = this.wordSelection.getAllWords(theme);
        const wildcards = this.wordSelection.selectWildcards(
          allWords,
          wildcardCount,
          prng,
          new Set(selected),
          usedClusters,
          this.lexicon
        );
        selected.push(...wildcards);

        if (isDebugEnabled()) {
          console.log(
            JSON.stringify({
              debug: 'generateUserWords:wildcards',
              userIdHash,
              wildcards,
              usedClusters: Array.from(usedClusters),
              timestamp: new Date().toISOString(),
            })
          );
        }
      }

      // Ensure we don't exceed requested count
      const finalWords = selected.slice(0, count);

      // Structured logging: userIdHash, date, count, words
      console.log(
        JSON.stringify({
          operation: 'generateUserWords',
          userIdHash,
          date,
          count: finalWords.length,
          words: finalWords,
          timestamp: new Date().toISOString(),
        })
      );

      return finalWords;
    } catch (error) {
      // Error logging with full context
      // Safely hash userId only if it's a valid string
      const safeUserIdHash =
        typeof userId === 'string' && userId.length > 0
          ? hashUserIdForLog(userId)
          : String(userId);

      console.error(
        JSON.stringify({
          operation: 'generateUserWords',
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          inputs: {
            userIdHash: safeUserIdHash,
            date,
            count,
          },
          timestamp: new Date().toISOString(),
        })
      );
      throw error;
    }
  }

  /**
   * Loads word pools from data/pools.v1.json.
   *
   * Reads and parses the JSON file at startup. Throws error if file is
   * missing or malformed.
   *
   * @returns Parsed WordPools object
   * @throws {Error} If file is missing or JSON is invalid
   * @private
   */
  private loadPools(): WordPools {
    try {
      // Use process.cwd() to get project root (works in both dev and production)
      const poolsPath = path.join(process.cwd(), 'data/pools.v1.json');
      const data = fs.readFileSync(poolsPath, 'utf-8');
      const pools = JSON.parse(data) as WordPools;

      // Basic validation
      if (
        !pools.version ||
        !pools.themes ||
        Object.keys(pools.themes).length === 0
      ) {
        throw new Error('Invalid pools structure: missing version or themes');
      }

      return pools;
    } catch (error) {
      console.error(
        JSON.stringify({
          operation: 'loadPools',
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          path: 'data/pools.v1.json',
          timestamp: new Date().toISOString(),
        })
      );
      throw new Error(
        `Failed to load word pools from data/pools.v1.json: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Loads lexicon mappings from data/lexicon.map.json.
   *
   * Reads and parses the JSON file at startup. Throws error if file is
   * missing or malformed.
   *
   * @returns Parsed LexiconMap object
   * @throws {Error} If file is missing or JSON is invalid
   * @private
   */
  private loadLexicon(): LexiconMap {
    try {
      // Use process.cwd() to get project root (works in both dev and production)
      const lexiconPath = path.join(process.cwd(), 'data/lexicon.map.json');
      const data = fs.readFileSync(lexiconPath, 'utf-8');
      const lexicon = JSON.parse(data) as LexiconMap;

      // Basic validation
      if (!lexicon.version || !lexicon.mappings) {
        throw new Error(
          'Invalid lexicon structure: missing version or mappings'
        );
      }

      return lexicon;
    } catch (error) {
      console.error(
        JSON.stringify({
          operation: 'loadLexicon',
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          path: 'data/lexicon.map.json',
          timestamp: new Date().toISOString(),
        })
      );
      throw new Error(
        `Failed to load lexicon from data/lexicon.map.json: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Selects daily theme deterministically from seed.
   *
   * Uses the first 8 hex characters of the seed to select a theme.
   * This ensures the same seed always produces the same theme.
   *
   * @param seedHex - Hexadecimal seed string
   * @returns Selected Theme object
   * @private
   */
  private selectDailyTheme(seedHex: string): Theme {
    const themeKeys = Object.keys(this.pools.themes);
    const index = parseInt(seedHex.substring(0, 8), 16) % themeKeys.length;
    return this.pools.themes[themeKeys[index]];
  }

  /**
   * Retrieves theme by name.
   *
   * @param themeName - Name of the theme to retrieve
   * @returns Theme object
   * @throws {Error} If theme is not found
   * @private
   */
  private getTheme(themeName: string): Theme {
    for (const themeKey of Object.keys(this.pools.themes)) {
      const theme = this.pools.themes[themeKey];
      if (theme.name === themeName) {
        return theme;
      }
    }

    const error = new Error(`Theme "${themeName}" not found in word pools`);
    console.error(
      JSON.stringify({
        operation: 'getTheme',
        error: error.message,
        inputs: { themeName },
        availableThemes: Object.keys(this.pools.themes).map(
          key => this.pools.themes[key].name
        ),
        timestamp: new Date().toISOString(),
      })
    );
    throw error;
  }

  /**
   * Validates date format.
   *
   * Ensures date is in YYYY-MM-DD format.
   *
   * @param date - Date string to validate
   * @throws {Error} If date format is invalid
   * @private
   */
  private validateDate(date: string): void {
    if (!date || typeof date !== 'string') {
      throw new Error('date must be a non-empty string');
    }

    if (!DATE_REGEX.test(date)) {
      throw new Error('date must be in YYYY-MM-DD format (e.g., "2025-10-15")');
    }
  }

  /**
   * Validates all inputs for generateUserWords.
   *
   * Ensures userId, date, and count are valid.
   *
   * @param userId - User identifier to validate
   * @param date - Date string to validate
   * @param count - Word count to validate
   * @throws {Error} If any input is invalid
   * @private
   */
  private validateInputs(userId: string, date: string, count: number): void {
    if (!userId || typeof userId !== 'string' || userId.length === 0) {
      throw new Error('userId must be a non-empty string');
    }

    this.validateDate(date);

    if (
      typeof count !== 'number' ||
      count < MIN_WORD_COUNT ||
      count > MAX_WORD_COUNT
    ) {
      throw new Error(
        `count must be a number between ${MIN_WORD_COUNT} and ${MAX_WORD_COUNT} (got ${count})`
      );
    }
  }
}
