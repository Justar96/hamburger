# Design Document

## Overview

Phase 2 implements the deterministic seeding engine - the core algorithmic component that generates unique, reproducible word sets for each user on each day. This system combines cryptographic seed generation, high-quality pseudo-random number generation, and sophisticated word selection algorithms to create a fair, auditable, and engaging user experience.

The design prioritizes:
- **Determinism**: Same inputs always produce same outputs for auditability
- **Performance**: Sub-millisecond word generation for responsive APIs
- **Fairness**: Balanced word distribution across semantic categories
- **Variety**: Taxonomic diversity prevents repetitive word sets
- **Simplicity**: Clean APIs that integrate easily with existing services

## Architecture

### Component Hierarchy

```
SeedingService (orchestrator)
├── CryptoService (HMAC seed generation)
├── PRNG (SplitMix64 + Xoroshiro128+)
├── WordPools (data/pools.v1.json)
├── Lexicon (data/lexicon.map.json)
└── DataService (seed persistence)
```

### Data Flow

```
1. API Request (userId, date) 
   ↓
2. SeedingService.generateUserWords()
   ↓
3. Generate daily seed (HMAC-SHA256)
   ↓
4. Generate user seed (HMAC-SHA256)
   ↓
5. Initialize PRNG with user seed
   ↓
6. Apply selection algorithms:
   - Slot coverage (1+ per semantic slot)
   - Cluster diversity (1 per taxonomic cluster)
   - Wildcard selection (2-3 random)
   ↓
7. Return word array
   ↓
8. Store seed in Redis (via DataService)
```

## Components and Interfaces

### 1. CryptoService

Handles HMAC-SHA256 seed generation using Node's built-in `crypto` module.

```typescript
/**
 * Cryptographic utilities for deterministic seed generation.
 */
export class CryptoService {
  private readonly secret: string;

  constructor(secret: string) {
    if (!secret || secret.length === 0) {
      throw new Error('DAILY_SEED_SECRET is required');
    }
    this.secret = secret;
  }

  /**
   * Generate daily seed using HMAC-SHA256(secret, date).
   * @param date - Date string in YYYY-MM-DD format
   * @returns Hexadecimal seed string (64 characters)
   */
  generateDailySeed(date: string): string {
    const hmac = crypto.createHmac('sha256', this.secret);
    hmac.update(date);
    return hmac.digest('hex');
  }

  /**
   * Generate user-specific seed using HMAC-SHA256(dailySeed, userId).
   * @param dailySeed - Daily seed hex string
   * @param userId - User identifier
   * @returns Hexadecimal seed string (64 characters)
   */
  generateUserSeed(dailySeed: string, userId: string): string {
    const hmac = crypto.createHmac('sha256', dailySeed);
    hmac.update(userId);
    return hmac.digest('hex');
  }

  /**
   * Convert hex seed to 64-bit integer for PRNG initialization.
   * Takes first 16 hex characters (64 bits).
   */
  seedToInt64(seedHex: string): bigint {
    return BigInt('0x' + seedHex.substring(0, 16));
  }
}
```

**Design Rationale:**
- HMAC-SHA256 provides cryptographic-quality randomness
- Hex output is human-readable for debugging
- Two-stage seeding (daily → user) allows per-user variation while maintaining daily consistency
- BigInt conversion enables 64-bit PRNG seeding

### 2. PRNG (Pseudo-Random Number Generator)

Implements SplitMix64 for state initialization and Xoroshiro128+ for generation.

