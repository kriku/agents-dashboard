import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router';
import { AppShell } from '../AppShell';
import { renderWithProviders } from '../../../__tests__/test-utils';

function renderAppShell(route = '/') {
  return renderWithProviders(
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<div>Agent Overview Content</div>} />
        <Route path="tool-call-performance" element={<div>Tool Call Content</div>} />
        <Route path="llm-token-usage" element={<div>LLM Content</div>} />
        <Route path="error-breakdown" element={<div>Error Content</div>} />
        <Route path="cost-tracking" element={<div>Cost Content</div>} />
      </Route>
    </Routes>,
    { route },
  );
}

describe('AppShell', () => {
  it('renders all 5 navigation items', () => {
    renderAppShell();
    expect(screen.getByText('Agent overview')).toBeInTheDocument();
    expect(screen.getByText('Tool call performance')).toBeInTheDocument();
    expect(screen.getByText('LLM token usage')).toBeInTheDocument();
    expect(screen.getByText('Error breakdown')).toBeInTheDocument();
    expect(screen.getByText('Cost tracking')).toBeInTheDocument();
  });

  it('shows active styling on current route', () => {
    renderAppShell('/');
    const agentLink = screen.getByText('Agent overview');
    expect(agentLink.className).toContain('app-sidebar__link--active');
  });

  it('displays AgentWatch brand', () => {
    renderAppShell();
    expect(screen.getByText('AgentWatch')).toBeInTheDocument();
  });

  it('shows Live status indicator', () => {
    renderAppShell();
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('navigates on link click', async () => {
    const user = userEvent.setup();
    renderAppShell('/');
    expect(screen.getByText('Agent Overview Content')).toBeInTheDocument();
    await user.click(screen.getByText('Tool call performance'));
    expect(screen.getByText('Tool Call Content')).toBeInTheDocument();
  });
});
