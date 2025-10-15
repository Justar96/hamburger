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

interface DevvitConfig {
  $schema: string;
  name: string;
  post: {
    dir: string;
    entrypoints: {
      default: {
        entry: string;
        height: string;
      };
    };
  };
  server: {
    entry: string;
  };
  permissions: {
    redis: boolean;
    realtime: boolean;
    media: boolean;
    http?: { enable: boolean };
    reddit?: { enable: boolean };
  };
  triggers?: {
    onAppInstall?: string;
  };
  dev?: {
    subreddit: string;
  };
}

interface ExecError extends Error {
  stdout?: string;
  stderr?: string;
  status?: number;
}

const ROOT = process.cwd();
const PATHS = {
  server: join(ROOT, 'dist', 'server', 'index.js'),
  client: join(ROOT, 'public', 'index.html'),
  devvit: join(ROOT, 'devvit.json'),
  ci: join(ROOT, '.github', 'workflows', 'ci.yml'),
  playwright: join(ROOT, 'playwright.config.ts'),
  vitest: join(ROOT, 'vitest.config.ts'),
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

function readFileContent(path: string): string {
  if (!existsSync(path)) {
    throw new Error(`File not found: ${path}`);
  }
  return readFileSync(path, 'utf-8');
}

function readDevvitConfig(): DevvitConfig {
  const content = readFileContent(PATHS.devvit);
  return JSON.parse(content) as DevvitConfig;
}

function execCommand(command: string, timeoutMs = 60000): string {
  return execSync(command, {
    encoding: 'utf-8',
    stdio: 'pipe',
    timeout: timeoutMs,
  });
}

interface ExecResult {
  output: string;
  error?: ExecError;
}

function execCommandSafe(command: string, timeoutMs = 60000): ExecResult {
  try {
    const output = execCommand(command, timeoutMs);
    return { output };
  } catch (error) {
    const execError = error as ExecError;
    return {
      output: (execError.stdout || '') + (execError.stderr || ''),
      error: execError,
    };
  }
}

describe('CI job outputs validation', () => {
  let buildOutput = '';
  let devvitConfig: DevvitConfig;
  let ciContent: string;
  let serverContent: string;
  let clientContent: string;

  beforeAll(() => {
    try {
      buildOutput = execCommand('pnpm run build');
    } catch (error) {
      const execError = error as ExecError;
      throw new Error(
        `Build failed: ${execError.message}\nStdout: ${execError.stdout}\nStderr: ${execError.stderr}`
      );
    }

    devvitConfig = readDevvitConfig();
    ciContent = readFileContent(PATHS.ci);
    serverContent = readFileContent(PATHS.server);
    clientContent = readFileContent(PATHS.client);
  });

  describe('Build artifacts validation', () => {
    it('should create server build artifact at dist/server/index.js', () => {
      expect(existsSync(PATHS.server), 'Server artifact missing').toBe(true);
      expect(serverContent.length, 'Server artifact is empty').toBeGreaterThan(0);
    });

    it('should create client artifact at public/index.html', () => {
      expect(existsSync(PATHS.client), 'Client artifact missing').toBe(true);
      expect(clientContent, 'Client artifact missing DOCTYPE').toContain('<!DOCTYPE html>');
    });

    it('should have valid devvit.json configuration', () => {
      expect(existsSync(PATHS.devvit), 'devvit.json missing').toBe(true);
      expect(devvitConfig.name, 'devvit.json missing name').toBeTruthy();
      expect(devvitConfig.server, 'devvit.json missing server config').toBeTruthy();
      expect(devvitConfig.post, 'devvit.json missing post config').toBeTruthy();
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
      expect(buildOutput, 'Build output is empty').toBeDefined();
      expect(buildOutput.length, 'Build produced no output').toBeGreaterThan(0);
    });

    it('should not contain TypeScript compilation errors', () => {
      const lower = buildOutput.toLowerCase();
      expect(lower, 'Build contains TypeScript errors').not.toContain('error ts');
      expect(lower, 'Build contains compilation errors').not.toContain('compilation error');
    });

    it('should not contain critical warnings', () => {
      const lines = buildOutput.toLowerCase().split('\n');
      const criticalWarnings = lines.filter(
        (line) =>
          line.includes('warning') &&
          (line.includes('deprecated') || line.includes('security'))
      );

      expect(
        criticalWarnings.length,
        `Build contains ${criticalWarnings.length} critical warnings:\n${criticalWarnings.join('\n')}`
      ).toBe(0);
    });

    it('should not have unhandled promise rejections', () => {
      const lower = buildOutput.toLowerCase();
      expect(lower, 'Build contains unhandled promise rejections').not.toContain('unhandledpromiserejection');
      expect(lower, 'Build contains unhandled rejections').not.toContain('unhandled rejection');
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
      expect(existsSync(PATHS.playwright), 'Playwright config missing').toBe(true);
    });

    it('should have test infrastructure', () => {
      expect(existsSync(PATHS.testsDir), 'Tests directory missing').toBe(true);
      REQUIRED_TEST_FILES.forEach((file) => {
        expect(existsSync(join(ROOT, file)), `Missing test file: ${file}`).toBe(true);
      });
    });

    it('should have vitest configuration', () => {
      expect(existsSync(PATHS.vitest), 'Vitest config missing').toBe(true);
    });
  });

  describe('Devvit validation', () => {
    it('should pass devvit validate command', () => {
      expect(() => execCommand('pnpm run validate'), 'Devvit validation failed').not.toThrow();
    });

    it('should have valid devvit.json schema', () => {
      expect(devvitConfig.$schema, 'Invalid schema URL').toContain('developers.reddit.com');
      expect(devvitConfig.name, 'Missing app name').toBeTruthy();
      expect(devvitConfig.server, 'Missing server config').toBeTruthy();
      expect(devvitConfig.post, 'Missing post config').toBeTruthy();
      expect(devvitConfig.permissions, 'Missing permissions config').toBeTruthy();
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

    it('should use pnpm caching for faster builds', () => {
      expect(ciContent).toContain("cache: 'pnpm'");
    });
  });

  describe('Build artifact integrity', () => {
    it('should have server bundle with required endpoints', () => {
      expect(serverContent, 'Server missing /api/health endpoint').toContain('/api/health');
      expect(serverContent, 'Server missing /internal/install endpoint').toContain('/internal/install');
    });

    it('should have client with health check integration', () => {
      expect(clientContent, 'Client missing /api/health call').toContain('/api/health');
      expect(clientContent, 'Client missing fetch implementation').toContain('fetch');
    });

    it('should have readable build artifacts', () => {
      expect(serverContent.length, 'Server artifact is empty').toBeGreaterThan(0);
      expect(clientContent.length, 'Client artifact is empty').toBeGreaterThan(0);
    });
  });

  describe('Dependency health', () => {
    it('should not have critical deprecation warnings', () => {
      const result = execCommandSafe('pnpm list');
      const lines = result.output.toLowerCase().split('\n');
      const criticalDeprecations = lines.filter(
        (line) => line.includes('deprecated') && line.includes('critical')
      );

      expect(
        criticalDeprecations.length,
        `Found ${criticalDeprecations.length} critical deprecations:\n${criticalDeprecations.join('\n')}`
      ).toBe(0);
    });
  });
});
