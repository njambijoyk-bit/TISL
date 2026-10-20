import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Gavel, Search, Calendar, ArrowRight } from 'lucide-react';
import { vendorPortalAPI } from '../../../_shared/api/index';
import toast from 'react-hot-toast';

export default function VendorTenders() {
  const [tenders, setTenders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    vendorPortalAPI.tenders({ search: search || undefined })
      .then(r => setTenders(r.rows || []))
      .catch(() => toast.error('Failed to load tenders'))
      .finally(() => setLoading(false));
  }, [search]);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 20px' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: 4 }} className="text-gray-900 dark:text-white">Available Tenders</h1>
      <p style={{ fontSize: '0.82rem', marginBottom: 20 }} className="text-gray-500 dark:text-gray-400">Browse and bid on open procurement tenders</p>

      <div style={{ position: 'relative', marginBottom: 20 }}>
        <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} className="text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tenders…"
          style={{ width: '100%', padding: '10px 12px 10px 34px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }}
          className="bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }} className="text-gray-400">Loading…</div>
      ) : tenders.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <Gavel size={36} className="text-gray-300 dark:text-gray-600" style={{ margin: '0 auto 12px' }} />
          <p style={{ fontSize: '0.9rem', fontWeight: 600 }} className="text-gray-500 dark:text-gray-400">No tenders available</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {tenders.map(t => (
            <Link key={t.id} to={`/vendor-portal/tenders/${t.id}`}
              className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
              style={{ display: 'block', padding: '18px 20px', borderRadius: 12, textDecoration: 'none', transition: 'border-color 150ms' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700 }} className="text-gray-900 dark:text-white">{t.title}</div>
                  <div style={{ fontSize: '0.78rem', marginTop: 4, display: 'flex', gap: 14, flexWrap: 'wrap' }} className="text-gray-500 dark:text-gray-400">
                    <span>{t.tender_number}</span>
                    {t.category && <span>{t.category}</span>}
                    {t.submission_deadline && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Calendar size={12} /> Closes {new Date(t.submission_deadline).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  {t.description && (
                    <p style={{ fontSize: '0.82rem', marginTop: 8, lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }} className="text-gray-600 dark:text-gray-400">{t.description}</p>
                  )}
                </div>
                <ArrowRight size={16} className="text-gray-300 dark:text-gray-600" style={{ flexShrink: 0, marginTop: 4 }} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
