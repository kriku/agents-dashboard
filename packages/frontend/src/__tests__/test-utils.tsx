import { render, type RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { http, HttpResponse } from 'msw';
import type { ReactElement } from 'react';
import type { ViewResponse } from '@agent-monitor/shared';
import { WorkspaceProvider } from '../contexts/WorkspaceContext';

interface ProviderOptions extends Omit<RenderOptions, 'wrapper'> {
  route?: string;
}

/**
 * Render a component wrapped with all required providers
 * (QueryClient, MemoryRouter).
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function renderWithProviders(
  ui: ReactElement,
  options?: ProviderOptions,
): ReturnType<typeof render> & { queryClient: QueryClient } {
  const { route = '/', ...renderOptions } = options ?? {};

  // Ensure RequireAuth passes in tests
  localStorage.setItem('auth_token', 'test-token');

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <WorkspaceProvider>
          <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
        </WorkspaceProvider>
      </QueryClientProvider>
    );
  }

  const renderResult = render(ui, { wrapper: Wrapper, ...renderOptions });
  return Object.assign(renderResult, { queryClient });
}

/**
 * Create an MSW handler that returns a mock view response.
 */
export function mockViewEndpoint(viewId: string, response: ViewResponse) {
  return http.get(`*/api/views/${viewId}`, () => {
    return HttpResponse.json(response);
  });
}
