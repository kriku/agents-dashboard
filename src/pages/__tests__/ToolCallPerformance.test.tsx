import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { renderWithProviders } from '../../__tests__/test-utils';
import { ToolCallPerformance } from '../ToolCallPerformance';

describe('ToolCallPerformance', () => {
  it('renders page title', async () => {
    renderWithProviders(<ToolCallPerformance />);
    await waitFor(() => {
      expect(screen.getByText('Tool Call Performance')).toBeInTheDocument();
    });
  });

  it('renders panel titles from mock data', async () => {
    renderWithProviders(<ToolCallPerformance />);
    await waitFor(() => {
      expect(screen.getByText('Active Tools')).toBeInTheDocument();
    });
    expect(screen.getByText('Tool Latency p50/p95/p99')).toBeInTheDocument();
    expect(screen.getByText('Slowest Tools (p95)')).toBeInTheDocument();
  });

  it('shows error state on server error', async () => {
    server.use(
      http.get('/api/views/:viewId', () => HttpResponse.json({ error: 'fail' }, { status: 500 })),
    );
    renderWithProviders(<ToolCallPerformance />);
    await waitFor(() => {
      expect(screen.getByText('Error loading view')).toBeInTheDocument();
    });
  });

  it('shows loading skeleton initially', () => {
    renderWithProviders(<ToolCallPerformance />);
    const skeletons = document.querySelectorAll('.panel-card__skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});
