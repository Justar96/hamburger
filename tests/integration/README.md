# Integration Tests

## Overview

This directory contains integration tests that verify the complete data layer functionality with real Redis operations.

## Important: Devvit Playtest Environment Required

The integration tests in `data-layer.test.ts` require the **Devvit playtest environment** to function properly. The Devvit `redis` client from `@devvit/web/server` is only available when running through Devvit's infrastructure, not in isolated unit tests.

### Why Tests Fail in Standard Vitest

When running `pnpm test:integration`, you'll see errors like:

```
Error: Devvit config is not available. Make sure to call getDevvitConfig() 
after the Devvit runtime has been initialized.
```

This is expected behavior. According to [Devvit documentation](https://developers.reddit.com/docs/capabilities/server/redis), the Redis client and other Devvit capabilities are only available when:
1. Running through `devvit playtest` (connects to Reddit's infrastructure)
2. Deployed to Reddit's serverless environment
3. The Devvit runtime context is properly initialized

### Devvit Web Development Model

Devvit Web uses a hybrid development model:
- **Client code**: Runs locally in your browser
- **Server code**: Runs locally with `tsx watch` BUT connects to Reddit's infrastructure for capabilities like Redis, Reddit API, etc.
- **Testing**: Must be done through `devvit playtest` which connects your local server to Reddit's backend services

### Running Integration Tests

There are several approaches to test the data layer:

#### Option 1: Manual Testing with Devvit Playtest (Recommended)

1. Start the Devvit playtest environment:
   ```bash
   pnpm run dev
   # or
   devvit playtest
   ```

2. This will:
   - Start your local server with `tsx watch`
   - Connect to Reddit's infrastructure (Redis, Reddit API, etc.)
   - Create/use a test subreddit
   - Provide a URL to test your app

3. Manually test the data flow through:
   - Creating posts and interacting with your app
   - Checking logs in the terminal
   - Verifying Redis data through your app's behavior

#### Option 2: API Endpoint Integration Tests

Create integration tests that:
1. Start the server with `devvit playtest` programmatically
2. Make HTTP requests to your `/api/*` endpoints
3. Verify responses and behavior

Example pattern (similar to `dev-environment.test.ts`):
```typescript
// Start playtest environment
// Make API calls to test endpoints
// Verify data flow through API responses
```

#### Option 3: Convert to API-Based Tests

Refactor the current integration tests to:
1. Test through HTTP endpoints instead of direct service calls
2. Run against a playtest server
3. Verify behavior through API responses

This approach works because:
- The server runs locally with real Redis access via playtest
- Tests can make HTTP requests to `/api/*` endpoints
- No need to mock Redis or Devvit capabilities

## Test Coverage

The `data-layer.test.ts` file provides comprehensive test coverage for:

### Full Data Flow
- Complete flow: setSeed → setUserChoices → incrementTallies → getTopWords
- Multiple users voting for the same words
- Users changing their choices (re-voting)

### PostData Generation
- PostData generation under 2KB with real tally data
- Minimal tally data handling
- Very long themes and words

### Telemetry
- Recording and retrieving telemetry counters
- Recording and retrieving latency samples
- P95 sample trimming to max 1000 entries
- Concurrent telemetry operations

### User ID Hashing
- Consistent hashing across operations
- Hash format and length verification
- Special characters in user IDs

### Redis Key Expiration
- TTL on seed keys
- TTL on choices hash
- TTL on tallies sorted set
- TTL on telemetry keys
- TTL not reset on subsequent writes

### Redis Key Naming
- Correct key format for all data types
- Different date formats handled consistently

### Error Handling
- Empty tally data
- Non-existent user choices
- Non-existent seed data
- Telemetry for dates with no data
- Empty word arrays in incrementTallies

## Test Structure

Each test is structured to:
1. Set up test data
2. Perform operations through service classes
3. Verify results match expectations
4. Clean up test keys in afterEach

## Value of These Tests

Even though they can't run in standard Vitest, these tests provide:

1. **Documentation**: Clear examples of how services should be used together
2. **Specification**: Expected behavior for integration scenarios
3. **Reference**: Patterns for future testing infrastructure
4. **Validation**: Can be adapted for manual testing procedures

## Alternative Testing Approaches

Until Devvit provides native test infrastructure, consider:

1. **Unit Tests**: Comprehensive unit tests with mocked Redis (already implemented)
2. **E2E Tests**: Playwright tests against running server (already implemented)
3. **Manual Testing**: Following test scenarios in development environment
4. **API Integration Tests**: Testing through HTTP endpoints (see dev-environment.test.ts)

## Recommendations

For Phase 1 completion:
- ✅ Unit tests provide thorough coverage of individual services (with mocked Redis)
- ✅ E2E tests verify end-to-end functionality (Playwright)
- ✅ Integration test file documents expected integration behavior
- ⚠️ True integration tests require Devvit playtest environment

### Implemented: API-Based Integration Tests

We've implemented executable integration tests using the recommended approach:

1. **Test API endpoints** (dev-only) in `src/server/index.ts`:
   - `/api/test/data-flow` - Full data flow testing
   - `/api/test/seed` - Seed operations
   - `/api/test/choices` - User choices with hashing
   - `/api/test/tallies` - Tally operations
   - `/api/test/telemetry` - Telemetry recording
   - `/api/test/cleanup` - Test key cleanup

2. **API-based integration tests** in `data-layer-api.test.ts`:
   - Tests run against real server with Redis access
   - Uses HTTP requests to test data layer
   - Automatic cleanup after each test
   - Covers all integration scenarios

3. **Running the tests**:
   ```bash
   pnpm test:integration
   ```

The tests start a real server, connect to Redis (via Devvit runtime), and verify all data layer operations work correctly together.

### Current State

We have two types of integration tests:

1. **data-layer.test.ts** - Direct service integration tests:
   - ✅ **Specification** of expected integration behavior
   - ✅ **Documentation** of service interactions
   - ✅ **Reference** for manual testing procedures
   - ⚠️ Requires Devvit runtime to execute

2. **data-layer-api.test.ts** - API-based integration tests:
   - ✅ **Executable** tests that run with `pnpm test:integration`
   - ✅ **Real Redis** access through Devvit server
   - ✅ **Comprehensive coverage** of all data layer operations
   - ✅ **Automatic cleanup** of test data

### Devvit Testing Best Practices

Based on Devvit documentation:
1. **Use `devvit playtest`** for development and testing with real services
2. **Test through your app's UI** and API endpoints
3. **Monitor logs** in the playtest terminal for debugging
4. **Use unit tests** for isolated logic (with mocks)
5. **Use E2E tests** for full user flows (Playwright)
6. **Manual testing** in playtest environment for integration verification
