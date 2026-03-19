import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { renderWithProviders } from '../../__tests__/test-utils';
import { ErrorBreakdown } from '../ErrorBreakdown';

describe('ErrorBreakdown', () => {
  it('renders page title', async () => {
    renderWithProviders(<ErrorBreakdown />);
    await waitFor(() => {
      expect(screen.getByText('Error Breakdown')).toBeInTheDocument();
    });
  });

  it('renders panel titles from mock data', async () => {
    renderWithProviders(<ErrorBreakdown />);
    await waitFor(() => {
      expect(screen.getByText('Total Errors (24h)')).toBeInTheDocument();
    });
    expect(screen.getByText('Error Rate Trend')).toBeInTheDocument();
    expect(screen.getByText('Top Error Messages')).toBeInTheDocument();
  });

  it('shows error state on server error', async () => {
    server.use(
      http.get('*/api/views/:viewId', () => HttpResponse.json({ error: 'fail' }, { status: 500 })),
    );
    renderWithProviders(<ErrorBreakdown />);
    await waitFor(() => {
      expect(screen.getByText('Error loading view')).toBeInTheDocument();
    });
  });

  it('shows loading skeleton initially', () => {
    renderWithProviders(<ErrorBreakdown />);
    const skeletons = document.querySelectorAll('.panel-card__skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});
