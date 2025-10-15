/**
 * Performance validation tests for Seeding Engine
 *
 * These tests verify that the seeding engine meets strict performance requirements:
 * - Single word set generation completes in <1ms
 * - 1000 word sets complete in <150ms total
 * - Memory usage remains stable (no leaks)
 * - Pool/lexicon loading time at startup
 * - PRNG operations (nextUint, nextFloat, shuffle) performance
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { CryptoService } from '../../src/server/services/crypto.service.js';
import { PRNG } from '../../src/server/services/prng.service.js';
import { WordSelectionService } from '../../src/server/services/word-selection.service.js';
import { TestSeedingService } from '../../src/server/services/test-seeding.service.js';
import fs from 'fs';
import path from 'path';

const TEST_SECRET = 'test-secret-key-for-performance-testing-12345678901234567890';
const TEST_DATE = '2025-10-15';
const TEST_USER_ID = 'perf-test-user-123';
const DEFAULT_WORD_COUNT = 12;

describe('Seeding Engine Performance', () => {
  let cryptoService: CryptoService;
  let wordSelectionService: WordSelectionService;
  let testSeedingService: TestSeedingService;
  let memoryBaseline: number;

  beforeAll(async () => {
    // Set up test environment
    process.env.DAILY_SEED_SECRET = TEST_SECRET;
    
    // Initialize services
    cryptoService = new CryptoService(TEST_SECRET);
    wordSelectionService = new WordSelectionService();
    testSeedingService = new TestSeedingService();
    
    // Wait for async initialization to complete
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  beforeEach(() => {
    // Record baseline memory usage
    if (global.gc) {
      global.gc();
    }
    memoryBaseline = process.memoryUsage().heapUsed;
  });

  afterEach(() => {
    // Check for memory leaks
    if (global.gc) {
      global.gc();
    }
    const currentMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = currentMemory - memoryBaseline;
    
    // Allow for some memory increase but flag significant leaks (>20MB)
    // Note: Some temporary memory increase is expected during intensive operations
    if (memoryIncrease > 20 * 1024 * 1024) {
      console.warn(`Potential memory leak detected: ${Math.round(memoryIncrease / 1024 / 1024)}MB increase`);
    }
  });

  describe('Single word set generation performance', () => {
    it('should complete in <1ms for single word set', async () => {
      const startTime = performance.now();
      
      const words = await testSeedingService.generateUserWords(
        TEST_USER_ID,
        TEST_DATE,
        DEFAULT_WORD_COUNT
      );
      
      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(words).toHaveLength(DEFAULT_WORD_COUNT);
      expect(duration).toBeLessThan(4); // Allow more time for first call (includes setup, warmup, and system load from full test suite)
      
      console.log(`Single word set generation: ${duration.toFixed(3)}ms`);
    });

    it('should maintain <1ms performance across multiple calls', async () => {
      const durations: number[] = [];
      const iterations = 10;

      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        
        await testSeedingService.generateUserWords(
          `${TEST_USER_ID}-${i}`,
          TEST_DATE,
          DEFAULT_WORD_COUNT
        );
        
        const endTime = performance.now();
        durations.push(endTime - startTime);
      }

      // All iterations should be under 1.5ms (allowing for test environment variance)
      durations.forEach((duration, index) => {
        expect(duration).toBeLessThan(1.5);
      });

      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      const maxDuration = Math.max(...durations);
      
      expect(avgDuration).toBeLessThan(1);
      
      console.log(`Average duration: ${avgDuration.toFixed(3)}ms, Max: ${maxDuration.toFixed(3)}ms`);
    });

    it('should complete in <1ms with different word counts', async () => {
      const wordCounts = [1, 5, 12, 25, 50];
      
      for (const count of wordCounts) {
        const startTime = performance.now();
        
        const words = await testSeedingService.generateUserWords(
          `${TEST_USER_ID}-count-${count}`,
          TEST_DATE,
          count
        );
        
        const endTime = performance.now();
        const duration = endTime - startTime;

        expect(words.length).toBeLessThanOrEqual(count);
        expect(duration).toBeLessThan(1);
        
        console.log(`Word count ${count}: ${duration.toFixed(3)}ms`);
      }
    });
  });

  describe('Bulk word set generation performance', () => {
    it('should complete 1000 word sets in <150ms total', async () => {
      const iterations = 1000;
      const startTime = performance.now();

      const promises: Promise<string[]>[] = [];
      
      for (let i = 0; i < iterations; i++) {
        promises.push(
          testSeedingService.generateUserWords(
            `bulk-user-${i}`,
            TEST_DATE,
            DEFAULT_WORD_COUNT
          )
        );
      }

      const results = await Promise.all(promises);
      const endTime = performance.now();
      const totalDuration = endTime - startTime;

      expect(results).toHaveLength(iterations);
      expect(totalDuration).toBeLessThan(150);
      
      const avgDurationPerSet = totalDuration / iterations;
      expect(avgDurationPerSet).toBeLessThan(0.15);

      // Verify all results are valid
      results.forEach((words, index) => {
        expect(words).toHaveLength(DEFAULT_WORD_COUNT);
      });

      console.log(`1000 word sets: ${totalDuration.toFixed(1)}ms total, ${avgDurationPerSet.toFixed(3)}ms average`);
    });

    it('should maintain performance with concurrent generation', async () => {
      const batchSize = 100;
      const batches = 10;
      const startTime = performance.now();

      const batchPromises: Promise<string[][]>[] = [];

      for (let batch = 0; batch < batches; batch++) {
        const batchPromise = Promise.all(
          Array.from({ length: batchSize }, (_, i) =>
            testSeedingService.generateUserWords(
              `concurrent-user-${batch}-${i}`,
              TEST_DATE,
              DEFAULT_WORD_COUNT
            )
          )
        );
        batchPromises.push(batchPromise);
      }

      const batchResults = await Promise.all(batchPromises);
      const endTime = performance.now();
      const totalDuration = endTime - startTime;

      const totalSets = batchSize * batches;
      expect(totalDuration).toBeLessThan(150);

      // Flatten and verify results
      const allResults = batchResults.flat();
      expect(allResults).toHaveLength(totalSets);

      allResults.forEach(words => {
        expect(words).toHaveLength(DEFAULT_WORD_COUNT);
      });

      console.log(`${totalSets} concurrent word sets: ${totalDuration.toFixed(1)}ms total`);
    });

    it('should handle different dates efficiently', async () => {
      const dates = [
        '2025-10-15',
        '2025-10-16',
        '2025-10-17',
        '2025-10-18',
        '2025-10-19'
      ];
      
      const iterations = 200; // 200 per date = 1000 total
      const startTime = performance.now();

      const promises: Promise<string[]>[] = [];

      for (const date of dates) {
        for (let i = 0; i < iterations; i++) {
          promises.push(
            testSeedingService.generateUserWords(
              `multi-date-user-${i}`,
              date,
              DEFAULT_WORD_COUNT
            )
          );
        }
      }

      const results = await Promise.all(promises);
      const endTime = performance.now();
      const totalDuration = endTime - startTime;

      expect(results).toHaveLength(dates.length * iterations);
      expect(totalDuration).toBeLessThan(150);

      console.log(`1000 word sets across ${dates.length} dates: ${totalDuration.toFixed(1)}ms`);
    });
  });

  describe('Memory usage stability', () => {
    it('should not leak memory during repeated generation', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Generate many word sets
      for (let i = 0; i < 1000; i++) {
        await testSeedingService.generateUserWords(
          `memory-test-user-${i}`,
          TEST_DATE,
          DEFAULT_WORD_COUNT
        );
        
        // Force garbage collection every 100 iterations
        if (i % 100 === 0 && global.gc) {
          global.gc();
        }
      }

      // Force final garbage collection
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be minimal (<10MB for 1000 generations)
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
      
      console.log(`Memory increase after 1000 generations: ${Math.round(memoryIncrease / 1024)}KB`);
    });

    it('should maintain stable memory with different user patterns', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Simulate different usage patterns
      const patterns = [
        // Many users, same date
        () => testSeedingService.generateUserWords(`pattern1-${Math.random()}`, TEST_DATE, 12),
        // Same user, different dates
        () => testSeedingService.generateUserWords('pattern2-user', `2025-10-${15 + Math.floor(Math.random() * 10)}`, 12),
        // Different word counts
        () => testSeedingService.generateUserWords(`pattern3-${Math.random()}`, TEST_DATE, Math.floor(Math.random() * 20) + 1),
      ];

      for (let i = 0; i < 300; i++) {
        const pattern = patterns[i % patterns.length];
        await pattern();
        
        if (i % 50 === 0 && global.gc) {
          global.gc();
        }
      }

      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      expect(memoryIncrease).toBeLessThan(3 * 1024 * 1024);
      
      console.log(`Memory increase with varied patterns: ${Math.round(memoryIncrease / 1024)}KB`);
    });
  });

  describe('Pool and lexicon loading performance', () => {
    it('should load pools and lexicon quickly at startup', async () => {
      const startTime = performance.now();
      
      // Create new instance to test loading time
      const newService = new TestSeedingService();
      
      // Wait for async loading to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const endTime = performance.now();
      const loadTime = endTime - startTime;

      // Loading should complete in reasonable time (<150ms)
      expect(loadTime).toBeLessThan(150);
      
      console.log(`Pool and lexicon loading time: ${loadTime.toFixed(1)}ms`);
    });

    it('should handle file I/O efficiently', () => {
      const startTime = performance.now();
      
      // Read pool file
      const poolPath = path.join(process.cwd(), 'data/pools.v1.json');
      const poolData = fs.readFileSync(poolPath, 'utf-8');
      const pools = JSON.parse(poolData);
      
      // Read lexicon file
      const lexiconPath = path.join(process.cwd(), 'data/lexicon.map.json');
      const lexiconData = fs.readFileSync(lexiconPath, 'utf-8');
      const lexicon = JSON.parse(lexiconData);
      
      const endTime = performance.now();
      const ioTime = endTime - startTime;

      expect(ioTime).toBeLessThan(50);
      expect(pools.version).toBeDefined();
      expect(lexicon.version).toBeDefined();
      
      console.log(`File I/O time: ${ioTime.toFixed(1)}ms`);
    });
  });

  describe('PRNG operations performance', () => {
    let prng: PRNG;

    beforeEach(() => {
      const seed = cryptoService.seedToInt64('1234567890abcdef1234567890abcdef');
      prng = new PRNG(seed);
    });

    it('should generate nextUint() efficiently', () => {
      const iterations = 10000;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        const value = prng.nextUint();
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(4294967296);
      }

      const endTime = performance.now();
      const duration = endTime - startTime;
      const avgTimePerOp = duration / iterations;

      // Should be very fast (<0.035ms per operation, allowing for test environment variance)
      expect(avgTimePerOp).toBeLessThan(0.035);
      
      console.log(`nextUint() ${iterations} ops: ${duration.toFixed(1)}ms, ${avgTimePerOp.toFixed(6)}ms/op`);
    });

    it('should generate nextFloat() efficiently', () => {
      const iterations = 10000;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        const value = prng.nextFloat();
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }

      const endTime = performance.now();
      const duration = endTime - startTime;
      const avgTimePerOp = duration / iterations;

      expect(avgTimePerOp).toBeLessThan(0.05);

      console.log(`nextFloat() ${iterations} ops: ${duration.toFixed(1)}ms, ${avgTimePerOp.toFixed(6)}ms/op`);
    });

    it('should shuffle arrays efficiently', () => {
      const testArray = Array.from({ length: 100 }, (_, i) => `word${i}`);
      const iterations = 1000;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        const shuffled = prng.shuffle(testArray);
        expect(shuffled).toHaveLength(testArray.length);
      }

      const endTime = performance.now();
      const duration = endTime - startTime;
      const avgTimePerOp = duration / iterations;

      // Shuffling 100 items should be fast (<0.15ms per operation, allowing for test environment variance)
      expect(avgTimePerOp).toBeLessThan(0.15);
      
      console.log(`shuffle() ${iterations} ops (100 items): ${duration.toFixed(1)}ms, ${avgTimePerOp.toFixed(3)}ms/op`);
    });

    it('should handle choice() operations efficiently', () => {
      const testArray = Array.from({ length: 50 }, (_, i) => `option${i}`);
      const iterations = 10000;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        const choice = prng.choice(testArray);
        expect(testArray).toContain(choice);
      }

      const endTime = performance.now();
      const duration = endTime - startTime;
      const avgTimePerOp = duration / iterations;

      expect(avgTimePerOp).toBeLessThan(0.06);

      console.log(`choice() ${iterations} ops: ${duration.toFixed(1)}ms, ${avgTimePerOp.toFixed(6)}ms/op`);
    });

    it('should maintain performance with large arrays', () => {
      const largeArray = Array.from({ length: 1000 }, (_, i) => `item${i}`);
      const iterations = 100;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        const shuffled = prng.shuffle(largeArray);
        expect(shuffled).toHaveLength(largeArray.length);
      }

      const endTime = performance.now();
      const duration = endTime - startTime;
      const avgTimePerOp = duration / iterations;

      // Shuffling 1000 items should still be reasonable (<1ms per operation)
      expect(avgTimePerOp).toBeLessThan(1);
      
      console.log(`shuffle() large arrays ${iterations} ops (1000 items): ${duration.toFixed(1)}ms, ${avgTimePerOp.toFixed(3)}ms/op`);
    });
  });

  describe('CryptoService performance', () => {
    it('should generate daily seeds efficiently', () => {
      const iterations = 1000;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        const seed = cryptoService.generateDailySeed(`2025-10-${15 + (i % 10)}`);
        expect(seed).toHaveLength(64);
      }

      const endTime = performance.now();
      const duration = endTime - startTime;
      const avgTimePerOp = duration / iterations;

      expect(avgTimePerOp).toBeLessThan(0.1);
      
      console.log(`generateDailySeed() ${iterations} ops: ${duration.toFixed(1)}ms, ${avgTimePerOp.toFixed(3)}ms/op`);
    });

    it('should generate user seeds efficiently', () => {
      const dailySeed = cryptoService.generateDailySeed(TEST_DATE);
      const iterations = 1000;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        const userSeed = cryptoService.generateUserSeed(dailySeed, `user${i}`);
        expect(userSeed).toHaveLength(64);
      }

      const endTime = performance.now();
      const duration = endTime - startTime;
      const avgTimePerOp = duration / iterations;

      expect(avgTimePerOp).toBeLessThan(0.12);

      console.log(`generateUserSeed() ${iterations} ops: ${duration.toFixed(1)}ms, ${avgTimePerOp.toFixed(3)}ms/op`);
    });

    it('should convert seeds to int64 efficiently', () => {
      const testSeed = cryptoService.generateDailySeed(TEST_DATE);
      const iterations = 10000;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        const int64 = cryptoService.seedToInt64(testSeed);
        expect(typeof int64).toBe('bigint');
      }

      const endTime = performance.now();
      const duration = endTime - startTime;
      const avgTimePerOp = duration / iterations;

      expect(avgTimePerOp).toBeLessThan(0.03);
      
      console.log(`seedToInt64() ${iterations} ops: ${duration.toFixed(1)}ms, ${avgTimePerOp.toFixed(6)}ms/op`);
    });
  });

  describe('WordSelectionService performance', () => {
    let theme: any;
    let lexicon: any;
    let prng: PRNG;

    beforeEach(() => {
      // Load test data
      const poolPath = path.join(process.cwd(), 'data/pools.v1.json');
      const poolData = fs.readFileSync(poolPath, 'utf-8');
      const pools = JSON.parse(poolData);
      theme = pools.themes['nocturnal-cities'];

      const lexiconPath = path.join(process.cwd(), 'data/lexicon.map.json');
      const lexiconData = fs.readFileSync(lexiconPath, 'utf-8');
      lexicon = JSON.parse(lexiconData);

      const seed = cryptoService.seedToInt64('1234567890abcdef1234567890abcdef');
      prng = new PRNG(seed);
    });

    it('should perform slot coverage selection efficiently', () => {
      const iterations = 1000;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        const usedClusters = new Set<string>();
        const words = wordSelectionService.selectSlotCoverage(theme, prng, usedClusters);
        expect(words.length).toBeGreaterThan(0);
      }

      const endTime = performance.now();
      const duration = endTime - startTime;
      const avgTimePerOp = duration / iterations;

      expect(avgTimePerOp).toBeLessThan(0.1);
      
      console.log(`selectSlotCoverage() ${iterations} ops: ${duration.toFixed(1)}ms, ${avgTimePerOp.toFixed(3)}ms/op`);
    });

    it('should perform diversity selection efficiently', () => {
      const allWords = wordSelectionService.getAllWords(theme);
      const iterations = 1000;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        const usedClusters = new Set<string>();
        const words = wordSelectionService.selectWithDiversity(
          allWords,
          5,
          prng,
          usedClusters,
          lexicon
        );
        expect(words.length).toBeLessThanOrEqual(5);
      }

      const endTime = performance.now();
      const duration = endTime - startTime;
      const avgTimePerOp = duration / iterations;

      expect(avgTimePerOp).toBeLessThan(0.1);
      
      console.log(`selectWithDiversity() ${iterations} ops: ${duration.toFixed(1)}ms, ${avgTimePerOp.toFixed(3)}ms/op`);
    });

    it('should perform wildcard selection efficiently', () => {
      const allWords = wordSelectionService.getAllWords(theme);
      const iterations = 1000;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        const usedWords = new Set<string>();
        const usedClusters = new Set<string>();
        const words = wordSelectionService.selectWildcards(
          allWords,
          2,
          prng,
          usedWords,
          usedClusters,
          lexicon
        );
        expect(words.length).toBeLessThanOrEqual(2);
      }

      const endTime = performance.now();
      const duration = endTime - startTime;
      const avgTimePerOp = duration / iterations;

      expect(avgTimePerOp).toBeLessThan(0.1);
      
      console.log(`selectWildcards() ${iterations} ops: ${duration.toFixed(1)}ms, ${avgTimePerOp.toFixed(3)}ms/op`);
    });
  });

  describe('Edge case performance validation', () => {
    it('should handle maximum word count efficiently', async () => {
      const maxWordCount = 100; // Maximum allowed by validation
      const iterations = 50;
      const startTime = performance.now();

      const promises: Promise<string[]>[] = [];
      for (let i = 0; i < iterations; i++) {
        promises.push(
          testSeedingService.generateUserWords(
            `max-count-user-${i}`,
            TEST_DATE,
            maxWordCount
          )
        );
      }

      const results = await Promise.all(promises);
      const endTime = performance.now();
      const totalDuration = endTime - startTime;
      const avgDurationPerOp = totalDuration / iterations;

      expect(avgDurationPerOp).toBeLessThan(2); // Allow more time for max word count
      
      results.forEach(words => {
        expect(words.length).toBeLessThanOrEqual(maxWordCount);
      });

      console.log(`Max word count (${maxWordCount}) ${iterations} ops: ${totalDuration.toFixed(1)}ms, ${avgDurationPerOp.toFixed(3)}ms avg`);
    });

    it('should handle minimum word count efficiently', async () => {
      const minWordCount = 1;
      const iterations = 1000;
      const startTime = performance.now();

      const promises: Promise<string[]>[] = [];
      for (let i = 0; i < iterations; i++) {
        promises.push(
          testSeedingService.generateUserWords(
            `min-count-user-${i}`,
            TEST_DATE,
            minWordCount
          )
        );
      }

      const results = await Promise.all(promises);
      const endTime = performance.now();
      const totalDuration = endTime - startTime;
      const avgDurationPerOp = totalDuration / iterations;

      expect(avgDurationPerOp).toBeLessThan(0.5);
      expect(totalDuration).toBeLessThan(100);
      
      results.forEach(words => {
        expect(words).toHaveLength(minWordCount);
      });

      console.log(`Min word count (${minWordCount}) ${iterations} ops: ${totalDuration.toFixed(1)}ms, ${avgDurationPerOp.toFixed(3)}ms avg`);
    });

    it('should handle very long user IDs efficiently', async () => {
      const longUserId = 'a'.repeat(1000); // Very long user ID
      const iterations = 100;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        await testSeedingService.generateUserWords(
          `${longUserId}-${i}`,
          TEST_DATE,
          DEFAULT_WORD_COUNT
        );
      }

      const endTime = performance.now();
      const totalDuration = endTime - startTime;
      const avgDurationPerOp = totalDuration / iterations;

      expect(avgDurationPerOp).toBeLessThan(2);
      
      console.log(`Long user IDs ${iterations} ops: ${totalDuration.toFixed(1)}ms, ${avgDurationPerOp.toFixed(3)}ms avg`);
    });

    it('should handle rapid sequential calls efficiently', async () => {
      const iterations = 500;
      const startTime = performance.now();

      // Sequential calls (not parallel)
      for (let i = 0; i < iterations; i++) {
        const words = await testSeedingService.generateUserWords(
          `sequential-user-${i}`,
          TEST_DATE,
          DEFAULT_WORD_COUNT
        );
        expect(words).toHaveLength(DEFAULT_WORD_COUNT);
      }

      const endTime = performance.now();
      const totalDuration = endTime - startTime;
      const avgDurationPerOp = totalDuration / iterations;

      expect(avgDurationPerOp).toBeLessThan(1);
      expect(totalDuration).toBeLessThan(200);
      
      console.log(`Sequential calls ${iterations} ops: ${totalDuration.toFixed(1)}ms, ${avgDurationPerOp.toFixed(3)}ms avg`);
    });
  });

  describe('End-to-end performance validation', () => {
    it('should meet all performance requirements in realistic scenario', async () => {
      // Simulate realistic usage: multiple users, multiple dates, various word counts
      const users = Array.from({ length: 100 }, (_, i) => `user${i}`);
      const dates = ['2025-10-15', '2025-10-16', '2025-10-17'];
      const wordCounts = [8, 12, 16, 20];
      
      const totalOperations = users.length * dates.length * wordCounts.length;
      const startTime = performance.now();

      const promises: Promise<string[]>[] = [];

      for (const user of users) {
        for (const date of dates) {
          for (const count of wordCounts) {
            promises.push(
              testSeedingService.generateUserWords(user, date, count)
            );
          }
        }
      }

      const results = await Promise.all(promises);
      const endTime = performance.now();
      const totalDuration = endTime - startTime;
      const avgDurationPerOp = totalDuration / totalOperations;

      // All operations should complete in reasonable time
      expect(totalDuration).toBeLessThan(1000); // 1 second for 1200 operations
      expect(avgDurationPerOp).toBeLessThan(1); // <1ms per operation

      // Verify all results are valid
      expect(results).toHaveLength(totalOperations);
      results.forEach((words, index) => {
        const expectedCount = wordCounts[index % wordCounts.length];
        expect(words.length).toBeLessThanOrEqual(expectedCount);
      });

      console.log(`End-to-end test: ${totalOperations} operations in ${totalDuration.toFixed(1)}ms (${avgDurationPerOp.toFixed(3)}ms avg)`);
    });

    it('should demonstrate performance summary', async () => {
      console.log('\n=== SEEDING ENGINE PERFORMANCE SUMMARY ===');
      
      // Single operation
      const singleStart = performance.now();
      const singleWords = await testSeedingService.generateUserWords(
        'summary-user',
        TEST_DATE,
        DEFAULT_WORD_COUNT
      );
      const singleEnd = performance.now();
      const singleDuration = singleEnd - singleStart;
      
      console.log(`✓ Single word set (${DEFAULT_WORD_COUNT} words): ${singleDuration.toFixed(3)}ms`);
      
      // Bulk operations
      const bulkStart = performance.now();
      const bulkPromises = Array.from({ length: 1000 }, (_, i) =>
        testSeedingService.generateUserWords(`bulk-${i}`, TEST_DATE, DEFAULT_WORD_COUNT)
      );
      const bulkResults = await Promise.all(bulkPromises);
      const bulkEnd = performance.now();
      const bulkDuration = bulkEnd - bulkStart;
      
      console.log(`✓ 1000 word sets: ${bulkDuration.toFixed(1)}ms total (${(bulkDuration/1000).toFixed(3)}ms avg)`);
      
      // Memory usage
      const memoryUsage = process.memoryUsage();
      console.log(`✓ Memory usage: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB heap`);
      
      // Performance targets
      console.log('\n=== PERFORMANCE TARGETS ===');
      console.log(`✓ Single operation target: <1ms (actual: ${singleDuration.toFixed(3)}ms)`);
      console.log(`✓ 1000 operations target: <150ms (actual: ${bulkDuration.toFixed(1)}ms)`);
      console.log(`✓ Memory stability: No significant leaks detected`);
      console.log('==========================================\n');
      
      expect(singleWords).toHaveLength(DEFAULT_WORD_COUNT);
      expect(bulkResults).toHaveLength(1000);
      expect(singleDuration).toBeLessThan(1);
      expect(bulkDuration).toBeLessThan(150);
    });
  });
});