```typescript
/**
 * High-quality PRNG using SplitMix64 + Xoroshiro128+.
 * Provides deterministic random number generation from a 64-bit seed.
 */
export class PRNG {
  private state0: bigint;
  private state1: bigint;

  constructor(seed: bigint) {
    // Initialize state using SplitMix64
    const [s0, s1] = this.splitMix64Init(seed);
    this.state0 = s0;
    this.state1 = s1;
  }

  /**
   * SplitMix64 initialization to generate two 64-bit states.
   */
  private splitMix64Init(seed: bigint): [bigint, bigint] {
    let z = seed;
    z = (z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n;
    z = (z ^ (z >> 27n)) * 0x94d049bb133111ebn;
    const s0 = z ^ (z >> 31n);

    z = s0 + 1n;
    z = (z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n;
    z = (z ^ (z >> 27n)) * 0x94d049bb133111ebn;
    const s1 = z ^ (z >> 31n);

    return [s0 & 0xffffffffffffffffn, s1 & 0xffffffffffffffffn];
  }

  /**
   * Xoroshiro128+ next() - generates next 64-bit random number.
   */
  private next(): bigint {
    const s0 = this.state0;
    let s1 = this.state1;
    const result = (s0 + s1) & 0xffffffffffffffffn;

    s1 ^= s0;
    this.state0 = this.rotl(s0, 24n) ^ s1 ^ (s1 << 16n);
    this.state1 = this.rotl(s1, 37n);

    return result;
  }

  /**
   * Rotate left helper for Xoroshiro128+.
   */
  private rotl(x: bigint, k: bigint): bigint {
    return ((x << k) | (x >> (64n - k))) & 0xffffffffffffffffn;
  }

  /**
   * Generate uniformly distributed 32-bit unsigned integer.
   */
  nextUint(): number {
    return Number(this.next() >> 32n) >>> 0;
  }

  /**
   * Generate uniformly distributed float in [0, 1).
   */
  nextFloat(): number {
    return this.nextUint() / 0x100000000;
  }

  /**
   * Fisher-Yates shuffle using this PRNG.
   */
  shuffle<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.nextFloat() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  /**
   * Select random element from array.
   */
  choice<T>(array: T[]): T {
    if (array.length === 0) throw new Error('Cannot choose from empty array');
    const index = Math.floor(this.nextFloat() * array.length);
    return array[index];
  }
}
```

**Design Rationale:**
- SplitMix64 provides excellent state initialization from a single seed
- Xoroshiro128+ is fast, high-quality, and passes statistical tests
- BigInt operations ensure 64-bit precision without floating-point errors
- Fisher-Yates shuffle is the gold standard for unbiased shuffling
- All operations are deterministic and reproducible

### 3. Word Pools and Lexicon

JSON data structures loaded at startup and cached in memory.

**pools.v1.json structure:**
```json
{
  "version": "v1",
  "themes": {
    "nocturnal-cities": {
      "name": "Nocturnal Cities",
      "slots": {
        "subject": {
          "words": ["neon", "skyline", "alley", "street", "tower"],
          "clusters": ["urban", "urban", "urban", "urban", "urban"]
        },
        "action": {
          "words": ["glowing", "flickering", "reflecting", "pulsing"],
          "clusters": ["light", "light", "light", "light"]
        },
        "setting": {
          "words": ["rain", "fog", "night", "dusk", "midnight"],
          "clusters": ["weather", "weather", "time", "time", "time"]
        },
        "mood": {
          "words": ["mysterious", "lonely", "vibrant", "quiet"],
          "clusters": ["emotion", "emotion", "emotion", "emotion"]
        },
        "modifier": {
          "words": ["neon-lit", "shadowy", "wet", "empty", "crowded"],
          "clusters": ["descriptor", "descriptor", "descriptor", "descriptor", "descriptor"]
        }
      }
    }
  }
}
```

**lexicon.map.json structure:**
```json
{
  "version": "v1",
  "mappings": {
    "neon": { "canonical": "neon", "slot": "subject", "cluster": "urban" },
    "skyline": { "canonical": "skyline", "slot": "subject", "cluster": "urban" },
    "glowing": { "canonical": "glowing", "slot": "action", "cluster": "light" }
  }
}
```

