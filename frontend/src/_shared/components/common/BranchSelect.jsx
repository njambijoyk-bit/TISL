import { useEffect, useState } from 'react';
import locationsAPI from '../../api/locations';
import { input, inputDisabled, focusRing } from '../../theme/tokens';

/**
 * Admin picker for the branch something belongs to (a hamper, an auction).
 * Lists active branches; when nothing is chosen yet it selects the default
 * branch so a single-branch business never has to think about it.
 *
 * @param {number|string} value      location id
 * @param {string} [capability]      only list branches that have it (e.g. 'sells_to_customers' for something customers buy)
 * @param {(id: number) => void} onChange
 */
export default function BranchSelect({ value, onChange, disabled = false, id, style, capability }) {
  const [branches, setBranches] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    locationsAPI.getAdmin()
      .then(({ locations = [] }) => {
        if (cancelled) return;
        const active = locations.filter((l) => l.is_active !== false && (!capability || l[capability] !== false));
        setBranches(active);
        if (!value && active.length) onChange((active.find((l) => l.is_default) ?? active[0]).id);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <select
      id={id}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      disabled={disabled || !loaded}
      style={{ ...(disabled ? inputDisabled : input), cursor: disabled ? 'not-allowed' : 'pointer', ...style }}
      {...(disabled ? {} : focusRing)}
    >
      {!value && <option value="">{loaded ? 'Select a branch' : 'Loading…'}</option>}
      {value && !branches.some((b) => String(b.id) === String(value)) && <option value={value}>Branch #{value}</option>}
      {branches.map((b) => <option key={b.id} value={b.id}>{b.name}{b.is_default ? ' (main)' : ''}</option>)}
    </select>
  );
}
