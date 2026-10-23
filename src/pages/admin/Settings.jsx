import { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { saveSettings } from '../../lib/api.js';

export default function Settings() {
  const { settings, setSettings } = useAuth();
  const [form, setForm] = useState({ lguName: '', lguAddress: '', province: '', sealUrl: '', ...settings });
  const [status, setStatus] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setStatus('Saving…');
    try {
      const { updatedAt, ...clean } = form;
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
            <input value={form.lguName} onChange={set('lguName')} placeholder="e.g. Municipal Government of Candoni" />
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
        <div className="row gap">
          <button className="btn btn-primary">Save settings</button>
          {status && <span className="muted">{status}</span>}
        </div>
      </form>
    </div>
  );
}
