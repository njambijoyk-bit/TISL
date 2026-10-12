import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import toast from 'react-hot-toast';
import { BookMarked, Download } from 'lucide-react';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import coursesPublicAPI from '../../../_shared/api/coursesPublic';
import useAuthStore from '../../../_shared/store/authStore';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { card, chip, field, money, primaryBtn } from '../../components/learnStyle';

const WAYS = { digital: 'Download it', delivery: 'Have it delivered', pickup: 'Collect it' };

function Buy({ book }) {
  const user = useAuthStore((s) => s.user);
  const customer = useAuthStore((s) => s.customer);
  const [f, setF] = useState({ fulfil: book.ways[0] ?? '', quantity: 1, address: '', phone: customer?.phone ?? '' });
  const [quote, setQuote] = useState(null);
  const [method, setMethod] = useState('');
  const [busy, setBusy] = useState(false);
  const printed = f.fulfil !== 'digital';
  useEffect(() => {
    if (!user) return;
    coursesPublicAPI.bookQuote(book.id, printed ? Number(f.quantity) || 1 : 1).then((q) => { setQuote(q); setMethod((m) => m || String(q.payment_methods.find((x) => x.gateway === 'mpesa_stk')?.id ?? q.payment_methods[0]?.id ?? '')); }).catch(() => setQuote(null));
  }, [user, book.id, printed, f.quantity]);
  if (!user) return <Link to={`/login?redirect=${encodeURIComponent(`/learn/books/${book.slug}`)}`} style={{ ...primaryBtn, textAlign: 'center', textDecoration: 'none' }}>Sign in to buy</Link>;
  if (book.ways.length === 0) return <p>This book cannot be ordered right now.</p>;
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const r = await coursesPublicAPI.buyBook(book.id, { fulfil: f.fulfil, quantity: printed ? Number(f.quantity) : 1, address: f.fulfil === 'delivery' ? f.address : undefined, phone: f.phone || undefined, payment_method_id: method ? Number(method) : undefined });
      if (r.redirect_url) { window.location.assign(r.redirect_url); return; }
      toast.success(r.message, { duration: 9000 });
    } catch (x) { toast.error(errMsg(x, 'We could not place your order.'), { duration: 8000 }); } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 10 }}>
      <select aria-label="How" value={f.fulfil} onChange={(e) => setF({ ...f, fulfil: e.target.value })} style={field}>{book.ways.map((w) => <option key={w} value={w}>{WAYS[w]}</option>)}</select>
      {printed && <input aria-label="Copies" inputMode="numeric" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} style={field} />}
      {f.fulfil === 'delivery' && <textarea aria-label="Deliver to" required rows={2} placeholder="Deliver to" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} style={field} />}
      {quote && <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }} data-testid="book-total"><span>Total with tax</span><span>{money(quote.total)}</span></div>}
      {quote?.payment_methods.length > 0 && (
        <>
          <select aria-label="Pay with" value={method} onChange={(e) => setMethod(e.target.value)} style={field}>{quote.payment_methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
          <input aria-label="Phone for M-Pesa" placeholder="Phone for M-Pesa" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} style={field} autoComplete="tel" />
        </>
      )}
      <button type="submit" disabled={busy || !quote || !method} style={primaryBtn}>{busy ? 'Working…' : 'Buy and pay'}</button>
      {book.download_limit > 0 && book.ways.includes('digital') && <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>The download works {book.download_limit} times.</span>}
    </form>
  );
}

/** One book: its details, a free sample, and buying it. */
export default function LearnBookPage() {
  const { slug } = useParams();
  const [d, setD] = useState(null);
  const [missing, setMissing] = useState(false);
  const load = useCallback(() => coursesPublicAPI.book(slug).then((r) => setD(r.book)).catch(() => setMissing(true)), [slug]);
  useEffect(() => { load(); }, [load]);
  const sampleUrl = d?.has_sample ? `${(import.meta.env.VITE_API_URL || 'http://localhost:8000/api').replace(/\/$/, '')}/learn/books/${d.id}/sample` : null;

  return (
    <div className="min-h-screen">
      <Helmet><title>{d ? `${d.title} | TISL` : 'Books | TISL'}</title></Helmet>
      <Header />
      <main style={{ maxWidth: 900, margin: '0 auto', padding: '40px 20px 64px' }} data-testid="learn-book">
        {missing && <div style={card} role="status"><strong>We could not find that book.</strong> <Link to="/learn/books">All books</Link></div>}
        {!d && !missing && <p>Loading…</p>}
        {d && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24, alignItems: 'start' }}>
            <div style={{ display: 'grid', gap: 12 }}>
              <Link to="/learn/books" style={{ fontSize: '0.84rem' }}><BookMarked size={13} aria-hidden="true" /> All books</Link>
              <span style={chip}>{d.format_label}</span>
              <h1 style={{ margin: 0, fontSize: 'clamp(1.5rem, 4vw, 2.1rem)', fontWeight: 900 }}>{d.title}</h1>
              {d.authors && <p style={{ margin: 0, color: 'var(--text-secondary)' }}>by {d.authors}{d.isbn ? ` · ISBN ${d.isbn}` : ''}</p>}
              {d.cover && <img src={d.cover} alt="" style={{ maxWidth: 260, borderRadius: 10 }} />}
              {d.description && <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{d.description}</p>}
              {sampleUrl && <a href={sampleUrl} download><Download size={14} aria-hidden="true" /> Read a free sample</a>}
            </div>
            <aside style={{ ...card, display: 'grid', gap: 10 }}>
              <strong style={{ fontSize: '1.3rem' }}>{money(d.price)} <span style={{ fontWeight: 500, fontSize: '0.8rem' }}>before tax</span></strong>
              <Buy book={d} />
            </aside>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
