/**
 * API-based integration tests for the data layer
 *
 * These tests run against a real Devvit server with Redis access.
 * They test the complete data flow through HTTP API endpoints.
 *
 * Requirements tested: 1.1-1.6, 2.1-2.7, 3.1-3.3, 4.1-4.3, 7.1-7.7
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import type { SeedData, UserChoices } from '../../src/server/types/data.types';

const SERVER_PORT = 3000;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;
const STARTUP_TIMEOUT = 10000;
const TEST_DATE = '2025-10-14';

let serverProcess: ChildProcess | null = null;
const testKeys: string[] = [];

/**
 * Track keys for cleanup
 */
function trackKey(key: string): void {
    if (!testKeys.includes(key)) {
        testKeys.push(key);
    }
}

/**
 * Wait for server to be ready
 */
async function waitForServer(timeoutMs: number): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
        try {
            const response = await fetch(`${SERVER_URL}/api/health`, {
                signal: AbortSignal.timeout(1000),
            });

            if (response.ok) {
                return;
            }
        } catch (error) {
            // Server not ready yet
        }

        await new Promise(resolve => setTimeout(resolve, 500));
    }

    throw new Error(`Server did not start within ${timeoutMs}ms`);
}

/**
 * Start the development server
 */
async function startDevServer(): Promise<void> {
    return new Promise((resolve, reject) => {
        const isWindows = process.platform === 'win32';
        const command = isWindows ? 'npx.cmd' : 'npx';

        serverProcess = spawn(command, ['tsx', 'src/server/index.ts'], {
            env: {
                ...process.env,
                NODE_ENV: 'development',
                PORT: SERVER_PORT.toString(),
                // Ensure USER_ID_PEPPER is set for tests
                USER_ID_PEPPER: process.env.USER_ID_PEPPER || 'test-pepper-for-integration-tests-minimum-32-chars-long',
            },
            stdio: 'pipe',
            shell: isWindows,
        });

        let output = '';

        serverProcess.stdout?.on('data', (data) => {
            output += data.toString();
            if (output.includes('listening on port')) {
                resolve();
            }
        });

        serverProcess.stderr?.on('data', (data) => {
            console.error('Server stderr:', data.toString());
        });

        serverProcess.on('error', (error) => {
            reject(new Error(`Failed to start server: ${error.message}`));
        });

        serverProcess.on('exit', (code) => {
            if (code !== 0 && code !== null) {
                reject(new Error(`Server exited with code ${code}`));
            }
        });

        setTimeout(() => {
            reject(new Error('Server startup timeout'));
        }, STARTUP_TIMEOUT);
    });
}

/**
 * Stop the development server
 */
function stopDevServer(): void {
    if (serverProcess) {
        serverProcess.kill('SIGTERM');
        serverProcess = null;
    }
}

/**
 * Cleanup test keys
 */
