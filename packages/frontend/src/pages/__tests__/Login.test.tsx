import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router';
import { Login } from '../Login';
import { renderWithProviders } from '../../__tests__/test-utils';

function renderLoginPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route index element={<div>Home Page</div>} />
    </Routes>,
    { route: '/login' },
  );
}

describe('Login', () => {
  it('renders heading', () => {
    renderLoginPage();
    expect(screen.getByText('IAM Services')).toBeInTheDocument();
  });

  it('renders SSO button', () => {
    renderLoginPage();
    expect(screen.getByRole('button', { name: /Sign in with SSO/ })).toBeInTheDocument();
  });

  it('navigates to home on click', async () => {
    localStorage.clear();
    const user = userEvent.setup();
    renderLoginPage();
    await user.click(screen.getByRole('button', { name: /Sign in with SSO/ }));
    await waitFor(() => {
      expect(screen.getByText('Home Page')).toBeInTheDocument();
    });
  });

  it('stores auth token on click', async () => {
    localStorage.clear();
    const user = userEvent.setup();
    renderLoginPage();
    await user.click(screen.getByRole('button', { name: /Sign in with SSO/ }));
    await waitFor(() => {
      expect(localStorage.getItem('auth_token')).toBe('test-demo-token');
    });
  });
});
