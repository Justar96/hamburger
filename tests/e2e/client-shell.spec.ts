import { test, expect } from '@playwright/test';

test.describe('Client Shell', () => {
  test('page loads and displays "Choice Chorus" heading', async ({ page }) => {
    await page.goto('/');
    
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
    await expect(heading).toContainText('Choice Chorus');
  });

  test('status indicator shows server health check result', async ({ page }) => {
    await page.goto('/');
    
    const statusElement = page.locator('#status');
    await expect(statusElement).toBeVisible();
    
    // Wait for the health check to complete and update the status
    await expect(statusElement).toContainText('Server healthy', { timeout: 5000 });
    
    // Verify timestamp is displayed (format: HH:MM:SS)
    const statusText = await statusElement.textContent();
    expect(statusText).toMatch(/\d{1,2}:\d{2}:\d{2}/);
  });

  test('page is responsive on mobile viewport (375px width)', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    
    // Verify content is visible and properly laid out
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
    
    const container = page.locator('.container');
    await expect(container).toBeVisible();
    
    // Verify container doesn't overflow viewport
    const containerBox = await container.boundingBox();
    expect(containerBox).not.toBeNull();
    if (containerBox) {
      expect(containerBox.width).toBeLessThanOrEqual(375);
    }
  });

  test('fetch to /api/health completes successfully', async ({ page }) => {
    // Intercept the health check request
    const healthCheckPromise = page.waitForResponse(
      response => response.url().includes('/api/health') && response.status() === 200
    );
    
    await page.goto('/');
    
    const response = await healthCheckPromise;
    const data = await response.json();
    
    expect(data).toHaveProperty('ok', true);
    expect(data).toHaveProperty('ts');
    expect(typeof data.ts).toBe('number');
    expect(data.ts).toBeGreaterThan(0);
  });

  test('error state when server is unreachable', async ({ page }) => {
    // Mock a failed health check by intercepting the request
    await page.route('/api/health', route => {
      route.abort('failed');
    });
    
    await page.goto('/');
    
    const statusElement = page.locator('#status');
    await expect(statusElement).toBeVisible();
    
    // Wait for error message to appear
    await expect(statusElement).toContainText('Server error', { timeout: 5000 });
  });
});
