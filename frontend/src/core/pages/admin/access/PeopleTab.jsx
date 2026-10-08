import { useEffect, useState } from 'react';
import { Search, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import accessAPI from '../../../../_shared/api/access';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { card, input, btn, h2, sub, th, td, chip } from './ui';
import PersonPanel from './PersonPanel';

/** Staff accounts: main role, clearance, default branch, and how many extra roles and branch grants each holds. Open one to change them. */
export default function PeopleTab({ data, reload }) {
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const [res, setRes] = useState(null);
  const [openId, setOpenId] = useState(null);
  const levelName = (n) => data.levels.find((l) => l.level === n)?.name ?? `Level ${n}`;

  const load = () => accessAPI.people({ q: q || undefined, role: role || undefined, page }).then(setRes).catch((e) => toast.error(errMsg(e, 'Could not load people')));
  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, role, page]);

  return (
    <div style={card}>
      <h2 style={h2}>People</h2>
      <p style={sub}>Staff accounts. Customers, vendors and applicants only ever see their own things and are not listed here.</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--text-tertiary)' }} />
          <input style={{ ...input, paddingLeft: 30 }} placeholder="Search by name or email…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        </div>
        <select style={{ ...input, width: 220 }} value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }} aria-label="Role">
          <option value="">Any role</option>
          {data.roles.filter((r) => r.kind === 'staff' && r.is_active).map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
        </select>
      </div>

      {!res ? <p style={sub}>Loading…</p> : res.data.length === 0 ? <p style={sub}>No one matches.</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>Person</th><th style={th}>Main role</th><th style={th}>Clearance</th><th style={th}>Default branch</th><th style={th}>Extra roles</th><th style={th}>Branch access</th><th style={th} /></tr></thead>
            <tbody>
              {res.data.map((p) => (
                <tr key={p.id} onClick={() => setOpenId(p.id)} style={{ cursor: 'pointer' }}>
                  <td style={td}><div style={{ fontWeight: 700 }}>{p.name}</div><div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>{p.email}</div></td>
                  <td style={td}>{p.role_name}</td>
                  <td style={td}><span style={chip()}>{p.clearance_level}</span> <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{levelName(p.clearance_level)}</span></td>
                  <td style={td}>{p.default_location ?? <span style={{ color: 'var(--text-tertiary)' }}>None</span>}</td>
                  <td style={td}>{p.extra_roles || <span style={{ color: 'var(--text-tertiary)' }}>—</span>}</td>
                  <td style={td}>{p.grants || <span style={{ color: 'var(--text-tertiary)' }}>—</span>}</td>
                  <td style={td}><ChevronRight size={16} color="var(--text-tertiary)" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {res && res.last_page > 1 && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12 }}>
          <button type="button" style={btn(false)} disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Page {res.current_page} of {res.last_page}</span>
          <button type="button" style={btn(false)} disabled={page >= res.last_page} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}

      {openId && <PersonPanel id={openId} data={data} onClose={() => setOpenId(null)} onChanged={() => { load(); reload(); }} />}
    </div>
  );
}
