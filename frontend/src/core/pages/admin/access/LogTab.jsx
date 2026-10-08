import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import accessAPI from '../../../../_shared/api/access';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { card, input, btn, h2, sub, th, td, when, chip } from './ui';

const ACTIONS = {
  role_assigned: 'Role given', role_removed: 'Role taken away', primary_role_changed: 'Main role changed', clearance_changed: 'Clearance changed',
  default_location_changed: 'Default branch changed', grant_added: 'Branch access given', grant_revoked: 'Branch access taken away',
  role_saved: 'Role saved', role_deleted: 'Role deleted', level_renamed: 'Level renamed', would_deny: 'Would have been refused',
};

const detail = (a, d) => {
  if (!d) return '';
  switch (a) {
    case 'role_assigned': return `${d.role}${d.expires_at ? ` until ${when(d.expires_at)}` : ''}`;
    case 'role_removed': case 'primary_role_changed': return d.role;
    case 'clearance_changed': return `${d.from} → ${d.to}`;
    case 'default_location_changed': return `branch ${d.from ?? 'none'} → ${d.to ?? 'none'}`;
    case 'grant_added': return `${d.resource}${d.expires_at ? ` until ${when(d.expires_at)}` : ' for good'}${d.reason ? ` · ${d.reason}` : ''}`;
    case 'grant_revoked': return d.resource;
    case 'role_saved': return `${d.role}${d.created ? ' (new)' : ''}`;
    case 'would_deny': return `${d.permission} at branch ${d.location_id}`;
    default: return Object.values(d).filter((x) => x !== null && typeof x !== 'object').join(' · ');
  }
};

/** Everything that changed who can do what, and (in test mode) what branch limits would have refused. */
export default function LogTab() {
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const [res, setRes] = useState(null);

  useEffect(() => {
    accessAPI.log({ action: action || undefined, page }).then(setRes).catch((e) => toast.error(errMsg(e, 'Could not load the activity')));
  }, [action, page]);

  return (
    <div style={card}>
      <h2 style={h2}>Activity</h2>
      <p style={sub}>Every change to roles, clearance and branch access. In test mode it also lists what branch limits would have refused (once an hour for each person, permission and branch).</p>
      <select style={{ ...input, width: 240, marginBottom: 12 }} value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} aria-label="Filter">
        <option value="">Everything</option>
        {Object.entries(ACTIONS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
      </select>
      {!res ? <p style={sub}>Loading…</p> : res.data.length === 0 ? <p style={sub}>Nothing recorded yet.</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>When</th><th style={th}>What</th><th style={th}>Who did it</th><th style={th}>For</th><th style={th}>Details</th></tr></thead>
            <tbody>
              {res.data.map((l) => (
                <tr key={l.id}>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{when(l.at.replace(' ', 'T'))}</td>
                  <td style={td}><span style={chip(l.action === 'would_deny' ? '#d97706' : undefined)}>{ACTIONS[l.action] ?? l.action}</span></td>
                  <td style={td}>{l.actor ?? '—'}</td>
                  <td style={td}>{l.subject ?? '—'}</td>
                  <td style={{ ...td, color: 'var(--text-secondary)' }}>{detail(l.action, l.details)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {res && res.last_page > 1 && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12 }}>
          <button type="button" style={btn(false)} disabled={page <= 1} onClick={() => setPage(page - 1)}>Newer</button>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Page {res.current_page} of {res.last_page}</span>
          <button type="button" style={btn(false)} disabled={page >= res.last_page} onClick={() => setPage(page + 1)}>Older</button>
        </div>
      )}
    </div>
  );
}
