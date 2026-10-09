import './customer.css';

import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import reminderPrefsAPI from '../../../_shared/api/reminderPrefs';

const WHAT = { cart: 'cart reminders', price: 'price alerts', all: 'cart reminders and price alerts' };

/** The link at the bottom of a cart reminder or price alert. It shows what it will stop; one button does it. Works without signing in. */
export default function ReminderStop() {
  const { token } = useParams();
  const [params] = useSearchParams();
  const kind = ['cart', 'price'].includes(params.get('kind')) ? params.get('kind') : 'all';
  const [state, setState] = useState('loading');   // loading | ready | done | bad
  const [prefs, setPrefs] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    reminderPrefsAPI.peek(token).then((r) => { if (!live) return; setPrefs(r); setState(kind === 'all' ? (!r.cart && !r.price ? 'done' : 'ready') : (!r[kind] ? 'done' : 'ready')); }).catch(() => live && setState('bad'));
    return () => { live = false; };
  }, [token, kind]);

  const stop = async (what) => {
    setBusy(true);
    try { setPrefs(await reminderPrefsAPI.stop(token, what)); setState('done'); } catch { setState('bad'); } finally { setBusy(false); }
  };
  const button = { padding: '11px 20px', borderRadius: 10, border: 'none', fontWeight: 800, color: 'white', background: 'var(--color-primary-500)', fontFamily: 'inherit', cursor: busy ? 'wait' : 'pointer' };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />
      <main className="container mx-auto px-4 py-12" style={{ maxWidth: 520 }}>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white" style={{ marginBottom: 12 }}>Shop reminders</h1>
        {state === 'loading' && <p>Checking your link…</p>}
        {state === 'bad' && <p role="alert">This link is not valid any more. You can also change this in your profile under Notification settings.</p>}
        {state === 'ready' && (
          <>
            <p style={{ marginBottom: 16 }}>Stop {WHAT[kind]} from us?</p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => stop(kind)} disabled={busy} style={button}>{busy ? 'Stopping…' : `Stop ${WHAT[kind]}`}</button>
              {kind !== 'all' && <button type="button" onClick={() => stop('all')} disabled={busy} style={{ ...button, background: 'transparent', color: 'inherit', border: '1.5px solid var(--line, #d1d5db)' }}>Stop both kinds</button>}
            </div>
          </>
        )}
        {state === 'done' && (
          <p role="status">
            Done. You will not get {prefs && !prefs.cart && !prefs.price ? WHAT.all : WHAT[kind]} from us any more. You can turn {kind === 'all' ? 'them' : 'it'} back on any time in your profile under Notification settings.{' '}
            <Link to="/products" style={{ color: 'var(--color-primary-500)' }}>Keep shopping</Link>
          </p>
        )}
      </main>
      <Footer />
    </div>
  );
}
