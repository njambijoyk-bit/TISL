import React, { useState, useEffect, useMemo } from 'react';
import backupsAPI from '../../../../_shared/api/backups';
import { X, Save, RefreshCw, Search } from 'lucide-react';
import toast from 'react-hot-toast';

const input = {
  padding: '7px 10px', borderRadius: 8, fontSize: '0.8rem',
  background: 'color-mix(in srgb, var(--color-primary-500) 4%, transparent)',
  border: '1.5px solid color-mix(in srgb, var(--color-primary-500) 18%, transparent)',
  color: '#111827', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
};
const btn = (bg, fg = 'white') => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
  borderRadius: 8, border: 'none', background: bg, color: fg, cursor: 'pointer',
  fontSize: '0.8rem', fontWeight: 600, fontFamily: 'inherit',
});
const EXCLUDE = '__exclude__';

/**
 * Assign the backup engine's "unassigned" tables to a module (or exclude them).
 * Choices persist to module_table_map via the API; the plan updates on save.
 */
export default function AssignTablesModal({ onClose, onSaved }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tables, setTables] = useState([]);
  const [modules, setModules] = useState([]);
  const [picks, setPicks] = useState({}); // table -> target
  const [q, setQ] = useState('');
  const [bulk, setBulk] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const d = await backupsAPI.getTables();
        setTables(d.unassigned || []);
        setModules(d.modules || []);
      } catch (e) {
        toast.error(e.response?.data?.message || 'Could not load tables.');
      } finally { setLoading(false); }
    })();
  }, []);

  const shown = useMemo(
    () => tables.filter((t) => t.toLowerCase().includes(q.trim().toLowerCase())),
    [tables, q]
  );

  const chosenCount = Object.values(picks).filter(Boolean).length;

  const applyBulk = () => {
    if (!bulk) return;
    setPicks((p) => {
      const next = { ...p };
      shown.forEach((t) => { next[t] = bulk; });
      return next;
    });
  };

  const save = async () => {
    const assignments = Object.entries(picks)
      .filter(([, target]) => !!target)
      .map(([table, target]) => ({ table, target }));
    if (!assignments.length) { toast('Nothing chosen yet.', { icon: 'ℹ️' }); return; }
    setSaving(true);
    try {
      const res = await backupsAPI.assignTables(assignments);
      toast.success(res.message || 'Saved.');
      onSaved?.();
      onClose?.();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Could not save.');
    } finally { setSaving(false); }
  };

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--bg-primary, #fff)', color: '#111827', borderRadius: 14, width: 'min(720px, 100%)', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #eee' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>Assign tables to modules</h2>
            <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#6b7280' }}>{tables.length} unassigned · {chosenCount} chosen</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}><X size={20} /></button>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid #f2f2f2' }}>
          <div style={{ position: 'relative', flex: '1 1 200px' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
            <input style={{ ...input, width: '100%', paddingLeft: 30 }} placeholder="Filter tables…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select style={input} value={bulk} onChange={(e) => setBulk(e.target.value)}>
            <option value="">Set shown to…</option>
            {modules.map((m) => <option key={m.key} value={m.key}>{m.name}</option>)}
            <option value={EXCLUDE}>Exclude from backups</option>
          </select>
          <button onClick={applyBulk} disabled={!bulk} style={btn('rgba(107,114,128,0.14)', '#374151')}>Apply to {shown.length}</button>
        </div>

        {/* List */}
        <div style={{ overflowY: 'auto', padding: '8px 20px', flex: 1 }}>
          {loading ? (
            <div style={{ padding: 30, textAlign: 'center', color: '#9ca3af' }}><RefreshCw size={16} /> Loading…</div>
          ) : shown.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: '#9ca3af' }}>No tables match.</div>
          ) : (
            shown.map((t) => (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid #f6f6f6' }}>
                <code style={{ flex: 1, fontSize: '0.8rem', fontFamily: 'ui-monospace, Menlo, monospace' }}>{t}</code>
                <select
                  style={{ ...input, minWidth: 190, borderColor: picks[t] ? 'var(--color-primary-500)' : undefined }}
                  value={picks[t] || ''}
                  onChange={(e) => setPicks((p) => ({ ...p, [t]: e.target.value }))}
                >
                  <option value="">— choose —</option>
                  {modules.map((m) => <option key={m.key} value={m.key}>{m.name}</option>)}
                  <option value={EXCLUDE}>Exclude from backups</option>
                </select>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 20px', borderTop: '1px solid #eee' }}>
          <button onClick={onClose} style={btn('rgba(107,114,128,0.14)', '#374151')}>Cancel</button>
          <button onClick={save} disabled={saving || chosenCount === 0} style={{ ...btn('var(--color-primary-600)'), opacity: (saving || chosenCount === 0) ? 0.6 : 1 }}>
            <Save size={15} /> {saving ? 'Saving…' : `Save ${chosenCount || ''}`.trim()}
          </button>
        </div>
      </div>
    </div>
  );
}
