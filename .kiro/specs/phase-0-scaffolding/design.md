# Phase 0 Scaffolding - Design Document

## Overview

Phase 0 establishes the foundational infrastructure for the Choice Chorus (Beef) Devvit Web application. This design focuses on creating a minimal but production-ready skeleton that validates the entire toolchain - from local development through CI/CD to Devvit platform compliance. The architecture follows Devvit Web's prescribed patterns with clear separation between client webview and server endpoints.

**Key Design Principles:**
- Start with the absolute minimum that validates the platform
- Ensure every component can be tested in isolation
- Follow Devvit Web conventions strictly (no legacy patterns)
- Make CI/CD a first-class concern from day one

## Architecture

### High-Level Structure

```
choice-chorus/
├── .github/
│   └── workflows/
│       └── ci.yml                 # GitHub Actions pipeline
├── .kiro/
│   └── specs/
│       └── phase-0-scaffolding/   # This spec
├── src/
│   ├── client/                    # Webview code
│   │   └── index.html            # Minimal app shell
│   └── server/                    # Node.js server
│       └── index.ts              # Express-style router
├── public/                        # Built client assets
├── dist/
│   └── server/
│       └── index.js              # Compiled server bundle
├── devvit.json                    # Devvit platform config
├── package.json
├── tsconfig.json
├── .eslintrc.json
├── .prettierrc
├── .env.example
├── .gitignore
├── README.md
└── SUBMISSION.md
```

### Technology Stack

- **Runtime:** Node.js LTS (v20+)
- **Package Manager:** pnpm (preferred) or npm
- **Language:** TypeScript with strict mode
- **Testing:** Vitest for unit/integration, Playwright for e2e
- **Linting:** ESLint with TypeScript support
- **Formatting:** Prettier
- **CI/CD:** GitHub Actions
- **Platform:** Devvit Web (Reddit)

### Devvit Web Platform Constraints

1. **Endpoint Namespacing:**
   - Client-facing routes: `/api/*`
   - Internal routes (scheduler/triggers): `/internal/*`

2. **Limits:**
   - 30s max execution time
   - 4MB request / 10MB response
   - No WebSockets (use Realtime API or long-polling)
   - No native packages or `fs` access

3. **Configuration:**
   - Schema: `https://developers.reddit.com/schema/config-file.v1.json`
   - Required sections: `post`, `server`, `permissions`
   - Optional: `scheduler`, `triggers`, `marketingAssets`

## Components and Interfaces

### 1. Repository Structure

**Component:** Git repository with branch protection

**Interface:**
```bash
# Branch strategy
main (protected)
  ← feature/* (via PR + squash merge)
```

**Implementation Notes:**
- Configure branch protection rules in GitHub
- Require PR reviews (can be 0 for solo dev, but structure is there)
- Require CI status checks to pass
- Enable squash merge only

### 2. Package Configuration

**Component:** `package.json` with scripts and dependencies

**Interface:**
```json
{
  "name": "choice-chorus",
  "version": "0.1.0",
  "scripts": {
    "dev": "concurrently \"npm:dev:*\"",
    "dev:server": "tsx watch src/server/index.ts",
    "dev:client": "vite",
    "build": "npm run build:server && npm run build:client",
    "build:server": "tsc -p tsconfig.server.json",
    "build:client": "vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "lint": "eslint src/",
    "format": "prettier --write src/",
    "validate": "devvit validate"
  }
}
```

**Key Dependencies:**
- `typescript`, `tsx`, `@types/node`
- `vitest`, `@playwright/test`
- `eslint`, `prettier`
- `@devvit/web` (client and server imports)
- `express` or similar for routing (optional, can use raw handlers)

### 3. TypeScript Configuration

**Component:** Dual tsconfig setup for client and server

**Interface:**

`tsconfig.json` (base):
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true
  }
}
```

`tsconfig.server.json`:
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "CommonJS",
    "outDir": "./dist/server",
    "rootDir": "./src/server"
  },
  "include": ["src/server/**/*"]
}
```

### 4. Devvit Configuration

**Component:** `devvit.json` platform manifest

