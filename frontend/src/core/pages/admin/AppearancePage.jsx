import { useState, useEffect, useCallback } from 'react';
import { appearanceAPI } from '../../../_shared/api/appearance';
import { useTheme } from '../../../_shared/theme';

// ── Tiny reusable components ────────────────────────────────────────────────

function Badge({ active }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: '9999px',
      fontSize: '11px',
      fontWeight: 600,
      background: active ? 'var(--color-primary-100)' : 'var(--bg-tertiary)',
      color:      active ? 'var(--color-primary-700)' : 'var(--text-muted)',
    }}>
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

function DefaultBadge() {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: '9999px',
      fontSize: '11px',
      fontWeight: 600,
      background: 'var(--color-primary-500)',
      color: '#fff',
      marginLeft: '6px',
    }}>Default</span>
  );
}

function ActionBtn({ onClick, children, variant = 'ghost', disabled }) {
  const styles = {
    ghost: {
      padding: '4px 12px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer',
      border: '1px solid var(--border-primary)',
      background: 'var(--bg-secondary)', color: 'var(--text-primary)',
    },
    primary: {
      padding: '4px 12px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer',
      border: 'none',
      background: 'var(--color-primary-500)', color: '#fff',
    },
    danger: {
      padding: '4px 12px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer',
      border: '1px solid var(--accent-error)',
      background: 'transparent', color: 'var(--accent-error)',
    },
  };
  return <button style={{ ...styles[variant], opacity: disabled ? 0.45 : 1 }} onClick={onClick} disabled={disabled}>{children}</button>;
}

function Card({ children }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-primary)',
      borderRadius: '10px',
      padding: '20px',
      marginBottom: '12px',
    }}>
      {children}
    </div>
  );
}

function Row({ children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
      {children}
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <h3 style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-heading)', marginBottom: '16px', marginTop: 0 }}>
      {children}
    </h3>
  );
}

// ── Colour swatch ────────────────────────────────────────────────────────────
function ColourSwatch({ tokens }) {
  if (!tokens) return null;
  const primary = tokens['--color-primary-500'] ?? tokens['--color-primary-400'] ?? '#888';
  const bg      = tokens['--bg-primary'] ?? '#fff';
  const text    = tokens['--text-primary'] ?? '#000';
  return (
    <div style={{ display: 'flex', gap: '4px' }}>
      {[primary, bg, text].map((c, i) => (
        <span key={i} style={{
          width: '18px', height: '18px', borderRadius: '50%',
          background: c,
          border: '1px solid var(--border-secondary)',
          display: 'inline-block',
        }} title={c} />
      ))}
    </div>
  );
}

// ── Token editor — colour picker grid for a set of CSS custom properties ─────
const TOKEN_FIELDS = [
  { key: '--color-primary-50',  label: 'Primary 50'  },
  { key: '--color-primary-100', label: 'Primary 100' },
  { key: '--color-primary-200', label: 'Primary 200' },
  { key: '--color-primary-300', label: 'Primary 300' },
  { key: '--color-primary-400', label: 'Primary 400' },
  { key: '--color-primary-500', label: 'Primary 500 (main)' },
  { key: '--color-primary-600', label: 'Primary 600' },
  { key: '--color-primary-700', label: 'Primary 700' },
  { key: '--color-primary-800', label: 'Primary 800' },
  { key: '--color-primary-900', label: 'Primary 900' },
  { key: '--color-primary-950', label: 'Primary 950' },
  { key: '--bg-primary',        label: 'Background primary' },
  { key: '--bg-secondary',      label: 'Background secondary' },
  { key: '--bg-card',           label: 'Background card' },
  { key: '--text-primary',      label: 'Text primary' },
  { key: '--text-secondary',    label: 'Text secondary' },
  { key: '--border-primary',    label: 'Border primary' },
  { key: '--border-secondary',  label: 'Border secondary' },
];

