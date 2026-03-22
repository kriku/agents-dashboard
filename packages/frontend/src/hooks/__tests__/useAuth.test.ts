import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAuth } from '../useAuth';

describe('useAuth', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('initializes as unauthenticated when no token', () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.token).toBeNull();
  });

  it('initializes as authenticated when token exists', () => {
    localStorage.setItem('auth_token', 'existing-jwt');
    const { result } = renderHook(() => useAuth());
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.token).toBe('existing-jwt');
  });

  it('login() sets token and isAuthenticated', () => {
    const { result } = renderHook(() => useAuth());
    act(() => result.current.login('new-jwt'));
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.token).toBe('new-jwt');
    expect(localStorage.getItem('auth_token')).toBe('new-jwt');
  });

  it('logout() clears token and isAuthenticated', () => {
    localStorage.setItem('auth_token', 'jwt');
    const { result } = renderHook(() => useAuth());
    act(() => result.current.logout());
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.token).toBeNull();
    expect(localStorage.getItem('auth_token')).toBeNull();
  });

  it('responds to cross-tab storage events (token set)', () => {
    const { result } = renderHook(() => useAuth());
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: 'auth_token', newValue: 'cross-tab-jwt' }),
      );
    });
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.token).toBe('cross-tab-jwt');
  });

  it('responds to cross-tab storage events (token cleared)', () => {
    localStorage.setItem('auth_token', 'jwt');
    const { result } = renderHook(() => useAuth());
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: 'auth_token', newValue: null }),
      );
    });
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.token).toBeNull();
  });
});
