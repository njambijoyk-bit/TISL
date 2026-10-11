import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { MapPin } from 'lucide-react';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import menusAPI from '../../../_shared/api/menus';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnPrimary, card, colors } from '../../../_shared/theme/tokens';

/** The page a chef lands on after scanning the code at the door: it says which branch the code is for and clocks them in there. They must be signed in (the sign-in is their own). */
export default function MenusClockDoor() {
  const { code } = useParams();
  const [info, setInfo] = useState(null);
  const [problem, setProblem] = useState(null);
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { menusAPI.doorLookup(code).then(setInfo).catch((e) => setProblem(errMsg(e, 'This code is not valid, or it has run out. Scan the code on the door screen again.'))); }, [code]);

  const clock = async () => {
    setBusy(true);
    try {
      const r = await menusAPI.clockIn({ door: code });
      setDone(r.message);
      if (r.notice) toast(r.notice, { icon: '⚠️', duration: 10000 });
    } catch (e) { setProblem(errMsg(e, 'Could not clock you in.')); } finally { setBusy(false); }
  };

  return (
    <AdminLayout>
      <div style={{ padding: '40px 20px', maxWidth: 480, margin: '0 auto', display: 'grid', gap: 16 }} data-testid="clock-door">
        <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900 }}>Clock in</h1>
        {problem && <div style={{ ...card, padding: 16, color: '#b91c1c' }} role="alert">{problem}</div>}
        {info && !done && (
          <div style={{ ...card, padding: 18, display: 'grid', gap: 12 }}>
            <p style={{ margin: 0, display: 'flex', gap: 6, alignItems: 'center', fontWeight: 700 }}><MapPin size={16} aria-hidden="true" /> {info.branch}</p>
            <button type="button" disabled={busy} style={{ ...btnPrimary, padding: '14px 20px', fontSize: '1rem', opacity: busy ? 0.6 : 1 }} onClick={clock}>Clock in here</button>
            <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textMuted }}>It is the same sign-in as the Attendance page. It only works if you have a shift here today.</p>
          </div>
        )}
        {done && <div style={{ ...card, padding: 18 }} role="status"><strong>{done}</strong><p style={{ margin: '8px 0 0' }}><Link to="/admin/menus/rota">Open the rota</Link></p></div>}
      </div>
    </AdminLayout>
  );
}
