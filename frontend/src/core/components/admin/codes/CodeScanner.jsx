import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, ScanLine } from 'lucide-react';
import { btnGhost, colors } from '../../../../_shared/theme/tokens';

/** a short beep so the person scanning knows it read, without looking at the screen */
const beep = () => {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    o.frequency.value = 1100;
    o.connect(ctx.destination);
    o.start();
    setTimeout(() => { o.stop(); ctx.close(); }, 90);
  } catch { /* no sound is fine */ }
  try { navigator.vibrate?.(40); } catch { /* nor is no vibration */ }
};

/**
 * One scanner for every screen. Three ways in, all giving the same thing (the text of a code, through `onScan`):
 *  - a handheld USB or Bluetooth scanner: it types the code and presses Enter, so the box is kept ready for it;
 *  - the phone or laptop camera (where the browser can read codes);
 *  - typing the code.
 * The same code is ignored for 2 seconds after a read, so holding it in front of the camera does not repeat.
 */
export default function CodeScanner({ onScan, placeholder = 'Scan or type a code, then Enter', autoFocus = true, camera = true }) {
  const [text, setText] = useState('');
  const [cam, setCam] = useState(false);
  const [error, setError] = useState(null);
  const video = useRef(null);
  const last = useRef({ code: null, at: 0 });
  const input = useRef(null);
  const canRead = typeof window !== 'undefined' && 'BarcodeDetector' in window;

  const got = useCallback((code) => {
    const now = Date.now();
    if (last.current.code === code && now - last.current.at < 2000) return;
    last.current = { code, at: now };
    beep();
    onScan(code);
  }, [onScan]);

  useEffect(() => { if (autoFocus) input.current?.focus(); }, [autoFocus]);

  useEffect(() => {
    if (!cam) return undefined;
    let stream; let timer; let stopped = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        video.current.srcObject = stream;
        await video.current.play();
        const formats = (await window.BarcodeDetector.getSupportedFormats?.()) ?? undefined;
        const detector = new window.BarcodeDetector(formats ? { formats } : undefined);
        timer = setInterval(async () => {
          if (!video.current || video.current.readyState < 2) return;
          try {
            const found = await detector.detect(video.current);
            if (found[0]?.rawValue) got(found[0].rawValue);
          } catch { /* a frame that could not be read */ }
        }, 180);
      } catch (e) {
        setError(e?.name === 'NotAllowedError' ? 'The camera was not allowed. Allow it in the browser, or use a handheld scanner or type the code.' : 'The camera could not be started.');
        setCam(false);
      }
    })();
    return () => { stopped = true; clearInterval(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, [cam, got]);

  const submit = (e) => {
    e.preventDefault();
    const v = text.trim();
    if (!v) return;
    setText('');
    got(v);
    input.current?.focus();
  };

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <form onSubmit={submit} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <ScanLine size={15} aria-hidden="true" style={{ position: 'absolute', left: 10, top: 11, color: colors.textFaint }} />
          <input ref={input} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-label="Scan or type a code" autoComplete="off" autoCapitalize="off" spellCheck={false}
            style={{ width: '100%', padding: '9px 10px 9px 32px', borderRadius: 10, border: '1.5px solid var(--line, #d1d5db)', background: 'var(--surface-input, #fff)', color: 'inherit', fontFamily: 'inherit', fontSize: '0.88rem', boxSizing: 'border-box' }} />
        </div>
        {camera && (
          <button type="button" style={btnGhost} onClick={() => { setError(null); setCam((c) => !c); }} disabled={!canRead} title={canRead ? undefined : 'This browser cannot read codes with the camera'}>
            {cam ? <><CameraOff size={14} /> Stop camera</> : <><Camera size={14} /> Use camera</>}
          </button>
        )}
      </form>
      {camera && !canRead && <p style={{ margin: 0, fontSize: '0.72rem', color: colors.textFaint }}>This browser can not read codes with the camera: use a handheld scanner (it types the code), or type it. Chrome on Android and desktop can use the camera.</p>}
      {error && <p role="alert" style={{ margin: 0, fontSize: '0.78rem', color: colors.danger }}>{error}</p>}
      {cam && <video ref={video} muted playsInline style={{ width: '100%', maxWidth: 420, borderRadius: 12, background: '#000', aspectRatio: '4 / 3', objectFit: 'cover' }} />}
    </div>
  );
}
