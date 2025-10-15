/**
 * Server Startup Integration Test - SeedingService
 *
 * Verifies that SeedingService is properly integrated into server startup:
 * - Service initializes successfully with valid configuration
 * - Server fails fast with clear error messages when configuration is invalid
 * - Pool files are loaded correctly at startup
 * - Initialization logs include pools version information
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SeedingService } from '../src/server/services/seeding.service';
import { redis } from '@devvit/web/server';
import fs from 'fs';
import path from 'path';

describe('Server Startup - SeedingService Integration', () => {
  const originalEnv = process.env.DAILY_SEED_SECRET;
  let consoleLogSpy: string[] = [];
  const originalConsoleLog = console.log;

  beforeEach(() => {
    // Capture console.log output
    consoleLogSpy = [];
    console.log = (...args: unknown[]) => {
      consoleLogSpy.push(args.join(' '));
      originalConsoleLog(...args);
    };
  });

  afterEach(() => {
    // Restore original console.log
    console.log = originalConsoleLog;

    // Restore original environment
    if (originalEnv) {
      process.env.DAILY_SEED_SECRET = originalEnv;
    } else {
      delete process.env.DAILY_SEED_SECRET;
    }
  });

  it('should initialize SeedingService successfully with valid configuration', () => {
    // Set valid environment variable
    process.env.DAILY_SEED_SECRET =
      'c8c1d2d49d099b330f4068636c8bc06e1b847e9ce5c1a1a864baf72088baa64a';

    // Instantiate SeedingService (simulates server startup)
    const seedingService = new SeedingService(redis);

    // Verify service was created
    expect(seedingService).toBeDefined();

    // Verify initialization log was output
    const initLog = consoleLogSpy.find((log) =>
      log.includes('SeedingService initialized')
    );
    expect(initLog).toBeDefined();
    expect(initLog).toContain('pools version v1');
    expect(initLog).toMatch(/\d+ themes/);
    expect(initLog).toMatch(/\d+ words/);
  });

  it('should fail fast when DAILY_SEED_SECRET is missing', () => {
    // Remove environment variable
    delete process.env.DAILY_SEED_SECRET;

    // Attempt to instantiate SeedingService
    expect(() => new SeedingService(redis)).toThrow(
      'DAILY_SEED_SECRET environment variable is required'
    );
  });

  it('should fail fast when DAILY_SEED_SECRET is empty', () => {
    // Set empty environment variable
    process.env.DAILY_SEED_SECRET = '';

    // Attempt to instantiate SeedingService
    expect(() => new SeedingService(redis)).toThrow(
      'DAILY_SEED_SECRET environment variable is required'
    );
  });

  it('should fail fast when pool files are missing', () => {
    // Set valid environment variable
    process.env.DAILY_SEED_SECRET =
      'c8c1d2d49d099b330f4068636c8bc06e1b847e9ce5c1a1a864baf72088baa64a';

    // Temporarily rename pool file to simulate missing file
    const poolsPath = path.join(process.cwd(), 'data/pools.v1.json');
    const poolsBackupPath = path.join(
      process.cwd(),
      'data/pools.v1.json.backup'
    );

    // Backup the file
    if (fs.existsSync(poolsPath)) {
      fs.renameSync(poolsPath, poolsBackupPath);
    }

    try {
      // Attempt to instantiate SeedingService
      expect(() => new SeedingService(redis)).toThrow(
        'Failed to load word pools'
      );
    } finally {
      // Restore the file
      if (fs.existsSync(poolsBackupPath)) {
        fs.renameSync(poolsBackupPath, poolsPath);
      }
    }
  });

  it('should fail fast when lexicon file is missing', () => {
    // Set valid environment variable
    process.env.DAILY_SEED_SECRET =
      'c8c1d2d49d099b330f4068636c8bc06e1b847e9ce5c1a1a864baf72088baa64a';

    // Temporarily rename lexicon file to simulate missing file
    const lexiconPath = path.join(process.cwd(), 'data/lexicon.map.json');
    const lexiconBackupPath = path.join(
      process.cwd(),
      'data/lexicon.map.json.backup'
    );

    // Backup the file
    if (fs.existsSync(lexiconPath)) {
      fs.renameSync(lexiconPath, lexiconBackupPath);
    }

    try {
      // Attempt to instantiate SeedingService
      expect(() => new SeedingService(redis)).toThrow(
        'Failed to load lexicon'
      );
    } finally {
      // Restore the file
      if (fs.existsSync(lexiconBackupPath)) {
        fs.renameSync(lexiconBackupPath, lexiconPath);
      }
    }
  });

  it('should log pools version and theme count on successful initialization', () => {
    // Set valid environment variable
    process.env.DAILY_SEED_SECRET =
      'c8c1d2d49d099b330f4068636c8bc06e1b847e9ce5c1a1a864baf72088baa64a';

    // Instantiate SeedingService
    new SeedingService(redis);

    // Verify initialization log includes version and counts
    const initLog = consoleLogSpy.find((log) =>
      log.includes('SeedingService initialized')
    );
    expect(initLog).toBeDefined();
    expect(initLog).toMatch(/SeedingService initialized with pools version v1/);
    expect(initLog).toMatch(/\d+ themes/);
    expect(initLog).toMatch(/\d+ words/);
  });
});
