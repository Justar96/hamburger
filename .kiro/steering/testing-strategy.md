# Testing Strategy Guide

## Overview

This document provides guidance on when to use different testing approaches in the Kiro Hackathon project (Devvit Web application). Understanding these distinctions is critical for effective testing in a Devvit environment.

## Quick Decision Tree

```
┌─ Need to test...
│
├─ Pure logic/algorithms (no I/O)?
│  └─→ Use UNIT TESTS (vitest with mocks)
│
├─ Service integration (Redis, multiple services)?
│  ├─ Can mock Redis?
│  │  └─→ Use UNIT TESTS (vitest with mocks)
│  └─ Need real Redis?
│     └─→ Use INTEGRATION TESTS (API-based with dev server)
│
├─ Full user flow (browser interaction)?
│  └─→ Use E2E TESTS (Playwright)
│
└─ Seeding engine behavior?
   ├─ Algorithm correctness?
   │  └─→ Use UNIT TESTS (with TestSeedingService)
   └─ Cluster diversity + real Redis?
      └─→ Use INTEGRATION TESTS (API endpoints)
```

## Test Types

### 1. Unit Tests (Vitest)

**When to Use:**
- Testing isolated functions/classes
- Pure algorithmic logic
- Service methods with mocked dependencies
- Fast feedback during development
- CI/CD pipeline

**Characteristics:**
- ✅ Fast execution (<1s for entire suite)
- ✅ No external dependencies
- ✅ Run in any environment
- ✅ Great for TDD
- ❌ Don't test integration points

**Examples:**
```typescript
// Good for unit tests
describe('CryptoService', () => {
  it('generates deterministic seed from date', () => {
    const service = new CryptoService();
    const seed1 = service.generateSeed('2025-10-15');
    const seed2 = service.generateSeed('2025-10-15');
    expect(seed1).toBe(seed2); // Deterministic
  });
});

// Good for unit tests with mocks
describe('DataService', () => {
  it('stores seed in Redis', async () => {
    const mockRedis = {
      set: vi.fn().mockResolvedValue('OK'),
    };
    const service = new DataService(mockRedis as any);
    await service.setSeed('2025-10-15', seedData);
    expect(mockRedis.set).toHaveBeenCalledWith(
      'seed:2025-10-15',
      expect.any(String)
    );
  });
});
```

**Location:** `src/**/*.test.ts`, `tests/*.test.ts`

**Run Command:**
```bash
pnpm test                # Run all unit tests
pnpm test:watch          # Watch mode for development
pnpm test path/to/file   # Run specific test file
```

**Configuration:** `vitest.config.ts` (excludes integration/e2e)

---

### 2. Integration Tests (API-Based)

**When to Use:**
- Testing service interactions
- Verifying data flows between components
- Testing with real Redis (via Devvit runtime)
- Validating API endpoints
- Testing seeding engine with cluster diversity

**Characteristics:**
- ⚡ Medium speed (< 1s for 33 tests)
- ⚠️ Requires dev server running
- ✅ Tests real service integration
- ✅ Uses actual Redis (through Devvit mock context)
- ❌ Requires two terminals (server + tests)

**Devvit Constraint:**
Integration tests in Devvit projects MUST use HTTP API endpoints because:
- Redis is provided by Devvit runtime, not a local instance
- Direct service imports fail without Devvit context
- API testing simulates real production usage

**Examples:**
```typescript
// Integration test structure
describe('Seeding Engine Integration', () => {
  let testKeys: string[];

  beforeEach(() => {
    testKeys = [];
  });

  afterEach(async () => {
    // Cleanup via API
    await fetch(`${SERVER_URL}/api/test/cleanup`, {
      method: 'POST',
      body: JSON.stringify({ keys: testKeys }),
    });
  });

  it('should complete full flow', async () => {
    trackKey('seed:2025-10-15');

    // Generate seed via API
    const seedResponse = await fetch(
      `${SERVER_URL}/api/test/seeding/generate-seed`,
      {
        method: 'POST',
        body: JSON.stringify({ date: '2025-10-15' }),
      }
    );

    const { seedData } = await seedResponse.json();
    expect(seedData.seedHex).toHaveLength(64);
  });
});
```

