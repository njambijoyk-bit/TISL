import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { eventsPlanAPI } from '../../../_shared/api/events';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import Modal from '../../../core/components/admin/ui/Modal';
import SimpleTable from '../../../core/components/admin/ui/SimpleTable';
import { CheckboxRow, Field, FormGrid, FormStack, ModalActions, SelectInput, TextArea, TextInput } from '../../../core/components/admin/ui/Form';
import { btnGhost, btnPrimary, colors } from '../../../_shared/theme/tokens';

const small = { ...btnGhost, padding: '4px 10px', fontSize: '0.74rem' };

/**
 * A list of rows of one kind in the planning workspace (milestones, programme, budget lines, team) with an add / edit form. `fields` describe the form, `columns` the table.
 * `pick` takes the server's answer to a list call and returns the rows; `header` can show something above the table (the budget totals).
 */
export default function PlanCrud({ eventId, what, fields, columns, empty, canEdit, pick = (r) => r.data, header, addLabel = 'Add', title, blank = {}, onChange }) {
  const [raw, setRaw] = useState(null);
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => eventsPlanAPI.list(eventId, what).then((r) => { setRaw(r); onChange?.(r); }).catch((e) => toast.error(errMsg(e, 'Could not load it'))), [eventId, what]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const open = (row) => setEdit(row ? { ...Object.fromEntries(fields.map((f) => [f.key, row[f.key] ?? (f.type === 'checkbox' ? false : '')])), id: row.id } : { ...Object.fromEntries(fields.map((f) => [f.key, f.type === 'checkbox' ? Boolean(blank[f.key]) : blank[f.key] ?? ''])), id: null });
  const save = async () => {
    setBusy(true);
    try {
      const { id, ...vals } = edit;
      const body = Object.fromEntries(fields.map((f) => [f.key, f.type === 'number' ? (vals[f.key] === '' ? null : Number(vals[f.key])) : f.type === 'checkbox' ? Boolean(vals[f.key]) : (vals[f.key] === '' ? null : vals[f.key])]));
      await eventsPlanAPI.save(eventId, what, id, body);
      toast.success('Saved'); setEdit(null); load();
    } catch (e) { toast.error(errMsg(e, 'Could not save'), { duration: 8000 }); } finally { setBusy(false); }
  };
  const remove = async (row) => { try { await eventsPlanAPI.remove(eventId, what, row.id); load(); } catch (e) { toast.error(errMsg(e, 'Could not remove it')); } };

  const cols = [...columns, ...(canEdit ? [{ key: '_', label: '', align: 'right', render: (r) => (
    <span style={{ display: 'inline-flex', gap: 6 }}>
      <button type="button" style={small} onClick={() => open(r)} aria-label="Edit"><Pencil size={12} /></button>
      <button type="button" style={{ ...small, color: colors.danger }} onClick={() => remove(r)} aria-label="Remove"><Trash2 size={12} /></button>
    </span>) }] : [])];

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {header && raw && header(raw)}
      {canEdit && <div><button type="button" style={btnPrimary} onClick={() => open(null)}><Plus size={14} /> {addLabel}</button></div>}
      <SimpleTable columns={cols} rows={raw ? pick(raw) : []} loading={!raw} empty={empty} />
      {edit && (
        <Modal title={edit.id ? `Edit ${title ?? 'item'}` : addLabel} width={520} onClose={() => setEdit(null)}
          footer={<ModalActions onCancel={() => setEdit(null)} onSubmit={save} busy={busy} submitLabel="Save" busyLabel="Saving…" />}>
          <FormStack>
            <FormGrid min={200}>
              {fields.map((f) => (f.type === 'checkbox'
                ? <CheckboxRow key={f.key} checked={Boolean(edit[f.key])} onChange={(v) => setEdit({ ...edit, [f.key]: v })} label={f.label} description={f.hint} />
                : (
                  <Field key={f.key} label={f.label} htmlFor={`pc-${f.key}`} hint={f.hint} style={f.wide ? { gridColumn: '1 / -1' } : undefined}>
                    {f.type === 'select' ? <SelectInput id={`pc-${f.key}`} value={edit[f.key]} onChange={(e) => setEdit({ ...edit, [f.key]: e.target.value })}>{f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</SelectInput>
                      : f.type === 'textarea' ? <TextArea id={`pc-${f.key}`} rows={3} value={edit[f.key]} onChange={(e) => setEdit({ ...edit, [f.key]: e.target.value })} />
                        : <TextInput id={`pc-${f.key}`} type={f.type === 'number' ? 'number' : f.type ?? 'text'} step={f.type === 'number' ? 'any' : undefined} value={edit[f.key]} onChange={(e) => setEdit({ ...edit, [f.key]: e.target.value })} />}
                  </Field>
                )))}
            </FormGrid>
          </FormStack>
        </Modal>
      )}
    </div>
  );
}
