// src/lib/finance-ui.jsx
export const purple = '#a855f7';
export const purpleDk = '#7c3aed';
export const purpleLt = 'rgba(168,85,247,0.08)';
export const purpleBd = 'rgba(168,85,247,0.2)';

export const Panel = ({ children, accent = false, style = {} }) => (
  <div style={{ background: 'var(--panel-bg, white)', border: `1px solid ${accent ? purpleBd : 'var(--border, #f3f4f6)'}`, borderRadius: 16, overflow: 'hidden', boxShadow: accent ? '0 0 0 1px rgba(168,85,247,0.12), 0 4px 20px rgba(168,85,247,0.08)' : '0 1px 4px rgba(0,0,0,0.04)', ...style }}>
    {children}
  </div>
);

export const Btn = ({ children, onClick, disabled, variant = 'primary', icon, size = 'md' }) => {
  const v = {
    primary: { background: `linear-gradient(135deg,${purple},${purpleDk})`, color: '#fff', border: 'none', boxShadow: '0 4px 12px rgba(168,85,247,0.3)' },
    success: { background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff', border: 'none', boxShadow: '0 4px 12px rgba(16,185,129,0.3)' },
    danger:  { background: 'linear-gradient(135deg,#ef4444,#dc2626)', color: '#fff', border: 'none', boxShadow: '0 4px 12px rgba(239,68,68,0.3)' },
    outline: { background: 'transparent', color: '#6b7280', border: '1.5px solid #e5e7eb', boxShadow: 'none' },
    ghost:   { background: purpleLt, color: purple, border: `1.5px solid ${purpleBd}`, boxShadow: 'none' },
  }[variant];
  const pad = size === 'sm' ? '6px 14px' : '9px 20px';
  return (
    <button onClick={onClick} disabled={disabled} style={{ ...v, display: 'inline-flex', alignItems: 'center', gap: 6, padding: pad, borderRadius: 10, fontSize: size==='sm'?'0.78rem':'0.83rem', fontWeight: 700, cursor: disabled?'not-allowed':'pointer', opacity: disabled?0.5:1, transition:'0.15s' }} onMouseEnter={e=>!disabled&&(e.currentTarget.style.transform='translateY(-1px)')} onMouseLeave={e=>e.currentTarget.style.transform='translateY(0)'}>
      {icon}{children}
    </button>
  );
};

export const SectionLabel = ({ children, icon: Icon }) => (
  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
    {Icon && <Icon size={14} color={purple} />}
    <p style={{ fontSize:'0.68rem', fontWeight:800, textTransform:'uppercase', letterSpacing:'0.14em', color:purple, margin:0 }}>{children}</p>
  </div>
);

export const Pill = ({ children, color=purple }) => (
  <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 10px', borderRadius:9999, fontSize:'0.7rem', fontWeight:700, color, background:`${color}18`, border:`1px solid ${color}30` }}>
    <span style={{ width:5, height:5, borderRadius:'50%', background:color, flexShrink:0 }} />{children}
  </span>
);