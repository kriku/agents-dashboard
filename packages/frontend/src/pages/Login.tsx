import { useNavigate } from 'react-router';
import { useAuth } from '../hooks/useAuth';

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  function handleLogin() {
    login('mock-session-token');
    navigate('/', { replace: true });
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo" />
        <h1 className="login-heading">IAM Services</h1>
        <button className="login-button" onClick={handleLogin}>
          Sign in with SSO
        </button>
      </div>
    </div>
  );
}
