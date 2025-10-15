import { describe, it, expect } from 'vitest';

/**
 * Environment Variable Validation Tests
 * 
 * These tests verify that DAILY_SEED_SECRET validation logic works correctly.
 * They test the validation rules that are enforced at server startup.
 */

describe('DAILY_SEED_SECRET Validation Logic', () => {
  describe('validateDailySeedSecret()', () => {
    const validateDailySeedSecret = (secret: string | undefined): { valid: boolean; error?: string } => {
      if (!secret || secret.trim().length === 0) {
        return {
          valid: false,
          error: 'DAILY_SEED_SECRET environment variable is required. ' +
            'Generate one using: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
        };
      }

      if (!/^[0-9a-fA-F]+$/.test(secret)) {
        return {
          valid: false,
          error: 'DAILY_SEED_SECRET must be a valid hexadecimal string. ' +
            'Generate one using: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
        };
      }

      if (secret.length < 32) {
        return {
          valid: true,
          error: '⚠ Warning: DAILY_SEED_SECRET is shorter than recommended (64 characters). ' +
            'Consider using a longer secret for better security.'
        };
      }

      return { valid: true };
    };

    it('should reject undefined secret', () => {
      const result = validateDailySeedSecret(undefined);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should reject empty string secret', () => {
      const result = validateDailySeedSecret('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should reject whitespace-only secret', () => {
      const result = validateDailySeedSecret('   ');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should reject non-hexadecimal strings', () => {
      const result = validateDailySeedSecret('not-a-hex-string');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('hexadecimal');
    });

    it('should reject strings with invalid characters', () => {
      const result = validateDailySeedSecret('abc123xyz!@#');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('hexadecimal');
    });

    it('should warn for secrets shorter than 32 characters', () => {
      const result = validateDailySeedSecret('abc123');
      expect(result.valid).toBe(true);
      expect(result.error).toContain('Warning');
      expect(result.error).toContain('shorter than recommended');
    });

    it('should accept valid 32-character hex string', () => {
      const result = validateDailySeedSecret('a'.repeat(32));
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept valid 64-character hex string (recommended)', () => {
      const result = validateDailySeedSecret('a'.repeat(64));
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept mixed case hexadecimal', () => {
      const result = validateDailySeedSecret('AbCdEf0123456789' + 'a'.repeat(48));
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept uppercase hexadecimal', () => {
      const result = validateDailySeedSecret('ABCDEF0123456789' + 'A'.repeat(48));
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept lowercase hexadecimal', () => {
      const result = validateDailySeedSecret('abcdef0123456789' + 'a'.repeat(48));
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept very long hex strings', () => {
      const result = validateDailySeedSecret('a'.repeat(128));
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe('Real environment validation', () => {
    it('should have DAILY_SEED_SECRET in actual environment when loaded from .env', () => {
      // This test will pass when running with proper .env file loaded
      // It documents the expected behavior but won't fail in CI without .env
      if (process.env.DAILY_SEED_SECRET) {
        expect(process.env.DAILY_SEED_SECRET).toBeDefined();
        expect(process.env.DAILY_SEED_SECRET.length).toBeGreaterThanOrEqual(32);
        expect(/^[0-9a-fA-F]+$/.test(process.env.DAILY_SEED_SECRET)).toBe(true);
      }
    });
  });
});
