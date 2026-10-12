import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Award, BookMarked, BookOpen, CalendarClock, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import coursesPublicAPI from '../../../_shared/api/coursesPublic';
import useAuthStore from '../../../_shared/store/authStore';
import { card, chip, openCertificate, primaryBtn } from '../../components/learnStyle';

/** My learning: everything the signed-in person can open, how far they are, and what is coming up. */
export default function LearnLibraryPage() {
  const user = useAuthStore((s) => s.user);
  const [d, setD] = useState(null);
  const [failed, setFailed] = useState(false);
  const [books, setBooks] = useState([]);
  useEffect(() => { if (user) { coursesPublicAPI.library().then(setD).catch(() => setFailed(true)); coursesPublicAPI.myBooks().then((r) => setBooks(r.orders)).catch(() => setBooks([])); } }, [user]);
  const certificate = (c) => coursesPublicAPI.certificatePdf(c.id).then(openCertificate).catch((e) => toast.error(errMsg(e, 'Could not open the certificate.'), { duration: 8000 }));
  const download = async (o) => {
    try { const r = await coursesPublicAPI.bookLink(o.id); window.location.assign(r.url); setTimeout(() => coursesPublicAPI.myBooks().then((x) => setBooks(x.orders)).catch(() => {}), 2500); } catch (e) { toast.error(errMsg(e, 'Could not start the download.'), { duration: 8000 }); }
  };

  return (
    <div className="min-h-screen">
      <Helmet><title>My learning | TISL</title></Helmet>
      <Header />
      <main style={{ maxWidth: 900, margin: '0 auto', padding: '40px 20px 64px', display: 'grid', gap: 16 }} data-testid="learn-library">
        <header><h1 style={{ margin: 0, fontSize: 'clamp(1.5rem, 4vw, 2rem)', fontWeight: 900 }}><BookOpen size={24} aria-hidden="true" /> My learning</h1></header>
        {!user && <div style={card}><Link to="/login?redirect=%2Flearn%2Fmy" style={{ fontWeight: 800 }}>Sign in</Link> to see what you are learning.</div>}
        {user && !d && !failed && <p>Loading…</p>}
        {failed && <div style={card} role="status">We could not load your courses. Please try again.</div>}
        {d && !d.ready && <div style={card} role="status">Courses are not available yet.</div>}
        {d?.on_hold?.map((h) => <div key={h.enrolment} style={{ ...card, borderColor: '#fca5a5' }} role="alert"><strong>{h.offering}</strong>: a payment is overdue, so your access is on hold. <Link to={`/learn/${h.slug}`}>Pay to get it back</Link></div>)}
        {d?.ready && d.items.length === 0 && <div style={card}>You are not enrolled in anything yet. <Link to="/learn" style={{ fontWeight: 800 }}>See what we teach</Link></div>}
        {d?.ready && d.items.map((i) => (
          <article key={i.offering_id} data-offering={i.title} style={{ ...card, display: 'grid', gap: 8, opacity: i.state === 'ended' ? 0.7 : 1 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <strong style={{ flex: 1, minWidth: 200, fontSize: '1.1rem' }}>{i.title}</strong>
              <span style={chip}>{i.kind_label}</span>
              {i.state === 'ended' && <span style={{ ...chip, background: '#fee2e2', color: '#b91c1c' }}>Access ended</span>}
              {i.state === 'active' && i.days_left !== null && i.days_left <= 14 && <span style={{ ...chip, background: '#fef3c7', color: '#92400e' }}>{i.days_left} day{i.days_left === 1 ? '' : 's'} left</span>}
            </div>
            {i.progress.total > 0 && (
              <div aria-label={`${i.progress.percent}% done`}>
                <div style={{ height: 8, borderRadius: 999, background: 'var(--line, #e5e7eb)', overflow: 'hidden' }}><div style={{ width: `${i.progress.percent}%`, height: '100%', background: 'var(--color-primary-500, #6366f1)' }} /></div>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{i.progress.done} of {i.progress.total} lessons · {i.progress.percent}%</span>
              </div>
            )}
            {i.attendance && i.attendance.state !== 'none' && <span style={{ fontSize: '0.84rem', color: ['at_risk', 'failed'].includes(i.attendance.state) ? '#b91c1c' : 'inherit' }}>Attendance: {i.attendance.rate !== null ? `${i.attendance.rate}%` : 'none marked yet'} (needs {i.attendance.needed}%){i.attendance.state === 'at_risk' ? ' · behind' : i.attendance.state === 'failed' ? ' · cannot reach it' : ''}</span>}
            {i.next_live && <span style={{ fontSize: '0.86rem' }}><CalendarClock size={13} aria-hidden="true" /> Next live class: {new Date(i.next_live.starts_at).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}
            {i.certificate && (
              <span style={{ fontSize: '0.88rem', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }} data-testid="certificate-line">
                <Award size={14} aria-hidden="true" /> Certificate {i.certificate.number}{i.certificate.state === 'valid' ? '' : i.certificate.state === 'expired' ? ' (expired)' : ' (withdrawn)'}
                <button type="button" onClick={() => certificate(i.certificate)} style={{ background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', color: 'inherit', padding: 0, font: 'inherit' }}>Open it</button>
              </span>
            )}
            <div>{i.state === 'active' ? <Link to={`/learn/my/${i.slug}`} style={{ ...primaryBtn, display: 'inline-block', textDecoration: 'none' }}>{i.progress.done > 0 ? 'Continue' : 'Start'}</Link> : <Link to={`/learn/${i.slug}`} style={{ fontWeight: 800 }}>Enrol again</Link>}</div>
          </article>
        ))}
        {books.length > 0 && (
          <section style={{ display: 'grid', gap: 10 }} aria-label="My books">
            <h2 style={{ margin: '12px 0 0', fontSize: '1.2rem', fontWeight: 800 }}><BookMarked size={18} aria-hidden="true" /> My books</h2>
            {books.map((o) => (
              <article key={o.id} data-book-order={o.number} style={{ ...card, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}><strong>{o.book}</strong>{o.quantity > 1 ? ` × ${o.quantity}` : ''}<div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{o.number} · {o.status_label} · {o.fulfil_label}</div></div>
                {o.can_download && <button type="button" onClick={() => download(o)} style={primaryBtn}><Download size={14} aria-hidden="true" /> Download{o.download_limit ? ` (${Math.max(0, o.download_limit - o.downloads)} left)` : ''}</button>}
              </article>
            ))}
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
}
