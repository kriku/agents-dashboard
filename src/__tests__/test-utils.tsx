import { render, type RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router';
import { http, HttpResponse } from 'msw';
import type { ReactElement } from 'react';
import type { ViewResponse } from '../types/views';

/**
 * Render a component wrapped with all required providers
 * (QueryClient, BrowserRouter).
 */
export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>{children}</BrowserRouter>
      </QueryClientProvider>
    );
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...options }),
    queryClient,
  };
}

/**
 * Create an MSW handler that returns a mock view response.
 */
export function mockViewEndpoint(viewId: string, response: ViewResponse) {
  return http.get(`/api/views/${viewId}`, () => {
    return HttpResponse.json(response);
  });
}
