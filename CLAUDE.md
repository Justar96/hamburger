# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential Commands

### Development
```bash
pnpm install              # Install dependencies (always use pnpm, not npm)
pnpm run dev             # Start full dev environment (server + client + Devvit runtime)
pnpm run dev:server      # Start server only (tsx watch)
pnpm run dev:client      # Start client only (vite)
```

### Testing
```bash
pnpm test                # Run unit tests (fast, no Redis required)
pnpm run test:watch      # Run tests in watch mode during development
pnpm run test:integration # Run integration tests (requires Devvit runtime)
pnpm run test:e2e        # Run end-to-end tests with Playwright
pnpm run test:all        # Run all test suites

# Run single test file
pnpm test src/server/services/crypto.service.test.ts
```

### Code Quality
```bash
pnpm run lint            # Check code style
pnpm run format          # Auto-format code with Prettier
pnpm run format:check    # Check formatting without changes
```

### Building
```bash
pnpm run build           # Build server + client for production
pnpm run build:server    # Build server TypeScript to dist/
pnpm run validate        # Validate Devvit configuration
```

## Project Architecture

### Overview
This is a Devvit Web application for Reddit that implements a daily collaborative word generation game. The architecture consists of:

- **Server**: Node.js/Express backend with Redis for state management
- **Client**: Static web assets served from `public/` directory
- **Devvit Runtime**: Reddit's platform that provides Redis and request context
- **Seeding Engine**: Deterministic word generation using cryptographic seeds and PRNG

### Key Architectural Components

#### 1. Seeding Engine (Phase 2)
The core algorithmic component that generates unique, reproducible word sets:

**Flow**: `generateUserWords(userId, date) → daily seed → user seed → PRNG → word selection → word array`

**Components**:
- `CryptoService` - HMAC-SHA256 seed generation from DAILY_SEED_SECRET
- `PRNG` - SplitMix64 + Xoroshiro128+ for deterministic randomization
- `WordSelectionService` - Slot coverage, cluster diversity, wildcard selection
- `SeedingService` - Main orchestrator that ties everything together

**Critical Properties**:
- **Deterministic**: Same userId + date always produces identical words
- **Fair**: Balanced slot coverage (subject/action/setting/mood/modifier)
- **Diverse**: 1-per-cluster constraint prevents semantic redundancy
- **Auditable**: Seeds stored in Redis with metadata

**Word Pools**: Loaded from `data/pools.v1.json` at startup, cached in memory. Contains themes with semantic slots and cluster mappings.

**Lexicon**: Loaded from `data/lexicon.map.json` at startup. Maps words to canonical form, slot, and taxonomic cluster.

#### 2. Data Layer Services
All services follow constructor injection pattern with Redis client:

- `DataService` - Redis operations (seed storage, user choices, tallies, top words)
- `IdentityService` - User ID hashing with USER_ID_PEPPER (HMAC-SHA256)
- `TelemetryService` - Performance counters and latency tracking
- `PostDataService` - Static utility for generating <2KB PostData for Reddit

**Redis Key Schema**:
```
seed:YYYY-MM-DD              # Daily seed data (JSON string)
choices:YYYY-MM-DD           # User choices (Redis hash: userHash → JSON)
tallies:YYYY-MM-DD           # Word tallies (Redis sorted set: word → count)
telemetry:YYYY-MM-DD         # Counters (Redis hash: counter → value)
telemetry:YYYY-MM-DD:p95     # P95 latency samples (Redis sorted set)
```
All keys have 7-day TTL.

#### 3. Server Runtime
Express server in `src/server/index.ts`:

- Production endpoints: `/api/health`, `/internal/install`
- Test endpoints: Available only in development mode (NODE_ENV !== 'production')
  - `/api/test/seeding/*` - Test seeding engine with TestSeedingService
  - `/api/test/data-flow` - Test full data pipeline
  - `/api/test/seed`, `/api/test/choices`, `/api/test/tallies`, `/api/test/telemetry`
  - `/api/test/cleanup` - Clean up test Redis keys

**Startup Validation**:
1. Validates USER_ID_PEPPER (min 32 chars, required)
2. Validates DAILY_SEED_SECRET (hex string, min 32 chars recommended 64)
3. Initializes SeedingService (loads pools/lexicon, validates files)
4. Sets mock Devvit context in development mode
5. Exits with error code 1 if validation fails

