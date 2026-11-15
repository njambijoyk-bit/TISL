/**
 * The building blocks every Projects screen is made of. They use the selected theme's named values and nothing else (src/projects/README.md):
 * a screen never styles itself, so the whole module follows the colouring, the light or dark mode and the fonts the person chose.
 */

import { STATUS_TOKEN, tint } from './uiTokens';


export function Panel({ children, style, as = 'section', ...rest }) {
  const Tag = as;
  return (
    <Tag
      style={{ background: 'var(--surface-card)', border: '1px solid var(--line)', borderRadius: 14, padding: 18, color: 'var(--text-primary)', fontFamily: 'var(--font-body)', minWidth: 0, ...style }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function PanelTitle({ children, hint, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
      <div style={{ minWidth: 0 }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-heading)', color: 'var(--text-primary)' }}>{children}</h2>
        {hint && <p style={{ margin: '4px 0 0', fontSize: 13, lineHeight: 1.5, color: 'var(--text-secondary)' }}>{hint}</p>}
      </div>
      {right}
    </div>
  );
}

const BTN = {
  primary: { background: 'var(--color-primary-500)', color: 'var(--surface-card)', border: '1px solid var(--color-primary-500)' },
  plain: { background: 'var(--surface-card)', color: 'var(--text-primary)', border: '1px solid var(--line-strong)' },
  quiet: { background: 'transparent', color: 'var(--color-primary-500)', border: '1px solid transparent' },
  danger: { background: 'transparent', color: 'var(--status-error)', border: `1px solid ${tint('--status-error', 45)}` },
};

/** A button. Its visible text is its name, so the TISL function keys find it (New…, Save, Filters, Export, Trash, Configuration). */
export function Btn({ children, variant = 'plain', small = false, disabled = false, busy = false, type = 'button', style, ...rest }) {
  return (
    <button
      type={type}
      disabled={disabled || busy}
      style={{
        ...BTN[variant], display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, whiteSpace: 'nowrap',
        padding: small ? '4px 10px' : '8px 14px', borderRadius: 9, fontSize: small ? 12.5 : 13.5, fontWeight: 600, fontFamily: 'var(--font-body)',
        cursor: disabled || busy ? 'not-allowed' : 'pointer', opacity: disabled || busy ? 0.55 : 1, ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Chip({ children, status = 'neutral', style }) {
  const token = STATUS_TOKEN[status] || STATUS_TOKEN.neutral;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 9px', borderRadius: 999, fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap', background: tint(token, 13), color: `var(${token})`, ...style }}>
      {children}
    </span>
  );
}

const control = {
  width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 9, border: '1px solid var(--line-strong)', background: 'var(--surface-card)',
  color: 'var(--text-primary)', fontSize: 13.5, fontFamily: 'var(--font-body)',
};

/** A labelled control. `children` is the input; the label is tied to it by `htmlFor`. */
export function Field({ label, htmlFor, hint, children, style }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0, ...style }}>
      <label htmlFor={htmlFor} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</label>
      {children}
      {hint && <span style={{ fontSize: 12, lineHeight: 1.45, color: 'var(--text-secondary)' }}>{hint}</span>}
    </div>
  );
}

export function TextInput({ style, ...rest }) {
  return <input style={{ ...control, ...style }} {...rest} />;
}

export function SelectInput({ children, style, ...rest }) {
  return <select style={{ ...control, ...style }} {...rest}>{children}</select>;
}

/** Tabs inside a page. `tabs` = [{ key, label }]. */
export function Tabs({ tabs, value, onChange, label }) {
  return (
    <div role="tablist" aria-label={label} style={{ display: 'flex', gap: 2, flexWrap: 'wrap', borderBottom: '1px solid var(--line)', marginBottom: 16 }}>
      {tabs.map((tab) => {
        const on = tab.key === value;
        return (
          <button
            key={tab.key} type="button" role="tab" aria-selected={on} onClick={() => onChange(tab.key)}
            style={{
              padding: '8px 12px', background: 'transparent', border: 'none', borderBottom: `2px solid ${on ? 'var(--color-primary-500)' : 'transparent'}`, marginBottom: -1,
              color: on ? 'var(--color-primary-500)' : 'var(--text-secondary)', fontWeight: 600, fontSize: 13.5, fontFamily: 'var(--font-body)', cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/** A message in the page: something to know (info), a warning, a problem, or good news. */
export function Notice({ children, status = 'info', style }) {
  const token = STATUS_TOKEN[status] || STATUS_TOKEN.info;
  return (
    <div role={status === 'problem' ? 'alert' : 'status'} style={{ padding: '10px 12px', borderRadius: 10, fontSize: 13, lineHeight: 1.5, background: tint(token, 10), color: 'var(--text-primary)', border: `1px solid ${tint(token, 30)}`, ...style }}>
      {children}
    </div>
  );
}

/** A table that scrolls sideways inside itself on a narrow screen instead of pushing the page wider. */
export function DataTable({ children, minWidth = 560 }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', minWidth, borderCollapse: 'collapse', fontFamily: 'var(--font-body)' }}>{children}</table>
    </div>
  );
}