**Location:** `tests/integration/**/*.test.ts`

**Run Command:**
```bash
# Terminal 1: Start dev server
pnpm run dev

# Terminal 2: Run integration tests
pnpm run test:integration

# Or run specific file
pnpm vitest run tests/integration/seeding.test.ts --config vitest.integration.config.ts
```

**Configuration:** `vitest.integration.config.ts` (30s timeout, includes only integration tests)

**Test Endpoints (Development Only):**
```
POST /api/test/seeding/generate-words
POST /api/test/seeding/generate-seed
POST /api/test/data-flow
POST /api/test/seed
POST /api/test/choices
POST /api/test/tallies
POST /api/test/telemetry
POST /api/test/cleanup
```

**Key Files:**
- `tests/integration/README.md` - Comprehensive integration testing guide
- `tests/integration/DEVVIT_TESTING_NOTES.md` - Devvit-specific constraints
- `src/server/index.ts` (lines 121-188) - Test endpoint implementations

---

### 3. E2E Tests (Playwright)

**When to Use:**
- Testing complete user workflows
- Browser interaction testing
- Visual/UI testing
- Cross-browser compatibility
- Pre-deployment validation

**Characteristics:**
- 🐌 Slowest execution (seconds to minutes)
- ⚠️ Requires running server + browser
- ✅ Tests real user experience
- ✅ Catches integration + UI bugs
- ❌ Brittle (UI changes break tests)

**Examples:**
```typescript
// E2E test structure
test('user can select and submit words', async ({ page }) => {
  await page.goto('http://localhost:3000');

  // Wait for words to load
  await page.waitForSelector('.word-card');

  // Select 3 words
  await page.click('.word-card:nth-child(1)');
  await page.click('.word-card:nth-child(2)');
  await page.click('.word-card:nth-child(3)');

  // Submit
  await page.click('button[type="submit"]');

  // Verify success
  await expect(page.locator('.success-message')).toBeVisible();
});
```

**Location:** `tests/e2e/**/*.spec.ts`

**Run Command:**
```bash
pnpm run test:e2e          # Run all E2E tests
pnpm run test:e2e --ui     # Run with Playwright UI
pnpm run test:e2e --headed # Run with visible browser
```

---

## Special Case: Seeding Engine

The seeding engine has unique testing requirements due to its algorithmic complexity and Devvit constraints.

### TestSeedingService vs Real SeedingService

| Aspect | TestSeedingService | Real SeedingService |
|--------|-------------------|---------------------|
| **Storage** | In-memory (Map) | Redis (via Devvit) |
| **Use Case** | Integration tests | Production |
| **Redis Required** | ❌ No | ✅ Yes |
| **Cluster Diversity** | ✅ Full implementation | ✅ Full implementation |
| **Works with** | `tsx watch` | `devvit playtest` or production |
| **Location** | `src/server/services/seeding.service.test.ts` | `src/server/services/seeding.service.ts` |

### When to Use Each

**Use TestSeedingService (Integration Tests):**
```typescript
// API endpoint uses TestSeedingService
app.post('/api/test/seeding/generate-words', async (req, res) => {
  const words = await testSeedingService.generateUserWords(
    userId,
    date,
    count
  );
  res.json({ success: true, words });
});
```

**Benefits:**
- ✅ No Redis dependency for tests
- ✅ Fast test execution
- ✅ Works with `pnpm run dev`
- ✅ Full cluster diversity algorithm
- ✅ Deterministic (same as production)

**Use Real SeedingService (Production):**
```typescript
// Production code uses real SeedingService
const seedingService = new SeedingService(redis);
const words = await seedingService.generateUserWords(userId, date, count);
```

**Benefits:**
- ✅ Real Redis persistence
- ✅ TTL and expiration
- ✅ Production-identical behavior
- ✅ Audit trail in Redis

---

## Testing Strategy by Component

### Crypto Services (CryptoService)

**Approach:** Unit tests (100% coverage)

**Rationale:**
- Pure functions (deterministic)
- No external dependencies
- Fast execution
- Critical for security

**Example:**
```bash
pnpm test src/server/services/crypto.service.test.ts
```

### PRNG (PRNGService)

**Approach:** Unit tests (100% coverage)

