import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../core/components/admin/ui/HubHeader';
import Modal from '../../../core/components/admin/ui/Modal';
import { Field, NumberInput, SelectInput, TextInput, FormStack, ModalActions, FormError } from '../../../core/components/admin/ui/Form';
import { money } from '../../../core/components/admin/books/booksFmt';
import vendorsAPI from '../../../_shared/api/vendors';
import useAuthStore from '../../../_shared/store/authStore';
import { canReadFinance, canWriteFinance } from '../../../_shared/lib/roles';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../../_shared/theme/tokens';

/**
 * Vendors: everyone we buy from. Each is a Sundry Creditors ledger, so purchases, payments and what we owe them
 * all follow. Vendors have no login or portal: we enter what they invoice us as a Purchase.
 */

const th = { textAlign: 'left', padding: '8px 10px', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.textFaint };
const td = { padding: '9px 10px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.06)}`, verticalAlign: 'top' };
const small = { ...btnGhost, padding: '4px 10px', fontSize: '0.72rem', marginRight: 6 };

function VendorModal({ vendor, onClose, onDone }) {
  const [f, setF] = useState({ company_name: vendor?.company_name ?? '', contact_name: vendor?.contact_name ?? '', email: vendor?.email ?? '', phone: vendor?.phone ?? '', tax_id: vendor?.tax_id ?? '', address: vendor?.address ?? '', payment_terms_days: vendor?.payment_terms_days ?? 30, notes: vendor?.notes ?? '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    const body = { ...f, payment_terms_days: Number(f.payment_terms_days) || 0 };
    try {
      const res = vendor ? await vendorsAPI.update(vendor.id, body) : await vendorsAPI.create(body);
      toast.success(res.message); onDone();
    } catch (x) { setErr(errMsg(x, 'Could not save the vendor')); } finally { setBusy(false); }
  };
  return (
    <Modal title={vendor ? 'Edit vendor' : 'Add a vendor'} onClose={onClose} width={620}>
      <form onSubmit={go}>
        <FormStack>
          <FormError message={err} />
          <Field label="Company"><TextInput required value={f.company_name} onChange={set('company_name')} /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Contact person"><TextInput value={f.contact_name} onChange={set('contact_name')} /></Field>
            <Field label="Phone"><TextInput value={f.phone} onChange={set('phone')} /></Field>
            <Field label="Email"><TextInput type="email" value={f.email} onChange={set('email')} /></Field>
            <Field label="Tax ID / PIN"><TextInput value={f.tax_id} onChange={set('tax_id')} /></Field>
            <Field label="Payment terms (days)"><NumberInput min="0" value={f.payment_terms_days} onChange={set('payment_terms_days')} /></Field>
            <Field label="Address"><TextInput value={f.address} onChange={set('address')} placeholder="Street, town" /></Field>
          </div>
          <Field label="Notes"><TextInput value={f.notes} onChange={set('notes')} /></Field>
          <p style={{ margin: 0, fontSize: '0.78rem', color: colors.textMuted }}>A Sundry Creditors ledger is created for the vendor, so purchases and payments post to it.</p>
          <ModalActions onCancel={onClose} submitLabel={vendor ? 'Save' : 'Add vendor'} busy={busy} />
        </FormStack>
      </form>
    </Modal>
  );
}

function DetailModal({ id, onClose }) {
  const [v, setV] = useState(null);
  useEffect(() => { vendorsAPI.show(id).then(setV).catch((e) => toast.error(errMsg(e, 'Could not load the vendor'))); }, [id]);
  return (
    <Modal title={v ? v.company_name : 'Vendor'} subtitle={v ? `${v.vendor_number} · we owe ${money(v.owed)}` : ''} onClose={onClose} width={720}>
      {!v ? <p>Loading…</p> : (
        <div style={{ display: 'grid', gap: 10, fontSize: '0.82rem' }}>
          <div>{[v.contact_name, v.phone, v.email].filter(Boolean).join(' · ') || 'No contact details'}{v.payment_terms_days != null ? ` · ${v.payment_terms_days} day terms` : ''}</div>
          {v.address && <div style={{ color: colors.textMuted }}>{v.address}</div>}
          <h3 style={{ margin: '6px 0 0', fontSize: '0.85rem' }}>Recent purchases</h3>
          {v.purchases.length === 0 ? <p style={{ margin: 0, color: colors.textMuted }}>Nothing bought from this vendor yet.</p> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Voucher</th><th style={th}>Date</th><th style={th}>Invoice no.</th><th style={th}>Ref</th><th style={{ ...th, textAlign: 'right' }}>Total</th></tr></thead>
              <tbody>{v.purchases.map((p) => (
                <tr key={p.id}><td style={td}><Link to={`/admin/books/vouchers/${p.id}`}>{p.voucher_number}</Link><div style={{ fontSize: '0.7rem', color: colors.textFaint }}>{p.type}</div></td><td style={td}>{String(p.date).slice(0, 10)}</td><td style={td}>{p.supplier_invoice_no ?? '—'}</td><td style={td}>{p.reference_no ?? '—'}</td><td style={{ ...td, textAlign: 'right' }}>{money(p.total)}</td></tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}
    </Modal>
  );
}

export default function Vendors() {
  const user = useAuthStore((s) => s.user);
  const canWrite = canWriteFinance(user);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    vendorsAPI.list({ search: search || undefined }).then((d) => setRows(d.rows)).catch((e) => toast.error(errMsg(e, 'Could not load vendors'))).finally(() => setLoading(false));
  }, [search]);
  useEffect(() => { const t = setTimeout(load, search ? 250 : 0); return () => clearTimeout(t); }, [load, search]);
  const done = () => { setModal(null); load(); };
  const edit = async (r) => { try { setModal({ kind: 'edit', vendor: await vendorsAPI.show(r.id) }); } catch (x) { toast.error(errMsg(x, 'Could not load')); } };
  const toggle = async (r) => {
    try { const res = await vendorsAPI.update(r.id, { status: r.status === 'active' ? 'suspended' : 'active' }); toast.success(res.message); load(); } catch (x) { toast.error(errMsg(x, 'Could not update')); }
  };

  if (!canReadFinance(user)) return <AdminLayout><div style={{ padding: 32 }}><NoAccess what="vendors" /></div></AdminLayout>;

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1200, margin: '0 auto' }}>
        <HubHeader title="Vendors" description="Everyone we buy from. Each is a Sundry Creditors ledger; enter what they invoice us as a Purchase." />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '0 0 14px' }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search vendors" aria-label="Search vendors" style={{ padding: '7px 10px', borderRadius: 8, border: `1.5px solid ${colors.tint(0.18)}`, fontSize: '0.8rem', fontFamily: 'inherit', minWidth: 240 }} />
          <span style={{ flex: 1 }} />
          {canWrite && <button type="button" style={btnPrimary} onClick={() => setModal({ kind: 'add' })}><Plus size={14} /> Add a vendor</button>}
        </div>
        <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
          {loading ? <p style={{ padding: 20, color: colors.textMuted }}>Loading…</p> : rows.length === 0 ? (
            <p style={{ padding: 20, margin: 0, color: colors.textMuted, fontSize: '0.85rem' }}>{search ? 'No vendors match.' : 'No vendors yet.'}</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Vendor</th><th style={th}>Contact</th><th style={th}>Status</th><th style={{ ...th, textAlign: 'right' }}>We owe</th><th style={th} /></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.id}>
                  <td style={td}><strong>{r.company_name}</strong><div style={{ fontSize: '0.7rem', color: colors.textFaint }}>{r.vendor_number}</div></td>
                  <td style={td}>{r.contact_name}<div style={{ fontSize: '0.7rem', color: colors.textFaint }}>{[r.phone, r.email].filter(Boolean).join(' · ')}</div></td>
                  <td style={td}>{r.status.replace('_', ' ')}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{money(r.owed)}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    <button type="button" style={small} onClick={() => setModal({ kind: 'detail', id: r.id })}>View</button>
                    {canWrite && <button type="button" style={small} onClick={() => edit(r)}>Edit</button>}
                    {canWrite && <button type="button" style={small} onClick={() => toggle(r)}>{r.status === 'active' ? 'Suspend' : 'Activate'}</button>}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      </div>
      {modal?.kind === 'add' && <VendorModal onClose={() => setModal(null)} onDone={done} />}
      {modal?.kind === 'edit' && <VendorModal vendor={modal.vendor} onClose={() => setModal(null)} onDone={done} />}
      {modal?.kind === 'detail' && <DetailModal id={modal.id} onClose={() => setModal(null)} />}
    </AdminLayout>
  );
}
