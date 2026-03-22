import { test, expect } from '@playwright/test';

const PAGES = [
  { path: '/', name: 'agent-overview' },
  { path: '/tool-call-performance', name: 'tool-call-performance' },
  { path: '/llm-token-usage', name: 'llm-token-usage' },
  { path: '/error-breakdown', name: 'error-breakdown' },
  { path: '/cost-tracking', name: 'cost-tracking' },
];

for (const page of PAGES) {
  test(`${page.name} renders all panels`, async ({ page: p }) => {
    const errors: string[] = [];
    p.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await p.goto(page.path);
    await p.waitForSelector('.panel-card__body', { timeout: 10000 });
    await p.screenshot({
      path: `test-results/${page.name}.png`,
      fullPage: true,
    });

    // Verify no panels stuck in loading state
    const loadingPanels = await p.locator('.panel-card--loading').count();
    expect(loadingPanels).toBe(0);

    // Verify no console errors
    expect(errors).toEqual([]);
  });
}
