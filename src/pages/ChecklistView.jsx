import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { getChecklist } from '../lib/api.js';
import ChecklistSheet from '../components/ChecklistSheet.jsx';

export default function ChecklistView() {
  const { code } = useParams();
  const { settings, isAdmin } = useAuth();
  const [checklist, setChecklist] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getChecklist(code).then((c) => (c ? setChecklist(c) : setError('Checklist not found.'))).catch((e) => setError(e.message));
  }, [code]);

  if (error) return <div className="page"><div className="alert">{error}</div></div>;
  if (!checklist) return <div className="page"><div className="spinner" /></div>;

  const required = checklist.items.filter((i) => i.required).length;
  return (
    <div className="page">
      <div className="page-head no-print">
        <div>
          <div className="crumbs"><Link to="/checklists">Checklists</Link> / {checklist.code}</div>
          <h1>{checklist.code} — {checklist.title}</h1>
          <p>{checklist.category} · {required} always required · {checklist.items.length - required} if applicable</p>
        </div>
        <div className="row gap">
          <button className="btn btn-primary" onClick={() => window.print()}>Print checklist</button>
          {isAdmin && <Link className="btn" to={`/admin/checklists/${checklist.code}`}>Edit</Link>}
        </div>
      </div>
      <div className="alert-info no-print">
        Items with only a <b>Y</b> box are always required. Items with <b>Y</b> and <b>N/A</b> boxes are required only if
        they apply to the transaction. When you prepare a document in FTS, choose this checklist as the transaction type and
        FTS prints it with your answers.
      </div>
      <ChecklistSheet checklist={checklist} settings={settings} />
    </div>
  );
}
