import { useAuth } from '../context/AuthContext.jsx';

export default function Pending({ error }) {
  const { profile, logout, refreshProfile } = useAuth();
  return (
    <div className="center-screen">
      <div className="card narrow">
        <h2>{error ? 'Unable to load your account' : 'Account awaiting approval'}</h2>
        {error ? (
          <p className="alert">{error}</p>
        ) : (
          <p>Hi {profile?.displayName}. Your account has been created but must be activated by an
            administrator before you can use FTS. Please contact your system administrator.</p>
        )}
        <div className="row gap">
          <button className="btn btn-primary" onClick={() => refreshProfile()}>Check again</button>
          <button className="btn btn-ghost" onClick={logout}>Sign out</button>
        </div>
      </div>
    </div>
  );
}
