/**
 * TypeScript type definitions for the Beef (Choice Chorus) data layer.
 * These types define the structure of data stored in Redis and passed between services.
 */

/**
 * Seed data stored in Redis for each daily game.
 * Contains the cryptographic seed, theme, and metadata for word generation.
 *
 * Stored in Redis key: `seed:{date}` where date is YYYY-MM-DD format
 *
 * @example
 * {
 *   seedHex: "8d23abc...",
 *   theme: "Nocturnal Cities",
 *   poolsVersion: "v1",
 *   createdAt: 1728950400
 * }
 */
export interface SeedData {
  /** HMAC-SHA256 hex string used as the deterministic seed for word generation */
  seedHex: string;
  /** Daily theme describing the word pool category (e.g., "Nocturnal Cities") */
  theme: string;
  /** Version identifier of the word pools used for generation (e.g., "v1") */
  poolsVersion: string;
  /** Unix timestamp (seconds) when the seed was created */
  createdAt: number;
}

/**
 * User's word choices for a specific day.
 * Array of word strings selected by the user from their generated pool.
 *
 * Stored in Redis hash: `choices:{date}` with field being the hashed user ID
 *
 * @example
 * ["neon", "rain", "alley", "midnight", "glow"]
 */
export type UserChoices = string[];

/**
 * Tally entry representing a word and its vote count.
 * Used for leaderboard display and tracking word popularity.
 *
 * Retrieved from Redis sorted set: `tallies:{date}`
 *
 * @example
 * {
 *   word: "neon",
 *   count: 42
 * }
 */
export interface TallyEntry {
  /** The word that was voted for */
  word: string;
  /** Number of times this word has been selected by users */
  count: number;
}

/**
 * PostData sent to the client on initial page load.
 * Must be ≤ 2KB to comply with Devvit platform constraints.
 *
 * This data is embedded in the post and allows the client to render
 * initial content without making additional API calls.
 *
 * @example
 * {
 *   date: "2025-10-14",
 *   theme: "Nocturnal Cities",
 *   seedPreview: "8d23abc1",
 *   teaserTop: ["neon", "rain", "alley"],
 *   timeLeftSec: 43200
 * }
 */
export interface PostData {
  /** Date in YYYY-MM-DD format for the current game day */
  date: string;
  /** Daily theme describing the word pool category */
  theme: string;
  /** First 8 characters of the seedHex for display purposes */
  seedPreview: string;
  /** Array of top-voted words (truncated to fit 2KB limit) */
  teaserTop: string[];
  /** Seconds remaining until 23:00 Bangkok time (UTC+7) */
  timeLeftSec: number;
}

/**
 * Telemetry data for performance tracking and monitoring.
 * Tracks request counts, error counts, and latency samples for p95 calculation.
 *
 * Stored in Redis hash: `telemetry:{date}` for counters
 * Stored in Redis sorted set: `telemetry:{date}:p95` for latency samples
 *
 * @example
 * {
 *   requests: 1523,
 *   errors: 3,
 *   p95Samples: [45, 52, 38, 67, 41]
 * }
 */
export interface TelemetryData {
  /** Total number of requests processed */
  requests: number;
  /** Total number of errors encountered */
  errors: number;
  /** Array of latency samples (in milliseconds) for p95 calculation */
  p95Samples: number[];
}
