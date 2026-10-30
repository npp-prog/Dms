import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Icon, { Avatar } from './Icon.jsx';
import BackButton from './BackButton.jsx';
import AskDms from './AskDms.jsx';
import { isUnread, listInbox, watchConversations } from '../lib/api.js';

const ROLE_NAMES = { superadmin: 'Superadmin', admin: 'Administrator', user: 'User' };

export default function Layout() {
  const { user, profile, settings, isAdmin, isSuper, isHead, isRecords, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  // Documents waiting in the user's office (refreshed as the user moves around).
  const [waiting, setWaiting] = useState(0);
  useEffect(() => {
    if (!profile?.active) return;
    listInbox({ office: profile.office, uid: user.uid, head: isHead || isAdmin }).then((d) => setWaiting(d.length)).catch(() => {});
  }, [location.pathname, profile?.office, profile?.active, isAdmin, isHead, user.uid]);

  // Conversations with a message not seen yet (live).
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!profile?.active) return undefined;
    return watchConversations(user.uid, (list) => setUnread(list.filter((c) => isUnread(c, user.uid)).length), () => setUnread(0));
  }, [user.uid, profile?.active]);

  const groups = [
    { items: [['/', 'home', 'Dashboard', true]] },
    {
      label: 'Documents',
      items: [
        ['/tracking', 'workflow', 'Tracking'],
        ['/inbox', 'inbox', 'Inbox', false, waiting],
        ['/documents', 'documents', isAdmin || isRecords ? 'All Documents' : isHead ? 'Office Documents' : 'My Documents'],
        ['/checklists', 'check', 'Checklists'],
      ],
    },
    { label: 'Account', items: [['/messages', 'chat', 'Messages', false, unread], ['/profile', 'user', 'My Profile']] },
    isAdmin && {
      label: 'Administration',
      items: [
        ['/admin/types', 'types', 'Document Types'],
        ['/admin/workflow', 'workflow', 'Workflow'],
        ['/admin/users', 'users', 'Users'],
        isSuper && ['/admin/settings', 'settings', 'Settings'],
      ].filter(Boolean),
    },
  ].filter(Boolean);

  // The page name in the header: the menu item the page belongs to.
  const titles = [
    ...groups.flatMap((g) => g.items.map(([to, , label]) => [to, label])),
    ['/new', 'New Document'], ['/upload', 'Upload Document'], ['/formats', 'Document Types'], ['/admin/checklists', 'Checklists'],
  ];
  const path = location.pathname;
  const title = path === '/' ? 'Dashboard'
    : titles.filter(([to]) => to !== '/' && (path === to || path.startsWith(`${to}/`))).sort((a, b) => b[0].length - a[0].length)[0]?.[1] || 'DMS';

  // The panel button hides the menu (remembered on this device); on a phone it opens it.
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem('dms-side') === 'hidden'; } catch { return false; } });
  const togglePanel = () => {
    if (window.matchMedia('(max-width: 900px)').matches) { setOpen(!open); return; }
    setHidden(!hidden);
    try { localStorage.setItem('dms-side', hidden ? 'shown' : 'hidden'); } catch { /* not remembered */ }
  };
  const name = profile?.displayName || profile?.email;

  return (
    <div className={`shell${open ? ' nav-open' : ''}${hidden ? ' side-hidden' : ''}`}>
      <nav className="side" aria-label="Main">
        <Link to="/" className="side-brand">
          <img className="seal" src="/municipal-seal.png" alt="" />
          <span><b>DMS</b><small>{settings.lguName || 'Municipal Government of Candoni'}</small></span>
        </Link>
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
        <div className="side-foot">Document Management System</div>
      </nav>
      <div className="scrim" onClick={() => setOpen(false)} />
      <div className="shell-main">
        <header className="topbar">
          <button className="icon-btn panel-btn" aria-label="Show or hide the menu" aria-expanded={open || !hidden} onClick={togglePanel}>
            <Icon name="panel" />
          </button>
          <span className="top-title">{title}</span>
          <div className="spacer" />
          <Link to="/profile" className="pill-btn hide-sm" title="My Profile">{ROLE_NAMES[profile?.role] || profile?.role}</Link>
          <button className="pill-btn" title="Log out" onClick={logout}>
            <Icon name="logout" /><span className="lo-txt">Log out</span>
          </button>
          <Link to="/inbox" className="square-btn" title={waiting ? `${waiting} waiting in your inbox` : 'Inbox'}>
            <Icon name="bell" />{waiting > 0 && <span className="dot" />}
          </Link>
          <Link to="/profile" className="me" title={`${name} · My Profile`}>
            <Avatar name={name} size="sm" />
          </Link>
        </header>
        <main className="main">
          <BackButton />
          <Outlet />
        </main>
      </div>
      {profile?.active && <AskDms />}
    </div>
  );
}