async function cleanupKeys(): Promise<void> {
    if (testKeys.length === 0) return;

    try {
        await fetch(`${SERVER_URL}/api/test/cleanup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keys: testKeys }),
        });
        testKeys.length = 0;
    } catch (error) {
        console.error('Failed to cleanup keys:', error);
    }
}

describe('Data Layer API Integration Tests', () => {
    beforeAll(async () => {
        await startDevServer();
        await waitForServer(5000);
    }, STARTUP_TIMEOUT + 5000);

    afterAll(() => {
        stopDevServer();
    });

    afterEach(async () => {
        await cleanupKeys();
    });

    describe('Full data flow', () => {
        it('should complete full flow: setSeed → setUserChoices → incrementTallies → getTopWords', async () => {
            trackKey(`seed:${TEST_DATE}`);
            trackKey(`choices:${TEST_DATE}`);
            trackKey(`tallies:${TEST_DATE}`);

            const response = await fetch(`${SERVER_URL}/api/test/data-flow`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    date: TEST_DATE,
                    userId: 't2_testuser123',
                    choices: ['neon', 'rain', 'alley', 'midnight', 'glow'],
                }),
            });

            expect(response.ok).toBe(true);

            const data = await response.json() as any;
            expect(data.success).toBe(true);
            expect(data.topWords).toHaveLength(5);
            expect(data.topWords.every((t: { count: number }) => t.count === 1)).toBe(true);

            // Verify PostData is valid and under 2KB
            expect(data.validation.valid).toBe(true);
            expect(data.validation.size).toBeLessThanOrEqual(2000);
            expect(data.postData.date).toBe(TEST_DATE);
        });

        it('should handle multiple users voting for the same words', async () => {
            trackKey(`choices:${TEST_DATE}`);
            trackKey(`tallies:${TEST_DATE}`);

            const words = ['neon', 'rain', 'alley'];

            // Simulate 3 users voting for the same words
            for (let i = 0; i < 3; i++) {
                const response = await fetch(`${SERVER_URL}/api/test/data-flow`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        date: TEST_DATE,
                        userId: `t2_user${i}`,
                        choices: words,
                    }),
                });

                expect(response.ok).toBe(true);
            }

            // Get final tallies
            const response = await fetch(`${SERVER_URL}/api/test/tallies`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    date: TEST_DATE,
                    words: [],
                }),
            });

            const data = await response.json() as any;
            expect(data.success).toBe(true);
            expect(data.topWords).toHaveLength(3);

            // Each word should have count of 3
            data.topWords.forEach((tally: { word: string; count: number }) => {
                expect(tally.count).toBe(3);
                expect(words).toContain(tally.word);
            });
        });
    });

    describe('Seed operations', () => {
        it('should store and retrieve seed data', async () => {
            trackKey(`seed:${TEST_DATE}`);

            const seedData: SeedData = {
                seedHex: '8d23abc123def456789abcdef0123456',
                theme: 'Nocturnal Cities',
                poolsVersion: 'v1',
                createdAt: Date.now(),
            };

            const response = await fetch(`${SERVER_URL}/api/test/seed`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date: TEST_DATE, seedData }),
            });

            expect(response.ok).toBe(true);

            const data = await response.json() as any;
            expect(data.success).toBe(true);
            expect(data.data).toEqual(seedData);
        });
    });

    describe('User choices operations', () => {
        it('should store and retrieve user choices with hashed user ID', async () => {
            trackKey(`choices:${TEST_DATE}`);

            const userId = 't2_testuser123';
            const choices: UserChoices = ['neon', 'rain', 'alley'];

            const response = await fetch(`${SERVER_URL}/api/test/choices`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date: TEST_DATE, userId, choices }),
            });

            expect(response.ok).toBe(true);

            const data = await response.json() as any;
            expect(data.success).toBe(true);
            expect(data.data).toEqual(choices);
            expect(data.userHash).toHaveLength(64); // SHA256 hex
            expect(data.userHash).toMatch(/^[0-9a-f]{64}$/);
        });

        it('should use consistent hashing for same user ID', async () => {
            trackKey(`choices:${TEST_DATE}`);

            const userId = 't2_testuser123';

            // First request
            const response1 = await fetch(`${SERVER_URL}/api/test/choices`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    date: TEST_DATE,
                    userId,
                    choices: ['neon'],
                }),
            });

            const data1 = await response1.json() as any;

            // Second request with same user ID
            const response2 = await fetch(`${SERVER_URL}/api/test/choices`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    date: TEST_DATE,
                    userId,
                    choices: ['rain'],
                }),
            });

            const data2 = await response2.json() as any;

            // Hashes should be identical
            expect(data1.userHash).toBe(data2.userHash);
        });
    });

    describe('Tally operations', () => {
        it('should increment tallies and return sorted results', async () => {
            trackKey(`tallies:${TEST_DATE}`);

            // Increment different words different times
            await fetch(`${SERVER_URL}/api/test/tallies`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    date: TEST_DATE,
                    words: ['neon', 'neon', 'neon'],
                }),
            });

            await fetch(`${SERVER_URL}/api/test/tallies`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    date: TEST_DATE,
                    words: ['rain', 'rain'],
                }),
            });

            await fetch(`${SERVER_URL}/api/test/tallies`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    date: TEST_DATE,
                    words: ['alley'],
                }),
            });

            // Get top words
            const response = await fetch(`${SERVER_URL}/api/test/tallies`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    date: TEST_DATE,
                    words: [],
                }),
            });

            const data = await response.json() as any;
            expect(data.success).toBe(true);
            expect(data.topWords).toHaveLength(3);

            // Verify sorting (descending by count)
            expect(data.topWords[0].word).toBe('neon');
            expect(data.topWords[0].count).toBe(3);
            expect(data.topWords[1].word).toBe('rain');
            expect(data.topWords[1].count).toBe(2);
            expect(data.topWords[2].word).toBe('alley');
            expect(data.topWords[2].count).toBe(1);
        });

        it('should handle empty word arrays', async () => {
            trackKey(`tallies:${TEST_DATE}`);

            const response = await fetch(`${SERVER_URL}/api/test/tallies`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    date: TEST_DATE,
                    words: [],
                }),
            });

            const data = await response.json() as any;
            expect(data.success).toBe(true);
            expect(data.topWords).toEqual([]);
        });
    });

    describe('Telemetry operations', () => {
        it('should record and retrieve telemetry counters', async () => {
            trackKey(`telemetry:${TEST_DATE}`);

            // Increment counter multiple times
            await fetch(`${SERVER_URL}/api/test/telemetry`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    date: TEST_DATE,
                    counter: 'requests',
                }),
            });

            await fetch(`${SERVER_URL}/api/test/telemetry`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    date: TEST_DATE,
                    counter: 'requests',
                }),
            });

            await fetch(`${SERVER_URL}/api/test/telemetry`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    date: TEST_DATE,
                    counter: 'errors',
                }),
            });

            // Retrieve telemetry
            const response = await fetch(`${SERVER_URL}/api/test/telemetry`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date: TEST_DATE }),
            });

            const data = await response.json() as any;
            expect(data.success).toBe(true);
            expect(data.telemetry.requests).toBe(2);
            expect(data.telemetry.errors).toBe(1);
        });

        it('should record and retrieve latency samples', async () => {
            trackKey(`telemetry:${TEST_DATE}:p95`);

            const samples = [10, 20, 30, 40, 50];

            // Record latency samples
            for (const sample of samples) {
                await fetch(`${SERVER_URL}/api/test/telemetry`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        date: TEST_DATE,
                        latency: sample,
                    }),
                });
            }

            // Retrieve telemetry
            const response = await fetch(`${SERVER_URL}/api/test/telemetry`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date: TEST_DATE }),
            });

            const data = await response.json() as any;
            expect(data.success).toBe(true);
            expect(data.telemetry.p95Samples).toHaveLength(samples.length);
            expect(data.telemetry.p95Samples.sort((a: number, b: number) => a - b)).toEqual(samples);
        });

        it('should handle concurrent telemetry operations', async () => {
            trackKey(`telemetry:${TEST_DATE}`);
            trackKey(`telemetry:${TEST_DATE}:p95`);

            // Simulate concurrent requests
            const operations = Array.from({ length: 10 }, (_, i) =>
                fetch(`${SERVER_URL}/api/test/telemetry`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        date: TEST_DATE,
                        counter: 'requests',
                        latency: i * 10,
                    }),
                })
            );

            await Promise.all(operations);

            // Verify all operations completed
            const response = await fetch(`${SERVER_URL}/api/test/telemetry`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date: TEST_DATE }),
            });

            const data = await response.json() as any;
            expect(data.success).toBe(true);
            expect(data.telemetry.requests).toBe(10);
            expect(data.telemetry.p95Samples).toHaveLength(10);
        });
    });

    describe('PostData generation', () => {
        it('should generate PostData under 2KB with realistic tally data', async () => {
            trackKey(`tallies:${TEST_DATE}`);

            // Create realistic tally data
            const words = Array.from({ length: 50 }, (_, i) => `word${i}`);

            for (const word of words) {
                await fetch(`${SERVER_URL}/api/test/tallies`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        date: TEST_DATE,
                        words: [word],
                    }),
                });
            }

            // Generate PostData through full flow
            const response = await fetch(`${SERVER_URL}/api/test/data-flow`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    date: TEST_DATE,
                    userId: 't2_testuser',
                    choices: ['test'],
                }),
            });

            const data = await response.json() as any;
            expect(data.success).toBe(true);
            expect(data.validation.valid).toBe(true);
            expect(data.validation.size).toBeLessThanOrEqual(2000);
            expect(data.postData.teaserTop.length).toBeGreaterThan(0);
        });
    });

    describe('Error handling', () => {
        it('should handle invalid requests gracefully', async () => {
            const response = await fetch(`${SERVER_URL}/api/test/data-flow`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });

            expect(response.status).toBe(500);
            const data = await response.json() as any;
            expect(data.success).toBe(false);
            expect(data.error).toBeDefined();
        });
    });
});
