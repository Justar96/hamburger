# Phase 1 Data Layer - Design Document

## Overview

Phase 1 implements the data persistence layer for the Beef (Choice Chorus) application. This design focuses on creating Redis-based services that manage daily seeds, user voting choices, and real-time tallies. The architecture emphasizes deterministic operations, efficient data access patterns, and strict adherence to platform constraints (2KB postData limit, 30s execution timeout).

**Key Design Principles:**
- Use Redis native data structures (strings, hashes, sorted sets) for optimal performance
- Implement user privacy through SHA256 hashing with pepper
- Keep postData under 2KB through intelligent truncation
- Design for horizontal scalability (stateless services)
- Fail fast on configuration errors, gracefully on transient failures

## Architecture

### High-Level Data Flow

```
User Request → Server Endpoint → DataService → Redis
                                      ↓
                                 Identity Hash
                                      ↓
                                 Telemetry
```

### Component Diagram

```
src/server/
├── services/
│   ├── data.service.ts        # Redis operations wrapper
│   ├── identity.service.ts    # User ID hashing
│   ├── postdata.service.ts    # PostData generation
│   └── telemetry.service.ts   # Performance tracking
├── types/
│   └── data.types.ts          # TypeScript interfaces
└── utils/
    └── redis.ts               # Redis connection management
```

## Components and Interfaces

### 1. Redis Connection Management

**Component:** `src/server/utils/redis.ts`

**Purpose:** Centralized Redis connection with retry logic and graceful degradation

**Interface:**
```typescript
import { redis } from '@devvit/web/server';

export class RedisConnection {
  private static instance: typeof redis | null = null;
  private static connectionAttempts = 0;
  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAY_MS = 1000;

  static async getClient(): Promise<typeof redis> {
    if (this.instance) {
      return this.instance;
    }

    try {
      // Devvit provides redis automatically via context
      // No explicit connection needed
      this.instance = redis;
      this.connectionAttempts = 0;
      return this.instance;
    } catch (error) {
      this.connectionAttempts++;
      
      if (this.connectionAttempts >= this.MAX_RETRIES) {
        throw new Error(`Redis connection failed after ${this.MAX_RETRIES} attempts`);
      }

      // Exponential backoff
      await new Promise(resolve => 
        setTimeout(resolve, this.RETRY_DELAY_MS * Math.pow(2, this.connectionAttempts - 1))
      );
      
      return this.getClient();
    }
  }

  static async healthCheck(): Promise<boolean> {
    try {
      const client = await this.getClient();
      await client.set('health:check', Date.now().toString(), { expiration: 60 });
      return true;
    } catch {
      return false;
    }
  }
}
```

**Design Rationale:**
- Devvit provides Redis client via context, no manual connection needed
- Health check validates Redis availability
- Exponential backoff prevents thundering herd
- Singleton pattern ensures single connection pool

### 2. Data Type Definitions

**Component:** `src/server/types/data.types.ts`

**Interface:**
```typescript
// Seed data stored in Redis
export interface SeedData {
  seedHex: string;        // HMAC-SHA256 hex string
  theme: string;          // Daily theme (e.g., "Nocturnal Cities")
  poolsVersion: string;   // Version of word pools used (e.g., "v1")
  createdAt: number;      // Unix timestamp
}

// User's word choices
export type UserChoices = string[];

// Tally entry for leaderboard
export interface TallyEntry {
  word: string;
  count: number;
}

// PostData sent to client (must be ≤ 2KB)
export interface PostData {
  date: string;           // YYYY-MM-DD
  theme: string;
  seedPreview: string;    // First 8 chars of seedHex
  teaserTop: string[];    // Top N words (truncated to fit 2KB)
  timeLeftSec: number;    // Seconds until 23:00 Bangkok
}

// Telemetry counters
export interface TelemetryData {
  requests: number;
  errors: number;
  p95Samples: number[];   // Latency samples for p95 calculation
}
```

**Design Rationale:**
- Explicit types enforce data contracts
- PostData structure optimized for size
- Timestamps use Unix epoch for consistency
- Arrays typed for safety

### 3. Data Service

**Component:** `src/server/services/data.service.ts`

