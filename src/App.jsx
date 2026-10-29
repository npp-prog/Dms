import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Pending from './pages/Pending.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Formats from './pages/Formats.jsx';
import FormatView from './pages/FormatView.jsx';
import PrepareDocument from './pages/PrepareDocument.jsx';
import Documents from './pages/Documents.jsx';
import Inbox from './pages/Inbox.jsx';
import DocumentView from './pages/DocumentView.jsx';
import DocumentTypes from './pages/admin/DocumentTypes.jsx';
import DocumentTypeEditor from './pages/admin/DocumentTypeEditor.jsx';
import Users from './pages/admin/Users.jsx';
import Settings from './pages/admin/Settings.jsx';
import Checklists from './pages/Checklists.jsx';
import ChecklistView from './pages/ChecklistView.jsx';
import ChecklistEditor from './pages/admin/ChecklistEditor.jsx';

function AdminOnly({ children, superOnly = false }) {
  const { isAdmin, isSuper } = useAuth();
  if (superOnly ? !isSuper : !isAdmin) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { user, profile, loading, error } = useAuth();

  if (loading) return <div className="center-screen"><div className="spinner" /></div>;
  if (!user) return <Login />;
  if (error || !profile?.active) return <Pending error={error} />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="formats" element={<Formats />} />
        <Route path="formats/:typeId" element={<FormatView />} />
        <Route path="new" element={<PrepareDocument />} />
        <Route path="new/:typeId" element={<PrepareDocument />} />
        <Route path="checklists" element={<Checklists />} />
        <Route path="checklists/:code" element={<ChecklistView />} />
        <Route path="admin/checklists/new" element={<AdminOnly><ChecklistEditor /></AdminOnly>} />
        <Route path="admin/checklists/:code" element={<AdminOnly><ChecklistEditor /></AdminOnly>} />
        <Route path="inbox" element={<Inbox />} />
        <Route path="documents" element={<Documents />} />
        <Route path="documents/:docId" element={<DocumentView />} />
        <Route path="documents/:docId/edit" element={<PrepareDocument />} />
        <Route path="admin/types" element={<AdminOnly><DocumentTypes /></AdminOnly>} />
        <Route path="admin/types/new" element={<AdminOnly><DocumentTypeEditor /></AdminOnly>} />
        <Route path="admin/types/:typeId" element={<AdminOnly><DocumentTypeEditor /></AdminOnly>} />
        <Route path="admin/users" element={<AdminOnly><Users /></AdminOnly>} />
        <Route path="admin/settings" element={<AdminOnly superOnly><Settings /></AdminOnly>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
