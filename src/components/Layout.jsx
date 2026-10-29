import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Icon, { Avatar } from './Icon.jsx';
import BackButton from './BackButton.jsx';
import { listInbox } from '../lib/api.js';

const ROLE_NAMES = { superadmin: 'Superadmin', admin: 'Administrator', user: 'User' };

export default function Layout() {
  const { profile, settings, isAdmin, isSuper, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  // Documents waiting in the user's office (refreshed as the user moves around).
  const [waiting, setWaiting] = useState(0);
  useEffect(() => {
    if (!profile?.active || (!profile.office && !isAdmin)) return;
    listInbox({ office: profile.office, all: !profile.office }).then((d) => setWaiting(d.length)).catch(() => {});
  }, [location.pathname, profile?.office, profile?.active, isAdmin]);

  const groups = [
    { items: [['/', 'home', 'Dashboard', true]] },
    {
      label: 'Documents',
      items: [
        ['/inbox', 'inbox', 'Inbox', false, waiting],
        ['/workflow', 'workflow', 'Workflow'],
        ['/formats', 'formats', 'Document Formats'],
        ['/checklists', 'check', 'Checklists'],
        ['/new', 'new', 'Prepare Document'],
        ['/documents', 'documents', isAdmin ? 'All Documents' : 'My Documents'],
      ],
    },
    isAdmin && {
      label: 'Administration',
      items: [
        ['/admin/types', 'types', 'Document Types'],
        ['/admin/users', 'users', 'Users'],
        isSuper && ['/admin/settings', 'settings', 'Settings'],
      ].filter(Boolean),
    },
  ].filter(Boolean);

  return (
    <div className={open ? 'nav-open' : ''}>
      <header className="topbar">
        <button className="icon-btn menu-btn" aria-label="Menu" aria-expanded={open} onClick={() => setOpen(!open)}>
          <Icon name="menu" />
        </button>
        <img className="seal" src="/municipal-seal.png" alt="" />
        <div className="brand">
          <b>DMS</b>
          <span>Document Management System · {settings.lguName || 'Municipal Government of Candoni'}</span>
        </div>
        <div className="spacer" />
        <div className="me">
          <Avatar name={profile?.displayName || profile?.email} size="sm" />
          <div className="who">
            <div>{profile?.displayName}</div>
            <div className="role">{ROLE_NAMES[profile?.role] || profile?.role}</div>
          </div>
        </div>
        <button className="icon-btn" title="Log out" onClick={logout}>
          <Icon name="logout" /><span className="lo-txt">Log out</span>
        </button>
      </header>
      <div className="layout">
        <nav className="side" aria-label="Main">
          {groups.map((g, gi) => (
            <div key={gi}>
              {g.label && <div className="group">{g.label}</div>}
              {g.items.map(([to, icon, label, end, count]) => (
                <NavLink key={to} to={to} end={end}>
                  <Icon name={icon} className="nav-ic" /><span className="lbl">{label}</span>
                  {count > 0 && <span className="count">{count}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="scrim" onClick={() => setOpen(false)} />
        <main className="main">
          <BackButton />
          <Outlet />
        </main>
      </div>
    </div>
  );
}