**Purpose:** Abstraction layer over Redis operations

**Interface:**
```typescript
import { redis } from '@devvit/web/server';
import { SeedData, UserChoices, TallyEntry } from '../types/data.types';

export class DataService {
  constructor(private redis: typeof redis) {}

  // Seed operations
  async setSeed(date: string, seed: SeedData): Promise<void> {
    const key = `seed:${date}`;
    await this.redis.set(key, JSON.stringify(seed), {
      expiration: 7 * 24 * 60 * 60 // 7 days
    });
  }

  async getSeed(date: string): Promise<SeedData | null> {
    const key = `seed:${date}`;
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  // User choices operations
  async setUserChoices(
    date: string,
    userIdHash: string,
    choices: UserChoices
  ): Promise<void> {
    const key = `choices:${date}`;
    await this.redis.hSet(key, {
      [userIdHash]: JSON.stringify(choices)
    });
    
    // Set expiration on first write
    const ttl = await this.redis.expireTime(key);
    if (ttl < 0) {
      await this.redis.expire(key, 7 * 24 * 60 * 60); // 7 days
    }
  }

  async getUserChoices(
    date: string,
    userIdHash: string
  ): Promise<UserChoices | null> {
    const key = `choices:${date}`;
    const data = await this.redis.hGet(key, userIdHash);
    return data ? JSON.parse(data) : null;
  }

  // Tally operations (using sorted set for efficient top-N queries)
  async incrementTallies(date: string, words: string[]): Promise<void> {
    const key = `tallies:${date}`;
    
    // Use pipeline for atomic multi-increment
    for (const word of words) {
      await this.redis.zIncrBy(key, word, 1);
    }
    
    // Set expiration on first write
    const ttl = await this.redis.expireTime(key);
    if (ttl < 0) {
      await this.redis.expire(key, 7 * 24 * 60 * 60); // 7 days
    }
  }

  async getTopWords(date: string, limit: number): Promise<TallyEntry[]> {
    const key = `tallies:${date}`;
    
    // zRange with REV option gets highest scores first
    const results = await this.redis.zRange(key, 0, limit - 1, {
      by: 'rank',
      reverse: true
    });
    
    return results.map(({ member, score }) => ({
      word: member,
      count: score
    }));
  }

  async getTallyCount(date: string, word: string): Promise<number> {
    const key = `tallies:${date}`;
    const score = await this.redis.zScore(key, word);
    return score ?? 0;
  }
}
```

**Design Rationale:**
- Sorted sets (ZSET) provide O(log N) increments and O(1) top-N queries
- Hashes store user choices efficiently (one key per day, not per user)
- TTL set to 7 days for data retention
- JSON serialization for complex objects
- Expiration checked before setting to avoid redundant operations

### 4. Identity Service

**Component:** `src/server/services/identity.service.ts`

**Purpose:** Hash user IDs for privacy while maintaining determinism

**Interface:**
```typescript
import crypto from 'crypto';

export class IdentityService {
  private readonly pepper: string;

  constructor() {
    this.pepper = process.env.USER_ID_PEPPER;
    
    if (!this.pepper) {
      throw new Error(
        'USER_ID_PEPPER environment variable is required for user identity hashing'
      );
    }
  }

  hashUserId(userId: string): string {
    // SHA256(userId + PEPPER)
    const hash = crypto
      .createHash('sha256')
      .update(userId + this.pepper)
      .digest('hex');
    
    return hash;
  }

  // Verify hash matches (for testing/debugging)
  verifyHash(userId: string, hash: string): boolean {
    return this.hashUserId(userId) === hash;
  }
}
```

**Design Rationale:**
- SHA256 provides strong one-way hashing
- Pepper prevents rainbow table attacks
- Fail-fast on missing pepper (security requirement)
- Deterministic: same user always gets same hash
- No salt needed (we want determinism, not uniqueness per-record)

### 5. PostData Service

**Component:** `src/server/services/postdata.service.ts`

**Purpose:** Generate client-facing postData within 2KB limit