**TypeScript interfaces:**
```typescript
export interface WordPools {
  version: string;
  themes: Record<string, Theme>;
}

export interface Theme {
  name: string;
  slots: Record<string, Slot>;
}

export interface Slot {
  words: string[];
  clusters: string[];
}

export interface LexiconMap {
  version: string;
  mappings: Record<string, WordMetadata>;
}

export interface WordMetadata {
  canonical: string;
  slot: string;
  cluster: string;
}
```

**Design Rationale:**
- JSON format is human-editable and version-controlled
- Slot-based organization enables balanced selection
- Cluster tags enable diversity enforcement
- Lexicon provides canonical mappings for validation
- In-memory caching ensures fast lookups

### 4. Word Selection Algorithms

#### Slot Coverage Algorithm

```typescript
/**
 * Ensure at least one word from each semantic slot.
 */
private selectSlotCoverage(
  theme: Theme,
  prng: PRNG,
  usedClusters: Set<string>
): string[] {
  const selected: string[] = [];
  const slotNames = Object.keys(theme.slots);

  for (const slotName of slotNames) {
    const slot = theme.slots[slotName];
    const candidates = slot.words
      .map((word, idx) => ({ word, cluster: slot.clusters[idx] }))
      .filter(({ cluster }) => !usedClusters.has(cluster));

    if (candidates.length === 0) {
      // All clusters used, pick any word from slot
      const word = prng.choice(slot.words);
      selected.push(word);
      continue;
    }

    // Shuffle candidates and pick first
    const shuffled = prng.shuffle(candidates);
    const chosen = shuffled[0];
    selected.push(chosen.word);
    usedClusters.add(chosen.cluster);
  }

  return selected;
}
```

#### Cluster Diversity Enforcement

```typescript
/**
 * Select additional words while respecting 1-per-cluster constraint.
 */
private selectWithDiversity(
  allWords: string[],
  count: number,
  prng: PRNG,
  usedClusters: Set<string>,
  lexicon: LexiconMap
): string[] {
  const selected: string[] = [];
  const shuffled = prng.shuffle(allWords);

  for (const word of shuffled) {
    if (selected.length >= count) break;

    const metadata = lexicon.mappings[word];
    if (!metadata) {
      // No metadata, treat as unique cluster
      selected.push(word);
      continue;
    }

    if (!usedClusters.has(metadata.cluster)) {
      selected.push(word);
      usedClusters.add(metadata.cluster);
    }
  }

  return selected;
}
```

#### Wildcard Selection

```typescript
/**
 * Add 2-3 wildcard words for variety.
 */
private selectWildcards(
  allWords: string[],
  count: number,
  prng: PRNG,
  usedWords: Set<string>,
  usedClusters: Set<string>,
  lexicon: LexiconMap
): string[] {
  const wildcards: string[] = [];
  const shuffled = prng.shuffle(allWords);

  for (const word of shuffled) {
    if (wildcards.length >= count) break;
    if (usedWords.has(word)) continue;

    const metadata = lexicon.mappings[word];
    if (metadata && usedClusters.has(metadata.cluster)) continue;

    wildcards.push(word);
    if (metadata) usedClusters.add(metadata.cluster);
  }

  return wildcards;
}
```

**Design Rationale:**
- Slot coverage ensures balanced representation
- Cluster diversity prevents semantic redundancy
- Wildcards add unpredictability and variety
- All algorithms use the same PRNG for determinism
- Graceful degradation when constraints can't be met

### 5. SeedingService (Main Orchestrator)

