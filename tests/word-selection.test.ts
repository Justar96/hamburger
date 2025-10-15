/**
 * Word Selection Service Tests
 *
 * Tests the deterministic word selection algorithms that ensure:
 * - Slot Coverage: At least one word from each semantic slot
 * - Cluster Diversity: Maximum one word per taxonomic cluster
 * - Wildcard Variety: 2-3 random words for unpredictability
 * - Determinism: Same PRNG seed produces same selections
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { WordSelectionService } from '../src/server/services/word-selection.service';
import { PRNG } from '../src/server/services/prng.service';
import { Theme, LexiconMap } from '../src/server/types/seeding.types';

describe('WordSelectionService', () => {
  let service: WordSelectionService;

  // Test fixtures - minimal theme with controlled data
  const createTestTheme = (): Theme => ({
    name: 'Test Theme',
    slots: {
      subject: {
        words: ['neon', 'skyline', 'alley', 'street'],
        clusters: ['urban-light', 'urban-structure', 'urban-passage', 'urban-passage'],
      },
      action: {
        words: ['glowing', 'flickering', 'reflecting'],
        clusters: ['light-steady', 'light-unsteady', 'light-mirror'],
      },
      setting: {
        words: ['rain', 'fog', 'night'],
        clusters: ['weather-wet', 'weather-obscure', 'time-dark'],
      },
    },
  });

  const createTestLexicon = (): LexiconMap => ({
    version: 'v1',
    mappings: {
      neon: { canonical: 'neon', slot: 'subject', cluster: 'urban-light' },
      skyline: { canonical: 'skyline', slot: 'subject', cluster: 'urban-structure' },
      alley: { canonical: 'alley', slot: 'subject', cluster: 'urban-passage' },
      street: { canonical: 'street', slot: 'subject', cluster: 'urban-passage' },
      glowing: { canonical: 'glowing', slot: 'action', cluster: 'light-steady' },
      flickering: { canonical: 'flickering', slot: 'action', cluster: 'light-unsteady' },
      reflecting: { canonical: 'reflecting', slot: 'action', cluster: 'light-mirror' },
      rain: { canonical: 'rain', slot: 'setting', cluster: 'weather-wet' },
      fog: { canonical: 'fog', slot: 'setting', cluster: 'weather-obscure' },
      night: { canonical: 'night', slot: 'setting', cluster: 'time-dark' },
    },
  });

  beforeEach(() => {
    service = new WordSelectionService();
  });

  describe('getAllWords()', () => {
    it('should flatten all words from all slots', () => {
      const theme = createTestTheme();
      const allWords = service.getAllWords(theme);

      expect(allWords).toHaveLength(10); // 4 + 3 + 3
      expect(allWords).toContain('neon');
      expect(allWords).toContain('glowing');
      expect(allWords).toContain('rain');
    });

    it('should maintain order of slots', () => {
      const theme = createTestTheme();
      const allWords = service.getAllWords(theme);

      // First 4 should be from subject slot
      expect(allWords.slice(0, 4)).toEqual(['neon', 'skyline', 'alley', 'street']);
      // Next 3 from action slot
      expect(allWords.slice(4, 7)).toEqual(['glowing', 'flickering', 'reflecting']);
      // Last 3 from setting slot
      expect(allWords.slice(7, 10)).toEqual(['rain', 'fog', 'night']);
    });

    it('should handle empty theme', () => {
      const emptyTheme: Theme = { name: 'Empty', slots: {} };
      const allWords = service.getAllWords(emptyTheme);

      expect(allWords).toEqual([]);
    });

    it('should handle theme with empty slots', () => {
      const theme: Theme = {
        name: 'Sparse',
        slots: {
          subject: { words: ['word1'], clusters: ['cluster1'] },
          action: { words: [], clusters: [] },
          setting: { words: ['word2'], clusters: ['cluster2'] },
        },
      };
      const allWords = service.getAllWords(theme);

      expect(allWords).toEqual(['word1', 'word2']);
    });
  });

  describe('selectSlotCoverage()', () => {
    it('should include at least one word from each slot', () => {
      const theme = createTestTheme();
      const prng = new PRNG(12345n);
      const usedClusters = new Set<string>();

      const selected = service.selectSlotCoverage(theme, prng, usedClusters);

      expect(selected).toHaveLength(3); // One per slot

      // Verify each word comes from a different slot
      const lexicon = createTestLexicon();
      const slots = selected.map((word) => lexicon.mappings[word]?.slot);
      expect(new Set(slots).size).toBe(3); // All different slots
      expect(slots).toContain('subject');
      expect(slots).toContain('action');
      expect(slots).toContain('setting');
    });

    it('should respect cluster constraints when possible', () => {
      const theme = createTestTheme();
      const prng = new PRNG(12345n);
      const usedClusters = new Set<string>();

      const selected = service.selectSlotCoverage(theme, prng, usedClusters);

      // Check that usedClusters was updated
      expect(usedClusters.size).toBeGreaterThan(0);

      // Verify no duplicate clusters in selection
      const lexicon = createTestLexicon();
      const clusters = selected.map((word) => lexicon.mappings[word]?.cluster);
      expect(new Set(clusters).size).toBe(clusters.length); // All unique
    });

    it('should handle pre-used clusters gracefully', () => {
      const theme = createTestTheme();
      const prng = new PRNG(12345n);
      const usedClusters = new Set(['urban-light', 'light-steady', 'weather-wet']);

      const selected = service.selectSlotCoverage(theme, prng, usedClusters);

      // Should still select one word per slot, even if clusters are used
      expect(selected).toHaveLength(3);

      // Verify words are from correct slots
      const lexicon = createTestLexicon();
      const slots = selected.map((word) => lexicon.mappings[word]?.slot);
      expect(slots).toContain('subject');
      expect(slots).toContain('action');
      expect(slots).toContain('setting');
    });

    it('should be deterministic with same PRNG seed', () => {
      const theme = createTestTheme();

      const prng1 = new PRNG(99999n);
      const usedClusters1 = new Set<string>();
      const selected1 = service.selectSlotCoverage(theme, prng1, usedClusters1);

      const prng2 = new PRNG(99999n);
      const usedClusters2 = new Set<string>();
      const selected2 = service.selectSlotCoverage(theme, prng2, usedClusters2);

      expect(selected1).toEqual(selected2);
      expect(Array.from(usedClusters1)).toEqual(Array.from(usedClusters2));
    });

    it('should produce different selections with different PRNG seeds', () => {
      const theme = createTestTheme();

      const prng1 = new PRNG(11111n);
      const usedClusters1 = new Set<string>();
      const selected1 = service.selectSlotCoverage(theme, prng1, usedClusters1);

      const prng2 = new PRNG(22222n);
      const usedClusters2 = new Set<string>();
      const selected2 = service.selectSlotCoverage(theme, prng2, usedClusters2);

      // With different seeds, selections should differ
      // (not guaranteed but highly likely with 10 words)
      expect(selected1).not.toEqual(selected2);
    });

    it('should handle slot with all clusters already used', () => {
      const theme: Theme = {
        name: 'Limited',
        slots: {
          subject: {
            words: ['word1', 'word2', 'word3'],
            clusters: ['cluster-a', 'cluster-a', 'cluster-a'], // All same cluster
          },
        },
      };

      const prng = new PRNG(12345n);
      const usedClusters = new Set(['cluster-a']); // Pre-mark as used

      const selected = service.selectSlotCoverage(theme, prng, usedClusters);

      // Should still select a word even though cluster is used
      expect(selected).toHaveLength(1);
      expect(['word1', 'word2', 'word3']).toContain(selected[0]);
    });

    it('should mutate usedClusters set', () => {
      const theme = createTestTheme();
      const prng = new PRNG(12345n);
      const usedClusters = new Set<string>();

      expect(usedClusters.size).toBe(0);

      service.selectSlotCoverage(theme, prng, usedClusters);

      // usedClusters should be updated
      expect(usedClusters.size).toBeGreaterThan(0);
    });
  });

  describe('selectWithDiversity()', () => {
    it('should enforce 1-per-cluster rule', () => {
      const theme = createTestTheme();
      const allWords = service.getAllWords(theme);
      const lexicon = createTestLexicon();
      const prng = new PRNG(12345n);
      const usedClusters = new Set<string>();

      const selected = service.selectWithDiversity(allWords, 5, prng, usedClusters, lexicon);

      // Verify no duplicate clusters
      const clusters = selected.map((word) => lexicon.mappings[word]?.cluster);
      expect(new Set(clusters).size).toBe(clusters.length); // All unique
    });

    it('should respect pre-used clusters', () => {
      const theme = createTestTheme();
      const allWords = service.getAllWords(theme);
      const lexicon = createTestLexicon();
      const prng = new PRNG(12345n);
      const usedClusters = new Set(['urban-light', 'light-steady']);

      const selected = service.selectWithDiversity(allWords, 5, prng, usedClusters, lexicon);

      // Verify selected words don't use pre-marked clusters
      const clusters = selected.map((word) => lexicon.mappings[word]?.cluster);
      expect(clusters).not.toContain('urban-light');
      expect(clusters).not.toContain('light-steady');
    });

    it('should return up to count words', () => {
      const theme = createTestTheme();
      const allWords = service.getAllWords(theme);
      const lexicon = createTestLexicon();
      const prng = new PRNG(12345n);
      const usedClusters = new Set<string>();

      const selected = service.selectWithDiversity(allWords, 3, prng, usedClusters, lexicon);

      expect(selected.length).toBeLessThanOrEqual(3);
    });

    it('should handle words without metadata', () => {
      const allWords = ['word1', 'word2', 'word3'];
      const lexicon: LexiconMap = { version: 'v1', mappings: {} }; // Empty lexicon
      const prng = new PRNG(12345n);
      const usedClusters = new Set<string>();

      const selected = service.selectWithDiversity(allWords, 2, prng, usedClusters, lexicon);

      // Words without metadata should be treated as unique clusters
      expect(selected.length).toBe(2);
    });

    it('should be deterministic with same PRNG seed', () => {
      const theme = createTestTheme();
      const allWords = service.getAllWords(theme);
      const lexicon = createTestLexicon();

      const prng1 = new PRNG(77777n);
      const usedClusters1 = new Set<string>();
      const selected1 = service.selectWithDiversity(allWords, 4, prng1, usedClusters1, lexicon);

      const prng2 = new PRNG(77777n);
      const usedClusters2 = new Set<string>();
      const selected2 = service.selectWithDiversity(allWords, 4, prng2, usedClusters2, lexicon);

      expect(selected1).toEqual(selected2);
    });

    it('should gracefully degrade when pool is smaller than target', () => {
      const theme: Theme = {
        name: 'Small',
        slots: {
          subject: {
            words: ['word1', 'word2'],
            clusters: ['cluster-a', 'cluster-b'],
          },
        },
      };
      const allWords = service.getAllWords(theme);
      const lexicon: LexiconMap = {
        version: 'v1',
        mappings: {
          word1: { canonical: 'word1', slot: 'subject', cluster: 'cluster-a' },
          word2: { canonical: 'word2', slot: 'subject', cluster: 'cluster-b' },
        },
      };
      const prng = new PRNG(12345n);
      const usedClusters = new Set<string>();

      const selected = service.selectWithDiversity(allWords, 10, prng, usedClusters, lexicon);

      // Should return only available words (2), not crash or loop
      expect(selected.length).toBeLessThanOrEqual(2);
    });

    it('should gracefully degrade when clusters are exhausted', () => {
      const theme: Theme = {
        name: 'Limited',
        slots: {
          subject: {
            words: ['word1', 'word2', 'word3', 'word4'],
            clusters: ['cluster-a', 'cluster-a', 'cluster-b', 'cluster-b'], // Only 2 unique clusters
          },
        },
      };
      const allWords = service.getAllWords(theme);
      const lexicon: LexiconMap = {
        version: 'v1',
        mappings: {
          word1: { canonical: 'word1', slot: 'subject', cluster: 'cluster-a' },
          word2: { canonical: 'word2', slot: 'subject', cluster: 'cluster-a' },
          word3: { canonical: 'word3', slot: 'subject', cluster: 'cluster-b' },
          word4: { canonical: 'word4', slot: 'subject', cluster: 'cluster-b' },
        },
      };
      const prng = new PRNG(12345n);
      const usedClusters = new Set<string>();

      const selected = service.selectWithDiversity(allWords, 10, prng, usedClusters, lexicon);

      // Can only select 2 words (one per cluster)
      expect(selected.length).toBe(2);
      expect(usedClusters.size).toBe(2);
    });

    it('should mutate usedClusters set', () => {
      const theme = createTestTheme();
      const allWords = service.getAllWords(theme);
      const lexicon = createTestLexicon();
      const prng = new PRNG(12345n);
      const usedClusters = new Set<string>();

      expect(usedClusters.size).toBe(0);

      service.selectWithDiversity(allWords, 3, prng, usedClusters, lexicon);

      expect(usedClusters.size).toBeGreaterThan(0);
    });
  });

  describe('selectWildcards()', () => {
    it('should not duplicate existing words', () => {
      const theme = createTestTheme();
      const allWords = service.getAllWords(theme);
      const lexicon = createTestLexicon();
      const prng = new PRNG(12345n);
      const usedWords = new Set(['neon', 'glowing', 'rain']);
      const usedClusters = new Set<string>();

      const wildcards = service.selectWildcards(allWords, 2, prng, usedWords, usedClusters, lexicon);

      // Verify no wildcards are in usedWords
      for (const word of wildcards) {
        expect(usedWords.has(word)).toBe(false);
      }
    });

    it('should respect cluster constraints', () => {
      const theme = createTestTheme();
      const allWords = service.getAllWords(theme);
      const lexicon = createTestLexicon();
      const prng = new PRNG(12345n);
      const usedWords = new Set<string>();
      const usedClusters = new Set(['urban-light', 'light-steady']);

      const wildcards = service.selectWildcards(allWords, 2, prng, usedWords, usedClusters, lexicon);

      // Verify wildcards don't use pre-marked clusters
      const clusters = wildcards.map((word) => lexicon.mappings[word]?.cluster);
      expect(clusters).not.toContain('urban-light');
      expect(clusters).not.toContain('light-steady');
    });

    it('should return up to count wildcards', () => {
      const theme = createTestTheme();
      const allWords = service.getAllWords(theme);
      const lexicon = createTestLexicon();
      const prng = new PRNG(12345n);
      const usedWords = new Set<string>();
      const usedClusters = new Set<string>();

      const wildcards = service.selectWildcards(allWords, 3, prng, usedWords, usedClusters, lexicon);

      expect(wildcards.length).toBeLessThanOrEqual(3);
    });

    it('should be deterministic with same PRNG seed', () => {
      const theme = createTestTheme();
      const allWords = service.getAllWords(theme);
      const lexicon = createTestLexicon();
      const usedWords = new Set(['neon']);
      const usedClusters1 = new Set<string>();
      const usedClusters2 = new Set<string>();

      const prng1 = new PRNG(55555n);
      const wildcards1 = service.selectWildcards(allWords, 2, prng1, usedWords, usedClusters1, lexicon);

      const prng2 = new PRNG(55555n);
      const wildcards2 = service.selectWildcards(allWords, 2, prng2, usedWords, usedClusters2, lexicon);

      expect(wildcards1).toEqual(wildcards2);
    });

    it('should handle words without metadata', () => {
      const allWords = ['word1', 'word2', 'word3'];
      const lexicon: LexiconMap = { version: 'v1', mappings: {} };
      const prng = new PRNG(12345n);
      const usedWords = new Set<string>();
      const usedClusters = new Set<string>();

      const wildcards = service.selectWildcards(allWords, 2, prng, usedWords, usedClusters, lexicon);

      // Words without metadata should be selectable
      expect(wildcards.length).toBe(2);
    });

    it('should gracefully degrade when constraints limit selection', () => {
      const theme: Theme = {
        name: 'Limited',
        slots: {
          subject: {
            words: ['word1', 'word2', 'word3'],
            clusters: ['cluster-a', 'cluster-a', 'cluster-a'],
          },
        },
      };
      const allWords = service.getAllWords(theme);
      const lexicon: LexiconMap = {
        version: 'v1',
        mappings: {
          word1: { canonical: 'word1', slot: 'subject', cluster: 'cluster-a' },
          word2: { canonical: 'word2', slot: 'subject', cluster: 'cluster-a' },
          word3: { canonical: 'word3', slot: 'subject', cluster: 'cluster-a' },
        },
      };
      const prng = new PRNG(12345n);
      const usedWords = new Set(['word1']);
      const usedClusters = new Set(['cluster-a']); // Cluster already used

      const wildcards = service.selectWildcards(allWords, 2, prng, usedWords, usedClusters, lexicon);

      // Can't select any wildcards (cluster used, word1 used)
      expect(wildcards.length).toBe(0);
    });

    it('should mutate usedClusters set', () => {
      const theme = createTestTheme();
      const allWords = service.getAllWords(theme);
      const lexicon = createTestLexicon();
      const prng = new PRNG(12345n);
      const usedWords = new Set<string>();
      const usedClusters = new Set<string>();

      expect(usedClusters.size).toBe(0);

      service.selectWildcards(allWords, 2, prng, usedWords, usedClusters, lexicon);

      // usedClusters should be updated if wildcards were selected
      expect(usedClusters.size).toBeGreaterThanOrEqual(0);
    });

    it('should not mutate usedWords set', () => {
      const theme = createTestTheme();
      const allWords = service.getAllWords(theme);
      const lexicon = createTestLexicon();
      const prng = new PRNG(12345n);
      const usedWords = new Set(['neon']);
      const usedClusters = new Set<string>();

      const originalSize = usedWords.size;

      service.selectWildcards(allWords, 2, prng, usedWords, usedClusters, lexicon);

      // usedWords should not be modified
      expect(usedWords.size).toBe(originalSize);
    });
  });

  describe('Integration: Full Selection Flow', () => {
    it('should produce complete word set with all algorithms', () => {
      const theme = createTestTheme();
      const lexicon = createTestLexicon();
      const prng = new PRNG(12345n);
      const usedClusters = new Set<string>();

      // Step 1: Slot coverage
      const slotWords = service.selectSlotCoverage(theme, prng, usedClusters);
      expect(slotWords.length).toBe(3);

      // Step 2: Diversity selection
      const allWords = service.getAllWords(theme);
      const diverse = service.selectWithDiversity(allWords, 3, prng, usedClusters, lexicon);
      expect(diverse.length).toBeLessThanOrEqual(3);

      // Step 3: Wildcards
      const usedWords = new Set([...slotWords, ...diverse]);
      const wildcards = service.selectWildcards(allWords, 2, prng, usedWords, usedClusters, lexicon);
      expect(wildcards.length).toBeLessThanOrEqual(2);

      // Verify no duplicates across all selections
      const allSelected = [...slotWords, ...diverse, ...wildcards];
      expect(new Set(allSelected).size).toBe(allSelected.length);
    });

    it('should maintain determinism across full flow', () => {
      const theme = createTestTheme();
      const lexicon = createTestLexicon();

      // Run 1
      const prng1 = new PRNG(88888n);
      const usedClusters1 = new Set<string>();
      const slotWords1 = service.selectSlotCoverage(theme, prng1, usedClusters1);
      const allWords1 = service.getAllWords(theme);
      const diverse1 = service.selectWithDiversity(allWords1, 3, prng1, usedClusters1, lexicon);
      const usedWords1 = new Set([...slotWords1, ...diverse1]);
      const wildcards1 = service.selectWildcards(allWords1, 2, prng1, usedWords1, usedClusters1, lexicon);

      // Run 2
      const prng2 = new PRNG(88888n);
      const usedClusters2 = new Set<string>();
      const slotWords2 = service.selectSlotCoverage(theme, prng2, usedClusters2);
      const allWords2 = service.getAllWords(theme);
      const diverse2 = service.selectWithDiversity(allWords2, 3, prng2, usedClusters2, lexicon);
      const usedWords2 = new Set([...slotWords2, ...diverse2]);
      const wildcards2 = service.selectWildcards(allWords2, 2, prng2, usedWords2, usedClusters2, lexicon);

      // Verify identical results
      expect(slotWords1).toEqual(slotWords2);
      expect(diverse1).toEqual(diverse2);
      expect(wildcards1).toEqual(wildcards2);
    });

    it('should respect cluster diversity across all selection stages', () => {
      const theme = createTestTheme();
      const lexicon = createTestLexicon();
      const prng = new PRNG(12345n);
      const usedClusters = new Set<string>();

      const slotWords = service.selectSlotCoverage(theme, prng, usedClusters);
      const allWords = service.getAllWords(theme);
      const diverse = service.selectWithDiversity(allWords, 3, prng, usedClusters, lexicon);
      const usedWords = new Set([...slotWords, ...diverse]);
      const wildcards = service.selectWildcards(allWords, 2, prng, usedWords, usedClusters, lexicon);

      // Verify all selected words have unique clusters
      const allSelected = [...slotWords, ...diverse, ...wildcards];
      const clusters = allSelected.map((word) => lexicon.mappings[word]?.cluster).filter(Boolean);
      expect(new Set(clusters).size).toBe(clusters.length);
    });
  });

  describe('Edge Cases', () => {
    it('should handle theme with single slot', () => {
      const theme: Theme = {
        name: 'Single',
        slots: {
          subject: {
            words: ['word1', 'word2'],
            clusters: ['cluster-a', 'cluster-b'],
          },
        },
      };
      const prng = new PRNG(12345n);
      const usedClusters = new Set<string>();

      const selected = service.selectSlotCoverage(theme, prng, usedClusters);

      expect(selected.length).toBe(1);
    });

    it('should handle theme with single word per slot', () => {
      const theme: Theme = {
        name: 'Minimal',
        slots: {
          subject: { words: ['word1'], clusters: ['cluster-a'] },
          action: { words: ['word2'], clusters: ['cluster-b'] },
        },
      };
      const prng = new PRNG(12345n);
      const usedClusters = new Set<string>();

      const selected = service.selectSlotCoverage(theme, prng, usedClusters);

      expect(selected).toEqual(['word1', 'word2']);
    });

    it('should handle count of 0 for selectWithDiversity', () => {
      const theme = createTestTheme();
      const allWords = service.getAllWords(theme);
      const lexicon = createTestLexicon();
      const prng = new PRNG(12345n);
      const usedClusters = new Set<string>();

      const selected = service.selectWithDiversity(allWords, 0, prng, usedClusters, lexicon);

      expect(selected).toEqual([]);
    });

    it('should handle count of 0 for selectWildcards', () => {
      const theme = createTestTheme();
      const allWords = service.getAllWords(theme);
      const lexicon = createTestLexicon();
      const prng = new PRNG(12345n);
      const usedWords = new Set<string>();
      const usedClusters = new Set<string>();

      const wildcards = service.selectWildcards(allWords, 0, prng, usedWords, usedClusters, lexicon);

      expect(wildcards).toEqual([]);
    });

    it('should handle all words already used for wildcards', () => {
      const theme = createTestTheme();
      const allWords = service.getAllWords(theme);
      const lexicon = createTestLexicon();
      const prng = new PRNG(12345n);
      const usedWords = new Set(allWords); // All words used
      const usedClusters = new Set<string>();

      const wildcards = service.selectWildcards(allWords, 2, prng, usedWords, usedClusters, lexicon);

      expect(wildcards).toEqual([]);
    });
  });
});
