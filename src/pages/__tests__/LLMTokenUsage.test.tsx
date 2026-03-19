import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { renderWithProviders } from '../../__tests__/test-utils';
import { LLMTokenUsage } from '../LLMTokenUsage';

describe('LLMTokenUsage', () => {
  it('renders page title', async () => {
    renderWithProviders(<LLMTokenUsage />);
    await waitFor(() => {
      expect(screen.getByText('LLM Token Usage')).toBeInTheDocument();
    });
  });

  it('renders panel titles from mock data', async () => {
    renderWithProviders(<LLMTokenUsage />);
    await waitFor(() => {
      expect(screen.getByText('Total Tokens (24h)')).toBeInTheDocument();
    });
    expect(screen.getByText('Tokens by Model')).toBeInTheDocument();
    expect(screen.getByText('Top Token Consumers (24h)')).toBeInTheDocument();
  });

  it('shows error state on server error', async () => {
    server.use(
      http.get('/api/views/:viewId', () => HttpResponse.json({ error: 'fail' }, { status: 500 })),
    );
    renderWithProviders(<LLMTokenUsage />);
    await waitFor(() => {
      expect(screen.getByText('Error loading view')).toBeInTheDocument();
    });
  });

  it('shows loading skeleton initially', () => {
    renderWithProviders(<LLMTokenUsage />);
    const skeletons = document.querySelectorAll('.panel-card__skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});
