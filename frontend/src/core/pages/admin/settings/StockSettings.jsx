import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PackageX, Save, RefreshCw, Trash2, Plus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import SettingsLayout from '../../../../_shared/components/layout/SettingsLayout';
import stockSettingsAPI from '../../../../_shared/api/stockSettings';
import { errMsg } from '../../../../_shared/store/helpers/apiState';

/**
 * Settings → Stock & expiry. What customers see of expired goods, whether they can be sold,
 * what happens when a batch expires, when to warn, and in what order stock is picked.
 * A category or a single product can have its own exceptions to some of these.
 */

const card = {
  background: 'var(--surface-card, #fff)', borderRadius: 12, padding: 20, marginBottom: 16,
  border: '1px solid color-mix(in srgb, var(--color-primary-500) 10%, transparent)',
  boxShadow: '0 2px 12px color-mix(in srgb, var(--color-primary-500) 6%, transparent)',
};
const input = {
  width: '100%', padding: '8px 11px', borderRadius: 8, fontSize: '0.82rem', color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  background: 'var(--surface-input, color-mix(in srgb, var(--color-primary-500) 4%, transparent))',
  border: '1.5px solid color-mix(in srgb, var(--color-primary-500) 18%, transparent)',
};
const label = { fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-primary-600)', display: 'block', marginBottom: 5 };
const btn = (primary) => ({
  display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 15px', borderRadius: 9, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, fontFamily: 'inherit',
  border: primary ? 'none' : '1.5px solid color-mix(in srgb, var(--color-primary-500) 25%, transparent)',
  background: primary ? 'var(--color-primary-500)' : 'transparent', color: primary ? 'white' : 'var(--color-primary-600)',
});
const h2 = { margin: '0 0 4px', fontSize: '0.95rem', fontWeight: 800 };
const sub = { margin: '0 0 14px', fontSize: '0.78rem', color: 'var(--text-secondary)' };

const SELL = [
  ['never', 'Never', 'An expired batch can not be sold, ever.'],
  ['override', 'Only with an override', 'Someone with the right role can sell it, with a reason. It is logged.'],
  ['allowed', 'Allowed', 'Expired stock sells like any other. A warning is shown.'],
];
const ACTION = [
  ['list', 'Block it and list it', 'It goes to the expired-stock list for someone to decide: return to the supplier or write it off.'],
  ['write_off', 'Write it off automatically', 'After a number of days it is written off as a stock loss.'],
];

function Radio({ value, current, onChange, title, hint }) {
  return (
    <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0', cursor: 'pointer' }}>
      <input type="radio" checked={current === value} onChange={() => onChange(value)} style={{ marginTop: 3 }} />
      <span><span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{title}</span><span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{hint}</span></span>
    </label>
  );
}

/** Who may do these things is a permission, given to roles in Roles & access (roles are made there, so no role names are listed here). */
function PermissionNote({ permission, children }) {
  return (
    <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '8px 0 0' }}>
      {children} Give the permission <strong>{permission}</strong> to the roles that should have it, in <Link to="/admin/access" style={{ color: 'var(--color-primary-600)' }}>Roles &amp; access</Link>.
    </p>
  );
}

const daysText = (a) => (a ?? []).join(', ');
const parseDays = (t) => [...new Set(String(t).split(/[\s,]+/).map((x) => parseInt(x, 10)).filter((n) => n > 0))].sort((a, b) => b - a);

