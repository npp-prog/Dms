import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

const MESSAGES = {
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/email-already-in-use': 'An account with this email already exists.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/invalid-email': 'Please enter a valid email address.',
};

export default function Login() {
  const { login, register, resetPassword } = useAuth();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', password: '', displayName: '', office: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      if (mode === 'login') await login(form.email, form.password);
      else if (mode === 'register') await register(form);
      else {
        await resetPassword(form.email);
        setMessage('Password reset email sent.');
      }
    } catch (err) {
      setMessage(MESSAGES[err.code] || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="center-screen login-bg">
      <form className="card narrow" onSubmit={submit}>
        <div className="login-head">
          <div className="brand-mark lg">FTS</div>
          <h1>Financial Transaction System</h1>
          <p className="muted">Repository of financial document formats with guided preparation</p>
        </div>
        {mode === 'register' && (
          <>
            <label className="field-label">Full name</label>
            <input required value={form.displayName} onChange={set('displayName')} />
            <label className="field-label">Office / Department</label>
            <input value={form.office} onChange={set('office')} placeholder="e.g. Municipal Accounting Office" />
          </>
        )}
        <label className="field-label">Email</label>
        <input type="email" required value={form.email} onChange={set('email')} autoComplete="email" />
        {mode !== 'reset' && (
          <>
            <label className="field-label">Password</label>
            <input type="password" required minLength={6} value={form.password} onChange={set('password')}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          </>
        )}
        {message && <div className="alert">{message}</div>}
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : 'Send reset link'}
        </button>
        <div className="login-links">
          {mode !== 'login' && <button type="button" className="link" onClick={() => setMode('login')}>Back to sign in</button>}
          {mode === 'login' && <button type="button" className="link" onClick={() => setMode('register')}>Create an account</button>}
          {mode === 'login' && <button type="button" className="link" onClick={() => setMode('reset')}>Forgot password?</button>}
        </div>
      </form>
    </div>
  );
}
