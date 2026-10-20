import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardCheck, Plus, ArrowRight } from 'lucide-react';
import { vendorPortalAPI } from '../../../_shared/api/index';
import toast from 'react-hot-toast';

const STATUS_COLORS = {
  draft:        { bg: '#f3f4f6', text: '#374151' },
  submitted:    { bg: '#dbeafe', text: '#1e40af' },
  under_review: { bg: '#fef3c7', text: '#92400e' },
  qualified:    { bg: '#dcfce7', text: '#166534' },
  rejected:     { bg: '#fee2e2', text: '#991b1b' },
};

export default function VendorPq() {
  const [pqs, setPqs] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('my');

  useEffect(() => {
    Promise.all([
      vendorPortalAPI.myPqs().then(r => setPqs(r.rows || [])),
      vendorPortalAPI.pqTemplates().then(r => setTemplates(r.rows || [])),
    ])
      .catch(() => toast.error('Failed to load PQ data'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 20px' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: 4 }} className="text-gray-900 dark:text-white">Pre-Qualification</h1>
      <p style={{ fontSize: '0.82rem', marginBottom: 20 }} className="text-gray-500 dark:text-gray-400">Apply for pre-qualification to access restricted tenders</p>

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid #e5e7eb' }}>
        {[['my', 'My Applications'], ['templates', 'Available Templates']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            style={{ padding: '10px 18px', background: 'none', border: 'none', fontWeight: tab === key ? 700 : 500, fontSize: '0.82rem', cursor: 'pointer', borderBottom: tab === key ? '2px solid var(--color-primary-500)' : '2px solid transparent', marginBottom: -2 }}
            className={tab === key ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }} className="text-gray-400">Loading…</div>
      ) : tab === 'my' ? (
        pqs.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <ClipboardCheck size={36} className="text-gray-300 dark:text-gray-600" style={{ margin: '0 auto 12px' }} />
            <p style={{ fontSize: '0.9rem', fontWeight: 600 }} className="text-gray-500 dark:text-gray-400">No pre-qualification applications yet</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pqs.map(p => {
              const sc = STATUS_COLORS[p.status] || STATUS_COLORS.draft;
              return (
                <div key={p.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
                  style={{ padding: '14px 18px', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <ClipboardCheck size={18} style={{ color: '#10b981', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.88rem', fontWeight: 600 }} className="text-gray-900 dark:text-white">{p.template?.name || 'PQ Application'}</div>
                    <div style={{ fontSize: '0.75rem', marginTop: 2 }} className="text-gray-500 dark:text-gray-400">{p.pq_number} · {p.submitted_at ? new Date(p.submitted_at).toLocaleDateString() : 'Draft'}</div>
                  </div>
                  <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: 6, textTransform: 'uppercase', background: sc.bg, color: sc.text }}>
                    {p.status?.replace(/_/g, ' ')}
                  </span>
                </div>
              );
            })}
          </div>
        )
      ) : (
        templates.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center' }} className="text-gray-400">No PQ templates available</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {templates.map(t => (
              <div key={t.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
                style={{ padding: '18px 20px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.92rem', fontWeight: 700 }} className="text-gray-900 dark:text-white">{t.name}</div>
                  <div style={{ fontSize: '0.78rem', marginTop: 3 }} className="text-gray-500 dark:text-gray-400">
                    {t.category || 'General'} · Validity: {t.validity_months || '—'} months
                  </div>
                  {t.description && <p style={{ fontSize: '0.82rem', marginTop: 6, lineHeight: 1.5 }} className="text-gray-600 dark:text-gray-400">{t.description}</p>}
                </div>
                <ArrowRight size={16} className="text-gray-300 dark:text-gray-600" style={{ flexShrink: 0 }} />
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
