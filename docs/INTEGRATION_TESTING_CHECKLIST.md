# Integration Testing Checklist

Use this checklist when working with integration tests or adding new features.

## Before Starting Development

- [ ] Read [Testing Guide](TESTING.md)
- [ ] Read [Developer Guide](DEVELOPER_GUIDE.md)
- [ ] Understand the [Integration Testing Implementation](INTEGRATION_TESTING_IMPLEMENTATION.md)
- [ ] Set up `.env` file with `USER_ID_PEPPER`
- [ ] Verify `pnpm run dev` starts successfully
- [ ] Verify `pnpm test` passes (288 tests)

## When Adding New Features

### 1. Write Unit Tests First

- [ ] Create test file in `tests/` directory
- [ ] Mock external dependencies (Redis, etc.)
- [ ] Test happy path
- [ ] Test error cases
- [ ] Test edge cases
- [ ] Verify tests pass: `npm test`

### 2. Add Integration Test Specification

- [ ] Add test case to `tests/integration/data-layer.test.ts`
- [ ] Document expected behavior
- [ ] Include setup and cleanup
- [ ] Track Redis keys for cleanup
- [ ] Add JSDoc comments

### 3. Update Manual Testing Guide

- [ ] Add new scenario to `tests/manual-integration-test.md`
- [ ] Include curl command
- [ ] Document expected response
- [ ] Add to verification checklist

### 4. Test Manually in Playtest

- [ ] Start playtest: `pnpm run dev`
- [ ] Execute manual test scenario
- [ ] Verify expected behavior
- [ ] Clean up test data
- [ ] Document any issues

## When Modifying Existing Features

### 1. Update Unit Tests

- [ ] Modify existing tests
- [ ] Add new test cases if needed
- [ ] Verify all tests pass
- [ ] Update test documentation

### 2. Update Integration Tests

- [ ] Update test specifications
- [ ] Modify expected behaviors
- [ ] Update manual testing guide
- [ ] Verify in playtest environment

### 3. Verify No Regressions

- [ ] Run full test suite: `pnpm run test:all`
- [ ] Check TypeScript compilation: `pnpm run build`
- [ ] Verify code quality: `pnpm run lint`
- [ ] Test manually in playtest

## Before Committing Code

- [ ] All unit tests pass: `pnpm test`
- [ ] Code is formatted: `pnpm run format`
- [ ] No lint errors: `pnpm run lint`
- [ ] TypeScript compiles: `pnpm run build`
- [ ] Devvit config valid: `pnpm run validate`
- [ ] Manual testing completed
- [ ] Documentation updated

## Before Creating Pull Request

- [ ] All tests pass locally
- [ ] Integration tests verified in playtest
- [ ] Documentation is up to date
- [ ] CHANGELOG updated (if applicable)
- [ ] No console.log statements left
- [ ] No commented-out code
- [ ] No TODO comments without issues

## When Reviewing Pull Requests

### Code Quality

- [ ] Code follows project conventions
- [ ] TypeScript types are correct
- [ ] No `any` types used
- [ ] Error handling is appropriate
- [ ] No security issues

### Testing

- [ ] Unit tests are included
- [ ] Tests cover new functionality
- [ ] Tests cover error cases
- [ ] Integration test specs updated
- [ ] Manual testing guide updated

### Documentation

- [ ] Code has JSDoc comments
- [ ] README updated if needed
- [ ] Testing guide updated if needed
- [ ] Developer guide updated if needed

## When Deploying

### Pre-Deployment

- [ ] All tests pass in CI
- [ ] Build succeeds
- [ ] Devvit validation passes
- [ ] Manual testing completed
- [ ] Integration verified in playtest

### Deployment

- [ ] Environment variables configured
- [ ] Redis connection verified
- [ ] Health endpoint responds
- [ ] Test endpoints disabled in production

### Post-Deployment

- [ ] Health check passes
- [ ] Monitor telemetry
- [ ] Verify core functionality
- [ ] Check error logs
- [ ] Test with real users

## Troubleshooting

### Tests Fail Locally

1. [ ] Check environment variables
2. [ ] Verify dependencies installed: `pnpm install`
3. [ ] Clear node_modules and reinstall
4. [ ] Check for port conflicts
5. [ ] Review error messages

### Integration Tests Fail

1. [ ] Verify running through `pnpm run dev`
2. [ ] Check Devvit runtime is initialized
3. [ ] Verify Redis connection
4. [ ] Check test data cleanup
5. [ ] Review server logs

### Build Fails

1. [ ] Check TypeScript errors
2. [ ] Verify all imports are correct
3. [ ] Check for syntax errors
4. [ ] Review build output
5. [ ] Try clean build: `rm -rf dist && pnpm run build`

### Playtest Issues

1. [ ] Verify Devvit CLI installed
2. [ ] Check network connection
3. [ ] Review server logs
4. [ ] Verify environment variables
5. [ ] Try restarting playtest

## Quick Reference

### Common Commands

```bash
# Testing
pnpm test                    # Run unit tests
pnpm run test:watch          # Watch mode
pnpm run test:integration    # Integration tests
pnpm run test:e2e            # E2E tests
pnpm run test:all            # All tests

# Development
pnpm run dev                 # Start playtest
pnpm run dev:server          # Server only
pnpm run dev:client          # Client only

# Code Quality
pnpm run lint                # Check linting
pnpm run format              # Format code
pnpm run format:check        # Check formatting

# Building
pnpm run build               # Build all
pnpm run validate            # Validate Devvit config
```

### Test API Endpoints (Dev Only)

```bash
# Full data flow
POST /api/test/data-flow

# Seed operations
POST /api/test/seed

# User choices
POST /api/test/choices

# Tally operations
POST /api/test/tallies

# Telemetry
POST /api/test/telemetry

# Cleanup
POST /api/test/cleanup
```

### Documentation Files

- `docs/TESTING.md` - Main testing guide
- `docs/DEVELOPER_GUIDE.md` - Quick reference
- `docs/INTEGRATION_TESTING_IMPLEMENTATION.md` - Implementation details
- `tests/integration/README.md` - Integration testing overview
- `tests/integration/SUMMARY.md` - Implementation summary
- `tests/manual-integration-test.md` - Manual testing guide

## Resources

- [Devvit Documentation](https://developers.reddit.com/docs)
- [Devvit Web Guide](https://developers.reddit.com/docs/capabilities/devvit-web)
- [Devvit Playtest Guide](https://developers.reddit.com/docs/guides/tools/playtest)
- [Testing Guide](TESTING.md)
- [Developer Guide](DEVELOPER_GUIDE.md)

---

**Last Updated**: October 15, 2025  
**Version**: 1.0  
**Status**: Active
