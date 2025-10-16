# Implementation Plan

- [x] 1. Create input validation module




  - Implement date format validation (YYYY-MM-DD) with proper error messages
  - Create word array validation (non-empty arrays of strings)
  - Add word count limit validation (max K words per submission)
  - Write validation result types and error code enums
  - _Requirements: 1.6, 2.6, 3.6, 5.1, 5.2, 5.3, 5.4_

- [x] 1.1 Write unit tests for validation functions





  - Test date format validation with valid and invalid inputs
  - Test word array validation edge cases
  - Test word count limits and boundary conditions
  - _Requirements: 5.1, 5.2, 5.3_

- [x] 2. Implement rate limiting service




  - Create Redis-based rate limiting for /api/pick endpoint (1 req per 3 seconds per user)
  - Use hashed user ID as rate limit key with 5-second TTL
  - Return structured rate limit results with retry-after information
  - Handle Redis connection failures gracefully
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 2.1 Write unit tests for rate limiting logic



  - Test rate limit enforcement and TTL behavior
  - Test Redis failure scenarios and graceful degradation
  - Test concurrent rate limit checks
  - _Requirements: 4.1, 4.2, 4.3_

- [x] 3. Create response formatter utility




  - Implement standardized success response formatting
  - Create structured error response formatting with consistent JSON structure
  - Add HTTP status code mapping for different error types
  - Include response timestamp and request tracing
  - _Requirements: 5.5, 5.6, 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 3.1 Write unit tests for response formatting



  - Test success response structure consistency
  - Test error response formatting with various error codes
  - Test HTTP status code mapping correctness
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 4. Implement /api/init endpoint





  - Extract user context from Devvit middleware and hash user ID
  - Generate or retrieve daily seed using SeedingService
  - Generate user's personal word set using seeding engine
  - Fetch current progress data (top words, vote counts)
  - Calculate time remaining until 23:00 Bangkok time
  - Return structured response with seedPreview, myWords, progress, timeLeftSec
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 6.1, 6.2, 9.1, 9.2_

- [x] 5. Implement /api/pick endpoint with validation





  - Extract and validate user context from Devvit middleware
  - Apply rate limiting (1 request per 3 seconds per user)
  - Validate request body (words array and date format)
  - Verify submitted words are from user's generated word set
  - Enforce maximum word count limit (K words per user)
  - Store user choices and increment vote tallies atomically
  - Return accepted words and updated top words list
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 4.1, 6.1, 6.2, 9.3, 9.4_

- [x] 6. Implement /api/progress endpoint




  - Extract user context and validate date parameter
  - Retrieve current top words from Redis sorted set
  - Get user's previously submitted choices (if any)
  - Calculate time remaining until cutoff (23:00 Bangkok)
  - Handle past dates by returning final results with timeLeftSec=0
  - Set appropriate cache headers for performance
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 6.1, 6.2, 9.3_

- [ ] 7. Create API router module
  - Set up Express router with JSON body parsing middleware
  - Add request logging and telemetry middleware
  - Wire up all three endpoints (/api/init, /api/pick, /api/progress)
  - Implement centralized error handling middleware
  - Add 404 handler for unknown API routes
  - _Requirements: 5.6, 6.6, 8.4, 9.5_

- [ ] 8. Integrate with existing server setup
  - Import and mount API router in main server index.ts
  - Ensure proper service instantiation and dependency injection
  - Maintain existing test endpoints for development mode
  - Add API endpoint telemetry integration
  - _Requirements: 6.6, 9.5, 9.6_

- [ ]* 8.1 Write integration tests for all endpoints
  - Test /api/init with real Redis and seeding service
  - Test /api/pick with rate limiting and validation scenarios
  - Test /api/progress with various date and user scenarios
  - Test error handling and response formatting
  - Test performance requirements (sub-100ms response times)
  - _Requirements: 1.7, 2.7, 3.7, 8.1, 8.2, 8.3, 10.1, 10.2, 10.3_

- [ ]* 8.2 Write API contract tests
  - Validate request/response schema compliance
  - Test error response structure consistency
  - Verify HTTP status code correctness
  - Test rate limiting behavior under load
  - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [ ] 9. Add comprehensive error handling
  - Implement proper error classification (4xx vs 5xx)
  - Add structured error logging with request context
  - Ensure no raw user IDs appear in logs (only hashed versions)
  - Handle service failures gracefully with appropriate HTTP status codes
  - Add request ID tracing for debugging
  - _Requirements: 5.5, 5.6, 6.5, 6.6_

- [ ] 10. Performance optimization and monitoring
  - Implement Redis pipeline usage for multiple operations
  - Add response time monitoring via TelemetryService
  - Cache word pools and lexicon data in memory
  - Optimize service instantiation to reduce overhead
  - Add performance logging for slow operations
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 9.6_

- [ ]* 10.1 Write performance tests
  - Test concurrent user scenarios
  - Verify response time targets (init <100ms, pick/progress <50ms)
  - Test Redis pipeline performance under load
  - Monitor memory usage patterns
  - _Requirements: 8.1, 8.2, 8.3, 10.3, 10.4_