**Interface:**
```typescript
import { PostData, TallyEntry } from '../types/data.types';

export class PostDataService {
  private static readonly MAX_SIZE_BYTES = 2000;
  private static readonly BANGKOK_TZ_OFFSET = 7 * 60; // UTC+7 in minutes

  static generate(
    date: string,
    theme: string,
    seedHex: string,
    topWords: TallyEntry[]
  ): PostData {
    const timeLeftSec = this.calculateTimeLeft(date);
    const seedPreview = seedHex.substring(0, 8);
    
    // Start with all top words
    let teaserTop = topWords.map(t => t.word);
    
    // Build postData and check size
    let postData: PostData = {
      date,
      theme,
      seedPreview,
      teaserTop,
      timeLeftSec
    };
    
    // Truncate teaserTop if needed
    while (this.getSize(postData) > this.MAX_SIZE_BYTES && teaserTop.length > 0) {
      teaserTop = teaserTop.slice(0, -1);
      postData = { ...postData, teaserTop };
    }
    
    if (this.getSize(postData) > this.MAX_SIZE_BYTES) {
      throw new Error(
        `PostData exceeds ${this.MAX_SIZE_BYTES} bytes even with minimal content`
      );
    }
    
    return postData;
  }

  private static getSize(data: PostData): number {
    const json = JSON.stringify(data);
    return Buffer.byteLength(json, 'utf8');
  }

  private static calculateTimeLeft(date: string): number {
    // Calculate seconds until 23:00 Bangkok time on the given date
    const targetDate = new Date(date + 'T23:00:00+07:00');
    const now = new Date();
    const diffMs = targetDate.getTime() - now.getTime();
    return Math.max(0, Math.floor(diffMs / 1000));
  }

  static validate(data: PostData): { valid: boolean; size: number; errors: string[] } {
    const errors: string[] = [];
    const size = this.getSize(data);
    
    if (size > this.MAX_SIZE_BYTES) {
      errors.push(`Size ${size} exceeds limit of ${this.MAX_SIZE_BYTES} bytes`);
    }
    
    if (!data.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
      errors.push('Invalid date format (expected YYYY-MM-DD)');
    }
    
    if (data.timeLeftSec < 0) {
      errors.push('timeLeftSec cannot be negative');
    }
    
    return {
      valid: errors.length === 0,
      size,
      errors
    };
  }
}
```

**Design Rationale:**
- Static methods (no state needed)
- Iterative truncation ensures we stay under 2KB
- UTF-8 byte counting (not character counting)
- Bangkok timezone hardcoded per spec
- Validation method for testing
- Fail-fast if even minimal content exceeds limit

### 6. Telemetry Service

**Component:** `src/server/services/telemetry.service.ts`

**Purpose:** Track performance metrics without impacting request latency

**Interface:**
```typescript
import { redis } from '@devvit/web/server';
import { TelemetryData } from '../types/data.types';

export class TelemetryService {
  private static readonly MAX_P95_SAMPLES = 1000;

  constructor(private redis: typeof redis) {}

  async incrementCounter(date: string, counter: string): Promise<void> {
    const key = `telemetry:${date}`;
    
    try {
      await this.redis.hIncrBy(key, counter, 1);
      
      // Set expiration on first write
      const ttl = await this.redis.expireTime(key);
      if (ttl < 0) {
        await this.redis.expire(key, 7 * 24 * 60 * 60); // 7 days
      }
    } catch (error) {
      // Telemetry failures should not crash the app
      console.error('Telemetry increment failed:', error);
    }
  }

  async recordLatency(date: string, latencyMs: number): Promise<void> {
    const key = `telemetry:${date}:p95`;
    
    try {
      // Add to sorted set with timestamp as score for FIFO trimming
      await this.redis.zAdd(key, {
        member: `${Date.now()}:${latencyMs}`,
        score: Date.now()
      });
      
      // Trim to most recent N samples
      const count = await this.redis.zCard(key);
      if (count > TelemetryService.MAX_P95_SAMPLES) {
        await this.redis.zRemRangeByRank(
          key,
          0,
          count - TelemetryService.MAX_P95_SAMPLES - 1
        );
      }
      
      // Set expiration
      const ttl = await this.redis.expireTime(key);
      if (ttl < 0) {
        await this.redis.expire(key, 7 * 24 * 60 * 60);
      }
    } catch (error) {
      console.error('Telemetry latency recording failed:', error);
    }
  }

  async getTelemetry(date: string): Promise<TelemetryData> {
    const key = `telemetry:${date}`;
    const p95Key = `telemetry:${date}:p95`;
    
    try {
      const counters = await this.redis.hGetAll(key);
      const p95Entries = await this.redis.zRange(p95Key, 0, -1);
      
      const p95Samples = p95Entries.map(({ member }) => {
        const [, latency] = member.split(':');
        return parseFloat(latency);
      });
      
      return {
        requests: parseInt(counters.requests || '0'),
        errors: parseInt(counters.errors || '0'),
        p95Samples
      };
    } catch (error) {
      console.error('Telemetry retrieval failed:', error);
      return { requests: 0, errors: 0, p95Samples: [] };
    }
  }

  calculateP95(samples: number[]): number {
    if (samples.length === 0) return 0;
    
    const sorted = [...samples].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * 0.95) - 1;
    return sorted[index];
  }
}
```

