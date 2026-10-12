import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import toast from 'react-hot-toast';
import { CalendarPlus, Check, CircleDot, Download, ExternalLink, Lock } from 'lucide-react';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import coursesPublicAPI from '../../../_shared/api/coursesPublic';
import useAuthStore from '../../../_shared/store/authStore';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { card, primaryBtn } from '../../components/learnStyle';

const when = (iso) => new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** A video address turned into something that can be shown inside the page, for YouTube and Vimeo only; anything else is a link. */
function embedOf(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return null;
    const h = u.hostname.replace(/^www\./, '');
    if (h === 'youtu.be') return `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}`;
    if (h === 'youtube.com' && u.searchParams.get('v')) return `https://www.youtube-nocookie.com/embed/${u.searchParams.get('v')}`;
    if (h === 'vimeo.com' && /^\/\d+/.test(u.pathname)) return `https://player.vimeo.com/video/${u.pathname.split('/')[1]}`;
  } catch { /* not an address */ }

  return null;
}

function LiveCard({ live }) {
  const addToCalendar = async () => {
    try {
      const blob = await coursesPublicAPI.ics(live.id);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'live-class.ics'; a.click(); URL.revokeObjectURL(a.href);
    } catch (e) { toast.error(errMsg(e, 'Could not make the calendar file')); }
  };

  return (
    <div style={{ ...card, display: 'grid', gap: 8 }} data-testid="live-card">
      <strong>{when(live.starts_at)} – {new Date(live.ends_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} · {live.provider_label}</strong>
      {live.state === 'upcoming' && <span>The join link appears here at {when(live.opens_at)}.</span>}
      {live.join_url && <div><a href={live.join_url} target="_blank" rel="noopener noreferrer" style={{ ...primaryBtn, display: 'inline-flex', gap: 6, alignItems: 'center', textDecoration: 'none' }}><ExternalLink size={14} aria-hidden="true" /> Join the class</a>{(live.meeting_id || live.passcode) && <span style={{ marginLeft: 12 }}>{live.meeting_id && <>Meeting id <strong>{live.meeting_id}</strong> </>}{live.passcode && <>Passcode <strong>{live.passcode}</strong></>}</span>}</div>}
      {live.state === 'over' && !live.replay_url && <span>This class has finished.</span>}
      {live.replay_url && <a href={live.replay_url} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} aria-hidden="true" /> Watch the replay</a>}
      {live.state !== 'over' && <button type="button" onClick={addToCalendar} style={{ justifySelf: 'start', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}><CalendarPlus size={13} aria-hidden="true" /> Add to my calendar</button>}
    </div>
  );
}

const STATE = { pending: 'No class has been held yet.', ok: 'You are on track.', at_risk: 'You are behind: come to the rest or ask about a make-up class.', failed: 'You can no longer reach the share needed: please speak to your teacher.' };

/** Attendance for the student: where they stand, each class with their mark, check in with the teacher's code, or ask to be excused. */
function AttendanceCard({ att, reload }) {
  const [code, setCode] = useState({});
  const st = att.standing;
  const checkin = async (id) => { try { const r = await coursesPublicAPI.checkin(id, code[id] ?? ''); toast.success(r.message); await reload(); } catch (e) { toast.error(errMsg(e, 'Could not check you in'), { duration: 6000 }); } };
  const excuse = async (id) => { const reason = window.prompt('Why can you not come?'); if (!reason) return; try { const r = await coursesPublicAPI.excuse(id, reason); toast.success(r.message); await reload(); } catch (e) { toast.error(errMsg(e, 'Could not send that'), { duration: 6000 }); } };

  return (
    <section style={{ ...card, display: 'grid', gap: 8 }} data-testid="attendance-card">
      <strong>Attendance</strong>
      {st.needed && <span style={{ fontSize: '0.86rem' }}>{st.rate !== null ? `You have attended ${st.rate}% of the classes held` : 'No class has been marked yet'}; {st.needed}% is needed. {STATE[st.state] ?? ''}</span>}
      {att.sessions.map((x) => (
        <div key={x.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid var(--line, #e5e7eb)', paddingTop: 6, fontSize: '0.88rem' }}>
          <span style={{ flex: 1, minWidth: 180 }}><strong>{x.title}</strong> · {when(x.starts_at)} · {x.mode_label}{x.makeup_for ? ` · makes up for ${x.makeup_for}` : ''}</span>
          {x.status_label && <span style={{ fontWeight: 700 }}>{x.status_label}</span>}
          {x.self_checkin && new Date(x.ends_at) > new Date() && !['present', 'late', 'excused'].includes(x.status) && (
            <span style={{ display: 'inline-flex', gap: 4 }}>
              <input aria-label={`Code for ${x.title}`} placeholder="Code" inputMode="numeric" maxLength={8} value={code[x.id] ?? ''} onChange={(e) => setCode({ ...code, [x.id]: e.target.value })} style={{ width: 90, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--line, #d1d5db)', font: 'inherit' }} />
              <button type="button" onClick={() => checkin(x.id)} style={{ ...primaryBtn, padding: '6px 12px' }}>Check in</button>
            </span>
          )}
          {x.can_excuse && x.status !== 'asked' && new Date(x.ends_at).getTime() > Date.now() - 7 * 86400000 && <button type="button" onClick={() => excuse(x.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', color: 'inherit', padding: 0 }}>Ask to be excused</button>}
        </div>
      ))}
    </section>
  );
}

/** The lesson player: the outline with ticks and locks on one side, the lesson on the other, and Mark as done / Next. */
export default function LearnPlayerPage() {
  const { slug } = useParams();
  const user = useAuthStore((s) => s.user);
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [current, setCurrent] = useState(null);

  const load = useCallback(async () => {
    try { const r = await coursesPublicAPI.player(slug); setD(r); setError(null); return r; } catch (e) { setError(errMsg(e, 'We could not open this.')); return null; }
  }, [slug]);
  useEffect(() => { if (user) load().then((r) => { if (r) setCurrent((c) => c ?? r.resume_lesson_id); }); }, [user, load]);

  const flat = useMemo(() => (d ? [...d.sections.flatMap((s) => s.lessons), ...d.loose] : []), [d]);
  const lesson = flat.find((l) => l.id === current) ?? flat.find((l) => !l.locked) ?? null;
  const idx = lesson ? flat.findIndex((l) => l.id === lesson.id) : -1;
  const next = idx >= 0 ? flat.slice(idx + 1).find((l) => !l.locked) ?? flat.slice(idx + 1)[0] : null;

  // opening a lesson notes that it was started (the place in a video is kept the same way)
  useEffect(() => { if (lesson && !lesson.locked && lesson.status === 'none') coursesPublicAPI.progress(lesson.id, { status: 'started' }).catch(() => {}); }, [lesson?.id]);  // eslint-disable-line react-hooks/exhaustive-deps

  const done = async () => {
    try {
      const r = await coursesPublicAPI.progress(lesson.id, { status: 'done' });
      toast.success(r.completed ? 'You finished it. Well done!' : 'Marked as done.');
      const fresh = await load();
      if (fresh && next) { const n = [...fresh.sections.flatMap((s) => s.lessons), ...fresh.loose].find((l) => l.id === next.id); if (n && !n.locked) setCurrent(n.id); }
    } catch (e) { toast.error(errMsg(e, 'Could not save that'), { duration: 6000 }); }
  };

  const row = (l) => (
    <li key={l.id}>
      <button type="button" onClick={() => setCurrent(l.id)} disabled={l.locked} aria-current={lesson?.id === l.id ? 'true' : undefined} data-lesson={l.title}
        style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%', textAlign: 'left', padding: '7px 8px', borderRadius: 8, border: 'none', cursor: l.locked ? 'not-allowed' : 'pointer', font: 'inherit', fontSize: '0.88rem',
          background: lesson?.id === l.id ? 'color-mix(in srgb, var(--color-primary-500, #6366f1) 14%, transparent)' : 'transparent', color: 'inherit', opacity: l.locked ? 0.6 : 1 }}>
        {l.status === 'done' ? <Check size={14} color="#16a34a" aria-label="Done" /> : l.locked ? <Lock size={14} aria-label="Locked" /> : <CircleDot size={14} aria-hidden="true" />}
        <span style={{ flex: 1 }}>{l.title}</span>
      </button>
      {l.locked && <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', padding: '0 8px 4px 30px' }}>{l.lock_reason === 'order' ? `Finish "${l.after}" first` : l.opens_at ? `Opens ${when(l.opens_at)}` : 'Not open yet'}</div>}
    </li>
  );

  return (
    <div className="min-h-screen">
      <Helmet><title>{d ? `${d.offering.title} | My learning` : 'My learning'}</title></Helmet>
      <Header />
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 20px 64px' }} data-testid="learn-player">
        {!user && <div style={card}><Link to={`/login?redirect=${encodeURIComponent(`/learn/my/${slug}`)}`} style={{ fontWeight: 800 }}>Sign in</Link> to open your course.</div>}
        {user && error && <div style={card} role="alert">{error} <Link to={`/learn/${slug}`}>See the course page</Link></div>}
        {user && !d && !error && <p>Loading…</p>}
        {d && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20, alignItems: 'start' }}>
            <nav aria-label="Lessons" style={{ ...card, padding: 12, display: 'grid', gap: 6 }}>
              <Link to="/learn/my" style={{ fontSize: '0.82rem' }}>← My learning</Link>
              <strong style={{ fontSize: '1.05rem' }}>{d.offering.title}</strong>
              {d.progress.total > 0 && <div><div style={{ height: 6, borderRadius: 999, background: 'var(--line, #e5e7eb)', overflow: 'hidden' }}><div style={{ width: `${d.progress.percent}%`, height: '100%', background: 'var(--color-primary-500, #6366f1)' }} /></div><span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>{d.progress.percent}% · {d.progress.done} of {d.progress.total}</span></div>}
              {d.access.days_left !== null && d.access.days_left <= 30 && <span style={{ fontSize: '0.78rem', color: '#92400e' }}>Your access ends in {d.access.days_left} day{d.access.days_left === 1 ? '' : 's'}.</span>}
              {d.access.staff_preview && <span style={{ fontSize: '0.78rem' }}>You are looking at this as staff.</span>}
              {d.sections.map((s) => <div key={s.id}><strong style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.title}</strong><ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{s.lessons.map(row)}</ul></div>)}
              {d.loose.length > 0 && <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{d.loose.map(row)}</ul>}
            </nav>
            <section style={{ gridColumn: 'span 2', display: 'grid', gap: 14, minWidth: 0 }}>
              {d.attendance && <AttendanceCard att={d.attendance} reload={load} />}
              {!lesson && <div style={card}>Nothing is open yet. {d.offering.summary}</div>}
              {lesson && (
                <article style={{ ...card, display: 'grid', gap: 12 }} data-testid="lesson">
                  <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900 }}>{lesson.title}</h1>
                  {lesson.video_url && (embedOf(lesson.video_url)
                    ? <div style={{ position: 'relative', paddingTop: '56.25%' }}><iframe title={lesson.title} src={embedOf(lesson.video_url)} allow="encrypted-media; picture-in-picture" allowFullScreen loading="lazy" referrerPolicy="strict-origin-when-cross-origin" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0, borderRadius: 10 }} /></div>
                    : <a href={lesson.video_url} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} aria-hidden="true" /> Open the video</a>)}
                  {lesson.live && <LiveCard live={lesson.live} />}
                  {lesson.file?.url && <a href={lesson.file.url} download style={{ ...primaryBtn, display: 'inline-flex', gap: 6, alignItems: 'center', textDecoration: 'none', justifySelf: 'start' }}><Download size={14} aria-hidden="true" /> {lesson.file.name}</a>}
                  {lesson.body && <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{lesson.body}</div>}
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {lesson.status !== 'done' ? <button type="button" onClick={done} style={primaryBtn}>Mark as done{next ? ' and continue' : ''}</button> : <span style={{ color: '#16a34a', fontWeight: 800 }}><Check size={14} aria-hidden="true" /> Done</span>}
                    {next && !next.locked && <button type="button" onClick={() => setCurrent(next.id)} style={{ ...primaryBtn, background: 'transparent', color: 'inherit', border: '1.5px solid var(--line, #d1d5db)' }}>Next lesson</button>}
                  </div>
                </article>
              )}
            </section>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
