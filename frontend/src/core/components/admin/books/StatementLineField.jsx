import { Field, SelectInput } from '../ui/Form';

/**
 * Which statement line a ledger or group reports under. The first choice (value '') follows whatever the group or parent reports under; any other
 * choice is the row's own. Only lines that accept the group's nature are offered. People without books.statements see it but cannot change it.
 */
export default function StatementLineField({ lines, nature, inheritedId, inheritedFrom = 'its group', value, onChange, canChange, error, label = 'Statement line' }) {
  const offered = lines.filter((l) => !nature || l.nature === nature);
  const inherited = lines.find((l) => l.id === inheritedId);
  const byPath = offered.reduce((m, l) => { (m[l.path || 'Other'] ??= []).push(l); return m; }, {});
  return (
    <Field label={label} error={error}
      hint={canChange ? 'Where it counts on the balance sheet or income statement. Leave the first choice to follow ' + inheritedFrom + '.' : 'Changing this needs the "books.statements" permission.'}>
      <SelectInput aria-label={label} disabled={!canChange} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{inherited ? `Follows ${inheritedFrom}: ${inherited.name}` : `Not set (${inheritedFrom} has no line yet)`}</option>
        {Object.entries(byPath).map(([path, ls]) => (
          <optgroup key={path} label={path}>{ls.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>
        ))}
      </SelectInput>
    </Field>
  );
}
