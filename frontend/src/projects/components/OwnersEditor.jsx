import { Btn, SelectInput } from './ui';

/**
 * Who a piece of work belongs to (HR stage 1b, docs/HR_STAGE1B_SPEC.md): one or more owners, each a branch or a branch and one of its departments.
 * One owner is the lead: its branch is the work's branch and the work's costs are filed under its cost centre. A department always comes with its
 * branch: the department list follows the branch chosen. value = [{ location_id, department_id, is_lead }].
 */
export default function OwnersEditor({ value, onChange, branches, departments, disabled }) {
  const rows = value.length ? value : [{ location_id: '', department_id: '', is_lead: true }];
  const set = (i, patch) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const lead = (i) => onChange(rows.map((r, j) => ({ ...r, is_lead: j === i })));
  const remove = (i) => { const next = rows.filter((_, j) => j !== i); onChange(next.some((r) => r.is_lead) || !next.length ? next : next.map((r, j) => ({ ...r, is_lead: j === 0 }))); };

  return (
    <div data-owners style={{ display: 'grid', gap: 8 }}>
      {rows.map((r, i) => {
        const deps = departments?.[r.location_id] ?? [];
        return (
          <div key={i} data-owner={i} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <SelectInput aria-label={`Branch of owner ${i + 1}`} value={r.location_id ?? ''} disabled={disabled} style={{ width: 'auto', minWidth: 150 }} onChange={(e) => set(i, { location_id: e.target.value ? Number(e.target.value) : '', department_id: '' })}>
              <option value="">Choose a branch…</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </SelectInput>
            <SelectInput aria-label={`Department of owner ${i + 1}`} value={r.department_id ?? ''} disabled={disabled || !r.location_id || deps.length === 0} style={{ width: 'auto', minWidth: 170 }} onChange={(e) => set(i, { department_id: e.target.value ? Number(e.target.value) : '' })}>
              <option value="">{r.location_id && deps.length === 0 ? 'No departments here' : 'The whole branch'}</option>
              {deps.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </SelectInput>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
              <input type="radio" name="owners-lead" checked={!!r.is_lead} disabled={disabled} onChange={() => lead(i)} /> Lead
            </label>
            {rows.length > 1 && <Btn small variant="quiet" disabled={disabled} onClick={() => remove(i)}>Remove</Btn>}
          </div>
        );
      })}
      <span><Btn small variant="quiet" disabled={disabled} onClick={() => onChange([...rows, { location_id: '', department_id: '', is_lead: false }])}>Add another owner</Btn></span>
      <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-secondary)' }}>The lead's branch is the work's branch, and its costs are filed under the lead's department in the books (or the branch's Projects). Other owners see the work in their lists and pages.</p>
    </div>
  );
}