**Rationale:**
- Algorithmic correctness
- Determinism verification
- Statistical distribution testing
- No I/O operations

### Data Layer (DataService, IdentityService, TelemetryService)

**Approach:** Unit tests with mocked Redis (90% coverage) + Integration tests for critical flows (10%)

**Rationale:**
- Unit tests for method logic
- Mock Redis for speed
- Integration tests for Redis operations
- API tests for full data flow

**Unit Test Example:**
```typescript
const mockRedis = {
  set: vi.fn().mockResolvedValue('OK'),
  get: vi.fn().mockResolvedValue('{"seed":"..."}'),
};
const service = new DataService(mockRedis as any);
```

**Integration Test Example:**
```typescript
const response = await fetch(`${SERVER_URL}/api/test/data-flow`, {
  method: 'POST',
  body: JSON.stringify({ date, userId, choices }),
});
```

### Seeding Engine (SeedingService)

**Approach:** Unit tests (algorithm) + Integration tests (full flow + cluster diversity)

**Rationale:**
- Unit tests for core algorithms (PRNG, seed generation, validation)
- Integration tests for word selection with cluster diversity
- API tests for determinism verification
- Both use deterministic algorithms for reproducibility

**Unit Test Example:**
```typescript
describe('SeedingService', () => {
  it('validates date format', () => {
    expect(() => service.validateDate('2025/10/15')).toThrow();
    expect(() => service.validateDate('2025-10-15')).not.toThrow();
  });
});
```

**Integration Test Example:**
```typescript
it('enforces 1-per-cluster constraint', async () => {
  const response = await apiRequest('seeding/generate-words', {
    userId: 'user123',
    date: '2025-10-15',
    count: 12,
  });

  const words = response.words;
  const clusters = words.map(w => lexicon.mappings[w].cluster);
  const uniqueClusters = new Set(clusters);

  expect(uniqueClusters.size).toBe(words.length); // All unique
});
```

### Word Selection (WordSelectionService)

**Approach:** Unit tests (algorithm correctness)

**Rationale:**
- Pure algorithmic logic
- Slot coverage verification
- Cluster diversity algorithm
- Wildcard handling

### Server Endpoints

**Approach:** Integration tests (API testing)

**Rationale:**
- Tests request/response flow
- Validates middleware
- Tests error handling
- Verifies status codes

---

## Test Coverage Goals

| Component | Unit Tests | Integration Tests | E2E Tests | Total |
|-----------|-----------|-------------------|-----------|-------|
| Crypto Services | 100% | - | - | 100% |
| PRNG | 100% | - | - | 100% |
| Data Services | 90% | 10% | - | 100% |
| Seeding Engine | 70% | 30% | - | 100% |
| Word Selection | 100% | - | - | 100% |
| Server Endpoints | - | 100% | - | 100% |
| User Flows | - | - | 100% | 100% |

---

## CI/CD Strategy

### GitHub Actions Workflow

```yaml
test:
  runs-on: ubuntu-latest
  steps:
    - name: Install dependencies
      run: pnpm install

    - name: Run unit tests
      run: pnpm test

    - name: Build
      run: pnpm run build

    - name: Validate Devvit config
      run: pnpm run validate
```

**Note:** Integration tests are NOT run in CI because:
- ❌ Devvit runtime not available in GitHub Actions
- ❌ Redis connection requires Devvit infrastructure
- ✅ Unit tests provide sufficient coverage for CI
- ✅ Integration tests run locally before deployment

### Pre-Deployment Checklist

```bash
# 1. Run all unit tests
pnpm test

# 2. Run integration tests (requires dev server)
pnpm run dev              # Terminal 1
pnpm run test:integration # Terminal 2

# 3. Run E2E tests (optional)
pnpm run test:e2e

# 4. Build and validate
pnpm run build
pnpm run validate

# 5. Manual playtest
devvit playtest
```

---

## Common Pitfalls

### ❌ DON'T: Import services directly in tests that need Redis

```typescript
// ❌ This will fail - no Devvit context
import { redis } from '@devvit/web/server';
import { DataService } from './services/data.service';

const dataService = new DataService(redis);
await dataService.setSeed(date, seedData); // Error: Devvit config not available
```

