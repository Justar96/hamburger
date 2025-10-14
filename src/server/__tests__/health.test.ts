import { describe, it, expect } from 'vitest';

interface HealthResponse {
  ok: boolean;
  ts: number;
}

describe('Health endpoint', () => {
  const BASE_URL = 'http://localhost:3000';
  const HEALTH_ENDPOINT = `${BASE_URL}/api/health`;
  const MAX_RESPONSE_TIME_MS = 100;
  const TIMESTAMP_TOLERANCE_MS = 60000; // 1 minute

  const fetchHealth = async (options?: RequestInit): Promise<Response> => {
    return fetch(HEALTH_ENDPOINT, options);
  };

  it('should return ok: true', async () => {
    const response = await fetchHealth();
    const data = (await response.json()) as HealthResponse;

    expect(data).toHaveProperty('ok');
    expect(data.ok).toBe(true);
  });

  it('should return a valid timestamp', async () => {
    const response = await fetchHealth();
    const data = (await response.json()) as HealthResponse;

    expect(data).toHaveProperty('ts');
    expect(typeof data.ts).toBe('number');
    expect(data.ts).toBeGreaterThan(0);

    const now = Date.now();
    expect(data.ts).toBeLessThanOrEqual(now);
    expect(data.ts).toBeGreaterThan(now - TIMESTAMP_TOLERANCE_MS);
  });

  it('should respond in under 100ms', async () => {
    const startTime = Date.now();
    const response = await fetchHealth();
    const responseTime = Date.now() - startTime;

    expect(response.ok).toBe(true);
    expect(responseTime).toBeLessThan(MAX_RESPONSE_TIME_MS);
  });

  it('should handle malformed requests gracefully', async () => {
    const response = await fetchHealth({
      headers: {
        'Content-Type': 'invalid/type',
      },
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as HealthResponse;
    expect(data.ok).toBe(true);
  });

  it('should return JSON content type', async () => {
    const response = await fetchHealth();

    const contentType = response.headers.get('content-type');
    expect(contentType).toContain('application/json');
  });
});
