import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import toast from 'react-hot-toast';
import { CalendarClock, Download, ExternalLink, FileText, GraduationCap, Lock, PlayCircle, Video } from 'lucide-react';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import coursesPublicAPI from '../../../_shared/api/coursesPublic';
import useAuthStore from '../../../_shared/store/authStore';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { card, chip, field, hours, money, primaryBtn } from '../../components/learnStyle';

const when = (iso) => new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function Lesson({ l }) {
  const icon = l.kind === 'video' ? <Video size={14} aria-hidden="true" /> : l.kind === 'file' ? <FileText size={14} aria-hidden="true" /> : l.kind === 'live' ? <CalendarClock size={14} aria-hidden="true" /> : <PlayCircle size={14} aria-hidden="true" />;
  const live = l.live;

  return (
    <li data-lesson={l.title} style={{ padding: '8px 0', borderTop: '1px solid var(--line, #e5e7eb)' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {l.locked ? <Lock size={14} aria-hidden="true" /> : icon}
        <strong style={{ flex: 1, minWidth: 160 }}>{l.title}</strong>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{l.kind_label}{l.duration_minutes ? ` · ${l.duration_minutes} min` : ''}{l.drip_days ? ` · opens ${l.drip_days} day${l.drip_days === 1 ? '' : 's'} after you start` : ''}</span>
        {l.is_preview && !l.locked && <span style={chip}>Free preview</span>}
      </div>
      {live && (
        <div style={{ fontSize: '0.84rem', marginTop: 4 }}>
          <CalendarClock size={12} aria-hidden="true" /> {when(live.starts_at)} – {new Date(live.ends_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} · {live.provider_label}
          {!l.locked && live.state === 'upcoming' && <span> · the link appears at {when(live.opens_at)}</span>}
          {!l.locked && live.join_url && (
            <div style={{ marginTop: 4 }}>
              <a href={live.join_url} target="_blank" rel="noopener noreferrer" style={{ ...primaryBtn, display: 'inline-flex', gap: 6, alignItems: 'center', textDecoration: 'none' }}><ExternalLink size={14} aria-hidden="true" /> Join the class</a>
              {(live.meeting_id || live.passcode) && <span style={{ marginLeft: 10 }}>{live.meeting_id && <>Meeting id <strong>{live.meeting_id}</strong> </>}{live.passcode && <>Passcode <strong>{live.passcode}</strong></>}</span>}
            </div>
          )}
          {!l.locked && live.replay_url && <div style={{ marginTop: 4 }}><a href={live.replay_url} target="_blank" rel="noopener noreferrer">Watch the replay</a></div>}
        </div>
      )}
      {!l.locked && l.video_url && <div style={{ marginTop: 4 }}><a href={l.video_url} target="_blank" rel="noopener noreferrer"><ExternalLink size={12} aria-hidden="true" /> Open the video</a></div>}
      {!l.locked && l.file?.url && <div style={{ marginTop: 4 }}><a href={l.file.url} download><Download size={12} aria-hidden="true" /> {l.file.name}</a></div>}
      {!l.locked && l.body && <p style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>{l.body}</p>}
    </li>
  );
}

function EnrolCard({ data, reload }) {
  const o = data.offering;
  const signedIn = useAuthStore((s) => Boolean(s.user));
  const customer = useAuthStore((s) => s.customer);
  const [extras, setExtras] = useState([]);
  const [quote, setQuote] = useState(null);
  const [method, setMethod] = useState('');
  const [phone, setPhone] = useState(customer?.phone ?? '');
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(null);
  const [intake, setIntake] = useState('');
  const enrolment = data.me.enrolment;
  const wl = data.me.waitlist;
  const pickedFull = data.has_intakes && data.intakes.some((i) => String(i.id) === intake && i.places_left === 0);
  const optional = data.fees.filter((x) => x.is_optional);

  useEffect(() => {
    if (!signedIn || !data.me.can_enrol) return;
    coursesPublicAPI.quote(o.id, extras).then((q) => { setQuote(q); setMethod((m) => m || String(q.payment_methods.find((x) => x.gateway === 'mpesa_stk')?.id ?? q.payment_methods[0]?.id ?? '')); }).catch(() => setQuote(null));
  }, [signedIn, data.me.can_enrol, o.id, extras]);

  useEffect(() => {
    if (waiting === null) return undefined;
    let n = 0;
    const t = setInterval(async () => {
      n += 1;
      await reload();
      if (n >= 40) setWaiting(null);
    }, 3000);

    return () => clearInterval(t);
  }, [waiting, reload]);
  useEffect(() => { if (waiting !== null && (data.me.has_access || (data.me.enrolment && data.me.enrolment.paid_total > waiting))) { setWaiting(null); toast.success('Payment received. Thank you!'); } }, [data, waiting]);

  const go = async (fn) => {
    setBusy(true);
    try {
      const r = await fn();
      if (r.redirect_url) { window.location.assign(r.redirect_url); return; }
      toast.success(r.message, { duration: 8000 });
      if (r.attempt) setWaiting(r.enrolment?.paid_total ?? 0);
      await reload();
    } catch (e) { toast.error(errMsg(e, 'We could not do that. Please try again.'), { duration: 8000 }); } finally { setBusy(false); }
  };

  if (data.me.has_access) {
    return <aside style={{ ...card, display: 'grid', gap: 8 }} data-testid="enrol-card"><strong>You are enrolled.</strong><span style={{ fontSize: '0.88rem' }}>Everything below is open to you.</span><Link to={`/learn/my/${o.slug}`} style={{ ...primaryBtn, textAlign: 'center', textDecoration: 'none' }}>Open in My learning</Link>{enrolment?.access_paused && <span role="alert" style={{ color: '#b91c1c', fontWeight: 700 }}>A payment is overdue, so access is on hold until you pay.</span>}</aside>;
  }

  return (
    <aside style={{ ...card, display: 'grid', gap: 10, alignContent: 'start' }} data-testid="enrol-card">
      <strong style={{ fontSize: '1.2rem' }}>{o.free ? 'Free' : `From ${money(o.price_from)}`}{!o.free && <span style={{ fontWeight: 500, fontSize: '0.8rem' }}> before tax</span>}</strong>
      {data.fees.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 3, fontSize: '0.86rem' }}>
          {data.fees.map((x) => <li key={x.id} style={{ display: 'flex', justifyContent: 'space-between' }}><span>{x.name}{x.is_optional ? ' (optional)' : ''}{x.once_per_student ? ' (once)' : ''}</span><span>{money(x.amount)}</span></li>)}
        </ul>
      )}
      {(o.plan.deposit_pct || o.plan.instalments > 1) && <p style={{ margin: 0, fontSize: '0.84rem' }}>You can pay{o.plan.deposit_pct ? ` a ${o.plan.deposit_pct}% deposit` : ''}{o.plan.instalments > 1 ? `${o.plan.deposit_pct ? ' and the rest' : ''} in ${o.plan.instalments} instalments, ${o.plan.instalment_days} days apart` : ' and the rest later'}. {o.plan.grant_on === 'deposit' ? 'Your access starts with the first payment.' : 'Your access starts when it is paid in full.'}</p>}
      {data.has_intakes && (
        <div style={{ display: 'grid', gap: 4 }}>
          <label htmlFor="intake" style={{ fontWeight: 700, fontSize: '0.88rem' }}>Intake</label>
          {data.intakes.length === 0
            ? <span style={{ fontSize: '0.86rem' }}>Enrolment is closed for now.</span>
            : <select id="intake" value={intake} onChange={(e) => setIntake(e.target.value)} style={field}>
              <option value="">Choose when you will start</option>
              {data.intakes.map((i) => <option key={i.id} value={i.id}>{i.name}{i.starts_on ? ` · starts ${i.starts_on}` : ''}{i.places_left !== null ? (i.places_left > 0 ? ` · ${i.places_left} left` : ' · full') : ''}</option>)}
            </select>}
        </div>
      )}
      {!data.has_intakes && o.capacity_left !== null && <p style={{ margin: 0, fontSize: '0.84rem' }}>{o.capacity_left > 0 ? `${o.capacity_left} place${o.capacity_left === 1 ? '' : 's'} left.` : 'Every place is taken.'}</p>}

      {!signedIn && <Link to={`/login?redirect=${encodeURIComponent(`/learn/${o.slug}`)}`} style={{ ...primaryBtn, textAlign: 'center', textDecoration: 'none' }}>Sign in to enrol</Link>}

      {signedIn && enrolment && enrolment.status === 'pending' && (
        <div style={{ display: 'grid', gap: 8 }}>
          <p style={{ margin: 0, fontSize: '0.88rem' }}>Your place is held for {enrolment.number}. Pay <strong>{money(enrolment.next_due)}</strong> to confirm it.</p>
          <PayBox enrolment={enrolment} busy={busy} go={go} phone={phone} setPhone={setPhone} />
        </div>
      )}
      {signedIn && enrolment && enrolment.status === 'active' && enrolment.balance > 0 && (
        <div style={{ display: 'grid', gap: 8 }}>
          <p style={{ margin: 0, fontSize: '0.88rem' }}>Next payment: <strong>{money(enrolment.next_due)}</strong>.</p>
          <PayBox enrolment={enrolment} busy={busy} go={go} phone={phone} setPhone={setPhone} />
        </div>
      )}

      {signedIn && wl && (
        <div style={{ display: 'grid', gap: 6, fontSize: '0.88rem' }} data-testid="waitlist-state">
          {wl.status === 'offered'
            ? <strong>A place is held for you until {new Date(wl.offer_expires_at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}. Enrol below.</strong>
            : <span>You are number <strong>{wl.position}</strong> on the waiting list. We will tell you when a place is free.</span>}
          <button type="button" disabled={busy} onClick={() => go(() => coursesPublicAPI.leaveWaitlist(o.id))} style={{ background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', color: 'inherit', padding: 0, justifySelf: 'start', font: 'inherit' }}>Leave the waiting list</button>
        </div>
      )}
      {signedIn && !enrolment && !wl && (!data.me.can_enrol || pickedFull) && data.me.can_wait && (!data.has_intakes || data.intakes.length > 0) && (
        <button type="button" disabled={busy || (data.has_intakes && !intake)} onClick={() => go(() => coursesPublicAPI.joinWaitlist(o.id, intake ? Number(intake) : undefined))} style={primaryBtn}>Join the waiting list</button>
      )}
      {signedIn && data.me.can_enrol && quote && (
        <form onSubmit={(e) => { e.preventDefault(); go(() => coursesPublicAPI.enrol(o.id, { intake_id: intake ? Number(intake) : undefined, optional_fee_ids: extras, payment_method_id: method ? Number(method) : undefined, phone: phone || undefined })); }} style={{ display: 'grid', gap: 8 }}>
          {optional.length > 0 && (
            <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'grid', gap: 4, fontSize: '0.88rem' }}>
              <legend style={{ fontWeight: 700, marginBottom: 2 }}>Extras</legend>
              {optional.map((x) => <label key={x.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={extras.includes(x.id)} onChange={() => setExtras((e) => (e.includes(x.id) ? e.filter((i) => i !== x.id) : [...e, x.id]))} /> {x.name} · {money(x.amount)}</label>)}
            </fieldset>
          )}
          {quote.total > 0 && (
            <div style={{ fontSize: '0.86rem', display: 'grid', gap: 2 }} data-testid="quote">
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}><span>Total with tax</span><span>{money(quote.total)}</span></div>
              {quote.schedule.map((r, i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}><span>{r.label} · {r.due_date}</span><span>{money(r.amount)}</span></div>)}
              {quote.skipped.length > 0 && <span style={{ color: 'var(--text-secondary)' }}>Not charged again: {quote.skipped.join(', ')}</span>}
            </div>
          )}
          {quote.total > 0 && quote.payment_methods.length > 0 && (
            <>
              <select aria-label="Pay with" value={method} onChange={(e) => setMethod(e.target.value)} style={field}>{quote.payment_methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
              <input aria-label="Phone for M-Pesa" placeholder="Phone for M-Pesa" value={phone} onChange={(e) => setPhone(e.target.value)} style={field} autoComplete="tel" />
            </>
          )}
          <button type="submit" disabled={busy || (quote.total > 0 && !method) || (data.has_intakes && !intake)} style={primaryBtn}>{busy ? 'Working…' : quote.total > 0 ? `Enrol and pay ${money(quote.schedule[0]?.amount ?? quote.total)}` : 'Enrol free'}</button>
        </form>
      )}
      {waiting !== null && <p role="status" style={{ margin: 0 }}>Waiting for your payment… check your phone and enter your M-Pesa PIN.</p>}
    </aside>
  );
}

function PayBox({ enrolment, busy, go, phone, setPhone }) {
  const [methods, setMethods] = useState(null);
  const [method, setMethod] = useState('');
  useEffect(() => { coursesPublicAPI.quote(enrolment.offering_id, []).then((q) => { setMethods(q.payment_methods); setMethod(String(q.payment_methods.find((x) => x.gateway === 'mpesa_stk')?.id ?? q.payment_methods[0]?.id ?? '')); }).catch(() => setMethods([])); }, [enrolment.offering_id]);
  if (!methods?.length) return null;

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <select aria-label="Pay with" value={method} onChange={(e) => setMethod(e.target.value)} style={field}>{methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
      <input aria-label="Phone for M-Pesa" placeholder="Phone for M-Pesa" value={phone} onChange={(e) => setPhone(e.target.value)} style={field} autoComplete="tel" />
      <button type="button" disabled={busy || !method} style={primaryBtn} onClick={() => go(async () => { const r = await coursesPublicAPI.pay(enrolment.id, { payment_method_id: Number(method), phone: phone || undefined }); return { ...r, enrolment: r.enrolment }; })}>Pay {money(enrolment.next_due)}</button>
    </div>
  );
}

/** One offering: what it is, its curriculum (free previews open, the rest locked), the teacher, the fees, and enrolling. */
export default function LearnOfferingPage() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [missing, setMissing] = useState(false);
  const user = useAuthStore((s) => s.user);
  const load = useCallback(() => coursesPublicAPI.offering(slug).then((r) => { setData(r); setMissing(false); }).catch((e) => { if (e?.response?.status === 404) setMissing(true); }), [slug]);
  useEffect(() => { load(); }, [load, user?.id]);
  const o = data?.offering;
  const t = o?.teacher_profile;

  return (
    <div className="min-h-screen">
      <Helmet><title>{o ? `${o.title} | TISL` : 'Learn | TISL'}</title></Helmet>
      <Header />
      <main style={{ maxWidth: 1000, margin: '0 auto', padding: '40px 20px 64px' }} data-testid="learn-offering">
        {missing && <div style={card} role="status"><strong>We could not find that.</strong> <Link to="/learn">See everything we teach</Link></div>}
        {!data && !missing && <p>Loading…</p>}
        {o && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, alignItems: 'start' }}>
            <div style={{ display: 'grid', gap: 16, gridColumn: 'span 2', minWidth: 0 }}>
              <header style={{ display: 'grid', gap: 8 }}>
                <Link to="/learn" style={{ fontSize: '0.84rem' }}><GraduationCap size={13} aria-hidden="true" /> All courses</Link>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><span style={chip}>{o.kind_label}</span><span style={chip}>{o.delivery_label}</span>{o.skill_level !== 'all' && <span style={chip}>{o.level_label}</span>}{o.category && <span style={chip}>{o.category}</span>}</div>
                <h1 style={{ margin: 0, fontSize: 'clamp(1.6rem, 4vw, 2.3rem)', fontWeight: 900 }}>{o.title}</h1>
                {o.summary && <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '1.05rem' }}>{o.summary}</p>}
                <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--text-secondary)' }}>
                  {o.lessons > 0 && <>{o.lessons} lesson{o.lessons === 1 ? '' : 's'}</>}{o.minutes > 0 && <> · {hours(o.minutes)}</>}{o.access_days && <> · {o.access_days} days of access</>}{o.certificate && <> · certificate</>}{o.min_attendance_pct && <> · {o.min_attendance_pct}% attendance needed</>}
                </p>
              </header>
              {o.cover && <img src={o.cover} alt="" style={{ width: '100%', maxHeight: 340, objectFit: 'cover', borderRadius: 14 }} />}
              {o.body && <section style={card}><h2 style={{ margin: '0 0 6px', fontSize: '1.1rem' }}>About this</h2><p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{o.body}</p></section>}
              {(data.outline.sections.length > 0 || data.outline.loose.length > 0) && (
                <section style={card} aria-label="Curriculum">
                  <h2 style={{ margin: '0 0 6px', fontSize: '1.1rem' }}>What is inside</h2>
                  {data.outline.sections.map((s) => <div key={s.id} style={{ marginBottom: 10 }}><strong>{s.title}</strong><ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{s.lessons.map((l) => <Lesson key={l.id} l={l} />)}</ul></div>)}
                  {data.outline.loose.length > 0 && <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{data.outline.loose.map((l) => <Lesson key={l.id} l={l} />)}</ul>}
                </section>
              )}
              {data.books?.length > 0 && (
                <section style={card} aria-label="Books">
                  <h2 style={{ margin: '0 0 6px', fontSize: '1.1rem' }}>Books for this</h2>
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
                    {data.books.map((b) => <li key={b.id}><Link to={`/learn/books/${b.slug}`} style={{ fontWeight: 700 }}>{b.title}</Link> <span style={chip}>{b.relation === 'required' ? 'Required' : 'Recommended'}</span> <span style={{ fontSize: '0.84rem' }}>{money(b.price)} before tax</span></li>)}
                  </ul>
                </section>
              )}
              {t && (
                <section style={{ ...card, display: 'flex', gap: 14, alignItems: 'center' }}>
                  {t.photo && <img src={t.photo} alt="" style={{ width: 64, height: 64, borderRadius: 999, objectFit: 'cover' }} />}
                  <div><strong>Taught by {t.name}</strong>{t.title && <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)' }}>{t.title}</div>}{t.bio && <p style={{ margin: '4px 0 0', fontSize: '0.9rem' }}>{t.bio}</p>}</div>
                </section>
              )}
            </div>
            <EnrolCard data={data} reload={load} />
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
