import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Truck } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';
import { Field, SelectInput, FormStack, ModalActions, FormError } from '../ui/Form';
import deliveryAPI from '../../../../_shared/api/delivery';
import useAuthStore from '../../../../_shared/store/authStore';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { btnGhost, colors } from '../../../../_shared/theme/tokens';
import { canManifest } from './booksFmt';
import { hasAnyRole } from '../../../../_shared/lib/roles';

const ROLES = ['admin', 'super_admin', 'manager', 'logistics'];

/** "Add to manifest": put a Delivery Note on a draft manifest (same customer + address joins the stop already there). */
export default function AddToManifest({ voucher, compact = false, onDone }) {
  const roleUser = useAuthStore((s) => s.user);
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [manifests, setManifests] = useState(null);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  if (!hasAnyRole(roleUser, ROLES) || !canManifest(voucher)) return null;

  const show = async (e) => {
    e?.stopPropagation();
    setOpen(true); setErr(null); setManifests(null);
    try {
      const res = await deliveryAPI.getManifests({ status: 'draft', per_page: 50 });
      const rows = res.data ?? [];
      setManifests(rows); setPick(rows[0]?.id ?? '');
    } catch (ex) { setErr(errMsg(ex, 'Could not load the draft manifests')); setManifests([]); }
  };

  const go = async () => {
    setBusy(true); setErr(null);
    try {
      const res = await deliveryAPI.addItemsToManifest(pick, { voucher_ids: [voucher.id] });
      if (res.skipped_count) { setErr((res.skipped_orders?.[0]?.reason === 'in_manifest' ? 'It is already on a manifest.' : 'It cannot go on a manifest.')); return; }
      toast.success(`${voucher.voucher_number} added to the manifest`);
      setOpen(false); onDone?.();
    } catch (ex) { setErr(errMsg(ex, 'Could not add it')); }
    finally { setBusy(false); }
  };

  return (
    <>
      <button type="button" onClick={show} style={{ ...btnGhost, ...(compact ? { padding: '3px 9px', fontSize: '0.7rem' } : {}) }} title="Put this Delivery Note on a manifest"><Truck size={compact ? 12 : 14} /> Add to manifest</button>
      {open && (
        <Modal title={`Add ${voucher.voucher_number} to a manifest`} subtitle="Delivery Notes for the same customer and address share one stop." onClose={() => setOpen(false)}>
          <FormStack>
            <FormError message={err} />
            {manifests === null ? <p style={{ color: colors.textMuted }}>Loading…</p> : manifests.length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.82rem', color: colors.textMuted }}>There is no draft manifest. <button type="button" onClick={() => nav('/admin/delivery/manifests/create')} style={{ ...btnGhost, padding: '2px 8px' }}>Create one</button></p>
            ) : (
              <Field label="Draft manifest">
                <SelectInput value={pick} onChange={(e) => setPick(e.target.value)}>
                  {manifests.map((m) => <option key={m.id} value={m.id}>{m.manifest_number} · {m.scheduled_date?.slice?.(0, 10)} · {m.driver?.name ?? m.delivery_method?.replace(/_/g, ' ')} · {m.items?.length ?? 0} stops</option>)}
                </SelectInput>
              </Field>
            )}
            <ModalActions onCancel={() => setOpen(false)} submitLabel="Add to manifest" busyLabel="Adding…" busy={busy} disabled={!pick} onSubmit={go} />
          </FormStack>
        </Modal>
      )}
    </>
  );
}
