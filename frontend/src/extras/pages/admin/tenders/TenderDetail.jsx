import { useState, useEffect, Fragment } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, FileText, Upload, Trash2, Send, X, Award, Users } from 'lucide-react';
import { tendersAPI } from '../../../../_shared/api/index';
import toast from 'react-hot-toast';

const STATUS_COLORS = {
  draft:     { bg: '#f3f4f6', text: '#374151' },
  published: { bg: '#dbeafe', text: '#1e40af' },
  closed:    { bg: '#fef3c7', text: '#92400e' },
  awarded:   { bg: '#dcfce7', text: '#166534' },
  cancelled: { bg: '#fee2e2', text: '#991b1b' },
};

export default function TenderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tender, setTender] = useState(null);
  const [bids, setBids] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('details');

  const load = async () => {
    try {
      const t = await tendersAPI.show(id);
      setTender(t.data || t);
      if (t.data?.status !== 'draft') {
        const b = await tendersAPI.bids(id);
        setBids(b.data || []);
      }
    } catch { toast.error('Failed to load tender'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [id]);

  const handlePublish = async () => {
    try { await tendersAPI.publish(id); toast.success('Tender published'); load(); }
    catch (e) { toast.error(e.response?.data?.message || 'Failed to publish'); }
  };
  const handleClose = async () => {
    try { await tendersAPI.close(id); toast.success('Tender closed'); load(); }
    catch (e) { toast.error(e.response?.data?.message || 'Failed to close'); }
  };
  const handleCancel = async () => {
    try { await tendersAPI.cancel(id); toast.success('Tender cancelled'); load(); }
    catch (e) { toast.error(e.response?.data?.message || 'Failed to cancel'); }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }} className="text-gray-400">Loading…</div>;
  if (!tender) return <div style={{ padding: 40, textAlign: 'center' }} className="text-gray-500">Tender not found</div>;

  const sc = STATUS_COLORS[tender.status] || STATUS_COLORS.draft;

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 20px' }}>
      <button onClick={() => navigate('/admin/tenders')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, marginBottom: 20 }} className="text-gray-500 dark:text-gray-400">
        <ArrowLeft size={15} /> Back to tenders
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 800 }} className="text-gray-900 dark:text-white">{tender.title}</h1>
            <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: 6, textTransform: 'uppercase', letterSpacing: '0.04em', background: sc.bg, color: sc.text }}>
              {tender.status?.replace(/_/g, ' ')}
            </span>
          </div>
          <p style={{ fontSize: '0.82rem', fontFamily: 'monospace' }} className="text-gray-500 dark:text-gray-400">{tender.tender_number}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {tender.status === 'draft' && (
            <button onClick={handlePublish} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, background: '#2563eb', color: '#fff', border: 'none', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
              <Send size={14} /> Publish
            </button>
          )}
          {tender.status === 'published' && (
            <button onClick={handleClose} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, background: '#f59e0b', color: '#fff', border: 'none', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
              Close Bidding
            </button>
          )}
          {['draft', 'published'].includes(tender.status) && (
            <button onClick={handleCancel} style={{ padding: '8px 16px', borderRadius: 8, border: '1.5px solid #ef4444', color: '#ef4444', background: 'none', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
              <X size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />Cancel
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '2px solid #e5e7eb' }}>
        {['details', 'bids', 'documents'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: '10px 18px', background: 'none', border: 'none', fontWeight: tab === t ? 700 : 500, fontSize: '0.82rem', cursor: 'pointer', borderBottom: tab === t ? '2px solid var(--color-primary-500)' : '2px solid transparent', marginBottom: -2, textTransform: 'capitalize' }}
            className={tab === t ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'details' && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700" style={{ borderRadius: 12, padding: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 20, marginBottom: 20 }}>
            {[
              ['Category', tender.category],
              ['Visibility', tender.visibility?.replace(/_/g, ' ')],
              ['Budget', tender.estimated_budget ? `KES ${Number(tender.estimated_budget).toLocaleString()}` : '—'],
              ['Published', tender.published_at ? new Date(tender.published_at).toLocaleDateString() : '—'],
              ['Closing', tender.closing_date ? new Date(tender.closing_date).toLocaleDateString() : '—'],
            ].map(([l, v]) => (
              <div key={l}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }} className="text-gray-400">{l}</div>
                <div style={{ fontSize: '0.88rem', fontWeight: 600 }} className="text-gray-800 dark:text-gray-200">{v || '—'}</div>
              </div>
            ))}
          </div>
          {tender.description && (
            <div>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }} className="text-gray-400">Description</div>
              <p style={{ fontSize: '0.85rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }} className="text-gray-700 dark:text-gray-300">{tender.description}</p>
            </div>
          )}
        </div>
      )}

      {tab === 'bids' && (
        <div>
          {bids.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center' }} className="text-gray-400">No bids received yet</div>
          ) : (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700" style={{ borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-700/50">
                    {['Bid #', 'Vendor', 'Amount', 'Status', 'Submitted'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }} className="text-gray-500 dark:text-gray-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bids.map(b => (
                    <tr key={b.id} className="border-t border-gray-100 dark:border-gray-700">
                      <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontSize: '0.78rem' }} className="text-gray-700 dark:text-gray-300">{b.bid_number}</td>
                      <td style={{ padding: '12px 14px', fontWeight: 600 }} className="text-gray-800 dark:text-gray-200">{b.vendor?.company_name || '—'}</td>
                      <td style={{ padding: '12px 14px' }} className="text-gray-700 dark:text-gray-300">KES {Number(b.total_amount || 0).toLocaleString()}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: 6, textTransform: 'uppercase', background: b.status === 'awarded' ? '#dcfce7' : b.status === 'rejected' ? '#fee2e2' : '#f3f4f6', color: b.status === 'awarded' ? '#166534' : b.status === 'rejected' ? '#991b1b' : '#374151' }}>
                          {b.status?.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: '0.78rem' }} className="text-gray-500 dark:text-gray-400">{b.submitted_at ? new Date(b.submitted_at).toLocaleDateString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'documents' && (
        <div>
          {(tender.documents || []).length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center' }} className="text-gray-400">No documents uploaded</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {tender.documents.map(d => (
                <div key={d.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700" style={{ padding: '12px 16px', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <FileText size={18} className="text-gray-400" />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600 }} className="text-gray-800 dark:text-gray-200">{d.name || d.original_name}</div>
                    <div style={{ fontSize: '0.72rem' }} className="text-gray-400">{d.type}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
