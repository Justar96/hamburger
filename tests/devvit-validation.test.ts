import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('Devvit Configuration Validation', () => {
  const devvitJsonPath = join(process.cwd(), 'devvit.json');
  let config: any;

  it('should have a valid devvit.json file', () => {
    expect(existsSync(devvitJsonPath)).toBe(true);
    
    const content = readFileSync(devvitJsonPath, 'utf-8');
    expect(() => {
      config = JSON.parse(content);
    }).not.toThrow();
  });

  it('should reference the correct schema', () => {
    const content = readFileSync(devvitJsonPath, 'utf-8');
    config = JSON.parse(content);
    
    expect(config.$schema).toBe('https://developers.reddit.com/schema/config-file.v1.json');
  });

  it('should have required top-level properties', () => {
    const content = readFileSync(devvitJsonPath, 'utf-8');
    config = JSON.parse(content);
    
    expect(config.name).toBeDefined();
    expect(config.name).toBe('choice-chorus');
    expect(config.post).toBeDefined();
    expect(config.server).toBeDefined();
    expect(config.permissions).toBeDefined();
  });

  describe('Post Configuration', () => {
    it('should have valid post configuration', () => {
      const content = readFileSync(devvitJsonPath, 'utf-8');
      config = JSON.parse(content);
      
      expect(config.post.dir).toBe('public');
      expect(config.post.entrypoints).toBeDefined();
      expect(config.post.entrypoints.default).toBeDefined();
    });

    it('should reference existing post entrypoint file', () => {
      const content = readFileSync(devvitJsonPath, 'utf-8');
      config = JSON.parse(content);
      
      const entryFile = config.post.entrypoints.default.entry;
      expect(entryFile).toBe('index.html');
      
      const entryPath = join(process.cwd(), config.post.dir, entryFile);
      expect(existsSync(entryPath)).toBe(true);
    });

    it('should have correct post height configuration', () => {
      const content = readFileSync(devvitJsonPath, 'utf-8');
      config = JSON.parse(content);
      
      expect(config.post.entrypoints.default.height).toBe('tall');
    });
  });

  describe('Server Configuration', () => {
    it('should have valid server entry point', () => {
      const content = readFileSync(devvitJsonPath, 'utf-8');
      config = JSON.parse(content);
      
      expect(config.server.entry).toBe('dist/server/index.js');
    });

    it('should reference existing compiled server file', () => {
      const content = readFileSync(devvitJsonPath, 'utf-8');
      config = JSON.parse(content);
      
      const serverPath = join(process.cwd(), config.server.entry);
      expect(existsSync(serverPath)).toBe(true);
    });
  });

  describe('Permissions Configuration', () => {
    it('should have correctly configured permissions', () => {
      const content = readFileSync(devvitJsonPath, 'utf-8');
      config = JSON.parse(content);
      
      expect(config.permissions.redis).toBe(true);
      expect(config.permissions.realtime).toBe(true);
      expect(config.permissions.media).toBe(true);
    });

    it('should have http permissions disabled', () => {
      const content = readFileSync(devvitJsonPath, 'utf-8');
      config = JSON.parse(content);
      
      expect(config.permissions.http).toBeDefined();
      expect(config.permissions.http.enable).toBe(false);
    });

    it('should have reddit permissions disabled', () => {
      const content = readFileSync(devvitJsonPath, 'utf-8');
      config = JSON.parse(content);
      
      expect(config.permissions.reddit).toBeDefined();
      expect(config.permissions.reddit.enable).toBe(false);
    });
  });

  describe('Triggers Configuration', () => {
    it('should have onAppInstall trigger configured', () => {
      const content = readFileSync(devvitJsonPath, 'utf-8');
      config = JSON.parse(content);
      
      expect(config.triggers).toBeDefined();
      expect(config.triggers.onAppInstall).toBe('/internal/install');
    });

    it('should use correct endpoint namespace for triggers', () => {
      const content = readFileSync(devvitJsonPath, 'utf-8');
      config = JSON.parse(content);
      
      // Internal routes should start with /internal/
      expect(config.triggers.onAppInstall).toMatch(/^\/internal\//);
    });
  });

  describe('Schema Compliance', () => {
    it('should not have JSON syntax errors', () => {
      const content = readFileSync(devvitJsonPath, 'utf-8');
      
      // Check for common JSON errors
      expect(content).not.toMatch(/,\s*[}\]]/); // No trailing commas
      
      // Check for comments (but exclude URLs with //)
      const lines = content.split('\n');
      const hasComments = lines.some(line => {
        const trimmed = line.trim();
        // Skip lines that are part of URLs
        if (trimmed.includes('http://') || trimmed.includes('https://')) {
          return false;
        }
        // Check for actual comments
        return trimmed.startsWith('//') || trimmed.includes('/*');
      });
      expect(hasComments).toBe(false);
    });

    it('should have valid structure for Devvit Web', () => {
      const content = readFileSync(devvitJsonPath, 'utf-8');
      config = JSON.parse(content);
      
      // Must have at least one of: post, server, or blocks
      const hasComponent = config.post || config.server || config.blocks;
      expect(hasComponent).toBeTruthy();
      
      // If triggers exist, server must exist
      if (config.triggers) {
        expect(config.server).toBeDefined();
      }
    });
  });

  describe('File References', () => {
    it('should have all referenced files exist', () => {
      const content = readFileSync(devvitJsonPath, 'utf-8');
      config = JSON.parse(content);
      
      // Check post entrypoint
      const postDir = config.post.dir;
      const postEntry = config.post.entrypoints.default.entry;
      const postPath = join(process.cwd(), postDir, postEntry);
      expect(existsSync(postPath)).toBe(true);
      
      // Check server entry
      const serverPath = join(process.cwd(), config.server.entry);
      expect(existsSync(serverPath)).toBe(true);
    });
  });
});
