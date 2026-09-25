import { useEffect } from 'react';
import useUomStore from '../../store/uomStore';
import { input, inputDisabled, focusRing } from '../../theme/tokens';

const prettify = (s) => String(s ?? '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/**
 * Unit-of-measure picker, grouped by dimension (Volume, Mass, Length…).
 *
 * @param {number|string} value      unit id
 * @param {(id: number|'') => void} onChange
 * @param {string}  dimension        restrict to one dimension (e.g. when it must match a base unit)
 * @param {boolean} allowEmpty
 */
export default function UnitSelect({
  value, onChange, dimension, disabled = false, allowEmpty = true,
  emptyLabel = 'Select a unit', style, id, name, ...rest
}) {
  const { units, loading, fetchUnits } = useUomStore();

  useEffect(() => { fetchUnits().catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const available = units.filter((u) =>
    (u.is_active || String(u.id) === String(value)) && (!dimension || u.dimension === dimension)
  );

  const groups = available.reduce((acc, u) => {
    (acc[u.dimension] ??= []).push(u);
    return acc;
  }, {});

  return (
    <select
      {...rest}
      id={id}
      name={name}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      disabled={disabled || loading.units}
      style={{ ...(disabled ? inputDisabled : input), cursor: disabled ? 'not-allowed' : 'pointer', ...style }}
      {...(disabled ? {} : focusRing)}
    >
      {allowEmpty && <option value="">{loading.units && !units.length ? 'Loading units…' : emptyLabel}</option>}
      {Object.keys(groups).sort().map((dim) => (
        <optgroup key={dim} label={prettify(dim)}>
          {groups[dim].map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} ({u.code}){!u.is_active ? ' — inactive' : ''}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
