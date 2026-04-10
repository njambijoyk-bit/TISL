import { TrendingUp, TrendingDown } from 'lucide-react';

const COLOR_MAP = {
  primary: '#a855f7',
  success: '#10b981',
  warning: '#f59e0b',
  danger:  '#ef4444',
  info:    '#3b82f6',
};

export default function StatsCard({
  title,
  value,
  icon: Icon,
  trend,
  trendValue,
  color = 'primary',
  loading = false,
}) {
  const accent = COLOR_MAP[color] || COLOR_MAP.primary;

  return (
    <div style={{
      borderRadius: 16, border: '1px solid #f3f4f6',
      padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Top accent bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: accent, opacity: 0.6 }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginTop: 4 }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: '0.78rem', fontWeight: 600, color: '#9ca3af', margin: '0 0 8px' }}>{title}</p>
          {loading ? (
            <div style={{ height: 32, width: 80, borderRadius: 8, background: '#f3f4f6' }} />
          ) : (
            <p style={{ fontSize: '1.9rem', fontWeight: 800, color: '#c084fc', margin: 0, letterSpacing: '-0.03em', lineHeight: 1 }}>
              {value}
            </p>
          )}
          {trend && trendValue && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8, fontSize: '0.78rem', fontWeight: 600, color: trend === 'up' ? '#10b981' : '#ef4444' }}>
              {trend === 'up'
                ? <TrendingUp size={14} />
                : <TrendingDown size={14} />}
              {trendValue}
            </div>
          )}
        </div>

        {Icon && (
          <div style={{ width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${accent}14`, border: `1px solid ${accent}25`, flexShrink: 0 }}>
            <Icon size={22} color={accent} />
          </div>
        )}
      </div>
    </div>
  );
}