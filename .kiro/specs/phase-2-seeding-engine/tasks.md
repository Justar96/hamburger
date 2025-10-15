# Implementation Plan

- [x] 1. Create seeding type definitions and data structures



  - Create src/server/types/seeding.types.ts with WordPools, Theme, Slot, LexiconMap, and WordMetadata interfaces
  - Ensure all fields are properly typed with no 'any' types
  - Add JSDoc comments explaining each interface
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 2. Create word pool and lexicon data files






  - [x] 2.1 Create data/pools.v1.json with initial theme

    - Create "nocturnal-cities" theme with 5 semantic slots (subject, action, setting, mood, modifier)
    - Include at least 50 safe, curated words total across all slots
    - Add cluster tags for each word to enable diversity enforcement
    - Ensure JSON is valid and follows the schema from design.md
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_


  - [x] 2.2 Create data/lexicon.map.json with word metadata

    - Map each word from pools.v1.json to its canonical form, slot, and cluster
    - Ensure all words in pools have corresponding lexicon entries
    - Validate JSON structure matches LexiconMap interface
    - _Requirements: 3.2, 3.5_

- [x] 3. Implement CryptoService for seed generation






  - [x] 3.1 Create src/server/services/crypto.service.ts

    - Implement constructor that validates secret parameter
    - Implement generateDailySeed() using HMAC-SHA256 with date string
    - Implement generateUserSeed() using HMAC-SHA256 with dailySeed and userId
    - Implement seedToInt64() to convert hex seed to BigInt for PRNG
    - Use Node's built-in crypto module (no external dependencies)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.7_

  - [x] 3.2 Write unit tests for CryptoService






    - Test generateDailySeed() is deterministic (same date → same seed)
    - Test generateUserSeed() is deterministic (same user+date → same seed)
    - Test different dates produce different daily seeds
    - Test different users produce different user seeds
    - Test seedToInt64() correctly converts hex to BigInt
    - Test constructor throws error when secret is empty
    - Test seed output is 64-character hex string
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.7_

- [-] 4. Implement PRNG (SplitMix64 + Xoroshiro128+)


  - [x] 4.1 Create src/server/services/prng.service.ts



    - Implement constructor that initializes state using SplitMix64
    - Implement splitMix64Init() private method for state initialization
    - Implement next() private method using Xoroshiro128+ algorithm
    - Implement rotl() helper for bitwise rotation
    - Implement nextUint() to return 32-bit unsigned integer
    - Implement nextFloat() to return float in [0, 1)
    - Implement shuffle() using Fisher-Yates algorithm
    - Implement choice() to select random element from array
    - Use BigInt for all 64-bit operations to avoid precision loss
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [x] 4.2 Write unit tests for PRNG






    - Test same seed produces identical sequence of random numbers
    - Test nextUint() returns values in valid range (0 to 2^32-1)
    - Test nextFloat() returns values in [0, 1) range
    - Test shuffle() produces valid permutations (all elements present)
    - Test choice() returns element from input array
    - Test choice() throws error on empty array
    - Test statistical distribution (chi-square test for nextUint)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

- [-] 5. Implement word selection algorithms


  - [-] 5.1 Create src/server/services/word-selection.service.ts

    - Implement selectSlotCoverage() to ensure 1+ word per semantic slot
    - Implement selectWithDiversity() to enforce 1-per-cluster constraint
    - Implement selectWildcards() to add 2-3 random wildcard words
    - Implement getAllWords() helper to flatten theme into word array
    - Ensure all methods use PRNG for randomization (no Math.random)
    - Maintain determinism (same PRNG state → same selections)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

  - [ ]* 5.2 Write unit tests for word selection algorithms
    - Test selectSlotCoverage() includes at least one word from each slot
    - Test selectSlotCoverage() respects cluster constraints
    - Test selectWithDiversity() enforces 1-per-cluster rule
    - Test selectWildcards() doesn't duplicate existing words
    - Test selectWildcards() respects cluster constraints
    - Test determinism (same PRNG seed → same selections)
    - Test graceful degradation when pool is smaller than target count
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