**Interface:**
```json
{
  "$schema": "https://developers.reddit.com/schema/config-file.v1.json",
  "name": "choice-chorus",
  
  "post": {
    "dir": "public",
    "entrypoints": {
      "default": {
        "entry": "index.html",
        "height": "tall"
      }
    }
  },
  
  "server": {
    "entry": "dist/server/index.js"
  },
  
  "permissions": {
    "redis": true,
    "realtime": true,
    "media": true,
    "http": {
      "enable": false
    },
    "reddit": {
      "enable": false
    }
  },
  
  "triggers": {
    "onAppInstall": "/internal/install"
  },
  
  "dev": {
    "subreddit": "your-test-subreddit"
  }
}
```

**Design Rationale:**
- Start with minimal permissions (redis, realtime, media)
- HTTP and reddit permissions disabled initially (will enable in later phases)
- Install trigger provides a hook for initialization logic
- Scheduler tasks will be added in Phase 10

### 5. Server Entry Point

**Component:** Minimal server with health check and install handler

**Interface:**
```typescript
// src/server/index.ts
import { Devvit } from '@devvit/web/server';

Devvit.configure({
  redis: true,
  realtime: true,
  media: true,
});

// Client-facing health check
Devvit.addCustomPostType({
  name: 'choice-chorus',
  height: 'tall',
  render: () => {
    return (
      <vstack>
        <text>Choice Chorus</text>
      </vstack>
    );
  },
});

// API Routes
Devvit.addRoute('GET', '/api/health', async (req, context) => {
  return {
    ok: true,
    ts: Date.now(),
  };
});

// Internal trigger
Devvit.addRoute('POST', '/internal/install', async (req, context) => {
  // Initialize any required data structures
  return { status: 'installed' };
});

export default Devvit;
```

**Design Rationale:**
- Use Devvit's native routing (no Express needed initially)
- Health endpoint validates server is running
- Install trigger provides initialization hook
- Response times target <100ms for health check

### 6. Client Shell

**Component:** Minimal HTML app shell

**Interface:**
```html
<!-- public/index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Choice Chorus</title>
  <style>
    body {
      margin: 0;
      padding: 16px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0e1113;
      color: #d7dadc;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
    }
    .status {
      padding: 12px;
      background: #1a1a1b;
      border-radius: 4px;
      margin-top: 16px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Choice Chorus</h1>
    <p>Phase 0 - Scaffolding Complete</p>
    <div class="status" id="status">
      Checking server health...
    </div>
  </div>
  
  <script type="module">
    // Verify server connectivity
    fetch('/api/health')
      .then(r => r.json())
      .then(data => {
        document.getElementById('status').textContent = 
          `✓ Server healthy (${new Date(data.ts).toLocaleTimeString()})`;
      })
      .catch(err => {
        document.getElementById('status').textContent = 
          `✗ Server error: ${err.message}`;
      });
  </script>
</body>
</html>
```

**Design Rationale:**
- Self-contained HTML file (no build step needed for Phase 0)
- Validates client-server communication
- Reddit-themed dark mode styling
- Mobile-first responsive design

### 7. CI/CD Pipeline

**Component:** GitHub Actions workflow

**Interface:**
```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install
      - run: pnpm lint
      - run: pnpm format --check

  test-unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install
      - run: pnpm test

  test-integration:
    runs-on: ubuntu-latest
    services:
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install
      - run: pnpm test:integration
        env:
          REDIS_URL: redis://localhost:6379

  test-e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install
      - run: npx playwright install --with-deps
      - run: pnpm test:e2e

  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install
      - run: pnpm build
      - run: pnpm validate
```

**Design Rationale:**
- Parallel job execution for speed
- Redis service container for integration tests
- Playwright with browser installation for e2e
- Devvit validation as final build step

### 8. Environment Configuration

**Component:** Environment variable management

**Interface:**

`.env.example`:
```bash
# Local development only - DO NOT COMMIT .env
NODE_ENV=development
PORT=3000

# Redis (local)
REDIS_URL=redis://localhost:6379

# Vertex AI (for later phases)
# GCP_PROJECT_ID=your-project
# GCP_LOCATION=us-central1
# VERTEX_API_KEY=your-key
```

`.gitignore`:
```
node_modules/
dist/
.env
.env.local
*.log
.DS_Store
coverage/
playwright-report/
test-results/
```

**Design Rationale:**
- Example file documents all required variables
- Actual .env excluded from version control
- GitHub secrets used for CI/CD
- Clear separation between local and production config

## Data Models

### Phase 0 Data Structures

