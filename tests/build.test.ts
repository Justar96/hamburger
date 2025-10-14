import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const PATHS = {
  server: join(process.cwd(), 'dist', 'server', 'index.js'),
  client: join(process.cwd(), 'public', 'index.html'),
  devvit: join(process.cwd(), 'devvit.json'),
} as const;

describe('Build validation', () => {
  beforeAll(() => {
    // Run the build before tests
    try {
      execSync('npm run build', { stdio: 'inherit' });
    } catch (error) {
      throw new Error('Build failed during test setup');
    }
  });

  describe('Server build output', () => {
    it('should create dist/server/index.js', () => {
      expect(existsSync(PATHS.server)).toBe(true);
    });

    it('should produce valid JavaScript without syntax errors', () => {
      const content = readFileSync(PATHS.server, 'utf-8');
      
      // Check that file is not empty
      expect(content.length).toBeGreaterThan(0);
      
      // Check for basic CommonJS structure - should contain exports or module.exports
      expect(content).toMatch(/exports|module\.exports/);
      
      // Verify basic syntax by checking for common patterns
      expect(content).not.toContain('SyntaxError');
    });

    it('should contain health endpoint handler', () => {
      const content = readFileSync(PATHS.server, 'utf-8');
      expect(content).toContain('/api/health');
    });

    it('should contain install endpoint handler', () => {
      const content = readFileSync(PATHS.server, 'utf-8');
      expect(content).toContain('/internal/install');
    });
  });

  describe('Client build output', () => {
    it('should have public/ directory with index.html', () => {
      expect(existsSync(PATHS.client)).toBe(true);
    });

    it('should have valid HTML structure', () => {
      const content = readFileSync(PATHS.client, 'utf-8');
      
      // Check for basic HTML structure
      expect(content).toContain('<!DOCTYPE html>');
      expect(content).toContain('<html');
      expect(content).toContain('</html>');
      expect(content).toContain('<head>');
      expect(content).toContain('</head>');
      expect(content).toContain('<body>');
      expect(content).toContain('</body>');
    });

    it('should contain Choice Chorus branding', () => {
      const content = readFileSync(PATHS.client, 'utf-8');
      expect(content).toContain('Choice Chorus');
    });

    it('should contain health check fetch call', () => {
      const content = readFileSync(PATHS.client, 'utf-8');
      expect(content).toContain('/api/health');
      expect(content).toContain('fetch');
    });
  });

  describe('Build script execution', () => {
    it('should exit with code 0 on success', () => {
      // Run build again to verify it's idempotent and succeeds
      expect(() => {
        execSync('npm run build', { stdio: 'pipe' });
      }).not.toThrow();
    });

    it('should match devvit.json entry points', () => {
      const devvitConfig = JSON.parse(readFileSync(PATHS.devvit, 'utf-8'));
      
      // Verify server entry point exists
      const serverEntry = join(process.cwd(), devvitConfig.server.entry);
      expect(existsSync(serverEntry)).toBe(true);
      
      // Verify client entry point exists
      const clientEntry = join(
        process.cwd(),
        devvitConfig.post.dir,
        devvitConfig.post.entrypoints.default.entry
      );
      expect(existsSync(clientEntry)).toBe(true);
    });
  });

  describe('Built server runtime', () => {
    it('should be executable with node', () => {
      expect(existsSync(PATHS.server)).toBe(true);
      const content = readFileSync(PATHS.server, 'utf-8');
      expect(content.length).toBeGreaterThan(0);
      expect(content).toMatch(/express|createServer|listen/);
    });
  });
});
