# Requirements Document

## Introduction

Phase 0 establishes the foundational infrastructure for the Beef (Choice Chorus) project - a Devvit Web interactive post application. This phase focuses on creating a production-ready repository structure with proper tooling, CI/CD pipeline, and initial configuration that complies with Devvit Web platform requirements. The goal is to have a validated, runnable skeleton that passes all checks before any feature development begins.

## Requirements

### Requirement 1: Repository Initialization

**User Story:** As a developer, I want a properly structured repository with version control, so that I can collaborate effectively and maintain code quality from day one.

#### Acceptance Criteria

1. WHEN the repository is created THEN it SHALL be named "choice-chorus"
2. WHEN the repository is initialized THEN it SHALL have a main branch that is protected
3. WHEN code changes are made THEN they SHALL be done via feature branches with PR workflow
4. WHEN PRs are merged THEN they SHALL use squash merge strategy
5. IF a PR is submitted THEN CI SHALL be green before merge is allowed

### Requirement 2: Development Environment Setup

**User Story:** As a developer, I want a consistent development environment with modern tooling, so that code quality is maintained and development is efficient.

#### Acceptance Criteria

1. WHEN the project is set up THEN it SHALL use Node LTS version
2. WHEN dependencies are managed THEN the system SHALL use pnpm or npm as package manager
3. WHEN code is written THEN Prettier SHALL be configured for formatting
4. WHEN code is linted THEN ESLint SHALL be configured with appropriate rules
5. WHEN TypeScript is used THEN strict mode SHALL be enabled
6. WHEN the project structure is created THEN it SHALL include src/client and src/server directories

### Requirement 3: Testing Infrastructure

**User Story:** As a developer, I want comprehensive testing capabilities, so that I can ensure code quality at unit, integration, and end-to-end levels.

#### Acceptance Criteria

1. WHEN unit tests are needed THEN Vitest or Jest SHALL be configured
2. WHEN integration tests require Redis THEN a Redis service SHALL be available in CI
3. WHEN end-to-end tests are needed THEN Playwright SHALL be configured
4. WHEN tests are run THEN they SHALL execute in the CI pipeline
5. WHEN all test types pass THEN the build SHALL be considered valid

### Requirement 4: CI/CD Pipeline

**User Story:** As a developer, I want automated CI/CD that validates all code changes, so that quality issues are caught early and deployment is reliable.

#### Acceptance Criteria

1. WHEN CI is configured THEN it SHALL use GitHub Actions
2. WHEN CI runs THEN it SHALL execute unit test jobs
3. WHEN CI runs THEN it SHALL execute integration test jobs with Redis service
4. WHEN CI runs THEN it SHALL execute e2e smoke test jobs
5. WHEN CI runs THEN it SHALL execute build validation jobs
6. WHEN all CI jobs pass THEN the pipeline SHALL report green status

### Requirement 5: Secrets Management

**User Story:** As a developer, I want secure secrets management for external services, so that API keys and credentials are never exposed in code.

#### Acceptance Criteria

1. WHEN Vertex AI or GCP services are used THEN secrets SHALL be configured in GitHub environment
2. WHEN developing locally THEN secrets SHALL be stored in .env file
3. WHEN .env file exists THEN it SHALL be excluded from version control via .gitignore
4. WHEN secrets are needed in code THEN they SHALL be accessed via environment variables
5. WHEN client code is written THEN it SHALL NOT contain any secrets

### Requirement 6: Devvit Configuration

**User Story:** As a developer, I want a valid Devvit Web configuration, so that the application can be deployed to Reddit's platform.

#### Acceptance Criteria

1. WHEN the project is initialized THEN a devvit.json file SHALL be created
2. WHEN devvit.json is created THEN it SHALL conform to the Devvit Web schema
3. WHEN validation is run THEN devvit validate command SHALL pass
4. WHEN devvit.json is configured THEN it SHALL include post, server, permissions, and scheduler sections
5. WHEN the configuration is complete THEN it SHALL specify correct entry points for client and server

### Requirement 7: Server Runtime

**User Story:** As a developer, I want a working server runtime with health check, so that I can verify the basic server infrastructure is operational.

#### Acceptance Criteria

1. WHEN the server is created THEN it SHALL have an entry point at src/server/index.ts
2. WHEN the server starts THEN it SHALL expose a GET /api/health endpoint
3. WHEN /api/health is called THEN it SHALL return JSON with { ok: true, ts: <timestamp> }
4. WHEN /api/health is called THEN it SHALL respond in under 100ms
5. WHEN the install trigger is called THEN POST /internal/install SHALL return 200 status

### Requirement 8: Client Shell

**User Story:** As a developer, I want a minimal client application shell, so that I can verify the client-server integration works.

#### Acceptance Criteria

1. WHEN the client is created THEN it SHALL have an index.html file
2. WHEN the client is configured THEN index.html SHALL be in the public/ directory
3. WHEN devvit.json is configured THEN post.entrypoints.default.entry SHALL point to index.html
4. WHEN the client loads THEN it SHALL display a minimal app shell
5. WHEN the post height is configured THEN it SHALL be set to "tall"

### Requirement 9: Build Pipeline

**User Story:** As a developer, I want an automated build process, so that source code is properly compiled for deployment.

#### Acceptance Criteria

1. WHEN the build runs THEN server TypeScript SHALL compile to dist/server/index.js
2. WHEN the build runs THEN client assets SHALL be processed to public/ directory
3. WHEN the build completes THEN all output files SHALL be in their correct locations
4. WHEN the build is validated THEN it SHALL pass without errors
5. WHEN devvit.json references server entry THEN it SHALL point to dist/server/index.js

### Requirement 10: Documentation Foundation

**User Story:** As a developer, I want initial documentation structure, so that project information is organized from the start.

#### Acceptance Criteria

1. WHEN the project is initialized THEN a README.md file SHALL be created
2. WHEN README is created THEN it SHALL include run commands for local development
3. WHEN the project is initialized THEN a SUBMISSION.md skeleton SHALL be created
4. WHEN SUBMISSION.md is created THEN it SHALL include placeholder sections for hackathon submission
5. WHEN documentation is complete THEN developers SHALL be able to run the project using README instructions

### Requirement 11: Local Development Verification

**User Story:** As a developer, I want to verify the local development environment works, so that I can start feature development with confidence.

#### Acceptance Criteria

1. WHEN the setup is complete THEN the server SHALL start locally without errors
2. WHEN the server is running THEN /api/health endpoint SHALL be accessible
3. WHEN the client is loaded THEN it SHALL render in a browser
4. WHEN devvit validate is run THEN it SHALL pass without errors
5. WHEN all verification steps pass THEN Phase 0 SHALL be considered complete