- [ ] 6. Implement SeedingService orchestrator
  - [ ] 6.1 Create src/server/services/seeding.service.ts
    - Implement constructor that validates DAILY_SEED_SECRET environment variable
    - Implement loadPools() to read and parse data/pools.v1.json at startup
    - Implement loadLexicon() to read and parse data/lexicon.map.json at startup
    - Implement generateDailySeed() that creates SeedData and stores in Redis
    - Implement generateUserWords() that orchestrates full word generation flow
    - Implement selectDailyTheme() to deterministically choose theme from seed
    - Implement validateDate() and validateInputs() for input validation
    - Implement getTheme() helper to retrieve theme by name
    - Cache pools and lexicon in memory (load once at startup)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 3.6, 3.7, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [ ]* 6.2 Write unit tests for SeedingService
    - Test constructor throws error when DAILY_SEED_SECRET is missing
    - Test constructor throws error when pool files are missing
    - Test generateDailySeed() creates valid SeedData structure
    - Test generateUserWords() returns array of correct length
    - Test generateUserWords() is deterministic (same user+date → same words)
    - Test generateUserWords() produces different words for different users
    - Test generateUserWords() produces different words for different dates
    - Test validateDate() rejects invalid date formats
    - Test validateInputs() rejects invalid userId (empty/null)
    - Test validateInputs() rejects invalid count (≤0 or >100)
    - Test selectDailyTheme() is deterministic
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 10.1, 10.2, 10.3, 10.4, 10.5_

- [ ] 7. Add DAILY_SEED_SECRET to environment configuration
  - Add DAILY_SEED_SECRET to .env.example with documentation
  - Generate a secure random 64-character hex string for local .env
  - Document that this value must be consistent across deployments
  - Add validation at server startup (fail fast if missing)
  - _Requirements: 1.5, 1.6, 10.1_

- [ ] 8. Integrate SeedingService with server startup
  - Import SeedingService in src/server/index.ts
  - Instantiate SeedingService at startup (triggers validation)
  - Add error handling for startup failures (missing env vars, pool files)
  - Log successful initialization with pools version
  - _Requirements: 3.6, 10.1, 10.2_

- [ ] 9. Add logging and debugging capabilities
  - Add structured logging to generateDailySeed() (date, seedPreview)
  - Add structured logging to generateUserWords() (userIdHash, date, count)
  - Add debug logging for word selection (slots, clusters, wildcards)
  - Add error logging with full context (operation, inputs, timestamp)
  - Ensure no raw user IDs are logged (use hashed IDs only)
  - Add optional DEBUG_SEEDING environment variable for verbose logging
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 10.6_

- [ ] 10. Write integration tests for full seeding flow
  - [ ] 10.1 Create tests/integration/seeding.test.ts
    - Test full flow: generateDailySeed → store in Redis → generateUserWords
    - Test seed persistence (generate → retrieve from Redis → verify match)
    - Test determinism across service restarts (same inputs → same outputs)
    - Test multiple users on same date produce different word sets
    - Test same user on different dates produces different word sets
    - Test word sets respect slot coverage (all slots represented)
    - Test word sets respect cluster diversity (no duplicate clusters)
    - Test performance (1000 word sets in <150ms)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.5, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

- [ ] 11. Performance validation and optimization
  - [ ] 11.1 Create tests/performance/seeding.perf.test.ts
    - Test single word set generation completes in <1ms
    - Test 1000 word sets complete in <150ms total
    - Test memory usage remains stable (no leaks)
    - Test pool/lexicon loading time at startup
    - Profile PRNG operations (nextUint, nextFloat, shuffle)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

- [ ] 12. Documentation and code review
  - Add JSDoc comments to all public methods in all services
  - Document PRNG algorithm choice and statistical properties
  - Document word selection algorithms and their guarantees
  - Update README with DAILY_SEED_SECRET setup instructions
  - Create SEEDING.md documentation explaining determinism and auditability
  - Document pool/lexicon file formats and versioning strategy
  - Add inline comments for complex bitwise operations in PRNG
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_

- [ ] 13. Error handling verification
  - Verify startup fails gracefully with clear error messages when:
    - DAILY_SEED_SECRET is missing
    - Pool files are missing or malformed
    - Lexicon file is missing or malformed
  - Verify runtime errors include full context (operation, inputs, timestamp)
  - Verify Redis failures during seed storage are logged but don't crash
  - Verify all validation errors have descriptive messages
  - Test error recovery scenarios (missing theme, empty slots, etc.)
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_
