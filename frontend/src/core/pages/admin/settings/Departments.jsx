import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Building2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import SettingsLayout from '../../../../_shared/components/layout/SettingsLayout';
import HubHeader from '../../../components/admin/ui/HubHeader';
import Modal from '../../../components/admin/ui/Modal';
import { Field, TextInput, SelectInput, CheckboxRow, FormStack, ModalActions, FormError } from '../../../components/admin/ui/Form';
import departmentsAPI from '../../../../_shared/api/departments';
import locationsAPI from '../../../../_shared/api/locations';
import { hasPermission } from '../../../../_shared/lib/roles';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../../../_shared/theme/tokens';

/**
 * Settings, Departments. A department belongs to one branch, so Sales at branch A and Sales at branch B are two rows, each with its own cost
 * centre under the branch's. "Add to several branches" makes the same department in many at once.
 */

function AddModal({ branches, standard, onClose, onSaved }) {
  const [name, setName] = useState('');
  const [ids, setIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const toggle = (id) => setIds((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));

  const save = async () => {
    setBusy(true); setErr(null);
    try { const r = await departmentsAPI.bulk({ name: name.trim(), location_ids: ids }); toast.success(r.message ?? 'Saved.'); onSaved(); } catch (e) { setErr(errMsg(e, 'Could not save')); } finally { setBusy(false); }
  };

  return (
    <Modal title="Add a department" subtitle="Pick the branches that have it. Branches that already do are left as they are." onClose={onClose}>
      <FormStack>
        <Field label="Name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} list="std-departments" placeholder="Sales" autoFocus />
          <datalist id="std-departments">{standard.map((s) => <option key={s} value={s} />)}</datalist>
        </Field>
        <Field label="Branches" hint="Tick one or several.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto' }}>
            <button type="button" style={{ ...btnGhost, alignSelf: 'flex-start', fontSize: '0.72rem', padding: '3px 8px' }} onClick={() => setIds(ids.length === branches.length ? [] : branches.map((b) => b.id))}>{ids.length === branches.length ? 'Clear all' : 'Select all'}</button>
            {branches.map((b) => <CheckboxRow key={b.id} checked={ids.includes(b.id)} onChange={() => toggle(b.id)} label={b.name} />)}
          </div>
        </Field>
        <FormError message={err} />
        <ModalActions onCancel={onClose} submitLabel="Add" busyLabel="Adding…" busy={busy} onSubmit={save} disabled={!name.trim() || !ids.length} />
      </FormStack>
    </Modal>
  );
}

function EditModal({ item, onClose, onSaved }) {
  const [f, setF] = useState({ name: item.name, code: item.code ?? '', is_active: item.is_active });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const save = async () => {
    setBusy(true); setErr(null);
    try { await departmentsAPI.update(item.id, { name: f.name.trim(), code: f.code || null, is_active: f.is_active }); toast.success('Saved.'); onSaved(); } catch (e) { setErr(errMsg(e, 'Could not save')); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Edit ${item.name}`} subtitle={item.location?.name} onClose={onClose}>
      <FormStack>
        <Field label="Name" hint="Renaming also renames its cost centre and the department shown on its staff."><TextInput value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} autoFocus /></Field>
        <Field label="Code"><TextInput value={f.code} onChange={(e) => setF((x) => ({ ...x, code: e.target.value }))} /></Field>
        <CheckboxRow checked={f.is_active} onChange={(v) => setF((x) => ({ ...x, is_active: v }))} label="In use" description="Switched off, it stops being offered but keeps its history." />
        <FormError message={err} />
        <ModalActions onCancel={onClose} submitLabel="Save" busyLabel="Saving…" busy={busy} onSubmit={save} disabled={!f.name.trim()} />
      </FormStack>
    </Modal>
  );
}

export default function Departments() {
  const [data, setData] = useState(null);
  const [branches, setBranches] = useState([]);
  const [modal, setModal] = useState(null); // 'add' | { item }
  const [newStd, setNewStd] = useState('');
  const canManage = hasPermission(null, 'hr.manage');

  const load = useCallback(() => Promise.all([departmentsAPI.list({ with_inactive: 1 }), locationsAPI.getAdmin()])
    .then(([d, l]) => { setData(d); setBranches((l.locations ?? []).filter((x) => x.is_active !== false)); })
    .catch((e) => toast.error(errMsg(e, 'Could not load the departments'))), []);
  useEffect(() => { load(); }, [load]);

  const byBranch = useMemo(() => {
    const m = new Map();
    (data?.data ?? []).forEach((d) => { const k = d.location_id; if (!m.has(k)) m.set(k, []); m.get(k).push(d); });
    return m;
  }, [data]);

  const remove = async (d) => {
    if (!window.confirm(`Delete ${d.name} at ${d.location?.name}?`)) return;
    try { await departmentsAPI.remove(d.id); toast.success('Deleted.'); load(); } catch (e) { toast.error(errMsg(e, 'Could not delete')); }
  };
  const addStd = async () => {
    if (!newStd.trim()) return;
    try { await departmentsAPI.addStandard(newStd.trim()); setNewStd(''); load(); } catch (e) { toast.error(errMsg(e, 'Could not add')); }
  };
  const removeStd = async (n) => { try { await departmentsAPI.removeStandard(n); load(); } catch (e) { toast.error(errMsg(e, 'Could not remove')); } };

  if (!data) return <SettingsLayout><div style={{ padding: 32, color: colors.textMuted }}>Loading…</div></SettingsLayout>;
  if (!data.ready) return <SettingsLayout><div style={{ padding: 32 }}><HubHeader title="Departments" description="The department tables are not there yet. Run database script 101_departments.sql, then reload." /></div></SettingsLayout>;

  return (
    <SettingsLayout>
      <div style={{ padding: '32px 24px', maxWidth: 980, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <HubHeader title="Departments" description="Each branch has its own departments, and each department has its own cost centre under the branch's. Sales at two branches are two departments."
          action={canManage && <button type="button" style={btnPrimary} onClick={() => setModal('add')}><Plus size={14} /> Add department</button>} />

        {branches.map((b) => (
          <div key={b.id} style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', fontWeight: 700, fontSize: '0.85rem', display: 'flex', gap: 8, alignItems: 'center' }}><Building2 size={14} /> {b.name}</div>
            {(byBranch.get(b.id) ?? []).length === 0 && <div style={{ padding: '8px 14px 12px', fontSize: '0.78rem', color: colors.textMuted }}>No departments yet.</div>}
            {(byBranch.get(b.id) ?? []).map((d) => (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px 8px 36px', borderTop: `1px solid ${colors.border ?? 'var(--line)'}`, opacity: d.is_active ? 1 : 0.5 }}>
                <div style={{ flex: 1, minWidth: 0, fontSize: '0.84rem' }}>
                  {d.name}
                  {d.cost_centre && <span style={{ marginLeft: 8, fontSize: '0.7rem', color: colors.textMuted, fontFamily: 'monospace' }}>{d.cost_centre.code}</span>}
                  <span style={{ marginLeft: 8, fontSize: '0.72rem', color: colors.textMuted }}>{d.employees_count} staff</span>
                  {!d.is_active && <span style={{ marginLeft: 8, fontSize: '0.68rem', color: colors.textMuted }}>switched off</span>}
                </div>
                {canManage && (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button type="button" style={{ ...btnGhost, padding: '4px 8px' }} onClick={() => setModal({ item: d })} title="Edit"><Pencil size={12} /></button>
                    <button type="button" style={{ ...btnGhost, padding: '4px 8px', color: colors.danger }} onClick={() => remove(d)} title="Delete"><Trash2 size={12} /></button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}

        <div style={{ ...card, padding: 20 }}>
          <h2 style={{ margin: '0 0 4px', fontSize: '0.95rem', fontWeight: 800 }}>Standard names</h2>
          <p style={{ margin: '0 0 12px', fontSize: '0.78rem', color: colors.textMuted }}>Suggested when adding a department. Any name can still be typed.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {data.standard.map((n) => (
              <span key={n} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.76rem', padding: '3px 10px', borderRadius: 99, background: 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)' }}>
                {n}{canManage && <button type="button" onClick={() => removeStd(n)} style={{ background: 'none', border: 0, cursor: 'pointer', padding: 0, display: 'flex' }} title="Remove"><X size={11} /></button>}
              </span>
            ))}
          </div>
          {canManage && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12, maxWidth: 360 }}>
              <TextInput value={newStd} onChange={(e) => setNewStd(e.target.value)} placeholder="New standard name" onKeyDown={(e) => e.key === 'Enter' && addStd()} />
              <button type="button" style={btnPrimary} onClick={addStd}>Add</button>
            </div>
          )}
        </div>
      </div>
      {modal === 'add' && <AddModal branches={branches} standard={data.standard} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />}
      {modal?.item && <EditModal item={modal.item} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />}
    </SettingsLayout>
  );
}
