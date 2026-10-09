import { Field, TextInput } from '../ui/Form';
import { colors } from '../../../../_shared/theme/tokens';

/**
 * A password or key. Write-only: the server never sends the value back, only whether one is saved and its last four characters.
 * Blank on save = keep the saved one. "Remove" empties it (the old one stays in the history, where only the owner can delete it).
 */
export default function SecretField({ label, hint, value, saved, onChange, clearing, onClear, error }) {
  return (
    <Field label={label} hint={hint} error={error}>
      <TextInput
        type="password"
        autoComplete="new-password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={saved?.set && !clearing ? `${saved.hint} saved, leave blank to keep it` : 'Not set'}
        disabled={clearing}
        aria-label={label}
      />
      {saved?.set && (
        <div style={{ marginTop: 4, fontSize: '0.7rem', color: colors.textFaint }}>
          {clearing
            ? <>It will be emptied when you save. <button type="button" onClick={() => onClear(false)} style={{ background: 'none', border: 'none', padding: 0, color: colors.primary, cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}>Keep it</button></>
            : <button type="button" onClick={() => onClear(true)} style={{ background: 'none', border: 'none', padding: 0, color: colors.danger, cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}>Remove the saved one</button>}
        </div>
      )}
    </Field>
  );
}
