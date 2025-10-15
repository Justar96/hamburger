# Requirements Document

## Introduction

Phase 2 implements the deterministic seeding engine that generates unique, auditable word sets for each user on each day. This is the core mechanic of Beef - ensuring every user gets a fair, random selection of words while maintaining complete determinism for auditability and debugging.

The seeding engine uses cryptographic HMAC for seed generation, implements a high-quality PRNG (SplitMix64/Xoroshiro128+), and applies sophisticated word selection algorithms to ensure balanced coverage across semantic slots and taxonomic clusters. This phase delivers the word pools, lexicon mapping, and the SeedingService that orchestrates per-user word generation.

## Requirements

### Requirement 1: Cryptographic Seed Generation

**User Story:** As a system administrator, I want deterministic daily and per-user seeds generated using cryptographic functions, so that word generation is reproducible and auditable.

#### Acceptance Criteria

1. WHEN a daily seed is requested for a specific date THEN the system SHALL generate an HMAC-SHA256 hash using a secret key and the date string (YYYY-MM-DD format)
2. WHEN a user seed is requested for a specific user and date THEN the system SHALL generate an HMAC-SHA256 hash using the daily seed and the user ID
3. IF the same date is provided multiple times THEN the system SHALL return the identical daily seed
4. IF the same user ID and date are provided multiple times THEN the system SHALL return the identical user seed
5. WHEN generating seeds THEN the system SHALL use the DAILY_SEED_SECRET environment variable as the cryptographic key
6. IF DAILY_SEED_SECRET is missing or empty THEN the system SHALL throw an error at startup
7. WHEN a seed is generated THEN it SHALL be returned as a hexadecimal string

### Requirement 2: High-Quality PRNG Implementation

**User Story:** As a developer, I want a high-quality pseudo-random number generator seeded deterministically, so that word selection is both random-feeling and reproducible.

#### Acceptance Criteria

1. WHEN the PRNG is initialized with a seed THEN it SHALL use SplitMix64 for state initialization
2. WHEN random numbers are generated THEN the system SHALL use Xoroshiro128+ algorithm for generation
3. WHEN nextUint() is called THEN it SHALL return a uniformly distributed 32-bit unsigned integer
4. WHEN nextFloat() is called THEN it SHALL return a uniformly distributed float between 0.0 (inclusive) and 1.0 (exclusive)
5. IF the same seed is provided THEN the PRNG SHALL produce the identical sequence of random numbers
6. WHEN shuffle() is called on an array THEN it SHALL use Fisher-Yates algorithm with the PRNG
7. WHEN choice() is called on an array THEN it SHALL return a uniformly random element using the PRNG

### Requirement 3: Word Pools and Taxonomy

**User Story:** As a content curator, I want structured word pools organized by semantic slots and taxonomic clusters, so that generated word sets are balanced and thematically coherent.

#### Acceptance Criteria

1. WHEN the system starts THEN it SHALL load word pools from `data/pools.v1.json`
2. WHEN the system starts THEN it SHALL load lexicon mappings from `data/lexicon.map.json`
3. WHEN pools are loaded THEN they SHALL contain at least 50 safe, curated words
4. WHEN pools are loaded THEN words SHALL be organized by semantic slots (e.g., "subject", "action", "setting", "mood", "modifier")
5. WHEN pools are loaded THEN words SHALL be tagged with taxonomic clusters for diversity enforcement
6. IF pool files are missing or malformed THEN the system SHALL throw an error at startup
7. WHEN pools are accessed THEN they SHALL be cached in memory for performance

### Requirement 4: Slot Coverage Algorithm

**User Story:** As a game designer, I want word selection to cover all semantic slots, so that users receive a balanced set of words across different categories.

#### Acceptance Criteria

1. WHEN generating a word set THEN the system SHALL ensure at least one word from each semantic slot is included
2. WHEN selecting words for a slot THEN the system SHALL use the user-specific PRNG for randomization
3. IF a slot has fewer words than required THEN the system SHALL include all available words from that slot
4. WHEN multiple slots need words THEN the system SHALL process slots in a deterministic order
5. WHEN slot coverage is complete THEN remaining word budget SHALL be filled with additional random selections
6. IF the total word pool is smaller than the target count THEN the system SHALL return all available words without duplication
7. WHEN slot coverage is applied THEN the system SHALL maintain determinism (same seed → same result)

### Requirement 5: Taxonomic Diversity (1-per-cluster)

**User Story:** As a game designer, I want to enforce taxonomic diversity by selecting at most one word per cluster, so that word sets feel varied and avoid semantic redundancy.

#### Acceptance Criteria

