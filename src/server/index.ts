import express from 'express';
import { createServer, getServerPort, setContext } from '@devvit/server';
import { redis } from '@devvit/web/server';
import { IdentityService } from './services/identity.service';
import { TelemetryService } from './services/telemetry.service';

// Validate required environment variables at startup
try {
  // Instantiate IdentityService to trigger USER_ID_PEPPER validation
  new IdentityService();
  // eslint-disable-next-line no-console
  console.log('✓ Environment variable validation passed');
} catch (error) {
  // eslint-disable-next-line no-console
  console.error(
    '✗ Configuration error:',
    error instanceof Error ? error.message : error
  );
  // eslint-disable-next-line no-console
  console.error('Server cannot start without required environment variables.');
  process.exit(1);
}

// In development, provide a mock context to satisfy Devvit requirements
if (process.env.NODE_ENV !== 'production') {
  setContext(() => ({
    subredditId: 't5_test',
    subredditName: 'test-subreddit',
    userId: 't2_test',
    postId: 't3_test',
    appAccountId: 't2_app',
    appName: 'choice-chorus',
    appVersion: '0.1.0',
    metadata: {
      appName: { values: ['choice-chorus'] },
      appVersion: { values: ['0.1.0'] },
    },
    debug: {
      effects: {},
      metadata: {},
      blocks: false,
      emitSnapshots: false,
      emitState: false,
      realtime: false,
      runtime: false,
      surface: false,
      useAsync: false,
      payments: false,
      bootstrap: false,
      webView: false,
    },
  }));
}

const app = express();

// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files from public directory
app.use(express.static('public'));

// Health check endpoint - validates server is running
app.get('/api/health', async (req, res) => {
  const telemetry = new TelemetryService(redis);
  const date = new Date().toISOString().split('T')[0];

  // Increment health check counter (non-blocking, won't impact response time)
  await telemetry.incrementCounter(date, 'health_checks');

  res.json({
    ok: true,
    ts: Date.now(),
  });
});

// Test endpoints - only available in development
if (process.env.NODE_ENV !== 'production') {
  // Use dynamic imports in an async context
  (async () => {
    const { DataService } = await import('./services/data.service');
    const dataService = new DataService(redis);
    const identityService = new IdentityService();
    const telemetryService = new TelemetryService(redis);
    const { PostDataService } = await import('./services/postdata.service');

    // Test endpoint: Full data flow
    app.post('/api/test/data-flow', async (req, res) => {
      try {
        const { date, userId, choices } = req.body;

        // Set seed data
        const seedData = {
          seedHex: '8d23abc123def456789abcdef0123456',
          theme: 'Test Theme',
          poolsVersion: 'v1',
          createdAt: Date.now(),
        };
        await dataService.setSeed(date, seedData);

        // Hash user ID and store choices
        const userHash = identityService.hashUserId(userId);
        await dataService.setUserChoices(date, userHash, choices);

        // Increment tallies
        await dataService.incrementTallies(date, choices);

        // Get top words
        const topWords = await dataService.getTopWords(date, 10);

        // Generate PostData
        const postData = PostDataService.generate(
          date,
          seedData.theme,
          seedData.seedHex,
          topWords
        );
        const validation = PostDataService.validate(postData);

        res.json({
          success: true,
          topWords,
          postData,
          validation,
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Test endpoint: Seed operations
    app.post('/api/test/seed', async (req, res) => {
      try {
        const { date, seedData } = req.body;
        await dataService.setSeed(date, seedData);
        const retrieved = await dataService.getSeed(date);
        res.json({ success: true, data: retrieved });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Test endpoint: User choices operations
    app.post('/api/test/choices', async (req, res) => {
      try {
        const { date, userId, choices } = req.body;
        const userHash = identityService.hashUserId(userId);
        await dataService.setUserChoices(date, userHash, choices);
        const retrieved = await dataService.getUserChoices(date, userHash);
        res.json({ success: true, data: retrieved, userHash });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Test endpoint: Tally operations
    app.post('/api/test/tallies', async (req, res) => {
      try {
        const { date, words } = req.body;
        await dataService.incrementTallies(date, words);
        const topWords = await dataService.getTopWords(date, 10);
        res.json({ success: true, topWords });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Test endpoint: Telemetry operations
    app.post('/api/test/telemetry', async (req, res) => {
      try {
        const { date, counter, latency } = req.body;
        if (counter) {
          await telemetryService.incrementCounter(date, counter);
        }
        if (latency !== undefined) {
          await telemetryService.recordLatency(date, latency);
        }
        const telemetry = await telemetryService.getTelemetry(date);
        res.json({ success: true, telemetry });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Test endpoint: Cleanup
    app.post('/api/test/cleanup', async (req, res) => {
      try {
        const { keys } = req.body;
        for (const key of keys) {
          await redis.del(key);
        }
        res.json({ success: true, deleted: keys.length });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });
  })(); // Close async IIFE
}

// Install trigger endpoint - called when app is installed
app.post('/internal/install', (req, res) => {
  // Initialize any required data structures here
  // For Phase 0, just acknowledge the installation
  res.json({
    status: 'installed',
  });
});

// Error handling for unknown routes
app.use((req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route not found: ${req.method} ${req.url}`,
    },
  });
});

// Create and start the server
const server = createServer(app);
const port = getServerPort();
server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on port ${port}`);
});

export default server;
