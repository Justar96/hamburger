import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const PATHS = {
  envExample: join(process.cwd(), '.env.example'),
  gitignore: join(process.cwd(), '.gitignore'),
} as const;

const REQUIRED_ENV_VARS = ['NODE_ENV', 'PORT', 'REDIS_URL'] as const;

describe('Environment configuration', () => {
  let envExampleContent: string;
  let gitignoreContent: string;

  beforeAll(() => {
    if (existsSync(PATHS.envExample)) {
      envExampleContent = readFileSync(PATHS.envExample, 'utf-8');
    }
    if (existsSync(PATHS.gitignore)) {
      gitignoreContent = readFileSync(PATHS.gitignore, 'utf-8');
    }
  });

  describe('.env.example file', () => {
    it('should exist and be readable', () => {
      expect(existsSync(PATHS.envExample), '.env.example file not found').toBe(true);
      expect(envExampleContent.length, '.env.example is empty').toBeGreaterThan(0);
    });

    it('should contain all required environment variables', () => {
      const missing = REQUIRED_ENV_VARS.filter(varName => !envExampleContent.includes(varName));
      expect(missing, `Missing required variables: ${missing.join(', ')}`).toHaveLength(0);
    });

    it('should document that .env is for local development only', () => {
      expect(
        envExampleContent.toLowerCase(),
        'Missing documentation about local development usage'
      ).toMatch(/local.*development|development.*local/);
    });

    it('should contain placeholder comments for Vertex AI variables', () => {
      expect(envExampleContent, 'Missing Vertex AI documentation').toContain('Vertex AI');
      expect(
        envExampleContent,
        'Missing GCP_PROJECT_ID or VERTEX variable placeholders'
      ).toMatch(/GCP_PROJECT_ID|VERTEX/);
    });
  });

  describe('.gitignore configuration', () => {
    it('should exclude .env files from version control', () => {
      expect(existsSync(PATHS.gitignore), '.gitignore file not found').toBe(true);
      expect(gitignoreContent, '.env not in .gitignore').toContain('.env');
      expect(gitignoreContent, '.env.local not in .gitignore').toContain('.env.local');
    });
  });

  describe('Environment variable loading', () => {
    it('should allow environment variables to be set and deleted', () => {
      const testKey = 'TEST_ENV_VAR_TEMP';
      const testValue = 'test-value';
      
      process.env[testKey] = testValue;
      expect(process.env[testKey]).toBe(testValue);
      
      delete process.env[testKey];
      expect(process.env[testKey]).toBeUndefined();
    });

    it('should handle missing environment variables gracefully', () => {
      const nonExistentVar = process.env.NON_EXISTENT_VAR_12345;
      expect(nonExistentVar).toBeUndefined();
    });

    it('should preserve existing NODE_ENV variable', () => {
      expect(process.env.NODE_ENV).toBeDefined();
    });
  });
});