#### 4. Environment Configuration

**Required**:
- `USER_ID_PEPPER` - Secret for hashing user IDs (min 32 chars)
- `DAILY_SEED_SECRET` - Secret for deterministic seed generation (64-char hex recommended)

**Optional**:
- `NODE_ENV` - Environment mode (development/production)
- `PORT` - Server port (default: 3000)
- `UPSTASH_REDIS_URL` - Redis URL (Devvit provides automatically in production)
- `DEBUG_SEEDING` - Set to 'true' for verbose seeding logs (WARNING: high log volume)

**Generate secrets**:
```bash
# Generate USER_ID_PEPPER
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate DAILY_SEED_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Service Integration Patterns

#### Using SeedingService
```typescript
import { SeedingService } from './services/seeding.service';
import { redis } from '@devvit/web/server';

const seedingService = new SeedingService(redis);

// Generate words (deterministic)
const words = await seedingService.generateUserWords('user123', '2025-10-15', 12);
// Returns: ['neon', 'glowing', 'rain', 'mysterious', 'wet', ...]

// Generate daily seed (creates if not exists)
const seedData = await seedingService.generateDailySeed('2025-10-15');
// Returns: { seedHex, theme, poolsVersion, createdAt }
```

#### Using DataService
```typescript
import { DataService } from './services/data.service';

const dataService = new DataService(redis);

// Store seed
await dataService.setSeed(date, seedData);

// Store user choices (use hashed userId)
await dataService.setUserChoices(date, userHash, ['word1', 'word2']);

// Increment tallies
await dataService.incrementTallies(date, ['word1', 'word2']);

// Get top words
const topWords = await dataService.getTopWords(date, 10);
```

#### Using IdentityService
```typescript
import { IdentityService } from './services/identity.service';

const identityService = new IdentityService();

// Hash user ID (deterministic, one-way)
const hash = identityService.hashUserId('t2_user123');

// Verify hash
const isValid = identityService.verifyHash('t2_user123', hash); // true
```

## Testing Strategy

### Unit Tests (Default)
- Located in `src/server/**/*.test.ts` and `tests/*.test.ts`
- Use mocked Redis client (vitest `vi.fn()`)
- Fast, no external dependencies
- Run with `pnpm test` (excludes integration/e2e)

### Integration Tests
- Located in `tests/integration/**/*.test.ts`
- Require Devvit runtime for real Redis
- Run with `pnpm run test:integration`
- Use `TestSeedingService` for controlled seeding tests
- Cannot run in CI (Devvit runtime not available)

### E2E Tests
- Located in `tests/e2e/**/*.spec.ts`
- Use Playwright for browser automation
- Run with `pnpm run test:e2e`

### Test Doubles
When writing unit tests, mock the Redis client:
```typescript
import { vi } from 'vitest';

const mockRedis = {
  get: vi.fn().mockResolvedValue('value'),
  set: vi.fn().mockResolvedValue('OK'),
  hGet: vi.fn().mockResolvedValue('value'),
  hSet: vi.fn().mockResolvedValue(1),
  zAdd: vi.fn().mockResolvedValue(1),
  zRange: vi.fn().mockResolvedValue([]),
};

