import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

describe('TypeScript Configuration', () => {
  describe('tsconfig.json', () => {
    it('should exist and be valid JSON', () => {
      const tsconfigPath = join(process.cwd(), 'tsconfig.json');
      expect(existsSync(tsconfigPath)).toBe(true);

      const content = readFileSync(tsconfigPath, 'utf-8');
      expect(() => JSON.parse(content)).not.toThrow();
    });

    it('should have required compiler options', () => {
      const tsconfigPath = join(process.cwd(), 'tsconfig.json');
      const content = readFileSync(tsconfigPath, 'utf-8');
      const config = JSON.parse(content);

      expect(config.compilerOptions).toBeDefined();
      expect(config.compilerOptions.target).toBe('ES2022');
      expect(config.compilerOptions.module).toBe('ESNext');
    });

    it('should have strict mode enabled', () => {
      const tsconfigPath = join(process.cwd(), 'tsconfig.json');
      const content = readFileSync(tsconfigPath, 'utf-8');
      const config = JSON.parse(content);

      expect(config.compilerOptions.strict).toBe(true);
    });
  });

  describe('tsconfig.server.json', () => {
    it('should exist and be valid JSON', () => {
      const tsconfigPath = join(process.cwd(), 'tsconfig.server.json');
      expect(existsSync(tsconfigPath)).toBe(true);

      const content = readFileSync(tsconfigPath, 'utf-8');
      expect(() => JSON.parse(content)).not.toThrow();
    });

    it('should extend base config correctly', () => {
      const tsconfigPath = join(process.cwd(), 'tsconfig.server.json');
      const content = readFileSync(tsconfigPath, 'utf-8');
      const config = JSON.parse(content);

      expect(config.extends).toBe('./tsconfig.json');
    });

    it('should have CommonJS module and correct output directory', () => {
      const tsconfigPath = join(process.cwd(), 'tsconfig.server.json');
      const content = readFileSync(tsconfigPath, 'utf-8');
      const config = JSON.parse(content);

      expect(config.compilerOptions.module).toBe('CommonJS');
      expect(config.compilerOptions.outDir).toBe('./dist/server');
    });
  });

  describe('TypeScript Compilation', () => {
    it('should compile a sample TypeScript file without errors', () => {
      // This test verifies that TypeScript can compile successfully
      expect(() => {
        execSync('npx tsc -p tsconfig.server.json --noEmit', {
          cwd: process.cwd(),
          stdio: 'pipe',
        });
      }).not.toThrow();
    });
  });
});
