import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import menusAPI from '../../../_shared/api/menus';
import { errMsg } from '../../../_shared/store/helpers/apiState';

/** The screen at a branch's door: a QR code that chefs scan with their phone to clock in. A rotating code changes every few minutes, so a photo of it is useless later. Leave it open on a tablet or monitor. */
export default function MenusDoorScreen() {
  const { locationId } = useParams();
  const [d, setD] = useState(null);
  const [problem, setProblem] = useState(null);
  const [left, setLeft] = useState(null);

  const load = useCallback(() => menusAPI.doorCode(locationId).then((r) => { setD(r); setLeft(r.seconds_left); setProblem(null); }).catch((e) => setProblem(errMsg(e, 'Could not load the code.'))), [locationId]);
  useEffect(() => { load(); }, [load]);
  // fetch the next code a moment before this one runs out (a fixed code is fetched again now and then)
  useEffect(() => {
    if (!d) return undefined;
    const wait = d.mode === 'rotating' ? Math.max(3, Math.min(30, (d.seconds_left ?? 30) - 2)) * 1000 : 300000;
    const t = setTimeout(load, wait);
    const tick = setInterval(() => setLeft((x) => (x === null ? null : Math.max(0, x - 1))), 1000);

    return () => { clearTimeout(t); clearInterval(tick); };
  }, [d, load]);

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#fff', color: '#111827', textAlign: 'center' }} data-testid="door-screen">
      {problem && <p role="alert" style={{ color: '#b91c1c', fontWeight: 700, fontSize: '1.1rem' }}>{problem}</p>}
      {d && (
        <div style={{ display: 'grid', gap: 14, justifyItems: 'center' }}>
          <h1 style={{ margin: 0, fontSize: 'clamp(1.6rem, 5vw, 3rem)', fontWeight: 900 }}>{d.branch}</h1>
          <p style={{ margin: 0, fontSize: 'clamp(1rem, 2.5vw, 1.6rem)' }}>Scan to clock in</p>
          <div style={{ width: 'min(70vmin, 560px)', height: 'min(70vmin, 560px)' }} data-testid="door-qr" role="img" aria-label="QR code to clock in" dangerouslySetInnerHTML={{ __html: d.svg.replace('<svg', '<svg style="width:100%;height:100%"') }} />
          {d.mode === 'rotating' && <p style={{ margin: 0, color: '#6b7280' }}>This code changes in {left ?? '…'} s</p>}
          {d.mode === 'fixed' && <p style={{ margin: 0, color: '#6b7280' }}>Open your camera, point it here and tap the link.</p>}
        </div>
      )}
    </main>
  );
}