### ✅ DO: Use API endpoints for integration tests

```typescript
// ✅ This works - uses test endpoints
const response = await fetch('http://localhost:3000/api/test/seed', {
  method: 'POST',
  body: JSON.stringify({ date, seedData }),
});
const { success } = await response.json();
```

### ❌ DON'T: Run integration tests in CI without Devvit runtime

```yaml
# ❌ This will fail in GitHub Actions
- name: Run integration tests
  run: pnpm run test:integration  # No Devvit runtime!
```

### ✅ DO: Only run unit tests in CI

```yaml
# ✅ This works
- name: Run unit tests
  run: pnpm test  # Uses mocks, no external dependencies
```

### ❌ DON'T: Use Math.random() in seeding algorithms

```typescript
// ❌ Non-deterministic - breaks reproducibility
const wordIndex = Math.floor(Math.random() * words.length);
```

### ✅ DO: Use deterministic PRNG

```typescript
// ✅ Deterministic - same seed = same output
const prng = new PRNG(userSeed);
const wordIndex = prng.nextInt(0, words.length);
```

---

## Testing Checklist

### Before Committing

- [ ] All unit tests pass (`pnpm test`)
- [ ] Code formatted (`pnpm run format`)
- [ ] Linting passes (`pnpm run lint`)
- [ ] Build succeeds (`pnpm run build`)

### Before Pull Request

- [ ] Unit tests pass
- [ ] Integration tests pass (run locally)
- [ ] E2E tests pass (if applicable)
- [ ] Coverage meets goals
- [ ] Documentation updated

### Before Deployment

- [ ] All tests pass
- [ ] Manual playtest verification
- [ ] Devvit config validated
- [ ] Environment variables verified
- [ ] Performance benchmarks acceptable

---

## Performance Benchmarks

### Unit Tests
- **Target:** <1 second for entire suite
- **Current:** ~500ms (all unit tests)
- **Goal:** <100ms per test file

### Integration Tests
- **Target:** <1 second for entire suite
- **Current:** ~400ms (33 tests)
- **Goal:** <100ms per API call

### E2E Tests
- **Target:** <30 seconds per test
- **Current:** Not yet implemented
- **Goal:** <5 minutes for full suite

---

## Resources

### Documentation
- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
- [Devvit Testing Guide](https://developers.reddit.com/docs/guides/tools/playtest)
- Project: `tests/integration/README.md`
- Project: `tests/integration/DEVVIT_TESTING_NOTES.md`
- Project: `docs/TESTING.md`

### Key Files
- `vitest.config.ts` - Unit test configuration
- `vitest.integration.config.ts` - Integration test configuration
- `playwright.config.ts` - E2E test configuration (if exists)
- `.github/workflows/test.yml` - CI/CD pipeline

### Commands Reference
```bash
# Unit Tests
pnpm test                           # Run all unit tests
pnpm test:watch                     # Watch mode
pnpm test path/to/file.test.ts      # Run specific file

# Integration Tests
pnpm run dev                        # Start server (Terminal 1)
pnpm run test:integration           # Run tests (Terminal 2)
pnpm vitest run tests/integration/seeding.test.ts --config vitest.integration.config.ts

# E2E Tests
pnpm run test:e2e                   # Run all E2E tests
pnpm run test:e2e --ui              # With UI
pnpm run test:e2e --headed          # Visible browser

# All Tests
pnpm run test:all                   # Run everything (local only)

# Code Quality
pnpm run lint                       # Check code style
pnpm run format                     # Auto-format code
pnpm run build                      # Build project
pnpm run validate                   # Validate Devvit config
```

---

## Conclusion

Effective testing in a Devvit project requires understanding the framework's constraints and choosing the right testing approach for each component:

1. **Unit tests** for algorithms and isolated logic (fast, no dependencies)
2. **Integration tests** for service interactions via API (medium speed, requires server)
3. **E2E tests** for user flows (slow, requires browser)

The key principle: **Use the fastest test type that provides adequate coverage.**

For Devvit specifically: **API-based integration testing** is essential because direct service testing requires the Devvit runtime, which is only available through playtest or production deployment.

---

**Last Updated:** 2025-10-15
**Maintainer:** Development Team
**Version:** 1.0.0
