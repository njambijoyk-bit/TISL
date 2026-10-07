import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Eye, Trash2, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader from '../../../core/components/admin/ui/HubHeader';
import cataloguesAPI from '../../../_shared/api/catalogues';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnPrimary, btnGhost, btnBin, card, colors } from '../../../_shared/theme/tokens';
import CatalogueTabs from '../../components/admin/catalogue/CatalogueTabs';
import { StatusBadge } from '../../components/admin/catalogue/bits';
import { audienceText } from '../../components/admin/catalogue/catalogueMeta';
import { SIZE_LABELS } from '../../lib/catalogue/labels';
import { fmtDate } from '../../lib/priceList/format';

const th = { textAlign: 'left', padding: '8px 10px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: colors.textFaint };
const td = { padding: '9px 10px', fontSize: '0.84rem', color: colors.text, borderTop: '1px solid var(--line)', verticalAlign: 'top' };
const small = { ...btnGhost, padding: '4px 10px', fontSize: '0.74rem' };
const VIEWS = [['all', 'All'], ['published', 'Published'], ['draft', 'Drafts'], ['bin', 'Recycle bin']];

/** Brochures and catalogues: one document at different sizes. One item makes a brochure; several make a catalogue. */
export default function Catalogues() {
  const navigate = useNavigate();
  const [view, setView] = useState('all');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setRes(await cataloguesAPI.list(view === 'bin' ? { trashed: 1 } : {})); } catch (e) { toast.error(errMsg(e, 'Could not load the catalogues')); }
  }, [view]);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => (res?.data ?? []).filter((b) => (view === 'published' || view === 'draft' ? b.status === view : true)), [res, view]);
  const run = async (fn, ok) => { setBusy(true); try { const r = await fn(); toast.success(r?.message ?? ok); await load(); } catch (e) { toast.error(errMsg(e, 'That did not work'), { duration: 7000 }); } finally { setBusy(false); } };

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1300, margin: '0 auto' }}>
        <CatalogueTabs />
        <HubHeader title="Catalogues" description="The same document at different sizes: one item is a brochure, several make a catalogue. Products, services, hampers and auctions can all go in. Each entry is drawn from sections and themes."
          action={<button type="button" style={{ ...btnPrimary, display: 'inline-flex', gap: 6, alignItems: 'center' }} onClick={() => navigate('/admin/catalogues/new')}><Plus size={15} /> New catalogue</button>} />

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {VIEWS.map(([k, l]) => <button key={k} type="button" onClick={() => setView(k)} style={k === 'bin' ? { ...small, borderRadius: 999, background: btnBin.background, border: btnBin.border, color: btnBin.color, fontWeight: 700, boxShadow: view === 'bin' ? '0 0 0 2px #431407' : 'none' } : { ...small, borderRadius: 999, background: view === k ? 'var(--color-primary-500)' : 'var(--surface-card)', color: view === k ? '#fff' : colors.text }}>{l}</button>)}
        </div>

        <section style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Title</th><th style={th}>Kind</th><th style={th}>Items</th><th style={th}>Size</th><th style={th}>Status</th><th style={th}>Who can see it</th><th style={th}>Made by</th><th style={th} /></tr></thead>
              <tbody>
                {!res && <tr><td style={td} colSpan={8}>Loading…</td></tr>}
                {res && rows.length === 0 && <tr><td style={td} colSpan={8}>{view === 'bin' ? 'The bin is empty.' : 'Nothing here yet.'}</td></tr>}
                {rows.map((b) => (
                  <tr key={b.id}>
                    <td style={td}><Link to={`/admin/catalogues/${b.id}`} style={{ fontWeight: 700, color: 'inherit' }}>{b.title}</Link>{b.subtitle && <div style={{ fontSize: '0.72rem', color: colors.textFaint }}>{b.subtitle}</div>}</td>
                    <td style={td}>{b.kind === 'catalogue' ? 'Catalogue' : 'Brochure'}</td>
                    <td style={td}>{b.entry_count}</td>
                    <td style={td}>{SIZE_LABELS[b.size]?.split(' (')[0]}</td>
                    <td style={td}><StatusBadge status={b.status === 'published' ? 'published' : 'draft'} trashed={view === 'bin'} />{b.published_at && <div style={{ fontSize: '0.7rem', color: colors.textFaint }}>{fmtDate(b.published_at)}</div>}</td>
                    <td style={td}>{audienceText(b)}</td>
                    <td style={td}>{b.creator}</td>
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {view !== 'bin' && <button type="button" style={small} onClick={() => navigate(`/admin/catalogues/${b.id}`)}><Eye size={12} /> Open</button>}{' '}
                      {view !== 'bin' && <button type="button" style={{ ...small, color: colors.dangerText }} disabled={busy} onClick={() => { if (window.confirm(`Move "${b.title}" to the bin?`)) run(() => cataloguesAPI.trash(b.id)); }}><Trash2 size={12} /> Delete</button>}
                      {view === 'bin' && <button type="button" style={small} disabled={busy} onClick={() => run(() => cataloguesAPI.restore(b.id))}><RotateCcw size={12} /> Restore</button>}{' '}
                      {view === 'bin' && res.can.purge && <button type="button" style={{ ...small, color: colors.dangerText }} disabled={busy} onClick={() => { if (window.confirm(`Delete "${b.title}" for good? It cannot be brought back.`)) run(() => cataloguesAPI.purge(b.id)); }}><Trash2 size={12} /> Delete for good</button>}
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
