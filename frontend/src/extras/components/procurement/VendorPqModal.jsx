import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import Modal from '../../../core/components/admin/ui/Modal';
import { Field, TextInput, TextArea, SelectInput, FormStack, FormGrid, ModalActions, FormError } from '../../../core/components/admin/ui/Form';
import { vendorPrequalificationsAPI } from '../../../_shared/api/index';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { colors, btnGhost } from '../../../_shared/theme/tokens';
import { StatusBadge } from './ui';
import { fmtLongDate, CATEGORY_LABELS } from './format';

const BLANK = { category: 'goods', status: 'qualified', qualified_from: '', valid_until: '', reason: '', notes: '' };

/**
 * Pre-qualification is decided offline; this is where staff record the outcome on the vendor.
 * Every decision (and every change) needs a written reason, kept with who recorded it.
 */
export default function VendorPqModal({ vendor, canManage, onClose }) {
  const [rows, setRows] = useState(null);
  const [f, setF] = useState(BLANK);
  const [change, setChange] = useState(null);   // { row, action: 'revoke' | 'extend', reason, valid_until }
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const load = useCallback(() => vendorPrequalificationsAPI.forVendor(vendor.id).then(r => setRows(r.rows || [])).catch(() => setRows([])), [vendor.id]);
  useEffect(() => { load(); }, [load]);

  const set = (k) => (e) => setF(x => ({ ...x, [k]: e.target.value }));

  const record = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const res = await vendorPrequalificationsAPI.record(vendor.id, { ...f, qualified_from: f.qualified_from || undefined, valid_until: f.valid_until || undefined, notes: f.notes || undefined });
      toast.success(res.message); setF(BLANK); load();
    } catch (x) { setErr(errMsg(x, 'Could not record it')); } finally { setBusy(false); }
  };

  const applyChange = async () => {
    setBusy(true); setErr(null);
    const body = change.action === 'revoke' ? { status: 'revoked', reason: change.reason } : { valid_until: change.valid_until, reason: change.reason };
    try {
      const res = await vendorPrequalificationsAPI.update(change.row.id, body);
      toast.success(res.message); setChange(null); load();
    } catch (x) { setErr(errMsg(x, 'Could not change it')); } finally { setBusy(false); }
  };

  const small = { ...btnGhost, padding: '3px 9px', fontSize: '0.7rem', marginRight: 6 };

  return (
    <Modal title="Pre-qualification" subtitle={vendor.company_name} onClose={onClose} width={720}>
      <FormStack>
        <FormError message={err} />
        {rows === null ? <p style={{ margin: 0, color: colors.textMuted }}>Loading…</p> : rows.length === 0 ? (
          <p style={{ margin: 0, fontSize: '0.82rem', color: colors.textMuted }}>Nothing recorded yet. The vendor sends the filled form by email or another channel; record the decision here.</p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {rows.map(r => (
              <div key={r.id} style={{ border: `1px solid ${colors.tint(0.12)}`, borderRadius: 8, padding: '10px 12px', fontSize: '0.8rem' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong>{CATEGORY_LABELS[r.category] || r.category}</strong>
                  <StatusBadge status={r.status === 'qualified' ? (r.current ? 'qualified' : 'closed') : r.status === 'refused' ? 'rejected' : 'cancelled'} label={r.status === 'qualified' && !r.current ? 'expired' : r.status} />
                  <span style={{ color: colors.textMuted }}>{fmtLongDate(r.qualified_from)}{r.valid_until ? ` to ${fmtLongDate(r.valid_until)}` : ''}</span>
                </div>
                <div style={{ marginTop: 4, overflowWrap: 'anywhere' }}>{r.reason}</div>
                <div style={{ fontSize: '0.7rem', color: colors.textFaint, marginTop: 2 }}>Recorded by {r.recorded_by || 'staff'}</div>
                {canManage && r.status === 'qualified' && (
                  <div style={{ marginTop: 6 }}>
                    <button type="button" style={small} onClick={() => setChange({ row: r, action: 'extend', reason: '', valid_until: r.valid_until || '' })}>Extend</button>
                    <button type="button" style={small} onClick={() => setChange({ row: r, action: 'revoke', reason: '' })}>Revoke</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {change && (
          <div style={{ border: `1.5px solid ${colors.tint(0.25)}`, borderRadius: 8, padding: 12, display: 'grid', gap: 10 }}>
            <strong style={{ fontSize: '0.82rem' }}>{change.action === 'revoke' ? 'Revoke' : 'Extend'} {CATEGORY_LABELS[change.row.category]}</strong>
            {change.action === 'extend' && <Field label="Valid until"><TextInput type="date" value={change.valid_until} onChange={e => setChange(c => ({ ...c, valid_until: e.target.value }))} /></Field>}
            <Field label="Why" hint="Required"><TextArea rows={2} value={change.reason} onChange={e => setChange(c => ({ ...c, reason: e.target.value }))} /></Field>
            <ModalActions onCancel={() => setChange(null)} submitLabel="Save change" onSubmit={applyChange} busy={busy} />
          </div>
        )}

        {canManage && (
          <form onSubmit={record} style={{ display: 'grid', gap: 10, borderTop: `1px solid ${colors.tint(0.1)}`, paddingTop: 12 }}>
            <strong style={{ fontSize: '0.82rem' }}>Record a decision</strong>
            <FormGrid min={160}>
              <Field label="Category"><SelectInput value={f.category} onChange={set('category')}>{Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectInput></Field>
              <Field label="Decision"><SelectInput value={f.status} onChange={set('status')}><option value="qualified">Qualified</option><option value="refused">Refused</option></SelectInput></Field>
              <Field label="Qualified from"><TextInput type="date" value={f.qualified_from} onChange={set('qualified_from')} /></Field>
              {f.status === 'qualified' && <Field label="Valid until"><TextInput required type="date" value={f.valid_until} onChange={set('valid_until')} /></Field>}
            </FormGrid>
            <Field label="Why" hint="Required: saved with your name and the time"><TextArea required rows={2} value={f.reason} onChange={set('reason')} /></Field>
            <Field label="Notes"><TextInput value={f.notes} onChange={set('notes')} /></Field>
            <ModalActions onCancel={onClose} submitLabel="Record" busy={busy} />
          </form>
        )}
      </FormStack>
    </Modal>
  );
}
