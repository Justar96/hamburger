import express from 'express';
import { createServer, getServerPort, setContext } from '@devvit/server';

// In development, provide a mock context to satisfy Devvit requirements
if (process.env.NODE_ENV !== 'production') {
  setContext(() => ({
    subredditId: 't5_test',
    subredditName: 'test-subreddit',
    userId: 't2_test',
    postId: 't3_test',
    appAccountId: 't2_app',
    appName: 'choice-chorus',
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
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    ts: Date.now(),
  });
});

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
  console.log(`Server listening on port ${port}`);
});

export default server;
