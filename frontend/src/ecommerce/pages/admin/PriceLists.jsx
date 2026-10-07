import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Eye, Trash2, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader from '../../../core/components/admin/ui/HubHeader';
import priceListsAPI from '../../../_shared/api/priceLists';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnPrimary, btnGhost, card, colors } from '../../../_shared/theme/tokens';
import CatalogueTabs from '../../components/admin/catalogue/CatalogueTabs';
import { StatusBadge } from '../../components/admin/catalogue/bits';
import { audienceText } from '../../components/admin/catalogue/catalogueMeta';
import { fmtDate, fmtDateTime } from '../../lib/priceList/format';

const th = { textAlign: 'left', padding: '8px 10px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: colors.textFaint };
const td = { padding: '9px 10px', fontSize: '0.84rem', color: colors.text, borderTop: '1px solid var(--line)', verticalAlign: 'top' };
const small = { ...btnGhost, padding: '4px 10px', fontSize: '0.74rem' };

const VIEWS = [['all', 'All'], ['live', 'Live now'], ['draft', 'Drafts'], ['pending', 'Waiting for activation'], ['bin', 'Bin']];

/** Price lists: dated, frozen tables of selling prices. Draft, then published (live from its Active-from date). */
export default function PriceLists() {
  const navigate = useNavigate();
  const [view, setView] = useState('all');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setRes(await priceListsAPI.list(view === 'bin' ? { trashed: 1 } : {})); } catch (e) { toast.error(errMsg(e, 'Could not load the price lists')); }
  }, [view]);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => (res?.data ?? []).filter((l) => (view === 'live' ? l.live : view === 'draft' || view === 'pending' ? l.status === view : true)), [res, view]);
  const run = async (fn, ok) => { setBusy(true); try { const r = await fn(); toast.success(r?.message ?? ok); await load(); } catch (e) { toast.error(errMsg(e, 'That did not work'), { duration: 7000 }); } finally { setBusy(false); } };
  const limit = res?.limit;
  const full = limit && limit.used >= limit.max;

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1300, margin: '0 auto' }}>
        <CatalogueTabs />
        <HubHeader title="Price lists" description="A dated list of selling prices for products and services, with tax worked out the way an invoice does it. Each price stays in its own item's currency. A list is kept exactly as it was made."
          action={res?.can?.create && <button type="button" style={{ ...btnPrimary, display: 'inline-flex', gap: 6, alignItems: 'center', opacity: full ? 0.5 : 1 }} disabled={full} onClick={() => navigate('/admin/price-lists/new')}><Plus size={15} /> New price list</button>} />

        {limit && (
          <div style={{ ...card, padding: '10px 14px', marginBottom: 14, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', fontSize: '0.82rem', color: colors.text }}>
            <strong>{limit.used} of {limit.max}</strong> price lists kept{view !== 'bin' && ' (the bin counts)'}.
            <div style={{ flex: '1 1 120px', maxWidth: 260, height: 6, borderRadius: 4, background: 'rgba(148,163,184,0.25)' }}><div style={{ width: `${Math.min(100, (limit.used / limit.max) * 100)}%`, height: '100%', borderRadius: 4, background: full ? colors.danger : 'var(--color-primary-500)' }} /></div>
            {full && <span style={{ color: colors.dangerText }}>Full. Download an old list as a zip, add it to the <Link to="/admin/price-list-archive">Archive</Link>, then delete it for good.</span>}
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {VIEWS.map(([k, l]) => (
            <button key={k} type="button" onClick={() => setView(k)} style={{ ...small, borderRadius: 999, background: view === k ? 'var(--color-primary-500)' : 'var(--surface-card)', color: view === k ? '#fff' : colors.text }}>{l}</button>
          ))}
        </div>

        <section style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>List</th><th style={th}>Status</th><th style={th}>Active from</th><th style={th}>Who can see it</th><th style={th}>Lines</th><th style={th}>Prices as at</th><th style={th}>Made by</th><th style={th} /></tr></thead>
              <tbody>
                {!res && <tr><td style={td} colSpan={8}>Loading…</td></tr>}
                {res && rows.length === 0 && <tr><td style={td} colSpan={8}>{view === 'bin' ? 'The bin is empty.' : 'No price lists here yet.'}</td></tr>}
                {rows.map((l) => (
                  <tr key={l.id}>
                    <td style={td}><Link to={`/admin/price-lists/${l.id}`} style={{ fontWeight: 700, color: 'inherit' }}>{l.name}</Link>{l.description && <div style={{ fontSize: '0.72rem', color: colors.textFaint }}>{l.description}</div>}</td>
                    <td style={td}><StatusBadge status={l.status} live={l.live} trashed={view === 'bin'} /></td>
                    <td style={td}>{l.active_from ? fmtDateTime(l.active_from) : l.status === 'published' ? 'At once' : '—'}</td>
                    <td style={td}>{audienceText(l)}</td>
                    <td style={td}>{l.item_count}</td>
                    <td style={td}>{fmtDate(l.as_at)}</td>
                    <td style={td}>{l.creator}{l.mine && ' (you)'}</td>
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {view !== 'bin' && <button type="button" style={small} onClick={() => navigate(`/admin/price-lists/${l.id}`)}><Eye size={12} /> Open</button>}{' '}
                      {view !== 'bin' && l.status === 'pending' && res.can.publish && !l.mine && <button type="button" style={{ ...small, color: colors.successText }} disabled={busy} onClick={() => run(() => priceListsAPI.activate(l.id))}>Activate</button>}{' '}
                      {view !== 'bin' && (res.can.publish || (l.mine && l.status !== 'published')) && <button type="button" style={{ ...small, color: colors.dangerText }} disabled={busy} onClick={() => { if (window.confirm(`Move "${l.name}" to the bin?`)) run(() => priceListsAPI.trash(l.id)); }}><Trash2 size={12} /> Delete</button>}
                      {view === 'bin' && <button type="button" style={small} disabled={busy} onClick={() => run(() => priceListsAPI.restore(l.id))}><RotateCcw size={12} /> Restore</button>}{' '}
                      {view === 'bin' && res.can.purge && <button type="button" style={{ ...small, color: colors.dangerText }} disabled={busy} onClick={() => { if (window.confirm(`Delete "${l.name}" for good? It cannot be brought back. Have you downloaded its zip and added it to the Archive?`)) run(() => priceListsAPI.purge(l.id)); }}><Trash2 size={12} /> Delete for good</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}
