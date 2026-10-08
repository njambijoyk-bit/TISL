import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Lock, Network } from 'lucide-react';
import toast from 'react-hot-toast';
import SettingsLayout from '../../../../_shared/components/layout/SettingsLayout';
import HubHeader from '../../../components/admin/ui/HubHeader';
import Modal from '../../../components/admin/ui/Modal';
import { Field, TextInput, SelectInput, CheckboxRow, FormStack, ModalActions, FormError } from '../../../components/admin/ui/Form';
import costCentresAPI from '../../../../_shared/api/costCentres';
import { hasPermission } from '../../../../_shared/lib/roles';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../../../_shared/theme/tokens';

/**
 * Settings, Cost centres. The tree (a branch's big cost centre covers Utilities, Stock, Payroll, projects, departments ...) and the defaults that
 * mean no entry is ever without a cost centre.
 */

function descendantIds(rows, id) {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    rows.forEach((r) => { if (r.parent_id && out.has(r.parent_id) && !out.has(r.id)) { out.add(r.id); grew = true; } });
  }
  return out;
}

function EditModal({ rows, item, parent, onClose, onSaved }) {
  const isNew = !item?.id;
  const [f, setF] = useState({ name: item?.name ?? '', code: item?.code ?? '', purpose: item?.purpose ?? '', description: item?.description ?? '', parent_id: item ? (item.parent_id ?? '') : (parent?.id ?? ''), is_active: item?.is_active ?? true });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const blocked = item?.id ? descendantIds(rows, item.id) : new Set();
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target?.value ?? e }));

  const save = async () => {
    setBusy(true); setErr(null);
    const body = { name: f.name, code: f.code || undefined, purpose: f.purpose || null, description: f.description || null, parent_id: f.parent_id || null };
    try {
      if (isNew) await costCentresAPI.create(body);
      else await costCentresAPI.update(item.id, { ...body, is_active: f.is_active });
      toast.success('Saved.'); onSaved();
    } catch (e) { setErr(errMsg(e, 'Could not save')); } finally { setBusy(false); }
  };

  return (
    <Modal title={isNew ? 'New cost centre' : `Edit ${item.name}`} subtitle={parent ? `Under ${parent.path}` : undefined} onClose={onClose}>
      <FormStack>
        <Field label="Name"><TextInput value={f.name} onChange={set('name')} placeholder="Utilities" autoFocus /></Field>
        <Field label="Code" hint="Short and unique. Leave empty to make one from the name."><TextInput value={f.code} onChange={set('code')} placeholder="NBO-UTIL" /></Field>
        <Field label="Purpose" hint="A label you choose (stock, payroll, utilities, sales, project...). It only helps pick sensible defaults."><TextInput value={f.purpose} onChange={set('purpose')} placeholder="utilities" /></Field>
        <Field label="Sits under">
          <SelectInput value={f.parent_id} onChange={set('parent_id')} disabled={item?.is_system}>
            <option value="">Nothing (top level)</option>
            {rows.filter((r) => !blocked.has(r.id)).map((r) => <option key={r.id} value={r.id}>{'— '.repeat(r.depth)}{r.name}</option>)}
          </SelectInput>
        </Field>
        <Field label="Note"><TextInput value={f.description} onChange={set('description')} /></Field>
        {!isNew && <CheckboxRow checked={f.is_active} disabled={item.is_system} onChange={(v) => setF((x) => ({ ...x, is_active: v }))} label="In use" description="Switched off, it stops being offered but keeps its history." />}
        <FormError message={err} />
        <ModalActions onCancel={onClose} submitLabel="Save" busyLabel="Saving…" busy={busy} onSubmit={save} disabled={!f.name.trim()} />
      </FormStack>
    </Modal>
  );
}

