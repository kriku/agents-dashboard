import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { renderWithProviders } from '../../__tests__/test-utils';
import { CostTracking } from '../CostTracking';

describe('CostTracking', () => {
  it('renders page title', async () => {
    renderWithProviders(<CostTracking />);
    await waitFor(() => {
      expect(screen.getByText('Cost Tracking')).toBeInTheDocument();
    });
  });

  it('renders panel titles from mock data', async () => {
    renderWithProviders(<CostTracking />);
    await waitFor(() => {
      expect(screen.getByText('Est. Daily Cost')).toBeInTheDocument();
    });
    expect(screen.getByText('Cumulative Cost (24h)')).toBeInTheDocument();
    expect(screen.getByText('Cost by Agent (24h)')).toBeInTheDocument();
  });

  it('shows error state on server error', async () => {
    server.use(
      http.get('/api/views/:viewId', () => HttpResponse.json({ error: 'fail' }, { status: 500 })),
    );
    renderWithProviders(<CostTracking />);
    await waitFor(() => {
      expect(screen.getByText('Error loading view')).toBeInTheDocument();
    });
  });

  it('shows loading skeleton initially', () => {
    renderWithProviders(<CostTracking />);
    const skeletons = document.querySelectorAll('.panel-card__skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});
