import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import toast from 'react-hot-toast';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import { eventsEnquiryAPI, eventsPlatformAPI } from '../../../_shared/api/events';
import { errMsg } from '../../../_shared/store/helpers/apiState';

const box = { padding: 16, borderRadius: 14, border: '1px solid var(--line)', background: 'var(--surface-card, #fff)', display: 'grid', gap: 10 };
const input = { width: '100%', padding: '9px 11px', borderRadius: 10, border: '1px solid var(--line)', font: 'inherit', background: 'transparent', color: 'inherit' };
const btn = { padding: '10px 18px', borderRadius: 999, border: 0, background: 'var(--color-primary-500)', color: '#fff', fontWeight: 800, cursor: 'pointer' };
const STATUS = { new: 'We have your request', consulting: 'Talking it through', quoted: 'Your quotation is ready', accepted: 'Confirmed: we are planning it', declined: 'Declined', closed: 'Closed' };
const L = ({ label, children }) => <label style={{ display: 'grid', gap: 4, fontSize: '0.84rem', fontWeight: 600 }}>{label}{children}</label>;
const blank = { event_type: '', event_date: '', guests: '', budget_min: '', budget_max: '', location: '', notes: '', consultation_at: '', phone: '' };

/** "Plan my event": ask TISL to plan it, then follow the request from consultation and quotation to the plan itself. */
export default function PlanMyEventPage() {
  const [f, setF] = useState(blank);
  const [mine, setMine] = useState([]);
  const [cats, setCats] = useState([]);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => eventsEnquiryAPI.mine().then(setMine).catch(() => {}), []);
  useEffect(() => { load(); eventsPlatformAPI.categories().then(setCats).catch(() => {}); }, [load]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const send = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== ''));
      const r = await eventsEnquiryAPI.create(body);
      toast.success(r.message, { duration: 7000 }); setF(blank); load();
    } catch (err) { toast.error(errMsg(err, 'Could not send your request'), { duration: 8000 }); } finally { setBusy(false); }
  };
  const accept = async (id) => {
    try { const r = await eventsEnquiryAPI.accept(id); toast.success(r.message, { duration: 7000 }); load(); } catch (err) { toast.error(errMsg(err, 'Could not accept'), { duration: 8000 }); }
  };

  return (
    <div className="min-h-screen">
      <Helmet><title>Plan my event | TISL</title></Helmet>
      <Header />
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '32px 16px 64px', display: 'grid', gap: 18 }}>
        <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 900, color: 'var(--color-primary-500)' }}>Plan my event</h1>
        <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Weddings, corporate events, launches, parties. Tell us what you have in mind: we will talk it through, send you a quotation, and plan it with you.</p>

        {mine.length > 0 && (
          <section style={{ display: 'grid', gap: 10 }} aria-label="My requests">
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>My requests</h2>
            {mine.map((r) => (
              <div key={r.id} style={box}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}><strong>{r.event_type}{r.event_date ? ` · ${r.event_date}` : ''}</strong><span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-primary-500)' }}>{STATUS[r.status] ?? r.status}</span></div>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>{r.reference}</span>
                {r.quotation && <span style={{ fontSize: '0.86rem' }}>Quotation {r.quotation.voucher_number}: {Number(r.quotation.total_amount).toLocaleString()}</span>}
                {r.invoice && <span style={{ fontSize: '0.86rem' }}>Invoice {r.invoice.voucher_number}: {Number(r.invoice.total_amount).toLocaleString()}</span>}
                {r.status === 'quoted' && <div><button type="button" style={btn} onClick={() => accept(r.id)}>Accept the quotation</button> <Link to="/account" style={{ marginLeft: 10, fontSize: '0.84rem', color: 'var(--color-primary-500)' }}>See it in my account</Link></div>}
                {r.progress && (
                  <div style={{ display: 'grid', gap: 4, fontSize: '0.84rem' }}>
                    <span>Progress: {r.progress.done} of {r.progress.tasks} steps done</span>
                    <div style={{ height: 6, borderRadius: 999, background: 'var(--line)' }}><div style={{ width: `${r.progress.tasks ? Math.round(r.progress.done / r.progress.tasks * 100) : 0}%`, height: '100%', borderRadius: 999, background: 'var(--color-primary-500)' }} /></div>
                    {r.progress.milestones.map((m) => <span key={m.title} style={{ color: m.done_at ? '#047857' : 'var(--text-secondary)' }}>{m.done_at ? '✓' : '○'} {m.title}{m.due_on ? ` · ${m.due_on}` : ''}</span>)}
                  </div>
                )}
              </div>
            ))}
          </section>
        )}

        <form onSubmit={send} style={box}>
          <strong>New request</strong>
          <L label="What kind of event?"><input required list="evt-types" maxLength={80} value={f.event_type} onChange={set('event_type')} style={input} placeholder="Wedding, conference, birthday…" /></L>
          <datalist id="evt-types">{cats.flatMap((c) => [c, ...(c.children ?? [])]).map((c) => <option key={c.id} value={c.name} />)}</datalist>
          <L label="When (if you know)"><input type="date" value={f.event_date} onChange={set('event_date')} style={input} /></L>
          <L label="How many guests?"><input type="number" min="1" value={f.guests} onChange={set('guests')} style={input} /></L>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <L label="Budget from"><input type="number" min="0" value={f.budget_min} onChange={set('budget_min')} style={input} /></L>
            <L label="Budget up to"><input type="number" min="0" value={f.budget_max} onChange={set('budget_max')} style={input} /></L>
          </div>
          <L label="Where?"><input maxLength={200} value={f.location} onChange={set('location')} style={input} /></L>
          <L label="Phone"><input maxLength={40} value={f.phone} onChange={set('phone')} style={input} /></L>
          <L label="A good time for a first conversation"><input type="datetime-local" value={f.consultation_at} onChange={set('consultation_at')} style={input} /></L>
          <L label="Tell us more"><textarea rows={5} maxLength={5000} value={f.notes} onChange={set('notes')} style={input} /></L>
          <div><button type="submit" disabled={busy || !f.event_type.trim()} style={{ ...btn, opacity: busy ? 0.6 : 1 }}>{busy ? 'Sending…' : 'Send my request'}</button></div>
        </form>
      </main>
      <Footer />
    </div>
  );
}
