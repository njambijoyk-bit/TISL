import { useState } from 'react';
import { Save } from 'lucide-react';
import toast from 'react-hot-toast';
import accessAPI from '../../../../_shared/api/access';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { card, input, btn, h2, sub, chip, label } from './ui';

/** The seven clearance levels. Names can be changed to suit the business; the numbers are fixed. */
export default function LevelsTab({ data, reload }) {
  const canEdit = data.mine.can_roles;
  const [rows, setRows] = useState(() => data.levels.map((l) => ({ ...l, description: l.description ?? '' })));
  const [busy, setBusy] = useState(null);

  const set = (level, k, v) => setRows((r) => r.map((x) => (x.level === level ? { ...x, [k]: v } : x)));
  const save = async (row) => {
    setBusy(row.level);
    try { await accessAPI.renameLevel(row.level, { name: row.name, description: row.description || null }); toast.success('Saved'); reload(); } catch (e) { toast.error(errMsg(e, 'Could not save')); } finally { setBusy(null); }
  };
  const holders = (level) => data.roles.filter((r) => r.kind === 'staff' && r.min_clearance === level && r.is_active).map((r) => r.name);

  return (
    <div style={card}>
      <h2 style={h2}>Clearance levels</h2>
      <p style={sub}>
        A person can hold a role only if their clearance is at least the role&apos;s level, and can only manage people and give roles <strong>below</strong> their own level.
        The owner (level 6) is above all. {canEdit ? 'Rename the levels to match how the business talks.' : 'Only the owner can rename levels.'}
      </p>
      {rows.map((row) => (
        <div key={row.level} style={{ display: 'grid', gridTemplateColumns: '44px minmax(140px,1fr) minmax(200px,2fr) auto', gap: 12, alignItems: 'start', padding: '10px 0', borderTop: '1px solid color-mix(in srgb, var(--color-primary-500) 8%, transparent)' }}>
          <span style={{ ...chip(), justifyContent: 'center', fontSize: '0.9rem', padding: '6px 0', marginTop: 18 }}>{row.level}</span>
          <div><label style={label}>Name</label><input style={input} value={row.name} disabled={!canEdit} maxLength={60} onChange={(e) => set(row.level, 'name', e.target.value)} /></div>
          <div>
            <label style={label}>What it means</label>
            <input style={input} value={row.description} disabled={!canEdit} maxLength={255} onChange={(e) => set(row.level, 'description', e.target.value)} />
            {holders(row.level).length > 0 && <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: 4 }}>Roles at this level: {holders(row.level).join(', ')}</div>}
          </div>
          {canEdit && <button type="button" style={{ ...btn(true), marginTop: 18 }} disabled={busy === row.level || !row.name.trim()} onClick={() => save(row)}><Save size={14} /> Save</button>}
        </div>
      ))}
    </div>
  );
}
