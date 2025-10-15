/**
 * Test-friendly version of SeedingService that works without Redis
 * This version uses in-memory storage when Redis is not available
 * Now includes full cluster diversity implementation!
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

interface SeedData {
  seedHex: string;
  theme: string;
  poolsVersion: string;
  createdAt: number;
}

interface WordPool {
  version: string;
  themes: {
    [key: string]: {
      name: string;
      slots: {
        [slotName: string]: {
          words: string[];
          clusters: string[];
        };
      };
    };
  };
}

interface Lexicon {
  version: string;
  mappings: {
    [word: string]: {
      canonical: string;
      slot: string;
      cluster: string;
    };
  };
}

export class TestSeedingService {
  private wordPool: WordPool | null = null;
  private lexicon: Lexicon | null = null;
  private memoryStore = new Map<string, SeedData>();

  constructor() {
    this.loadWordPool();
    this.loadLexicon();
  }

  private async loadWordPool(): Promise<void> {
    try {
      const poolPath = path.join(process.cwd(), 'data/pools.v1.json');
      const poolData = await fs.readFile(poolPath, 'utf-8');
      this.wordPool = JSON.parse(poolData);

      const themeKeys = Object.keys(this.wordPool?.themes || {});
      const totalWords = themeKeys.reduce((sum, key) => {
        const theme = this.wordPool!.themes[key];
        const slotWords = Object.values(theme.slots).reduce(
          (slotSum, slot) => slotSum + slot.words.length,
          0
        );
        return sum + slotWords;
      }, 0);

      console.log(
        `TestSeedingService initialized with pools version ${this.wordPool?.version} (${themeKeys.length} themes, ${totalWords} words)`
      );
    } catch (error) {
      console.error('Failed to load word pool:', error);
      throw new Error('Word pool initialization failed');
    }
  }

  private async loadLexicon(): Promise<void> {
    try {
      const lexiconPath = path.join(process.cwd(), 'data/lexicon.map.json');
      const lexiconData = await fs.readFile(lexiconPath, 'utf-8');
      this.lexicon = JSON.parse(lexiconData);
      console.log(
        `TestSeedingService loaded lexicon version ${this.lexicon?.version} (${Object.keys(this.lexicon?.mappings || {}).length} words)`
      );
    } catch (error) {
      console.error('Failed to load lexicon:', error);
      throw new Error('Lexicon initialization failed');
    }
  }

  /**
   * Generate a deterministic daily seed for the given date
   */
  async generateDailySeed(date: string): Promise<SeedData> {
    this.validateDate(date);

    // Check if seed already exists in memory
    const existingSeed = this.memoryStore.get(`seed:${date}`);
    if (existingSeed) {
      return existingSeed;
    }

    if (!this.wordPool) {
      throw new Error('Word pool not initialized');
    }

    const dailySeedSecret = process.env.DAILY_SEED_SECRET;
    if (!dailySeedSecret) {
      throw new Error('DAILY_SEED_SECRET environment variable is required');
    }

    // Generate deterministic seed using HMAC-SHA256
    const hmac = crypto.createHmac('sha256', dailySeedSecret);
    hmac.update(date);
    const seedHex = hmac.digest('hex');

    // Select theme deterministically based on seed
    const themeKeys = Object.keys(this.wordPool.themes);
    const themeIndex = parseInt(seedHex.substring(0, 8), 16) % themeKeys.length;
    const themeKey = themeKeys[themeIndex];
    const theme = this.wordPool.themes[themeKey].name;

    const seedData: SeedData = {
      seedHex,
      theme,
      poolsVersion: this.wordPool.version,
      createdAt: Date.now(),
    };

    // Store in memory
    this.memoryStore.set(`seed:${date}`, seedData);

    return seedData;
  }

  /**
   * Generate deterministic words for a user on a specific date
   * NOW WITH CLUSTER DIVERSITY!
   */
  async generateUserWords(
    userId: string,
    date: string,
    count: number
  ): Promise<string[]> {
    this.validateUserId(userId);
    this.validateDate(date);
    this.validateCount(count);

    if (!this.wordPool) {
      throw new Error('Word pool not initialized');
    }

    if (!this.lexicon) {
      throw new Error('Lexicon not initialized');
    }

    // Get or generate daily seed
    const seedData = await this.generateDailySeed(date);

    // Create user-specific seed by combining daily seed with user ID
    const userSeed = crypto
      .createHash('sha256')
      .update(seedData.seedHex + userId)
      .digest('hex');

    // Get all words from the selected theme
    const themeEntry = Object.values(this.wordPool.themes).find(
      t => t.name === seedData.theme
    );
    if (!themeEntry) {
      throw new Error(`Theme "${seedData.theme}" not found in word pool`);
    }

    // Collect all words from all slots with their clusters
    const availableWords: Array<{ word: string; cluster: string }> = [];
    Object.values(themeEntry.slots).forEach(slot => {
      slot.words.forEach(word => {
        const lexEntry = this.lexicon!.mappings[word];
        if (lexEntry) {
          availableWords.push({ word, cluster: lexEntry.cluster });
        }
      });
    });

    const selectedWords: string[] = [];
    const usedClusters = new Set<string>();

    // Use the user seed to deterministically select words with cluster diversity
    let seedIndex = 0;
    let attempts = 0;
    const maxAttempts = availableWords.length * 3; // Prevent infinite loops

    while (
      selectedWords.length < count &&
      availableWords.length > 0 &&
      attempts < maxAttempts
    ) {
      attempts++;

      // Get next 8 characters from seed (wrapping around if needed)
      const seedChunk = userSeed.substring(
        seedIndex % (userSeed.length - 7),
        (seedIndex % (userSeed.length - 7)) + 8
      );
      const randomValue = parseInt(seedChunk, 16);
      const wordIndex = randomValue % availableWords.length;

      const candidate = availableWords[wordIndex];

      // Check if cluster is already used (1-per-cluster constraint)
      if (!usedClusters.has(candidate.cluster)) {
        // Accept this word
        selectedWords.push(candidate.word);
        usedClusters.add(candidate.cluster);
        availableWords.splice(wordIndex, 1);
      } else {
        // Skip this word but don't remove it yet (might need it if we run out of unique clusters)
        // Just try the next one
      }

      seedIndex += 8;

      // If we've tried many times and still haven't filled the count,
      // allow duplicate clusters to fill remaining slots
      if (
        attempts > maxAttempts / 2 &&
        selectedWords.length < count &&
        availableWords.length > 0
      ) {
        // Just take whatever is available (use safe index)
        const safeIndex = Math.min(wordIndex, availableWords.length - 1);
        selectedWords.push(availableWords[safeIndex].word);
        availableWords.splice(safeIndex, 1);
      }
    }

    return selectedWords.slice(0, count); // Ensure we return exactly 'count' words
  }

  private validateDate(date: string): void {
    if (!date || typeof date !== 'string') {
      throw new Error('date must be a non-empty string');
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error('date must be in YYYY-MM-DD format');
    }

    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      throw new Error('date must be a valid date');
    }
  }

  private validateUserId(userId: string): void {
    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
      throw new Error('userId must be a non-empty string');
    }
  }

  private validateCount(count: number): void {
    if (typeof count !== 'number' || count < 1 || count > 100) {
      throw new Error('count must be a number between 1 and 100');
    }
  }
}
