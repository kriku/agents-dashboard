import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

describe('routing', () => {
  it('renders AgentOverview at /', async () => {
    renderApp('/');
    await waitFor(() => {
      expect(screen.getByText('Agent Execution Overview')).toBeInTheDocument();
    });
  });

  it('renders ToolCallPerformance at /tool-call-performance', async () => {
    renderApp('/tool-call-performance');
    await waitFor(() => {
      expect(screen.getByText('Tool Call Performance')).toBeInTheDocument();
    });
  });

  it('navigates between views via sidebar', async () => {
    const user = userEvent.setup();
    renderApp('/');
    await waitFor(() => {
      expect(screen.getByText('Agent Execution Overview')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Cost tracking'));
    await waitFor(() => {
      expect(screen.getByText('Cost Tracking')).toBeInTheDocument();
    });
  });
});
