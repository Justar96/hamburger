# Requirements Document

## Introduction

Phase 1 builds the data layer foundation for the Beef application. This phase implements Redis-based data services for managing daily seeds, user choices, and vote tallies, along with utilities for postData generation and user identity hashing. The data layer must support deterministic operations, maintain data integrity, and provide efficient access patterns for the collaborative voting system. All Redis operations must be optimized using pipelines where appropriate, and postData must stay within the 2KB platform limit.

## Requirements

### Requirement 1: Redis Data Service

**User Story:** As a developer, I want a Redis-based data service that manages daily seeds, user choices, and vote tallies, so that the application can store and retrieve collaborative voting data efficiently.

#### Acceptance Criteria

1. WHEN DataService is created THEN it SHALL provide methods for getSeed, setSeed, setUserChoices, incrementTallies, and getTopWords
2. WHEN setSeed is called with date and seed data THEN it SHALL store the data in Redis key `seed:{date}`
3. WHEN getSeed is called with a date THEN it SHALL return the seed data or null if not found
4. WHEN setUserChoices is called THEN it SHALL store user word selections in Redis hash `choices:{date}`
5. WHEN incrementTallies is called with words THEN it SHALL increment counts in Redis sorted set `tallies:{date}`
6. WHEN getTopWords is called THEN it SHALL return the top N words from the tallies sorted set
7. WHEN multiple Redis operations are needed THEN the service SHALL use pipelines for efficiency
8. WHEN Redis operations fail THEN the service SHALL throw descriptive errors

### Requirement 2: User Identity Hashing

**User Story:** As a developer, I want to hash user IDs for privacy, so that user identities are protected while maintaining deterministic user-specific behavior.

#### Acceptance Criteria

1. WHEN a user ID is hashed THEN it SHALL use SHA256 algorithm
2. WHEN hashing occurs THEN it SHALL combine userId with a PEPPER environment variable
3. WHEN the same userId is hashed multiple times THEN it SHALL produce the same hash
4. WHEN different userIds are hashed THEN they SHALL produce different hashes
5. WHEN the PEPPER is not set THEN the system SHALL fail fast with a clear error message
6. WHEN hashed IDs are stored THEN they SHALL be used as keys in Redis
7. WHEN hashed IDs are logged THEN raw user IDs SHALL NOT appear in logs

### Requirement 3: PostData Writer Utility

**User Story:** As a developer, I want a utility that generates postData within the 2KB limit, so that the client can display initial content without additional API calls.

#### Acceptance Criteria

1. WHEN postData is generated THEN it SHALL include date, theme, seedPreview, teaserTop, and timeLeftSec
2. WHEN postData is serialized THEN the total size SHALL be ≤ 2000 bytes
3. WHEN postData exceeds 2KB THEN the utility SHALL truncate teaserTop array to fit
4. WHEN postData is created THEN all fields SHALL be properly typed
5. WHEN seedPreview is included THEN it SHALL be a truncated hex string (first 8 characters)
6. WHEN timeLeftSec is calculated THEN it SHALL be seconds remaining until 23:00 Bangkok time
7. WHEN postData is validated THEN it SHALL be valid JSON

### Requirement 4: Telemetry Service

**User Story:** As a developer, I want a telemetry service that tracks performance metrics, so that I can monitor application health and identify bottlenecks.

#### Acceptance Criteria

1. WHEN TelemetryService is created THEN it SHALL provide methods for incrementing counters and recording latencies
2. WHEN a counter is incremented THEN it SHALL store the value in Redis hash `telemetry:{date}`
3. WHEN a latency is recorded THEN it SHALL add the value to a p95 samples list
4. WHEN telemetry data is retrieved THEN it SHALL return current counters and calculated p95
5. WHEN p95 samples exceed 1000 entries THEN the service SHALL trim to the most recent 1000
6. WHEN telemetry operations fail THEN they SHALL NOT crash the application
7. WHEN /api/health is called THEN it SHALL increment a request counter via telemetry

### Requirement 5: Redis Connection Management

**User Story:** As a developer, I want reliable Redis connection management, so that the application can handle connection failures gracefully.

#### Acceptance Criteria

1. WHEN the server starts THEN it SHALL establish a Redis connection
2. WHEN REDIS_URL environment variable is set THEN it SHALL use that connection string
3. WHEN Redis connection fails THEN the server SHALL log the error and retry with exponential backoff
4. WHEN Redis is unavailable THEN critical endpoints SHALL return 503 Service Unavailable
5. WHEN Redis connection is restored THEN the service SHALL resume normal operations
6. WHEN the server shuts down THEN it SHALL close Redis connections gracefully
7. WHEN Redis commands timeout THEN they SHALL fail after 5 seconds

### Requirement 6: Data Model Type Definitions

**User Story:** As a developer, I want TypeScript interfaces for all data models, so that type safety is enforced throughout the codebase.

#### Acceptance Criteria

1. WHEN data models are defined THEN they SHALL include SeedData, UserChoices, TallyData, and PostData interfaces
2. WHEN SeedData is defined THEN it SHALL include seedHex, theme, and poolsVersion fields
3. WHEN UserChoices is defined THEN it SHALL be an array of word strings
4. WHEN TallyData is defined THEN it SHALL include word and count fields
5. WHEN PostData is defined THEN it SHALL match the postData writer output structure
6. WHEN types are used THEN TypeScript strict mode SHALL enforce type checking
7. WHEN invalid data is passed THEN TypeScript SHALL catch errors at compile time

### Requirement 7: Redis Key Naming Conventions

**User Story:** As a developer, I want consistent Redis key naming, so that data is organized and easy to query.

#### Acceptance Criteria

1. WHEN seed data is stored THEN the key SHALL be `seed:{date}` where date is YYYY-MM-DD
2. WHEN user choices are stored THEN the key SHALL be `choices:{date}` as a hash
3. WHEN tallies are stored THEN the key SHALL be `tallies:{date}` as a sorted set
4. WHEN telemetry is stored THEN the key SHALL be `telemetry:{date}` as a hash
5. WHEN keys are generated THEN date format SHALL be consistent (ISO 8601 date only)
6. WHEN keys are queried THEN pattern matching SHALL work predictably
7. WHEN old data is cleaned up THEN keys SHALL be deletable by date pattern

### Requirement 8: PostData Size Validation

**User Story:** As a developer, I want automated validation of postData size, so that I never exceed the 2KB platform limit.

#### Acceptance Criteria

1. WHEN postData is generated THEN its size SHALL be measured in bytes
2. WHEN size exceeds 2000 bytes THEN an error SHALL be thrown or data SHALL be truncated
3. WHEN teaserTop array is truncated THEN the most important words SHALL be kept
4. WHEN size is validated THEN UTF-8 encoding SHALL be used for measurement
5. WHEN postData is tested THEN unit tests SHALL verify size constraints
6. WHEN postData is logged THEN the size SHALL be included in debug output
7. WHEN postData is sent to client THEN it SHALL always be under 2KB
