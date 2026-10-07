import { useCallback, useEffect, useState } from 'react';
import { Download, Pencil, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader from '../../../core/components/admin/ui/HubHeader';
import Modal from '../../../core/components/admin/ui/Modal';
import { Field } from '../../../core/components/admin/ui/Form';
import priceListsAPI from '../../../_shared/api/priceLists';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnPrimary, btnGhost, card, colors } from '../../../_shared/theme/tokens';
import CatalogueTabs from '../../components/admin/catalogue/CatalogueTabs';
import { AudiencePicker } from '../../components/admin/catalogue/bits';
import { audienceText, fieldStyle } from '../../components/admin/catalogue/catalogueMeta';
import { fmtDate } from '../../lib/priceList/format';
import { saveBlob } from '../../lib/priceList/bundle';

const th = { textAlign: 'left', padding: '8px 10px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: colors.textFaint };
const td = { padding: '9px 10px', fontSize: '0.84rem', color: colors.text, borderTop: '1px solid var(--line)' };
const small = { ...btnGhost, padding: '4px 10px', fontSize: '0.74rem', display: 'inline-flex', gap: 4, alignItems: 'center' };
const size = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** The Archive: zips of old price lists (PDF, CSV and JSON) that were taken off the server. Customers can open the ones set for them. */
export default function PriceListArchive() {
  const [res, setRes] = useState(null);
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => { try { setRes(await priceListsAPI.archiveList()); } catch (e) { toast.error(errMsg(e, 'Could not load the Archive')); } }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (fn, ok) => { setBusy(true); try { const r = await fn(); toast.success(r?.message ?? ok); await load(); return true; } catch (e) { toast.error(errMsg(e, 'That did not work')); return false; } finally { setBusy(false); } };
  const get = (a) => run(async () => { saveBlob(await priceListsAPI.publicArchiveFile(a.id), `${a.title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'price-list'}.zip`); }, 'Downloaded');

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1200, margin: '0 auto' }}>
        <CatalogueTabs />
        <HubHeader title="Archive" description="Old price lists kept as a zip (PDF, CSV and JSON). To free a place when the shop is at its limit: open the list, add it to the Archive here, then delete the list for good." />
        <section style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Title</th><th style={th}>From list</th><th style={th}>Prices as at</th><th style={th}>Who can see it</th><th style={th}>Size</th><th style={th}>Added</th><th style={th} /></tr></thead>
              <tbody>
                {!res && <tr><td style={td} colSpan={7}>Loading…</td></tr>}
                {res && res.data.length === 0 && <tr><td style={td} colSpan={7}>Nothing archived yet.</td></tr>}
                {res?.data.map((a) => (
                  <tr key={a.id}>
                    <td style={td}><strong>{a.title}</strong></td>
                    <td style={td}>{a.list_name}</td>
                    <td style={td}>{fmtDate(a.list_as_at)}</td>
                    <td style={td}>{audienceText(a)}</td>
                    <td style={td}>{size(a.size_bytes)}</td>
                    <td style={td}>{fmtDate(a.created_at)}</td>
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button type="button" style={small} disabled={busy} onClick={() => get(a)}><Download size={12} /> Download</button>{' '}
                      {res.can.publish && <button type="button" style={small} onClick={() => setEdit({ id: a.id, title: a.title, access: a.access, customer_types: a.customer_types ?? [] })}><Pencil size={12} /> Edit</button>}{' '}
                      {res.can.purge && <button type="button" style={{ ...small, color: colors.dangerText }} disabled={busy} onClick={() => { if (window.confirm(`Delete "${a.title}" from the Archive? It cannot be brought back.`)) run(() => priceListsAPI.archiveDelete(a.id)); }}><Trash2 size={12} /> Delete</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      {edit && (
        <Modal title="Edit archive entry" onClose={() => setEdit(null)} width={600}
          footer={<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button type="button" style={btnGhost} onClick={() => setEdit(null)}>Cancel</button><button type="button" style={btnPrimary} disabled={busy} onClick={async () => { if (await run(() => priceListsAPI.archiveUpdate(edit.id, { title: edit.title, access: edit.access, customer_types: edit.customer_types }), 'Saved')) setEdit(null); }}>Save</button></div>}>
          <div style={{ display: 'grid', gap: 12 }}>
            <Field label="Title"><input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} style={fieldStyle} /></Field>
            <Field label="Who can see it"><AudiencePicker access={edit.access} types={edit.customer_types} onChange={(a) => setEdit({ ...edit, ...a })} /></Field>
          </div>
        </Modal>
      )}
    </AdminLayout>
  );
}
