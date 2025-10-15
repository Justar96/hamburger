# Developer Guide

## Quick Reference

### Getting Started

```bash
# Clone and setup
git clone <repo>
cd choice-chorus
pnpm install

# Configure environment
cp .env.example .env
# Edit .env and set USER_ID_PEPPER

# Start development
pnpm run dev
```

### Common Commands

```bash
# Development
pnpm run dev              # Start Devvit playtest server
pnpm run dev:server       # Start server only (tsx watch)
pnpm run dev:client       # Start client only (vite)

# Testing
pnpm test                 # Run unit tests
pnpm run test:watch       # Run tests in watch mode
pnpm run test:integration # Run integration tests
pnpm run test:e2e         # Run E2E tests
pnpm run test:all         # Run all tests

# Code Quality
pnpm run lint             # Check code style
pnpm run format           # Format code
pnpm run format:check     # Check formatting

# Building
pnpm run build            # Build server + client
pnpm run build:server     # Build server only
pnpm run build:client     # Build client only

# Validation
pnpm run validate         # Validate Devvit config
```

## Project Architecture

### Server Structure

```
src/server/
├── index.ts                    # Express server + test endpoints
├── services/
│   ├── data.service.ts         # Redis data operations
│   ├── identity.service.ts     # User ID hashing
│   ├── postdata.service.ts     # PostData generation
│   └── telemetry.service.ts    # Performance tracking
├── types/
│   └── data.types.ts           # TypeScript interfaces
└── utils/
    └── redis.ts                # Redis connection utilities
```

### Key Services

#### DataService
Handles all Redis operations for seed data, user choices, and tallies.

```typescript
import { DataService } from './services/data.service';
import { redis } from '@devvit/web/server';

const dataService = new DataService(redis);

// Store seed data
await dataService.setSeed(date, seedData);

// Store user choices
await dataService.setUserChoices(date, userHash, choices);

// Increment tallies
await dataService.incrementTallies(date, words);

// Get top words
const topWords = await dataService.getTopWords(date, limit);
```

#### IdentityService
Hashes user IDs for privacy protection.

```typescript
import { IdentityService } from './services/identity.service';

const identityService = new IdentityService();

// Hash user ID (deterministic)
const hash = identityService.hashUserId('t2_user123');

// Verify hash
const isValid = identityService.verifyHash('t2_user123', hash);
```

#### PostDataService
Generates PostData within 2KB limit.

```typescript
import { PostDataService } from './services/postdata.service';

// Generate PostData
const postData = PostDataService.generate(
  date,
  theme,
  seedHex,
  topWords
);

// Validate PostData
const validation = PostDataService.validate(postData);
```

#### TelemetryService
Tracks performance metrics.

```typescript
import { TelemetryService } from './services/telemetry.service';

const telemetryService = new TelemetryService(redis);

// Increment counter
await telemetryService.incrementCounter(date, 'requests');

// Record latency
await telemetryService.recordLatency(date, latencyMs);

// Get telemetry data
const telemetry = await telemetryService.getTelemetry(date);
```

## Testing Strategy

### Unit Tests (Fast, Isolated)

Use mocked dependencies for fast feedback:

```typescript
import { vi } from 'vitest';

const mockRedis = {
  get: vi.fn().mockResolvedValue('value'),
  set: vi.fn().mockResolvedValue('OK'),
};

const service = new DataService(mockRedis);
```

### Integration Tests (Real Dependencies)

Require Devvit playtest environment:

```bash
# Start playtest
pnpm run dev

# Test via API endpoints
curl -X POST http://localhost:3000/api/test/data-flow \
  -H "Content-Type: application/json" \
  -d '{"date":"2025-10-15","userId":"t2_test","choices":["word1"]}'
```

### E2E Tests (Full User Flow)

Use Playwright for browser automation:

```bash
npm run test:e2e
```

## Development Workflow

### 1. Start Development Server

```bash
npm run dev
```

This starts:
- Server with `tsx watch` (auto-restart on changes)
- Client with `vite` (hot module reload)
- Devvit runtime (connects to Reddit's infrastructure)

### 2. Make Changes

Edit files in `src/server/` or `src/client/`

### 3. Test Changes

```bash
# Run unit tests
npm test

# Test manually via browser
# Navigate to http://localhost:3000

# Test via API
curl http://localhost:3000/api/health
```

### 4. Verify Code Quality

```bash
# Format code
npm run format

# Check linting
npm run lint

# Run all tests
npm run test:all
```

### 5. Build and Validate

```bash
# Build
npm run build

# Validate Devvit config
npm run validate
```

## Environment Variables

### Required

- `USER_ID_PEPPER` - Secret for hashing user IDs (min 32 chars)

### Optional

- `NODE_ENV` - Environment (development/production)
- `PORT` - Server port (default: 3000)
- `UPSTASH_REDIS_URL` - Redis connection URL (for CI)

### Future (Phase 3+)

- `GCP_PROJECT_ID` - Google Cloud project ID
- `GCP_LOCATION` - GCP region (e.g., us-central1)
- `VERTEX_API_KEY` - Vertex AI API key

## Redis Key Schema

All keys use the format: `{type}:{date}` or `{type}:{date}:{subtype}`

```
seed:YYYY-MM-DD              # Seed data (string, JSON)
choices:YYYY-MM-DD           # User choices (hash)
tallies:YYYY-MM-DD           # Word tallies (sorted set)
telemetry:YYYY-MM-DD         # Telemetry counters (hash)
telemetry:YYYY-MM-DD:p95     # P95 latency samples (sorted set)
```

All keys have 7-day TTL.

## Common Issues

### "Devvit config is not available"

**Cause**: Redis operations require Devvit runtime  
**Solution**: Run through `npm run dev`, not `tsx` directly

### "USER_ID_PEPPER is required"

**Cause**: Missing environment variable  
**Solution**: Set `USER_ID_PEPPER` in `.env` file

### Port 3000 already in use

**Cause**: Another process using port 3000  
**Solution**: Kill the process or change `PORT` in `.env`

### Tests fail in CI

**Cause**: Integration tests need Devvit runtime  
**Solution**: Expected behavior - use unit tests for CI validation

## Best Practices

### Code Style

- Use TypeScript strict mode
- Follow existing naming conventions
- Add JSDoc comments for public APIs
- Keep functions focused and small

### Testing

- Write unit tests for all business logic
- Use integration tests as specifications
- Test error cases and edge conditions
- Clean up test data after manual testing

### Error Handling

- Fail fast for critical errors
- Log and continue for optional features
- Provide user-friendly error messages
- Never expose sensitive data in errors

### Performance

- Keep PostData under 2KB
- Use Redis sorted sets for efficient queries
- Implement automatic data expiration (TTL)
- Monitor telemetry metrics

## Resources

- [Testing Guide](TESTING.md)
- [Integration Testing Summary](../tests/integration/SUMMARY.md)
- [Manual Testing Guide](../tests/manual-integration-test.md)
- [Devvit Documentation](https://developers.reddit.com/docs)
- [Devvit Web Guide](https://developers.reddit.com/docs/capabilities/devvit-web)
