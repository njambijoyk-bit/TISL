import { SelectInput } from '../../core/components/admin/ui/Form';

/** "All kinds" or one kind of ingredient (Cooking ingredient, Ready to serve...). Hidden until there is more than one kind to choose between. */
export default function KindFilter({ kinds, value, onChange }) {
  if (!kinds || kinds.length < 2) return null;

  return (
    <SelectInput aria-label="Kind" value={value} onChange={(e) => onChange(e.target.value)} style={{ width: 'auto', maxWidth: 200 }}>
      <option value="">All kinds</option>
      {kinds.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
    </SelectInput>
  );
}
