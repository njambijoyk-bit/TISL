import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Stamp } from 'lucide-react';
import sealAPI from '../../../_shared/api/seal';
import { errMsg } from '../../../_shared/store/helpers/apiState';

const btn = { padding: '6px 12px', borderRadius: 8, fontSize: '0.76rem', fontWeight: 700, border: '1.5px solid var(--line)', background: 'transparent', color: 'inherit', cursor: 'pointer', fontFamily: 'inherit' };
const primary = { ...btn, border: 'none', background: 'var(--color-primary-600)', color: 'white' };
const input = { padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--line)', fontSize: '0.84rem', background: 'transparent', color: 'inherit', fontFamily: 'inherit', minWidth: 0, flex: '1 1 200px' };

/**
 * "My seal phrase": a few words you choose, shown on the sign-in page after you type your email - but only on a browser you have signed in from before. If the page does not show your words, it may not be the real TISL.
 * A small extra, and honestly so: a clever copy of the page that passes your typing on can not know them, but the real protection is your passkey.
 */
export default function SealPhraseCard() {
  const [state, setState] = useState(null);   // { ready, phrase }
  const [phrase, setPhrase] = useState('');
  const [password, setPassword] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => sealAPI.mine().then((r) => { setState(r); setPhrase(r.phrase ?? ''); }).catch(() => {});
  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await sealAPI.save(phrase, password);
      toast.success(r.message);
      setPassword('');
      setEditing(false);
      await load();
    } catch (err) {
      toast.error(errMsg(err, 'Could not save'));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => { try { await sealAPI.clear(); toast.success('Removed'); setEditing(false); await load(); } catch (err) { toast.error(errMsg(err, 'Could not remove')); } };

  if (!state || state.ready === false) return null;

  return (
    <div style={{ display: 'grid', gap: 10 }} data-testid="seal-card">
      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        <Stamp size={13} style={{ verticalAlign: -2 }} /> Choose a few words only you know. The sign-in page shows them after you type your email, on browsers you have signed in from before. If they are not there, check the address before you type your password.
        A small extra: the real protection is your passkey.
      </p>
      {!editing ? (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 800, fontSize: '0.9rem' }} data-testid="seal-current">{state.phrase ? `“${state.phrase}”` : 'No phrase chosen'}</span>
          <button type="button" style={primary} onClick={() => setEditing(true)} data-testid="seal-edit">{state.phrase ? 'Change it' : 'Choose a phrase'}</button>
          {state.phrase && <button type="button" style={btn} onClick={remove}>Remove it</button>}
        </div>
      ) : (
        <form onSubmit={save} style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <input aria-label="Seal phrase" style={input} value={phrase} onChange={(e) => setPhrase(e.target.value)} maxLength={40} placeholder="for example: blue elephant 42" autoFocus />
            <input aria-label="Your password" type="password" autoComplete="current-password" style={input} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="submit" style={primary} disabled={busy || phrase.trim().length < 3 || !password} data-testid="seal-save">Save</button>
            <button type="button" style={btn} onClick={() => { setEditing(false); setPhrase(state.phrase ?? ''); setPassword(''); }}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
