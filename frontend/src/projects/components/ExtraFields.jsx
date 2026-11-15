import { Field, SelectInput, TextInput } from './ui';
import { check } from './uiTokens';

/**
 * The extra fields an owner defined (docs/PROJECTS_STAGE1_SPEC.md, build 1.8), as inputs on the form and as words on the open project.
 * `fields` = [{ key, label, kind, options, required }], `values` = { key: value }, `people` = [{ id, name }] for a field that names a member of staff.
 */
export function ExtraFieldInputs({ fields, values, onChange, people = [] }) {
  return fields.map((f) => {
    const id = `extra-${f.key}`;
    const value = values[f.key];
    const set = (v) => onChange({ ...values, [f.key]: v });
    const label = `${f.label}${f.required ? ' *' : ''}`;
    if (f.kind === 'yes_no') {
      return (
        <label key={f.key} htmlFor={id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, alignSelf: 'end', paddingBottom: 8 }}>
          <input id={id} type="checkbox" style={check} checked={!!value} onChange={(e) => set(e.target.checked)} /> {f.label}
        </label>
      );
    }
    if (f.kind === 'pick_many') {
      const chosen = Array.isArray(value) ? value : [];
      return (
        <fieldset key={f.key} style={{ border: 'none', margin: 0, padding: 0, minWidth: 0 }}>
          <legend style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', padding: 0, marginBottom: 5 }}>{label}</legend>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
            {f.options.map((o) => (
              <label key={o} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13.5 }}>
                <input type="checkbox" style={check} checked={chosen.includes(o)} onChange={(e) => set(e.target.checked ? [...chosen, o] : chosen.filter((x) => x !== o))} /> {o}
              </label>
            ))}
          </div>
        </fieldset>
      );
    }
    return (
      <Field key={f.key} label={label} htmlFor={id}>
        {f.kind === 'pick_one' && (
          <SelectInput id={id} value={value ?? ''} required={f.required} onChange={(e) => set(e.target.value)}>
            <option value="">Choose…</option>
            {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
          </SelectInput>
        )}
        {f.kind === 'person' && (
          <SelectInput id={id} value={value ?? ''} required={f.required} onChange={(e) => set(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Choose…</option>
            {people.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </SelectInput>
        )}
        {(f.kind === 'text' || f.kind === 'number' || f.kind === 'date') && (
          <TextInput id={id} type={f.kind === 'text' ? 'text' : f.kind} step={f.kind === 'number' ? 'any' : undefined} value={value ?? ''} required={f.required} onChange={(e) => set(e.target.value)} />
        )}
      </Field>
    );
  });
}
