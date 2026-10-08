import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { idFromParam } from '../../../_shared/lib/itemPath';
import { FileDown, Archive as ArchiveIcon, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader from '../../../core/components/admin/ui/HubHeader';
import Modal from '../../../core/components/admin/ui/Modal';
import { Field } from '../../../core/components/admin/ui/Form';
import priceListsAPI from '../../../_shared/api/priceLists';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { loadCompany } from '../../../_shared/lib/useCompany';
import { btnPrimary, btnGhost, card, colors } from '../../../_shared/theme/tokens';
import CatalogueTabs from '../../components/admin/catalogue/CatalogueTabs';
import { AudiencePicker, StatusBadge } from '../../components/admin/catalogue/bits';
import { audienceText, fieldStyle, fromLocalInput, toLocalInput } from '../../components/admin/catalogue/catalogueMeta';
import { EARLIER_LABEL, earlierOf, fmtAmount, fmtDate, fmtDateTime, slugify } from '../../lib/priceList/format';
import { listPdfBlob, listZip, saveBlob } from '../../lib/priceList/bundle';

const th = { textAlign: 'left', padding: '8px 10px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: colors.textFaint };
const td = { padding: '8px 10px', fontSize: '0.82rem', color: colors.text, borderTop: '1px solid var(--line)', verticalAlign: 'top' };
const small = { ...btnGhost, padding: '5px 12px', fontSize: '0.78rem', display: 'inline-flex', gap: 6, alignItems: 'center' };

/** One price list: its lines, what you can do with it (publish, activate, take off, delete, restore) and the downloads (PDF, CSV, JSON, zip, Archive). */
export default function PriceListView() {
  const { id: param } = useParams();
  const id = idFromParam(param);
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [can, setCan] = useState({});
  const [q, setQ] = useState('');
  const [shown, setShown] = useState(200);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(null);
  const [arch, setArch] = useState(null);

  const load = useCallback(async () => {
    try { const r = await priceListsAPI.show(id); setD(r.data); setCan(r.can); } catch (e) { toast.error(errMsg(e, 'Could not load the price list')); navigate('/admin/price-lists'); }
  }, [id, navigate]);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => (d?.items ?? []).filter((x) => !q || `${x.code ?? ''} ${x.name} ${x.variant ?? ''} ${x.category ?? ''}`.toLowerCase().includes(q.toLowerCase())), [d, q]);
  if (!d) return <AdminLayout><div style={{ padding: 32, color: colors.textFaint }}>Loading…</div></AdminLayout>;

  const trashed = Boolean(d.deleted_at);
  const run = async (fn, ok) => { setBusy(true); try { const r = await fn(); toast.success(r?.message ?? ok, { duration: 6000 }); await load(); return true; } catch (e) { toast.error(errMsg(e, 'That did not work'), { duration: 8000 }); return false; } finally { setBusy(false); } };
  const listInfo = { name: d.name, description: d.description, as_at: d.as_at };

  const pdf = async () => run(async () => { saveBlob(listPdfBlob({ list: listInfo, items: d.items, rule: d.earlier_price, company: await loadCompany() }), `${slugify(d.name)}.pdf`); }, 'PDF made');
  const csv = async () => run(async () => { saveBlob(await priceListsAPI.csv(d.id), `${slugify(d.name)}.csv`); }, 'CSV downloaded');
  const json = async () => run(async () => { saveBlob(await priceListsAPI.json(d.id), `${slugify(d.name)}.json`); }, 'JSON downloaded');
  const makeZip = async () => listZip({ list: listInfo, items: d.items, rule: d.earlier_price, company: await loadCompany(), csv: await priceListsAPI.csv(d.id), json: await priceListsAPI.json(d.id) });
  const zip = async () => run(async () => { saveBlob(await makeZip(), `${slugify(d.name)}.zip`); }, 'Zip downloaded');

  const saveEdit = async () => {
    const body = { name: edit.name, description: edit.description, access: edit.access, customer_types: edit.customer_types, earlier_price: edit.earlier_price, active_from: fromLocalInput(edit.active_from) };
    if (await run(() => priceListsAPI.update(d.id, body), 'Saved')) setEdit(null);
  };
  const archive = async () => {
    setBusy(true);
    try {
      const blob = await makeZip();
      const form = new FormData();
      form.append('file', new File([blob], `${slugify(d.name)}.zip`, { type: 'application/zip' }));
      form.append('title', arch.title); form.append('access', arch.access); form.append('customer_types', JSON.stringify(arch.customer_types));
      form.append('list_name', d.name); form.append('list_as_at', d.as_at.slice(0, 19).replace('T', ' '));
      const r = await priceListsAPI.archiveAdd(form);
      toast.success(`${r.message} You can now delete the list for good.`, { duration: 7000 });
      setArch(null);
    } catch (e) { toast.error(errMsg(e, 'Could not add it to the Archive'), { duration: 8000 }); } finally { setBusy(false); }
  };

  const act = [];
  if (!trashed) {
    if (d.status === 'draft' && d.can_edit) act.push(<button key="pub" type="button" style={btnPrimary} disabled={busy} onClick={() => run(() => priceListsAPI.publish(d.id))}>{can.publish ? 'Publish' : 'Send for activation'}</button>);
    if (d.status === 'draft' && d.can_edit) act.push(<button key="ref" type="button" style={small} disabled={busy} onClick={() => { if (window.confirm('Take the prices again from today? The lines will be replaced.')) run(() => priceListsAPI.refresh(d.id)); }}>Take prices again</button>);
    if (d.status === 'pending' && can.publish && !d.mine) act.push(<button key="act" type="button" style={btnPrimary} disabled={busy} onClick={() => run(() => priceListsAPI.activate(d.id))}>Activate</button>);
    if ((d.status === 'pending' && (d.mine || can.publish)) || (d.status === 'published' && can.publish)) act.push(<button key="wd" type="button" style={small} disabled={busy} onClick={() => run(() => priceListsAPI.withdraw(d.id))}>{d.status === 'published' ? 'Take off (back to draft)' : 'Take back to draft'}</button>);
    if (d.can_edit) act.push(<button key="ed" type="button" style={small} onClick={() => setEdit({ name: d.name, description: d.description ?? '', access: d.access, customer_types: d.customer_types ?? [], earlier_price: d.earlier_price, active_from: toLocalInput(d.active_from) })}><Pencil size={13} /> Edit details</button>);
    if (can.publish || (d.mine && d.status !== 'published')) act.push(<button key="del" type="button" style={{ ...small, color: colors.dangerText }} disabled={busy} onClick={() => { if (window.confirm(`Move "${d.name}" to the bin?`)) run(() => priceListsAPI.trash(d.id)).then((ok) => ok && navigate('/admin/price-lists')); }}>Delete</button>);
  } else {
    act.push(<button key="res" type="button" style={btnPrimary} disabled={busy} onClick={() => run(() => priceListsAPI.restore(d.id))}>Restore</button>);
    if (can.purge) act.push(<button key="pg" type="button" style={{ ...small, color: colors.dangerText }} disabled={busy} onClick={() => { if (window.confirm(`Delete "${d.name}" for good? It cannot be brought back. Download its zip or add it to the Archive first if you want to keep a copy.`)) run(() => priceListsAPI.purge(d.id)).then((ok) => ok && navigate('/admin/price-lists')); }}>Delete for good</button>);
  }

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1300, margin: '0 auto', display: 'grid', gap: 16 }}>
        <div><CatalogueTabs back="/admin/price-lists" backLabel="Price lists" /><HubHeader title={d.name} description={d.description || 'A price list.'} /></div>

        <section style={{ ...card, padding: 16, display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: '0.82rem', color: colors.text }}>
            <span><StatusBadge status={d.status} live={d.live} trashed={trashed} /></span>
            <span><span style={{ color: colors.textFaint }}>Prices as at</span> {fmtDate(d.as_at)}</span>
            <span><span style={{ color: colors.textFaint }}>Active from</span> {d.active_from ? fmtDateTime(d.active_from) : 'at once'}</span>
            <span><span style={{ color: colors.textFaint }}>Who can see it</span> {audienceText(d)}</span>
            <span><span style={{ color: colors.textFaint }}>Earlier price</span> {EARLIER_LABEL[d.earlier_price]}</span>
            <span><span style={{ color: colors.textFaint }}>Made by</span> {d.creator}</span>
          </div>
          {d.status === 'pending' && <p style={{ margin: 0, fontSize: '0.82rem', color: colors.warningText }}>{d.mine ? 'Waiting for someone else to activate it.' : 'This list was made by someone who may not publish, and is waiting for you or another publisher to activate it.'}</p>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{act}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 10, borderTop: '1px solid var(--line)' }}>
            <button type="button" style={small} disabled={busy} onClick={pdf}><FileDown size={13} /> PDF</button>
            <button type="button" style={small} disabled={busy} onClick={csv}><FileDown size={13} /> CSV</button>
            <button type="button" style={small} disabled={busy} onClick={json}><FileDown size={13} /> JSON</button>
            <button type="button" style={small} disabled={busy} onClick={zip}><FileDown size={13} /> Zip of all three</button>
            {can.publish && <button type="button" style={small} disabled={busy} onClick={() => setArch({ title: `${d.name} (as at ${fmtDate(d.as_at)})`, access: d.access === 'staff' ? 'staff' : d.access, customer_types: d.customer_types ?? [] })}><ArchiveIcon size={13} /> Add to Archive</button>}
          </div>
        </section>

        <section style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <strong style={{ color: colors.text }}>{d.item_count} lines</strong>
            <input value={q} onChange={(e) => { setQ(e.target.value); setShown(200); }} placeholder="Search the lines…" style={{ ...fieldStyle, width: 240 }} />
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Code</th><th style={th}>Item</th><th style={th}>Price excl. tax</th><th style={th}>Tax</th><th style={th}>Total</th></tr></thead>
              <tbody>
                {rows.slice(0, shown).map((x) => {
                  const e = earlierOf(x, d.earlier_price);

                  return (
                    <tr key={x.id}>
                      <td style={{ ...td, color: colors.textFaint }}>{x.code}</td>
                      <td style={td}><strong>{x.name}</strong><div style={{ fontSize: '0.72rem', color: colors.textFaint }}>{[x.variant, x.unit, x.category].filter(Boolean).join(' · ')}</div></td>
                      <td style={td}><strong>{fmtAmount(x.price, x.currency_code, x.currency_symbol)}</strong>
                        {e?.strike && <div style={{ fontSize: '0.72rem', color: colors.textFaint, textDecoration: 'line-through' }}>{fmtAmount(e.strike, x.currency_code, x.currency_symbol)}</div>}
                        {e?.was && <div style={{ fontSize: '0.72rem', color: colors.textFaint }}>Was {fmtAmount(e.was, x.currency_code, x.currency_symbol)}, up {e.up}%</div>}
                      </td>
                      <td style={td}>{fmtAmount(x.tax_amount, x.currency_code, x.currency_symbol)}<div style={{ fontSize: '0.72rem', color: colors.textFaint }}>{[x.tax_name, x.tax_account].filter(Boolean).join(' · ') || 'No tax account'}</div></td>
                      <td style={td}><strong>{fmtAmount(x.total, x.currency_code, x.currency_symbol)}</strong></td>
                    </tr>
                  );
                })}
                {rows.length === 0 && <tr><td style={td} colSpan={5}>No lines match.</td></tr>}
              </tbody>
            </table>
          </div>
          {rows.length > shown && <div style={{ padding: 12, textAlign: 'center' }}><button type="button" style={small} onClick={() => setShown((n) => n + 300)}>Show more ({rows.length - shown} left)</button></div>}
        </section>
      </div>

      {edit && (
        <Modal title="Edit details" subtitle="The prices themselves stay as they were taken." onClose={() => setEdit(null)} width={620}
          footer={<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button type="button" style={btnGhost} onClick={() => setEdit(null)}>Cancel</button><button type="button" style={btnPrimary} disabled={busy} onClick={saveEdit}>Save</button></div>}>
          <div style={{ display: 'grid', gap: 12 }}>
            <Field label="Name"><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} style={fieldStyle} /></Field>
            <Field label="Note"><input value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} style={fieldStyle} /></Field>
            <Field label="Who can see it"><AudiencePicker access={edit.access} types={edit.customer_types} onChange={(a) => setEdit({ ...edit, ...a })} /></Field>
            <Field label="Active from"><input type="datetime-local" value={edit.active_from} onChange={(e) => setEdit({ ...edit, active_from: e.target.value })} style={{ ...fieldStyle, maxWidth: 260 }} /></Field>
            <Field label="Earlier price"><select value={edit.earlier_price} onChange={(e) => setEdit({ ...edit, earlier_price: e.target.value })} style={fieldStyle}>{Object.entries(EARLIER_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          </div>
        </Modal>
      )}
      {arch && (
        <Modal title="Add to the Archive" subtitle="A zip with the PDF, CSV and JSON is kept in the Archive, where the customers you choose can open it." onClose={() => setArch(null)} width={620}
          footer={<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button type="button" style={btnGhost} onClick={() => setArch(null)}>Cancel</button><button type="button" style={btnPrimary} disabled={busy} onClick={archive}>{busy ? 'Working…' : 'Add to Archive'}</button></div>}>
          <div style={{ display: 'grid', gap: 12 }}>
            <Field label="Title"><input value={arch.title} onChange={(e) => setArch({ ...arch, title: e.target.value })} style={fieldStyle} /></Field>
            <Field label="Who can see it in the Archive"><AudiencePicker access={arch.access} types={arch.customer_types} onChange={(a) => setArch({ ...arch, ...a })} /></Field>
          </div>
        </Modal>
      )}
    </AdminLayout>
  );
}
