import WorkflowTracking from '../components/WorkflowTracking.jsx';

// Documents > Tracking: where each routed document is, for every user. Each sees the documents
// they have access to (theirs, their office's as office head, those routed to their office or
// forwarded to them; admins, all).
export default function Tracking() {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Tracking</h1>
        </div>
      </div>
      <WorkflowTracking />
    </div>
  );
}
