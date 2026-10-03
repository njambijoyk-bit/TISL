import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import quotationsAPI from '../../../_shared/api/quotations';
import { formatMoney } from '../../../_shared/lib/money';
import { errMsg } from '../../../_shared/store/helpers/apiState';

const STATUS = {
  requested: ['Being priced', '#f59e0b'], quoted: ['Ready for you', '#10b981'], revision_requested: ['Changes requested', '#f59e0b'],
  accepted: ['Accepted', '#3b82f6'], declined: ['Declined', '#ef4444'], expired: ['Expired', '#6b7280'],
};

export default function MyQuotations() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { quotationsAPI.mine().then(setRows).catch((e) => setError(errMsg(e, 'Could not load your quotations'))); }, []);

  return (
    <>
      <Header />
      <main style={{ maxWidth: 820, margin: '0 auto', padding: '32px 16px 64px' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0 0 6px' }}>My quotations</h1>
        <p style={{ margin: '0 0 20px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Prices we've prepared for you.</p>
        {error && <p role="alert" style={{ color: '#991b1b' }}>{error}</p>}
        {!rows && !error && <p>Loading…</p>}
        {rows?.length === 0 && <p style={{ color: 'var(--text-secondary)' }}>Nothing here yet.</p>}
        <div style={{ display: 'grid', gap: 12 }}>
          {rows?.map((q) => {
            const [label, color] = STATUS[q.doc_status] ?? [q.doc_status, '#6b7280'];
            return (
              <Link key={q.id} to={`/my-quotes/${q.id}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', padding: 16, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface-card, #fff)', textDecoration: 'none', color: 'var(--text-primary)' }}>
                <div>
                  <strong style={{ fontFamily: 'monospace' }}>{q.number}</strong>
                  {q.title && <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{q.title}</div>}
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{q.valid_until ? `Valid until ${q.valid_until}` : q.date}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700 }}>{q.doc_status === 'requested' ? '—' : formatMoney(q.total, q.currency)}</div>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color }}>{label}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </main>
      <Footer />
    </>
  );
}
