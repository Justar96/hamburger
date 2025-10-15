# Requirements Document

## Introduction

Phase 3 implements the client-facing API endpoints that power the Beef interactive post experience. This phase builds on the completed data layer (Phase 1) and seeding engine (Phase 2) to provide the three core endpoints that the client application will use: `/api/init` for initial data loading, `/api/pick` for user word selection, and `/api/progress` for live updates.

These endpoints must handle user authentication via Devvit context, implement proper rate limiting to prevent abuse, validate all inputs rigorously, and provide structured error responses. The API design follows RESTful principles while optimizing for the specific needs of a collaborative daily voting game with real-time updates.

## Requirements

### Requirement 1: API Initialization Endpoint

**User Story:** As a client application, I want to fetch initial game state for a specific date, so that I can display the user's word options and current progress without multiple API calls.

#### Acceptance Criteria

1. WHEN GET /api/init?date=YYYY-MM-DD is called THEN it SHALL return a JSON response with seedPreview, myWords, progress, and timeLeftSec
2. WHEN the date parameter is valid THEN the system SHALL generate or retrieve the daily seed for that date
3. WHEN a user requests initialization THEN the system SHALL generate their personal word set using the seeding engine
4. WHEN progress data is requested THEN the system SHALL return the current top N words and their vote counts
5. WHEN time calculation is needed THEN the system SHALL compute seconds remaining until 23:00 Bangkok time
6. IF the date parameter is missing or invalid THEN the system SHALL return 400 Bad Request with error details
7. WHEN the response is generated THEN all data SHALL be properly typed and validated

### Requirement 2: Word Selection Endpoint

**User Story:** As a user, I want to submit my word choices for the daily vote, so that my selections are counted in the collaborative prompt generation.

#### Acceptance Criteria

1. WHEN POST /api/pick is called with valid words and date THEN it SHALL store the user's choices and increment vote tallies
2. WHEN word validation occurs THEN the system SHALL verify all submitted words are from the user's generated word set
3. WHEN choices are submitted THEN the system SHALL enforce the maximum selection limit (K words per user)
4. WHEN tallies are updated THEN the system SHALL use atomic Redis operations to prevent race conditions
5. WHEN the operation succeeds THEN the system SHALL return the accepted words and updated top words list
6. IF invalid words are submitted THEN the system SHALL return 400 Bad Request with INVALID_WORDS error code
7. WHEN idempotent behavior is required THEN multiple submissions with identical data SHALL not duplicate tallies

### Requirement 3: Progress Tracking Endpoint

**User Story:** As a client application, I want to fetch current voting progress and countdown information, so that I can display live updates to users.

#### Acceptance Criteria

1. WHEN GET /api/progress?date=YYYY-MM-DD is called THEN it SHALL return current top words, user's choices, and time remaining
2. WHEN top words are requested THEN the system SHALL return the current leaderboard from Redis sorted set
3. WHEN user choices are requested THEN the system SHALL return the user's previously submitted words (if any)
4. WHEN countdown is calculated THEN it SHALL use Bangkok timezone (UTC+7) for the 23:00 cutoff
5. WHEN the date is in the past THEN the system SHALL return final results with timeLeftSec as 0
6. IF the date parameter is invalid THEN the system SHALL return 400 Bad Request
7. WHEN caching is appropriate THEN the system SHALL set proper cache headers for performance

### Requirement 4: Rate Limiting and Abuse Prevention

**User Story:** As a system administrator, I want rate limiting on the pick endpoint, so that users cannot spam votes or overwhelm the system.

#### Acceptance Criteria

1. WHEN /api/pick is called THEN the system SHALL enforce a rate limit of 1 request per 3 seconds per user
2. WHEN rate limiting is applied THEN it SHALL use the user's hashed ID as the rate limit key
3. WHEN a user exceeds the rate limit THEN the system SHALL return 429 Too Many Requests
4. WHEN rate limit data is stored THEN it SHALL use Redis with appropriate TTL (5 seconds)
5. WHEN rate limit errors occur THEN the response SHALL include Retry-After header
6. WHEN /api/init and /api/progress are called THEN they SHALL NOT be rate limited (read-only operations)
7. WHEN rate limiting is bypassed THEN it SHALL only occur for test endpoints in development mode

### Requirement 5: Input Validation and Error Handling

**User Story:** As a developer, I want comprehensive input validation and structured error responses, so that client applications can handle errors gracefully.

#### Acceptance Criteria

