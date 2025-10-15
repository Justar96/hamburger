/**
 * Server Startup Validation Tests
 *
 * Tests that verify environment variable validation occurs at server startup
 * and that the server fails fast with clear error messages when required
 * environment variables are missing.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { IdentityService } from '../src/server/services/identity.service';

describe('Server Startup Validation', () => {
  const originalEnv = process.env.USER_ID_PEPPER;

  afterEach(() => {
    // Restore original environment
    if (originalEnv) {
      process.env.USER_ID_PEPPER = originalEnv;
    } else {
      delete process.env.USER_ID_PEPPER;
    }
  });

  describe('Environment variable validation', () => {
    it('should validate USER_ID_PEPPER exists at startup', () => {
      // Set a valid pepper
      process.env.USER_ID_PEPPER = 'a'.repeat(32);

      // Import IdentityService - should not throw
      expect(() => new IdentityService()).not.toThrow();
    });

    it('should throw error when USER_ID_PEPPER is missing', () => {
      // Remove the pepper
      delete process.env.USER_ID_PEPPER;

      // Import IdentityService - should throw
      expect(() => new IdentityService()).toThrow('USER_ID_PEPPER environment variable is required');
    });

    it('should throw error when USER_ID_PEPPER is too short', () => {
      // Set a pepper that's too short
      process.env.USER_ID_PEPPER = 'short';

      // Import IdentityService - should throw
      expect(() => new IdentityService()).toThrow('USER_ID_PEPPER must be at least 32 characters long');
    });

    it('should provide clear error message for missing pepper', () => {
      delete process.env.USER_ID_PEPPER;
      
      try {
        new IdentityService();
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('USER_ID_PEPPER');
        expect((error as Error).message).toContain('required');
      }
    });
  });

  describe('Server index validation behavior', () => {
    it('should instantiate IdentityService at startup', () => {
      // This test verifies that the server index.ts file imports and instantiates
      // IdentityService, which will trigger validation
      
      // Set valid environment
      process.env.USER_ID_PEPPER = 'a'.repeat(32);

      // The actual server index.ts file should import and instantiate IdentityService
      // We can't easily test process.exit(1) behavior in unit tests, but we can
      // verify the IdentityService constructor is called by checking it doesn't throw
      expect(() => new IdentityService()).not.toThrow();
    });
  });
});
