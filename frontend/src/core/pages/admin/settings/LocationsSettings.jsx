import React, { useState, useEffect, useCallback } from 'react';
import SettingsLayout from '../../../../_shared/components/layout/SettingsLayout';
import locationsAPI from '../../../../_shared/api/locations';
import {
  MapPin, Plus, Star, Trash2, Pencil, X, RefreshCw, Check, Users,
} from 'lucide-react';
import toast from 'react-hot-toast';

const card = {
  background: 'white', borderRadius: 12,
  border: '1px solid color-mix(in srgb, var(--color-primary-500) 10%, transparent)',
  boxShadow: '0 2px 12px color-mix(in srgb, var(--color-primary-500) 6%, transparent)',
};
const label = { fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', marginBottom: 4, display: 'block' };
const input = {
  width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: '0.85rem', fontFamily: 'inherit',
  border: '1px solid color-mix(in srgb, var(--color-primary-500) 18%, transparent)', background: 'white',
};
const btnPrimary = {
  display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 9,
  border: 'none', background: 'var(--color-primary-600)', color: 'white', fontWeight: 700,
  fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit',
};

const EMPTY = {
  name: '', code: '', currency_id: '', tax_district_id: '', city: '', country: '',
  timezone: 'Africa/Nairobi', price_display_default: 'inclusive',
  accepts_pickup: true, accepts_delivery: true, is_active: true, is_default: false,
  sort_order: 0, staff_ids: [],
};

function Toggle({ checked, onChange, children }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.83rem', cursor: 'pointer' }}>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

function LocationModal({ open, onClose, editing, options, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        ...EMPTY, ...editing,
        currency_id: editing.currency_id || '',
        tax_district_id: editing.tax_district_id || '',
        staff_ids: editing.staff_ids || [],
      });
    } else {
      setForm(EMPTY);
    }
  }, [open, editing]);

  if (!open) return null;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleStaff = (id) => setForm((f) => ({
    ...f, staff_ids: f.staff_ids.includes(id) ? f.staff_ids.filter((x) => x !== id) : [...f.staff_ids, id],
  }));

  const save = async () => {
    if (!form.name.trim() || !form.code.trim()) { toast.error('Name and code are required.'); return; }
    const payload = {
      ...form,
      currency_id: form.currency_id || null,
      tax_district_id: form.tax_district_id || null,
      sort_order: Number(form.sort_order) || 0,
    };
    setSaving(true);
    try {
      const res = editing
        ? await locationsAPI.update(editing.id, payload)
        : await locationsAPI.create(payload);
      if (res.ok === false) throw new Error(res.message);
      toast.success(res.message || 'Saved.');
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.message || e.message || 'Could not save.');
    } finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: 24 }}>
      <div style={{ ...card, width: '100%', maxWidth: 640, padding: 22, marginTop: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>{editing ? 'Edit branch' : 'Add branch'}</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}><X size={20} /></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label style={label}>Name *</label><input style={input} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Nairobi CBD" /></div>
          <div><label style={label}>Code *</label><input style={input} value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} placeholder="NBO-CBD" /></div>

          <div>
            <label style={label}>Currency</label>
            <select style={input} value={form.currency_id} onChange={(e) => set('currency_id', e.target.value)}>
              <option value="">— (base currency)</option>
              {options.currencies?.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}{c.is_base ? ' (base)' : ''}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>Tax district</label>
            <select style={input} value={form.tax_district_id} onChange={(e) => set('tax_district_id', e.target.value)}>
              <option value="">— none</option>
              {options.tax_districts?.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.level})</option>)}
            </select>
          </div>

          <div><label style={label}>City</label><input style={input} value={form.city} onChange={(e) => set('city', e.target.value)} /></div>
          <div><label style={label}>Country</label><input style={input} value={form.country} onChange={(e) => set('country', e.target.value)} /></div>

          <div><label style={label}>Timezone</label><input style={input} value={form.timezone} onChange={(e) => set('timezone', e.target.value)} placeholder="Africa/Nairobi" /></div>
          <div>
            <label style={label}>Price display</label>
            <select style={input} value={form.price_display_default} onChange={(e) => set('price_display_default', e.target.value)}>
              <option value="inclusive">Tax inclusive</option>
              <option value="exclusive">Tax exclusive</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, marginTop: 16 }}>
          <Toggle checked={form.accepts_pickup} onChange={(v) => set('accepts_pickup', v)}>Accepts pickup</Toggle>
          <Toggle checked={form.accepts_delivery} onChange={(v) => set('accepts_delivery', v)}>Accepts delivery</Toggle>
          <Toggle checked={form.is_active} onChange={(v) => set('is_active', v)}>Active</Toggle>
          <Toggle checked={form.is_default} onChange={(v) => set('is_default', v)}>Default branch</Toggle>
        </div>

        <div style={{ marginTop: 18 }}>
          <label style={label}><Users size={13} style={{ verticalAlign: -2 }} /> Staff cleared for this branch</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 6, maxHeight: 160, overflowY: 'auto', padding: 8, borderRadius: 8, border: '1px solid #eee' }}>
            {(options.staff || []).map((u) => (
              <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '0.8rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.staff_ids.includes(u.id)} onChange={() => toggleStaff(u.id)} />
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name} <span style={{ color: '#9ca3af' }}>({u.role})</span></span>
              </label>
            ))}
            {(!options.staff || options.staff.length === 0) && <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>No staff users.</span>}
          </div>
          <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: '6px 0 0' }}>Admins and super-admins always see every branch. Staff with no branch assigned see all until you assign them.</p>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
          <button onClick={onClose} style={{ ...btnPrimary, background: 'var(--surface-input)', color: '#374151' }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
            {saving ? <RefreshCw size={15} /> : <Check size={15} />} {editing ? 'Save changes' : 'Create branch'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LocationsSettings() {
  const [locations, setLocations] = useState([]);
  const [options, setOptions] = useState({});
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, opts] = await Promise.all([locationsAPI.getAdmin(), locationsAPI.getOptions()]);
      setLocations(list.locations || []);
      setOptions(opts || {});
    } catch (e) {
      toast.error(e.response?.data?.message || 'Could not load branches.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(null); setModalOpen(true); };
  const openEdit = async (id) => {
    try { setEditing(await locationsAPI.get(id)); setModalOpen(true); }
    catch { toast.error('Could not open that branch.'); }
  };

  const makeDefault = async (id) => {
    try { const res = await locationsAPI.setDefault(id); toast.success(res.message); load(); }
    catch (e) { toast.error(e.response?.data?.message || 'Could not set default.'); }
  };

  const remove = async (loc) => {
    if (!window.confirm(`Delete branch “${loc.name}”? Its data stays; only the branch and its per-branch settings are removed.`)) return;
    try { const res = await locationsAPI.remove(loc.id); if (res.ok === false) throw new Error(res.message); toast.success(res.message); load(); }
    catch (e) { toast.error(e.response?.data?.message || e.message || 'Could not delete.'); }
  };

  if (loading) {
    return <SettingsLayout><div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}><RefreshCw size={18} /> Loading…</div></SettingsLayout>;
  }

  return (
    <SettingsLayout>
      <div style={{ padding: '20px 4px', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <MapPin size={22} color="var(--color-primary-600)" />
            <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>Branches</h1>
          </div>
          <button style={btnPrimary} onClick={openNew}><Plus size={16} /> Add branch</button>
        </div>
        <p style={{ margin: '0 0 20px', color: '#6b7280', fontSize: '0.85rem' }}>
          Each branch carries its own currency and tax district — prices and tax resolve per branch. A single branch is all a one-location business needs; the storefront branch picker only appears once you add a second.
        </p>

        <div style={{ display: 'grid', gap: 12 }}>
          {locations.map((l) => (
            <div key={l.id} style={{ ...card, padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{l.name}</span>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: '#9ca3af' }}>{l.code}</span>
                  {l.is_default && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.68rem', fontWeight: 700, color: '#b45309', background: 'rgba(217,119,6,0.12)', padding: '2px 8px', borderRadius: 999 }}><Star size={11} /> Default</span>}
                  {!l.is_active && <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#6b7280', background: 'var(--surface-input)', padding: '2px 8px', borderRadius: 999 }}>Inactive</span>}
                </div>
                <div style={{ fontSize: '0.76rem', color: '#6b7280', marginTop: 4 }}>
                  {[l.city, l.country].filter(Boolean).join(', ') || '—'}
                  {' · '}{l.currency || 'base'} {l.tax_district ? `· ${l.tax_district}` : ''}
                  {typeof l.staff_count === 'number' ? ` · ${l.staff_count} staff` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {!l.is_default && (
                  <button title="Set as default" onClick={() => makeDefault(l.id)} style={{ border: '1px solid #eee', background: 'white', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', color: '#b45309' }}><Star size={13} /> Default</button>
                )}
                <button title="Edit" onClick={() => openEdit(l.id)} style={{ border: '1px solid #eee', background: 'white', borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}><Pencil size={14} /></button>
                <button title="Delete" onClick={() => remove(l)} style={{ border: '1px solid #fee2e2', background: 'white', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: '#dc2626' }}><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <LocationModal open={modalOpen} onClose={() => setModalOpen(false)} editing={editing} options={options} onSaved={load} />
    </SettingsLayout>
  );
}
