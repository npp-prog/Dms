import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import WorkflowTracking from '../components/WorkflowTracking.jsx';

// Documents > Tracking: where each routed document is, for every user. Each sees the documents
// they have access to (theirs, their office's as office head, those routed to their office or
// forwarded to them; admins, all).
export default function Tracking() {
  const { profile, isAdmin, isHead } = useAuth();
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Tracking</h1>
          <p className="muted">Where each routed document is, step by step: {isAdmin ? 'every document.' : isHead
            ? <>the documents of the <b>{profile.office}</b> and those routed through it.</>
            : 'the documents you prepared and those that came through your office.'}
            {profile.office && <> Documents waiting for your office are in your <Link to="/inbox">Inbox</Link>.</>}</p>
        </div>
      </div>
      <WorkflowTracking />
    </div>
  );
}
