/**
 * Word Selection Service - Deterministic Word Selection Algorithms
 *
 * Implements sophisticated word selection strategies to ensure:
 * - Slot Coverage: At least one word from each semantic slot
 * - Cluster Diversity: Maximum one word per taxonomic cluster (1-per-cluster rule)
 * - Wildcard Variety: 2-3 random words for unpredictability
 *
 * All selection uses the provided PRNG for determinism - same PRNG state
 * always produces the same word selections. No Math.random() is used.
 *
 * Key Algorithms:
 * 1. selectSlotCoverage(): Ensures balanced representation across semantic categories
 * 2. selectWithDiversity(): Enforces taxonomic diversity to prevent redundancy
 * 3. selectWildcards(): Adds surprise elements while respecting constraints
 * 4. getAllWords(): Utility to flatten theme structure into word array
 *
 * @example
 * ```typescript
 * const selector = new WordSelectionService();
 * const prng = new PRNG(12345n);
 * const usedClusters = new Set<string>();
 *
 * // Get slot coverage
 * const slotWords = selector.selectSlotCoverage(theme, prng, usedClusters);
 *
 * // Add diverse words
 * const allWords = selector.getAllWords(theme);
 * const diverse = selector.selectWithDiversity(allWords, 5, prng, usedClusters, lexicon);
 *
 * // Add wildcards
 * const wildcards = selector.selectWildcards(allWords, 2, prng, new Set(slotWords), usedClusters, lexicon);
 * ```
 */

import { Theme, LexiconMap } from '../types/seeding.types.js';
import { PRNG } from './prng.service.js';

/**
 * Check if debug logging is enabled via DEBUG_SEEDING environment variable.
 */
function isDebugEnabled(): boolean {
  return process.env.DEBUG_SEEDING === 'true';
}

/**
 * WordSelectionService provides deterministic word selection algorithms
 * that ensure balanced, diverse, and fair word sets for users.
 */
export class WordSelectionService {
  /**
   * Ensure at least one word from each semantic slot.
   *
   * This algorithm guarantees balanced representation across all semantic categories
   * (subject, action, setting, mood, modifier). It processes slots in deterministic
   * order and respects cluster constraints when possible.
   *
   * Algorithm:
   * 1. Iterate through all slots in deterministic order (Object.keys)
   * 2. For each slot, filter candidates that haven't used their cluster yet
   * 3. If candidates exist, shuffle and pick first (respects cluster constraint)
   * 4. If no candidates (all clusters used), pick any word from slot
   * 5. Mark chosen word's cluster as used
   *
   * @param theme - Theme containing slots with words and clusters
   * @param prng - PRNG instance for deterministic randomization
   * @param usedClusters - Set tracking which clusters have been used (mutated)
   * @returns Array of selected words (one per slot)
   *
   * @example
   * ```typescript
   * const usedClusters = new Set<string>();
   * const words = selector.selectSlotCoverage(theme, prng, usedClusters);
   * // words.length === Object.keys(theme.slots).length
   * // Each word comes from a different slot
   * ```
   */
  selectSlotCoverage(
    theme: Theme,
    prng: PRNG,
    usedClusters: Set<string>
  ): string[] {
    const selected: string[] = [];
    const slotNames = Object.keys(theme.slots);

    if (isDebugEnabled()) {
      console.log(
        JSON.stringify({
          debug: 'selectSlotCoverage:start',
          slots: slotNames,
          usedClustersBefore: Array.from(usedClusters),
          timestamp: new Date().toISOString(),
        })
      );
    }

    for (const slotName of slotNames) {
      const slot = theme.slots[slotName];

      // Build candidates: words whose clusters haven't been used yet
      const candidates = slot.words
        .map((word, idx) => ({ word, cluster: slot.clusters[idx] }))
        .filter(({ cluster }) => !usedClusters.has(cluster));

      if (candidates.length === 0) {
        // All clusters used in this slot, pick any word
        const word = prng.choice(slot.words);
        selected.push(word);

        if (isDebugEnabled()) {
          console.log(
            JSON.stringify({
              debug: 'selectSlotCoverage:slot',
              slotName,
              word,
              reason: 'all_clusters_used',
              timestamp: new Date().toISOString(),
            })
          );
        }
        continue;
      }

      // Shuffle candidates and pick first to maintain determinism
      const shuffled = prng.shuffle(candidates);
      const chosen = shuffled[0];
      selected.push(chosen.word);
      usedClusters.add(chosen.cluster);

      if (isDebugEnabled()) {
        console.log(
          JSON.stringify({
            debug: 'selectSlotCoverage:slot',
            slotName,
            word: chosen.word,
            cluster: chosen.cluster,
            candidatesCount: candidates.length,
            timestamp: new Date().toISOString(),
          })
        );
      }
    }

    if (isDebugEnabled()) {
      console.log(
        JSON.stringify({
          debug: 'selectSlotCoverage:complete',
          selected,
          usedClustersAfter: Array.from(usedClusters),
          timestamp: new Date().toISOString(),
        })
      );
    }

    return selected;
  }

