/**
 * TypeScript type definitions for the seeding engine.
 * These types define the structure of word pools, themes, lexicon mappings,
 * and metadata used for deterministic word generation.
 */

/**
 * Root structure for word pools loaded from data/pools.v1.json.
 * Contains versioning information and a collection of themed word pools.
 *
 * @example
 * {
 *   version: "v1",
 *   themes: {
 *     "nocturnal-cities": { ... }
 *   }
 * }
 */
export interface WordPools {
  /** Version identifier for the word pools (e.g., "v1") */
  version: string;
  /** Map of theme identifiers to Theme objects */
  themes: Record<string, Theme>;
}

/**
 * A themed collection of words organized by semantic slots.
 * Each theme represents a cohesive set of words grouped by meaning and purpose.
 *
 * @example
 * {
 *   name: "Nocturnal Cities",
 *   slots: {
 *     subject: { words: ["neon", "skyline"], clusters: ["urban", "urban"] },
 *     action: { words: ["glowing", "flickering"], clusters: ["light", "light"] }
 *   }
 * }
 */
export interface Theme {
  /** Human-readable name of the theme (e.g., "Nocturnal Cities") */
  name: string;
  /** Map of slot names to Slot objects containing words and cluster tags */
  slots: Record<string, Slot>;
}

/**
 * A semantic slot containing words and their taxonomic cluster assignments.
 * Slots represent categories like "subject", "action", "setting", "mood", "modifier".
 * Each word is paired with a cluster tag for diversity enforcement.
 *
 * @example
 * {
 *   words: ["neon", "skyline", "alley"],
 *   clusters: ["urban", "urban", "urban"]
 * }
 */
export interface Slot {
  /** Array of words belonging to this semantic slot */
  words: string[];
  /** Array of cluster tags corresponding to each word (same length as words array) */
  clusters: string[];
}

/**
 * Root structure for lexicon mappings loaded from data/lexicon.map.json.
 * Provides canonical forms and metadata for all words in the pools.
 *
 * @example
 * {
 *   version: "v1",
 *   mappings: {
 *     "neon": { canonical: "neon", slot: "subject", cluster: "urban" }
 *   }
 * }
 */
export interface LexiconMap {
  /** Version identifier for the lexicon (e.g., "v1") */
  version: string;
  /** Map of word strings to their metadata */
  mappings: Record<string, WordMetadata>;
}

/**
 * Metadata for a single word in the lexicon.
 * Defines the canonical form, semantic slot, and taxonomic cluster.
 *
 * @example
 * {
 *   canonical: "neon",
 *   slot: "subject",
 *   cluster: "urban"
 * }
 */
export interface WordMetadata {
  /** Canonical form of the word (normalized representation) */
  canonical: string;
  /** Semantic slot this word belongs to (e.g., "subject", "action") */
  slot: string;
  /** Taxonomic cluster for diversity enforcement (e.g., "urban", "light") */
  cluster: string;
}
