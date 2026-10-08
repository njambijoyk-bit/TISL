import { useCallback, useEffect, useState } from 'react';
import { X, Trash2, Plus, Save, Ban } from 'lucide-react';
import toast from 'react-hot-toast';
import accessAPI from '../../../../_shared/api/access';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { input, btn, label, chip, when, sub } from './ui';

const block = { padding: '14px 0', borderTop: '1px solid color-mix(in srgb, var(--color-primary-500) 10%, transparent)' };
const title = { margin: '0 0 8px', fontSize: '0.85rem', fontWeight: 800 };

/** One person: clearance, main role, extra roles with dates, default branch, branch access with dates, and what that adds up to. */
export default function PersonPanel({ id, data, onClose, onChanged }) {
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  const [level, setLevel] = useState(0);
  const [mainRole, setMainRole] = useState('');
  const [branch, setBranch] = useState('');
  const [extra, setExtra] = useState({ role_id: '', starts_at: '', expires_at: '' });
  const [grant, setGrant] = useState({ resource_id: '', access: 'full', starts_at: '', expires_at: '', reason: '' });

  const mine = data.mine.clearance;
  const staffRoles = data.roles.filter((r) => r.kind === 'staff' && r.is_active);
  const giveable = (r) => mine >= 6 || r.min_clearance < mine;
  const permLabel = Object.fromEntries(data.permissions.map((p) => [p.key, p.label]));

  const apply = useCallback((res) => {
    setD(res);
    setLevel(res.user.clearance_level);
    setMainRole(String(staffRoles.find((r) => r.key === res.user.role)?.id ?? ''));
    setBranch(res.user.default_location_id ? String(res.user.default_location_id) : '');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.roles]);

  useEffect(() => {
    accessAPI.user(id).then(apply).catch((e) => { toast.error(errMsg(e, 'Could not load this person')); onClose(); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const run = async (fn, okText) => {
    setBusy(true);
    try { const res = await fn(); apply(res); toast.success(res.message ?? okText); onChanged(); } catch (e) { toast.error(errMsg(e, 'Could not save')); } finally { setBusy(false); }
  };

  if (!d) return null;
  const u = d.user;
  const levelOptions = data.levels.filter((l) => mine >= 6 || l.level < mine);
  const manageable = d.manageable !== false;
  const off = !manageable || busy;
  const eff = d.effective;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', justifyContent: 'flex-end', background: 'rgba(0,0,0,0.35)' }} onClick={onClose}>
      <aside
        onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Access for ${u.name}`}
        style={{ width: 'min(520px, 100%)', height: '100%', overflowY: 'auto', background: 'var(--surface-card, #fff)', color: 'var(--text-primary)', padding: 20, boxShadow: '-8px 0 30px rgba(0,0,0,0.2)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>{u.name}</h2>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{u.email}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={20} /></button>
        </div>
        {!manageable && <p style={{ ...sub, padding: '8px 10px', borderRadius: 8, background: 'color-mix(in srgb, #d97706 10%, transparent)' }}>You can look at this person but not change them: only people with a lower clearance than yours can be changed.</p>}

        <div style={block}>
          <h3 style={title}>Main role and clearance</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={label}>Main role</label>
              <select style={input} value={mainRole} disabled={off} onChange={(e) => setMainRole(e.target.value)}>
                {staffRoles.map((r) => <option key={r.id} value={r.id} disabled={!giveable(r) && r.key !== u.role}>{r.name} (level {r.min_clearance})</option>)}
              </select>
              <button type="button" style={{ ...btn(false), marginTop: 8 }} disabled={off || String(staffRoles.find((r) => r.key === u.role)?.id) === mainRole}
                onClick={() => run(() => accessAPI.setPrimaryRole(u.id, Number(mainRole)), 'Main role saved')}><Save size={14} /> Change role</button>
            </div>
            <div>
              <label style={label}>Clearance</label>
              <select style={input} value={level} disabled={off} onChange={(e) => setLevel(Number(e.target.value))}>
                {levelOptions.map((l) => <option key={l.level} value={l.level}>{l.level} · {l.name}</option>)}
              </select>
              <button type="button" style={{ ...btn(false), marginTop: 8 }} disabled={off || level === u.clearance_level}
                onClick={() => run(() => accessAPI.setClearance(u.id, level), 'Clearance saved')}><Save size={14} /> Change clearance</button>
            </div>
          </div>
          <p style={{ ...sub, margin: '8px 0 0' }}>Changing the main role sets the clearance to that role&apos;s level. Raise it afterwards if this person should hold more roles.</p>
        </div>

        <div style={block}>
          <h3 style={title}>Extra roles</h3>
          {d.roles.filter((r) => !r.primary).length === 0 && <p style={sub}>None. The main role is all they hold.</p>}
          {d.roles.filter((r) => !r.primary).map((r) => (
            <div key={r.role_id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0' }}>
              <strong style={{ fontSize: '0.85rem' }}>{r.name}</strong>
              <span style={chip(r.in_force ? '#16a34a' : '#9ca3af')}>{r.in_force ? 'In force' : 'Not in force'}</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', flex: 1 }}>
                {r.starts_at ? `from ${when(r.starts_at)} ` : ''}{r.expires_at ? `until ${when(r.expires_at)}` : 'for good'}
              </span>
              <button type="button" aria-label={`Take away ${r.name}`} disabled={off} onClick={() => run(() => accessAPI.removeRole(u.id, r.role_id), 'Role taken away')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}><Trash2 size={15} /></button>
            </div>
          ))}
          <select style={{ ...input, marginTop: 8 }} value={extra.role_id} disabled={off} onChange={(e) => setExtra({ ...extra, role_id: e.target.value })} aria-label="Role to give">
            <option value="">Give another role…</option>
            {staffRoles.filter((r) => giveable(r) && r.key !== u.role && !d.roles.some((x) => x.role_id === r.id)).map((r) => <option key={r.id} value={r.id}>{r.name} (level {r.min_clearance})</option>)}
          </select>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 8, marginTop: 8 }}>
            <div><label style={label}>From (optional)</label><input type="datetime-local" style={input} value={extra.starts_at} disabled={off} onChange={(e) => setExtra({ ...extra, starts_at: e.target.value })} /></div>
            <div><label style={label}>Until (blank = for good)</label><input type="datetime-local" style={input} value={extra.expires_at} disabled={off} onChange={(e) => setExtra({ ...extra, expires_at: e.target.value })} /></div>
          </div>
          <button type="button" style={{ ...btn(true), marginTop: 8 }} disabled={off || !extra.role_id}
            onClick={() => run(() => accessAPI.addRole(u.id, { role_id: Number(extra.role_id), starts_at: extra.starts_at || null, expires_at: extra.expires_at || null }).then((r) => { setExtra({ role_id: '', starts_at: '', expires_at: '' }); return r; }), 'Role given')}><Plus size={14} /> Give role</button>
          <p style={{ ...sub, margin: '8px 0 0' }}>An extra role only counts while the person&apos;s clearance is at least the role&apos;s level. Leave &ldquo;until&rdquo; blank to give it for good.</p>
        </div>

        <div style={block}>
          <h3 style={title}>Branches</h3>
          {eff.scope.global
            ? <p style={sub}>This person&apos;s role is <strong>not bound by branches</strong>: they can use every branch.</p>
            : eff.scope.open
              ? <p style={sub}>No branch is set, so for now they can use <strong>every</strong> branch. Set a default branch to limit them.</p>
              : null}
          <label style={label}>Default branch</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <select style={input} value={branch} disabled={off} onChange={(e) => setBranch(e.target.value)}>
              <option value="">None</option>
              {data.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <button type="button" style={btn(false)} disabled={off || String(u.default_location_id ?? '') === branch}
              onClick={() => run(() => accessAPI.setDefaultLocation(u.id, branch ? Number(branch) : null), 'Default branch saved')}><Save size={14} /> Save</button>
          </div>

          <h4 style={{ ...title, marginTop: 14, fontSize: '0.78rem' }}>Extra branch access</h4>
          {d.grants.length === 0 && <p style={sub}>None. Give access to another branch, for a while or for good.</p>}
          {d.grants.map((g) => (
            <div key={g.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', flexWrap: 'wrap', opacity: g.status === 'revoked' ? 0.55 : 1 }}>
              <strong style={{ fontSize: '0.85rem' }}>{g.name ?? `Branch ${g.resource_id}`}</strong>
              <span style={chip()}>{g.access === 'full' ? 'Full' : 'View only'}</span>
              <span style={chip(g.status === 'revoked' ? '#9ca3af' : g.in_force ? '#16a34a' : '#d97706')}>{g.status === 'revoked' ? 'Taken away' : g.in_force ? 'In force' : 'Not in force'}</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', flex: 1 }}>
                {g.starts_at ? `from ${when(g.starts_at)} ` : ''}{g.expires_at ? `until ${when(g.expires_at)}` : 'for good'}{g.reason ? ` · ${g.reason}` : ''}
              </span>
              {g.status !== 'revoked' && (
                <button type="button" aria-label="Take away this access" disabled={off} onClick={() => run(() => accessAPI.revokeGrant(u.id, g.id), 'Access taken away')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}><Ban size={15} /></button>
              )}
            </div>
          ))}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.2fr) minmax(0,0.8fr)', gap: 8, marginTop: 8 }}>
            <select style={input} value={grant.resource_id} disabled={off} onChange={(e) => setGrant({ ...grant, resource_id: e.target.value })} aria-label="Branch">
              <option value="">Give access to a branch…</option>
              {data.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <select style={input} value={grant.access} disabled={off} onChange={(e) => setGrant({ ...grant, access: e.target.value })} aria-label="Kind of access">
              <option value="full">Full access</option>
              <option value="view">View only</option>
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 8, marginTop: 8 }}>
            <div><label style={label}>From (optional)</label><input type="datetime-local" style={input} value={grant.starts_at} disabled={off} onChange={(e) => setGrant({ ...grant, starts_at: e.target.value })} /></div>
            <div><label style={label}>Until (blank = for good)</label><input type="datetime-local" style={input} value={grant.expires_at} disabled={off} onChange={(e) => setGrant({ ...grant, expires_at: e.target.value })} /></div>
          </div>
          <input style={{ ...input, marginTop: 8 }} placeholder="Why? (for example: covering the stock take)" maxLength={255} value={grant.reason} disabled={off} onChange={(e) => setGrant({ ...grant, reason: e.target.value })} />
          <button type="button" style={{ ...btn(true), marginTop: 8 }} disabled={off || !grant.resource_id}
            onClick={() => run(() => accessAPI.addGrant(u.id, { resource_type: 'location', resource_id: Number(grant.resource_id), access: grant.access, starts_at: grant.starts_at || null, expires_at: grant.expires_at || null, reason: grant.reason || null })
              .then((r) => { setGrant({ resource_id: '', access: 'full', starts_at: '', expires_at: '', reason: '' }); return r; }), 'Access given')}><Plus size={14} /> Give access</button>
        </div>

        <div style={block}>
          <h3 style={title}>What this adds up to</h3>
          <p style={sub}>
            Clearance <strong>{eff.clearance} · {eff.clearance_name}</strong>. Roles in force: {eff.roles.map((r) => r.name).join(', ') || 'none'}.
            Sees records: <strong>{eff.data_scope === 'all' ? 'all' : eff.data_scope === 'assigned' ? 'assigned to them' : 'their own'}</strong>.
          </p>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {eff.permissions.length === 0 && <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>No permissions.</span>}
            {eff.permissions.map((k) => <span key={k} style={chip()} title={k}>{permLabel[k] ?? k}</span>)}
          </div>
        </div>
      </aside>
    </div>
  );
}
