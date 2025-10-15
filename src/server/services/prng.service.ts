/**
 * PRNG Service - High-Quality Pseudo-Random Number Generator
 *
 * Implements SplitMix64 for state initialization and Xoroshiro128+ for generation.
 * Provides deterministic random number generation from a 64-bit seed.
 *
 * Algorithm Details:
 * - SplitMix64: Used for initializing the two 64-bit state values from a single seed
 * - Xoroshiro128+: Fast, high-quality PRNG that passes statistical tests (BigCrush)
 * - Period: 2^128 - 1 (extremely long before repeating)
 *
 * Key Properties:
 * - Deterministic: Same seed always produces same sequence
 * - High quality: Passes statistical randomness tests
 * - Fast: Optimized for performance with bitwise operations
 * - No Math.random(): Uses pure algorithmic generation
 *
 * References:
 * - SplitMix64: https://prng.di.unimi.it/splitmix64.c
 * - Xoroshiro128+: https://prng.di.unimi.it/xoroshiro128plus.c
 *
 * @example
 * ```typescript
 * const prng = new PRNG(12345n);
 * const randomInt = prng.nextUint();        // 0 to 2^32-1
 * const randomFloat = prng.nextFloat();     // [0, 1)
 * const shuffled = prng.shuffle([1,2,3,4]); // Random permutation
 * const choice = prng.choice(['a','b','c']); // Random element
 * ```
 */

const UINT64_MAX = 0xffffffffffffffffn;
const UINT32_MAX = 0x100000000;
const SPLITMIX64_CONST_1 = 0xbf58476d1ce4e5b9n;
const SPLITMIX64_CONST_2 = 0x94d049bb133111ebn;
const XOROSHIRO_ROTL_A = 24n;
const XOROSHIRO_ROTL_B = 37n;
const XOROSHIRO_SHIFT = 16n;
const BIGINT_64 = 64n;
const BIGINT_32 = 32n;
const BIGINT_30 = 30n;
const BIGINT_27 = 27n;
const BIGINT_31 = 31n;

/**
 * PRNG implements a high-quality pseudo-random number generator using
 * SplitMix64 for initialization and Xoroshiro128+ for generation.
 *
 * All operations use BigInt to maintain 64-bit precision without floating-point errors.
 * The generator is deterministic: the same seed will always produce the same sequence.
 */
export class PRNG {
  private state0: bigint;
  private state1: bigint;

  /**
   * Creates a new PRNG instance initialized with the given seed.
   *
   * Uses SplitMix64 to generate two 64-bit state values from the single seed.
   * This ensures good initial state distribution even for similar seeds.
   *
   * @param seed - 64-bit seed value as BigInt
   * @throws {Error} If seed is not a BigInt
   *
   * @example
   * ```typescript
   * const prng1 = new PRNG(12345n);
   * const prng2 = new PRNG(12345n);
   * console.log(prng1.nextUint() === prng2.nextUint()); // true (deterministic)
   * ```
   */
  constructor(seed: bigint) {
    if (typeof seed !== 'bigint') {
      throw new Error('seed must be a BigInt');
    }

    const [s0, s1] = this.splitMix64Init(seed);
    this.state0 = s0;
    this.state1 = s1;
  }

  /**
   * SplitMix64 initialization to generate two 64-bit states from a single seed.
   *
   * This is a high-quality hash function that ensures good state distribution.
   * It's specifically designed for seeding other PRNGs.
   *
   * @param seed - Initial seed value
   * @returns Tuple of two 64-bit state values [state0, state1]
   * @private
   */
  private splitMix64Init(seed: bigint): [bigint, bigint] {
    // First state value using SplitMix64 algorithm
    let z = seed;
    // XOR with right-shifted value, then multiply by large prime
    // This creates avalanche effect: small input changes cause large output changes
    z = (z ^ (z >> BIGINT_30)) * SPLITMIX64_CONST_1; // 0xbf58476d1ce4e5b9
    z = (z ^ (z >> BIGINT_27)) * SPLITMIX64_CONST_2; // 0x94d049bb133111eb
    const s0 = z ^ (z >> BIGINT_31); // Final XOR for bit mixing

    // Second state value (increment seed first to ensure different input)
    z = s0 + 1n; // Increment to get different starting point
    // Apply same SplitMix64 transformation to get second independent state
    z = (z ^ (z >> BIGINT_30)) * SPLITMIX64_CONST_1;
    z = (z ^ (z >> BIGINT_27)) * SPLITMIX64_CONST_2;
    const s1 = z ^ (z >> BIGINT_31);

    // Mask to 64 bits to prevent BigInt overflow beyond our target range
    return [s0 & UINT64_MAX, s1 & UINT64_MAX];
  }