1. WHEN selecting words THEN the system SHALL track which taxonomic clusters have been used
2. WHEN a word is selected THEN the system SHALL mark its cluster as used
3. IF a word's cluster is already used THEN the system SHALL skip that word and try the next candidate
4. WHEN all words in a cluster are exhausted THEN the system SHALL allow selection from other clusters
5. WHEN applying cluster constraints THEN the system SHALL maintain determinism
6. IF cluster metadata is missing for a word THEN the system SHALL treat it as belonging to a unique cluster
7. WHEN diversity enforcement is complete THEN the final word set SHALL have maximum cluster variety

### Requirement 6: Wildcard Word Selection

**User Story:** As a game designer, I want a small number of wildcard words added to each user's set, so that there's an element of surprise and variety beyond structured selection.

#### Acceptance Criteria

1. WHEN generating a word set THEN the system SHALL add 2-3 wildcard words
2. WHEN selecting wildcard words THEN they SHALL be chosen randomly from the entire pool using the user PRNG
3. WHEN selecting wildcard words THEN they SHALL respect the 1-per-cluster constraint
4. IF wildcard selection would duplicate an existing word THEN the system SHALL skip and try another
5. WHEN wildcard selection is complete THEN the total word count SHALL not exceed the target (K words)
6. WHEN wildcards are added THEN the system SHALL maintain determinism
7. IF the word pool is too small for wildcards THEN the system SHALL skip wildcard addition gracefully

### Requirement 7: SeedingService API

**User Story:** As a backend developer, I want a clean service API for generating word sets, so that I can easily integrate seeding into API endpoints.

#### Acceptance Criteria

1. WHEN SeedingService is instantiated THEN it SHALL validate DAILY_SEED_SECRET exists
2. WHEN generateDailySeed(date) is called THEN it SHALL return a SeedData object with seedHex, theme, poolsVersion, and createdAt
3. WHEN generateUserWords(userId, date, count) is called THEN it SHALL return an array of exactly `count` words (or fewer if pool is small)
4. WHEN generateUserWords is called THEN it SHALL use the daily seed and user ID to create a user-specific seed
5. WHEN generateUserWords is called THEN it SHALL apply slot coverage, cluster diversity, and wildcard selection
6. IF count parameter is invalid (≤0 or >100) THEN the system SHALL throw an error
7. WHEN the same userId and date are provided THEN generateUserWords SHALL return identical word arrays

### Requirement 8: Performance Requirements

**User Story:** As a system operator, I want word generation to be fast, so that API endpoints respond quickly under load.

#### Acceptance Criteria

1. WHEN generating 1000 word sets THEN the total time SHALL be less than 150ms
2. WHEN generating a single word set THEN the average time SHALL be less than 1ms
3. WHEN pools are loaded THEN they SHALL be cached in memory to avoid repeated file I/O
4. WHEN PRNG operations are performed THEN they SHALL use efficient bitwise operations
5. WHEN word selection occurs THEN it SHALL minimize array allocations and copies
6. IF performance degrades THEN the system SHALL log warnings for investigation
7. WHEN under load THEN memory usage SHALL remain stable (no leaks)

### Requirement 9: Auditability and Debugging

**User Story:** As a developer, I want detailed logging and debugging capabilities, so that I can troubleshoot word generation issues and verify determinism.

#### Acceptance Criteria

1. WHEN generateDailySeed is called THEN it SHALL log the date and first 8 characters of the seed
2. WHEN generateUserWords is called THEN it SHALL log the userId hash, date, and word count
3. WHEN word selection completes THEN it SHALL log the selected words and their slots/clusters
4. IF an error occurs during generation THEN the system SHALL log the full error with context
5. WHEN debugging mode is enabled THEN the system SHALL log intermediate PRNG states
6. WHEN seeds are generated THEN they SHALL be stored in Redis via DataService for audit trails
7. IF determinism fails (same input → different output) THEN the system SHALL log a critical error

### Requirement 10: Error Handling and Validation

**User Story:** As a system operator, I want robust error handling, so that invalid inputs don't crash the service.

#### Acceptance Criteria

1. IF DAILY_SEED_SECRET is missing THEN the system SHALL throw an error at startup with a clear message
2. IF pool files are missing or malformed THEN the system SHALL throw an error at startup
3. IF an invalid date format is provided THEN the system SHALL throw an error with format requirements
4. IF an invalid userId is provided (empty or null) THEN the system SHALL throw an error
5. IF word count is out of bounds THEN the system SHALL throw an error with valid range
6. WHEN errors occur THEN they SHALL include context (date, userId, operation) for debugging
7. IF Redis operations fail during seed storage THEN the system SHALL log the error but not throw (graceful degradation)
