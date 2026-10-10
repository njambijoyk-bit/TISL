import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import eventTicketsAPI from '../../../_shared/api/eventTickets';
import { errMsg } from '../../../_shared/store/helpers/apiState';

/** "I lost my tickets": the buyer gives the email they bought with and we send the tickets for events still to come. The answer is the same whether or not there were any. */
export default function FindTicketsPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { setDone((await eventTicketsAPI.resend(email)).message); } catch (err) { toast.error(errMsg(err, 'Please try again in a minute.')); } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen">
      <Helmet><title>Find my tickets | TISL</title></Helmet>
      <Header />
      <main style={{ maxWidth: 480, margin: '0 auto', padding: '40px 16px 64px', display: 'grid', gap: 14 }}>
        <h1 style={{ margin: 0, fontSize: '1.7rem', fontWeight: 900, color: 'var(--color-primary-500)' }}>Find my tickets</h1>
        <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Lost the email? Enter the address you bought with and we will send your tickets again.</p>
        {done ? (
          <p role="status" style={{ margin: 0, padding: 14, borderRadius: 12, background: 'rgba(4,120,87,0.08)', color: '#065f46', fontWeight: 600 }}>{done}</p>
        ) : (
          <form onSubmit={submit} style={{ display: 'grid', gap: 10 }}>
            <label htmlFor="ft-email" style={{ fontSize: '0.74rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-secondary)' }}>Email</label>
            <input id="ft-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" style={{ padding: '11px 12px', borderRadius: 10, border: '1.5px solid var(--line)', background: 'var(--surface-input, #fff)', color: 'inherit', fontFamily: 'inherit', fontSize: '0.95rem' }} />
            <button type="submit" disabled={busy} style={{ padding: '12px 16px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 800, color: '#fff', background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))', opacity: busy ? 0.6 : 1 }}>{busy ? 'Sending…' : 'Send my tickets'}</button>
          </form>
        )}
        <Link to="/events" style={{ color: 'var(--color-primary-500)', fontWeight: 700 }}>See what is on</Link>
      </main>
      <Footer />
    </div>
  );
}
