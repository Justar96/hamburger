import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

const SERVER_PORT = 3000;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;
const STARTUP_TIMEOUT = 10000; // 10 seconds for server to start
const HEALTH_CHECK_TIMEOUT = 5000; // 5 seconds for health check

let serverProcess: ChildProcess | null = null;

/**
 * Wait for server to be ready by polling the health endpoint
 */
async function waitForServer(timeoutMs: number): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await fetch(`${SERVER_URL}/api/health`, {
        signal: AbortSignal.timeout(1000),
      });
      
      if (response.ok) {
        return;
      }
    } catch (error) {
      // Server not ready yet, continue polling
    }
    
    // Wait 500ms before next attempt
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  throw new Error(`Server did not start within ${timeoutMs}ms`);
}

/**
 * Start the development server
 */
async function startDevServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    // Use tsx to run the server directly for testing
    // On Windows, we need to use 'npx.cmd' or run through shell
    const isWindows = process.platform === 'win32';
    const command = isWindows ? 'npx.cmd' : 'npx';
    
    serverProcess = spawn(command, ['tsx', 'src/server/index.ts'], {
      env: {
        ...process.env,
        NODE_ENV: 'development',
        PORT: SERVER_PORT.toString(),
      },
      stdio: 'pipe',
      shell: isWindows,
    });

    let output = '';
    
    serverProcess.stdout?.on('data', (data) => {
      output += data.toString();
      // Server is ready when it logs the listening message
      if (output.includes('listening on port')) {
        resolve();
      }
    });

    serverProcess.stderr?.on('data', (data) => {
      console.error('Server stderr:', data.toString());
    });

    serverProcess.on('error', (error) => {
      reject(new Error(`Failed to start server: ${error.message}`));
    });

    serverProcess.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        reject(new Error(`Server exited with code ${code}`));
      }
    });

    // Timeout if server doesn't start
    setTimeout(() => {
      reject(new Error('Server startup timeout'));
    }, STARTUP_TIMEOUT);
  });
}

/**
 * Stop the development server
 */
function stopDevServer(): void {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }
}

describe('Local development environment', () => {
  beforeAll(async () => {
    // Start the server before running tests
    await startDevServer();
    // Wait for server to be fully ready
    await waitForServer(HEALTH_CHECK_TIMEOUT);
  }, STARTUP_TIMEOUT + HEALTH_CHECK_TIMEOUT);

  afterAll(() => {
    // Clean up server process
    stopDevServer();
  });

  describe('Server startup', () => {
    it('should start and listen on correct port', async () => {
      // Verify server is responding
      const response = await fetch(`${SERVER_URL}/api/health`);
      expect(response.ok).toBe(true);
    });

    it('should start without errors', () => {
      // If we got here, server started successfully
      expect(serverProcess).not.toBeNull();
      expect(serverProcess?.killed).toBe(false);
    });

    it('should use correct port from environment', async () => {
      // Verify server is on expected port
      const response = await fetch(`${SERVER_URL}/api/health`);
      expect(response.status).toBe(200);
    });
  });

  describe('Health endpoint accessibility', () => {
    it('should respond to GET /api/health', async () => {
      const response = await fetch(`${SERVER_URL}/api/health`);
      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
    });

    it('should return valid JSON with ok and ts fields', async () => {
      const response = await fetch(`${SERVER_URL}/api/health`);
      const data = (await response.json()) as { ok: boolean; ts: number };
      
      expect(data).toHaveProperty('ok');
      expect(data).toHaveProperty('ts');
      expect(data.ok).toBe(true);
      expect(typeof data.ts).toBe('number');
    });

    it('should return current timestamp', async () => {
      const beforeTime = Date.now();
      const response = await fetch(`${SERVER_URL}/api/health`);
      const data = (await response.json()) as { ok: boolean; ts: number };
      const afterTime = Date.now();
      
      expect(data.ts).toBeGreaterThanOrEqual(beforeTime - 1000);
      expect(data.ts).toBeLessThanOrEqual(afterTime + 1000);
    });

    it('should respond quickly (under 100ms)', async () => {
      const startTime = Date.now();
      await fetch(`${SERVER_URL}/api/health`);
      const duration = Date.now() - startTime;
      
      expect(duration).toBeLessThan(100);
    });

    it('should handle multiple concurrent requests', async () => {
      const requests = Array.from({ length: 10 }, () =>
        fetch(`${SERVER_URL}/api/health`)
      );
      
      const responses = await Promise.all(requests);
      
      responses.forEach(response => {
        expect(response.ok).toBe(true);
      });
    });
  });

  describe('Client index.html serving', () => {
    it('should serve index.html at root path', async () => {
      const response = await fetch(`${SERVER_URL}/`);
      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
    });

    it('should return HTML content type', async () => {
      const response = await fetch(`${SERVER_URL}/`);
      const contentType = response.headers.get('content-type');
      
      expect(contentType).toContain('text/html');
    });

    it('should contain Choice Chorus branding', async () => {
      const response = await fetch(`${SERVER_URL}/`);
      const html = await response.text();
      
      expect(html).toContain('Choice Chorus');
    });

    it('should contain health check script', async () => {
      const response = await fetch(`${SERVER_URL}/`);
      const html = await response.text();
      
      expect(html).toContain('/api/health');
      expect(html).toContain('fetch');
    });

    it('should have proper HTML structure', async () => {
      const response = await fetch(`${SERVER_URL}/`);
      const html = await response.text();
      
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html');
      expect(html).toContain('</html>');
      expect(html).toContain('<head>');
      expect(html).toContain('<body>');
    });

    it('should have mobile viewport meta tag', async () => {
      const response = await fetch(`${SERVER_URL}/`);
      const html = await response.text();
      
      expect(html).toContain('viewport');
      expect(html).toContain('width=device-width');
    });
  });

  describe('Install endpoint', () => {
    it('should respond to POST /internal/install', async () => {
      const response = await fetch(`${SERVER_URL}/internal/install`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      
      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
    });

    it('should return installed status', async () => {
      const response = await fetch(`${SERVER_URL}/internal/install`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      
      const data = (await response.json()) as { status: string };
      expect(data).toHaveProperty('status');
      expect(data.status).toBe('installed');
    });
  });

  describe('Error handling', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await fetch(`${SERVER_URL}/api/unknown`);
      expect(response.status).toBe(404);
    });

    it('should return error JSON for unknown routes', async () => {
      const response = await fetch(`${SERVER_URL}/api/unknown`);
      const data = (await response.json()) as {
        error: { code: string; message: string };
      };
      
      expect(data).toHaveProperty('error');
      expect(data.error).toHaveProperty('code');
      expect(data.error).toHaveProperty('message');
    });
  });

  describe('Static file serving', () => {
    it('should serve files from public directory', async () => {
      const response = await fetch(`${SERVER_URL}/index.html`);
      expect(response.ok).toBe(true);
    });

    it('should verify public directory exists', () => {
      const publicDir = join(process.cwd(), 'public');
      expect(existsSync(publicDir)).toBe(true);
    });
  });
});
