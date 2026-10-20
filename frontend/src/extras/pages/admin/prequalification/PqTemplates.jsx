import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, ClipboardCheck, Eye } from 'lucide-react';
import { prequalificationAPI } from '../../../../_shared/api/index';
import toast from 'react-hot-toast';

export default function PqTemplates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    prequalificationAPI.templates()
      .then(r => setTemplates(r.rows || []))
      .catch(() => toast.error('Failed to load PQ templates'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: 2 }} className="text-gray-900 dark:text-white">PQ Templates</h1>
          <p style={{ fontSize: '0.82rem' }} className="text-gray-500 dark:text-gray-400">Pre-qualification document templates</p>
        </div>
        <Link to="/admin/prequalification/templates/new"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 10, background: 'var(--color-primary-500)', color: '#fff', fontWeight: 700, fontSize: '0.82rem', textDecoration: 'none' }}>
          <Plus size={15} /> New Template
        </Link>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }} className="text-gray-400">Loading…</div>
      ) : templates.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <ClipboardCheck size={36} className="text-gray-300 dark:text-gray-600" style={{ margin: '0 auto 12px' }} />
          <p style={{ fontSize: '0.9rem', fontWeight: 600 }} className="text-gray-500 dark:text-gray-400">No PQ templates created yet</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {templates.map(t => (
            <Link key={t.id} to={`/admin/prequalification/templates/${t.id}`}
              className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', borderRadius: 12, textDecoration: 'none', transition: 'border-color 150ms' }}>
              <ClipboardCheck size={20} style={{ color: '#10b981', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 700 }} className="text-gray-900 dark:text-white">{t.name}</div>
                <div style={{ fontSize: '0.78rem', marginTop: 2 }} className="text-gray-500 dark:text-gray-400">
                  {t.category || 'General'} · Validity: {t.validity_months || '—'} months
                </div>
              </div>
              <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: 6, textTransform: 'uppercase',
                background: t.is_active ? '#dcfce7' : '#fee2e2', color: t.is_active ? '#166534' : '#991b1b' }}>
                {t.is_active ? 'Active' : 'Inactive'}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
