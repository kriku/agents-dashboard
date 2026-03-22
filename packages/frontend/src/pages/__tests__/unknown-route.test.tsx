// =============================================================================
// FE-025: Unknown path shows 404 or fallback
// TI-015: Browser never sees SQL in responses
// =============================================================================

import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { Routes, Route } from 'react-router';
import { AppShell } from '../../components/layout/AppShell';
import { AgentOverview } from '../AgentOverview';
import { renderWithProviders } from '../../__tests__/test-utils';

function renderApp(route: string) {
  return renderWithProviders(
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<AgentOverview />} />
        <Route path="*" element={<div data-testid="not-found">View not found</div>} />
      </Route>
    </Routes>,
    { route },
  );
}

// FE-025
describe('FE-025: unknown path', () => {
  it('shows fallback for unknown route within app shell', () => {
    renderApp('/nonexistent-view');
    expect(screen.getByTestId('not-found')).toBeInTheDocument();
    expect(screen.getByText('View not found')).toBeInTheDocument();
    // Sidebar still renders
    expect(screen.getByText('Agent overview')).toBeInTheDocument();
  });
});

// TI-015
describe('TI-015: browser never sees SQL', () => {
  it('API responses do not contain SQL statements', async () => {
    const viewIds = [
      'agent-overview',
      'tool-call-performance',
      'llm-token-usage',
      'error-breakdown',
      'cost-tracking',
    ];

    // Match SQL statement patterns, not individual common English words
    const sqlStatements = /SELECT\s+.+\s+FROM|INSERT\s+INTO|DELETE\s+FROM|ALTER\s+TABLE|CREATE\s+TABLE|DROP\s+TABLE|workspace_id\s*=\s*\{/i;

    for (const viewId of viewIds) {
      const res = await fetch(`/api/views/${viewId}`);
      const text = await res.text();
      expect(text, `${viewId} response should not contain SQL`).not.toMatch(sqlStatements);
    }
  });
});