/** The settings an exception can change, each with "use the shop-wide rule" as the blank choice. */
function OverrideFields({ value, onChange, defaults }) {
  const v = value ?? {};
  const set = (k, x) => onChange({ ...v, [k]: x });
  const sel = (k, opts) => (
    <select value={v[k] ?? ''} onChange={(e) => set(k, e.target.value === '' ? null : e.target.value)} style={input}>
      <option value="">Same as shop-wide</option>
      {opts.map(([val, text]) => <option key={val} value={val}>{text}</option>)}
    </select>
  );
  const num = (k) => <input type="number" min="0" value={v[k] ?? ''} placeholder={`Same as shop-wide (${defaults[k]})`} onChange={(e) => set(k, e.target.value === '' ? null : Number(e.target.value))} style={input} />;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
      <div><label style={label}>Selling expired stock</label>{sel('sell_expired', [['never', 'Never'], ['override', 'Only with an override'], ['allowed', 'Allowed']])}</div>
      <div><label style={label}>Days left needed — online</label>{num('min_days_online')}</div>
      <div><label style={label}>Days left needed — till</label>{num('min_days_till')}</div>
      <div><label style={label}>When a batch expires</label>{sel('expiry_action', [['list', 'Block and list it'], ['write_off', 'Write it off automatically']])}</div>
      <div><label style={label}>Warn before expiry (days)</label>
        <input value={daysText(v.warning_days)} placeholder={`Same as shop-wide (${daysText(defaults.warning_days)})`} onChange={(e) => set('warning_days', parseDays(e.target.value))} style={input} /></div>
      <div><label style={label}>Expiry badge</label>{sel('show_expiry_badge', [[true, 'Show'], [false, 'Do not show']])}</div>
    </div>
  );
}