**Design Rationale:**
- Non-blocking: telemetry failures don't crash requests
- Sorted set for p95 samples with automatic trimming
- Timestamp-based FIFO eviction
- Separate key for p95 to avoid hash size limits
- Client-side p95 calculation (not stored in Redis)

## Data Models

### Redis Key Schema

```
seed:{date}                    → String (JSON)
  Example: seed:2025-10-14 → '{"seedHex":"8d23...","theme":"Nocturnal Cities","poolsVersion":"v1","createdAt":1728950400}'

choices:{date}                 → Hash
  Field: userIdHash → JSON array of words
  Example: choices:2025-10-14 → { "a3f2...": '["neon","rain","alley"]' }

tallies:{date}                 → Sorted Set
  Member: word, Score: count
  Example: tallies:2025-10-14 → { neon: 42, rain: 38, alley: 35, ... }

telemetry:{date}               → Hash
  Field: counter name → count
  Example: telemetry:2025-10-14 → { requests: 1523, errors: 3 }

telemetry:{date}:p95           → Sorted Set
  Member: timestamp:latencyMs, Score: timestamp
  Example: telemetry:2025-10-14:p95 → { "1728950400123:45": 1728950400123, ... }
```

### Data Retention

- All keys expire after 7 days
- Cleanup job (Phase 10) will explicitly delete old keys
- TTL set on first write to each key

## Error Handling

### Error Categories

1. **Configuration Errors (Fail Fast)**
   - Missing USER_ID_PEPPER
   - Invalid environment variables
   - Action: Throw error, prevent server start

2. **Redis Connection Errors (Retry with Backoff)**
   - Connection timeout
   - Network failure
   - Action: Retry 3 times with exponential backoff, then fail

3. **Data Validation Errors (Return 400)**
   - Invalid date format
   - PostData exceeds 2KB
   - Action: Return structured error to client

4. **Telemetry Errors (Log and Continue)**
   - Counter increment fails
   - P95 recording fails
   - Action: Log error, continue request processing

### Error Response Format

```typescript
interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
```

## Testing Strategy

### Unit Tests

**Scope:** Individual service methods

**Test Cases:**
- `DataService.setSeed` / `getSeed` round-trip
- `DataService.incrementTallies` increments correctly
- `DataService.getTopWords` returns sorted results
- `IdentityService.hashUserId` is deterministic
- `IdentityService` throws on missing pepper
- `PostDataService.generate` stays under 2KB
- `PostDataService.generate` truncates teaserTop when needed
- `TelemetryService.calculateP95` computes correctly
- `TelemetryService` failures don't throw

**Framework:** Vitest with in-memory Redis (or mocked)

**Example:**
```typescript
describe('IdentityService', () => {
  it('hashes user ID deterministically', () => {
    process.env.USER_ID_PEPPER = 'test-pepper';
    const service = new IdentityService();
    
    const hash1 = service.hashUserId('user123');
    const hash2 = service.hashUserId('user123');
    
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA256 hex length
  });

  it('throws when pepper is missing', () => {
    delete process.env.USER_ID_PEPPER;
    
    expect(() => new IdentityService()).toThrow('USER_ID_PEPPER');
  });
});
```

