# CI Test Failure Fix

## Issue
The `test-unit` job in GitHub Actions was failing with two test failures in `tests/devvit-validation.test.ts`:
1. "Server Configuration > should reference existing compiled server file" (line 78)
2. "File References > should have all referenced files exist" (line 176)

Both tests were checking for the existence of `dist/server/index.js`, which didn't exist during test execution.

## Root Cause
The CI workflow had a sequencing issue:
- The `test-unit` job ran `pnpm run test` which includes validation tests
- These validation tests check for compiled files in `dist/server/index.js`
- However, the build step (`pnpm run build`) only ran in the separate `build` job
- Since jobs run independently in parallel, the compiled files weren't available during testing

## Solution
Added a build step to both `test-unit` and `test-integration` jobs before running tests:

```yaml
- name: Build project
  run: pnpm run build

- name: Run unit tests
  run: pnpm run test
```

Both jobs run `pnpm run test` which includes the validation tests, so both need the build artifacts.

This ensures that:
1. Dependencies are installed
2. Project is built (creating `dist/server/index.js`)
3. Tests run with all required files present

## Verification
Ran `pnpm run validate` locally - all 16 tests pass:
- Server configuration validation passes
- File reference validation passes
- All other devvit.json validations pass

## Files Modified
- `.github/workflows/ci.yml` - Added build step to test-unit and test-integration jobs
