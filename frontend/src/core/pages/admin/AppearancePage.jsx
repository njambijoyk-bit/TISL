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

function ActionBtn({ onClick, children, variant = 'ghost' }) {
  const styles = {
    ghost: {
      padding: '4px 12px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer',
      border: '1px solid var(--border-primary)',
      background: 'transparent', color: 'var(--text-primary)',
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
  return <button style={styles[variant]} onClick={onClick}>{children}</button>;
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

// ── Tab: Colour Themes ────────────────────────────────────────────────────────
function ColouringsTab() {
  const { setColouring, activeColouringId } = useTheme();
  const [colourings, setColourings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [error, setError] = useState('');

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
        const c = colourings.find(c => c.id === id);
        if (c) setColouring(id);
      }
    } catch { setError('Save failed'); }
    finally { setSaving(null); }
  };

  const createNew = async () => {
    if (!newName || !newSlug) return;
    setSaving('new');
    try {
      await appearanceAPI.adminCreateColouring({
        name: newName, slug: newSlug,
        light_tokens: { '--color-primary-500': '#a855f7', '--bg-primary': '#ffffff', '--text-primary': '#111827' },
        dark_tokens:  { '--color-primary-500': '#a855f7', '--bg-primary': '#111827', '--text-primary': '#f9fafb' },
      });
      setNewName(''); setNewSlug(''); setShowNew(false);
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
            <ActionBtn onClick={() => toggle(c.id, 'is_active', !c.is_active)} variant="ghost">
              {saving === c.id ? '…' : (c.is_active ? 'Deactivate' : 'Activate')}
            </ActionBtn>
            {!c.is_default && (
              <ActionBtn onClick={() => toggle(c.id, 'is_default', true)} variant="primary">
                Set Default
              </ActionBtn>
            )}
          </Row>
        </Card>
      ))}

      {showNew ? (
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <input
              placeholder="Name (e.g. Ocean Blue)"
              value={newName}
              onChange={e => { setNewName(e.target.value); setNewSlug(e.target.value.toLowerCase().replace(/\s+/g, '-')); }}
              style={inputStyle}
            />
            <input placeholder="Slug (auto-filled)" value={newSlug} onChange={e => setNewSlug(e.target.value)} style={inputStyle} />
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
              Colouring will be created with placeholder tokens. Edit tokens directly in the DB to customise colours.
            </p>
            <Row>
              <ActionBtn onClick={createNew} variant="primary">{saving === 'new' ? 'Creating…' : 'Create'}</ActionBtn>
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

// ── Tab: Component Layouts ────────────────────────────────────────────────────
function LayoutsTab() {
  const [layouts, setLayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await appearanceAPI.adminGetLayouts();
      setLayouts(res.data.layouts);
    } catch { setError('Failed to load layouts'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const update = async (id, patch) => {
    setSaving(id);
    try {
      await appearanceAPI.adminUpdateLayout(id, patch);
      await load();
    } catch { setError('Save failed'); }
    finally { setSaving(null); }
  };

  if (loading) return <p style={{ color: 'var(--text-secondary)' }}>Loading…</p>;

  // Group by component_type
  const grouped = layouts.reduce((acc, l) => {
    (acc[l.component_type] = acc[l.component_type] || []).push(l);
    return acc;
  }, {});

  const typeLabel = (t) => t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  return (
    <div>
      <SectionTitle>Component Layouts</SectionTitle>
      {error && <p style={{ color: 'var(--accent-error)', marginBottom: '12px' }}>{error}</p>}
      <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '16px' }}>
        Layouts control arrangement only — colours come from the active theme. Set one default per component type.
      </p>

      {Object.entries(grouped).map(([type, items]) => (
        <div key={type} style={{ marginBottom: '24px' }}>
          <h4 style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
            {typeLabel(type)}
          </h4>
          {items.map(l => (
            <Card key={l.id}>
              <Row>
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{l.label}</span>
                  {l.is_default && <DefaultBadge />}
                  <span style={{ marginLeft: '8px', color: 'var(--text-muted)', fontSize: '12px' }}>{l.variant_key}</span>
                  {l.description && <p style={{ color: 'var(--text-secondary)', fontSize: '12px', margin: '4px 0 0' }}>{l.description}</p>}
                </div>
                <Badge active={l.is_active} />
                <ActionBtn onClick={() => update(l.id, { is_active: !l.is_active })} variant="ghost">
                  {saving === l.id ? '…' : (l.is_active ? 'Deactivate' : 'Activate')}
                </ActionBtn>
                {!l.is_default && l.is_active && (
                  <ActionBtn onClick={() => update(l.id, { is_default: true })} variant="primary">
                    Set Default
                  </ActionBtn>
                )}
              </Row>
            </Card>
          ))}
        </div>
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
  { key: 'layouts',  label: 'Component Layouts'   },
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
          Manage colour themes, fonts, icon styles and component layouts. Changes apply site-wide.
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
      {activeTab === 'layouts' && <LayoutsTab />}
    </div>
  );
}
