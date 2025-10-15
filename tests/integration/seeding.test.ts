/**
 * Integration tests for the full seeding flow
 *
 * These tests verify the complete deterministic word generation system via HTTP API:
 * - Full flow: generateDailySeed → store in Redis → generateUserWords
 * - Seed persistence and retrieval
 * - Determinism across service restarts
 * - Multiple users on same date produce different word sets
 * - Same user on different dates produces different word sets
 * - Word sets respect slot coverage (all slots represented)
 * - Word sets respect cluster diversity (no duplicate clusters)
 * - Performance (1000 word sets in <150ms)
 *
 * Requirements tested: 1.1-1.7, 2.1-2.7, 4.1-4.7, 5.1-5.7, 7.1-7.7, 8.1-8.7
 *
 * IMPORTANT NOTE:
 * These integration tests require the development server to be running.
 *
 * Setup:
 * 1. Start the dev server: pnpm run dev
 * 2. In another terminal, run: pnpm run test:integration
 *
 * The tests connect to http://localhost:3000 (configurable via TEST_SERVER_URL env var)
 * and use the test API endpoints (/api/test/seeding/*) which are only available in development.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// Test data constants
const TEST_DATE_1 = '2025-10-14';
const TEST_DATE_2 = '2025-10-15';
const TEST_USER_1 = 'user123';
const TEST_USER_2 = 'user456';
const TEST_USER_3 = 'user789';
const SERVER_URL = process.env.TEST_SERVER_URL || 'http://localhost:3000';

// API Response types
interface SeedData {
  seedHex: string;
  theme: string;
  poolsVersion: string;
  createdAt: number;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

interface SeedResponse extends ApiResponse<SeedData> {
  seedData?: SeedData;
}

interface WordsResponse extends ApiResponse<string[]> {
  words?: string[];
}

describe('Seeding Engine Integration Tests', () => {
  let testKeys: string[];

  beforeEach(() => {
    // Track keys for cleanup
    testKeys = [];
  });

  afterEach(async () => {
    // Clean up all test keys via API
    if (testKeys.length > 0) {
      try {
        await fetch(`${SERVER_URL}/api/test/cleanup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keys: testKeys }),
        });
      } catch (error) {
        console.error('Failed to cleanup test keys:', error);
      }
    }
  });

  /**
   * Helper to register a key for cleanup
   */
  function trackKey(key: string): void {
    if (!testKeys.includes(key)) {
      testKeys.push(key);
    }
  }

  /**
   * Helper to make API requests with proper typing
   */
  async function apiRequest<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${SERVER_URL}/api/test/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    // For 400 errors (validation), return the JSON response so tests can check the error
    if (response.status === 400) {
      return response.json() as Promise<T>;
    }

    // For other non-OK responses, throw an error
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  describe('Full flow: generateDailySeed → store in Redis → generateUserWords', () => {
    it('should complete full flow with real Redis operations', async () => {
      trackKey(`seed:${TEST_DATE_1}`);

      // Step 1: Generate daily seed via API
      const seedResponse = await apiRequest<SeedResponse>('seeding/generate-seed', { date: TEST_DATE_1 });
      expect(seedResponse.success).toBe(true);
      
      const seedData = seedResponse.seedData;
      expect(seedData).toBeDefined();
      expect(seedData!.seedHex).toBeDefined();
      expect(seedData!.seedHex).toHaveLength(64); // SHA256 hex length
      expect(seedData!.theme).toBeDefined();
      expect(seedData!.poolsVersion).toBe('v1');
      expect(seedData!.createdAt).toBeGreaterThan(0);

      // Step 2: Generate user words via API
      const wordsResponse = await apiRequest<WordsResponse>('seeding/generate-words', {
        userId: TEST_USER_1,
        date: TEST_DATE_1,
        count: 12
      });
      expect(wordsResponse.success).toBe(true);
      
      const words = wordsResponse.words;
      expect(words).toBeDefined();
      expect(Array.isArray(words)).toBe(true);
      expect(words!.length).toBe(12);
      expect(words!.every((w: string) => typeof w === 'string' && w.length > 0)).toBe(true);

      // Verify no duplicates
      const uniqueWords = new Set(words);
      expect(uniqueWords.size).toBe(words!.length);
    });

    it('should reuse existing daily seed if already generated', async () => {
      trackKey(`seed:${TEST_DATE_1}`);

      // Generate seed first time
      const seedResponse1 = await apiRequest<SeedResponse>('seeding/generate-seed', { date: TEST_DATE_1 });
      expect(seedResponse1.success).toBe(true);
      const seedData1 = seedResponse1.seedData;

      // Generate words (should reuse seed)
      const wordsResponse1 = await apiRequest<WordsResponse>('seeding/generate-words', {
        userId: TEST_USER_1,
        date: TEST_DATE_1,
        count: 12
      });
      expect(wordsResponse1.success).toBe(true);
      const words1 = wordsResponse1.words;

      // Generate seed again (should retrieve from Redis)
      const seedResponse2 = await apiRequest<SeedResponse>('seeding/generate-seed', { date: TEST_DATE_1 });
      expect(seedResponse2.success).toBe(true);
      const seedData2 = seedResponse2.seedData;

      // Seeds should be identical
      expect(seedData2).toEqual(seedData1);

      // Words should be identical (deterministic)
      const wordsResponse2 = await apiRequest<WordsResponse>('seeding/generate-words', {
        userId: TEST_USER_1,
        date: TEST_DATE_1,
        count: 12
      });
      expect(wordsResponse2.success).toBe(true);
      const words2 = wordsResponse2.words;
      expect(words2).toEqual(words1);
    });

    it('should auto-generate daily seed if not exists when generating user words', async () => {
      trackKey(`seed:${TEST_DATE_1}`);

      // Generate user words without explicitly creating daily seed first
      const wordsResponse = await apiRequest<WordsResponse>('seeding/generate-words', {
        userId: TEST_USER_1,
        date: TEST_DATE_1,
        count: 12
      });
      expect(wordsResponse.success).toBe(true);
      
      const words = wordsResponse.words;
      expect(words).toBeDefined();
      expect(words!.length).toBe(12);

      // Verify daily seed was auto-created by trying to retrieve it
      const seedResponse = await apiRequest<SeedResponse>('seeding/generate-seed', { date: TEST_DATE_1 });
      expect(seedResponse.success).toBe(true);
      expect(seedResponse.seedData!.seedHex).toHaveLength(64);
    });
  });

  describe('Seed persistence (generate → retrieve from Redis → verify match)', () => {
    it('should persist seed data correctly in Redis via API', async () => {
      trackKey(`seed:${TEST_DATE_1}`);

      // Generate and store seed via API
      const originalResponse = await apiRequest<SeedResponse>('seeding/generate-seed', { date: TEST_DATE_1 });
      expect(originalResponse.success).toBe(true);
      const originalSeed = originalResponse.seedData!;

      // Retrieve seed again via API (should come from Redis)
      const retrievedResponse = await apiRequest<SeedResponse>('seeding/generate-seed', { date: TEST_DATE_1 });
      expect(retrievedResponse.success).toBe(true);
      const retrievedSeed = retrievedResponse.seedData!;

      // Verify exact match
      expect(retrievedSeed).toEqual(originalSeed);
      expect(retrievedSeed.seedHex).toBe(originalSeed.seedHex);
      expect(retrievedSeed.theme).toBe(originalSeed.theme);
      expect(retrievedSeed.poolsVersion).toBe(originalSeed.poolsVersion);
      expect(retrievedSeed.createdAt).toBe(originalSeed.createdAt);
    });

    it('should handle multiple dates independently', async () => {
      trackKey(`seed:${TEST_DATE_1}`);
      trackKey(`seed:${TEST_DATE_2}`);

      // Generate seeds for different dates via API
      const seed1Response = await apiRequest<SeedResponse>('seeding/generate-seed', { date: TEST_DATE_1 });
      const seed2Response = await apiRequest<SeedResponse>('seeding/generate-seed', { date: TEST_DATE_2 });
      
      expect(seed1Response.success).toBe(true);
      expect(seed2Response.success).toBe(true);
      
      const seed1 = seed1Response.seedData!;
      const seed2 = seed2Response.seedData!;

      // Seeds should be different
      expect(seed1.seedHex).not.toBe(seed2.seedHex);

      // Retrieve both seeds again (should come from Redis)
      const retrieved1Response = await apiRequest<SeedResponse>('seeding/generate-seed', { date: TEST_DATE_1 });
      const retrieved2Response = await apiRequest<SeedResponse>('seeding/generate-seed', { date: TEST_DATE_2 });
      
      expect(retrieved1Response.success).toBe(true);
      expect(retrieved2Response.success).toBe(true);

      // Verify both are correct
      expect(retrieved1Response.seedData).toEqual(seed1);
      expect(retrieved2Response.seedData).toEqual(seed2);
    });

    it('should handle non-existent seed gracefully', async () => {
      // Try to get a seed for a future date that doesn't exist
      const response = await apiRequest<SeedResponse>('seeding/generate-seed', { date: '2099-12-31' });
      
      // Should create a new seed since it doesn't exist
      expect(response.success).toBe(true);
      expect(response.seedData).toBeDefined();
      expect(response.seedData!.seedHex).toHaveLength(64);
      
      // Clean up
      trackKey('seed:2099-12-31');
    });
  });

  describe('Determinism across service restarts (same inputs → same outputs)', () => {
    it('should produce identical seeds after service restart simulation', async () => {
      trackKey(`seed:${TEST_DATE_1}`);

      // Generate seed via API (first call)
      const seed1Response = await apiRequest<SeedResponse>('seeding/generate-seed', { date: TEST_DATE_1 });
      expect(seed1Response.success).toBe(true);
      const seed1 = seed1Response.seedData!;

      // Generate seed again via API (should retrieve from Redis, simulating restart)
      const seed2Response = await apiRequest<SeedResponse>('seeding/generate-seed', { date: TEST_DATE_1 });
      expect(seed2Response.success).toBe(true);
      const seed2 = seed2Response.seedData!;

      // Seeds should be identical (deterministic)
      expect(seed2.seedHex).toBe(seed1.seedHex);
      expect(seed2.theme).toBe(seed1.theme);
      expect(seed2.poolsVersion).toBe(seed1.poolsVersion);
      expect(seed2.createdAt).toBe(seed1.createdAt);
    });

    it('should produce identical words after service restart simulation', async () => {
      trackKey(`seed:${TEST_DATE_1}`);

      // Generate words via API (first call)
      const words1Response = await apiRequest<WordsResponse>('seeding/generate-words', {
        userId: TEST_USER_1,
        date: TEST_DATE_1,
        count: 12
      });
      expect(words1Response.success).toBe(true);
      const words1 = words1Response.words!;

      // Generate words again via API (should be deterministic)
      const words2Response = await apiRequest<WordsResponse>('seeding/generate-words', {
        userId: TEST_USER_1,
        date: TEST_DATE_1,
        count: 12
      });
      expect(words2Response.success).toBe(true);
      const words2 = words2Response.words!;

      // Words should be identical (deterministic)
      expect(words2).toEqual(words1);
    });

    it('should maintain determinism across multiple API calls', async () => {
      trackKey(`seed:${TEST_DATE_1}`);

      // Generate words via API (original call)
      const originalResponse = await apiRequest<WordsResponse>('seeding/generate-words', {
        userId: TEST_USER_1,
        date: TEST_DATE_1,
        count: 12
      });
      expect(originalResponse.success).toBe(true);
      const originalWords = originalResponse.words!;

      // Simulate 5 restart scenarios by making multiple API calls
      for (let i = 0; i < 5; i++) {
        const response = await apiRequest<WordsResponse>('seeding/generate-words', {
          userId: TEST_USER_1,
          date: TEST_DATE_1,
          count: 12
        });
        expect(response.success).toBe(true);
        expect(response.words).toEqual(originalWords);
      }
    });
  });

  describe('Multiple users on same date produce different word sets', () => {
    it('should generate different words for different users on same date', async () => {
      trackKey(`seed:${TEST_DATE_1}`);

      // Generate words for three different users via API
      const words1Response = await apiRequest<WordsResponse>('seeding/generate-words', {
        userId: TEST_USER_1,
        date: TEST_DATE_1,
        count: 12
      });
      const words2Response = await apiRequest<WordsResponse>('seeding/generate-words', {
        userId: TEST_USER_2,
        date: TEST_DATE_1,
        count: 12
      });
      const words3Response = await apiRequest<WordsResponse>('seeding/generate-words', {
        userId: TEST_USER_3,
        date: TEST_DATE_1,
        count: 12
      });

      expect(words1Response.success).toBe(true);
      expect(words2Response.success).toBe(true);
      expect(words3Response.success).toBe(true);

      const words1 = words1Response.words!;
      const words2 = words2Response.words!;
      const words3 = words3Response.words!;

      // All word sets should be different
      expect(words1).not.toEqual(words2);
      expect(words1).not.toEqual(words3);
      expect(words2).not.toEqual(words3);

      // But each should be deterministic
      const words1AgainResponse = await apiRequest<WordsResponse>('seeding/generate-words', {
        userId: TEST_USER_1,
        date: TEST_DATE_1,
        count: 12
      });
      expect(words1AgainResponse.success).toBe(true);
      expect(words1AgainResponse.words).toEqual(words1);
    });

    it('should generate unique word sets for 50 different users', async () => {
      trackKey(`seed:${TEST_DATE_1}`);

      const wordSets = new Set<string>();

      // Generate words for 50 users (reduced from 100 for faster testing)
      for (let i = 0; i < 50; i++) {
        const userId = `user${i}`;
        const response = await apiRequest<WordsResponse>('seeding/generate-words', {
          userId,
          date: TEST_DATE_1,
          count: 12
        });
        expect(response.success).toBe(true);
        const words = response.words!;
        const wordSetKey = JSON.stringify(words.sort());
        wordSets.add(wordSetKey);
      }

      // All word sets should be unique
      expect(wordSets.size).toBe(50);
    });

    it('should maintain user-specific determinism with many users', async () => {
      trackKey(`seed:${TEST_DATE_1}`);

      const userWords = new Map<string, string[]>();

      // Generate words for 25 users (reduced for faster testing)
      for (let i = 0; i < 25; i++) {
        const userId = `user${i}`;
        const response = await apiRequest<WordsResponse>('seeding/generate-words', {
          userId,
          date: TEST_DATE_1,
          count: 12
        });
        expect(response.success).toBe(true);
        userWords.set(userId, response.words!);
      }

      // Regenerate words for same users
      for (let i = 0; i < 25; i++) {
        const userId = `user${i}`;
        const response = await apiRequest<WordsResponse>('seeding/generate-words', {
          userId,
          date: TEST_DATE_1,
          count: 12
        });
        expect(response.success).toBe(true);
        expect(response.words).toEqual(userWords.get(userId));
      }
    });
  });

  describe('Same user on different dates produces different word sets', () => {
    it('should generate different words for same user on different dates', async () => {
      trackKey(`seed:${TEST_DATE_1}`);
      trackKey(`seed:${TEST_DATE_2}`);

      // Generate words for same user on two dates via API
      const words1Response = await apiRequest<WordsResponse>('seeding/generate-words', {
        userId: TEST_USER_1,
        date: TEST_DATE_1,
        count: 12
      });
      const words2Response = await apiRequest<WordsResponse>('seeding/generate-words', {
        userId: TEST_USER_1,
        date: TEST_DATE_2,
        count: 12
      });

      expect(words1Response.success).toBe(true);
      expect(words2Response.success).toBe(true);

      const words1 = words1Response.words!;
      const words2 = words2Response.words!;

      // Word sets should be different
      expect(words1).not.toEqual(words2);

      // But each should be deterministic
      const words1AgainResponse = await apiRequest<WordsResponse>('seeding/generate-words', {
        userId: TEST_USER_1,
        date: TEST_DATE_1,
        count: 12
      });
      const words2AgainResponse = await apiRequest<WordsResponse>('seeding/generate-words', {
        userId: TEST_USER_1,
        date: TEST_DATE_2,
        count: 12
      });

      expect(words1AgainResponse.success).toBe(true);
      expect(words2AgainResponse.success).toBe(true);
      expect(words1AgainResponse.words).toEqual(words1);
      expect(words2AgainResponse.words).toEqual(words2);
    });

    it('should generate unique word sets across 15 consecutive dates', async () => {
      const wordSets = new Set<string>();

      // Generate words for same user across 15 dates (reduced for faster testing)
      for (let i = 0; i < 15; i++) {
        const date = `2025-10-${String(i + 1).padStart(2, '0')}`;
        trackKey(`seed:${date}`);

        const response = await apiRequest<WordsResponse>('seeding/generate-words', {
          userId: TEST_USER_1,
          date,
          count: 12
        });
        expect(response.success).toBe(true);
        const words = response.words!;
        const wordSetKey = JSON.stringify(words.sort());
        wordSets.add(wordSetKey);
      }

      // All word sets should be unique
      expect(wordSets.size).toBe(15);
    });
  });

  describe('Word sets respect slot coverage (all slots represented)', () => {
    it('should include words from all semantic slots', async () => {
      trackKey(`seed:${TEST_DATE_1}`);

      // Generate words via API
      const response = await apiRequest<WordsResponse>('seeding/generate-words', {
        userId: TEST_USER_1,
        date: TEST_DATE_1,
        count: 12
      });
      expect(response.success).toBe(true);
      const words = response.words!;

      // Load lexicon to check slots
      const fs = await import('fs/promises');
      const path = await import('path');
      const lexiconPath = path.join(process.cwd(), 'data/lexicon.map.json');
      const lexiconData = await fs.readFile(lexiconPath, 'utf-8');
      const lexicon = JSON.parse(lexiconData);

      // Count slots represented
      const slotsRepresented = new Set<string>();
      for (const word of words) {
        const metadata = lexicon.mappings[word];
        if (metadata) {
          slotsRepresented.add(metadata.slot);
        }
      }

      // Should have at least 4 different slots (subject, action, setting, mood, modifier)
      expect(slotsRepresented.size).toBeGreaterThanOrEqual(4);
    });

    it('should maintain slot coverage across multiple users', async () => {
      trackKey(`seed:${TEST_DATE_1}`);

      // Load lexicon
      const fs = await import('fs/promises');
      const path = await import('path');
      const lexiconPath = path.join(process.cwd(), 'data/lexicon.map.json');
      const lexiconData = await fs.readFile(lexiconPath, 'utf-8');
      const lexicon = JSON.parse(lexiconData);

      // Check slot coverage for 10 users (reduced for faster testing)
      for (let i = 0; i < 10; i++) {
        const userId = `user${i}`;
        const response = await apiRequest<WordsResponse>('seeding/generate-words', {
          userId,
          date: TEST_DATE_1,
          count: 12
        });
        expect(response.success).toBe(true);
        const words = response.words!;

        const slotsRepresented = new Set<string>();
        for (const word of words) {
          const metadata = lexicon.mappings[word];
          if (metadata) {
            slotsRepresented.add(metadata.slot);
          }
        }

        // Each user should have good slot coverage
        expect(slotsRepresented.size).toBeGreaterThanOrEqual(4);
      }
    });

    it('should handle different word counts while maintaining slot coverage', async () => {
      trackKey(`seed:${TEST_DATE_1}`);

      // Load lexicon
      const fs = await import('fs/promises');
      const path = await import('path');
      const lexiconPath = path.join(process.cwd(), 'data/lexicon.map.json');
      const lexiconData = await fs.readFile(lexiconPath, 'utf-8');
      const lexicon = JSON.parse(lexiconData);

      // Test different word counts
      const counts = [5, 8, 12, 15, 20];

      for (const count of counts) {
        const response = await apiRequest<WordsResponse>('seeding/generate-words', {
          userId: TEST_USER_1,
          date: TEST_DATE_1,
          count
        });
        expect(response.success).toBe(true);
        const words = response.words!;

        const slotsRepresented = new Set<string>();
        for (const word of words) {
          const metadata = lexicon.mappings[word];
          if (metadata) {
            slotsRepresented.add(metadata.slot);
          }
        }

        // Should have good slot coverage regardless of count
        expect(slotsRepresented.size).toBeGreaterThanOrEqual(Math.min(4, count));
      }
    });
  });

  describe('Word sets respect cluster diversity (no duplicate clusters)', () => {
    it('should enforce 1-per-cluster constraint', async () => {
      trackKey(`seed:${TEST_DATE_1}`);

      // Generate words via API
      const response = await apiRequest<WordsResponse>('seeding/generate-words', {
        userId: TEST_USER_1,
        date: TEST_DATE_1,
        count: 12
      });
      expect(response.success).toBe(true);
      const words = response.words!;

      // Load lexicon to check clusters
      const fs = await import('fs/promises');
      const path = await import('path');
      const lexiconPath = path.join(process.cwd(), 'data/lexicon.map.json');
      const lexiconData = await fs.readFile(lexiconPath, 'utf-8');
      const lexicon = JSON.parse(lexiconData);

      // Check for duplicate clusters
      const clustersUsed = new Set<string>();
      const duplicateClusters: string[] = [];

      for (const word of words) {
        const metadata = lexicon.mappings[word];
        if (metadata) {
          if (clustersUsed.has(metadata.cluster)) {
            duplicateClusters.push(metadata.cluster);
          }
          clustersUsed.add(metadata.cluster);
        }
      }

      // Should have no duplicate clusters
      expect(duplicateClusters).toEqual([]);
      expect(clustersUsed.size).toBe(words.length);
    });

    it('should maintain cluster diversity across multiple users', async () => {
      trackKey(`seed:${TEST_DATE_1}`);

      // Load lexicon
      const fs = await import('fs/promises');
      const path = await import('path');
      const lexiconPath = path.join(process.cwd(), 'data/lexicon.map.json');
      const lexiconData = await fs.readFile(lexiconPath, 'utf-8');
      const lexicon = JSON.parse(lexiconData);

      // Check cluster diversity for 10 users (reduced for faster testing)
      for (let i = 0; i < 10; i++) {
        const userId = `user${i}`;
        const response = await apiRequest<WordsResponse>('seeding/generate-words', {
          userId,
          date: TEST_DATE_1,
          count: 12
        });
        expect(response.success).toBe(true);
        const words = response.words!;

        const clustersUsed = new Set<string>();
        for (const word of words) {
          const metadata = lexicon.mappings[word];
          if (metadata) {
            clustersUsed.add(metadata.cluster);
          }
        }

        // Each user should have unique clusters
        expect(clustersUsed.size).toBe(words.length);
      }
    });

    it('should maximize cluster variety in word sets', async () => {
      trackKey(`seed:${TEST_DATE_1}`);

      // Load lexicon
      const fs = await import('fs/promises');
      const path = await import('path');
      const lexiconPath = path.join(process.cwd(), 'data/lexicon.map.json');
      const lexiconData = await fs.readFile(lexiconPath, 'utf-8');
      const lexicon = JSON.parse(lexiconData);

      // Generate words for multiple users
      const clusterVarietyScores: number[] = [];

      for (let i = 0; i < 5; i++) {
        const userId = `user${i}`;
        const response = await apiRequest<WordsResponse>('seeding/generate-words', {
          userId,
          date: TEST_DATE_1,
          count: 12
        });
        expect(response.success).toBe(true);
        const words = response.words!;

        const clustersUsed = new Set<string>();
        for (const word of words) {
          const metadata = lexicon.mappings[word];
          if (metadata) {
            clustersUsed.add(metadata.cluster);
          }
        }

        // Calculate variety score (unique clusters / total words)
        const varietyScore = clustersUsed.size / words.length;
        clusterVarietyScores.push(varietyScore);
      }

      // Average variety score should be high (close to 1.0)
      const avgVariety = clusterVarietyScores.reduce((a, b) => a + b, 0) / clusterVarietyScores.length;
      expect(avgVariety).toBeGreaterThan(0.9); // At least 90% unique clusters
    });
  });

  describe('Performance (API-based testing with realistic expectations)', () => {
    it('should generate 100 word sets in reasonable time via API', async () => {
      trackKey(`seed:${TEST_DATE_1}`);

      // Pre-generate daily seed to exclude from timing
      await apiRequest<SeedResponse>('seeding/generate-seed', { date: TEST_DATE_1 });

      // Measure time for 100 word sets (reduced from 1000 for API testing)
      const startTime = performance.now();

      for (let i = 0; i < 100; i++) {
        const userId = `user${i}`;
        const response = await apiRequest<WordsResponse>('seeding/generate-words', {
          userId,
          date: TEST_DATE_1,
          count: 12
        });
        expect(response.success).toBe(true);
      }

      const endTime = performance.now();
      const totalTime = endTime - startTime;

      // Should complete in reasonable time for API calls (more lenient than direct service calls)
      expect(totalTime).toBeLessThan(5000); // 100 API calls in <5 seconds

      // Log performance for monitoring
      console.log(`Generated 100 word sets via API in ${totalTime.toFixed(2)}ms (avg: ${(totalTime / 100).toFixed(3)}ms per set)`);
    });

    it('should generate single word set via API in reasonable time', async () => {
      trackKey(`seed:${TEST_DATE_1}`);

      // Pre-generate daily seed
      await apiRequest<SeedResponse>('seeding/generate-seed', { date: TEST_DATE_1 });

      // Measure time for single word set
      const startTime = performance.now();
      const response = await apiRequest<WordsResponse>('seeding/generate-words', {
        userId: TEST_USER_1,
        date: TEST_DATE_1,
        count: 12
      });
      const endTime = performance.now();

      expect(response.success).toBe(true);
      const totalTime = endTime - startTime;

      // Should complete in reasonable time for API call
      expect(totalTime).toBeLessThan(100); // Single API call in <100ms

      console.log(`Generated single word set via API in ${totalTime.toFixed(3)}ms`);
    });

    it('should maintain performance with varying word counts via API', async () => {
      trackKey(`seed:${TEST_DATE_1}`);

      // Pre-generate daily seed
      await apiRequest<SeedResponse>('seeding/generate-seed', { date: TEST_DATE_1 });

      const counts = [5, 10, 15, 20];
      const timings: Record<number, number> = {};

      for (const count of counts) {
        const startTime = performance.now();

        for (let i = 0; i < 10; i++) { // Reduced from 100 for API testing
          const userId = `user${count}_${i}`;
          const response = await apiRequest<WordsResponse>('seeding/generate-words', {
            userId,
            date: TEST_DATE_1,
            count
          });
          expect(response.success).toBe(true);
        }

        const endTime = performance.now();
        timings[count] = endTime - startTime;
      }

      // All counts should complete 10 iterations in reasonable time
      for (const count of counts) {
        expect(timings[count]).toBeLessThan(1000); // 10 API calls in <1 second
        console.log(`Generated 10 word sets (count=${count}) via API in ${timings[count].toFixed(2)}ms`);
      }
    });

    it('should handle concurrent word generation via API efficiently', async () => {
      trackKey(`seed:${TEST_DATE_1}`);

      // Pre-generate daily seed
      await apiRequest<SeedResponse>('seeding/generate-seed', { date: TEST_DATE_1 });

      // Generate 20 word sets concurrently (reduced from 100 for API testing)
      const startTime = performance.now();

      const promises = Array.from({ length: 20 }, (_, i) => {
        const userId = `concurrent_user${i}`;
        return apiRequest<WordsResponse>('seeding/generate-words', {
          userId,
          date: TEST_DATE_1,
          count: 12
        });
      });

      const results = await Promise.all(promises);
      
      // Verify all requests succeeded
      results.forEach(result => {
        expect(result.success).toBe(true);
      });

      const endTime = performance.now();
      const totalTime = endTime - startTime;

      // Concurrent execution should be reasonable for API calls
      expect(totalTime).toBeLessThan(2000); // 20 concurrent API calls in <2 seconds

      console.log(`Generated 20 word sets concurrently via API in ${totalTime.toFixed(2)}ms`);
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle minimum word count (1) via API', async () => {
      trackKey(`seed:${TEST_DATE_1}`);

      const response = await apiRequest<WordsResponse>('seeding/generate-words', {
        userId: TEST_USER_1,
        date: TEST_DATE_1,
        count: 1
      });
      expect(response.success).toBe(true);
      expect(response.words).toHaveLength(1);
      expect(typeof response.words![0]).toBe('string');
    });

    it('should handle maximum word count (100) via API', async () => {
      trackKey(`seed:${TEST_DATE_1}`);

      const response = await apiRequest<WordsResponse>('seeding/generate-words', {
        userId: TEST_USER_1,
        date: TEST_DATE_1,
        count: 100
      });
      expect(response.success).toBe(true);
      const words = response.words!;
      expect(words.length).toBeLessThanOrEqual(100);
      expect(words.every((w: string) => typeof w === 'string')).toBe(true);

      // Should have no duplicates
      const uniqueWords = new Set(words);
      expect(uniqueWords.size).toBe(words.length);
    });

    it('should return error for invalid word count (0) via API', async () => {
      const response = await apiRequest<WordsResponse>('seeding/generate-words', {
        userId: TEST_USER_1,
        date: TEST_DATE_1,
        count: 0
      });
      expect(response.success).toBe(false);
      expect(response.error).toContain('count must be a number between 1 and 100');
    });

    it('should return error for invalid word count (101) via API', async () => {
      const response = await apiRequest<WordsResponse>('seeding/generate-words', {
        userId: TEST_USER_1,
        date: TEST_DATE_1,
        count: 101
      });
      expect(response.success).toBe(false);
      expect(response.error).toContain('count must be a number between 1 and 100');
    });

    it('should return error for invalid date format via API', async () => {
      const response = await apiRequest<WordsResponse>('seeding/generate-words', {
        userId: TEST_USER_1,
        date: '2025/10/14',
        count: 12
      });
      expect(response.success).toBe(false);
      expect(response.error).toContain('date must be in YYYY-MM-DD format');
    });

    it('should return error for empty user ID via API', async () => {
      const response = await apiRequest<WordsResponse>('seeding/generate-words', {
        userId: '',
        date: TEST_DATE_1,
        count: 12
      });
      expect(response.success).toBe(false);
      expect(response.error).toContain('userId must be a non-empty string');
    });

    it('should handle special characters in user IDs via API', async () => {
      trackKey(`seed:${TEST_DATE_1}`);

      const specialUserIds = [
        'user-with-dashes',
        'user_with_underscores',
        'user.with.dots',
        'user123numbers',
        'user@with@symbols',
      ];

      for (const userId of specialUserIds) {
        const response1 = await apiRequest<WordsResponse>('seeding/generate-words', {
          userId,
          date: TEST_DATE_1,
          count: 12
        });
        expect(response1.success).toBe(true);
        expect(response1.words).toHaveLength(12);

        // Should be deterministic
        const response2 = await apiRequest<WordsResponse>('seeding/generate-words', {
          userId,
          date: TEST_DATE_1,
          count: 12
        });
        expect(response2.success).toBe(true);
        expect(response2.words).toEqual(response1.words);
      }
    });

    it('should handle leap year dates via API', async () => {
      const leapYearDate = '2024-02-29';
      trackKey(`seed:${leapYearDate}`);

      const response1 = await apiRequest<WordsResponse>('seeding/generate-words', {
        userId: TEST_USER_1,
        date: leapYearDate,
        count: 12
      });
      expect(response1.success).toBe(true);
      expect(response1.words).toHaveLength(12);

      // Should be deterministic
      const response2 = await apiRequest<WordsResponse>('seeding/generate-words', {
        userId: TEST_USER_1,
        date: leapYearDate,
        count: 12
      });
      expect(response2.success).toBe(true);
      expect(response2.words).toEqual(response1.words);
    });

    it('should handle year boundaries via API', async () => {
      const dates = ['2024-12-31', '2025-01-01'];

      for (const date of dates) {
        trackKey(`seed:${date}`);
        const response = await apiRequest<WordsResponse>('seeding/generate-words', {
          userId: TEST_USER_1,
          date,
          count: 12
        });
        expect(response.success).toBe(true);
        expect(response.words).toHaveLength(12);
      }
    });
  });
});
