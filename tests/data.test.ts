import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DataService } from '../src/server/services/data.service';
import type { RedisClient } from '@devvit/web/server';
import { SeedData, UserChoices, TallyEntry } from '../src/server/types/data.types';

/**
 * Unit tests for Data Service
 *
 * These tests verify:
 * - setSeed() and getSeed() round-trip with JSON serialization
 * - setUserChoices() stores data in hash correctly
 * - getUserChoices() retrieves data correctly
 * - incrementTallies() increments counts correctly
 * - getTopWords() returns sorted results in descending order
 * - getTallyCount() returns correct count for a word
 * - TTL is set on first write
 */

const TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const TEST_DATE = '2025-10-14';

describe('DataService', () => {
    let mockRedis: RedisClient;
    let dataService: DataService;
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        // Create mock Redis client with all required methods
        mockRedis = {
            set: vi.fn(),
            get: vi.fn(),
            hSet: vi.fn(),
            hGet: vi.fn(),
            zIncrBy: vi.fn(),
            zRange: vi.fn(),
            zScore: vi.fn(),
            expireTime: vi.fn(),
            expire: vi.fn(),
        } as unknown as RedisClient;

        dataService = new DataService(mockRedis);
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
        vi.restoreAllMocks();
    });

    describe('setSeed() and getSeed()', () => {
        it('should store and retrieve seed data with JSON serialization round-trip', async () => {
            const seedData: SeedData = {
                seedHex: '8d23abc123def456',
                theme: 'Nocturnal Cities',
                poolsVersion: 'v1',
                createdAt: 1728950400,
            };

            const serializedData = JSON.stringify(seedData);

            // Mock set operation
            vi.mocked(mockRedis.set).mockResolvedValue('OK');

            // Mock get operation to return the serialized data
            vi.mocked(mockRedis.get).mockResolvedValue(serializedData);

            // Store seed
            await dataService.setSeed(TEST_DATE, seedData);

            // Verify set was called with correct parameters
            expect(mockRedis.set).toHaveBeenCalledWith(
                `seed:${TEST_DATE}`,
                serializedData,
                expect.objectContaining({
                    expiration: expect.any(Date),
                })
            );

            // Retrieve seed
            const retrieved = await dataService.getSeed(TEST_DATE);

            // Verify get was called with correct key
            expect(mockRedis.get).toHaveBeenCalledWith(`seed:${TEST_DATE}`);

            // Verify data round-trip
            expect(retrieved).toEqual(seedData);
        });

        it('should set correct expiration time when storing seed', async () => {
            const seedData: SeedData = {
                seedHex: '8d23abc123def456',
                theme: 'Test Theme',
                poolsVersion: 'v1',
                createdAt: Date.now(),
            };

            const beforeTime = Date.now();
            vi.mocked(mockRedis.set).mockResolvedValue('OK');

            await dataService.setSeed(TEST_DATE, seedData);

            const afterTime = Date.now();
            const setCall = vi.mocked(mockRedis.set).mock.calls[0];
            const expirationDate = setCall[2]?.expiration as Date;

            expect(expirationDate).toBeInstanceOf(Date);

            const expirationTime = expirationDate.getTime();
            const expectedMin = beforeTime + TTL_SECONDS * 1000 - 1000; // 1s tolerance
            const expectedMax = afterTime + TTL_SECONDS * 1000 + 1000;

            expect(expirationTime).toBeGreaterThanOrEqual(expectedMin);
            expect(expirationTime).toBeLessThanOrEqual(expectedMax);
        });

        it('should return null when seed does not exist', async () => {
            vi.mocked(mockRedis.get).mockResolvedValue(undefined);

            const result = await dataService.getSeed(TEST_DATE);

            expect(result).toBeNull();
            expect(mockRedis.get).toHaveBeenCalledWith(`seed:${TEST_DATE}`);
        });

        it('should throw descriptive error when setSeed fails', async () => {
            const seedData: SeedData = {
                seedHex: '8d23abc123def456',
                theme: 'Test Theme',
                poolsVersion: 'v1',
                createdAt: Date.now(),
            };

            vi.mocked(mockRedis.set).mockRejectedValue(new Error('Redis connection timeout'));

            await expect(dataService.setSeed(TEST_DATE, seedData)).rejects.toThrow(
                `Failed to set seed for date ${TEST_DATE}`
            );
            await expect(dataService.setSeed(TEST_DATE, seedData)).rejects.toThrow(
                'Redis connection timeout'
            );
        });

        it('should throw descriptive error when getSeed fails', async () => {
            vi.mocked(mockRedis.get).mockRejectedValue(new Error('Redis read error'));

            await expect(dataService.getSeed(TEST_DATE)).rejects.toThrow(
                `Failed to get seed for date ${TEST_DATE}`
            );
            await expect(dataService.getSeed(TEST_DATE)).rejects.toThrow('Redis read error');
        });

        it('should handle complex seed data with special characters', async () => {
            const seedData: SeedData = {
                seedHex: 'abc123!@#$%^&*()',
                theme: 'Theme with "quotes" and \'apostrophes\'',
                poolsVersion: 'v2.1-beta',
                createdAt: 1728950400,
            };

            const serializedData = JSON.stringify(seedData);
            vi.mocked(mockRedis.set).mockResolvedValue('OK');
            vi.mocked(mockRedis.get).mockResolvedValue(serializedData);

            await dataService.setSeed(TEST_DATE, seedData);
            const retrieved = await dataService.getSeed(TEST_DATE);

            expect(retrieved).toEqual(seedData);
        });
    });

    describe('setUserChoices() and getUserChoices()', () => {
        const USER_HASH = 'a3f2b1c4d5e6f7g8h9i0j1k2l3m4n5o6';

        it('should store user choices in hash correctly', async () => {
            const choices: UserChoices = ['neon', 'rain', 'alley'];

            vi.mocked(mockRedis.hSet).mockResolvedValue(1);
            vi.mocked(mockRedis.expireTime).mockResolvedValue(-1);
            vi.mocked(mockRedis.expire).mockResolvedValue(undefined);

            await dataService.setUserChoices(TEST_DATE, USER_HASH, choices);

            expect(mockRedis.hSet).toHaveBeenCalledWith(`choices:${TEST_DATE}`, {
                [USER_HASH]: JSON.stringify(choices),
            });
        });

        it('should retrieve user choices correctly', async () => {
            const choices: UserChoices = ['neon', 'rain', 'alley'];

            vi.mocked(mockRedis.hGet).mockResolvedValue(JSON.stringify(choices));

            const retrieved = await dataService.getUserChoices(TEST_DATE, USER_HASH);

            expect(mockRedis.hGet).toHaveBeenCalledWith(`choices:${TEST_DATE}`, USER_HASH);
            expect(retrieved).toEqual(choices);
        });

        it('should return null when user choices do not exist', async () => {
            vi.mocked(mockRedis.hGet).mockResolvedValue(undefined);

            const result = await dataService.getUserChoices(TEST_DATE, USER_HASH);

            expect(result).toBeNull();
        });

        it('should set TTL on first write to choices hash', async () => {
            const choices: UserChoices = ['neon', 'rain'];

            vi.mocked(mockRedis.hSet).mockResolvedValue(1);
            vi.mocked(mockRedis.expireTime).mockResolvedValue(-1); // No TTL set
            vi.mocked(mockRedis.expire).mockResolvedValue(undefined);

            await dataService.setUserChoices(TEST_DATE, USER_HASH, choices);

            expect(mockRedis.expireTime).toHaveBeenCalledWith(`choices:${TEST_DATE}`);
            expect(mockRedis.expire).toHaveBeenCalledWith(`choices:${TEST_DATE}`, TTL_SECONDS);
        });

        it('should not set TTL if already set on choices hash', async () => {
            const choices: UserChoices = ['neon', 'rain'];

            vi.mocked(mockRedis.hSet).mockResolvedValue(1);
            vi.mocked(mockRedis.expireTime).mockResolvedValue(Date.now() + 100000); // TTL already set
            vi.mocked(mockRedis.expire).mockResolvedValue(undefined);

            await dataService.setUserChoices(TEST_DATE, USER_HASH, choices);

            expect(mockRedis.expireTime).toHaveBeenCalledWith(`choices:${TEST_DATE}`);
            expect(mockRedis.expire).not.toHaveBeenCalled();
        });

        it('should handle empty choices array', async () => {
            const choices: UserChoices = [];

            vi.mocked(mockRedis.hSet).mockResolvedValue(1);
            vi.mocked(mockRedis.hGet).mockResolvedValue(JSON.stringify(choices));
            vi.mocked(mockRedis.expireTime).mockResolvedValue(-1);
            vi.mocked(mockRedis.expire).mockResolvedValue(undefined);

            await dataService.setUserChoices(TEST_DATE, USER_HASH, choices);
            const retrieved = await dataService.getUserChoices(TEST_DATE, USER_HASH);

            expect(retrieved).toEqual([]);
        });

        it('should handle choices with special characters', async () => {
            const choices: UserChoices = ['café', 'naïve', '日本語'];

            vi.mocked(mockRedis.hSet).mockResolvedValue(1);
            vi.mocked(mockRedis.hGet).mockResolvedValue(JSON.stringify(choices));
            vi.mocked(mockRedis.expireTime).mockResolvedValue(-1);
            vi.mocked(mockRedis.expire).mockResolvedValue(undefined);

            await dataService.setUserChoices(TEST_DATE, USER_HASH, choices);
            const retrieved = await dataService.getUserChoices(TEST_DATE, USER_HASH);

            expect(retrieved).toEqual(choices);
        });

        it('should throw descriptive error when setUserChoices fails', async () => {
            const choices: UserChoices = ['neon', 'rain'];

            vi.mocked(mockRedis.hSet).mockRejectedValue(new Error('Hash set failed'));

            await expect(
                dataService.setUserChoices(TEST_DATE, USER_HASH, choices)
            ).rejects.toThrow(`Failed to set user choices for date ${TEST_DATE}`);
            await expect(
                dataService.setUserChoices(TEST_DATE, USER_HASH, choices)
            ).rejects.toThrow('Hash set failed');
        });

        it('should throw descriptive error when getUserChoices fails', async () => {
            vi.mocked(mockRedis.hGet).mockRejectedValue(new Error('Hash get failed'));

            await expect(dataService.getUserChoices(TEST_DATE, USER_HASH)).rejects.toThrow(
                `Failed to get user choices for date ${TEST_DATE}`
            );
            await expect(dataService.getUserChoices(TEST_DATE, USER_HASH)).rejects.toThrow(
                'Hash get failed'
            );
        });

        it('should log but not throw when TTL setting fails', async () => {
            const choices: UserChoices = ['neon', 'rain'];

            vi.mocked(mockRedis.hSet).mockResolvedValue(1);
            vi.mocked(mockRedis.expireTime).mockRejectedValue(new Error('TTL check failed'));

            // Should not throw
            await expect(
                dataService.setUserChoices(TEST_DATE, USER_HASH, choices)
            ).resolves.not.toThrow();

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('Failed to set TTL'),
                expect.any(Error)
            );
        });
    });

    describe('incrementTallies()', () => {
        it('should increment counts correctly for single word', async () => {
            const words = ['neon'];

            vi.mocked(mockRedis.zIncrBy).mockResolvedValue(1);
            vi.mocked(mockRedis.expireTime).mockResolvedValue(-1);
            vi.mocked(mockRedis.expire).mockResolvedValue(undefined);

            await dataService.incrementTallies(TEST_DATE, words);

            expect(mockRedis.zIncrBy).toHaveBeenCalledWith(`tallies:${TEST_DATE}`, 'neon', 1);
        });

        it('should increment counts correctly for multiple words', async () => {
            const words = ['neon', 'rain', 'alley'];

            vi.mocked(mockRedis.zIncrBy).mockResolvedValue(1);
            vi.mocked(mockRedis.expireTime).mockResolvedValue(-1);
            vi.mocked(mockRedis.expire).mockResolvedValue(undefined);

            await dataService.incrementTallies(TEST_DATE, words);

            expect(mockRedis.zIncrBy).toHaveBeenCalledTimes(3);
            expect(mockRedis.zIncrBy).toHaveBeenCalledWith(`tallies:${TEST_DATE}`, 'neon', 1);
            expect(mockRedis.zIncrBy).toHaveBeenCalledWith(`tallies:${TEST_DATE}`, 'rain', 1);
            expect(mockRedis.zIncrBy).toHaveBeenCalledWith(`tallies:${TEST_DATE}`, 'alley', 1);
        });

        it('should increment same word multiple times when it appears in array', async () => {
            const words = ['neon', 'rain', 'neon'];

            vi.mocked(mockRedis.zIncrBy).mockResolvedValue(1);
            vi.mocked(mockRedis.expireTime).mockResolvedValue(-1);
            vi.mocked(mockRedis.expire).mockResolvedValue(undefined);

            await dataService.incrementTallies(TEST_DATE, words);

            expect(mockRedis.zIncrBy).toHaveBeenCalledTimes(3);
            expect(mockRedis.zIncrBy).toHaveBeenNthCalledWith(
                1,
                `tallies:${TEST_DATE}`,
                'neon',
                1
            );
            expect(mockRedis.zIncrBy).toHaveBeenNthCalledWith(
                2,
                `tallies:${TEST_DATE}`,
                'rain',
                1
            );
            expect(mockRedis.zIncrBy).toHaveBeenNthCalledWith(
                3,
                `tallies:${TEST_DATE}`,
                'neon',
                1
            );
        });

        it('should set TTL on first write to tallies sorted set', async () => {
            const words = ['neon'];

            vi.mocked(mockRedis.zIncrBy).mockResolvedValue(1);
            vi.mocked(mockRedis.expireTime).mockResolvedValue(-1); // No TTL set
            vi.mocked(mockRedis.expire).mockResolvedValue(undefined);

            await dataService.incrementTallies(TEST_DATE, words);

            expect(mockRedis.expireTime).toHaveBeenCalledWith(`tallies:${TEST_DATE}`);
            expect(mockRedis.expire).toHaveBeenCalledWith(`tallies:${TEST_DATE}`, TTL_SECONDS);
        });

        it('should not set TTL if already set on tallies sorted set', async () => {
            const words = ['neon'];

            vi.mocked(mockRedis.zIncrBy).mockResolvedValue(1);
            vi.mocked(mockRedis.expireTime).mockResolvedValue(Date.now() + 100000); // TTL already set
            vi.mocked(mockRedis.expire).mockResolvedValue(undefined);

            await dataService.incrementTallies(TEST_DATE, words);

            expect(mockRedis.expireTime).toHaveBeenCalledWith(`tallies:${TEST_DATE}`);
            expect(mockRedis.expire).not.toHaveBeenCalled();
        });

        it('should handle empty words array', async () => {
            const words: string[] = [];

            vi.mocked(mockRedis.expireTime).mockResolvedValue(-1);
            vi.mocked(mockRedis.expire).mockResolvedValue(undefined);

            await dataService.incrementTallies(TEST_DATE, words);

            expect(mockRedis.zIncrBy).not.toHaveBeenCalled();
        });

        it('should throw descriptive error when incrementTallies fails', async () => {
            const words = ['neon'];

            vi.mocked(mockRedis.zIncrBy).mockRejectedValue(new Error('Sorted set increment failed'));

            await expect(dataService.incrementTallies(TEST_DATE, words)).rejects.toThrow(
                `Failed to increment tallies for date ${TEST_DATE}`
            );
            await expect(dataService.incrementTallies(TEST_DATE, words)).rejects.toThrow(
                'Sorted set increment failed'
            );
        });
    });

    describe('getTopWords()', () => {
        it('should return sorted results in descending order by count', async () => {
            const mockResults = [
                { member: 'neon', score: 42 },
                { member: 'rain', score: 38 },
                { member: 'alley', score: 35 },
            ];

            vi.mocked(mockRedis.zRange).mockResolvedValue(mockResults);

            const result = await dataService.getTopWords(TEST_DATE, 10);

            expect(mockRedis.zRange).toHaveBeenCalledWith(`tallies:${TEST_DATE}`, 0, 9, {
                by: 'rank',
                reverse: true,
            });

            expect(result).toEqual([
                { word: 'neon', count: 42 },
                { word: 'rain', count: 38 },
                { word: 'alley', count: 35 },
            ]);
        });

        it('should respect the limit parameter', async () => {
            const mockResults = [
                { member: 'neon', score: 42 },
                { member: 'rain', score: 38 },
            ];

            vi.mocked(mockRedis.zRange).mockResolvedValue(mockResults);

            await dataService.getTopWords(TEST_DATE, 2);

            expect(mockRedis.zRange).toHaveBeenCalledWith(`tallies:${TEST_DATE}`, 0, 1, {
                by: 'rank',
                reverse: true,
            });
        });

        it('should return empty array when no tallies exist', async () => {
            vi.mocked(mockRedis.zRange).mockResolvedValue([]);

            const result = await dataService.getTopWords(TEST_DATE, 10);

            expect(result).toEqual([]);
        });

        it('should handle limit of 1', async () => {
            const mockResults = [{ member: 'neon', score: 42 }];

            vi.mocked(mockRedis.zRange).mockResolvedValue(mockResults);

            const result = await dataService.getTopWords(TEST_DATE, 1);

            expect(mockRedis.zRange).toHaveBeenCalledWith(`tallies:${TEST_DATE}`, 0, 0, {
                by: 'rank',
                reverse: true,
            });
            expect(result).toEqual([{ word: 'neon', count: 42 }]);
        });

        it('should handle large limits', async () => {
            const mockResults = Array.from({ length: 100 }, (_, i) => ({
                member: `word${i}`,
                score: 100 - i,
            }));

            vi.mocked(mockRedis.zRange).mockResolvedValue(mockResults);

            const result = await dataService.getTopWords(TEST_DATE, 100);

            expect(mockRedis.zRange).toHaveBeenCalledWith(`tallies:${TEST_DATE}`, 0, 99, {
                by: 'rank',
                reverse: true,
            });
            expect(result).toHaveLength(100);
            expect(result[0]).toEqual({ word: 'word0', count: 100 });
            expect(result[99]).toEqual({ word: 'word99', count: 1 });
        });

        it('should throw descriptive error when getTopWords fails', async () => {
            vi.mocked(mockRedis.zRange).mockRejectedValue(new Error('Sorted set range failed'));

            await expect(dataService.getTopWords(TEST_DATE, 10)).rejects.toThrow(
                `Failed to get top words for date ${TEST_DATE}`
            );
            await expect(dataService.getTopWords(TEST_DATE, 10)).rejects.toThrow(
                'Sorted set range failed'
            );
        });
    });

    describe('getTallyCount()', () => {
        it('should return correct count for a word', async () => {
            vi.mocked(mockRedis.zScore).mockResolvedValue(42);

            const count = await dataService.getTallyCount(TEST_DATE, 'neon');

            expect(mockRedis.zScore).toHaveBeenCalledWith(`tallies:${TEST_DATE}`, 'neon');
            expect(count).toBe(42);
        });

        it('should return 0 when word has no votes', async () => {
            vi.mocked(mockRedis.zScore).mockResolvedValue(undefined);

            const count = await dataService.getTallyCount(TEST_DATE, 'nonexistent');

            expect(count).toBe(0);
        });

        it('should return 0 for word with zero score', async () => {
            vi.mocked(mockRedis.zScore).mockResolvedValue(0);

            const count = await dataService.getTallyCount(TEST_DATE, 'word');

            expect(count).toBe(0);
        });

        it('should handle large counts', async () => {
            vi.mocked(mockRedis.zScore).mockResolvedValue(999999);

            const count = await dataService.getTallyCount(TEST_DATE, 'popular');

            expect(count).toBe(999999);
        });

        it('should throw descriptive error when getTallyCount fails', async () => {
            vi.mocked(mockRedis.zScore).mockRejectedValue(new Error('Sorted set score failed'));

            await expect(dataService.getTallyCount(TEST_DATE, 'neon')).rejects.toThrow(
                `Failed to get tally count for word "neon" on date ${TEST_DATE}`
            );
            await expect(dataService.getTallyCount(TEST_DATE, 'neon')).rejects.toThrow(
                'Sorted set score failed'
            );
        });
    });

    describe('Redis key naming conventions', () => {
        it('should use correct key format for seed data', async () => {
            const seedData: SeedData = {
                seedHex: 'abc123',
                theme: 'Test',
                poolsVersion: 'v1',
                createdAt: Date.now(),
            };

            vi.mocked(mockRedis.set).mockResolvedValue('OK');

            await dataService.setSeed('2025-10-14', seedData);

            expect(mockRedis.set).toHaveBeenCalledWith(
                'seed:2025-10-14',
                expect.any(String),
                expect.any(Object)
            );
        });

        it('should use correct key format for user choices', async () => {
            vi.mocked(mockRedis.hSet).mockResolvedValue(1);
            vi.mocked(mockRedis.expireTime).mockResolvedValue(-1);
            vi.mocked(mockRedis.expire).mockResolvedValue(undefined);

            await dataService.setUserChoices('2025-10-14', 'hash123', ['word']);

            expect(mockRedis.hSet).toHaveBeenCalledWith(
                'choices:2025-10-14',
                expect.any(Object)
            );
        });

        it('should use correct key format for tallies', async () => {
            vi.mocked(mockRedis.zIncrBy).mockResolvedValue(1);
            vi.mocked(mockRedis.expireTime).mockResolvedValue(-1);
            vi.mocked(mockRedis.expire).mockResolvedValue(undefined);

            await dataService.incrementTallies('2025-10-14', ['word']);

            expect(mockRedis.zIncrBy).toHaveBeenCalledWith(
                'tallies:2025-10-14',
                expect.any(String),
                expect.any(Number)
            );
        });

        it('should handle different date formats consistently', async () => {
            const dates = ['2025-01-01', '2025-12-31', '2024-02-29'];

            vi.mocked(mockRedis.get).mockResolvedValue(undefined);

            for (const date of dates) {
                await dataService.getSeed(date);
                expect(mockRedis.get).toHaveBeenCalledWith(`seed:${date}`);
            }
        });
    });

    describe('TTL behavior', () => {
        it('should check TTL before setting on choices hash', async () => {
            const choices: UserChoices = ['word'];

            vi.mocked(mockRedis.hSet).mockResolvedValue(1);
            vi.mocked(mockRedis.expireTime).mockResolvedValue(Date.now() + 100000);

            await dataService.setUserChoices(TEST_DATE, 'hash', choices);

            expect(mockRedis.expireTime).toHaveBeenCalledWith(`choices:${TEST_DATE}`);
            expect(mockRedis.expire).not.toHaveBeenCalled();
        });

        it('should check TTL before setting on tallies sorted set', async () => {
            vi.mocked(mockRedis.zIncrBy).mockResolvedValue(1);
            vi.mocked(mockRedis.expireTime).mockResolvedValue(Date.now() + 100000);

            await dataService.incrementTallies(TEST_DATE, ['word']);

            expect(mockRedis.expireTime).toHaveBeenCalledWith(`tallies:${TEST_DATE}`);
            expect(mockRedis.expire).not.toHaveBeenCalled();
        });

        it('should handle expireTime returning -2 (key does not exist)', async () => {
            const choices: UserChoices = ['word'];

            vi.mocked(mockRedis.hSet).mockResolvedValue(1);
            vi.mocked(mockRedis.expireTime).mockResolvedValue(-2); // Key doesn't exist

            await dataService.setUserChoices(TEST_DATE, 'hash', choices);

            // Should not set TTL if key doesn't exist (shouldn't happen in practice)
            expect(mockRedis.expire).not.toHaveBeenCalled();
        });
    });
});
