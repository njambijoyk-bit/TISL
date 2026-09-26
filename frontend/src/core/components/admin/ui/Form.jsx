import {
  colors, input, inputDisabled, focusRing, label as labelStyle, hint as hintStyle,
  btnPrimary, btnGhost,
} from '../../../../_shared/theme/tokens';

/**
 * Small form kit for the admin modals. Every control takes `error` and shows
 * it under the field; pass fieldErrors(error) results straight through.
 */

export function Field({ label, htmlFor, hint, error, children, style }) {
  return (
    <div style={style}>
      {label && <label htmlFor={htmlFor} style={labelStyle}>{label}</label>}
      {children}
      {error
        ? <p role="alert" style={{ ...hintStyle, color: colors.danger }}>{error}</p>
        : hint && <p style={hintStyle}>{hint}</p>}
    </div>
  );
}

const withError = (base, error) => (error ? { ...base, borderColor: colors.danger } : base);

export function TextInput({ disabled, error, style, ...props }) {
  return (
    <input
      {...props}
      disabled={disabled}
      aria-invalid={Boolean(error) || undefined}
      style={{ ...withError(disabled ? inputDisabled : input, error), ...style }}
      {...(disabled ? {} : focusRing)}
    />
  );
}

export function NumberInput(props) {
  return <TextInput type="number" inputMode="decimal" {...props} />;
}

export function SelectInput({ disabled, error, style, children, ...props }) {
  return (
    <select
      {...props}
      disabled={disabled}
      aria-invalid={Boolean(error) || undefined}
      style={{ ...withError(disabled ? inputDisabled : input, error), cursor: disabled ? 'not-allowed' : 'pointer', ...style }}
      {...(disabled ? {} : focusRing)}
    >
      {children}
    </select>
  );
}

export function TextArea({ disabled, error, rows = 3, style, ...props }) {
  return (
    <textarea
      {...props}
      rows={rows}
      disabled={disabled}
      style={{ ...withError(disabled ? inputDisabled : input, error), resize: 'vertical', ...style }}
      {...(disabled ? {} : focusRing)}
    />
  );
}

export function CheckboxRow({ checked, onChange, label, description, disabled }) {
  return (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: disabled ? 'default' : 'pointer' }}>
      <input
        type="checkbox"
        checked={Boolean(checked)}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 16, height: 16, marginTop: 2, accentColor: colors.primary }}
      />
      <span>
        <span style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: colors.text }}>{label}</span>
        {description && <span style={{ display: 'block', fontSize: '0.7rem', color: colors.textFaint, marginTop: 2 }}>{description}</span>}
      </span>
    </label>
  );
}

/** Two-column grid that drops to one column on narrow screens. */
export function FormGrid({ children, min = 200, gap = 14 }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap }}>
      {children}
    </div>
  );
}

export function FormStack({ children, gap = 14 }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap }}>{children}</div>;
}

/** Cancel + primary action, right-aligned. */
export function ModalActions({ onCancel, submitLabel, busyLabel, busy, onSubmit, danger = false, disabled = false }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
      <button type="button" onClick={onCancel} style={btnGhost}>Cancel</button>
      <button
        type={onSubmit ? 'button' : 'submit'}
        onClick={onSubmit}
        disabled={busy || disabled}
        style={{
          ...btnPrimary,
          ...(danger ? { background: colors.danger, boxShadow: 'none' } : {}),
          opacity: busy || disabled ? 0.6 : 1,
          cursor: busy || disabled ? 'not-allowed' : 'pointer',
        }}
      >
        {busy ? (busyLabel ?? 'Saving…') : submitLabel}
      </button>
    </div>
  );
}

/** Banner for a server message that isn't tied to one field. */
export function FormError({ message }) {
  if (!message) return null;
  return (
    <p role="alert" style={{
      margin: 0, padding: '10px 12px', borderRadius: 8, fontSize: '0.78rem',
      background: colors.dangerBg, color: colors.dangerText, lineHeight: 1.5,
    }}>
      {message}
    </p>
  );
}
