import { Wand2 } from 'lucide-react';
import toast from 'react-hot-toast';

// 16 characters with a letter of each kind, no look-alikes (0/O, 1/l/I), drawn with the browser's secure random numbers
export function suggestPassword() {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%&*?'];
  const rnd = (n) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
  const pick = (chars) => chars[rnd(chars.length)];
  const all = sets.join('');
  const out = [...sets.map(pick), ...Array.from({ length: 12 }, () => pick(all))];
  for (let i = out.length - 1; i > 0; i -= 1) { const j = rnd(i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out.join('');
}

/**
 * "Suggest a password" link for any new-password field. `onPick(password)` should fill the new and confirm fields and show them;
 * the password is also copied so it can be pasted into a password manager or written down.
 */
export default function SuggestPassword({ onPick, style }) {
  const click = () => {
    const pw = suggestPassword();
    onPick(pw);
    navigator.clipboard?.writeText(pw).then(
      () => toast.success('Suggested password filled in and copied. Keep it somewhere safe.'),
      () => toast.success('Suggested password filled in. Write it down before you continue.'),
    );
  };
  return (
    <button type="button" onClick={click}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '0.72rem', fontWeight: 700, textTransform: 'none', letterSpacing: 0, color: 'var(--color-primary-500)', fontFamily: 'inherit', ...style }}>
      <Wand2 size={12} /> Suggest a password
    </button>
  );
}
