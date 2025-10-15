# Devvit Testing Architecture Notes

## Key Findings from Devvit Documentation

### Devvit Web Development Model

Devvit Web uses a **hybrid architecture**:

```
┌─────────────────────────────────────────────────────────┐
│  Local Development (pnpm run dev / devvit playtest)     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Client (Browser)          Server (Local tsx watch)     │
│  ├─ React/Vue/etc         ├─ Express/Koa/etc           │
│  ├─ Runs locally          ├─ Runs locally              │
│  └─ Hot reload            └─ Auto-restart              │
│                                  │                       │
│                                  ▼                       │
│                           Devvit Infrastructure         │
│                           ├─ Redis                      │
│                           ├─ Reddit API                 │
│                           ├─ Scheduler                  │
│                           ├─ Settings                   │
│                           └─ Realtime                   │
└─────────────────────────────────────────────────────────┘
```

### Critical Understanding

1. **Server runs locally** with `tsx watch` (or similar)
2. **Capabilities connect remotely** to Reddit's infrastructure
3. **Redis is NOT local** - it's provided by Reddit through the playtest connection
4. **Testing must use playtest** to access Redis and other capabilities

### Why Our Integration Tests Fail

The tests try to use `redis` from `@devvit/web/server` directly in Vitest:

```typescript
import { redis } from '@devvit/web/server';
const dataService = new DataService(redis);
```

This fails because:
- ❌ No Devvit runtime initialized
- ❌ No connection to Reddit's infrastructure
- ❌ No playtest environment active

### Devvit's Testing Philosophy

According to the documentation:

1. **Unit Tests**: Test isolated logic with mocks (what we have ✅)
2. **Playtest**: Manual testing with real services (recommended approach)
3. **E2E Tests**: Test full user flows (what we have with Playwright ✅)

**Devvit does NOT provide** a way to run integration tests with real Redis outside of playtest.

## Solutions for Integration Testing

### Solution 1: API-Based Integration Tests (Recommended)

Create test endpoints and test through HTTP:

```typescript
// server/index.ts - Add test endpoints (only in dev)
if (process.env.NODE_ENV === 'development') {
  app.post('/api/test/data-flow', async (req, res) => {
    const { date, userId, choices } = req.body;
    
    // Full data flow
    const seedData = { /* ... */ };
    await dataService.setSeed(date, seedData);
    
    const userHash = identityService.hashUserId(userId);
    await dataService.setUserChoices(date, userHash, choices);
    await dataService.incrementTallies(date, choices);
    
    const topWords = await dataService.getTopWords(date, 10);
    
    res.json({ success: true, topWords });
  });
}
```

```typescript
// tests/integration/data-layer-api.test.ts
describe('Data Layer API Integration', () => {
  let serverProcess: ChildProcess;
  
  beforeAll(async () => {
    // Start playtest server
    serverProcess = spawn('devvit', ['playtest']);
    await waitForServer();
  });
  
  it('should complete full data flow', async () => {
    const response = await fetch('http://localhost:3000/api/test/data-flow', {
      method: 'POST',
      body: JSON.stringify({
        date: '2025-10-14',
        userId: 't2_testuser',
        choices: ['neon', 'rain', 'alley']
      })
    });
    
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.topWords).toHaveLength(3);
  });
});
```

### Solution 2: Manual Testing Procedures

Document test procedures for manual execution in playtest:

```markdown
## Manual Integration Test Procedure

1. Start playtest: `pnpm run dev`
2. Navigate to test subreddit
3. Create a post with your app
4. Perform these actions:
   - [ ] Submit word choices
   - [ ] Verify tallies update
   - [ ] Check top words display
   - [ ] Verify PostData < 2KB
   - [ ] Check telemetry recording
5. Verify in logs:
   - [ ] Redis operations succeed
   - [ ] TTL set correctly
   - [ ] User ID hashing works
```

### Solution 3: Keep as Documentation

The current integration tests serve as:
- Specification of expected behavior
- Documentation of service interactions
- Reference for future testing infrastructure

## Recommended Approach for This Project

Given the constraints and timeline:

1. ✅ **Keep unit tests** - They provide excellent coverage with mocks
2. ✅ **Keep E2E tests** - They verify end-to-end user flows
3. ✅ **Keep integration test file** - As specification/documentation
4. ✅ **Add README** - Explaining the situation (done)
5. ⚠️ **Optional**: Add API-based integration tests if time permits

## Why This Is Acceptable

1. **Unit tests** cover all service logic thoroughly
2. **E2E tests** verify the app works end-to-end
3. **Manual playtest** provides real integration testing
4. **Integration test file** documents expected behavior
5. **This is the Devvit way** - The framework doesn't provide isolated integration testing

## References

- [Devvit Playtest Documentation](https://developers.reddit.com/docs/guides/tools/playtest)
- [Devvit Web Overview](https://developers.reddit.com/docs/capabilities/devvit-web/devvit_web_overview)
- [Devvit Server Documentation](https://developers.reddit.com/docs/capabilities/devvit-web/server)
- [Redis in Devvit](https://developers.reddit.com/docs/capabilities/server/redis)

## Conclusion

The integration tests are **correctly structured** but require the Devvit playtest environment to execute. This is a framework limitation, not a test design issue. The tests serve as valuable documentation and specification of expected integration behavior.

For true integration testing with Devvit, the recommended approach is:
1. Use `devvit playtest` for development
2. Test through your app's UI and API endpoints
3. Monitor logs for verification
4. Use unit tests for isolated logic
5. Use E2E tests for user flows
