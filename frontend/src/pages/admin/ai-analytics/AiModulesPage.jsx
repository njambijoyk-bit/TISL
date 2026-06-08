import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Puzzle, ChevronRight, Loader2, ToggleLeft, ToggleRight,
  Brain, ShoppingCart, FolderKanban, Calendar, BarChart3,
  Users, Package, Zap, AlertCircle,
} from 'lucide-react';
import GeneralLayout from '../../../components/layout/GeneralLayout';
import aiAnalyticsAPI from '../../../api/aiAnalytics';

// ── Design tokens (TISL purple system) ───────────────────────────────────────
const P  = '#a855f7';
const PL = 'rgba(168,85,247,0.08)';
const PB = 'rgba(168,85,247,0.18)';
const PD = '#7c3aed';

const card = {
  background: 'var(--bg-secondary, #ffffff)',
  borderRadius: 14,
  border: '1px solid var(--border, #e5e7eb)',
  boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
};

// ── Module icon map ───────────────────────────────────────────────────────────
const MODULE_ICONS = {
  orders:    { icon: ShoppingCart, color: '#a855f7' },
  projects:  { icon: FolderKanban, color: '#3b82f6' },
  bookings:  { icon: Calendar,     color: '#10b981' },
  reports:   { icon: BarChart3,    color: '#f59e0b' },
  customers: { icon: Users,        color: '#06b6d4' },
  inventory: { icon: Package,      color: '#8b5cf6' },
  work:      { icon: Zap,          color: '#ec4899' },
};

const getModuleMeta = (key) =>
  MODULE_ICONS[key] ?? { icon: Brain, color: '#6b7280' };

