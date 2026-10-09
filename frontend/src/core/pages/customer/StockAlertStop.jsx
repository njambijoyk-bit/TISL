import './customer.css';

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import stockAlertsAPI from '../../../_shared/api/stockAlerts';

/** The link at the bottom of a "back in stock" message. Opening it shows what it is for; one button stops the alerts. */
export default function StockAlertStop() {
  const { token } = useParams();
  const [info, setInfo] = useState(null);
  const [state, setState] = useState('loading');   // loading | ready | stopped | bad
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    stockAlertsAPI.peek(token).then((r) => { if (!live) return; setInfo(r); setState(r.status === 'stopped' ? 'stopped' : 'ready'); }).catch(() => live && setState('bad'));
    return () => { live = false; };
  }, [token]);

  const stop = async () => {
    setBusy(true);
    try { await stockAlertsAPI.stop(token); setState('stopped'); } catch { setState('bad'); } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />
      <main className="container mx-auto px-4 py-12" style={{ maxWidth: 520 }}>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white" style={{ marginBottom: 12 }}>Stock alerts</h1>
        {state === 'loading' && <p>Checking your link…</p>}
        {state === 'bad' && <p role="alert">This link is not valid any more. If you still get alerts you do not want, reply to one of the emails and we will stop them.</p>}
        {state === 'ready' && (
          <>
            <p style={{ marginBottom: 16 }}>You asked us to email you when <strong>{info?.product ?? 'this item'}</strong> is back in stock.</p>
            <button type="button" onClick={stop} disabled={busy} style={{ padding: '11px 20px', borderRadius: 10, border: 'none', fontWeight: 800, color: 'white', background: 'var(--color-primary-500)', fontFamily: 'inherit', cursor: busy ? 'wait' : 'pointer' }}>{busy ? 'Stopping…' : 'Stop these alerts'}</button>
          </>
        )}
        {state === 'stopped' && <p role="status">Done. You will not get alerts for <strong>{info?.product ?? 'this item'}</strong> any more. <Link to="/products" style={{ color: 'var(--color-primary-500)' }}>Keep shopping</Link></p>}
      </main>
      <Footer />
    </div>
  );
}
