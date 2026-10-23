import { useAuth } from '../context/AuthContext.jsx';
import { useState } from 'react';
import { AuthHero } from './Login.jsx';
import { isOwnerEmail } from '../lib/owner.js';

export default function Pending({ error }) {
  const { user, profile, logout, refreshProfile, resendVerification } = useAuth();
  const [sent, setSent] = useState(false);
  const ownerUnverified = isOwnerEmail(user?.email) && !user?.emailVerified;
  return (
    <div className="auth">
      <AuthHero />
      <section className="auth-panel">
        <div className="auth-box">
          <h2>{error ? 'Unable to load your account' : ownerUnverified ? 'Verify your email' : 'Waiting for approval'}</h2>
          {error ? (
            <>
              <div className="alert">{error}</div>
              {/permission/i.test(error) && (
                <p className="small muted">The database rules are not published yet, or an older version is published.
                  An administrator must open Firebase → Firestore Database → <b>Rules</b>, replace everything with the
                  contents of <code>firestore.rules</code> from the FTS repository, and click <b>Publish</b>. Then click
                  <b> Check again</b>.</p>
              )}
            </>
          ) : ownerUnverified ? (
            <>
              <p className="muted">{user.email} is the FTS superadmin. To protect it, Firebase must first confirm you own this
                address: open the verification link we emailed you (check Spam too), then click <b>Check again</b>.
                Or sign out and use <b>Continue with Google</b> with this account, which needs no link.</p>
              <p><button className="link" disabled={sent} onClick={() => resendVerification().then(() => setSent(true))}>
                {sent ? 'Verification email sent.' : 'Send the verification email again'}</button></p>
            </>
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