// ── Breadcrumb ────────────────────────────────────────────────────────────────
const Breadcrumb = ({ items }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', marginBottom: 24, color: 'var(--text-secondary, #6b7280)' }}>
    {items.map((item, i) => (
      <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {item.onClick ? (
          <button onClick={item.onClick} style={{ background: 'none', border: 'none', cursor: 'pointer', color: P, fontWeight: 700, fontSize: '0.78rem', fontFamily: 'inherit', padding: 0 }}>
            {item.label}
          </button>
        ) : (
          <span style={{ color: 'var(--text-primary, #111827)', fontWeight: 600 }}>{item.label}</span>
        )}
        {i < items.length - 1 && <ChevronRight size={12} style={{ color: 'var(--text-secondary, #6b7280)' }} />}
      </span>
    ))}
  </div>
);

// ── Toggle switch ─────────────────────────────────────────────────────────────
function Toggle({ checked, onChange, loading, moduleColor }) {
  const activeColor = moduleColor || P;
  return (
    <button
      onClick={onChange}
      disabled={loading}
      style={{
        position: 'relative',
        width: 44,
        height: 24,
        borderRadius: 12,
        border: 'none',
        background: checked ? activeColor : 'var(--border, #d1d5db)',
        cursor: loading ? 'not-allowed' : 'pointer',
        transition: 'background 220ms ease',
        flexShrink: 0,
        opacity: loading ? 0.6 : 1,
        padding: 0,
      }}
    >
      <span style={{
        position: 'absolute',
        top: 3,
        left: checked ? 23 : 3,
        width: 18,
        height: 18,
        borderRadius: '50%',
        background: '#fff',
        boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
        transition: 'left 220ms ease',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {loading && <Loader2 size={10} style={{ color: activeColor, animation: 'spin 0.8s linear infinite' }} />}
      </span>
    </button>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function AiModulesPage() {
  const navigate = useNavigate();
  const [modules,   setModules]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [toggling,  setToggling]  = useState(null); // module id being toggled
  const [error,     setError]     = useState(null);
  const [flashId,   setFlashId]   = useState(null); // brief success flash

  const load = async () => {
    try {
      const data = await aiAnalyticsAPI.getModules();
      setModules(data);
    } catch {
      setError('Failed to load modules.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleToggle = async (mod) => {
    setToggling(mod.id);
    try {
      const res = await aiAnalyticsAPI.toggleModule(mod.id);
      setModules(prev =>
        prev.map(m => m.id === mod.id ? { ...m, is_enabled: res.is_enabled } : m)
      );
      setFlashId(mod.id);
      setTimeout(() => setFlashId(null), 1200);
    } catch {
      setError('Failed to toggle module.');
    } finally {
      setToggling(null);
    }
  };

  const enabledCount  = modules.filter(m => m.is_enabled).length;
  const disabledCount = modules.length - enabledCount;

  return (
    <GeneralLayout>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes flashBorder {
          0%   { box-shadow: 0 0 0 0 rgba(168,85,247,0.4); }
          50%  { box-shadow: 0 0 0 4px rgba(168,85,247,0.15); }
          100% { box-shadow: 0 1px 4px rgba(0,0,0,0.05); }
        }
      `}</style>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '32px 24px' }}>

        <Breadcrumb items={[
          { label: 'Settings',     onClick: () => navigate('/admin/settings/general') },
          { label: 'AI Analytics', onClick: () => navigate('/admin/ai-analytics') },
          { label: 'Modules' },
        ]} />

        {/* ── Page header ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 28 }}>
          <div style={{ width: 50, height: 50, borderRadius: 13, background: PL, border: `1.5px solid ${PB}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Puzzle size={22} color={P} />
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary, #111827)', margin: '0 0 4px', letterSpacing: '-0.025em' }}>
              Analytics Modules
            </h1>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #6b7280)', margin: 0 }}>
              Enable or disable AI analytics per module. Only enabled modules will generate sessions and incur token costs.
            </p>
          </div>
        </div>

        {/* ── Summary strip ── */}
        {!loading && modules.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
            {[
              { label: 'Total',    value: modules.length, color: '#6b7280' },
              { label: 'Enabled',  value: enabledCount,   color: '#10b981' },
              { label: 'Disabled', value: disabledCount,  color: '#9ca3af' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ ...card, padding: '14px 18px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color, lineHeight: 1, marginBottom: 4 }}>{value}</div>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-secondary, #9ca3af)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 10, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', marginBottom: 20 }}>
            <AlertCircle size={15} style={{ color: '#ef4444', flexShrink: 0 }} />
            <span style={{ fontSize: '0.82rem', color: '#991b1b' }}>{error}</span>
          </div>
        )}

        {/* ── Loading ── */}
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0', gap: 10 }}>
            <Loader2 size={20} style={{ color: P, animation: 'spin 0.8s linear infinite' }} />
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary, #9ca3af)' }}>Loading modules…</span>
          </div>
        ) : modules.length === 0 ? (
          <div style={{ ...card, padding: 48, textAlign: 'center' }}>
            <Puzzle size={36} style={{ color: '#d1d5db', margin: '0 auto 12px', display: 'block' }} />
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #9ca3af)', margin: 0 }}>No modules found. Seed the <code>ai_analytics_modules</code> table to get started.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {modules.map((mod, idx) => {
              const { icon: Icon, color } = getModuleMeta(mod.key);
              const isToggling = toggling === mod.id;
              const isFlashing = flashId === mod.id;

              return (
                <div
                  key={mod.id}
                  style={{
                    ...card,
                    padding: '18px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    animation: `fadeSlideIn 0.25s ease both`,
                    animationDelay: `${idx * 40}ms`,
                    ...(isFlashing ? { animation: 'flashBorder 1.2s ease' } : {}),
                    transition: 'border-color 200ms',
                    borderColor: mod.is_enabled ? `${color}30` : 'var(--border, #e5e7eb)',
                  }}
                >
                  {/* Icon */}
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: `${color}12`, border: `1px solid ${color}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={18} style={{ color }} />
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary, #111827)' }}>
                        {mod.label}
                      </span>
                      {/* Tech key badge */}
                      <span style={{ fontSize: '0.6rem', fontFamily: 'monospace', fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: 'var(--bg-tertiary, #f3f4f6)', border: '1px solid var(--border, #e5e7eb)', color: 'var(--text-secondary, #9ca3af)', letterSpacing: '0.08em' }}>
                        {mod.key}
                      </span>
                    </div>
                    {mod.description && (
                      <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary, #6b7280)', lineHeight: 1.5 }}>
                        {mod.description}
                      </p>
                    )}
                  </div>

                  {/* Status pill */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, background: mod.is_enabled ? `${color}10` : 'rgba(107,114,128,0.08)', border: `1px solid ${mod.is_enabled ? `${color}25` : 'rgba(107,114,128,0.15)'}`, flexShrink: 0 }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: mod.is_enabled ? color : '#9ca3af' }} />
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: mod.is_enabled ? color : '#9ca3af', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                      {mod.is_enabled ? 'ON' : 'OFF'}
                    </span>
                  </div>

                  {/* Toggle */}
                  <Toggle
                    checked={mod.is_enabled}
                    onChange={() => handleToggle(mod)}
                    loading={isToggling}
                    moduleColor={color}
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* ── Footer hint ── */}
        {!loading && modules.length > 0 && (
          <p style={{ marginTop: 20, fontSize: '0.72rem', color: 'var(--text-secondary, #9ca3af)', textAlign: 'center' }}>
            Changes take effect immediately. Disabled modules skip AI calls entirely — no tokens consumed.
          </p>
        )}

      </div>
    </GeneralLayout>
  );
}