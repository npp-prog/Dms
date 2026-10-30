import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { auth } from '../firebase.js';
import Icon from './Icon.jsx';

const KEY = 'dms-ask';
const load = () => { try { return JSON.parse(sessionStorage.getItem(KEY)) || []; } catch { return []; } };

// **bold** only; everything else is plain text.
const rich = (s) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') && p.endsWith('**') && p.length > 4 ? <b key={i}>{p.slice(2, -2)}</b> : p));

// "Ask DMS": a help assistant in the corner of every page. It answers how to use DMS from the
// user guide (netlify/functions/assistant.mjs); it cannot see anyone's documents.
export default function AskDms() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState(load);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef(null);
  const input = useRef(null);
  const { pathname } = useLocation();

  useEffect(() => { try { sessionStorage.setItem(KEY, JSON.stringify(msgs.slice(-40))); } catch { /* not kept */ } }, [msgs]);
  useEffect(() => { if (open) { end.current?.scrollIntoView({ block: 'end' }); input.current?.focus(); } }, [open, msgs]);

  const ask = async (e) => {
    e?.preventDefault();
    const q = text.trim();
    if (!q || busy) return;
    const history = [...msgs, { role: 'user', content: q }];
    setMsgs([...history, { role: 'assistant', content: '' }]);
    setText(''); setBusy(true);
    const put = (content) => setMsgs((m) => [...m.slice(0, -1), { role: 'assistant', content }]);
    try {
      const token = await auth.currentUser.getIdToken();
      const r = await fetch('/.netlify/functions/assistant', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages: history.filter((m) => m.content), page: pathname }),
      });
      // Not the assistant (e.g. the local dev server, which has no Netlify functions).
      if (!(r.headers.get('content-type') || '').startsWith('text/plain')) { put('The assistant is not available here. It runs on the live site.'); return; }
      if (!r.ok || !r.body) { put((await r.text().catch(() => '')).slice(0, 400) || 'The assistant is not available right now.'); return; }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let answer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        answer += dec.decode(value, { stream: true });
        put(answer);
      }
      if (!answer.trim()) put('The assistant did not answer. Please try again.');
    } catch {
      put('The assistant could not be reached. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {open && (
        <section className="ask card" aria-label="Ask DMS">
          <div className="ask-head">
            <b>Ask DMS</b>
            <span className="row gap">
              {msgs.length > 0 && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setMsgs([])}>New chat</button>}
              <button type="button" className="btn-icon" title="Close" onClick={() => setOpen(false)}>×</button>
            </span>
          </div>
          <div className="ask-body">
            {msgs.length === 0 && <p className="small muted ask-hello">Ask how to do something in DMS: preparing, uploading, routing, signing or finding a document.</p>}
            {msgs.map((m, i) => (
              <div key={i} className={`chat-msg first last ${m.role === 'user' ? 'mine' : 'theirs'}`}>
                <div className="chat-bubble">{m.content ? rich(m.content) : <span className="ask-typing" aria-label="Thinking"><i /><i /><i /></span>}</div>
              </div>
            ))}
            <div ref={end} />
          </div>
          <form className="chat-send" onSubmit={ask}>
            <textarea ref={input} rows={1} value={text} maxLength={4000} aria-label="Your question" placeholder="Ask a question…"
              onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } }} />
            <button className="btn btn-primary btn-sm" disabled={busy || !text.trim()}>Ask</button>
          </form>
          <p className="xs muted ask-note">AI answers can be wrong. It cannot see your documents.</p>
        </section>
      )}
      <button type="button" className="ask-fab" title="Ask DMS" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="chat" /><span>Ask DMS</span>
      </button>
    </>
  );
}
