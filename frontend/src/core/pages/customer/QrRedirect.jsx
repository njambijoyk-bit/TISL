import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import eventTicketsAPI from '../../../_shared/api/eventTickets';

/** A phone camera opened the address in one of our QR codes (/q/…): ask the server what it is for and go there. */
export default function QrRedirect() {
  const { '*': code } = useParams();
  const [to, setTo] = useState(null);
  const [bad, setBad] = useState(false);

  useEffect(() => {
    let live = true;
    eventTicketsAPI.resolve(code).then((r) => { if (live) setTo(r.path); }).catch(() => { if (live) setBad(true); });
    return () => { live = false; };
  }, [code]);

  if (to) return <Navigate to={to} replace />;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header />
      <main style={{ flex: 1, maxWidth: 480, margin: '0 auto', padding: '64px 16px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        {bad ? <><p style={{ fontWeight: 800, color: 'var(--text-primary)' }}>This code is not valid.</p><p>It may have been mistyped, or it is not one of ours. <Link to="/" style={{ color: 'var(--color-primary-500)', fontWeight: 700 }}>Go to the home page</Link></p></> : <p>One moment…</p>}
      </main>
      <Footer />
    </div>
  );
}
