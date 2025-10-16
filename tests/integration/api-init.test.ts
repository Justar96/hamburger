/**
 * Integration tests for /api/init endpoint
 *
 * Tests the complete initialization endpoint flow with real services:
 * - Server startup and endpoint availability
 * - User context handling (mocked via test endpoints)
 * - Real Redis operations via DataService
 * - Real seeding engine via TestSeedingService
 * - Response format validation
 * - Error handling scenarios
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const SERVER_URL = 'http://localhost:3000';

// Track keys for cleanup
let testKeys: string[] = [];

function trackKey(key: string) {
  testKeys.push(key);
}

async function cleanup() {
  if (testKeys.length > 0) {
    try {
      await fetch(`${SERVER_URL}/api/test/cleanup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: testKeys }),
      });
    } catch (error) {
      console.warn('Cleanup failed:', error);
    }
    testKeys = [];
  }
}

describe('API /api/init Integration Tests', () => {
  beforeEach(() => {
    testKeys = [];
  });

  afterEach(async () => {
    await cleanup();
  });

  it('should initialize game state successfully with valid date', async () => {
    const date = '2025-10-15';
    trackKey(`seed:${date}`);
    trackKey(`choices:${date}`);
    trackKey(`tallies:${date}`);
    trackKey(`telemetry:${date}`);
    trackKey(`telemetry:${date}:p95`);

    // First, set up some test data to make the response more realistic
    await fetch(`${SERVER_URL}/api/test/seeding/generate-seed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date }),
    });

    // Add some test tallies
    await fetch(`${SERVER_URL}/api/test/tallies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        date, 
        words: ['neon', 'rain', 'alley', 'neon', 'rain', 'neon'] 
      }),
    });

    // Call the init endpoint
    const response = await fetch(`${SERVER_URL}/api/init?date=${date}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    expect(response.status).toBe(200);

    const data = await response.json();

    // Verify response structure
    expect(data).toMatchObject({
      seedPreview: expect.stringMatching(/^[0-9a-f]{8}$/),
      myWords: expect.arrayContaining([expect.any(String)]),
      progress: {
        top: expect.arrayContaining([
          expect.objectContaining({
            word: expect.any(String),
            count: expect.any(Number)
          })
        ]),
        totalVotes: expect.any(Number),
        uniqueVoters: expect.any(Number)
      },
      timeLeftSec: expect.any(Number),
      timestamp: expect.any(Number)
    });

    // Verify data quality
    expect(data.seedPreview).toHaveLength(8);
    expect(data.myWords).toHaveLength(12); // Default word count
    expect(data.myWords.every((word: string) => typeof word === 'string')).toBe(true);
    expect(data.progress.totalVotes).toBeGreaterThanOrEqual(0);
    expect(data.progress.uniqueVoters).toBeGreaterThanOrEqual(0);
    expect(data.timeLeftSec).toBeGreaterThanOrEqual(0);

    // Verify top words are sorted by count (descending)
    if (data.progress.top.length > 1) {
      for (let i = 0; i < data.progress.top.length - 1; i++) {
        expect(data.progress.top[i].count).toBeGreaterThanOrEqual(
          data.progress.top[i + 1].count
        );
      }
    }
  });

  it('should return 400 for invalid date format', async () => {
    const response = await fetch(`${SERVER_URL}/api/init?date=2025/10/15`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data).toMatchObject({
      error: {
        code: 'INVALID_DATE',
        message: expect.stringContaining('Invalid date parameter'),
        details: expect.objectContaining({
          field: 'date',
          expected: 'YYYY-MM-DD format',
          received: '2025/10/15'
        })
      },
      timestamp: expect.any(Number)
    });
  });

  it('should return 400 for missing date parameter', async () => {
    const response = await fetch(`${SERVER_URL}/api/init`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data).toMatchObject({
      error: {
        code: 'INVALID_DATE',
        message: expect.stringContaining('Invalid date parameter')
      },
      timestamp: expect.any(Number)
    });
  });

  it('should generate seed if not exists', async () => {
    const date = '2025-12-25'; // Use a future date unlikely to exist
    trackKey(`seed:${date}`);
    trackKey(`telemetry:${date}`);
    trackKey(`telemetry:${date}:p95`);

    const response = await fetch(`${SERVER_URL}/api/init?date=${date}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    expect(response.status).toBe(200);

    const data = await response.json();
    
    // Verify seed was generated
    expect(data.seedPreview).toMatch(/^[0-9a-f]{8}$/);
    expect(data.myWords).toHaveLength(12);
    
    // Verify seed is now stored (call again should return same seed)
    const response2 = await fetch(`${SERVER_URL}/api/init?date=${date}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    const data2 = await response2.json();
    expect(data2.seedPreview).toBe(data.seedPreview);
  });

  it('should return deterministic words for same user and date', async () => {
    const date = '2025-11-11';
    trackKey(`seed:${date}`);
    trackKey(`telemetry:${date}`);
    trackKey(`telemetry:${date}:p95`);

    // Call endpoint twice
    const response1 = await fetch(`${SERVER_URL}/api/init?date=${date}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    const response2 = await fetch(`${SERVER_URL}/api/init?date=${date}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    expect(response1.status).toBe(200);
    expect(response2.status).toBe(200);

    const data1 = await response1.json();
    const data2 = await response2.json();

    // Words should be identical (deterministic)
    expect(data1.myWords).toEqual(data2.myWords);
    expect(data1.seedPreview).toBe(data2.seedPreview);
  });

  it('should handle empty progress data gracefully', async () => {
    const date = '2025-01-01'; // Use a date with no existing data
    trackKey(`seed:${date}`);
    trackKey(`telemetry:${date}`);
    trackKey(`telemetry:${date}:p95`);

    const response = await fetch(`${SERVER_URL}/api/init?date=${date}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    expect(response.status).toBe(200);

    const data = await response.json();
    
    // Should handle empty progress gracefully
    expect(data.progress.top).toEqual([]);
    expect(data.progress.totalVotes).toBe(0);
    expect(data.progress.uniqueVoters).toBe(0);
    
    // Other fields should still be present
    expect(data.seedPreview).toMatch(/^[0-9a-f]{8}$/);
    expect(data.myWords).toHaveLength(12);
    expect(data.timeLeftSec).toBeGreaterThanOrEqual(0);
  });

  it('should include request ID for tracing', async () => {
    const date = '2025-10-16';
    trackKey(`seed:${date}`);
    trackKey(`telemetry:${date}`);
    trackKey(`telemetry:${date}:p95`);

    const response = await fetch(`${SERVER_URL}/api/init?date=${date}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.requestId).toMatch(/^init_\d+_[a-z0-9]+$/);
  });

  it('should respond within performance targets', async () => {
    const date = '2025-10-17';
    trackKey(`seed:${date}`);
    trackKey(`telemetry:${date}`);
    trackKey(`telemetry:${date}:p95`);

    const startTime = Date.now();
    
    const response = await fetch(`${SERVER_URL}/api/init?date=${date}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    const endTime = Date.now();
    const duration = endTime - startTime;

    expect(response.status).toBe(200);
    
    // Should respond within 100ms target (allowing some margin for network)
    expect(duration).toBeLessThan(200); // 200ms to account for network overhead
    
    const data = await response.json();
    expect(data).toHaveProperty('myWords');
  });
});