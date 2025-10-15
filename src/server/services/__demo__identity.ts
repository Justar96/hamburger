/**
 * Demo script for Identity Service
 * 
 * This file demonstrates the Identity Service functionality.
 * Run with: USER_ID_PEPPER="your-secret-pepper" tsx src/server/services/__demo__identity.ts
 */

import { IdentityService } from './identity.service';

// Set pepper for demo (in production, this comes from environment)
process.env.USER_ID_PEPPER = 'demo-pepper-should-be-long-and-random-in-production';

console.log('=== Identity Service Demo ===\n');

try {
  const identityService = new IdentityService();
  
  // Demo 1: Basic hashing
  console.log('1. Basic User ID Hashing:');
  const userId1 = 't2_user123';
  const hash1 = identityService.hashUserId(userId1);
  console.log(`   User ID: ${userId1}`);
  console.log(`   Hash:    ${hash1}`);
  console.log(`   Length:  ${hash1.length} characters\n`);
  
  // Demo 2: Deterministic hashing
  console.log('2. Deterministic Hashing (same input → same output):');
  const hash1a = identityService.hashUserId(userId1);
  const hash1b = identityService.hashUserId(userId1);
  console.log(`   First hash:  ${hash1a}`);
  console.log(`   Second hash: ${hash1b}`);
  console.log(`   Match:       ${hash1a === hash1b ? '✓ Yes' : '✗ No'}\n`);
  
  // Demo 3: Different users produce different hashes
  console.log('3. Different Users → Different Hashes:');
  const userId2 = 't2_user456';
  const hash2 = identityService.hashUserId(userId2);
  console.log(`   User 1: ${userId1} → ${hash1.substring(0, 16)}...`);
  console.log(`   User 2: ${userId2} → ${hash2.substring(0, 16)}...`);
  console.log(`   Different: ${hash1 !== hash2 ? '✓ Yes' : '✗ No'}\n`);
  
  // Demo 4: Hash verification
  console.log('4. Hash Verification:');
  const isValid = identityService.verifyHash(userId1, hash1);
  const isInvalid = identityService.verifyHash(userId2, hash1);
  console.log(`   Verify correct user:   ${isValid ? '✓ Valid' : '✗ Invalid'}`);
  console.log(`   Verify incorrect user: ${isInvalid ? '✗ Valid' : '✓ Invalid'}\n`);
  
  console.log('=== Demo Complete ===');
  
} catch (error) {
  console.error('Error:', error instanceof Error ? error.message : error);
  process.exit(1);
}
