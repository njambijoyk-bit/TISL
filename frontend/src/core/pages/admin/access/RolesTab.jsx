import { useState } from 'react';
import { Plus, Pencil, Copy, Lock } from 'lucide-react';
import { card, btn, h2, sub, th, td, chip, moduleName } from './ui';
import RoleEditor from './RoleEditor';

const SCOPE = { global: 'Every branch', assigned: 'Their branches', own: 'Their own' };
const DATA = { all: 'All records', assigned: 'Assigned to them', own: 'Their own' };

/** The roles that exist and what each holds. Built-in roles can be adjusted; the owner role and the customer, vendor and applicant roles are fixed. */
export default function RolesTab({ data, reload }) {
  const [editing, setEditing] = useState(null);   // null | 'new' | a role row | {copyOf: role}
  const canBuild = data.mine.can_roles;
  const staff = data.roles.filter((r) => r.kind === 'staff');
  const portal = data.roles.filter((r) => r.kind === 'portal');
  const levelName = (n) => data.levels.find((l) => l.level === n)?.name ?? `Level ${n}`;

  const row = (r) => (
    <tr key={r.id} style={{ opacity: r.is_active ? 1 : 0.55 }}>
      <td style={td}>
        <div style={{ fontWeight: 700 }}>{r.name} {!r.is_system && <span style={chip('#7c3aed')}>Custom</span>} {!r.is_active && <span style={chip('#9ca3af')}>Off</span>}</div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>{r.description}</div>
      </td>
      <td style={td}><span style={chip()}>{r.min_clearance}</span> <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{levelName(r.min_clearance)}</span></td>
      <td style={td}>{SCOPE[r.scope_type]}<div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>{DATA[r.data_scope]}</div></td>
      <td style={td}>{r.permissions.length}{r.module_key ? <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>{moduleName(r.module_key)} module</div> : null}</td>
      <td style={td}>{r.people}</td>
      <td style={{ ...td, whiteSpace: 'nowrap' }}>
        {r.kind === 'staff' && r.key !== 'super_admin' && canBuild && (
          <>
            <button type="button" style={btn(false)} onClick={() => setEditing(r)}><Pencil size={13} /> Edit</button>{' '}
            <button type="button" style={btn(false)} title="Start a new role from this one" onClick={() => setEditing({ copyOf: r })}><Copy size={13} /> Copy</button>
          </>
        )}
        {(r.key === 'super_admin' || r.kind === 'portal') && <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', display: 'inline-flex', gap: 4, alignItems: 'center' }}><Lock size={12} /> Fixed</span>}
        {r.kind === 'staff' && r.key !== 'super_admin' && !canBuild && <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>Owner only</span>}
      </td>
    </tr>
  );

  const header = <thead><tr><th style={th}>Role</th><th style={th}>Needs clearance</th><th style={th}>Branches / records</th><th style={th}>Permissions</th><th style={th}>People</th><th style={th} /></tr></thead>;

  return (
    <>
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div><h2 style={h2}>Staff roles</h2><p style={sub}>A role decides what someone can do. Make a role for any job — Chef, Librarian, Foreman — and give it only what the job needs.</p></div>
          {canBuild && <button type="button" style={btn(true)} onClick={() => setEditing('new')}><Plus size={14} /> New role</button>}
        </div>
        <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}>{header}<tbody>{staff.map(row)}</tbody></table></div>
      </div>

      <div style={card}>
        <h2 style={h2}>Customers, vendors and applicants</h2>
        <p style={sub}>These only ever see their own things. They never hold staff permissions, so there is nothing to set.</p>
        <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}>{header}<tbody>{portal.map(row)}</tbody></table></div>
      </div>

      {editing && <RoleEditor role={editing === 'new' ? null : editing.copyOf ? null : editing} template={editing.copyOf ?? null} data={data} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </>
  );
}
