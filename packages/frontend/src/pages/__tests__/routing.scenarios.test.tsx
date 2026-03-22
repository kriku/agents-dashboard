// =============================================================================
// FE-019..025: Navigation scenarios from test spec
// Covers gaps not in existing routing.test.tsx:
// - FE-019: Sidebar shows 5 nav items (already in AppShell.test.tsx)
// - FE-020: Active state on current view (already in AppShell.test.tsx)
// - FE-021: Clicking nav item changes view (already in routing.test.tsx)
// - FE-022: URL reflects current view
// - FE-023: Deep link loads correct view
// - FE-024: Root path renders agent overview
// - FE-025: Unknown path shows 404 or fallback
// =============================================================================

import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { Routes, Route } from 'react-router';
import { AppShell } from '../../components/layout/AppShell';
import { AgentOverview } from '../AgentOverview';
import { ToolCallPerformance } from '../ToolCallPerformance';
import { LLMTokenUsage } from '../LLMTokenUsage';
import { ErrorBreakdown } from '../ErrorBreakdown';
import { CostTracking } from '../CostTracking';
import { renderWithProviders } from '../../__tests__/test-utils';

function renderApp(route = '/') {
  return renderWithProviders(
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<AgentOverview />} />
        <Route path="tool-call-performance" element={<ToolCallPerformance />} />
        <Route path="llm-token-usage" element={<LLMTokenUsage />} />
        <Route path="error-breakdown" element={<ErrorBreakdown />} />
        <Route path="cost-tracking" element={<CostTracking />} />
      </Route>
    </Routes>,
    { route },
  );
}

// FE-023: Deep link loads correct view
describe('FE-023: deep links', () => {
  it('loads LLM Token Usage via direct URL', async () => {
    renderApp('/llm-token-usage');
    await waitFor(() => {
      expect(screen.getByText('LLM Token Usage')).toBeInTheDocument();
    });
  });

  it('loads Error Breakdown via direct URL', async () => {
    renderApp('/error-breakdown');
    await waitFor(() => {
      expect(screen.getByText('Error Breakdown')).toBeInTheDocument();
    });
  });

  it('loads Cost Tracking via direct URL', async () => {
    renderApp('/cost-tracking');
    await waitFor(() => {
      expect(screen.getByText('Cost Tracking')).toBeInTheDocument();
    });
  });

  it('loads Tool Call Performance via direct URL', async () => {
    renderApp('/tool-call-performance');
    await waitFor(() => {
      expect(screen.getByText('Tool Call Performance')).toBeInTheDocument();
    });
  });
});

// FE-024: Root path renders agent overview
describe('FE-024: root path', () => {
  it('renders Agent Overview at /', async () => {
    renderApp('/');
    await waitFor(() => {
      expect(screen.getByText('Agent Execution Overview')).toBeInTheDocument();
    });
  });
});

// FE-022: Active nav state reflects current route
describe('FE-022: active nav reflects route', () => {
  it('Cost tracking link is active when at /cost-tracking', async () => {
    renderApp('/cost-tracking');
    await waitFor(() => {
      expect(screen.getByText('Cost Tracking')).toBeInTheDocument();
    });
    const link = screen.getByText('Cost tracking');
    expect(link.className).toContain('active');
  });

  it('Error breakdown link is active when at /error-breakdown', async () => {
    renderApp('/error-breakdown');
    await waitFor(() => {
      expect(screen.getByText('Error Breakdown')).toBeInTheDocument();
    });
    const link = screen.getByText('Error breakdown');
    expect(link.className).toContain('active');
  });
});