```typescript
/**
 * Main service for deterministic word generation.
 */
export class SeedingService {
  private readonly crypto: CryptoService;
  private readonly pools: WordPools;
  private readonly lexicon: LexiconMap;
  private readonly dataService: DataService;

  constructor(dataService: DataService) {
    const secret = process.env.DAILY_SEED_SECRET;
    if (!secret) {
      throw new Error('DAILY_SEED_SECRET environment variable is required');
    }

    this.crypto = new CryptoService(secret);
    this.pools = this.loadPools();
    this.lexicon = this.loadLexicon();
    this.dataService = dataService;
  }

  /**
   * Generate daily seed and store in Redis.
   */
  async generateDailySeed(date: string): Promise<SeedData> {
    this.validateDate(date);

    const seedHex = this.crypto.generateDailySeed(date);
    const theme = this.selectDailyTheme(seedHex);

    const seedData: SeedData = {
      seedHex,
      theme: theme.name,
      poolsVersion: this.pools.version,
      createdAt: Math.floor(Date.now() / 1000)
    };

    await this.dataService.setSeed(date, seedData);
    return seedData;
  }

  /**
   * Generate user-specific word set.
   */
  async generateUserWords(
    userId: string,
    date: string,
    count: number = 12
  ): Promise<string[]> {
    this.validateInputs(userId, date, count);

    // Get or create daily seed
    let seedData = await this.dataService.getSeed(date);
    if (!seedData) {
      seedData = await this.generateDailySeed(date);
    }

    // Generate user seed
    const userSeed = this.crypto.generateUserSeed(seedData.seedHex, userId);
    const seed64 = this.crypto.seedToInt64(userSeed);

    // Initialize PRNG
    const prng = new PRNG(seed64);

    // Get theme
    const theme = this.getTheme(seedData.theme);

    // Apply selection algorithms
    const usedClusters = new Set<string>();
    const selected: string[] = [];

    // 1. Slot coverage
    const slotWords = this.selectSlotCoverage(theme, prng, usedClusters);
    selected.push(...slotWords);

    // 2. Fill remaining with diversity
    const remaining = count - selected.length - 2; // Reserve 2 for wildcards
    if (remaining > 0) {
      const allWords = this.getAllWords(theme);
      const diverse = this.selectWithDiversity(
        allWords,
        remaining,
        prng,
        usedClusters,
        this.lexicon
      );
      selected.push(...diverse);
    }

    // 3. Add wildcards
    const wildcardCount = Math.min(2, count - selected.length);
    if (wildcardCount > 0) {
      const allWords = this.getAllWords(theme);
      const wildcards = this.selectWildcards(
        allWords,
        wildcardCount,
        prng,
        new Set(selected),
        usedClusters,
        this.lexicon
      );
      selected.push(...wildcards);
    }

    return selected.slice(0, count);
  }

  private loadPools(): WordPools {
    const path = './data/pools.v1.json';
    const data = fs.readFileSync(path, 'utf-8');
    return JSON.parse(data);
  }

  private loadLexicon(): LexiconMap {
    const path = './data/lexicon.map.json';
    const data = fs.readFileSync(path, 'utf-8');
    return JSON.parse(data);
  }

  private selectDailyTheme(seedHex: string): Theme {
    // Use first 8 chars of seed to select theme deterministically
    const themeKeys = Object.keys(this.pools.themes);
    const index = parseInt(seedHex.substring(0, 8), 16) % themeKeys.length;
    return this.pools.themes[themeKeys[index]];
  }

  private validateDate(date: string): void {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error('Date must be in YYYY-MM-DD format');
    }
  }

  private validateInputs(userId: string, date: string, count: number): void {
    if (!userId || userId.length === 0) {
      throw new Error('userId is required');
    }
    this.validateDate(date);
    if (count <= 0 || count > 100) {
      throw new Error('count must be between 1 and 100');
    }
  }
}
```

**Design Rationale:**
- Single entry point for word generation
- Lazy seed creation (generate if not exists)
- Composition of smaller algorithms
- Comprehensive validation
- Integration with existing DataService

## Data Models

### New Types

```typescript
// src/server/types/seeding.types.ts

export interface WordPools {
  version: string;
  themes: Record<string, Theme>;
}

export interface Theme {
  name: string;
  slots: Record<string, Slot>;
}

export interface Slot {
  words: string[];
  clusters: string[];
}

export interface LexiconMap {
  version: string;
  mappings: Record<string, WordMetadata>;
}

export interface WordMetadata {
  canonical: string;
  slot: string;
  cluster: string;
}
```