  /**
   * Select additional words while respecting 1-per-cluster constraint.
   *
   * This algorithm fills remaining word budget with diverse selections,
   * enforcing the taxonomic diversity rule: maximum one word per cluster.
   * It gracefully degrades when cluster constraints limit selection.
   *
   * Algorithm:
   * 1. Shuffle all available words using PRNG
   * 2. Iterate through shuffled words
   * 3. For each word, check if its cluster is already used
   * 4. If cluster is available, select word and mark cluster as used
   * 5. Continue until count is reached or words exhausted
   * 6. Words without metadata are treated as unique clusters
   *
   * @param allWords - Array of all available words from theme
   * @param count - Target number of words to select
   * @param prng - PRNG instance for deterministic randomization
   * @param usedClusters - Set tracking which clusters have been used (mutated)
   * @param lexicon - Lexicon map for looking up word metadata
   * @returns Array of selected words (length <= count)
   *
   * @example
   * ```typescript
   * const allWords = selector.getAllWords(theme);
   * const usedClusters = new Set(['urban-light', 'light-steady']);
   * const words = selector.selectWithDiversity(allWords, 5, prng, usedClusters, lexicon);
   * // words.length <= 5
   * // No two words share the same cluster
   * ```
   */
  selectWithDiversity(
    allWords: string[],
    count: number,
    prng: PRNG,
    usedClusters: Set<string>,
    lexicon: LexiconMap
  ): string[] {
    const selected: string[] = [];
    const shuffled = prng.shuffle(allWords);

    if (isDebugEnabled()) {
      console.log(
        JSON.stringify({
          debug: 'selectWithDiversity:start',
          count,
          totalWords: allWords.length,
          usedClustersBefore: Array.from(usedClusters),
          timestamp: new Date().toISOString(),
        })
      );
    }

    for (const word of shuffled) {
      if (selected.length >= count) break;

      const metadata = lexicon.mappings[word];
      if (!metadata) {
        // No metadata, treat as unique cluster - always selectable
        selected.push(word);

        if (isDebugEnabled()) {
          console.log(
            JSON.stringify({
              debug: 'selectWithDiversity:word',
              word,
              reason: 'no_metadata',
              timestamp: new Date().toISOString(),
            })
          );
        }
        continue;
      }

      if (!usedClusters.has(metadata.cluster)) {
        selected.push(word);
        usedClusters.add(metadata.cluster);

        if (isDebugEnabled()) {
          console.log(
            JSON.stringify({
              debug: 'selectWithDiversity:word',
              word,
              cluster: metadata.cluster,
              slot: metadata.slot,
              timestamp: new Date().toISOString(),
            })
          );
        }
      }
    }

    if (isDebugEnabled()) {
      console.log(
        JSON.stringify({
          debug: 'selectWithDiversity:complete',
          selected,
          usedClustersAfter: Array.from(usedClusters),
          timestamp: new Date().toISOString(),
        })
      );
    }

    return selected;
  }

