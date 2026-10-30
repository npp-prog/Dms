import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { listDocuments } from '../lib/api.js';
import {
  backupStatus, buildBackup, driveCall, fileInArchive, getArchiveSettings, isArchived, listArchive, listBackups, logBackup,
  processedAt, saveArchiveSettings, saveBackup, toBackUp,
} from '../lib/archive.js';
import { drnOf } from '../lib/naming.js';
import Select from '../components/Select.jsx';

const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-PH', { dateStyle: 'medium' }) : '');
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '');

// The Archive: processed documents (their route is complete). Everyone sees the processed
// documents they may open; the Records Officer (and administrators) see them all, record where
// each is filed, and back the archive up to the devices they keep.
export default function Archive() {
  const { user, profile, isAdmin, isHead, isRecords, actor } = useAuth();
  const keeper = isRecords || isAdmin;
  const [docs, setDocs] = useState(null);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ q: '', type: '', office: '', year: '' });
  const [filing, setFiling] = useState(null); // { id, location, note }

  const load = () => (keeper ? listArchive() : listDocuments({ uid: user.uid, office: profile.office, head: isHead }).then((l) => l.filter(isArchived)))
    .then(setDocs).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [keeper, user.uid, profile.office, isHead]);

  const types = useMemo(() => [...new Set((docs || []).map((d) => d.typeCode))].sort(), [docs]);
  const offices = useMemo(() => [...new Set((docs || []).map((d) => d.office).filter(Boolean))].sort(), [docs]);
  const years = useMemo(() => [...new Set((docs || []).map((d) => processedAt(d).slice(0, 4)).filter(Boolean))].sort().reverse(), [docs]);
  const shown = useMemo(() => (docs || []).filter((d) => {
    const q = filters.q.toLowerCase();
    return (!filters.type || d.typeCode === filters.type)
      && (!filters.office || d.office === filters.office)
      && (!filters.year || processedAt(d).startsWith(filters.year))
      && (!q || `${d.controlNo} ${d.title} ${d.createdByName} ${d.archive?.location || ''} ${Object.values(d.refNos || {}).map((r) => r.value).join(' ')}`.toLowerCase().includes(q));
  }), [docs, filters]);

  const saveFiling = async () => {
    try { await fileInArchive(filing.id, filing, actor); setFiling(null); await load(); } catch (e) { setError(e.message); }
  };

  return (
    <div className="page">
      <div className="page-head"><div><h1>Archive</h1></div></div>
      {keeper && <DriveBackup />}
      {keeper && docs && <Backups docs={docs} me={actor} />}
      <div className="filters">
        <input className="search" placeholder="Search control no., DV/OBR no., payee, where filed…" value={filters.q}
          onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        <Select value={filters.year} onChange={(e) => setFilters({ ...filters, year: e.target.value })} aria-label="Year">
          <option value="">All years</option>
          {years.map((y) => <option key={y}>{y}</option>)}
        </Select>
        <Select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })} aria-label="Type">
          <option value="">All types</option>
          {types.map((t) => <option key={t}>{t}</option>)}
        </Select>
        {keeper && (
          <Select value={filters.office} onChange={(e) => setFilters({ ...filters, office: e.target.value })} aria-label="Office">
            <option value="">All offices</option>
            {offices.map((o) => <option key={o}>{o}</option>)}
          </Select>
        )}
      </div>
      {error && <div className="alert">{error}</div>}
      {!docs && !error && <div className="spinner" />}
      {docs && (
        <div className="card table-card">
          <table className="data-table">
            <thead><tr><th>Control No.</th><th>DRN</th><th>Type</th><th>Payee / Subject</th>{keeper && <th>Office</th>}<th>Processed</th><th>Filed at</th></tr></thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan={7} className="muted">No processed documents{filters.q || filters.type || filters.year || filters.office ? ' match' : ' yet'}.</td></tr>}
              {shown.map((d) => (
                <tr key={d.id}>
                  <td><Link to={`/documents/${d.id}`}><b>{d.controlNo}</b></Link></td>
                  <td className="small">{drnOf(d) || '—'}</td>
                  <td>{d.typeCode}</td>
                  <td>{d.title}</td>
                  {keeper && <td className="small">{d.office || '—'}</td>}
                  <td className="small">{day(processedAt(d))}</td>
                  <td className="small">
                    {filing?.id === d.id ? (
                      <div className="archive-file">
                        <input aria-label="Where it is filed" value={filing.location} onChange={(e) => setFiling({ ...filing, location: e.target.value })} />
                        <input aria-label="Note" placeholder="Note (optional)" value={filing.note} onChange={(e) => setFiling({ ...filing, note: e.target.value })} />
                        <div className="row gap">
                          <button type="button" className="btn btn-primary btn-sm" onClick={saveFiling}>Save</button>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFiling(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {d.archive?.location ? <><b>{d.archive.location}</b>{d.archive.note && <div className="muted">{d.archive.note}</div>}</> : <span className="muted">Not filed yet</span>}
                        {keeper && <div><button type="button" className="link xs" onClick={() => setFiling({ id: d.id, location: d.archive?.location || '', note: d.archive?.note || '' })}>{d.archive?.location ? 'Change' : 'Record where it is filed'}</button></div>}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const DRIVE_RESULT = {
  connected: { ok: true, text: 'Google Drive connected. The archive is backed up to it every 10 minutes.' },
  cancelled: { ok: false, text: 'Not connected: the Google sign-in was cancelled.' },
  expired: { ok: false, text: 'Not connected: the sign-in took too long. Try again.' },
  'no-token': { ok: false, text: 'Not connected: Google gave no lasting access. Remove DMS from the account (myaccount.google.com → Security → Third-party access) and connect again.' },
  failed: { ok: false, text: 'Not connected: Google refused. See the error below.' },
  'not-set-up': { ok: false, text: 'The Google Drive backup is not set up in Netlify yet (see the README).' },
};

// Automatic backup to Google Drive: every 10 minutes, a server function copies new and changed
// processed documents to the connected account's Drive (folder DMS Archive).
function DriveBackup() {
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(() => DRIVE_RESULT[new URLSearchParams(window.location.search).get('drive')] || null);
  const load = () => driveCall('drive-backup-now', { action: 'status' }).then(setS).catch((e) => setS({ unavailable: e.message }));
  useEffect(() => { load(); }, []);
  const act = async (label, fn) => {
    setBusy(label); setMsg(null);
    try { await fn(); } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(''); load(); }
  };
  const connect = () => act('Opening Google…', async () => { window.location.href = (await driveCall('drive-auth', { action: 'start' })).url; });
  const disconnect = () => window.confirm('Stop backing up to this Google account? The files already there stay in its Drive.')
    && act('Disconnecting…', () => driveCall('drive-auth', { action: 'disconnect' }));
  const now = () => act('Backing up…', async () => {
    const r = await driveCall('drive-backup-now', { action: 'run' });
    setMsg(r.skipped ? { ok: false, text: r.skipped } : { ok: true, text: `Backed up ${r.documents} document(s), ${r.files} new file(s)${r.caughtUp ? '. Everything is backed up.' : '. More to go: it goes on every 10 minutes.'}` });
  });
  if (!s) return null;
  if (s.unavailable || s.configured === false) {
    return (
      <section className="card archive-backup">
        <div className="card-head"><h3>Google Drive</h3><span className="badge badge-gray">Not set up</span></div>
        <p className="small muted">{s.unavailable || 'The automatic backup to Google Drive is not set up yet: an administrator adds the Google OAuth client in Netlify (README).'}</p>
      </section>
    );
  }
  return (
    <section className="card archive-backup">
      <div className="card-head">
        <h3>Google Drive</h3>
        <span className={`badge ${s.connected ? (s.lastError ? 'badge-red' : 'badge-green') : 'badge-gray'}`}>{s.connected ? (s.lastError ? 'Problem' : 'Automatic') : 'Not connected'}</span>
      </div>
      {s.connected ? (
        <>
          <p className="small">Backed up automatically every 10 minutes to <b>{s.email}</b>, folder <b>DMS Archive</b> (by year and type, a folder per document
            with its PDFs, attachments and record).</p>
          <p className="small muted">Connected by {s.by} on {when(s.at)}. It reads the archive as {s.by}: if they stop being the Records Officer, connect it again.</p>
          <p className="small muted">{s.lastRunAt ? `Last run ${when(s.lastRunAt)}` : 'Not run yet'}{s.documents ? ` · ${s.documents} document backup(s), ${s.files || 0} file(s) so far` : ''}{s.lastRunAt && s.caughtUp === false ? ' · still catching up' : ''}.</p>
          {s.lastMissing?.length > 0 && <p className="small muted">Files that could not be read last time: {s.lastMissing.join('; ')}.</p>}
          {s.lastError && <div className="alert small">Last run failed: {s.lastError}</div>}
          <div className="row gap wrap">
            <button type="button" className="btn btn-primary btn-sm" disabled={!!busy} onClick={now}>{busy === 'Backing up…' ? busy : 'Back up now'}</button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={disconnect}>Disconnect</button>
          </div>
        </>
      ) : (
        <>
          <p className="small">Connect the Google account whose Drive keeps the archive. From then on, every processed document is copied there
            automatically, with no one needing to be signed in.</p>
          <button type="button" className="btn btn-primary btn-sm" disabled={!!busy} onClick={connect}>{busy || 'Connect Google Drive'}</button>
        </>
      )}
      {msg && <div className={`alert small ${msg.ok ? 'alert-ok' : ''}`}>{msg.text}</div>}
    </section>
  );
}

// Backups of the archive to the Records Officer's devices: which devices, how often, the last
// backup to each, and Back up now (a ZIP saved to the device).
function Backups({ docs, me }) {
  const [settings, setSettings] = useState(null);
  const [backups, setBackups] = useState([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ device: '', kind: 'new' });
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  const load = () => Promise.all([getArchiveSettings(), listBackups()]).then(([s, b]) => {
    setSettings(s); setBackups(b);
    setForm((f) => ({ ...f, device: f.device || s.devices[0]?.id || '' }));
  }).catch((e) => setMsg({ ok: false, text: e.code === 'permission-denied'
    ? 'Backups are not switched on yet: an administrator must publish the latest firestore.rules (Firebase console → Firestore → Rules).' : e.message }));
  useEffect(() => { load(); }, []);
  if (!settings) return msg ? <div className="alert">{msg.text}</div> : null;

  const status = backupStatus(backups, settings);
  // The chosen device, else the first (e.g. one just added, or the chosen one removed).
  const device = settings.devices.find((d) => d.id === form.device) || settings.devices[0];
  const last = device ? backups.find((b) => b.device === device.id) : null;
  const batch = toBackUp(docs, last, form.kind);

  const run = async () => {
    setBusy('Preparing…'); setMsg(null);
    try {
      const { blob, files, failed } = await buildBackup(batch, setBusy);
      const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
      const saved = await saveBackup(blob, `DMS archive ${stamp} ${form.kind === 'all' ? 'all' : 'new'}.zip`);
      if (saved === 'cancelled') { setMsg({ ok: false, text: 'Not saved: no backup recorded.' }); return; }
      await logBackup({ device: device.id, deviceName: device.name, kind: form.kind, count: batch.length, files, failed: failed.length }, me);
      await load();
      setMsg({ ok: !failed.length, text: `${saved === 'saved' ? 'Saved' : 'Downloaded: move the ZIP to'} ${saved === 'saved' ? `to ${device.name}` : device.name}. ${batch.length} document(s), ${files} file(s)${failed.length ? `; ${failed.length} file(s) could not be added (listed in could-not-be-added.txt)` : ''}.` });
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally { setBusy(''); }
  };

  return (
    <section className="card archive-backup">
      <div className="card-head">
        <h3>Backups</h3>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(!editing)}>{editing ? 'Done' : 'Devices and schedule'}</button>
      </div>
      {editing ? <Devices settings={settings} onSaved={(s) => { setSettings(s); setEditing(false); setForm((f) => ({ ...f, device: s.devices.some((d) => d.id === f.device) ? f.device : s.devices[0]?.id || '' })); }} /> : (
        <>
          {status.length === 0 && <p className="small muted">No backup device yet. Click <b>Devices and schedule</b> and add the computer, external drive or other device the archive is backed up to.</p>}
          <ul className="receipts">
            {status.map((d) => (
              <li key={d.id}>
                <span><b>{d.name}</b>{d.note && <span className="muted small"> · {d.note}</span>}</span>
                <span className="small">{d.last ? <>Last backup {when(d.last.at)} by {d.last.byName}</> : 'Never backed up'}
                  {' '}<span className={`badge ${d.due ? 'badge-yellow' : 'badge-green'}`}>{d.due ? 'Due' : 'Up to date'}</span></span>
              </li>
            ))}
          </ul>
          {status.length > 0 && (
            <div className="archive-run">
              <Select value={device?.id || ''} onChange={(e) => setForm({ ...form, device: e.target.value })} aria-label="Device">
                {settings.devices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
              <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} aria-label="What to back up">
                <option value="new">New and changed since the last backup to it</option>
                <option value="all">Everything in the archive</option>
              </Select>
              <button type="button" className="btn btn-primary btn-sm" disabled={!!busy || !batch.length} onClick={run}>{busy || `Back up ${batch.length} document${batch.length === 1 ? '' : 's'}`}</button>
            </div>
          )}
          <p className="help">Every {settings.everyDays} day{settings.everyDays === 1 ? '' : 's'}. The backup is one ZIP: each document's PDFs, attachments and record, by year and type,
            with an index. On a computer with Chrome or Edge you choose where to save it (e.g. the external drive); elsewhere it is downloaded, to be moved to the device.</p>
          {msg && <div className={`alert small ${msg.ok ? 'alert-ok' : ''}`}>{msg.text}</div>}
          {backups.length > 0 && (
            <details className="archive-log">
              <summary className="small">Backup log ({backups.length})</summary>
              <ul className="receipts">
                {backups.slice(0, 50).map((b) => (
                  <li key={b.id} className="small"><span>{when(b.at)} · {b.deviceName}</span>
                    <span>{b.kind === 'all' ? 'Everything' : 'New and changed'}: {b.count} document(s), {b.files} file(s){b.failed ? `, ${b.failed} not added` : ''} · {b.byName}</span></li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}

function Devices({ settings, onSaved }) {
  const [devices, setDevices] = useState(settings.devices);
  const [everyDays, setEveryDays] = useState(settings.everyDays);
  const [error, setError] = useState('');
  const set = (i, patch) => setDevices(devices.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const save = async () => {
    const clean = devices.map((d) => ({ ...d, name: d.name.trim(), note: (d.note || '').trim() })).filter((d) => d.name);
    try { await saveArchiveSettings({ devices: clean, everyDays }); onSaved({ ...settings, devices: clean, everyDays: Number(everyDays) || 7 }); } catch (e) { setError(e.message); }
  };
  return (
    <div className="fields">
      <div className="field field-wide"><span className="field-label">Backup devices</span>
        {devices.map((d, i) => (
          <div key={d.id} className="editor-row compact">
            <input aria-label="Device name" placeholder="Device name" value={d.name} onChange={(e) => set(i, { name: e.target.value })} />
            <input aria-label="Where it is kept" placeholder="Where it is kept (optional)" value={d.note || ''} onChange={(e) => set(i, { note: e.target.value })} />
            <button type="button" className="btn-icon" title="Remove" onClick={() => setDevices(devices.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDevices([...devices, { id: `d${Date.now().toString(36)}`, name: '', note: '' }])}>+ Device</button>
        <div className="help">The computer, external drive, flash drive or network storage of the Records Office that keeps the backups. Removing one keeps its backups in the log.</div>
      </div>
      <div className="field"><label className="field-label" htmlFor="ar-every">Back up every (days)</label>
        <input id="ar-every" type="number" min={1} max={90} value={everyDays} onChange={(e) => setEveryDays(e.target.value)} />
        <div className="help">A device not backed up for this long shows as due, here and on the Dashboard.</div></div>
      {error && <div className="alert small">{error}</div>}
      <div className="row gap"><button type="button" className="btn btn-primary btn-sm" onClick={save}>Save</button></div>
    </div>
  );
}
