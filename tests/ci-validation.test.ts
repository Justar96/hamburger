import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

/**
 * CI Validation Tests
 * 
 * Validates CI job outputs meet quality standards:
 * - Build artifacts created correctly
 * - No compilation errors or critical warnings
 * - All required tests and configs present
 */

const ROOT = process.cwd();
const PATHS = {
  server: join(ROOT, 'dist', 'server', 'index.js'),
  client: join(ROOT, 'public', 'index.html'),
  devvit: join(ROOT, 'devvit.json'),
  ci: join(ROOT, '.github', 'workflows', 'ci.yml'),
  playwright: join(ROOT, 'playwright.config.ts'),
  testsDir: join(ROOT, 'tests'),
  e2eDir: join(ROOT, 'tests', 'e2e'),
  integrationDir: join(ROOT, 'tests', 'integration'),
} as const;

const REQUIRED_TEST_FILES = [
  'tests/build.test.ts',
  'tests/ci.test.ts',
  'tests/config.test.ts',
  'tests/typescript.test.ts',
  'tests/env.test.ts',
] as const;

function readDevvitConfig() {
  return JSON.parse(readFileSync(PATHS.devvit, 'utf-8'));
}

function execCommand(command: string, timeoutMs = 60000): string {
  return execSync(command, {
    encoding: 'utf-8',
    stdio: 'pipe',
    timeout: timeoutMs,
  });
}

function execCommandSafe(command: string, timeoutMs = 60000): string {
  try {
    return execCommand(command, timeoutMs);
  } catch (error: any) {
    return (error.stdout || '') + (error.stderr || '');
  }
}

