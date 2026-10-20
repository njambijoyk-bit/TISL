import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Gavel, Calendar } from 'lucide-react';
import { publicTendersAPI } from '../../../_shared/api/index';
import { card, colors } from '../../../_shared/theme/tokens';
import { TextInput, SelectInput } from '../../../core/components/admin/ui/Form';
import { Page, Heading, Loading, Empty, StatusBadge } from '../../components/procurement/ui';
import { mono, fmtLongDate, fmtDateTime, METHOD_LABELS, CATEGORY_LABELS, linkStyle } from '../../components/procurement/format';

export default function PublicTenders() {
  const [tenders, setTenders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [method, setMethod] = useState('');
  const [state, setState] = useState('open');

  useEffect(() => {
    setLoading(true);
    publicTendersAPI.list({ search: search || undefined, category: category || undefined, method: method || undefined, state: state || undefined })
      .then(r => { setTenders(r.rows || []); setFailed(false); })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [search, category, method, state]);

  return (
    <Page width={980}>
      <Heading title="Tenders" description="Tender notices open to the public. To bid, register as a vendor or sign in." />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 16 }}>
        <TextInput value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by title or number" aria-label="Search tenders" />
        <SelectInput value={state} onChange={e => setState(e.target.value)} aria-label="Open or closed">
          <option value="open">Open for bids</option>
          <option value="closed">Closed</option>
          <option value="">All</option>
        </SelectInput>
        <SelectInput value={category} onChange={e => setCategory(e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </SelectInput>
        <SelectInput value={method} onChange={e => setMethod(e.target.value)} aria-label="Procurement method">
          <option value="">All methods</option>
          {Object.entries(METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </SelectInput>
      </div>

      {loading ? <Loading /> : failed ? <Empty icon={Gavel}>Tenders could not be loaded. Please try again shortly.</Empty>
        : tenders.length === 0 ? <Empty icon={Gavel}>No tenders match</Empty> : (
          <div style={{ display: 'grid', gap: 10 }}>
            {tenders.map(t => (
              <Link key={t.id} to={`/tenders/${t.id}`} style={{ ...card, display: 'block', padding: '16px 20px', textDecoration: 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: colors.text, flex: '1 1 320px', minWidth: 0, overflowWrap: 'anywhere' }}>{t.title}</div>
                  <StatusBadge status={t.is_open ? 'active' : 'closed'} label={t.is_open ? 'Open' : 'Closed'} />
                </div>
                <div style={{ fontSize: '0.76rem', marginTop: 8, display: 'flex', gap: '4px 16px', flexWrap: 'wrap', color: colors.textMuted }}>
                  <span style={mono}>{t.tender_number}</span>
                  <span>{CATEGORY_LABELS[t.category] || t.category}</span>
                  <span>{METHOD_LABELS[t.procurement_method] || t.procurement_method}</span>
                  {t.reservation_scheme && <span>{t.reservation_scheme}</span>}
                </div>
                <div style={{ fontSize: '0.76rem', marginTop: 6, display: 'flex', gap: '4px 16px', flexWrap: 'wrap', color: colors.textMuted }}>
                  <span>Published {fmtLongDate(t.published_at)}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Calendar size={12} /> Closes {fmtDateTime(t.submission_deadline)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}

      <p style={{ textAlign: 'center', fontSize: '0.8rem', marginTop: 22, color: colors.textMuted }}>
        Want to bid? <Link to="/vendor-register" style={linkStyle}>Register as a vendor</Link> or <Link to="/login" style={linkStyle}>sign in</Link>.
      </p>
    </Page>
  );
}
