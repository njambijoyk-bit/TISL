import { useMemo, useState } from 'react';
import { X, Save, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import accessAPI from '../../../../_shared/api/access';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import useAuthStore from '../../../../_shared/store/authStore';
import { input, btn, label, chip, sub, GROUP_ORDER, DAYS, moduleName } from './ui';
import { PAID_MODULES } from '../../../../_shared/navigation/modules';

const sec = { padding: '14px 0', borderTop: '1px solid color-mix(in srgb, var(--color-primary-500) 10%, transparent)' };
const secTitle = { margin: '0 0 4px', fontSize: '0.88rem', fontWeight: 800 };
const check = { display: 'inline-flex', gap: 7, alignItems: 'center', fontSize: '0.82rem', cursor: 'pointer' };

const fromRole = (r) => {
  const rs = r?.restrictions ?? {};
  const mods = r?.modules ?? ['*'];
  return {
    permissions: new Set(r?.permissions ?? []),
    allModules: mods.includes('*') || !r,
    modules: new Set(mods.filter((m) => m !== '*')),
    approvals: Object.fromEntries((r?.approvals ?? []).map((a) => [a.key, { on: true, max: a.max_amount ?? '' }])),
    read_only: !!rs.read_only,
    hoursOn: !!rs.hours, from: rs.hours?.from ?? '08:00', to: rs.hours?.to ?? '18:00', days: new Set(rs.hours?.days ?? [1, 2, 3, 4, 5]),
    ip: (rs.ip_allow ?? []).join('\n'),
    discount: rs.max_discount_percent ?? '',
  };
};

/** Make or change a role: identity, clearance, scope, permissions, modules, approvals and restrictions. */
export default function RoleEditor({ role, template, data, onClose, onSaved }) {
  const base = role ?? template;
  const mine = data.mine.clearance;
  const myPerms = useAuthStore((s) => s.access?.permissions) ?? [];
  const [f, setF] = useState(() => ({
    name: role ? role.name : (template ? `${template.name} (copy)` : ''),
    description: base?.description ?? '',
    min_clearance: base?.min_clearance ?? 1,
    scope_type: base?.scope_type ?? 'assigned',
    data_scope: base?.data_scope ?? 'all',
    module_key: base?.module_key ?? '',
    is_active: role ? role.is_active : true,
    ...fromRole(base),
  }));
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const locked = !!role && mine < 6 && role.min_clearance >= mine;
  const canGive = (key) => mine >= 6 || myPerms.includes(key);
  const levels = data.levels.filter((l) => l.level >= 1 && (mine >= 6 || l.level < mine));

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const by = {};
    data.permissions.filter((p) => !needle || p.label.toLowerCase().includes(needle) || p.key.includes(needle) || p.group_name.toLowerCase().includes(needle)).forEach((p) => { (by[p.group_name] ??= []).push(p); });
    return Object.keys(by).sort((a, b) => (GROUP_ORDER.indexOf(a) + 1 || 99) - (GROUP_ORDER.indexOf(b) + 1 || 99)).map((g) => [g, by[g]]);
  }, [data.permissions, q]);

  const togglePerm = (key, on) => setF((x) => { const s = new Set(x.permissions); if (on) s.add(key); else s.delete(key); return { ...x, permissions: s }; });
  const toggleGroup = (items, on) => setF((x) => { const s = new Set(x.permissions); items.filter((p) => canGive(p.key)).forEach((p) => (on ? s.add(p.key) : s.delete(p.key))); return { ...x, permissions: s }; });
  const toggleSet = (k, v, on) => setF((x) => { const s = new Set(x[k]); if (on) s.add(v); else s.delete(v); return { ...x, [k]: s }; });

  const payload = () => {
    const restrictions = {};
    if (f.read_only) restrictions.read_only = true;
    if (f.hoursOn) restrictions.hours = { from: f.from, to: f.to, days: [...f.days].sort() };
    const ips = f.ip.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
    if (ips.length) restrictions.ip_allow = ips;
    if (f.discount !== '' && f.discount !== null) restrictions.max_discount_percent = Number(f.discount);
    return {
      name: f.name.trim(), description: f.description.trim() || null, min_clearance: Number(f.min_clearance), scope_type: f.scope_type, data_scope: f.data_scope,
      module_key: f.module_key || null, is_active: f.is_active,
      permissions: [...f.permissions], modules: f.allModules ? ['*'] : [...f.modules],
      approvals: Object.entries(f.approvals).filter(([, a]) => a.on).map(([key, a]) => ({ key, max_amount: a.max === '' || a.max === null ? null : Number(a.max) })),
      restrictions: Object.keys(restrictions).length ? restrictions : null,
    };
  };

  const save = async () => {
    setBusy(true);
    try {
      const res = role ? await accessAPI.updateRole(role.id, payload()) : await accessAPI.createRole(payload());
      toast.success(res.message);
      onSaved();
    } catch (e) {
      const errs = e.response?.data?.errors;
      toast.error(errs ? Object.values(errs)[0][0] : errMsg(e, 'Could not save the role'));
    } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!window.confirm(`Delete the role “${role.name}”? This can not be undone.`)) return;
    setBusy(true);
    try { const res = await accessAPI.deleteRole(role.id); toast.success(res.message); onSaved(); } catch (e) { toast.error(errMsg(e, 'Could not delete it')); } finally { setBusy(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', justifyContent: 'flex-end', background: 'rgba(0,0,0,0.35)' }} onClick={onClose}>
      <aside onClick={(e) => e.stopPropagation()} role="dialog" aria-label={role ? `Edit ${role.name}` : 'New role'}
        style={{ width: 'min(760px, 100%)', height: '100%', overflowY: 'auto', background: 'var(--surface-card, #fff)', color: 'var(--text-primary)', padding: 20, boxShadow: '-8px 0 30px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>{role ? `Edit ${role.name}` : 'New role'}</h2>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={20} /></button>
        </div>
        {locked && <p style={{ ...sub, marginTop: 10, padding: '8px 10px', borderRadius: 8, background: 'color-mix(in srgb, #d97706 10%, transparent)' }}>This role is at or above your own clearance, so you can look at it but not change it.</p>}
        {role?.is_system && <p style={{ ...sub, marginTop: 10 }}>This is a built-in role. You can adjust it; its name key stays the same so the rest of the system keeps recognising it.</p>}

        <fieldset disabled={locked || busy} style={{ border: 'none', padding: 0, margin: 0, minWidth: 0 }}>
          <div style={{ ...sec, borderTop: 'none' }}>
            <h3 style={secTitle}>Who it is</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
              <div><label style={label}>Name</label><input style={input} value={f.name} maxLength={100} onChange={(e) => set('name', e.target.value)} placeholder="For example: Librarian" /></div>
              <div><label style={label}>Needs clearance</label>
                <select style={input} value={f.min_clearance} onChange={(e) => set('min_clearance', Number(e.target.value))}>
                  {levels.map((l) => <option key={l.level} value={l.level}>{l.level} · {l.name}</option>)}
                </select></div>
            </div>
            <label style={{ ...label, marginTop: 10 }}>What this role is for</label>
            <input style={input} value={f.description} maxLength={255} onChange={(e) => set('description', e.target.value)} />
            <label style={{ ...check, marginTop: 10 }}><input type="checkbox" checked={f.is_active} onChange={(e) => set('is_active', e.target.checked)} /> The role is on (switch it off to stop it counting without deleting it)</label>
          </div>

          <div style={sec}>
            <h3 style={secTitle}>Where and which records</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div><label style={label}>Branches</label>
                <select style={input} value={f.scope_type} onChange={(e) => set('scope_type', e.target.value)}>
                  <option value="assigned">Only their branches</option><option value="global">Every branch</option>
                </select></div>
              <div><label style={label}>Records inside a branch</label>
                <select style={input} value={f.data_scope} onChange={(e) => set('data_scope', e.target.value)}>
                  <option value="all">All records</option><option value="assigned">Assigned to them</option><option value="own">Only their own</option>
                </select></div>
              <div><label style={label}>Belongs to module</label>
                <select style={input} value={f.module_key} onChange={(e) => set('module_key', e.target.value)}>
                  <option value="">Core (always shown)</option>
                  {PAID_MODULES.map((m) => <option key={m} value={m}>{moduleName(m)}</option>)}
                </select></div>
            </div>
            <p style={{ ...sub, margin: '8px 0 0' }}>&ldquo;Every branch&rdquo; means this role is never held back by branch limits. A role that belongs to a module is only offered while that module is on.</p>
          </div>

          <div style={sec}>
            <h3 style={secTitle}>What it can do</h3>
            <p style={sub}>Tick what this role may do. {mine < 6 && 'You can only give what you can do yourself; the rest is greyed out.'}</p>
            <input style={{ ...input, marginBottom: 10 }} placeholder="Find a permission…" value={q} onChange={(e) => setQ(e.target.value)} />
            {groups.map(([g, items]) => {
              const all = items.filter((p) => canGive(p.key)).every((p) => f.permissions.has(p.key));
              return (
                <div key={g} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <strong style={{ fontSize: '0.8rem' }}>{g}</strong>
                    <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary-600)', fontSize: '0.72rem', fontWeight: 700 }} onClick={() => toggleGroup(items, !all)}>{all ? 'None' : 'All'}</button>
                  </div>
                  {items.map((p) => (
                    <label key={p.key} style={{ ...check, display: 'flex', padding: '3px 0', opacity: canGive(p.key) ? 1 : 0.45 }} title={p.key}>
                      <input type="checkbox" checked={f.permissions.has(p.key)} disabled={!canGive(p.key)} onChange={(e) => togglePerm(p.key, e.target.checked)} />
                      <span style={{ flex: 1 }}>{p.label}</span>
                      {p.module_key && <span style={chip('#7c3aed')}>{moduleName(p.module_key)}</span>}
                      {!!p.is_write && <span style={chip('#6b7280')}>changes data</span>}
                    </label>
                  ))}
                </div>
              );
            })}
          </div>

          <div style={sec}>
            <h3 style={secTitle}>Modules it may open</h3>
            <label style={check}><input type="checkbox" checked={f.allModules} onChange={(e) => set('allModules', e.target.checked)} /> Every module</label>
            {!f.allModules && (
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 8 }}>
                {PAID_MODULES.map((m) => <label key={m} style={check}><input type="checkbox" checked={f.modules.has(m)} onChange={(e) => toggleSet('modules', m, e.target.checked)} /> {moduleName(m)}</label>)}
              </div>
            )}
            <p style={{ ...sub, margin: '8px 0 0' }}>A module that is switched off for the business never opens, whatever the role says.</p>
          </div>

          <div style={sec}>
            <h3 style={secTitle}>What it may approve</h3>
            {Object.entries(data.approvals).map(([key, text]) => {
              const a = f.approvals[key] ?? { on: false, max: '' };
              const setA = (patch) => set('approvals', { ...f.approvals, [key]: { ...a, ...patch } });
              return (
                <div key={key} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '4px 0', flexWrap: 'wrap' }}>
                  <label style={{ ...check, minWidth: 190 }}><input type="checkbox" checked={a.on} onChange={(e) => setA({ on: e.target.checked })} /> {text}</label>
                  {a.on && (
                    <>
                      <label style={check}><input type="radio" checked={a.max === '' || a.max === null} onChange={() => setA({ max: '' })} /> No limit</label>
                      <label style={check}><input type="radio" checked={a.max !== '' && a.max !== null} onChange={() => setA({ max: 0 })} /> Up to
                        <input type="number" min="0" step="any" style={{ ...input, width: 120 }} value={a.max} disabled={a.max === '' || a.max === null} onChange={(e) => setA({ max: e.target.value })} /> in the base currency</label>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          <div style={sec}>
            <h3 style={secTitle}>Limits</h3>
            <label style={check}><input type="checkbox" checked={f.read_only} onChange={(e) => set('read_only', e.target.checked)} /> Read only: can look, can not change anything</label>
            <div style={{ marginTop: 10 }}>
              <label style={check}><input type="checkbox" checked={f.hoursOn} onChange={(e) => set('hoursOn', e.target.checked)} /> Only at certain times</label>
              {f.hoursOn && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                  <input type="time" style={{ ...input, width: 120 }} value={f.from} onChange={(e) => set('from', e.target.value)} aria-label="From" /> to
                  <input type="time" style={{ ...input, width: 120 }} value={f.to} onChange={(e) => set('to', e.target.value)} aria-label="To" />
                  <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                    {DAYS.map(([n, t]) => <label key={n} style={check}><input type="checkbox" checked={f.days.has(n)} onChange={(e) => toggleSet('days', n, e.target.checked)} /> {t}</label>)}
                  </span>
                </div>
              )}
              {f.hoursOn && <p style={{ ...sub, margin: '6px 0 0' }}>A shift that runs past midnight works: set 22:00 to 06:00.</p>}
            </div>
            <div style={{ marginTop: 10 }}>
              <label style={label}>Only from these addresses (one per line, ranges like 10.0.0.0/8 work; blank = anywhere)</label>
              <textarea style={{ ...input, minHeight: 60 }} value={f.ip} onChange={(e) => set('ip', e.target.value)} />
            </div>
            <div style={{ marginTop: 10, maxWidth: 240 }}>
              <label style={label}>Biggest discount they may give (%)</label>
              <input type="number" min="0" max="100" step="any" style={input} value={f.discount} onChange={(e) => set('discount', e.target.value)} placeholder="No limit" />
            </div>
          </div>
        </fieldset>

        <div style={{ ...sec, display: 'flex', gap: 10, alignItems: 'center', position: 'sticky', bottom: -20, background: 'var(--surface-card, #fff)', paddingBottom: 14 }}>
          <button type="button" style={btn(true)} disabled={busy || locked || !f.name.trim()} onClick={save}><Save size={14} /> {role ? 'Save role' : 'Make role'}</button>
          <button type="button" style={btn(false)} onClick={onClose}>Cancel</button>
          {role && !role.is_system && <button type="button" style={{ ...btn(false, true), marginLeft: 'auto' }} disabled={busy || locked} onClick={remove}><Trash2 size={14} /> Delete</button>}
        </div>
      </aside>
    </div>
  );
}
