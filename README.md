# Choice Chorus

Daily collaborative prompt generation for Reddit communities, built with Devvit Web.

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

## Development

### Prerequisites

- Node.js 20+ required
- Redis required for local development (see [CI Setup Guide](docs/ci-setup.md) for Upstash Redis)
- Devvit CLI for deployment

### Environment Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

#### Required Environment Variables

- **`USER_ID_PEPPER`** - Secret value for hashing user IDs (minimum 32 characters)
  - Generate using: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
  - Must remain consistent across all deployments
  - Never commit this value to version control

#### Optional Environment Variables

- **`UPSTASH_REDIS_URL`** - Redis connection URL (Devvit provides this automatically in production)
- **`NODE_ENV`** - Environment mode (development/production)
- **`PORT`** - Server port (default: 3000)

See `.env.example` for all available configuration options and detailed documentation.

### Local Development

```bash
# Start development server with hot reload
npm run dev

# Server will be available at http://localhost:3000
# Health check: http://localhost:3000/api/health
```

## Testing

```bash
# Run unit tests (288 tests)
npm test

# Run integration tests (requires playtest environment)
npm run test:integration

# Run e2e tests
npm run test:e2e

# Run all tests (unit + integration + e2e)
npm run test:all

# Run tests in watch mode (for development)
npm run test:watch
```

**Note**: Integration tests require the Devvit runtime. See [Testing Guide](docs/TESTING.md) for details.

### Manual Integration Testing

```bash
# Start Devvit playtest environment
npm run dev

# Follow the manual testing guide
# See: tests/manual-integration-test.md
```

## Building

```bash
# Build server and client
npm run build

# Validate Devvit configuration
npm run validate
```

## CI/CD Configuration

### GitHub Secrets

The CI pipeline requires the following secrets to be configured in your GitHub repository:

#### Required for Phase 0

- **`UPSTASH_REDIS_URL`** - Upstash Redis connection URL for integration tests
  - Format: `rediss://default:[password]@[host].upstash.io:[port]`
  - See [CI Setup Guide](docs/ci-setup.md) for detailed setup instructions

#### Placeholders for Future Phases

The following secrets are not required for Phase 0 but will be needed in later phases:

- **`GCP_PROJECT_ID`** - Google Cloud Project ID for Vertex AI integration
  - Required for: Phase 3+ (AI prompt generation)
  - Format: Your GCP project identifier (e.g., `my-project-12345`)

- **`VERTEX_API_KEY`** - Vertex AI API key for authentication
  - Required for: Phase 3+ (AI prompt generation)
  - Format: Your Vertex AI API key

### Setting Up GitHub Secrets

1. Navigate to your repository on GitHub
2. Go to **Settings** > **Secrets and variables** > **Actions**
3. Click **New repository secret**
4. Add each secret with the exact name shown above
5. Save each secret

### CI Pipeline

The GitHub Actions workflow runs automatically on:
- Push to `main` branch
- Pull requests to `main` branch

Pipeline stages:
1. **Lint** - Code style and formatting checks
2. **Test (Unit)** - Unit tests with Vitest
3. **Test (Integration)** - Integration tests with Redis
4. **Test (E2E)** - End-to-end tests with Playwright
5. **Build** - TypeScript compilation and Devvit validation

## Deployment

```bash
# Validate configuration
devvit validate

# Upload to Reddit (production)
devvit upload --env production

# Upload to test subreddit
devvit upload --env development
```

## Project Structure

```
choice-chorus/
├── .github/workflows/    # CI/CD configuration
├── src/
│   ├── client/          # Webview code
│   └── server/          # Node.js server
├── public/              # Built client assets
├── dist/                # Compiled output
├── tests/               # Test files
├── docs/                # Documentation
├── devvit.json          # Devvit platform config
└── package.json         # Project metadata
```

## Documentation

- [Testing Guide](docs/TESTING.md) - Comprehensive testing documentation
- [CI/CD Setup Guide](docs/ci-setup.md) - Detailed CI configuration instructions
- [Integration Testing Summary](tests/integration/SUMMARY.md) - Integration testing approach
- [Manual Testing Guide](tests/manual-integration-test.md) - Step-by-step testing instructions
- [Submission](SUBMISSION.md) - Hackathon submission details

## License

MIT
