import { test, expect } from '@playwright/test';

// E2E smoke tests require the full stack: ClickHouse + BFF + Vite dev server.
// Run: docker-compose up clickhouse, pnpm --filter bff dev, then pnpm --filter frontend e2e

test.describe('E2E Smoke', () => {
  test.beforeEach(async ({ page }) => {
    // Login by clicking SSO button (fetches real demo token from BFF)
    await page.goto('/login');
    await page.click('button:has-text("Sign in with SSO")');
    await page.waitForURL('/');
  });

  test('login and dashboard loads', async ({ page }) => {
    // Should see the AppShell with sidebar
    await expect(page.locator('.app-sidebar')).toBeVisible();
    await expect(page.locator('text=AgentWatch')).toBeVisible();
    // Should see the workspace switcher
    await expect(page.locator('.workspace-switcher')).toBeVisible();
  });

  const VIEWS = [
    { nav: 'Agent overview', path: '/', minPanels: 8 },
    { nav: 'Tool call performance', path: '/tool-call-performance', minPanels: 6 },
    { nav: 'LLM token usage', path: '/llm-token-usage', minPanels: 6 },
    { nav: 'Error breakdown', path: '/error-breakdown', minPanels: 6 },
    { nav: 'Cost tracking', path: '/cost-tracking', minPanels: 6 },
  ];

  for (const view of VIEWS) {
    test(`${view.nav} renders with data`, async ({ page }) => {
      // Navigate via sidebar
      await page.click(`.app-sidebar__link:has-text("${view.nav}")`);
      // Wait for panels to render and loading to finish
      await page.waitForSelector('.panel-card', { timeout: 15000 });
      await expect(page.locator('.panel-card__skeleton')).toHaveCount(0, { timeout: 15000 });
      const panelCount = await page.locator('.panel-card').count();
      expect(panelCount).toBeGreaterThanOrEqual(view.minPanels);
    });
  }

  test('workspace switcher changes data', async ({ page }) => {
    // Get initial stat value
    await page.waitForSelector('.stat-value', { timeout: 15000 });
    const initialValues = await page.locator('.stat-value').allTextContents();

    // Switch workspace
    await page.selectOption('.workspace-switcher', 'ws-globex-main');
    // Wait for data to reload
    await page.waitForTimeout(2000);
    await page.waitForSelector('.stat-value', { timeout: 15000 });
    const newValues = await page.locator('.stat-value').allTextContents();

    // At least one stat should have changed
    const changed = initialValues.some((v, i) => v !== newValues[i]);
    expect(changed).toBe(true);
  });

  test('all 5 nav items visible', async ({ page }) => {
    const navItems = await page.locator('.app-sidebar__link').allTextContents();
    expect(navItems).toHaveLength(5);
    expect(navItems).toContain('Agent overview');
    expect(navItems).toContain('Tool call performance');
    expect(navItems).toContain('LLM token usage');
    expect(navItems).toContain('Error breakdown');
    expect(navItems).toContain('Cost tracking');
  });
});
