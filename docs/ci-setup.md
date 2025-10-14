# CI/CD Setup Guide

## Upstash Redis Configuration

The CI pipeline uses Upstash Redis for integration tests. Upstash is a serverless Redis service that's perfect for CI/CD environments - no need to manage containers or infrastructure.

### Setup Steps

#### 1. Create an Upstash Redis Database

1. Go to [Upstash Console](https://console.upstash.com/)
2. Sign up or log in
3. Click "Create Database"
4. Choose:
   - **Name**: `choice-chorus-ci` (or any name you prefer)
   - **Type**: Regional (free tier available)
   - **Region**: Choose closest to your GitHub Actions runners (US East is common)
   - **TLS**: Enabled (recommended)
5. Click "Create"

#### 2. Get Your Redis URL

After creating the database:
1. Go to your database details page
2. Find the **REST API** section
3. Copy the connection string that looks like:
   ```
   rediss://default:[password]@[host].upstash.io:[port]
   ```

#### 3. Add Secret to GitHub

1. Go to your GitHub repository
2. Navigate to **Settings** > **Secrets and variables** > **Actions**
3. Click **New repository secret**
4. Add:
   - **Name**: `UPSTASH_REDIS_URL`
   - **Value**: Your Upstash Redis URL from step 2
5. Click **Add secret**

### Local Development

For local development, you can either:

**Option 1: Use the same Upstash Redis**
```bash
# Add to your .env file
REDIS_URL=rediss://default:[password]@[host].upstash.io:[port]
```

**Option 2: Use local Redis**
```bash
# Run Redis locally with Docker
docker run -d -p 6379:6379 redis:7-alpine

# Add to your .env file
REDIS_URL=redis://localhost:6379
```

### Benefits of Upstash for CI

- **No container management**: No need for service containers in GitHub Actions
- **Faster startup**: No waiting for Redis container to be healthy
- **Consistent environment**: Same Redis instance across all CI runs
- **Free tier**: Generous free tier for CI/CD usage
- **TLS support**: Secure connections out of the box
- **Global availability**: Low latency from GitHub Actions runners

### Troubleshooting

**Connection errors in CI:**
- Verify the secret name is exactly `UPSTASH_REDIS_URL`
- Check that the URL includes the protocol (`rediss://` for TLS)
- Ensure your Upstash database is active

**Rate limiting:**
- Upstash free tier has rate limits
- Consider upgrading if you run many CI jobs
- Or use separate databases for different branches

### Alternative: Local Redis Container

If you prefer to use a local Redis container instead of Upstash, you can revert to the container-based approach:

```yaml
test-integration:
  runs-on: ubuntu-latest
  services:
    redis:
      image: redis:7-alpine
      ports:
        - 6379:6379
      options: >-
        --health-cmd "redis-cli ping"
        --health-interval 10s
        --health-timeout 5s
        --health-retries 5
  steps:
    # ... other steps
    - name: Run integration tests
      run: npm run test
      env:
        REDIS_URL: redis://localhost:6379
```