### Integration Tests

**Scope:** Services with real Redis

**Test Cases:**
- Full flow: setSeed → setUserChoices → incrementTallies → getTopWords
- PostData generation with real tally data
- Telemetry recording and retrieval
- Redis connection retry logic
- Key expiration behavior

**Framework:** Vitest with Docker Redis container

**Example:**
```typescript
describe('DataService Integration', () => {
  let redis: typeof import('@devvit/web/server').redis;
  let dataService: DataService;

  beforeAll(async () => {
    // Setup Redis connection
    redis = await RedisConnection.getClient();
    dataService = new DataService(redis);
  });

  afterEach(async () => {
    // Clean up test keys
    await redis.del('seed:2025-10-14', 'choices:2025-10-14', 'tallies:2025-10-14');
  });

  it('stores and retrieves seed data', async () => {
    const seed: SeedData = {
      seedHex: '8d23abc...',
      theme: 'Test Theme',
      poolsVersion: 'v1',
      createdAt: Date.now()
    };

    await dataService.setSeed('2025-10-14', seed);
    const retrieved = await dataService.getSeed('2025-10-14');

    expect(retrieved).toEqual(seed);
  });

  it('increments tallies and returns top words', async () => {
    await dataService.incrementTallies('2025-10-14', ['neon', 'rain', 'neon']);
    const top = await dataService.getTopWords('2025-10-14', 10);

    expect(top).toEqual([
      { word: 'neon', count: 2 },
      { word: 'rain', count: 1 }
    ]);
  });
});
```

### Performance Tests

**Scope:** Verify operations meet latency requirements

**Test Cases:**
- `getTopWords` completes in <50ms for 1000 words
- `incrementTallies` with 5 words completes in <20ms
- `PostDataService.generate` completes in <10ms
- Concurrent requests don't degrade performance

**Framework:** Vitest with performance assertions

## Environment Variables

```bash
# Required
USER_ID_PEPPER=<random-string>  # For user ID hashing

# Optional (defaults provided)
REDIS_URL=redis://localhost:6379  # Devvit provides this automatically
NODE_ENV=development
```

## Integration with Existing Code

### Update `/api/health` Endpoint

```typescript
// src/server/index.ts
import { TelemetryService } from './services/telemetry.service';

app.get('/api/health', async (req, res) => {
  const telemetry = new TelemetryService(redis);
  const date = new Date().toISOString().split('T')[0];
  
  await telemetry.incrementCounter(date, 'health_checks');
  
  res.json({
    ok: true,
    ts: Date.now(),
  });
});
```

### Add Environment Variable Validation

```typescript
// src/server/index.ts (at startup)
import { IdentityService } from './services/identity.service';

// Validate required environment variables
try {
  new IdentityService(); // Will throw if USER_ID_PEPPER missing
} catch (error) {
  console.error('Configuration error:', error);
  process.exit(1);
}
```

## Next Steps (Phase 2)

After Phase 1 completion:

1. **Phase 2 (Day 3):** Implement deterministic seeding engine
   - HMAC seed generation
   - PRNG (SplitMix64/Xoroshiro)
   - Word pool loading and selection

2. **Phase 3 (Day 4):** Create client-facing APIs
   - `/api/init` - Returns user's words and current progress
   - `/api/pick` - Records user's choices
   - `/api/progress` - Returns live tallies

Phase 1 provides the data foundation; subsequent phases build the game logic on top.

## Validation Checklist

Phase 1 is complete when:

- [ ] All services implemented with TypeScript interfaces
- [ ] Unit tests pass with >90% coverage
- [ ] Integration tests pass with real Redis
- [ ] PostData generation stays under 2KB in all test cases
- [ ] User ID hashing is deterministic and secure
- [ ] Telemetry doesn't impact request latency
- [ ] `/api/health` increments telemetry counter
- [ ] Environment variable validation prevents startup with missing config
- [ ] Redis connection retry logic works
- [ ] All keys have 7-day TTL set correctly
