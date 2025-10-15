# Manual Integration Testing Guide

This guide helps you manually test the integration of all data layer components with real Redis through the Devvit playtest environment.

## Prerequisites

1. Start the development server:
   ```bash
   pnpm run dev
   ```

2. Wait for the server to start and show "Server listening on port 3000"

## Test Scenarios

### Test 1: Full Data Flow

Test the complete flow: setSeed → setUserChoices → incrementTallies → getTopWords

```bash
curl -X POST http://localhost:3000/api/test/data-flow \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2025-10-15",
    "userId": "t2_testuser123",
    "choices": ["neon", "rain", "alley", "midnight", "glow"]
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "topWords": [
    {"word": "neon", "count": 1},
    {"word": "rain", "count": 1},
    {"word": "alley", "count": 1},
    {"word": "midnight", "count": 1},
    {"word": "glow", "count": 1}
  ],
  "postData": {
    "date": "2025-10-15",
    "theme": "Test Theme",
    "seedPreview": "8d23abc1",
    "timeLeftSec": <number>,
    "teaserTop": ["neon", "rain", "alley", "midnight", "glow"]
  },
  "validation": {
    "valid": true,
    "size": <number less than 2000>,
    "errors": []
  }
}
```

### Test 2: Seed Operations

```bash
curl -X POST http://localhost:3000/api/test/seed \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2025-10-15",
    "seedData": {
      "seedHex": "abc123def456",
      "theme": "Nocturnal Cities",
      "poolsVersion": "v1",
      "createdAt": 1729000000000
    }
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "seedHex": "abc123def456",
    "theme": "Nocturnal Cities",
    "poolsVersion": "v1",
    "createdAt": 1729000000000
  }
}
```

### Test 3: User Choices with Hashing

```bash
curl -X POST http://localhost:3000/api/test/choices \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2025-10-15",
    "userId": "t2_testuser456",
    "choices": ["cyber", "punk", "future"]
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": ["cyber", "punk", "future"],
  "userHash": "<64-character hex string>"
}
```

### Test 4: Tally Operations

```bash
# Increment tallies
curl -X POST http://localhost:3000/api/test/tallies \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2025-10-15",
    "words": ["neon", "neon", "rain"]
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "topWords": [
    {"word": "neon", "count": 2},
    {"word": "rain", "count": 1}
  ]
}
```

### Test 5: Telemetry Operations

```bash
curl -X POST http://localhost:3000/api/test/telemetry \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2025-10-15",
    "counter": "requests",
    "latency": 42
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "telemetry": {
    "requests": 1,
    "errors": 0,
    "p95Samples": [42]
  }
}
```

### Test 6: Multiple Users Voting

```bash
# User 1
curl -X POST http://localhost:3000/api/test/data-flow \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2025-10-15",
    "userId": "t2_user1",
    "choices": ["neon", "rain", "alley"]
  }'

# User 2
curl -X POST http://localhost:3000/api/test/data-flow \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2025-10-15",
    "userId": "t2_user2",
    "choices": ["neon", "rain", "shadow"]
  }'

# User 3
curl -X POST http://localhost:3000/api/test/data-flow \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2025-10-15",
    "userId": "t2_user3",
    "choices": ["neon", "cyber", "glow"]
  }'
```

**Expected:** "neon" should have count of 3, "rain" should have count of 2, others should have count of 1.

### Test 7: Cleanup

After testing, clean up test keys:

```bash
curl -X POST http://localhost:3000/api/test/cleanup \
  -H "Content-Type: application/json" \
  -d '{
    "keys": [
      "seed:2025-10-15",
      "choices:2025-10-15",
      "tallies:2025-10-15",
      "telemetry:2025-10-15",
      "telemetry:2025-10-15:p95"
    ]
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "deleted": 5
}
```

## Verification Checklist

- [ ] Full data flow completes successfully
- [ ] Seed data is stored and retrieved correctly
- [ ] User IDs are hashed consistently (64-character hex)
- [ ] Tallies increment correctly
- [ ] Top words are sorted by count (descending)
- [ ] PostData is generated under 2KB
- [ ] Telemetry counters increment
- [ ] Telemetry latency samples are recorded
- [ ] Multiple users can vote for the same words
- [ ] Cleanup removes test keys

## Troubleshooting

### Server Not Starting
- Ensure `USER_ID_PEPPER` is set in `.env`
- Check that port 3000 is not in use
- Verify Devvit CLI is installed: `devvit --version`

### Redis Errors
- Ensure you're running through `pnpm run dev` (not `tsx` directly)
- The Devvit runtime must be initialized for Redis access
- Check server logs for specific error messages

### Test Endpoints Not Found
- Verify `NODE_ENV` is set to `development`
- Test endpoints are only available in development mode
- Check server logs to confirm endpoints were registered

## Notes

- Test endpoints are **only available in development mode**
- They will not be included in production builds
- All test data uses the date `2025-10-15` for easy cleanup
- User ID hashes are deterministic (same input → same output)
- Redis keys automatically expire after 7 days