**Health Check Response:**
```typescript
interface HealthResponse {
  ok: boolean;
  ts: number;
}
```

**Install Response:**
```typescript
interface InstallResponse {
  status: 'installed' | 'error';
  message?: string;
}
```

**Note:** Full data models (seeds, choices, tallies, etc.) will be defined in Phase 1-2.

## Error Handling

### Server Error Response Format

```typescript
interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
```

### Error Handling Strategy

1. **Validation Errors:** Return 400 with descriptive message
2. **Server Errors:** Return 500 with sanitized message (no stack traces in production)
3. **Timeout Errors:** Return 504 if operation exceeds 30s
4. **Not Found:** Return 404 for unknown routes

### Logging

- Use structured logging (JSON format)
- Log levels: ERROR, WARN, INFO, DEBUG
- Never log secrets or PII
- Include request ID for tracing

## Testing Strategy

### Unit Tests

**Scope:** Individual functions and utilities

**Framework:** Vitest

**Coverage Target:** N/A for Phase 0 (no business logic yet)

**Example Test:**
```typescript
// src/server/__tests__/health.test.ts
import { describe, it, expect } from 'vitest';

describe('Health endpoint', () => {
  it('returns ok status', async () => {
    const response = await fetch('http://localhost:3000/api/health');
    const data = await response.json();
    
    expect(data.ok).toBe(true);
    expect(data.ts).toBeGreaterThan(0);
  });
});
```

### Integration Tests

**Scope:** API endpoints with Redis

**Framework:** Vitest with Redis container

**Coverage Target:** All `/api/*` and `/internal/*` routes

**Note:** Phase 0 has minimal integration surface; will expand in Phase 2.

### E2E Tests

**Scope:** Full user flows in browser

**Framework:** Playwright

**Example Test:**
```typescript
// tests/e2e/smoke.spec.ts
import { test, expect } from '@playwright/test';

test('app loads and shows health status', async ({ page }) => {
  await page.goto('http://localhost:3000');
  
  await expect(page.locator('h1')).toContainText('Choice Chorus');
  await expect(page.locator('#status')).toContainText('Server healthy');
});
```

### CI Test Execution

1. **Lint** → Fast fail on style issues
2. **Unit** → Validate logic in isolation
3. **Integration** → Validate API contracts
4. **E2E** → Validate user experience
5. **Build** → Validate deployment artifacts

## Documentation

### README.md Structure

```markdown
# Choice Chorus

Daily collaborative prompt generation for Reddit.

## Quick Start

\`\`\`bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Run tests
pnpm test

# Build for production
pnpm build
\`\`\`

## Development

- Node.js 20+ required
- Redis required for local development
- See .env.example for configuration

## Testing

- Unit: `pnpm test`
- E2E: `pnpm test:e2e`
- All: `pnpm test:all`

## Deployment

\`\`\`bash
devvit upload --env production
\`\`\`
```

### SUBMISSION.md Structure

```markdown
# Hackathon Submission - Choice Chorus

## Team
[Your name/team]

## Categories
- Community Play
- Kiro DevEx (optional)

## Description
[Brief description]

## Technical Stack
- Devvit Web
- TypeScript
- Redis
- Vertex AI

## Demo
[Link to demo post]

## Video
[Link to demo video]

## Source
[Link to repository]
```

## Validation Checklist

Phase 0 is complete when:

- [ ] Repository created with protected main branch
- [ ] `pnpm install` succeeds
- [ ] `pnpm dev` starts server and client
- [ ] `http://localhost:3000/api/health` returns `{ ok: true, ts: <number> }`
- [ ] `pnpm lint` passes
- [ ] `pnpm format --check` passes
- [ ] `pnpm test` passes (even if no tests yet)
- [ ] `pnpm build` produces `dist/server/index.js`
- [ ] `devvit validate` passes
- [ ] CI pipeline runs and all jobs pass
- [ ] README has run instructions
- [ ] SUBMISSION.md skeleton exists

## Next Steps

After Phase 0 completion:

1. **Phase 1 (Day 1):** Implement data layer (Redis services, postData, user identity)
2. **Phase 2 (Day 2):** Build deterministic seeding engine
3. **Phase 3 (Day 3-4):** Create client-facing APIs

Phase 0 provides the foundation; all subsequent phases build incrementally on this structure.
