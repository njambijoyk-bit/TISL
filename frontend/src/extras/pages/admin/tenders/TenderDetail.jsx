import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, FileText, Send, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { tendersAPI } from '../../../../_shared/api/index';
import { btnPrimary, btnGhost, card, colors } from '../../../../_shared/theme/tokens';
import { AdminPage, Loading, Empty, Tabs, Table, StatusBadge, NoticeDetails } from '../../../components/procurement/ui';
import { td, mono, kes, fmtDate } from '../../../components/procurement/format';

export default function TenderDetail() {
  const { id } = useParams();
  const [tender, setTender] = useState(null);
  const [bids, setBids] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('details');

  const load = useCallback(async () => {
    try {
      const t = await tendersAPI.show(id);
      setTender(t);
      if (t.status !== 'draft') setBids((await tendersAPI.bids(id)).rows || []);
    } catch { toast.error('Failed to load tender'); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const act = (fn, ok) => async () => {
    try { await fn(id); toast.success(ok); load(); }
    catch (e) { toast.error(e.response?.data?.message || 'Could not do that'); }
  };

  if (loading) return <AdminPage><Loading /></AdminPage>;
  if (!tender) return <AdminPage><Empty>Tender not found</Empty></AdminPage>;

  const extra = [
    ['Visibility', tender.visibility?.replace(/_/g, ' ')],
    ['Budget (internal)', tender.budget_min || tender.budget_max ? `${kes(tender.budget_min)} – ${kes(tender.budget_max)}` : null],
  ];
  const lbl = { fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: colors.primaryDeep, marginBottom: 3 };

  return (
    <AdminPage width={1000}>
      <Link to="/admin/tenders" style={{ ...btnGhost, textDecoration: 'none', marginBottom: 16, padding: '5px 12px', fontSize: '0.75rem' }}><ArrowLeft size={13} /> Tenders</Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: colors.primary, margin: 0 }}>{tender.title}</h1>
            <StatusBadge status={tender.status} />
          </div>
          <p style={{ ...mono, color: colors.textMuted, margin: '4px 0 0' }}>{tender.tender_number}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {tender.status === 'draft' && <button type="button" style={btnPrimary} onClick={act(tendersAPI.publish, 'Tender published')}><Send size={14} /> Publish</button>}
          {tender.status === 'published' && <button type="button" style={btnPrimary} onClick={act(tendersAPI.close, 'Tender closed')}>Close bidding</button>}
          {['draft', 'published'].includes(tender.status) && <button type="button" style={{ ...btnGhost, color: colors.danger }} onClick={act(tendersAPI.cancel, 'Tender cancelled')}><X size={14} /> Cancel</button>}
        </div>
      </div>

      <Tabs value={tab} onChange={setTab} tabs={[['details', 'Details'], ['bids', `Bids (${bids.length})`], ['documents', 'Documents']]} />

      {tab === 'details' && (
        <div style={{ display: 'grid', gap: 14 }}>
          <NoticeDetails tender={tender} extra={extra} />
          {(tender.description || (tender.requirements || []).length > 0 || (tender.evaluation_criteria || []).length > 0) && (
            <div style={{ ...card, padding: 22, display: 'grid', gap: 18 }}>
              {tender.description && <div><div style={lbl}>Description</div><p style={{ fontSize: '0.85rem', lineHeight: 1.6, whiteSpace: 'pre-wrap', color: colors.textBody, margin: 0 }}>{tender.description}</p></div>}
              {(tender.requirements || []).length > 0 && <div><div style={lbl}>Requirements</div><ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.85rem', color: colors.textBody }}>{tender.requirements.map((r, i) => <li key={i}>{r.label || r}</li>)}</ul></div>}
              {(tender.evaluation_criteria || []).length > 0 && <div><div style={lbl}>Evaluation criteria</div><ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.85rem', color: colors.textBody }}>{tender.evaluation_criteria.map((c, i) => <li key={i}>{c.criterion || c}</li>)}</ul></div>}
            </div>
          )}
        </div>
      )}

      {tab === 'bids' && (bids.length === 0 ? <Empty>No bids received yet</Empty> : (
        <Table head={['Bid', 'Vendor', 'Amount', 'Status', 'Submitted']}>
          {bids.map(b => (
            <tr key={b.id}>
              <td style={{ ...td, ...mono }}>{b.bid_number}</td>
              <td style={{ ...td, fontWeight: 600 }}>{b.vendor?.company_name || '—'}</td>
              <td style={td}>{kes(b.total_amount)}</td>
              <td style={td}><StatusBadge status={b.status} /></td>
              <td style={td}>{fmtDate(b.submitted_at)}</td>
            </tr>
          ))}
        </Table>
      ))}

      {tab === 'documents' && ((tender.documents || []).length === 0 ? <Empty>No documents uploaded</Empty> : (
        <div style={{ display: 'grid', gap: 8 }}>
          {tender.documents.map(d => (
            <div key={d.id} style={{ ...card, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <FileText size={18} style={{ color: colors.primary }} />
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: colors.text }}>{d.name || d.original_name}</div>
                <div style={{ fontSize: '0.72rem', color: colors.textFaint }}>{d.document_type || d.type}</div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </AdminPage>
  );
}