const service = new DataService(mockRedis as any);
```

## Development Workflow

### Making Changes
1. Start dev server: `pnpm run dev`
2. Edit files in `src/server/` or `src/client/`
3. Server auto-restarts (tsx watch), client hot-reloads (vite)
4. Test changes: `pnpm test` or use test endpoints

### Before Committing
1. Format code: `pnpm run format`
2. Check linting: `pnpm run lint`
3. Run tests: `pnpm test` (unit tests)
4. Build: `pnpm run build`
5. Validate: `pnpm run validate`

### Common Issues

**"Devvit config is not available"**
- Redis operations require Devvit runtime
- Always use `pnpm run dev`, not direct `tsx` execution

**"USER_ID_PEPPER is required"**
- Set in `.env` file (copy from `.env.example`)
- Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

**"Failed to load word pools"**
- Ensure `data/pools.v1.json` exists
- Check file is valid JSON
- SeedingService loads at startup, errors are fatal

**Port 3000 already in use**
- Another process is using port 3000
- Kill process or set `PORT` in `.env`

**Integration tests fail**
- Expected in CI (no Devvit runtime)
- Must run locally with `pnpm run dev` running

## Devvit Platform

### Always use MCP tools for Devvit documentation
The `.kiro/steering/techstack.md` specifies: "always use mcp tools to get information about devvit framework"

### Devvit Configuration
- `devvit.json` - Platform configuration (permissions, triggers, entry points)
- Server entry: `dist/server/index.js` (compiled from `src/server/index.ts`)
- Client entry: `public/index.html` (static assets)

### Permissions
- Redis: ✅ Enabled (required for data storage)
- Realtime: ✅ Enabled (for future real-time features)
- Media: ✅ Enabled (for future image support)
- HTTP: ❌ Disabled
- Reddit API: ❌ Disabled

### Deployment
```bash
devvit validate          # Validate configuration
devvit upload --env production   # Deploy to production subreddit
devvit upload --env development  # Deploy to test subreddit
```

## File Organization

### Server (`src/server/`)
```
services/
  ├── crypto.service.ts         # HMAC seed generation
  ├── prng.service.ts           # SplitMix64 + Xoroshiro128+
  ├── word-selection.service.ts # Slot coverage, diversity, wildcards
  ├── seeding.service.ts        # Main orchestrator
  ├── data.service.ts           # Redis operations
  ├── identity.service.ts       # User ID hashing
  ├── telemetry.service.ts      # Performance tracking
  └── postdata.service.ts       # PostData generation

types/
  ├── data.types.ts             # SeedData, PostData interfaces
  └── seeding.types.ts          # WordPools, Theme, Lexicon interfaces

index.ts                        # Express server + test endpoints
```

### Data (`data/`)
```
pools.v1.json      # Word pools with themes, slots, clusters
lexicon.map.json   # Word metadata (canonical, slot, cluster)
```

### Tests (`tests/`)
```
integration/       # Integration tests (require Devvit runtime)
e2e/              # End-to-end tests (Playwright)
*.test.ts         # Additional test files
```

### Documentation (`docs/`)
- `TESTING.md` - Comprehensive testing guide
- `DEVELOPER_GUIDE.md` - Development workflow and patterns
- `ci-setup.md` - CI/CD configuration guide

### Project Specs (`.kiro/`)
- Contains phase-based requirements, design docs, and tasks
- Current phase: Phase 2 (Seeding Engine)
- Use for understanding project history and design decisions

## Important Constraints

### PostData Size Limit
Reddit's Devvit platform enforces a 2KB limit on PostData. The `PostDataService` includes validation:
```typescript
const validation = PostDataService.validate(postData);
if (!validation.valid) {
  console.warn('PostData exceeds 2KB limit:', validation);
}
```

### Determinism Requirements
The seeding engine MUST be deterministic:
- Same userId + date → identical words every time
- Critical for auditability and debugging
- Tested extensively in unit tests
- Never use `Math.random()` or `Date.now()` in selection algorithms

### Privacy Requirements
- User IDs must ALWAYS be hashed before storage/logging
- Use `IdentityService.hashUserId()` for all user operations
- Never log raw user IDs (logs use truncated hashes: `user123...`)

### Environment Variable Consistency
- `USER_ID_PEPPER` must be consistent across ALL environments
- `DAILY_SEED_SECRET` must be consistent across ALL environments
- Changing these values invalidates all historical data
- Document in deployment procedures

## Performance Targets

- Single word generation: <1ms
- 1000 word generations: <150ms
- Memory usage: <50MB for pools/lexicon cache
- Redis operations: 7-day TTL on all keys

## CI/CD Pipeline

### GitHub Actions Workflow
Runs on push/PR to `main` and `develop` branches:
1. Lint - ESLint and Prettier checks
2. Test (Unit) - Vitest with mocked Redis
3. Build - TypeScript compilation
4. Validate - Devvit configuration

### Required GitHub Secrets
- `UPSTASH_REDIS_URL` - Required for integration tests (not run in CI currently)
- `GCP_PROJECT_ID` - Placeholder for future Vertex AI integration
- `VERTEX_API_KEY` - Placeholder for future Vertex AI integration
