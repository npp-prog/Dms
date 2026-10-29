import { useEffect, useId, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import {
  getSavedCertificate, getSavedMark, removeSavedCertificate, removeSavedMark, saveCertificate, saveMark,
} from '../lib/api.js';
import { isValidAt, readCertificate } from '../lib/signing.js';
import { prepareMark } from '../lib/markImage.js';

const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-PH', { dateStyle: 'medium' }) : '');
const ROLE_NAMES = { superadmin: 'Superadmin', admin: 'Administrator', user: 'User' };

// My Profile: the user's details and their digital signature, registered once and changed any
// time: the DICT PNPKI certificate file (.p12/.pfx) and the signature mark placed on the PDFs
// they sign. When signing, they then only type their certificate password.
export default function Profile() {
  const { user, profile, isHead, updateMyProfile } = useAuth();
  const id = useId();
  const [name, setName] = useState(profile.displayName || '');
  const [cert, setCert] = useState(undefined);
  const [mark, setMark] = useState(undefined);
  const [file, setFile] = useState(null);
  const [password, setPassword] = useState('');
  const [replacing, setReplacing] = useState(false);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    getSavedCertificate(user.uid).then(setCert).catch((e) => { setCert(null); setMsg({ ok: false, text: e.message }); });
    getSavedMark(user.uid).then(setMark).catch(() => setMark(null));
  }, [user.uid]);
  const markUrl = useMemo(() => (mark ? URL.createObjectURL(new Blob([mark], { type: 'image/png' })) : ''), [mark]);

  const run = async (label, fn) => {
    setBusy(label); setMsg(null);
    try { await fn(); } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(''); }
  };

  const saveName = () => run('Saving…', async () => {
    if (!name.trim()) throw new Error('Type your name.');
    await updateMyProfile({ displayName: name.trim() });
    setMsg({ ok: true, text: 'Your name was saved.' });
  });

  // The password only checks that this is the user's certificate; it is not stored.
  const registerCert = () => run('Checking your certificate…', async () => {
    if (!file) throw new Error('Choose your certificate file (.p12 or .pfx).');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const info = readCertificate(bytes, password);
    if (!isValidAt(info)) throw new Error(`This certificate is not valid today (valid ${day(info.notBefore)} to ${day(info.notAfter)}). Renew it with DICT.`);
    if (!info.pnpki && !window.confirm(`This certificate was issued by "${info.issuer}", not by the DICT PNPKI. Register it anyway?`)) return;
    await saveCertificate(user.uid, bytes, info);
    setCert({ ...info, savedAt: new Date().toISOString() });
    setFile(null); setPassword(''); setReplacing(false);
    setMsg({ ok: true, text: `Certificate of ${info.name} registered. When you sign, you only type its password.` });
  });

  const removeCert = () => run('Removing…', async () => {
    if (!window.confirm('Remove your certificate from DMS? You will need to register it again to sign in DMS.')) return;
    await removeSavedCertificate(user.uid);
    setCert(null);
    setMsg({ ok: true, text: 'Your certificate was removed from DMS.' });
  });

  const changeMark = (f) => run('Preparing your signature mark…', async () => {
    if (!f) return;
    const png = await prepareMark(f);
    await saveMark(user.uid, png);
    setMark(png);
    setMsg({ ok: true, text: 'Signature mark saved.' });
  });

  const removeMark = () => run('Removing…', async () => {
    if (!window.confirm('Remove your signature mark?')) return;
    await removeSavedMark(user.uid);
    setMark(null);
  });

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>My Profile</h1>
          <p className="muted">Your details and your digital signature. Register your certificate and signature mark once; change them any time.</p>
        </div>
      </div>
      {msg && <div className={msg.ok ? 'alert alert-ok' : 'alert'}>{msg.text}</div>}

      <div className="profile-grid">
        <section className="card">
          <h3>Details</h3>
          <div className="field">
            <label className="field-label" htmlFor={`${id}-name`}>Name</label>
            <div className="row gap">
              <input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} />
              <button className="btn btn-ghost" disabled={!!busy || name.trim() === (profile.displayName || '')} onClick={saveName}>Save</button>
            </div>
          </div>
          <dl className="details">
            <dt>Email</dt><dd>{profile.email}</dd>
            <dt>Office</dt><dd>{profile.office || '—'}{isHead && <> <span className="badge badge-blue">Office head</span></>}</dd>
            <dt>Role</dt><dd>{ROLE_NAMES[profile.role] || profile.role}</dd>
          </dl>
          <p className="small muted">Your office and role are set by an administrator.</p>
        </section>

        <section className="card">
          <h3>Digital signature certificate</h3>
          <p className="small muted">Your DICT PNPKI certificate file (.p12 or .pfx). Only you can use it in DMS; not even an administrator can
            open it. Your password is never stored: you type it each time you sign, so use a strong one.</p>
          {cert === undefined && <div className="spinner" />}
          {cert && !replacing && (
            <div className="saved-cert">
              <div><b>{cert.name}</b> {cert.pnpki ? <span className="badge badge-green">DICT PNPKI</span> : <span className="badge badge-yellow">Not PNPKI</span>}</div>
              <div className="small muted">Issued by {cert.issuer || '—'}{cert.notAfter ? ` · valid until ${day(cert.notAfter)}` : ''}</div>
              {cert.notAfter && new Date(cert.notAfter) < new Date() && <div className="small sig-problem">Expired: register your renewed certificate.</div>}
              <div className="row gap small">
                <button type="button" className="link" onClick={() => setReplacing(true)}>Change certificate</button>
                <button type="button" className="link" disabled={!!busy} onClick={removeCert}>Remove</button>
              </div>
            </div>
          )}
          {cert !== undefined && (!cert || replacing) && (
            <div className="sign-panel">
              <div className="field">
                <label className="field-label" htmlFor={`${id}-p12`}>Certificate file (.p12 or .pfx)</label>
                <input id={`${id}-p12`} type="file" accept=".p12,.pfx,application/x-pkcs12" onChange={(e) => setFile(e.target.files[0] || null)} />
              </div>
              <div className="field">
                <label className="field-label" htmlFor={`${id}-pw`}>Certificate password (to check it is yours; not stored)</label>
                <input id={`${id}-pw`} type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && registerCert()} />
              </div>
              <div className="row gap">
                <button className="btn btn-primary" disabled={!!busy || !file || !password} onClick={registerCert}>{busy || 'Register certificate'}</button>
                {replacing && <button className="btn btn-ghost" onClick={() => { setReplacing(false); setFile(null); setPassword(''); }}>Cancel</button>}
              </div>
            </div>
          )}
        </section>

        <section className="card">
          <h3>Signature mark</h3>
          <p className="small muted">A picture of your handwritten signature, placed on the face of the PDFs you sign with your name and the date.
            A photo of dark ink on white paper works: DMS makes the paper see-through and crops it.</p>
          {mark === undefined && <div className="spinner" />}
          {mark && <img className="mark-preview mark-preview-lg" src={markUrl} alt="Your signature mark" />}
          {mark !== undefined && (
            <div className="row gap wrap small">
              <label className="btn btn-ghost btn-sm">
                {mark ? 'Change signature mark' : 'Upload signature mark'}
                <input type="file" accept="image/png,image/jpeg" hidden onChange={(e) => changeMark(e.target.files[0])} />
              </label>
              {mark && <button type="button" className="link" disabled={!!busy} onClick={removeMark}>Remove</button>}
              {busy && <span className="muted">{busy}</span>}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
