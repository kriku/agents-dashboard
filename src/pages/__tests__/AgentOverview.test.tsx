import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { renderWithProviders } from '../../__tests__/test-utils';
import { AgentOverview } from '../AgentOverview';

describe('AgentOverview', () => {
  it('renders page title', async () => {
    renderWithProviders(<AgentOverview />);
    await waitFor(() => {
      expect(screen.getByText('Agent Execution Overview')).toBeInTheDocument();
    });
  });

  it('renders panel titles from mock data', async () => {
    renderWithProviders(<AgentOverview />);
    await waitFor(() => {
      expect(screen.getByText('Active Agents')).toBeInTheDocument();
    });
    expect(screen.getByText('Invocation Rate')).toBeInTheDocument();
    expect(screen.getByText('Error Rate')).toBeInTheDocument();
    expect(screen.getByText('Errors by Type (24h)')).toBeInTheDocument();
    expect(screen.getByText('Execution Latency (p95)')).toBeInTheDocument();
  });

  it('shows error state on server error', async () => {
    server.use(
      http.get('*/api/views/:viewId', () => HttpResponse.json({ error: 'fail' }, { status: 500 })),
    );
    renderWithProviders(<AgentOverview />);
    await waitFor(() => {
      expect(screen.getByText('Error loading view')).toBeInTheDocument();
    });
  });

  it('shows loading skeleton initially', () => {
    renderWithProviders(<AgentOverview />);
    const skeletons = document.querySelectorAll('.panel-card__skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});
