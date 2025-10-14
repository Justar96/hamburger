# Implementation Plan

- [x] 1. Initialize repository and version control





  - Create new repository named "choice-chorus"
  - Initialize git with main branch
  - Create .gitignore file with node_modules, dist, .env, coverage, and test artifacts
  - Set up branch protection rules for main branch (require PR, squash merge only)
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 2. Set up package.json and dependencies





  - Create package.json with project metadata and scripts (dev, build, test, lint, format, validate)
  - Install TypeScript, tsx, and @types/node
  - Install Vitest for unit testing
  - Install Playwright for e2e testing
  - Install ESLint and Prettier with TypeScript support
  - Install @devvit/web package for client and server imports
  - _Requirements: 2.1, 2.2, 3.1, 3.4, 2.3, 2.4_

- [x] 3. Configure TypeScript





  - Create base tsconfig.json with strict mode, ES2022 target, and ESNext module
  - Create tsconfig.server.json extending base config with CommonJS output to dist/server
  - Verify TypeScript compilation works with a simple test file
  - _Requirements: 2.5, 2.6, 9.1_

- [x] 3.1 Write unit tests for TypeScript configuration


  - Create tests/typescript.test.ts
  - Test that tsconfig.json is valid JSON and has required compiler options
  - Test that strict mode is enabled
  - Test that tsconfig.server.json extends base config correctly
  - Test that a sample TypeScript file compiles without errors
  - _Requirements: 2.5, 9.1_

- [x] 4. Set up linting and formatting





  - Create .eslintrc.json with TypeScript rules and recommended configs
  - Create .prettierrc with consistent formatting rules (2 spaces, single quotes, trailing commas)
  - Add lint and format scripts to package.json
  - Verify eslint and prettier run without errors on empty src/ directory
  - _Requirements: 2.3, 2.4_

- [x] 5. Create project directory structure




  - Create src/client/ directory for webview code
  - Create src/server/ directory for Node.js server code
  - Create public/ directory for built client assets
  - Create dist/ directory structure for compiled output
  - Create .github/workflows/ directory for CI configuration
  - _Requirements: 2.6, 8.2, 9.2_

- [x] 6. Create devvit.json configuration




  - Create devvit.json with schema reference to Devvit Web v1
  - Configure post section with public dir and default entrypoint (index.html, tall height)
  - Configure server section with entry pointing to dist/server/index.js
  - Configure permissions section with redis, realtime, and media enabled
  - Add onAppInstall trigger pointing to /internal/install
  - Add dev section with test subreddit placeholder
  - _Requirements: 6.1, 6.2, 6.4, 6.5, 9.5_

- [x] 6.1 Write unit tests for devvit.json validation


  - Create tests/config.test.ts
  - Test that devvit.json is valid JSON
  - Test that required fields (name, post, server, permissions) exist
  - Test that post.entrypoints.default.entry points to existing file
  - Test that server.entry path is correct
  - Test that permissions structure is valid
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 7. Implement server entry point with health check




  - Create src/server/index.ts with Devvit configuration
  - Implement GET /api/health endpoint returning { ok: true, ts: timestamp }
  - Implement POST /internal/install endpoint returning { status: 'installed' }
  - Add basic error handling for unknown routes
  - Ensure health endpoint responds in under 100ms
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_


- [x] 7.1 Write unit tests for health endpoint

  - Create src/server/__tests__/health.test.ts
  - Test that /api/health returns ok: true
  - Test that /api/health returns valid timestamp
  - Test that response time is under 100ms
  - Test error handling for malformed requests
  - _Requirements: 7.2, 7.3, 7.4_


- [x] 7.2 Write unit tests for install endpoint

  - Create src/server/__tests__/install.test.ts
  - Test that /internal/install returns status: 'installed'
  - Test that endpoint handles POST method correctly
  - Test error handling for invalid payloads
  - _Requirements: 7.5_

