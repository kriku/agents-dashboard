import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router';
import { RequireAuth } from '../RequireAuth';
import { renderWithProviders } from '../../../__tests__/test-utils';

const routes = (
  <Routes>
    <Route element={<RequireAuth />}>
      <Route index element={<div>Protected Content</div>} />
    </Route>
    <Route path="/login" element={<div>Login Page</div>} />
  </Routes>
);

describe('RequireAuth', () => {
  it('renders Outlet when authenticated', () => {
    renderWithProviders(routes);
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('redirects to /login when unauthenticated', () => {
    localStorage.clear();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/']}>
          {routes}
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByText('Login Page')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });
});
