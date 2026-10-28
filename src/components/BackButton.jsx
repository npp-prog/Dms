import { useLocation, useNavigate } from 'react-router-dom';

// Where Back goes when there is no page to return to (the page was opened directly).
function parentOf(path) {
  if (/^\/documents\/[^/]+\/edit/.test(path)) return path.replace(/\/edit.*$/, '');
  if (/^\/documents\/[^/]+/.test(path)) return '/documents';
  if (/^\/new\/[^/]+/.test(path)) return '/new';
  if (/^\/formats\/[^/]+/.test(path)) return '/formats';
  if (/^\/checklists\/[^/]+/.test(path)) return '/checklists';
  if (/^\/admin\/types\/[^/]+/.test(path)) return '/admin/types';
  if (/^\/admin\/checklists\/[^/]+/.test(path)) return '/checklists';
  return '/';
}

// "← Back" in the upper left of every page: back to the page the user came from.
export default function BackButton() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  if (pathname === '/') return null;
  // React Router numbers the entries of this session; idx 0 means nothing to go back to.
  const canGoBack = (window.history.state?.idx ?? 0) > 0;
  return (
    <button type="button" className="btn btn-ghost btn-sm back-btn no-print"
      onClick={() => (canGoBack ? navigate(-1) : navigate(parentOf(pathname)))}>
      ← Back
    </button>
  );
}
