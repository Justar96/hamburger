# Testing Guide

## Overview

This project uses a comprehensive testing strategy following Devvit's recommended approach:

1. **Unit Tests** - Test isolated logic with mocked dependencies
2. **Integration Tests** - Test component interactions (requires Devvit runtime)
3. **E2E Tests** - Test complete user flows with Playwright
4. **Manual Tests** - Verify integration in playtest environment

## Running Tests

### Unit Tests

```bash
# Run all unit tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run specific test file
pnpm vitest tests/data.test.ts
```

**Coverage**: 288 tests covering all services, utilities, and configurations.

### Integration Tests

Integration tests require the Devvit runtime for Redis access.

```bash
# Start Devvit playtest environment
pnpm run dev

# In another terminal, follow the manual testing guide
# See: tests/manual-integration-test.md
```

**Note**: The `pnpm test:integration` command will start a server but Redis operations will fail without the Devvit runtime. This is expected behavior.

### E2E Tests

```bash
# Run Playwright tests
pnpm test:e2e
```

### All Tests

```bash
# Run unit + integration + e2e tests
pnpm test:all
```

## Test Structure

```
tests/
├── unit tests (*.test.ts)          # Unit tests with mocked dependencies
├── integration/
│   ├── data-layer.test.ts          # Integration test specifications
│   ├── data-layer-api.test.ts      # API-based integration tests
│   ├── README.md                   # Integration testing approach
│   ├── SUMMARY.md                  # Implementation summary
│   └── DEVVIT_TESTING_NOTES.md     # Technical details
├── manual-integration-test.md      # Manual testing guide
└── e2e/                            # Playwright E2E tests
```

## Understanding Devvit Testing

### Why Integration Tests Need Devvit Runtime

The Devvit `redis` client requires the Devvit runtime to be initialized. This happens when:
- Running through `devvit playtest` (connects to Reddit's infrastructure)
- Deployed to Reddit's serverless environment

**This is by design** - Devvit Web uses a hybrid architecture where:
- Client code runs locally in your browser
- Server code runs locally BUT connects to Reddit's infrastructure for Redis, Reddit API, etc.

### Testing Philosophy

Following Devvit's official recommendations:

1. **Unit Tests** ✅ - Test business logic with mocks
2. **Playtest** ✅ - Manual testing with real services (recommended for integration)
3. **E2E Tests** ✅ - Test full user flows

Devvit does NOT provide isolated integration testing with real Redis outside of playtest.

## Test API Endpoints (Development Only)

When `NODE_ENV=development`, the server exposes test endpoints:

- `POST /api/test/data-flow` - Test complete data flow
- `POST /api/test/seed` - Test seed operations
- `POST /api/test/choices` - Test user choices with hashing
- `POST /api/test/tallies` - Test tally operations
- `POST /api/test/telemetry` - Test telemetry recording
- `POST /api/test/cleanup` - Clean up test keys

**Security**: These endpoints are automatically excluded from production builds.

## Manual Integration Testing

See `tests/manual-integration-test.md` for detailed curl commands and expected responses.

### Quick Start

1. Start the dev server:
   ```bash
   pnpm run dev
   ```

2. Test the full data flow:
   ```bash
   curl -X POST http://localhost:3000/api/test/data-flow \
     -H "Content-Type: application/json" \
     -d '{
       "date": "2025-10-15",
       "userId": "t2_testuser",
       "choices": ["neon", "rain", "alley"]
     }'
   ```

3. Verify the response shows:
   - `success: true`
   - `topWords` array with correct counts
   - `postData` under 2KB
   - `validation.valid: true`

## Writing New Tests

### Unit Tests

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('MyService', () => {
  it('should do something', () => {
    // Arrange
    const mockRedis = {
      get: vi.fn().mockResolvedValue('value'),
    };
    
    // Act
    const result = await myService.doSomething();
    
    // Assert
    expect(result).toBe('expected');
  });
});
```

### Integration Tests

Add test cases to `tests/integration/data-layer.test.ts` as specifications:

```typescript
it('should handle new scenario', async () => {
  // This test documents expected behavior
  // It will work when run in Devvit playtest environment
  
  trackKey(`mykey:${TEST_DATE}`);
  
  await dataService.doSomething(TEST_DATE);
  const result = await dataService.getSomething(TEST_DATE);
  
  expect(result).toEqual(expected);
});
```

### API-Based Tests

Add test cases to `tests/integration/data-layer-api.test.ts`:

```typescript
it('should test via API', async () => {
  const response = await fetch(`${SERVER_URL}/api/test/endpoint`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: 'test' }),
  });
  
  expect(response.ok).toBe(true);
  const data = await response.json();
  expect(data.success).toBe(true);
});
```

## Troubleshooting

### "Devvit config is not available" Error

**Cause**: Redis operations require Devvit runtime  
**Solution**: Run tests through `pnpm run dev` (playtest environment)

### Integration Tests Fail in CI

**Expected**: Integration tests with real Redis cannot run in CI  
**Solution**: Use unit tests for CI, manual testing for integration verification

### Test Endpoints Return 404

**Cause**: Server not in development mode  
**Solution**: Ensure `NODE_ENV=development` is set

## Best Practices

1. **Write unit tests first** - Fast feedback, easy to debug
2. **Use integration tests as specifications** - Document expected behavior
3. **Test through playtest** - Verify real integration manually
4. **Keep tests focused** - One concept per test
5. **Clean up test data** - Use the cleanup endpoint after manual testing

## CI/CD Integration

The CI pipeline runs:
- ✅ Unit tests (all 288 tests)
- ✅ TypeScript compilation
- ✅ Linting and formatting
- ✅ Build validation
- ⚠️ Integration tests (will show Redis errors - this is expected)

Integration verification happens through:
- Manual testing in playtest environment
- E2E tests against running server
- Production deployment testing

## Resources

- [Devvit Testing Documentation](https://developers.reddit.com/docs/guides/tools/playtest)
- [Integration Testing Summary](../tests/integration/SUMMARY.md)
- [Manual Testing Guide](../tests/manual-integration-test.md)
- [Technical Notes](../tests/integration/DEVVIT_TESTING_NOTES.md)
