import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Brain, Key, Puzzle, ClipboardList, ChevronRight,
  CheckCircle, AlertCircle, Zap, Activity,
} from 'lucide-react';
import GeneralLayout from '../../../components/layout/GeneralLayout';
import aiAnalyticsAPI from '../../../api/aiAnalytics';

const purple   = '#a855f7';
const purpleLt = 'rgba(168,85,247,0.08)';
const purpleBd = 'rgba(168,85,247,0.2)';

const card = {
  background: 'var(--bg-secondary, white)',
  borderRadius: 14,
  border: '1px solid var(--border, #e5e7eb)',
  boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
  padding: 24,
};

const Breadcrumb = ({ items }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', marginBottom: 24, color: 'var(--text-secondary, #6b7280)' }}>
    {items.map((item, i) => (
      <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {item.to ? (
          <button onClick={item.onClick} style={{ background: 'none', border: 'none', cursor: 'pointer', color: purple, fontWeight: 700, fontSize: '0.78rem', fontFamily: 'inherit', padding: 0 }}>
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

export default function AiAnalyticsSettings() {
  const navigate = useNavigate();
  const [stats, setStats]     = useState(null);
  const [modules, setModules] = useState([]);
  const [activeKey, setActiveKey] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      aiAnalyticsAPI.getSessionStats().catch(() => null),
      aiAnalyticsAPI.getModules().catch(() => []),
      aiAnalyticsAPI.getKeys().catch(() => []),
    ]).then(([statsRes, modulesRes, keysRes]) => {
      setStats(statsRes);
      setModules(modulesRes);
      setActiveKey(keysRes.find(k => k.is_active) ?? null);
    }).finally(() => setLoading(false));
  }, []);

  const NAV_CARDS = [
    {
      key: 'keys',
      label: 'API Key Management',
      description: 'Add, activate and manage provider keys across Anthropic, Gemini and OpenAI',
      icon: Key,
      color: '#a855f7',
      to: '/admin/ai-analytics/keys',
    },
    {
      key: 'modules',
      label: 'Analytics Modules',
      description: 'Enable or disable AI analytics per module — projects, bookings, work and more',
      icon: Puzzle,
      color: '#3b82f6',
      to: '/admin/ai-analytics/modules',
    },
    {
      key: 'sessions',
      label: 'Session Logs',
      description: 'Full accountability trail — who ran what, which key, tokens used and cost',
      icon: ClipboardList,
      color: '#10b981',
      to: '/admin/ai-analytics/sessions',
    },
  ];

  const fmtCost = (n) => `$${Number(n ?? 0).toFixed(4)}`;
  const fmtNum  = (n) => Number(n ?? 0).toLocaleString();

  return (
    <GeneralLayout>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>

        <Breadcrumb items={[
          { label: '⚙ SETTINGS', onClick: () => navigate('/admin/settings/general') },
          { label: 'AI Analytics' },
        ]} />

        {/* ── Page header ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 32 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: purpleLt, border: `1.5px solid ${purpleBd}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Brain size={24} color={purple} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary, #111827)', margin: '0 0 4px', letterSpacing: '-0.025em' }}>
              AI Analytics
            </h1>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary, #6b7280)', margin: 0 }}>
              Configure provider keys, manage modules and monitor usage across your platform
            </p>
          </div>
        </div>

        {/* ── Active key banner ── */}
        <div style={{
          ...card,
          marginBottom: 24,
          padding: '14px 20px',
          background: activeKey ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)',
          border: `1px solid ${activeKey ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          {activeKey
            ? <CheckCircle size={18} style={{ color: '#10b981', flexShrink: 0 }} />
            : <AlertCircle size={18} style={{ color: '#ef4444', flexShrink: 0 }} />
          }
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700, color: activeKey ? '#065f46' : '#991b1b' }}>
              {activeKey ? `Active: ${activeKey.label} (${activeKey.provider})` : 'No active AI key configured'}
            </p>
            <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: activeKey ? '#047857' : '#b91c1c' }}>
              {activeKey ? `Last used: ${activeKey.last_used_at ? new Date(activeKey.last_used_at).toLocaleDateString() : 'Never'}` : 'Go to API Key Management to add and activate a key'}
            </p>
          </div>
          <button onClick={() => navigate('/admin/ai-analytics/keys')} style={{ padding: '6px 14px', borderRadius: 8, border: `1px solid ${activeKey ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`, background: 'transparent', color: activeKey ? '#10b981' : '#ef4444', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
            Manage Keys
          </button>
        </div>

        {/* ── Stat strip ── */}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
            {[
              { label: 'Total Sessions', value: fmtNum(stats.total_sessions), icon: Activity,      color: '#a855f7' },
              { label: 'Total Cost',     value: fmtCost(stats.total_cost),    icon: Zap,           color: '#10b981' },
              { label: 'Total Tokens',   value: fmtNum(stats.total_tokens),   icon: Brain,         color: '#3b82f6' },
              { label: 'Failed',         value: fmtNum(stats.failed),         icon: AlertCircle,   color: '#ef4444' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} style={{ ...card, padding: '14px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-secondary, #9ca3af)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={13} style={{ color }} />
                  </div>
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary, #111827)', lineHeight: 1 }}>{value}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Module status strip ── */}
        {modules.length > 0 && (
          <div style={{ ...card, marginBottom: 24, padding: '16px 20px' }}>
            <p style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary, #9ca3af)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 12px' }}>
              Module Status
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {modules.map(mod => (
                <div key={mod.key} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 600, background: mod.is_enabled ? 'rgba(16,185,129,0.08)' : 'rgba(107,114,128,0.08)', border: `1px solid ${mod.is_enabled ? 'rgba(16,185,129,0.2)' : 'rgba(107,114,128,0.15)'}`, color: mod.is_enabled ? '#047857' : '#6b7280' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: mod.is_enabled ? '#10b981' : '#9ca3af' }} />
                  {mod.label}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Nav cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          {NAV_CARDS.map(({ key, label, description, icon: Icon, color, to }) => (
            <button key={key} onClick={() => navigate(to)} style={{ ...card, textAlign: 'left', cursor: 'pointer', border: `1px solid var(--border, #e5e7eb)`, transition: 'all 150ms', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', gap: 12 }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = color; e.currentTarget.style.boxShadow = `0 4px 16px ${color}18`; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border, #e5e7eb)'; e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.05)'; }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: `${color}18`, border: `1px solid ${color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={18} style={{ color }} />
                </div>
                <ChevronRight size={16} style={{ color: 'var(--text-secondary, #9ca3af)' }} />
              </div>
              <div>
                <p style={{ margin: '0 0 4px', fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary, #111827)' }}>{label}</p>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary, #6b7280)', lineHeight: 1.5 }}>{description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </GeneralLayout>
  );
}