- [x] 8. Create minimal client HTML shell





  - Create public/index.html with basic HTML5 structure
  - Add Reddit-themed dark mode styling (background #0e1113, text #d7dadc)
  - Add container with heading "Choice Chorus" and status indicator
  - Add inline script to fetch /api/health and display server status
  - Ensure mobile-responsive layout with max-width container
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 8.1 Write e2e tests for client shell


  - Create tests/e2e/client-shell.spec.ts using Playwright
  - Test that page loads and displays "Choice Chorus" heading
  - Test that status indicator shows server health check result
  - Test that page is responsive on mobile viewport (375px width)
  - Test that fetch to /api/health completes successfully
  - Test error state when server is unreachable
  - _Requirements: 8.1, 8.3, 8.4, 8.5_

- [x] 9. Configure build pipeline




  - Add build:server script to compile TypeScript to dist/server/index.js
  - Add build:client script to copy public/ assets (or use Vite if needed)
  - Add build script that runs both server and client builds
  - Verify build output matches devvit.json entry points
  - Test that built server can be run with node dist/server/index.js
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [x] 9.1 Write unit tests for build validation


  - Create tests/build.test.ts
  - Test that dist/server/index.js exists after build
  - Test that public/ directory contains index.html
  - Test that built files are valid (no syntax errors)
  - Test that build script exits with code 0 on success
  - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [x] 10. Set up environment configuration




  - Create .env.example with documented environment variables (NODE_ENV, PORT, REDIS_URL)
  - Add .env to .gitignore
  - Document that .env is for local development only
  - Add placeholder comments for Vertex AI variables (for later phases)
  - _Requirements: 5.2, 5.3, 5.4_


- [x] 10.1 Write unit tests for environment configuration

  - Create tests/env.test.ts
  - Test that .env.example exists and is readable
  - Test that .env.example contains required variables (NODE_ENV, PORT, REDIS_URL)
  - Test that .env is listed in .gitignore
  - Test that environment variable loading works correctly
  - _Requirements: 5.2, 5.3, 5.4_

- [x] 11. Create GitHub Actions CI pipeline





  - Create .github/workflows/ci.yml with workflow triggers (push to main, PRs)
  - Add lint job with pnpm setup, install, and lint/format checks
  - Add test-unit job with pnpm setup and vitest run
  - Add test-integration job with Redis service container
  - Add test-e2e job with Playwright installation
  - Add build job with pnpm build and devvit validate
  - Configure jobs to run in parallel
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 3.2_

- [x] 11.1 Write tests for CI pipeline validation


  - Create tests/ci.test.ts
  - Test that .github/workflows/ci.yml is valid YAML
  - Test that all required jobs (lint, test-unit, test-integration, test-e2e, build) are defined
  - Test that jobs have correct dependencies and run conditions
  - Test that Redis service is configured for integration job
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 3.2_

- [x] 12. Configure GitHub secrets for CI




  - Document required GitHub environment secrets in README
  - Add placeholder for GCP_PROJECT_ID secret (for later phases)
  - Add placeholder for VERTEX_API_KEY secret (for later phases)
  - Note that secrets are not needed for Phase 0 but structure is ready
  - _Requirements: 5.1_

- [x] 13. Create README.md with run instructions





  - Add project title and brief description
  - Add Quick Start section with install, dev, test, and build commands
  - Add Development section with prerequisites (Node 20+, Redis)
  - Add Testing section with unit, e2e, and all test commands
  - Add Deployment section with devvit upload command
  - Reference .env.example for configuration
  - _Requirements: 10.1, 10.2_

- [x] 14. Create SUBMISSION.md skeleton





  - Add hackathon submission template with team section
  - Add categories section (Community Play, Kiro DevEx)
  - Add description placeholder
  - Add technical stack section
  - Add demo, video, and source link placeholders
  - _Requirements: 10.3, 10.4_

- [x] 15. Verify local development environment









  - Run pnpm install and verify all dependencies install successfully
  - Run pnpm dev and verify server starts without errors
  - Access http://localhost:3000/api/health and verify JSON response
  - Access http://localhost:3000 and verify client loads with health status
  - Run pnpm lint and verify no errors
  - Run pnpm format --check and verify formatting is correct
  - _Requirements: 11.1, 11.2, 11.3_

- [x] 15.1 Write integration tests for local development


  - Create tests/integration/dev-environment.test.ts
  - Test that server starts and listens on correct port
  - Test that /api/health endpoint is accessible
  - Test that client index.html is served correctly
  - Test that hot reload works for server changes (if applicable)
  - _Requirements: 11.1, 11.2, 11.3_

- [x] 16. Validate Devvit configuration





  - Run devvit validate command (or equivalent validation)
  - Verify no schema errors in devvit.json
  - Verify post entrypoint references correct file
  - Verify server entry references correct compiled output
  - Verify permissions are correctly configured
  - _Requirements: 6.3, 11.4_

- [x] 17. Verify CI pipeline








  - Push code to GitHub and trigger CI workflow
  - Verify lint job passes
  - Verify test-unit job passes with all unit tests
  - Verify test-integration job passes with Redis service
  - Verify test-e2e job passes with Playwright
  - Verify build job passes and devvit validate succeeds
  - Confirm all jobs show green status

  - _Requirements: 4.6, 11.5_

- [x] 17.1 Write tests for CI job outputs



  - Create tests/ci-validation.test.ts
  - Test that all CI jobs completed successfully (parse workflow logs)
  - Test that test coverage meets minimum threshold (if configured)
  - Test that no warnings or errors were logged during CI run
  - Test that build artifacts were created correctly
  - _Requirements: 4.6, 11.5_

- [x] 18. Final Phase 0 validation




  - Review validation checklist in design document
  - Verify all 12 checklist items are complete
  - Confirm README has complete run instructions
  - Confirm SUBMISSION.md skeleton exists
  - Tag Phase 0 completion in git (optional)
  - Document any deviations or notes for next phase
  - _Requirements: 10.5, 11.5_