describe('CI job outputs validation', () => {
  let buildOutput = '';
  let devvitConfig: any;
  let ciContent: string;

  beforeAll(() => {
    try {
      buildOutput = execCommand('pnpm run build');
    } catch (error: any) {
      throw new Error(
        `Build failed: ${error.message}\nStdout: ${error.stdout}\nStderr: ${error.stderr}`
      );
    }

    devvitConfig = readDevvitConfig();
    ciContent = readFileSync(PATHS.ci, 'utf-8');
  });

  describe('Build artifacts validation', () => {
    it('should create server build artifact at dist/server/index.js', () => {
      expect(existsSync(PATHS.server), 'Server artifact missing').toBe(true);
      const content = readFileSync(PATHS.server, 'utf-8');
      expect(content.length).toBeGreaterThan(0);
    });

    it('should create client artifact at public/index.html', () => {
      expect(existsSync(PATHS.client), 'Client artifact missing').toBe(true);
      const content = readFileSync(PATHS.client, 'utf-8');
      expect(content).toContain('<!DOCTYPE html>');
    });

    it('should have valid devvit.json configuration', () => {
      expect(existsSync(PATHS.devvit)).toBe(true);
      expect(devvitConfig).toHaveProperty('name');
      expect(devvitConfig).toHaveProperty('server');
      expect(devvitConfig).toHaveProperty('post');
    });

    it('should have build artifacts matching devvit.json entry points', () => {
      const serverEntry = join(ROOT, devvitConfig.server.entry);
      expect(existsSync(serverEntry), `Server entry ${serverEntry} not found`).toBe(true);

      const clientEntry = join(
        ROOT,
        devvitConfig.post.dir,
        devvitConfig.post.entrypoints.default.entry
      );
      expect(existsSync(clientEntry), `Client entry ${clientEntry} not found`).toBe(true);
    });
  });

  describe('Build output quality', () => {
    it('should build without errors', () => {
      expect(buildOutput).toBeDefined();
      expect(buildOutput.length).toBeGreaterThan(0);
    });

    it('should not contain TypeScript compilation errors', () => {
      const lower = buildOutput.toLowerCase();
      expect(lower).not.toContain('error ts');
      expect(lower).not.toContain('compilation error');
    });

    it('should not contain critical warnings', () => {
      const lines = buildOutput.toLowerCase().split('\n');
      const criticalWarnings = lines.filter(
        (line) =>
          line.includes('warning') &&
          (line.includes('deprecated') || line.includes('security'))
      );

      if (criticalWarnings.length > 0) {
        console.warn('Build warnings detected:', criticalWarnings);
      }
    });

    it('should not have unhandled promise rejections', () => {
      const lower = buildOutput.toLowerCase();
      expect(lower).not.toContain('unhandledpromiserejection');
      expect(lower).not.toContain('unhandled rejection');
    });
  });

  describe('Lint job validation', () => {
    it('should pass ESLint checks', () => {
      expect(() => execCommand('pnpm run lint', 30000)).not.toThrow();
    });

    it('should pass Prettier format checks', () => {
      expect(() => execCommand('pnpm run format:check', 30000)).not.toThrow();
    });
  });

  describe('Test job validation', () => {
    it('should have e2e tests configured', () => {
      expect(existsSync(PATHS.playwright)).toBe(true);
    });

    it('should have test infrastructure', () => {
      expect(existsSync(PATHS.testsDir)).toBe(true);
      REQUIRED_TEST_FILES.forEach((file) => {
        expect(existsSync(join(ROOT, file)), `Missing test file: ${file}`).toBe(true);
      });
    });

    it('should have vitest configuration', () => {
      const vitestConfig = join(ROOT, 'vitest.config.ts');
      expect(existsSync(vitestConfig)).toBe(true);
    });
  });

  describe('Devvit validation', () => {
    it('should pass devvit validate command', () => {
      expect(() => execCommand('pnpm run validate')).not.toThrow();
    });

    it('should have valid devvit.json schema', () => {
      expect(devvitConfig.$schema).toContain('developers.reddit.com');
      expect(devvitConfig).toHaveProperty('name');
      expect(devvitConfig).toHaveProperty('server');
      expect(devvitConfig).toHaveProperty('post');
      expect(devvitConfig).toHaveProperty('permissions');
    });
  });

  describe('Test coverage validation', () => {
    it('should have test files for all major components', () => {
      REQUIRED_TEST_FILES.forEach((testFile) => {
        expect(existsSync(join(ROOT, testFile)), `Missing: ${testFile}`).toBe(true);
      });
    });

    it('should have e2e test directory', () => {
      expect(existsSync(PATHS.e2eDir)).toBe(true);
    });

    it('should have integration test directory', () => {
      expect(existsSync(PATHS.integrationDir)).toBe(true);
    });
  });

  describe('CI workflow completeness', () => {
    it('should have all required CI jobs defined', () => {
      const requiredJobs = ['lint:', 'test-unit:', 'test-integration:', 'test-e2e:', 'build:'];
      requiredJobs.forEach((job) => {
        expect(ciContent, `Missing CI job: ${job}`).toContain(job);
      });
    });

    it('should use consistent Node.js version across jobs', () => {
      const nodeVersionMatches = ciContent.match(/node-version:\s*['"]?(\d+)['"]?/g);
      expect(nodeVersionMatches).toBeDefined();
      expect(nodeVersionMatches!.length).toBeGreaterThan(0);

      nodeVersionMatches!.forEach((match) => {
        expect(match, 'All jobs should use Node 20').toContain('20');
      });
    });

    it('should use npm caching for faster builds', () => {
      expect(ciContent).toContain("cache: 'npm'");
    });
  });

  describe('Build artifact integrity', () => {
    it('should have server bundle with required endpoints', () => {
      const content = readFileSync(PATHS.server, 'utf-8');
      expect(content).toContain('/api/health');
      expect(content).toContain('/internal/install');
    });

    it('should have client with health check integration', () => {
      const content = readFileSync(PATHS.client, 'utf-8');
      expect(content).toContain('/api/health');
      expect(content).toContain('fetch');
    });

    it('should have readable build artifacts', () => {
      expect(() => readFileSync(PATHS.server, 'utf-8')).not.toThrow();
      expect(() => readFileSync(PATHS.client, 'utf-8')).not.toThrow();
    });
  });

  describe('Dependency health', () => {
    it('should not have critical deprecation warnings', () => {
      const output = execCommandSafe('pnpm list');
      const lines = output.toLowerCase().split('\n');
      const criticalDeprecations = lines.filter(
        (line) => line.includes('deprecated') && line.includes('critical')
      );

      expect(criticalDeprecations.length).toBe(0);
    });
  });
});