  /**
   * Add 2-3 wildcard words for variety.
   *
   * Wildcards introduce an element of surprise and unpredictability beyond
   * structured slot coverage. They respect both word uniqueness and cluster
   * diversity constraints.
   *
   * Algorithm:
   * 1. Shuffle all available words using PRNG
   * 2. Iterate through shuffled words
   * 3. Skip if word is already selected (no duplicates)
   * 4. Skip if word's cluster is already used (respect diversity)
   * 5. Add word and mark cluster as used
   * 6. Continue until count is reached or words exhausted
   *
   * @param allWords - Array of all available words from theme
   * @param count - Target number of wildcard words (typically 2-3)
   * @param prng - PRNG instance for deterministic randomization
   * @param usedWords - Set of words already selected (prevents duplicates)
   * @param usedClusters - Set tracking which clusters have been used (mutated)
   * @param lexicon - Lexicon map for looking up word metadata
   * @returns Array of wildcard words (length <= count)
   *
   * @example
   * ```typescript
   * const allWords = selector.getAllWords(theme);
   * const usedWords = new Set(['neon', 'glowing', 'rain']);
   * const usedClusters = new Set(['urban-light', 'light-steady', 'weather-wet']);
   * const wildcards = selector.selectWildcards(allWords, 2, prng, usedWords, usedClusters, lexicon);
   * // wildcards.length <= 2
   * // No wildcards duplicate existing words
   * // No wildcards share clusters with existing words
   * ```
   */
  selectWildcards(
    allWords: string[],
    count: number,
    prng: PRNG,
    usedWords: Set<string>,
    usedClusters: Set<string>,
    lexicon: LexiconMap
  ): string[] {
    const wildcards: string[] = [];
    const shuffled = prng.shuffle(allWords);

    if (isDebugEnabled()) {
      console.log(
        JSON.stringify({
          debug: 'selectWildcards:start',
          count,
          totalWords: allWords.length,
          usedWordsCount: usedWords.size,
          usedClustersBefore: Array.from(usedClusters),
          timestamp: new Date().toISOString(),
        })
      );
    }

    for (const word of shuffled) {
      if (wildcards.length >= count) break;
      if (usedWords.has(word)) {
        if (isDebugEnabled()) {
          console.log(
            JSON.stringify({
              debug: 'selectWildcards:skip',
              word,
              reason: 'already_used',
              timestamp: new Date().toISOString(),
            })
          );
        }
        continue;
      }

      const metadata = lexicon.mappings[word];
      if (metadata && usedClusters.has(metadata.cluster)) {
        if (isDebugEnabled()) {
          console.log(
            JSON.stringify({
              debug: 'selectWildcards:skip',
              word,
              reason: 'cluster_used',
              cluster: metadata.cluster,
              timestamp: new Date().toISOString(),
            })
          );
        }
        continue;
      }

      wildcards.push(word);
      if (metadata) usedClusters.add(metadata.cluster);

      if (isDebugEnabled()) {
        console.log(
          JSON.stringify({
            debug: 'selectWildcards:word',
            word,
            cluster: metadata?.cluster || 'none',
            timestamp: new Date().toISOString(),
          })
        );
      }
    }

    if (isDebugEnabled()) {
      console.log(
        JSON.stringify({
          debug: 'selectWildcards:complete',
          wildcards,
          usedClustersAfter: Array.from(usedClusters),
          timestamp: new Date().toISOString(),
        })
      );
    }

    return wildcards;
  }

  /**
   * Flatten theme into array of all words.
   *
   * Utility method that extracts all words from all slots in a theme
   * into a single flat array. Useful for operations that need to consider
   * the entire word pool.
   *
   * @param theme - Theme containing slots with words
   * @returns Flat array of all words across all slots
   *
   * @example
   * ```typescript
   * const allWords = selector.getAllWords(theme);
   * // allWords = ['neon', 'skyline', 'glowing', 'flickering', 'rain', ...]
   * ```
   */
  getAllWords(theme: Theme): string[] {
    const allWords: string[] = [];
    const slotNames = Object.keys(theme.slots);

    for (const slotName of slotNames) {
      allWords.push(...theme.slots[slotName].words);
    }

    return allWords;
  }
}
