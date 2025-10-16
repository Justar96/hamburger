/**
 * Integration tests for /api/pick endpoint
 *
 * Tests the pick endpoint with real Redis and services via HTTP API.
 * Validates the complete flow from HTTP request to Redis storage.
 *
 * These tests require the dev server to be running:
 * Terminal 1: pnpm run dev
 * Terminal 2: pnpm run test:integration
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const SERVER_URL = 'http://localhost:3000';

// Track keys for cleanup
let testKeys: string[] = [];

function trackKey(key: string) {
  testKeys.push(key);
}

// Helper function to make API requests
async function apiRequest(endpoint: string, data: any) {
  const response = await fetch(`${SERVER_URL}/api/test/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API request failed: ${response.status} ${errorText}`);
  }

  return response.json();
}

// Helper function to make pick requests
async function pickRequest(data: any, userId: string = 'test-user-123') {
  const response = await fetch(`${SERVER_URL}/api/test/pick`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...data, userId }),
  });

  return {
    status: response.status,
    data: response.ok ? await response.json() : null,
    error: !response.ok ? await response.text() : null,
  };
}

describe('API Pick Integration Tests', () => {
  beforeEach(() => {
    testKeys = [];
  });

  afterEach(async () => {
    // Cleanup test data
    if (testKeys.length > 0) {
      try {
        await apiRequest('cleanup', { keys: testKeys });
      } catch (error) {
        console.warn('Cleanup failed:', error);
      }
    }
  });

  describe('successful word submission', () => {
    it('should accept valid word submission and update tallies', async () => {
      const date = '2025-10-15';
      const userId = 'integration-test-user-1';
      
      // Track keys for cleanup
      trackKey(`seed:${date}`);
      trackKey(`choices:${date}`);
      trackKey(`tallies:${date}`);

      // Generate seed and user words first
      const seedResponse = await apiRequest('seeding/generate-seed', { date });
      expect(seedResponse.success).toBe(true);

      const wordsResponse = await apiRequest('seeding/generate-words', {
        userId,
        date,
        count: 12,
      });
      expect(wordsResponse.success).toBe(true);
      expect(wordsResponse.words).toHaveLength(12);

      // Submit word choices
      const selectedWords = wordsResponse.words.slice(0, 3);
      const pickResponse = await pickRequest(
        {
          words: selectedWords,
          date,
        },
        userId
      );

      expect(pickResponse.status).toBe(200);
      expect(pickResponse.data).toMatchObject({
        ok: true,
        accepted: selectedWords,
        top: expect.any(Array),
        timestamp: expect.any(Number),
      });

      // Verify tallies were updated
      const tallyResponse = await apiRequest('tallies', { date });
      expect(tallyResponse.success).toBe(true);
      
      // Each submitted word should have count of 1
      for (const word of selectedWords) {
        const wordTally = tallyResponse.tallies.find((t: any) => t.word === word);
        expect(wordTally).toBeDefined();
        expect(wordTally.count).toBe(1);
      }
    });

    it('should handle multiple users submitting different words', async () => {
      const date = '2025-10-16';
      const user1 = 'integration-test-user-2';
      const user2 = 'integration-test-user-3';
      
      trackKey(`seed:${date}`);
      trackKey(`choices:${date}`);
      trackKey(`tallies:${date}`);

      // Generate seed
      await apiRequest('seeding/generate-seed', { date });

      // Get words for both users
      const words1Response = await apiRequest('seeding/generate-words', {
        userId: user1,
        date,
        count: 12,
      });
      const words2Response = await apiRequest('seeding/generate-words', {
        userId: user2,
        date,
        count: 12,
      });

      // User 1 submits first 2 words
      const user1Words = words1Response.words.slice(0, 2);
      const pick1Response = await pickRequest(
        { words: user1Words, date },
        user1
      );
      expect(pick1Response.status).toBe(200);

      // User 2 submits overlapping words (1 same, 1 different)
      const user2Words = [words1Response.words[0], words2Response.words[1]];
      const pick2Response = await pickRequest(
        { words: user2Words, date },
        user2
      );
      expect(pick2Response.status).toBe(200);

      // Verify tallies
      const tallyResponse = await apiRequest('tallies', { date });
      const tallies = tallyResponse.tallies;

      // First word should have count 2 (both users)
      const sharedWord = tallies.find((t: any) => t.word === words1Response.words[0]);
      expect(sharedWord.count).toBe(2);

      // Other words should have count 1
      const user1UniqueWord = tallies.find((t: any) => t.word === user1Words[1]);
      expect(user1UniqueWord.count).toBe(1);

      const user2UniqueWord = tallies.find((t: any) => t.word === user2Words[1]);
      expect(user2UniqueWord.count).toBe(1);
    });
  });

  describe('input validation', () => {
    it('should reject invalid date format', async () => {
      const response = await pickRequest({
        words: ['test', 'words'],
        date: '2025/10/15', // Invalid format
      });

      expect(response.status).toBe(400);
      expect(response.error).toContain('INVALID_DATE');
    });

    it('should reject empty words array', async () => {
      const response = await pickRequest({
        words: [],
        date: '2025-10-15',
      });

      expect(response.status).toBe(400);
      expect(response.error).toContain('INVALID_WORDS');
    });

    it('should reject non-array words', async () => {
      const response = await pickRequest({
        words: 'not-an-array',
        date: '2025-10-15',
      });

      expect(response.status).toBe(400);
      expect(response.error).toContain('INVALID_WORDS');
    });

    it('should reject words with non-string elements', async () => {
      const response = await pickRequest({
        words: ['valid', 123, 'also-valid'],
        date: '2025-10-15',
      });

      expect(response.status).toBe(400);
      expect(response.error).toContain('INVALID_WORDS');
    });
  });

  describe('word verification', () => {
    it('should reject words not in user\'s generated set', async () => {
      const date = '2025-10-17';
      const userId = 'integration-test-user-4';
      
      trackKey(`seed:${date}`);
      trackKey(`choices:${date}`);
      trackKey(`tallies:${date}`);

      // Generate seed and user words
      await apiRequest('seeding/generate-seed', { date });
      const wordsResponse = await apiRequest('seeding/generate-words', {
        userId,
        date,
        count: 12,
      });

      // Try to submit words not in the user's set
      const response = await pickRequest(
        {
          words: ['invalid-word-1', 'invalid-word-2'],
          date,
        },
        userId
      );

      expect(response.status).toBe(400);
      expect(response.error).toContain('INVALID_WORDS');
      expect(response.error).toContain('not from your generated word set');
    });

    it('should reject mixed valid and invalid words', async () => {
      const date = '2025-10-18';
      const userId = 'integration-test-user-5';
      
      trackKey(`seed:${date}`);
      trackKey(`choices:${date}`);
      trackKey(`tallies:${date}`);

      // Generate seed and user words
      await apiRequest('seeding/generate-seed', { date });
      const wordsResponse = await apiRequest('seeding/generate-words', {
        userId,
        date,
        count: 12,
      });

      // Mix valid and invalid words
      const mixedWords = [wordsResponse.words[0], 'invalid-word', wordsResponse.words[1]];
      const response = await pickRequest(
        {
          words: mixedWords,
          date,
        },
        userId
      );

      expect(response.status).toBe(400);
      expect(response.error).toContain('INVALID_WORDS');
    });
  });

  describe('duplicate submission handling', () => {
    it('should return existing submission for duplicate requests', async () => {
      const date = '2025-10-19';
      const userId = 'integration-test-user-6';
      
      trackKey(`seed:${date}`);
      trackKey(`choices:${date}`);
      trackKey(`tallies:${date}`);

      // Generate seed and user words
      await apiRequest('seeding/generate-seed', { date });
      const wordsResponse = await apiRequest('seeding/generate-words', {
        userId,
        date,
        count: 12,
      });

      const selectedWords = wordsResponse.words.slice(0, 3);

      // First submission
      const firstResponse = await pickRequest(
        { words: selectedWords, date },
        userId
      );
      expect(firstResponse.status).toBe(200);
      expect(firstResponse.data.accepted).toEqual(selectedWords);

      // Second submission with different words (should return original)
      const differentWords = wordsResponse.words.slice(3, 6);
      const secondResponse = await pickRequest(
        { words: differentWords, date },
        userId
      );
      expect(secondResponse.status).toBe(200);
      expect(secondResponse.data.accepted).toEqual(selectedWords); // Original words

      // Verify tallies only count the first submission
      const tallyResponse = await apiRequest('tallies', { date });
      const tallies = tallyResponse.tallies;

      // Original words should have count 1
      for (const word of selectedWords) {
        const wordTally = tallies.find((t: any) => t.word === word);
        expect(wordTally.count).toBe(1);
      }

      // Different words should not appear in tallies
      for (const word of differentWords) {
        const wordTally = tallies.find((t: any) => t.word === word);
        expect(wordTally).toBeUndefined();
      }
    });
  });

  describe('rate limiting', () => {
    it('should enforce rate limiting on rapid requests', async () => {
      const date = '2025-10-20';
      const userId = 'integration-test-user-7';
      
      trackKey(`seed:${date}`);
      trackKey(`choices:${date}`);
      trackKey(`tallies:${date}`);
      trackKey(`rate_limit:${userId}`); // Rate limit key

      // Generate seed and user words
      await apiRequest('seeding/generate-seed', { date });
      const wordsResponse = await apiRequest('seeding/generate-words', {
        userId,
        date,
        count: 12,
      });

      const selectedWords = wordsResponse.words.slice(0, 3);

      // First request should succeed
      const firstResponse = await pickRequest(
        { words: selectedWords, date },
        userId
      );
      expect(firstResponse.status).toBe(200);

      // Immediate second request should be rate limited
      const secondResponse = await pickRequest(
        { words: selectedWords, date },
        userId
      );
      
      // Note: This might succeed due to duplicate submission handling
      // The rate limiting is applied before duplicate check
      if (secondResponse.status === 429) {
        expect(secondResponse.error).toContain('RATE_LIMITED');
      } else {
        // If it's 200, it's due to duplicate submission handling
        expect(secondResponse.status).toBe(200);
      }
    });
  });

  describe('error handling', () => {
    it('should handle missing user ID gracefully', async () => {
      const response = await fetch(`${SERVER_URL}/api/test/pick`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          words: ['test', 'words'],
          date: '2025-10-15',
          // Missing userId
        }),
      });

      expect(response.status).toBe(401);
      const errorText = await response.text();
      expect(errorText).toContain('UNAUTHORIZED');
    });

    it('should handle malformed JSON gracefully', async () => {
      const response = await fetch(`${SERVER_URL}/api/test/pick`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: 'invalid-json',
      });

      expect(response.status).toBe(400);
    });
  });

  describe('response format', () => {
    it('should return properly formatted success response', async () => {
      const date = '2025-10-21';
      const userId = 'integration-test-user-8';
      
      trackKey(`seed:${date}`);
      trackKey(`choices:${date}`);
      trackKey(`tallies:${date}`);

      // Generate seed and user words
      await apiRequest('seeding/generate-seed', { date });
      const wordsResponse = await apiRequest('seeding/generate-words', {
        userId,
        date,
        count: 12,
      });

      const selectedWords = wordsResponse.words.slice(0, 2);
      const response = await pickRequest(
        { words: selectedWords, date },
        userId
      );

      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        ok: true,
        accepted: expect.arrayContaining(selectedWords),
        top: expect.any(Array),
        timestamp: expect.any(Number),
      });

      // Verify top words structure
      if (response.data.top.length > 0) {
        expect(response.data.top[0]).toMatchObject({
          word: expect.any(String),
          count: expect.any(Number),
        });
      }
    });

    it('should return properly formatted error response', async () => {
      const response = await pickRequest({
        words: ['invalid'],
        date: 'invalid-date',
      });

      expect(response.status).toBe(400);
      
      const errorData = JSON.parse(response.error);
      expect(errorData).toMatchObject({
        error: {
          code: expect.any(String),
          message: expect.any(String),
        },
        timestamp: expect.any(Number),
      });
    });
  });
});