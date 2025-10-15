/**
 * PRNG Service Tests
 *
 * Tests the deterministic pseudo-random number generator implementation.
 * Verifies SplitMix64 initialization and Xoroshiro128+ generation.
 */

import { describe, it, expect } from 'vitest';
import { PRNG } from '../src/server/services/prng.service';

describe('PRNG Service', () => {
  describe('Constructor', () => {
    it('should initialize with a BigInt seed', () => {
      expect(() => new PRNG(12345n)).not.toThrow();
    });

    it('should throw error if seed is not a BigInt', () => {
      // @ts-expect-error Testing invalid input
      expect(() => new PRNG(12345)).toThrow('seed must be a BigInt');
      // @ts-expect-error Testing invalid input
      expect(() => new PRNG('12345')).toThrow('seed must be a BigInt');
      // @ts-expect-error Testing invalid input
      expect(() => new PRNG(null)).toThrow('seed must be a BigInt');
    });
  });

  describe('Determinism', () => {
    it('should produce identical sequences for same seed', () => {
      const prng1 = new PRNG(12345n);
      const prng2 = new PRNG(12345n);

      const sequence1 = Array.from({ length: 10 }, () => prng1.nextUint());
      const sequence2 = Array.from({ length: 10 }, () => prng2.nextUint());

      expect(sequence1).toEqual(sequence2);
    });

    it('should produce different sequences for different seeds', () => {
      const prng1 = new PRNG(12345n);
      const prng2 = new PRNG(54321n);

      const sequence1 = Array.from({ length: 10 }, () => prng1.nextUint());
      const sequence2 = Array.from({ length: 10 }, () => prng2.nextUint());

      expect(sequence1).not.toEqual(sequence2);
    });
  });

  describe('nextUint()', () => {
    it('should return 32-bit unsigned integers', () => {
      const prng = new PRNG(12345n);

      for (let i = 0; i < 100; i++) {
        const value = prng.nextUint();
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(2 ** 32);
        expect(Number.isInteger(value)).toBe(true);
      }
    });

    it('should produce values across the full range', () => {
      const prng = new PRNG(12345n);
      const values = Array.from({ length: 1000 }, () => prng.nextUint());

      // Check we get values in different quartiles of the range
      const max = 2 ** 32;
      const hasLow = values.some((v) => v < max / 4);
      const hasMid = values.some((v) => v >= max / 4 && v < (3 * max) / 4);
      const hasHigh = values.some((v) => v >= (3 * max) / 4);

      expect(hasLow).toBe(true);
      expect(hasMid).toBe(true);
      expect(hasHigh).toBe(true);
    });

    it('should be deterministic', () => {
      const prng1 = new PRNG(99999n);
      const prng2 = new PRNG(99999n);

      expect(prng1.nextUint()).toBe(prng2.nextUint());
      expect(prng1.nextUint()).toBe(prng2.nextUint());
      expect(prng1.nextUint()).toBe(prng2.nextUint());
    });
  });

  describe('nextFloat()', () => {
    it('should return floats in [0, 1) range', () => {
      const prng = new PRNG(12345n);

      for (let i = 0; i < 100; i++) {
        const value = prng.nextFloat();
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    });

    it('should produce values across the full range', () => {
      const prng = new PRNG(12345n);
      const values = Array.from({ length: 1000 }, () => prng.nextFloat());

      // Check we get values in different parts of [0, 1)
      const hasLow = values.some((v) => v < 0.25);
      const hasMid = values.some((v) => v >= 0.25 && v < 0.75);
      const hasHigh = values.some((v) => v >= 0.75);

      expect(hasLow).toBe(true);
      expect(hasMid).toBe(true);
      expect(hasHigh).toBe(true);
    });

    it('should be deterministic', () => {
      const prng1 = new PRNG(77777n);
      const prng2 = new PRNG(77777n);

      expect(prng1.nextFloat()).toBe(prng2.nextFloat());
      expect(prng1.nextFloat()).toBe(prng2.nextFloat());
      expect(prng1.nextFloat()).toBe(prng2.nextFloat());
    });
  });

  describe('shuffle()', () => {
    it('should return array with same length', () => {
      const prng = new PRNG(12345n);
      const input = [1, 2, 3, 4, 5];
      const shuffled = prng.shuffle(input);

      expect(shuffled.length).toBe(input.length);
    });

    it('should contain all original elements', () => {
      const prng = new PRNG(12345n);
      const input = [1, 2, 3, 4, 5];
      const shuffled = prng.shuffle(input);

      expect(shuffled.sort()).toEqual(input.sort());
    });

    it('should not modify original array', () => {
      const prng = new PRNG(12345n);
      const input = [1, 2, 3, 4, 5];
      const original = [...input];
      prng.shuffle(input);

      expect(input).toEqual(original);
    });

    it('should be deterministic', () => {
      const prng1 = new PRNG(55555n);
      const prng2 = new PRNG(55555n);
      const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

      const shuffled1 = prng1.shuffle(input);
      const shuffled2 = prng2.shuffle(input);

      expect(shuffled1).toEqual(shuffled2);
    });

    it('should produce different permutations for different seeds', () => {
      const prng1 = new PRNG(11111n);
      const prng2 = new PRNG(22222n);
      const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

      const shuffled1 = prng1.shuffle(input);
      const shuffled2 = prng2.shuffle(input);

      expect(shuffled1).not.toEqual(shuffled2);
    });

    it('should handle empty array', () => {
      const prng = new PRNG(12345n);
      const shuffled = prng.shuffle([]);

      expect(shuffled).toEqual([]);
    });

    it('should handle single element array', () => {
      const prng = new PRNG(12345n);
      const shuffled = prng.shuffle([42]);

      expect(shuffled).toEqual([42]);
    });
  });

  describe('choice()', () => {
    it('should return element from array', () => {
      const prng = new PRNG(12345n);
      const input = ['a', 'b', 'c', 'd', 'e'];
      const chosen = prng.choice(input);

      expect(input).toContain(chosen);
    });

    it('should throw error on empty array', () => {
      const prng = new PRNG(12345n);

      expect(() => prng.choice([])).toThrow('Cannot choose from empty array');
    });

    it('should be deterministic', () => {
      const prng1 = new PRNG(33333n);
      const prng2 = new PRNG(33333n);
      const input = ['a', 'b', 'c', 'd', 'e'];

      expect(prng1.choice(input)).toBe(prng2.choice(input));
      expect(prng1.choice(input)).toBe(prng2.choice(input));
      expect(prng1.choice(input)).toBe(prng2.choice(input));
    });

    it('should select all elements over many iterations', () => {
      const prng = new PRNG(12345n);
      const input = ['a', 'b', 'c', 'd', 'e'];
      const selected = new Set<string>();

      // With 100 iterations, we should see all elements
      for (let i = 0; i < 100; i++) {
        selected.add(prng.choice(input));
      }

      expect(selected.size).toBe(input.length);
    });

    it('should handle single element array', () => {
      const prng = new PRNG(12345n);
      const chosen = prng.choice([42]);

      expect(chosen).toBe(42);
    });
  });

  describe('Statistical Properties', () => {
    it('should have roughly uniform distribution for nextUint()', () => {
      const prng = new PRNG(12345n);
      const buckets = new Array(10).fill(0);
      const iterations = 10000;

      for (let i = 0; i < iterations; i++) {
        const value = prng.nextUint();
        const bucket = Math.floor((value / 2 ** 32) * 10);
        buckets[bucket]++;
      }

      // Each bucket should have roughly 1000 values (10% of 10000)
      // Allow 20% deviation (800-1200)
      const expected = iterations / 10;
      const tolerance = expected * 0.2;

      for (const count of buckets) {
        expect(count).toBeGreaterThan(expected - tolerance);
        expect(count).toBeLessThan(expected + tolerance);
      }
    });

    it('should have roughly uniform distribution for nextFloat()', () => {
      const prng = new PRNG(54321n);
      const buckets = new Array(10).fill(0);
      const iterations = 10000;

      for (let i = 0; i < iterations; i++) {
        const value = prng.nextFloat();
        const bucket = Math.floor(value * 10);
        buckets[bucket]++;
      }

      // Each bucket should have roughly 1000 values (10% of 10000)
      // Allow 20% deviation (800-1200)
      const expected = iterations / 10;
      const tolerance = expected * 0.2;

      for (const count of buckets) {
        expect(count).toBeGreaterThan(expected - tolerance);
        expect(count).toBeLessThan(expected + tolerance);
      }
    });
  });

  describe('Performance', () => {
    it('should generate numbers quickly', () => {
      const prng = new PRNG(12345n);
      const start = Date.now();

      for (let i = 0; i < 10000; i++) {
        prng.nextUint();
      }

      const elapsed = Date.now() - start;
      // 10000 operations should complete in well under 100ms
      expect(elapsed).toBeLessThan(100);
    });

    it('should shuffle quickly', () => {
      const prng = new PRNG(12345n);
      const array = Array.from({ length: 100 }, (_, i) => i);
      const start = Date.now();

      for (let i = 0; i < 1000; i++) {
        prng.shuffle(array);
      }

      const elapsed = Date.now() - start;
      // 1000 shuffles of 100 elements should complete in well under 100ms
      expect(elapsed).toBeLessThan(100);
    });
  });
});
