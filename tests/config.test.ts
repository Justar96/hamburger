import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('devvit.json configuration', () => {
  const configPath = join(process.cwd(), 'devvit.json');
  let config: any;

  beforeAll(() => {
    const content = readFileSync(configPath, 'utf-8');
    config = JSON.parse(content);
  });

  it('should exist and be valid JSON', () => {
    expect(existsSync(configPath)).toBe(true);
    expect(config).toBeDefined();
  });

  it('should have required fields', () => {
    expect(config).toHaveProperty('name');
    expect(config).toHaveProperty('post');
    expect(config).toHaveProperty('server');
    expect(config).toHaveProperty('permissions');
  });

  it('should have valid post configuration', () => {
    expect(config.post).toHaveProperty('dir');
    expect(config.post).toHaveProperty('entrypoints');
    expect(config.post.entrypoints).toHaveProperty('default');
    expect(config.post.entrypoints.default).toHaveProperty('entry');
    expect(config.post.entrypoints.default).toHaveProperty('height');
  });

  it('should have post.entrypoints.default.entry pointing to existing file', () => {
    const entryFile = config.post.entrypoints.default.entry;
    const publicDir = config.post.dir;
    const fullPath = join(process.cwd(), publicDir, entryFile);
    
    expect(existsSync(fullPath), `Expected file to exist: ${fullPath}`).toBe(true);
  });

  it('should have correct server.entry path', () => {
    expect(config.server).toHaveProperty('entry');
    expect(config.server.entry).toBe('dist/server/index.js');
  });

  it('should have valid permissions structure', () => {
    expect(config.permissions).toHaveProperty('redis');
    expect(config.permissions).toHaveProperty('realtime');
    expect(config.permissions).toHaveProperty('media');
    
    expect(config.permissions.redis).toBe(true);
    expect(config.permissions.realtime).toBe(true);
    expect(config.permissions.media).toBe(true);
  });

  it('should have schema reference', () => {
    expect(config).toHaveProperty('$schema');
    expect(config.$schema).toContain('developers.reddit.com/schema');
  });

  it('should have triggers configuration', () => {
    expect(config).toHaveProperty('triggers');
    expect(config.triggers).toHaveProperty('onAppInstall');
    expect(config.triggers.onAppInstall).toBe('/internal/install');
  });

  it('should have dev configuration', () => {
    expect(config).toHaveProperty('dev');
    expect(config.dev).toHaveProperty('subreddit');
  });
});
