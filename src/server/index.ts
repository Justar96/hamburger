// Load environment variables from .env file
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { createServer, getServerPort, setContext } from '@devvit/server';
import { redis } from '@devvit/web/server';
import { IdentityService } from './services/identity.service';
import { TelemetryService } from './services/telemetry.service';
import { SeedingService } from './services/seeding.service';

// Validate required environment variables and initialize services at startup
// Note: _seedingService is created to validate pool/lexicon files at startup
// Test endpoints use TestSeedingService instead for isolated testing
let _seedingService: SeedingService;

try {
  // Instantiate IdentityService to trigger USER_ID_PEPPER validation
  new IdentityService();

  // Validate DAILY_SEED_SECRET
  const dailySeedSecret = process.env.DAILY_SEED_SECRET;
  if (!dailySeedSecret || dailySeedSecret.trim().length === 0) {
    throw new Error(
      'DAILY_SEED_SECRET environment variable is required. ' +
        "Generate one using: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }

  // Validate DAILY_SEED_SECRET is a proper hex string (64 characters recommended)
  if (!/^[0-9a-fA-F]+$/.test(dailySeedSecret)) {
    throw new Error(
      'DAILY_SEED_SECRET must be a valid hexadecimal string. ' +
        "Generate one using: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }

  if (dailySeedSecret.length < 32) {
    // eslint-disable-next-line no-console
    console.warn(
      '⚠ Warning: DAILY_SEED_SECRET is shorter than recommended (64 characters). ' +
        'Consider using a longer secret for better security.'
    );
  }

  // eslint-disable-next-line no-console
  console.log('✓ Environment variable validation passed');

  // Initialize SeedingService (validates env vars and loads pool files)
  _seedingService = new SeedingService(redis);
  // eslint-disable-next-line no-console
  console.log('✓ SeedingService initialized successfully');
} catch (error) {
  // eslint-disable-next-line no-console
  console.error(
    '✗ Configuration error:',
    error instanceof Error ? error.message : error
  );
  // eslint-disable-next-line no-console
  console.error('Server cannot start without required configuration.');
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

async function setupServer() {
  const app = express();

  // Middleware to parse JSON bodies
  app.use(express.json());

  // Serve static files from public directory
  app.use(express.static('public'));

  // Mount API router for client-facing endpoints
  const { createAPIRouter } = await import('./api/router.js');
  app.use('/api', createAPIRouter(redis));

  // Health check endpoint - validates server is running
  app.get('/api/health', async (req, res) => {
    try {
      const telemetry = new TelemetryService(redis);
      const date = new Date().toISOString().split('T')[0];

      // Increment health check counter (non-blocking, won't impact response time)
      await telemetry.incrementCounter(date, 'health_checks');
    } catch (error) {
      // Log but don't fail the health check
      console.error(
        'Telemetry increment failed for counter "health_checks" on date',
        new Date().toISOString().split('T')[0] + ':',
        error
      );
    }

    res.json({
      ok: true,
      ts: Date.now(),
    });
  });

  // Test endpoints - only available in development
  if (process.env.NODE_ENV !== 'production') {
    console.log('🔧 Loading test endpoints...');

    // Import enhanced TestSeedingService (with cluster diversity!)
    const { TestSeedingService } = await import(
      './services/test-seeding.service'
    );
    const testSeedingService = new TestSeedingService();

    // Import other services for test endpoints
    const { DataService } = await import('./services/data.service');
    const dataService = new DataService(redis);
    const identityService = new IdentityService();
    const telemetryService = new TelemetryService(redis);
    const { PostDataService } = await import('./services/postdata.service');

    // Test endpoint: Generate user words (using enhanced test service with cluster diversity)
    app.post('/api/test/seeding/generate-words', async (req, res) => {
      try {
        const { userId, date, count } = req.body;
        const words = await testSeedingService.generateUserWords(
          userId,
          date,
          count
        );
        res.json({ success: true, words });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        // Return 400 for validation errors, 500 for other errors
        const isValidationError =
          errorMessage.includes('must be') ||
          errorMessage.includes('required') ||
          errorMessage.includes('format');
        res.status(isValidationError ? 400 : 500).json({
          success: false,
          error: errorMessage,
        });
      }
    });

    // Test endpoint: Generate daily seed (using enhanced test service)
    app.post('/api/test/seeding/generate-seed', async (req, res) => {
      try {
        const { date } = req.body;
        const seedData = await testSeedingService.generateDailySeed(date);
        res.json({ success: true, seedData });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        // Return 400 for validation errors, 500 for other errors
        const isValidationError =
          errorMessage.includes('must be') ||
          errorMessage.includes('required') ||
          errorMessage.includes('format');
        res.status(isValidationError ? 400 : 500).json({
          success: false,
          error: errorMessage,
        });
      }
    });

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

        if (words) {
          // If words provided, increment tallies
          await dataService.incrementTallies(date, words);
        }

        // Get current tallies (more for testing)
        const topWords = await dataService.getTopWords(date, 50);

        res.json({
          success: true,
          tallies: topWords,
          topWords, // Keep both for backward compatibility
        });
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

    // Test endpoint: Pick endpoint (for integration testing)
    app.post('/api/test/pick', async (req, res) => {
      try {
        const { words, date, userId } = req.body;

        if (!userId) {
          return res.status(401).json({
            error: {
              code: 'UNAUTHORIZED',
              message: 'User authentication required',
            },
          });
        }

        // Import and use the actual pick endpoint handler
        const { handlePick } = await import('./api/pick.endpoint');
        const { RateLimitService } = await import(
          './services/rate-limit.service'
        );
        const rateLimitService = new RateLimitService(redis);

        // Create mock request/response objects
        const mockReq = {
          body: { words, date },
        } as any;

        let responseData: any = null;
        let statusCode = 200;

        const mockRes = {
          json: (data: any) => {
            responseData = data;
          },
          status: (code: number) => {
            statusCode = code;
            return mockRes;
          },
          set: () => mockRes,
        } as any;

        // Mock the Devvit context for testing
        const originalContext = (await import('@devvit/server')).context;
        (originalContext as any).userId = userId;

        // Call the actual pick handler
        await handlePick(
          mockReq,
          mockRes,
          testSeedingService as any, // Use test seeding service
          dataService,
          identityService,
          telemetryService,
          rateLimitService
        );

        // Return the response
        res.status(statusCode).json(responseData);
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

    console.log('✅ Test endpoints loaded successfully');
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

  return app;
}

// Create and start the server
async function startServer() {
  const app = await setupServer();
  const server = createServer(app);
  const port = getServerPort();

  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Server listening on port ${port}`);
  });

  return server;
}

// Start the server (wrap in async IIFE to avoid top-level await in CommonJS)
// Export the promise for testing purposes
const serverPromise = startServer();

// Start immediately (don't await at top level)
serverPromise.catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

export default serverPromise;