function ExceptionEditor({ defaults, onSaved, onCancel, editing }) {
  const [scope, setScope] = useState(editing?.scope ?? 'category');
  const [target, setTarget] = useState(editing ? { id: editing.scope_id, name: editing.name } : null);
  const [q, setQ] = useState('');
  const [found, setFound] = useState([]);
  const [vals, setVals] = useState(editing?.settings ?? {});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (target) return undefined;
    const t = setTimeout(() => { stockSettingsAPI.targets(scope, q).then(setFound).catch(() => setFound([])); }, 200);
    return () => clearTimeout(t);
  }, [scope, q, target]);

  const save = async () => {
    setBusy(true);
    try {
      const clean = Object.fromEntries(Object.entries(vals).filter(([, x]) => x !== null && x !== '' && !(Array.isArray(x) && x.length === 0)));
      await stockSettingsAPI.saveOverride(scope, target.id, clean);
      toast.success('Exception saved');
      onSaved();
    } catch (e) { toast.error(errMsg(e, 'Could not save the exception')); } finally { setBusy(false); }
  };

  return (
    <div style={{ border: '1.5px solid color-mix(in srgb, var(--color-primary-500) 20%, transparent)', borderRadius: 10, padding: 14, marginTop: 12 }}>
      {!editing && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <select value={scope} onChange={(e) => { setScope(e.target.value); setTarget(null); setQ(''); }} style={{ ...input, width: 160 }} aria-label="Applies to">
            <option value="category">A category</option><option value="product">A product</option>
          </select>
          {target
            ? <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontWeight: 700, fontSize: '0.85rem' }}>{target.name}<button type="button" aria-label="Change" onClick={() => setTarget(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={14} /></button></span>
            : (
              <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${scope === 'category' ? 'categories' : 'products'}…`} style={input} />
                {found.length > 0 && (
                  <div style={{ position: 'absolute', zIndex: 10, top: '100%', left: 0, right: 0, background: 'var(--surface-card, #fff)', border: '1px solid var(--line)', borderRadius: 8, maxHeight: 220, overflowY: 'auto' }}>
                    {found.map((f) => <button key={f.id} type="button" onClick={() => setTarget({ id: f.id, name: f.name })} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem' }}>{f.name}{f.sku ? <span style={{ color: 'var(--text-tertiary)' }}> · {f.sku}</span> : null}</button>)}
                  </div>
                )}
              </div>
            )}
        </div>
      )}
      {editing && <p style={{ margin: '0 0 10px', fontWeight: 700, fontSize: '0.85rem' }}>{editing.scope === 'category' ? 'Category' : 'Product'}: {editing.name}</p>}
      <OverrideFields value={vals} onChange={setVals} defaults={defaults} />
      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <button type="button" style={btn(true)} disabled={!target || busy} onClick={save}><Save size={14} /> Save exception</button>
        <button type="button" style={btn(false)} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

const describe = (o) => Object.entries(o.settings).map(([k, v]) => {
  const names = { sell_expired: 'Selling expired', min_days_online: 'Online days left', min_days_till: 'Till days left', expiry_action: 'On expiry', warning_days: 'Warn at', show_expiry_badge: 'Badge' };
  const shown = Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? 'shown' : 'hidden') : String(v).replace('_', ' ');
  return `${names[k] ?? k}: ${shown}`;
}).join(' · ') || 'No changes';

export default function StockSettings() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [warnText, setWarnText] = useState('');
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState(null);   // null | 'new' | an override row

  const load = () => stockSettingsAPI.get().then((d) => { setData(d); setForm(d.settings); setWarnText(daysText(d.settings.warning_days)); })
    .catch((e) => toast.error(errMsg(e, 'Could not load the stock settings')));
  useEffect(() => { load(); }, []);

  if (!form || !data) {
    return <SettingsLayout><div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}><RefreshCw size={18} /> Loading…</div></SettingsLayout>;
  }
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const res = await stockSettingsAPI.save({ ...form, warning_days: parseDays(warnText) });
      setForm(res.settings); setWarnText(daysText(res.settings.warning_days));
      toast.success(res.message);
    } catch (e) { toast.error(errMsg(e, 'Could not save')); } finally { setSaving(false); }
  };
  const remove = async (o) => {
    if (!window.confirm(`Remove the exception for ${o.name}?`)) return;
    try { await stockSettingsAPI.deleteOverride(o.id); toast.success('Exception removed'); load(); } catch (e) { toast.error(errMsg(e, 'Could not remove it')); }
  };

  return (
    <SettingsLayout>
      <div style={{ padding: '20px 4px', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <PackageX size={22} color="var(--color-primary-600)" />
          <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>Stock &amp; expiry</h1>
        </div>
        <p style={{ margin: '0 0 20px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          What happens to goods that expire. These rules apply to products that <strong>track expiry</strong> (switch it on in the product’s Stock section). A category or a single product can have its own exceptions below.
        </p>

        <div style={card}>
          <h2 style={h2}>What customers see</h2>
          <p style={sub}>Expired batches are never counted as available stock on the storefront.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 16 }}>
            <div>
              <label style={label}>A product whose stock has all expired</label>
              <select value={form.expired_on_storefront} onChange={(e) => set('expired_on_storefront', e.target.value)} style={input}>
                <option value="hide">Hide it from the storefront</option>
                <option value="unavailable">Show it as out of stock</option>
              </select>
            </div>
            <div>
              <label style={label}>“Expires dd/mm” badge</label>
              <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: '0.85rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.show_expiry_badge} onChange={(e) => set('show_expiry_badge', e.target.checked)} /> Show the badge
              </label>
              <p style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', margin: '4px 0 0' }}>Only ever shown on products that track expiry and whose batch has an expiry date.</p>
            </div>
          </div>
        </div>

        <div style={card}>
          <h2 style={h2}>Selling expired stock</h2>
          <p style={sub}>Applies at the till and online.</p>
          {SELL.map(([v, t, h]) => <Radio key={v} value={v} current={form.sell_expired} onChange={(x) => set('sell_expired', x)} title={t} hint={h} />)}
          {form.sell_expired === 'override' && (
            <PermissionNote permission="Sell expired stock, with a reason">Who may override is decided by role.</PermissionNote>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 16, marginTop: 16 }}>
            <div><label style={label}>Days of shelf life needed — online orders</label><input type="number" min="0" value={form.min_days_online} onChange={(e) => set('min_days_online', Number(e.target.value))} style={input} />
              <p style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', margin: '4px 0 0' }}>A batch with fewer days left is not offered online, so it does not expire in the post.</p></div>
            <div><label style={label}>Days of shelf life needed — at the till</label><input type="number" min="0" value={form.min_days_till} onChange={(e) => set('min_days_till', Number(e.target.value))} style={input} />
              <p style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', margin: '4px 0 0' }}>0 means anything not yet expired can be sold.</p></div>
          </div>
        </div>

        <div style={card}>
          <h2 style={h2}>When a batch expires</h2>
          <p style={sub}>Checked every day.</p>
          {ACTION.map(([v, t, h]) => <Radio key={v} value={v} current={form.expiry_action} onChange={(x) => set('expiry_action', x)} title={t} hint={h} />)}
          {form.expiry_action === 'write_off' && (
            <div style={{ maxWidth: 260, marginTop: 8 }}><label style={label}>Write off after (days)</label><input type="number" min="0" value={form.write_off_after_days} onChange={(e) => set('write_off_after_days', Number(e.target.value))} style={input} /></div>
          )}
        </div>

        <div style={card}>
          <h2 style={h2}>Warnings</h2>
          <p style={sub}>Staff are told before batches expire, for the branches they work at.</p>
          <div style={{ maxWidth: 320, marginBottom: 14 }}>
            <label style={label}>Warn this many days before expiry</label>
            <input value={warnText} onChange={(e) => setWarnText(e.target.value)} placeholder="90, 60, 30" style={input} />
            <p style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', margin: '4px 0 0' }}>Separate the days with commas.</p>
          </div>
          <PermissionNote permission="Get the expiry warnings">Who is told is decided by role.</PermissionNote>
        </div>

        <div style={card}>
          <h2 style={h2}>Which batch is used first</h2>
          <p style={sub}>Used by every sale, online and at the till, unless the seller picks a batch.</p>
          <Radio value="fefo" current={form.pick_order} onChange={(x) => set('pick_order', x)} title="First expiring, first out (recommended)" hint="The batch that expires soonest goes first; batches with no expiry go after, oldest first." />
          <Radio value="fifo" current={form.pick_order} onChange={(x) => set('pick_order', x)} title="Oldest first" hint="The batch that arrived first goes first, whatever its expiry." />
        </div>

        <div style={card}>
          <h2 style={h2}>How stock is valued</h2>
          <p style={sub}>What a unit costs when it is sold or used.</p>
          <Radio value="lot" current={form.costing_method ?? 'lot'} onChange={(x) => set('costing_method', x)} title="Each batch keeps its own cost (recommended)" hint="A unit is costed at what its batch cost when it arrived." />
          <Radio value="average" current={form.costing_method ?? 'lot'} onChange={(x) => set('costing_method', x)} title="Average cost" hint="Every arrival blends into one average cost per product. Total stock value does not change when the average moves." />
        </div>

        <div style={card}>
          <h2 style={h2}>Customer returns</h2>
          <p style={sub}>Where returned expiry products go.</p>
          <Radio value={false} current={!!form.returns_to_quarantine} onChange={(x) => set('returns_to_quarantine', x)} title="Back on the shelf" hint="Returned stock is available to sell again." />
          <Radio value={true} current={!!form.returns_to_quarantine} onChange={(x) => set('returns_to_quarantine', x)} title="Held in quarantine" hint="Returned stock is held until someone checks it and releases it on the Held stock page." />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
          <button type="button" style={btn(true)} disabled={saving} onClick={save}><Save size={15} /> {saving ? 'Saving…' : 'Save settings'}</button>
        </div>

        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <h2 style={h2}>Exceptions</h2>
              <p style={{ ...sub, marginBottom: 0 }}>A product’s exception beats its category’s, which beats these shop-wide rules. Only what you change is overridden.</p>
            </div>
            {!editor && <button type="button" style={btn(false)} onClick={() => setEditor('new')}><Plus size={14} /> Add an exception</button>}
          </div>
          {data.overrides.length === 0 && !editor && <p style={{ margin: '14px 0 0', fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>No exceptions. Every product follows the shop-wide rules.</p>}
          {data.overrides.length > 0 && (
            <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
              {data.overrides.map((o) => (
                <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 9, background: 'color-mix(in srgb, var(--color-primary-500) 4%, transparent)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>{o.name} <span style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>· {o.scope}</span></div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>{describe(o)}</div>
                  </div>
                  <button type="button" style={{ ...btn(false), padding: '6px 11px' }} onClick={() => setEditor(o)}>Edit</button>
                  <button type="button" aria-label="Remove" onClick={() => remove(o)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          )}
          {editor && (
            <ExceptionEditor key={editor === 'new' ? 'new' : editor.id} defaults={{ ...data.defaults, ...form }} editing={editor === 'new' ? null : editor}
              onCancel={() => setEditor(null)} onSaved={() => { setEditor(null); load(); }} />
          )}
        </div>
      </div>
    </SettingsLayout>
  );
}
