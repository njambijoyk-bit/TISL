import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { BadgeCheck, BadgeX } from 'lucide-react';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import coursesPublicAPI from '../../../_shared/api/coursesPublic';
import { card, field, primaryBtn } from '../../components/learnStyle';

const when = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : '');
const STATE = { valid: ['This certificate is genuine and valid.', '#16a34a'], expired: ['This certificate is genuine but has expired.', '#b45309'], revoked: ['This certificate was withdrawn and is no longer valid.', '#b91c1c'] };

/** Anyone can check a certificate: scan its QR (which opens this page) or paste its code. Shows only the name, the course and whether it is valid. */
export default function LearnVerifyPage() {
  const { code } = useParams();
  const nav = useNavigate();
  const [typed, setTyped] = useState('');
  const [r, setR] = useState(null);
  const [state, setState] = useState(code ? 'loading' : 'idle');

  useEffect(() => {
    if (!code) return;
    setState('loading');
    coursesPublicAPI.verifyCertificate(code).then((x) => { setR(x); setState('found'); }).catch(() => setState('missing'));
  }, [code]);

  const check = (e) => { e.preventDefault(); const t = typed.trim(); if (t) nav(`/learn/verify/${encodeURIComponent(t.includes('/q/') ? t.slice(t.lastIndexOf('/q/') + 3) : t)}`); };
  const [msg, colour] = STATE[r?.state] ?? ['', 'inherit'];

  return (
    <div className="min-h-screen">
      <Helmet><title>Check a certificate | TISL</title></Helmet>
      <Header />
      <main style={{ maxWidth: 640, margin: '0 auto', padding: '40px 20px 64px', display: 'grid', gap: 16 }} data-testid="verify">
        <h1 style={{ margin: 0, fontSize: 'clamp(1.5rem, 4vw, 2rem)', fontWeight: 900 }}>Check a certificate</h1>
        <form onSubmit={check} style={{ ...card, display: 'grid', gap: 8 }}>
          <label htmlFor="cv-code" style={{ fontWeight: 700 }}>Certificate code</label>
          <input id="cv-code" style={field} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Scan the QR on the certificate, or type the code under it" />
          <button type="submit" style={{ ...primaryBtn, justifySelf: 'start' }}>Check</button>
        </form>
        {state === 'loading' && <p>Checking…</p>}
        {state === 'missing' && <div style={{ ...card, borderColor: '#fca5a5' }} role="alert"><BadgeX size={18} aria-hidden="true" /> We could not find a genuine certificate for that code. Check it and try again.</div>}
        {state === 'found' && r && (
          <div style={{ ...card, display: 'grid', gap: 6, borderColor: colour }} role="status" data-testid="verify-result">
            <strong style={{ color: colour }}><BadgeCheck size={18} aria-hidden="true" /> {msg}</strong>
            <span style={{ fontSize: '1.3rem', fontWeight: 800 }}>{r.holder_name}</span>
            <span>completed <strong>{r.course_title}</strong></span>
            <span style={{ fontSize: '0.86rem' }}>Certificate {r.number} · issued {when(r.issued_at)} by {r.issuer}{r.expires_at ? ` · valid until ${when(r.expires_at)}` : ''}</span>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
