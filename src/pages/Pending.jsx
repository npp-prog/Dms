import { useAuth } from '../context/AuthContext.jsx';
import { AuthHero } from './Login.jsx';

export default function Pending({ error }) {
  const { profile, logout, refreshProfile } = useAuth();
  return (
    <div className="auth">
      <AuthHero />
      <section className="auth-panel">
        <div className="auth-box">
          <h2>{error ? 'Unable to load your account' : 'Waiting for approval'}</h2>
          {error ? (
            <div className="alert">{error}</div>
          ) : (
            <p className="muted">Hi {profile?.displayName}. Your account has been created. An administrator must
              approve it before you can use FTS.</p>
          )}
          <div className="row gap">
            <button className="btn btn-primary" onClick={() => refreshProfile()}>Check again</button>
            <button className="btn" onClick={logout}>Sign out</button>
          </div>
        </div>
      </section>
    </div>
  );
}