### Environment Variables

```bash
# .env
DAILY_SEED_SECRET=<64-character-random-hex-string>
USER_ID_PEPPER=<existing-from-phase-1>
```

## Error Handling

### Startup Errors (Fail Fast)

- Missing DAILY_SEED_SECRET → throw error, exit process
- Missing pool files → throw error, exit process
- Malformed JSON → throw error, exit process

### Runtime Errors (Graceful)

- Invalid date format → throw descriptive error
- Invalid userId → throw descriptive error
- Invalid count → throw descriptive error
- Redis failures → log error, continue (seed generation still works)

### Error Context

All errors include:
- Operation name
- Input parameters (sanitized)
- Timestamp
- Stack trace (in development)

## Testing Strategy

### Unit Tests

1. **CryptoService**
   - Same date → same daily seed
   - Same user+date → same user seed
   - Different dates → different seeds
   - Seed to int64 conversion

2. **PRNG**
   - Same seed → same sequence
   - nextUint() distribution (chi-square test)
   - nextFloat() range [0, 1)
   - shuffle() produces permutations
   - choice() uniform distribution

3. **Selection Algorithms**
   - Slot coverage includes all slots
   - Cluster diversity enforced
   - Wildcards don't duplicate
   - Determinism (same inputs → same outputs)

4. **SeedingService**
   - generateDailySeed() creates valid SeedData
   - generateUserWords() returns correct count
   - Same user+date → same words
   - Different users → different words
   - Validation errors thrown correctly

### Integration Tests

1. **Full Flow**
   - Generate seed → store in Redis → retrieve
   - Generate words → verify determinism
   - Multiple users → verify uniqueness

2. **Performance**
   - 1000 word sets in <150ms
   - Single word set in <1ms
   - Memory stable under load

### Manual Testing

1. **Determinism Verification**
   - Generate words for user A on date X
   - Restart server
   - Generate words for user A on date X again
   - Verify identical results

2. **Variety Verification**
   - Generate words for 100 different users
   - Verify slot coverage in all sets
   - Verify cluster diversity
   - Verify no duplicate sets

## Performance Considerations

### Optimizations

1. **In-Memory Caching**
   - Load pools/lexicon once at startup
   - Cache in service instance
   - No file I/O during requests

2. **Efficient Algorithms**
   - Fisher-Yates shuffle: O(n)
   - Cluster tracking: O(1) Set lookups
   - No unnecessary array copies

3. **Minimal Allocations**
   - Reuse PRNG instance per request
   - Pre-allocate result arrays
   - Avoid intermediate transformations

### Benchmarks

Target performance (measured with `console.time`):
- Single word set: <1ms
- 1000 word sets: <150ms
- Memory: <50MB for pools/lexicon

## Security Considerations

### Seed Security

- DAILY_SEED_SECRET must be cryptographically random
- Never log full seeds (only first 8 chars)
- Rotate secret if compromised (invalidates all historical seeds)

### User Privacy

- Use hashed userId (from IdentityService)
- Never log raw user IDs
- Seeds are deterministic but not reversible

### Input Validation

- Sanitize all inputs before processing
- Reject malformed dates/userIds
- Clamp count to reasonable range

## Migration and Deployment

### Phase 1 → Phase 2

1. Add DAILY_SEED_SECRET to environment
2. Deploy pool files to `data/` directory
3. Deploy new code with SeedingService
4. Verify startup (pools load successfully)
5. Test with sample API calls

### Rollback Plan

- Phase 2 has no database migrations
- Rollback = revert code + remove DAILY_SEED_SECRET
- No data loss (Phase 1 services unaffected)

## Future Enhancements (Out of Scope)

- Multiple themes per day (A/B testing)
- User preferences for word categories
- Dynamic pool updates without restart
- ML-based word similarity clustering
- Real-time pool analytics
