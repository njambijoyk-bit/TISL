import { useCallback, useEffect, useState } from 'react';
import { X, Trash2, Plus, Save, Ban } from 'lucide-react';
import toast from 'react-hot-toast';
import accessAPI from '../../../../_shared/api/access';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { input, btn, label, chip, when, sub } from './ui';

const block = { padding: '14px 0', borderTop: '1px solid color-mix(in srgb, var(--color-primary-500) 10%, transparent)' };
const title = { margin: '0 0 8px', fontSize: '0.85rem', fontWeight: 800 };

/** One person: main role and extra roles (staged, saved together with their stations), read-only clearance, default branch, branch access with dates, and what that adds up to. */
export default function PersonPanel({ id, data, onClose, onChanged }) {
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  const [mainRole, setMainRole] = useState('');
  const [extraIds, setExtraIds] = useState([]);
  const [stationIds, setStationIds] = useState([]);
  const [stationDefault, setStationDefault] = useState(null);
  const [branch, setBranch] = useState('');
  const [grant, setGrant] = useState({ resource_id: '', access: 'full', starts_at: '', expires_at: '', reason: '' });

  const mine = data.mine.clearance;
  const staffRoles = data.roles.filter((r) => r.kind === 'staff' && r.is_active);
  const giveable = (r) => mine >= 6 || r.min_clearance < mine;
  const permLabel = Object.fromEntries(data.permissions.map((p) => [p.key, p.label]));

  const apply = useCallback((res) => {
    setD(res);
    setMainRole(String(staffRoles.find((r) => r.key === res.user.role)?.id ?? ''));
    setExtraIds(res.roles.filter((r) => !r.primary).map((r) => r.role_id));
    setStationIds(res.stations?.ids ?? []);
    setStationDefault(res.stations?.default ?? null);
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
  const manageable = d.manageable !== false;
  const off = !manageable || busy;
  const eff = d.effective;

  const savedMain = String(staffRoles.find((r) => r.key === u.role)?.id ?? '');
  const stagedMain = staffRoles.find((r) => String(r.id) === mainRole);
  const savedExtra = d.roles.filter((r) => !r.primary).map((r) => r.role_id);
  const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
  const st = d.stations;
  const sells = [stagedMain, ...extraIds.map((rid) => staffRoles.find((r) => r.id === rid))].some((r) => r?.permissions?.some((k) => k.startsWith('pos.')));
  const showStations = !!st && (sells || st.ids.length > 0);
  const stationsDirty = !!st && (!sameSet(stationIds, st.ids) || (stationIds.length > 0 && (stationDefault ?? null) !== (st.default ?? null)));
  const dirty = mainRole !== savedMain || !sameSet(extraIds, savedExtra) || stationsDirty;

  const reset = () => apply(d);
  const save = () => run(() => accessAPI.saveAccess(u.id, {
    role_id: mainRole ? Number(mainRole) : undefined,
    extra_role_ids: extraIds,
    stations: stationsDirty ? { ids: stationIds, default: stationDefault } : undefined,
  }), 'Changes saved');
  const close = () => { if (!dirty || window.confirm('You have unsaved changes. Leave without saving?')) onClose(); };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', justifyContent: 'flex-end', background: 'rgba(0,0,0,0.35)' }} onClick={close}>
      <aside
        onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Access for ${u.name}`}
        style={{ width: 'min(520px, 100%)', height: '100%', overflowY: 'auto', background: 'var(--surface-card, #fff)', color: 'var(--text-primary)', padding: 20, boxShadow: '-8px 0 30px rgba(0,0,0,0.2)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>{u.name}</h2>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{u.email}</div>
          </div>
          <button type="button" onClick={close} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={20} /></button>
        </div>
        {!manageable && <p style={{ ...sub, padding: '8px 10px', borderRadius: 8, background: 'color-mix(in srgb, #d97706 10%, transparent)' }}>You can look at this person but not change them: only people with a lower clearance than yours can be changed.</p>}

        <div style={block}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
            <h3 style={{ ...title, margin: 0 }}>Roles and clearance</h3>
            {dirty && <span style={chip('#d97706')} role="status">Unsaved changes</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={label}>Main role</label>
              <select style={input} value={mainRole} disabled={off} onChange={(e) => { setMainRole(e.target.value); setExtraIds(extraIds.filter((x) => String(x) !== e.target.value)); }}>
                {staffRoles.map((r) => <option key={r.id} value={r.id} disabled={!giveable(r) && r.key !== u.role}>{r.name} (level {r.min_clearance})</option>)}
              </select>
            </div>
            <div>
              <label style={label}>Clearance</label>
              <div style={{ ...input, opacity: 0.8, cursor: 'not-allowed' }} aria-label="Clearance (view only)" title="Worked out from the main role. It cannot be typed here.">
                {u.clearance_level} · {data.levels.find((l) => l.level === u.clearance_level)?.name ?? ''}
              </div>
            </div>
          </div>
          <p style={{ ...sub, margin: '8px 0 12px' }}>Clearance follows the main role and is shown here for reading only.{mainRole !== savedMain && stagedMain ? ` After saving it becomes level ${stagedMain.min_clearance}.` : ''}</p>

          <label style={label}>Extra roles</label>
          {extraIds.length === 0 && <p style={sub}>None. The main role is all they hold.</p>}
          {extraIds.map((rid) => {
            const r = staffRoles.find((x) => x.id === rid) ?? { id: rid, name: `Role ${rid}` };
            const held = d.roles.find((x) => x.role_id === rid);
            return (
              <div key={rid} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0' }}>
                <strong style={{ fontSize: '0.85rem' }}>{r.name}</strong>
                {held && <span style={chip(held.in_force ? '#16a34a' : '#9ca3af')}>{held.in_force ? 'In force' : 'Not in force'}</span>}
                {!held && <span style={chip('#d97706')}>New</span>}
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', flex: 1 }}>
                  {held ? `${held.starts_at ? `from ${when(held.starts_at)} ` : ''}${held.expires_at ? `until ${when(held.expires_at)}` : 'for good'}` : ''}
                </span>
                <button type="button" aria-label={`Take away ${r.name}`} disabled={off} onClick={() => setExtraIds(extraIds.filter((x) => x !== rid))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}><Trash2 size={15} /></button>
              </div>
            );
          })}
          <select style={{ ...input, marginTop: 8 }} value="" disabled={off} onChange={(e) => e.target.value && setExtraIds([...extraIds, Number(e.target.value)])} aria-label="Role to give">
            <option value="">Give another role…</option>
            {staffRoles.filter((r) => giveable(r) && String(r.id) !== mainRole && !extraIds.includes(r.id)).map((r) => <option key={r.id} value={r.id}>{r.name} (level {r.min_clearance})</option>)}
          </select>
          <p style={{ ...sub, margin: '8px 0 0' }}>An extra role only counts while the person&apos;s clearance is at least the role&apos;s level.</p>

          {showStations && (
            <div style={{ marginTop: 14 }}>
              <label style={label}>Stations (point of sale)</label>
              {st.choices.length === 0
                ? <p style={sub}>No station exists yet at the branches this person may use. Add stations under Point of sale → Stations.</p>
                : (
                  <>
                    {st.choices.map((c) => (
                      <label key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0', fontSize: '0.82rem' }}>
                        <input type="checkbox" disabled={off} checked={stationIds.includes(c.id)}
                          onChange={(e) => {
                            const next = e.target.checked ? [...stationIds, c.id] : stationIds.filter((x) => x !== c.id);
                            setStationIds(next);
                            if (!next.includes(stationDefault)) setStationDefault(next.length === 1 ? next[0] : null);
                          }} />
                        <span style={{ flex: 1 }}>{c.name} <span style={{ color: 'var(--text-secondary)' }}>· {c.location}{c.is_branch_default ? ' · branch default' : ''}</span></span>
                      </label>
                    ))}
                    <label style={{ ...label, marginTop: 8 }}>Their usual station</label>
                    <select style={input} value={stationDefault ?? ''} disabled={off || stationIds.length === 0} onChange={(e) => setStationDefault(e.target.value ? Number(e.target.value) : null)}>
                      <option value="">The branch default</option>
                      {st.choices.filter((c) => stationIds.includes(c.id)).map((c) => <option key={c.id} value={c.id}>{c.name} · {c.location}</option>)}
                    </select>
                  </>
                )}
              <p style={{ ...sub, margin: '8px 0 0' }}>They can sell from any station of their branches. With none chosen, the branch default is used.</p>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="button" style={btn(true)} disabled={off || !dirty} onClick={save}><Save size={14} /> Save changes</button>
            {dirty && <button type="button" style={btn(false)} disabled={busy} onClick={reset}>Discard</button>}
          </div>
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

          <h4 style={{ ...title, marginTop: 14, fontSize: '0.78rem' }}>Extra branch and cost centre access</h4>
          {d.grants.length === 0 && <p style={sub}>None. Give access to another branch or to a cost centre (with everything under it), for a while or for good.</p>}
          {d.grants.map((g) => (
            <div key={g.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', flexWrap: 'wrap', opacity: g.status === 'revoked' ? 0.55 : 1 }}>
              <strong style={{ fontSize: '0.85rem' }}>{g.name ?? `${g.resource_type === 'cost_centre' ? 'Cost centre' : 'Branch'} ${g.resource_id}`}</strong>
              {g.resource_type === 'cost_centre' && <span style={chip('#6366f1')}>Cost centre</span>}
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
            <select style={input} value={grant.resource_id} disabled={off} onChange={(e) => setGrant({ ...grant, resource_id: e.target.value })} aria-label="Branch or cost centre">
              <option value="">Give access to…</option>
              <optgroup label="Branches">{data.locations.map((l) => <option key={`l${l.id}`} value={`location:${l.id}`}>{l.name}</option>)}</optgroup>
              {(data.cost_centres ?? []).length > 0 && <optgroup label="Cost centres">{data.cost_centres.map((c) => <option key={`c${c.id}`} value={`cost_centre:${c.id}`}>{c.name}</option>)}</optgroup>}
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
            onClick={() => run(() => accessAPI.addGrant(u.id, { resource_type: grant.resource_id.split(':')[0], resource_id: Number(grant.resource_id.split(':')[1]), access: grant.access, starts_at: grant.starts_at || null, expires_at: grant.expires_at || null, reason: grant.reason || null })
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
