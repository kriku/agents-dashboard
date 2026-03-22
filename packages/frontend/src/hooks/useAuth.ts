import { useState, useCallback, useEffect } from 'react';

interface AuthState {
  token: string | null;
  isAuthenticated: boolean;
}

export function useAuth() {
  const [auth, setAuth] = useState<AuthState>(() => {
    const token = localStorage.getItem('auth_token');
    return { token, isAuthenticated: !!token };
  });

  const login = useCallback((token: string) => {
    localStorage.setItem('auth_token', token);
    setAuth({ token, isAuthenticated: true });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('auth_token');
    setAuth({ token: null, isAuthenticated: false });
  }, []);

  // Listen for token changes in other tabs
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'auth_token') {
        setAuth({
          token: e.newValue,
          isAuthenticated: !!e.newValue,
        });
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  return { ...auth, login, logout };
}