function TokenEditor({ tokens, onChange, label }) {
  const [expanded, setExpanded] = useState(false);

  const handleChange = (key, val) => {
    onChange({ ...tokens, [key]: val });
  };

  return (
    <div style={{ marginTop: 8 }}>
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0',
          fontSize: 12, fontWeight: 600, color: 'var(--color-primary-600)',
          display: 'flex', alignItems: 'center', gap: 4,
        }}
      >
        {expanded ? '▾' : '▸'} {label}
      </button>

      {expanded && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 8, marginTop: 10,
          padding: '14px', borderRadius: 8,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-primary)',
        }}>
          {TOKEN_FIELDS.map(({ key, label: tLabel }) => {
            const val = tokens?.[key] ?? '';
            // Only show color picker if it looks like a hex colour
            const isHex = /^#[0-9a-fA-F]{3,8}$/.test(val.trim());
            return (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {isHex && (
                  <input
                    type="color"
                    value={val.trim().length === 4 ? val : val} // pass through
                    onChange={e => handleChange(key, e.target.value)}
                    style={{
                      width: 28, height: 28, padding: 0, border: 'none',
                      borderRadius: 4, cursor: 'pointer', background: 'none', flexShrink: 0,
                    }}
                  />
                )}
                {!isHex && (
                  <span style={{
                    width: 28, height: 28, borderRadius: 4, flexShrink: 0,
                    background: val || 'transparent',
                    border: '1px solid var(--border-primary)',
                  }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{tLabel}</div>
                  <input
                    type="text"
                    value={val}
                    onChange={e => handleChange(key, e.target.value)}
                    placeholder="e.g. #a855f7"
                    style={{ ...inputStyle, padding: '4px 8px', fontSize: 12 }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Default token sets ────────────────────────────────────────────────────────
const DEFAULT_LIGHT = {
  '--color-primary-50':  '#faf5ff',
  '--color-primary-100': '#f3e8ff',
  '--color-primary-200': '#e9d5ff',
  '--color-primary-300': '#d8b4fe',
  '--color-primary-400': '#c084fc',
  '--color-primary-500': '#a855f7',
  '--color-primary-600': '#9333ea',
  '--color-primary-700': '#7e22ce',
  '--color-primary-800': '#6b21a8',
  '--color-primary-900': '#581c87',
  '--color-primary-950': '#3b0764',
  '--bg-primary':        '#ffffff',
  '--bg-secondary':      '#f9fafb',
  '--bg-card':           '#ffffff',
  '--text-primary':      '#111827',
  '--text-secondary':    '#6b7280',
  '--border-primary':    '#e5e7eb',
  '--border-secondary':  '#d1d5db',
};

const DEFAULT_DARK = {
  '--color-primary-50':  '#faf5ff',
  '--color-primary-100': '#f3e8ff',
  '--color-primary-200': '#e9d5ff',
  '--color-primary-300': '#d8b4fe',
  '--color-primary-400': '#c084fc',
  '--color-primary-500': '#a855f7',
  '--color-primary-600': '#9333ea',
  '--color-primary-700': '#7e22ce',
  '--color-primary-800': '#6b21a8',
  '--color-primary-900': '#581c87',
  '--color-primary-950': '#3b0764',
  '--bg-primary':        '#0f0f14',
  '--bg-secondary':      '#1a1a24',
  '--bg-card':           '#1a1a24',
  '--text-primary':      '#f9fafb',
  '--text-secondary':    '#9ca3af',
  '--border-primary':    '#2d2d3d',
  '--border-secondary':  '#3f3f55',
};

// ── Tab: Colour Themes ────────────────────────────────────────────────────────
function ColouringsTab() {
  const { setColouring } = useTheme();
  const [colourings, setColourings] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(null);
  const [deleting, setDeleting]     = useState(null);
  const [editId, setEditId]         = useState(null); // id being edited inline
  const [editLight, setEditLight]   = useState({});
  const [editDark, setEditDark]     = useState({});
  const [showNew, setShowNew]       = useState(false);
  const [newName, setNewName]       = useState('');
  const [newSlug, setNewSlug]       = useState('');
  const [newLight, setNewLight]     = useState({ ...DEFAULT_LIGHT });
  const [newDark, setNewDark]       = useState({ ...DEFAULT_DARK });
  const [error, setError]           = useState('');
  const [confirm, setConfirm]       = useState(null); // id to confirm delete

  const load = useCallback(async () => {
    try {
      const res = await appearanceAPI.adminGetColourings();
      setColourings(res.data.colourings);
    } catch {
      setError('Failed to load colourings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async (id, field, value) => {
    setSaving(id);
    try {
      await appearanceAPI.adminUpdateColouring(id, { [field]: value });
      await load();
      if (field === 'is_default' && value) {
        setColouring(id);
      }
    } catch { setError('Save failed'); }
    finally { setSaving(null); }
  };

  const startEdit = (c) => {
    setEditId(c.id);
    setEditLight({ ...c.light_tokens });
    setEditDark({ ...c.dark_tokens });
  };

  const saveEdit = async (id) => {
    setSaving(id);
    try {
      await appearanceAPI.adminUpdateColouring(id, {
        light_tokens: editLight,
        dark_tokens: editDark,
      });
      setEditId(null);
      await load();
    } catch { setError('Save failed'); }
    finally { setSaving(null); }
  };

  const deleteColouring = async (id) => {
    setDeleting(id);
    try {
      await appearanceAPI.adminDeleteColouring(id);
      setConfirm(null);
      await load();
    } catch { setError('Delete failed'); }
    finally { setDeleting(null); }
  };

  const createNew = async () => {
    if (!newName || !newSlug) return;
    setSaving('new');
    try {
      await appearanceAPI.adminCreateColouring({
        name: newName, slug: newSlug,
        light_tokens: newLight,
        dark_tokens: newDark,
      });
      setNewName(''); setNewSlug('');
      setNewLight({ ...DEFAULT_LIGHT });
      setNewDark({ ...DEFAULT_DARK });
      setShowNew(false);
      await load();
    } catch { setError('Create failed'); }
    finally { setSaving(null); }
  };

  if (loading) return <p style={{ color: 'var(--text-secondary)' }}>Loading…</p>;

  return (
    <div>
      <SectionTitle>Colour Themes</SectionTitle>
      {error && <p style={{ color: 'var(--accent-error)', marginBottom: '12px' }}>{error}</p>}

      {colourings.map(c => (
        <Card key={c.id}>
          <Row>
            <ColourSwatch tokens={c.light_tokens} />
            <div style={{ flex: 1 }}>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{c.name}</span>
              {c.is_default && <DefaultBadge />}
              <span style={{ marginLeft: '8px', color: 'var(--text-muted)', fontSize: '12px' }}>{c.slug}</span>
            </div>
            <Badge active={c.is_active} />
            <ActionBtn onClick={() => toggle(c.id, 'is_active', !c.is_active)} variant="ghost" disabled={saving === c.id}>
              {saving === c.id ? '…' : (c.is_active ? 'Deactivate' : 'Activate')}
            </ActionBtn>
            {!c.is_default && (
              <ActionBtn onClick={() => toggle(c.id, 'is_default', true)} variant="primary" disabled={saving === c.id}>
                Set Default
              </ActionBtn>
            )}
            <ActionBtn onClick={() => editId === c.id ? setEditId(null) : startEdit(c)} variant="ghost">
              {editId === c.id ? 'Cancel' : 'Edit colours'}
            </ActionBtn>
            {!c.is_default && (
              confirm === c.id ? (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Delete?</span>
                  <ActionBtn onClick={() => deleteColouring(c.id)} variant="danger" disabled={deleting === c.id}>
                    {deleting === c.id ? '…' : 'Yes'}
                  </ActionBtn>
                  <ActionBtn onClick={() => setConfirm(null)} variant="ghost">No</ActionBtn>
                </div>
              ) : (
                <ActionBtn onClick={() => setConfirm(c.id)} variant="danger">Delete</ActionBtn>
              )
            )}
          </Row>

          {/* Inline token editor */}
          {editId === c.id && (
            <div style={{ marginTop: 16, borderTop: '1px solid var(--border-primary)', paddingTop: 16 }}>
              <TokenEditor tokens={editLight} onChange={setEditLight} label="Light mode colours" />
              <TokenEditor tokens={editDark}  onChange={setEditDark}  label="Dark mode colours" />
              <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                <ActionBtn onClick={() => saveEdit(c.id)} variant="primary" disabled={saving === c.id}>
                  {saving === c.id ? 'Saving…' : 'Save colours'}
                </ActionBtn>
                <ActionBtn onClick={() => setEditId(null)} variant="ghost">Cancel</ActionBtn>
              </div>
            </div>
          )}
        </Card>
      ))}

      {showNew ? (
        <Card>
          <h4 style={{ margin: '0 0 12px', color: 'var(--text-primary)', fontSize: 15 }}>New colour theme</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <input
              placeholder="Name (e.g. Ocean Blue)"
              value={newName}
              onChange={e => { setNewName(e.target.value); setNewSlug(e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')); }}
              style={inputStyle}
            />
            <input placeholder="Slug (auto-filled)" value={newSlug} onChange={e => setNewSlug(e.target.value)} style={inputStyle} />

            <TokenEditor tokens={newLight} onChange={setNewLight} label="Light mode colours" />
            <TokenEditor tokens={newDark}  onChange={setNewDark}  label="Dark mode colours" />

            <Row>
              <ActionBtn onClick={createNew} variant="primary" disabled={saving === 'new' || !newName || !newSlug}>
                {saving === 'new' ? 'Creating…' : 'Create'}
              </ActionBtn>
              <ActionBtn onClick={() => setShowNew(false)}>Cancel</ActionBtn>
            </Row>
          </div>
        </Card>
      ) : (
        <ActionBtn onClick={() => setShowNew(true)} variant="primary">+ New Colouring</ActionBtn>
      )}
    </div>
  );
}

// ── Tab: Fonts ────────────────────────────────────────────────────────────────
function FontsTab() {
  const [fonts, setFonts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await appearanceAPI.adminGetFonts();
      setFonts(res.data.fonts);
    } catch { setError('Failed to load fonts'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const update = async (id, patch) => {
    setSaving(id);
    try {
      await appearanceAPI.adminUpdateFont(id, patch);
      await load();
    } catch { setError('Save failed'); }
    finally { setSaving(null); }
  };

  if (loading) return <p style={{ color: 'var(--text-secondary)' }}>Loading…</p>;

  return (
    <div>
      <SectionTitle>Fonts</SectionTitle>
      {error && <p style={{ color: 'var(--accent-error)', marginBottom: '12px' }}>{error}</p>}
      <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '16px' }}>
        Set one default heading font and one default body font. Customers can override from active fonts.
      </p>

      {fonts.map(f => (
        <Card key={f.id}>
          <Row>
            <div style={{ flex: 1 }}>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: `'${f.family}', sans-serif` }}>
                {f.family}
              </span>
              <span style={{ marginLeft: '8px', color: 'var(--text-muted)', fontSize: '12px' }}>{f.category}</span>
              {f.is_default_heading && <span style={{ ...tagStyle, background: 'var(--color-primary-100)', color: 'var(--color-primary-700)', marginLeft: '6px' }}>Default Heading</span>}
              {f.is_default_body    && <span style={{ ...tagStyle, background: 'var(--accent-info)', color: '#fff', marginLeft: '6px' }}>Default Body</span>}
            </div>
            <Badge active={f.is_active} />
            <ActionBtn onClick={() => update(f.id, { is_active: !f.is_active })} variant="ghost">
              {saving === f.id ? '…' : (f.is_active ? 'Deactivate' : 'Activate')}
            </ActionBtn>
            {!f.is_default_heading && (
              <ActionBtn onClick={() => update(f.id, { is_default_heading: true })} variant="primary">
                Heading Default
              </ActionBtn>
            )}
            {!f.is_default_body && (
              <ActionBtn onClick={() => update(f.id, { is_default_body: true })} variant="primary">
                Body Default
              </ActionBtn>
            )}
          </Row>
        </Card>
      ))}
    </div>
  );
}

// ── Tab: Icons ────────────────────────────────────────────────────────────────
function IconsTab() {
  const [styles, setStyles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await appearanceAPI.adminGetIconStyles();
      setStyles(res.data.icon_styles);
    } catch { setError('Failed to load icon styles'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const update = async (id, patch) => {
    setSaving(id);
    try {
      await appearanceAPI.adminUpdateIconStyle(id, patch);
      await load();
    } catch { setError('Save failed'); }
    finally { setSaving(null); }
  };

  if (loading) return <p style={{ color: 'var(--text-secondary)' }}>Loading…</p>;

  const iconPreview = { outline: '☐', filled: '■', rounded: '▣', duotone: '◫' };

  return (
    <div>
      <SectionTitle>Icon Styles</SectionTitle>
      {error && <p style={{ color: 'var(--accent-error)', marginBottom: '12px' }}>{error}</p>}
      {styles.map(s => (
        <Card key={s.id}>
          <Row>
            <span style={{ fontSize: '22px', width: '32px', textAlign: 'center' }}>
              {iconPreview[s.slug] ?? '◻'}
            </span>
            <div style={{ flex: 1 }}>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{s.name}</span>
              {s.is_default && <DefaultBadge />}
              {s.description && <span style={{ marginLeft: '8px', color: 'var(--text-muted)', fontSize: '12px' }}>{s.description}</span>}
            </div>
            <Badge active={s.is_active} />
            <ActionBtn onClick={() => update(s.id, { is_active: !s.is_active })} variant="ghost">
              {saving === s.id ? '…' : (s.is_active ? 'Deactivate' : 'Activate')}
            </ActionBtn>
            {!s.is_default && s.is_active && (
              <ActionBtn onClick={() => update(s.id, { is_default: true })} variant="primary">
                Set Default
              </ActionBtn>
            )}
          </Row>
        </Card>
      ))}
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const inputStyle = {
  padding: '8px 12px',
  borderRadius: '6px',
  border: '1px solid var(--border-primary)',
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  fontSize: '14px',
  width: '100%',
  boxSizing: 'border-box',
};

const tagStyle = {
  display: 'inline-block',
  padding: '2px 7px',
  borderRadius: '9999px',
  fontSize: '11px',
  fontWeight: 600,
};

// ── Main page ─────────────────────────────────────────────────────────────────
const TABS = [
  { key: 'colours',  label: 'Colour Themes'      },
  { key: 'fonts',    label: 'Fonts'               },
  { key: 'icons',    label: 'Icon Styles'         },
];

export default function AppearancePage() {
  const [activeTab, setActiveTab] = useState('colours');

  return (
    <div style={{ padding: '24px 28px', maxWidth: '900px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-heading)', margin: 0, fontSize: '24px' }}>
          Appearance
        </h1>
        <p style={{ color: 'var(--text-secondary)', margin: '4px 0 0', fontSize: '14px' }}>
          Manage colour themes, fonts and icon styles. Changes apply site-wide.
        </p>
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: '4px', borderBottom: '2px solid var(--border-primary)',
        marginBottom: '28px',
      }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
            padding: '8px 16px',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: activeTab === t.key ? 600 : 400,
            color: activeTab === t.key ? 'var(--color-primary-600)' : 'var(--text-secondary)',
            borderBottom: activeTab === t.key ? '2px solid var(--color-primary-500)' : '2px solid transparent',
            marginBottom: '-2px',
            transition: 'color 0.15s',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'colours' && <ColouringsTab />}
      {activeTab === 'fonts'   && <FontsTab />}
      {activeTab === 'icons'   && <IconsTab />}
    </div>
  );
}