1. WHEN date parameters are provided THEN they SHALL be validated against YYYY-MM-DD format
2. WHEN word arrays are submitted THEN they SHALL be validated as non-empty arrays of strings
3. WHEN word count limits are checked THEN the system SHALL enforce maximum K words per submission
4. WHEN validation fails THEN the system SHALL return 400 Bad Request with specific error codes
5. WHEN server errors occur THEN the system SHALL return 500 Internal Server Error with generic messages
6. WHEN errors are logged THEN they SHALL include request context (userId hash, date, operation)
7. WHEN error responses are sent THEN they SHALL follow consistent JSON structure with error codes

### Requirement 6: User Authentication and Context

**User Story:** As a security-conscious developer, I want proper user authentication via Devvit context, so that user actions are properly attributed and secured.

#### Acceptance Criteria

1. WHEN API endpoints are called THEN the system SHALL extract user ID from Devvit context
2. WHEN user ID is obtained THEN it SHALL be hashed using the IdentityService for privacy
3. WHEN user context is missing THEN the system SHALL return 401 Unauthorized
4. WHEN user operations are performed THEN they SHALL use the hashed user ID consistently
5. WHEN logging occurs THEN raw user IDs SHALL NOT appear in logs (only hashed versions)
6. WHEN test endpoints are used THEN they SHALL accept userId in request body for testing purposes
7. WHEN production endpoints are used THEN they SHALL NEVER accept userId in request body

### Requirement 7: Response Format Standardization

**User Story:** As a client developer, I want consistent response formats across all endpoints, so that I can handle API responses predictably.

#### Acceptance Criteria

1. WHEN successful responses are sent THEN they SHALL include appropriate data fields without wrapper objects
2. WHEN /api/init responds THEN it SHALL include: seedPreview (string), myWords (string[]), progress (object), timeLeftSec (number)
3. WHEN /api/pick responds THEN it SHALL include: ok (boolean), accepted (string[]), top (TallyData[])
4. WHEN /api/progress responds THEN it SHALL include: top (TallyData[]), my (string[]), timeLeftSec (number)
5. WHEN error responses are sent THEN they SHALL include: error (object) with code (string) and message (string)
6. WHEN timestamps are included THEN they SHALL use consistent format (Unix timestamps or ISO strings)
7. WHEN response validation occurs THEN TypeScript interfaces SHALL enforce correct structure

### Requirement 8: Performance and Caching

**User Story:** As a system operator, I want API endpoints to respond quickly under load, so that the user experience remains smooth during peak usage.

#### Acceptance Criteria

1. WHEN /api/init is called THEN it SHALL respond in under 100ms for cached data
2. WHEN /api/pick is called THEN it SHALL complete Redis operations in under 50ms
3. WHEN /api/progress is called THEN it SHALL respond in under 50ms
4. WHEN Redis operations are needed THEN the system SHALL use pipelines for multiple operations
5. WHEN word generation occurs THEN it SHALL use cached pools and lexicon data
6. WHEN performance degrades THEN the system SHALL log slow operations for investigation
7. WHEN concurrent requests occur THEN the system SHALL handle them without blocking

### Requirement 9: Integration with Existing Services

**User Story:** As a developer, I want seamless integration with the existing data layer and seeding engine, so that the API endpoints work correctly with the established architecture.

#### Acceptance Criteria

1. WHEN daily seeds are needed THEN the system SHALL use SeedingService.generateDailySeed()
2. WHEN user words are needed THEN the system SHALL use SeedingService.generateUserWords()
3. WHEN data operations are needed THEN the system SHALL use DataService methods
4. WHEN user identification is needed THEN the system SHALL use IdentityService.hashUserId()
5. WHEN telemetry is recorded THEN the system SHALL use TelemetryService for performance tracking
6. WHEN postData is generated THEN the system SHALL use PostDataService for /api/init responses
7. WHEN service errors occur THEN the system SHALL handle them gracefully and log appropriately

### Requirement 10: Development and Testing Support

**User Story:** As a developer, I want comprehensive testing capabilities for the API endpoints, so that I can verify functionality and debug issues effectively.

#### Acceptance Criteria

1. WHEN integration tests are run THEN they SHALL test all three main endpoints with real Redis
2. WHEN error scenarios are tested THEN they SHALL cover invalid inputs, rate limiting, and server errors
3. WHEN performance tests are run THEN they SHALL verify response time requirements
4. WHEN test data is used THEN it SHALL be cleaned up after each test to prevent interference
5. WHEN debugging is needed THEN the system SHALL provide detailed logging for request/response cycles
6. WHEN test endpoints exist THEN they SHALL be disabled in production environment
7. WHEN API documentation is needed THEN endpoint behavior SHALL be clearly documented with examples
