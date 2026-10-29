import { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { saveSettings } from '../../lib/api.js';
import { SIGNATORY_ROLES, signatoriesFrom } from '../../lib/signatories.js';

export default function Settings() {
  const { settings, setSettings } = useAuth();
  const [form, setForm] = useState({ lguName: '', lguAddress: '', province: '', sealUrl: '', ...settings, signatories: signatoriesFrom(settings) });
  const [status, setStatus] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setSig = (k) => (e) => setForm({ ...form, signatories: { ...form.signatories, [k]: e.target.value } });
  const [officeText, setOfficeText] = useState((settings.offices || []).join('\n'));

  const submit = async (e) => {
    e.preventDefault();
    setStatus('Saving…');
    try {
      const { updatedAt, ...rest } = form;
      const clean = { ...rest, offices: [...new Set(officeText.split('\n').map((o) => o.trim()).filter(Boolean))] };
      await saveSettings(clean);
      setSettings(clean);
      setStatus('Saved.');
    } catch (err) {
      setStatus(err.message);
    }
  };

  return (
    <div className="page">
      <h1>Settings</h1>
      <form className="card" onSubmit={submit}>
        <div className="fields">
          <div className="field"><label className="field-label">LGU name</label>
            <input value={form.lguName} onChange={set('lguName')} />
            <div className="help">Printed on document headers as <code>{'{{lgu.name}}'}</code></div></div>
          <div className="field"><label className="field-label">Province</label>
            <input value={form.province} onChange={set('province')} /></div>
          <div className="field field-wide"><label className="field-label">Address</label>
            <input value={form.lguAddress} onChange={set('lguAddress')} />
            <div className="help">Printed as <code>{'{{lgu.address}}'}</code></div></div>
          <div className="field field-wide"><label className="field-label">Seal / logo image URL</label>
            <input value={form.sealUrl} onChange={set('sealUrl')} placeholder="/municipal-seal.png" />
            <div className="help">Printed on document headers as <code>{'{{lgu.seal}}'}</code>. Leave blank to use the municipal seal.</div></div>
        </div>
        <h3>Signatories</h3>
        <p className="small muted">Printed on the forms where the official form pre-prints the name (e.g. the Municipal
          Accountant in Box B of the DV). Each document keeps the officials who were set when it was prepared.</p>
        <div className="fields">
          {SIGNATORY_ROLES.map((r) => (
            <div key={r.key} className="field field-wide">
              <label className="field-label">{r.label}</label>
              <div className="editor-row">
                <input placeholder="Name, as printed" value={form.signatories[r.key]} onChange={setSig(r.key)} />
                <input placeholder="Position" value={form.signatories[`${r.key}Position`]} onChange={setSig(`${r.key}Position`)} />
              </div>
              <div className="help">Template: <code>{`{{sig.${r.key}}}`}</code> <code>{`{{sig.${r.key}Position}}`}</code></div>
            </div>
          ))}
        </div>
        <h3>Offices</h3>
        <p className="small muted">One office per line. Assign each user to an office under <b>Users</b>; users see only the
          documents of their office. Renaming an office here does not move documents already saved under the old name.</p>
        <div className="fields">
          <div className="field field-wide">
            <textarea rows={10} value={officeText} onChange={(e) => setOfficeText(e.target.value)} />
          </div>
        </div>
        <div className="row gap">
          <button className="btn btn-primary">Save settings</button>
          {status && <span className="muted">{status}</span>}
        </div>
      </form>
    </div>
  );
}
