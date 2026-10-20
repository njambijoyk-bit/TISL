import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Gavel, Download, MoreVertical, Share2, Eye, Copy, Mail, MessageCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { card, colors, btnGhost, radius } from '../../../_shared/theme/tokens';
import { TextInput, SelectInput } from '../../../core/components/admin/ui/Form';
import { Loading, Empty, StatusBadge, GroupBadge } from './ui';
import { th, td, linkStyle, fmtLongDate, fmtDateTime, timeToClose, METHOD_LABELS, CATEGORY_LABELS } from './format';

const ALL_TABS = [['active', 'Active'], ['closed', 'Closed'], ['agpo', 'AGPO'], ['terminated', 'Terminated'], ['all', 'All']];

/** True while the window is narrower than `px` (the table turns into cards). */
function useNarrow(px = 820) {
  const query = `(max-width: ${px}px)`;
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setNarrow(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [query]);
  return narrow;
}

function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

function ShareMenu({ url, title, onDone }) {
  const text = `${title}: ${url}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast.success('Link copied'); } catch { toast.error('Could not copy the link'); }
    onDone();
  };
  const item = { display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', background: 'none', border: 'none', fontFamily: 'inherit', fontSize: '0.8rem', color: colors.text, cursor: 'pointer', textAlign: 'left', textDecoration: 'none' };
  return (
    <>
      <button type="button" style={item} onClick={copy}><Copy size={14} /> Copy link</button>
      <a style={item} href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer" onClick={onDone}><MessageCircle size={14} /> WhatsApp</a>
      <a style={item} href={`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text)}`} onClick={onDone}><Mail size={14} /> Email</a>
      {typeof navigator !== 'undefined' && navigator.share && (
        <button type="button" style={item} onClick={() => { navigator.share({ title, url }).catch(() => {}); onDone(); }}><Share2 size={14} /> More…</button>
      )}
    </>
  );
}

function ActionsMenu({ tender, basePath }) {
  const [open, setOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setSharing(false); } };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  const close = () => { setOpen(false); setSharing(false); };
  const item = { display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', background: 'none', border: 'none', fontFamily: 'inherit', fontSize: '0.8rem', color: colors.text, cursor: 'pointer', textAlign: 'left' };

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button type="button" aria-label="Actions" aria-expanded={open} onClick={() => setOpen(o => !o)} style={{ ...btnGhost, padding: '4px 8px' }}><MoreVertical size={15} /></button>
      {open && (
        <div role="menu" style={{ ...card, position: 'absolute', right: 0, top: '100%', zIndex: 20, minWidth: 170, padding: 4, marginTop: 4 }}>
          {sharing
            ? <ShareMenu url={`${window.location.origin}${basePath}/${tender.id}`} title={tender.title} onDone={close} />
            : (
              <>
                <button type="button" style={item} onClick={() => setSharing(true)}><Share2 size={14} /> Share</button>
                <button type="button" style={item} onClick={() => { close(); navigate(`${basePath}/${tender.id}`); }}><Eye size={14} /> More details</button>
              </>
            )}
        </div>
      )}
    </div>
  );
}

function ReservedBadges({ groups }) {
  if (!groups?.length) return null;
  return <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>{groups.map(g => <GroupBadge key={g} group={g} />)}</span>;
}

const filterInput = { padding: '5px 8px', fontSize: '0.74rem', minWidth: 0, width: '100%' };

/**
 * The tenders list the public page and the vendor portal share: tabs, a search box under each column, time to close,
 * an Actions menu (Share / More details), Download Excel, and cards on a phone.
 * `fetchList(params)` → { rows, meta, counts }; `basePath` is the details page's path prefix; `exportList(params)` → blob (optional).
 */
export default function TenderBoard({ fetchList, exportList, basePath, tabs = ALL_TABS, showEntity = true, emptyText = 'No tenders match' }) {
  const narrow = useNarrow();
  const [tab, setTab] = useState('active');
  const [filters, setFilters] = useState({ q: '', description: '', entity: '', method: '', category: '', close_date: '', publish_date: '', addendum: '' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ rows: [], meta: null, counts: {}, show_entity: true });
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(Date.now());
  const debounced = useDebounced(filters);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(t); }, []);

  const params = useCallback(() => {
    const p = { tab, page };
    Object.entries(debounced).forEach(([k, v]) => { if (v) p[k] = v; });
    return p;
  }, [tab, page, debounced]);

  useEffect(() => {
    setLoading(true);
    fetchList(params())
      .then(r => { setData(r); setFailed(false); })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [fetchList, params]);

  useEffect(() => { setPage(1); }, [tab, debounced]);

  const set = (k) => (e) => setFilters(f => ({ ...f, [k]: e.target.value }));

  const download = async () => {
    try {
      const { page: _p, ...p } = params();
      const blob = await exportList(p);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'tenders.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Could not download the list'); }
  };

  const rows = data.rows || [];
  const entityCol = showEntity && data.show_entity !== false;
  const meta = data.meta;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', borderBottom: `1.5px solid ${colors.tint(0.18)}`, flex: '1 1 320px', overflowX: 'auto' }}>
          {tabs.map(([key, label]) => (
            <button key={key} type="button" onClick={() => setTab(key)}
              style={{ padding: '9px 14px', background: 'none', border: 'none', fontFamily: 'inherit', fontSize: '0.82rem', cursor: 'pointer', marginBottom: -1.5, whiteSpace: 'nowrap',
                fontWeight: tab === key ? 700 : 500, color: tab === key ? colors.primary : colors.textMuted, borderBottom: `2px solid ${tab === key ? colors.primary : 'transparent'}` }}>
              {label}{data.counts?.[key] != null ? ` (${data.counts[key]})` : ''}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <TextInput value={filters.q} onChange={set('q')} placeholder="Search all" aria-label="Search all tenders" style={{ width: 200 }} />
          {exportList && <button type="button" onClick={download} style={btnGhost}><Download size={14} /> Download Excel</button>}
        </div>
      </div>

      {narrow && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          <TextInput value={filters.description} onChange={set('description')} placeholder="Description" aria-label="Filter by description" />
          <SelectInput value={filters.category} onChange={set('category')} aria-label="Filter by category">
            <option value="">All categories</option>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </SelectInput>
        </div>
      )}

      {loading && rows.length === 0 ? <Loading /> : failed ? <Empty icon={Gavel}>Tenders could not be loaded. Please try again shortly.</Empty>
        : narrow ? (
          rows.length === 0 ? <Empty icon={Gavel}>{emptyText}</Empty> : (
            <div style={{ display: 'grid', gap: 10 }}>
              {rows.map(t => (
                <div key={t.id} style={{ ...card, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                    <Link to={`${basePath}/${t.id}`} style={{ ...linkStyle, color: colors.text, fontSize: '0.92rem', overflowWrap: 'anywhere', minWidth: 0 }}>{t.title}</Link>
                    <ActionsMenu tender={t} basePath={basePath} />
                  </div>
                  <div style={{ fontSize: '0.74rem', color: colors.textMuted, marginTop: 6, display: 'flex', gap: '3px 12px', flexWrap: 'wrap' }}>
                    <span>{t.tender_number}</span>
                    <span>{CATEGORY_LABELS[t.category] || t.category}</span>
                    <span>{METHOD_LABELS[t.procurement_method] || t.procurement_method}</span>
                  </div>
                  <div style={{ fontSize: '0.76rem', marginTop: 6, display: 'flex', gap: '4px 12px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <StatusBadge status={t.status} />
                    <ReservedBadges groups={t.reserved_groups} />
                    {t.addendum_count > 0 && <StatusBadge status="warning" label={`${t.addendum_count} addendum`} />}
                  </div>
                  <div style={{ fontSize: '0.76rem', marginTop: 6, color: colors.textMuted }}>
                    Closes {fmtDateTime(t.submission_deadline)}{t.status === 'open' ? ` · in ${timeToClose(t.submission_deadline, now)}` : ''}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          <div style={{ ...card, padding: 0, overflowX: 'auto', opacity: loading ? 0.6 : 1 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
              <thead>
                <tr>
                  <th style={{ ...th, minWidth: 320 }}>Description</th>
                  {entityCol && <th style={th}>Procuring entity</th>}
                  <th style={th}>Method</th>
                  <th style={th}>Category</th>
                  <th style={th}>Close date</th>
                  <th style={th}>Time to close</th>
                  <th style={th}>Publish date</th>
                  <th style={th}>Addendum</th>
                  <th style={th}>Actions</th>
                </tr>
                <tr>
                  <th style={{ padding: '0 10px 8px' }}><TextInput value={filters.description} onChange={set('description')} placeholder="Search" aria-label="Filter by description" style={filterInput} /></th>
                  {entityCol && <th style={{ padding: '0 10px 8px' }}><TextInput value={filters.entity} onChange={set('entity')} placeholder="Search" aria-label="Filter by procuring entity" style={filterInput} /></th>}
                  <th style={{ padding: '0 10px 8px' }}><TextInput value={filters.method} onChange={set('method')} placeholder="Search" aria-label="Filter by method" style={filterInput} /></th>
                  <th style={{ padding: '0 10px 8px' }}><TextInput value={filters.category} onChange={set('category')} placeholder="Search" aria-label="Filter by category" style={filterInput} /></th>
                  <th style={{ padding: '0 10px 8px' }}><TextInput type="date" value={filters.close_date} onChange={set('close_date')} aria-label="Filter by close date" style={filterInput} /></th>
                  <th style={{ padding: '0 10px 8px' }} />
                  <th style={{ padding: '0 10px 8px' }}><TextInput type="date" value={filters.publish_date} onChange={set('publish_date')} aria-label="Filter by publish date" style={filterInput} /></th>
                  <th style={{ padding: '0 10px 8px' }}>
                    <SelectInput value={filters.addendum} onChange={set('addendum')} aria-label="Filter by addendum" style={filterInput}>
                      <option value="">Any</option><option value="yes">Has</option><option value="no">None</option>
                    </SelectInput>
                  </th>
                  <th style={{ padding: '0 10px 8px' }} />
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={entityCol ? 9 : 8} style={{ ...td, textAlign: 'center', padding: 36, color: colors.textMuted }}>{emptyText}</td></tr>}
                {rows.map(t => (
                  <tr key={t.id}>
                    <td style={{ ...td, minWidth: 320, overflowWrap: 'anywhere', whiteSpace: 'normal' }}>
                      <Link to={`${basePath}/${t.id}`} style={{ ...linkStyle, color: colors.text }}>{t.title}</Link>
                      <div style={{ fontSize: '0.72rem', color: colors.textMuted, marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span>{t.tender_number}</span>
                        <ReservedBadges groups={t.reserved_groups} />
                        {t.status !== 'open' && <StatusBadge status={t.status} />}
                      </div>
                    </td>
                    {entityCol && <td style={td}>{t.procuring_entity}</td>}
                    <td style={td}>{METHOD_LABELS[t.procurement_method] || t.procurement_method}</td>
                    <td style={td}>{CATEGORY_LABELS[t.category] || t.category}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtDateTime(t.submission_deadline)}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{t.status === 'open' ? timeToClose(t.submission_deadline, now) : '—'}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtLongDate(t.published_at)}</td>
                    <td style={td}>{t.addendum_count > 0 ? `${t.addendum_count}` : 'None'}</td>
                    <td style={td}><ActionsMenu tender={t} basePath={basePath} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      {meta && meta.last_page > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 14, fontSize: '0.8rem', color: colors.textMuted }}>
          <button type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={{ ...btnGhost, opacity: page <= 1 ? 0.5 : 1, borderRadius: radius.sm }}>Previous</button>
          <span>Page {meta.page} of {meta.last_page} · {meta.total} tenders</span>
          <button type="button" disabled={page >= meta.last_page} onClick={() => setPage(p => p + 1)} style={{ ...btnGhost, opacity: page >= meta.last_page ? 0.5 : 1, borderRadius: radius.sm }}>Next</button>
        </div>
      )}
    </div>
  );
}