  /**
   * Xoroshiro128+ next() - generates next 64-bit random number.
   *
   * This is the core PRNG algorithm. It updates the internal state
   * and returns a random 64-bit value.
   *
   * @returns 64-bit random value as BigInt
   * @private
   */
  private next(): bigint {
    const s0 = this.state0;
    let s1 = this.state1;
    // Xoroshiro128+ output: sum of the two states (+ operation)
    // Mask to 64 bits to prevent overflow
    const result = (s0 + s1) & UINT64_MAX;

    // Update state using Xoroshiro128+ algorithm
    s1 ^= s0; // XOR s1 with s0 for bit mixing

    // Update state0: rotate s0 left by 24, XOR with s1, XOR with s1 shifted left by 16
    // This creates complex bit dependencies between states
    this.state0 =
      (this.rotl(s0, XOROSHIRO_ROTL_A) ^ s1 ^ (s1 << XOROSHIRO_SHIFT)) &
      UINT64_MAX;

    // Update state1: rotate s1 left by 37 bits
    // Different rotation amount ensures state evolution independence
    this.state1 = this.rotl(s1, XOROSHIRO_ROTL_B);

    return result;
  }

  /**
   * Rotate left helper for bitwise rotation.
   *
   * Performs a 64-bit left rotation: (x << k) | (x >> (64 - k))
   *
   * @param x - Value to rotate
   * @param k - Number of bits to rotate left
   * @returns Rotated value masked to 64 bits
   * @private
   */
  private rotl(x: bigint, k: bigint): bigint {
    // Left rotation: (x << k) | (x >> (64 - k))
    // Left shift k positions, OR with right shift (64-k) positions
    // This moves bits that would overflow back to the right side
    // Example: rotl(0b11000001, 2) = 0b00000111 (bits wrap around)
    return ((x << k) | (x >> (BIGINT_64 - k))) & UINT64_MAX;
  }

  /**
   * Generate uniformly distributed 32-bit unsigned integer.
   *
   * Takes the upper 32 bits of the 64-bit random value for better quality.
   * Returns a number in the range [0, 2^32-1].
   *
   * @returns 32-bit unsigned integer (0 to 4294967295)
   *
   * @example
   * ```typescript
   * const prng = new PRNG(12345n);
   * const randomInt = prng.nextUint();
   * console.log(randomInt >= 0 && randomInt < 4294967296); // true
   * ```
   */
  nextUint(): number {
    return Number(this.next() >> BIGINT_32) >>> 0;
  }

  /**
   * Generate uniformly distributed float in [0, 1).
   *
   * Converts a 32-bit unsigned integer to a float by dividing by 2^32.
   * The result is always in the range [0, 1) (inclusive of 0, exclusive of 1).
   *
   * @returns Float in range [0, 1)
   *
   * @example
   * ```typescript
   * const prng = new PRNG(12345n);
   * const randomFloat = prng.nextFloat();
   * console.log(randomFloat >= 0 && randomFloat < 1); // true
   * ```
   */
  nextFloat(): number {
    return this.nextUint() / UINT32_MAX;
  }

  /**
   * Fisher-Yates shuffle using this PRNG.
   *
   * Produces an unbiased random permutation of the input array.
   * Does not modify the original array.
   *
   * @param array - Array to shuffle
   * @returns New array with elements randomly permuted
   *
   * @example
   * ```typescript
   * const prng = new PRNG(12345n);
   * const shuffled = prng.shuffle([1, 2, 3, 4, 5]);
   * console.log(shuffled.length === 5); // true
   * console.log(shuffled.includes(1)); // true (all elements present)
   * ```
   */
  shuffle<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.nextFloat() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  /**
   * Select random element from array.
   *
   * Uses uniform distribution to select an element.
   * Throws an error if the array is empty.
   *
   * @param array - Array to choose from
   * @returns Randomly selected element
   * @throws {Error} If array is empty
   *
   * @example
   * ```typescript
   * const prng = new PRNG(12345n);
   * const element = prng.choice(['a', 'b', 'c']);
   * console.log(['a', 'b', 'c'].includes(element)); // true
   * ```
   */
  choice<T>(array: T[]): T {
    if (array.length === 0) {
      throw new Error('Cannot choose from empty array');
    }
    const index = Math.floor(this.nextFloat() * array.length);
    return array[index];
  }
}