export default function CostCentres() {
  const [data, setData] = useState(null);
  const [edit, setEdit] = useState(null);       // { item?, parent? }
  const [settings, setSettings] = useState({});
  const canManage = hasPermission(null, 'costcentres.manage');

  const load = useCallback(() => costCentresAPI.list().then((d) => { setData(d); setSettings(d.settings ?? {}); }).catch((e) => toast.error(errMsg(e, 'Could not load the cost centres'))), []);
  useEffect(() => { load(); }, [load]);

  const remove = async (r) => {
    if (!window.confirm(`Delete ${r.name}?`)) return;
    try { await costCentresAPI.remove(r.id); toast.success('Deleted.'); load(); } catch (e) { toast.error(errMsg(e, 'Could not delete')); }
  };

  const saveSettings = async () => {
    const body = { ...settings };
    Object.keys(body).forEach((k) => { if (k !== 'line_override') body[k] = Number(body[k]); });
    body.line_override = settings.line_override === '1' || settings.line_override === true;
    try { const r = await costCentresAPI.saveSettings(body); setSettings(r.settings); toast.success('Defaults saved.'); } catch (e) { toast.error(errMsg(e, 'Could not save')); }
  };

  if (!data) return <SettingsLayout><div style={{ padding: 32, color: colors.textMuted }}>Loading…</div></SettingsLayout>;
  if (!data.ready) return <SettingsLayout><div style={{ padding: 32 }}><HubHeader title="Cost centres" description="The cost centre tables are not there yet. Run database script 100_cost_centres.sql, then reload." /></div></SettingsLayout>;

  const rows = data.data;
  const active = rows.filter((r) => r.is_active);
  const pick = (k) => (
    <SelectInput value={settings[k] ?? ''} onChange={(e) => setSettings((s) => ({ ...s, [k]: e.target.value }))} disabled={!canManage}>
      {active.map((r) => <option key={r.id} value={r.id}>{'— '.repeat(r.depth)}{r.name}</option>)}
    </SelectInput>
  );

  return (
    <SettingsLayout>
      <div style={{ padding: '32px 24px', maxWidth: 980, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <HubHeader title="Cost centres" description="What a cost or income belongs to. A branch's cost centre covers smaller ones (utilities, stock, payroll, projects, departments); reports add them up into the branch."
          action={canManage && <button type="button" style={btnPrimary} onClick={() => setEdit({})}><Plus size={14} /> New top-level cost centre</button>} />

        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          {rows.map((r) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', paddingLeft: 14 + r.depth * 22, borderBottom: `1px solid ${colors.border ?? 'var(--line)'}`, opacity: r.is_active ? 1 : 0.5 }}>
              <Network size={14} style={{ color: colors.textMuted, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: r.depth === 0 ? 700 : 500, fontSize: '0.85rem' }}>{r.name}</span>
                <span style={{ marginLeft: 8, fontSize: '0.7rem', color: colors.textMuted, fontFamily: 'monospace' }}>{r.code}</span>
                {r.purpose && <span style={{ marginLeft: 8, fontSize: '0.68rem', padding: '1px 8px', borderRadius: 99, background: 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)', color: 'var(--color-primary-600)' }}>{r.purpose}</span>}
                {r.is_system && <Lock size={11} style={{ marginLeft: 8, color: colors.textMuted }} title="Built in: renamed but never deleted" />}
                {!r.is_active && <span style={{ marginLeft: 8, fontSize: '0.68rem', color: colors.textMuted }}>switched off</span>}
              </div>
              {canManage && (
                <div style={{ display: 'flex', gap: 4 }}>
                  <button type="button" style={{ ...btnGhost, padding: '4px 8px', fontSize: '0.72rem' }} onClick={() => setEdit({ parent: r })} title="Add one under this"><Plus size={12} /> Under</button>
                  <button type="button" style={{ ...btnGhost, padding: '4px 8px' }} onClick={() => setEdit({ item: r })} title="Edit"><Pencil size={12} /></button>
                  {!r.is_system && <button type="button" style={{ ...btnGhost, padding: '4px 8px', color: colors.danger }} onClick={() => remove(r)} title="Delete"><Trash2 size={12} /></button>}
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{ ...card, padding: 20 }}>
          <h2 style={{ margin: '0 0 4px', fontSize: '0.95rem', fontWeight: 800 }}>Defaults</h2>
          <p style={{ margin: '0 0 14px', fontSize: '0.78rem', color: colors.textMuted }}>When an entry is given no cost centre, the one for its kind of document is used (else the branch's own, else General), so nothing is ever left without one.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 14 }}>
            <Field label="General (the last resort)">{pick('general')}</Field>
            <Field label="Head office (shared costs)">{pick('head_office')}</Field>
            {Object.entries(data.default_keys).map(([k, label]) => <Field key={k} label={label}>{pick(k)}</Field>)}
          </div>
          <div style={{ marginTop: 12 }}>
            <CheckboxRow checked={settings.line_override === '1' || settings.line_override === true} disabled={!canManage}
              onChange={(v) => setSettings((s) => ({ ...s, line_override: v ? '1' : '0' }))} label="A line may take a different cost centre from its voucher" description="Applies once the books carry cost centres." />
          </div>
          {canManage && <div style={{ marginTop: 14 }}><button type="button" style={btnPrimary} onClick={saveSettings}>Save defaults</button></div>}
        </div>
      </div>
      {edit && <EditModal rows={rows} item={edit.item} parent={edit.parent} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </SettingsLayout>
  );
}
