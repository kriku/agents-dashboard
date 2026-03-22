import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../hooks/useAuth';

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/demo-token?workspace=ws-acme-prod');
      if (!res.ok) throw new Error(`Auth failed: ${res.status}`);
      const { token } = await res.json();
      login(token);
      navigate('/', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo" />
        <h1 className="login-heading">IAM Services</h1>
        {error && <p className="login-error">{error}</p>}
        <button className="login-button" onClick={handleLogin} disabled={loading}>
          {loading ? 'Signing in...' : 'Sign in with SSO'}
        </button>
      </div>
    </div>
  );
}
