import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Layout() {
  const { profile, settings, isAdmin, isSuper, logout } = useAuth();
  return (
    <div className="app">
      <aside className="sidebar no-print">
        <div className="brand">
          <div className="brand-mark">FTS</div>
          <div>
            <div className="brand-name">Financial Transaction System</div>
            <div className="brand-sub">{settings.lguName || 'Document Format Repository'}</div>
          </div>
        </div>
        <nav>
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/formats">Document Formats</NavLink>
          <NavLink to="/new">Prepare Document</NavLink>
          <NavLink to="/documents">{isAdmin ? 'All Documents' : 'My Documents'}</NavLink>
          {isAdmin && <div className="nav-section">Administration</div>}
          {isAdmin && <NavLink to="/admin/types">Document Types</NavLink>}
          {isAdmin && <NavLink to="/admin/users">Users</NavLink>}
          {isSuper && <NavLink to="/admin/settings">Settings</NavLink>}
        </nav>
        <div className="sidebar-foot">
          <div className="who">
            <b>{profile?.displayName}</b>
            <span>{profile?.office || profile?.email}</span>
            <span className="role">{profile?.role}</span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={logout}>Sign out</button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
