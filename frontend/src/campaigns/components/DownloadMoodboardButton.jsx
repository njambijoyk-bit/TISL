import { useState } from 'react';
import { Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { downloadMoodboardImage } from '../lib/moodboardExport';

/**
 * Save a moodboard as a PNG. `board` is { title, layout, contents }, with each picture's `image` and `download` flag (a picture whose pin is set to "no download"
 * is left out, and we say so). `icon` is a small round shortcut for list cards; the default is a labelled button. The shortcut stops the click reaching the card.
 */
export default function DownloadMoodboardButton({ board, icon = false, style, label = 'Download image' }) {
  const [busy, setBusy] = useState(false);
  const go = async (e) => {
    e.preventDefault(); e.stopPropagation();
    setBusy(true);
    try {
      const r = await downloadMoodboardImage(board, board.title, 2000, { respectNoDownload: true });
      toast.success(r.skipped ? `Image saved. ${r.skipped} ${r.skipped === 1 ? 'picture was' : 'pictures were'} left out because ${r.skipped === 1 ? 'it' : 'they'} cannot be downloaded.` : 'Image saved');
    } catch { toast.error('Could not make the image. A picture may be blocked from being copied.'); } finally { setBusy(false); }
  };

  if (icon) {
    return (
      <button type="button" onClick={go} disabled={busy} title="Download image" aria-label="Download image"
        style={{ position: 'absolute', top: 14, right: 14, zIndex: 3, width: 32, height: 32, borderRadius: '50%', border: 0, cursor: busy ? 'wait' : 'pointer', background: 'rgba(0,0,0,0.62)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.6 : 1, ...style }}>
        <Download size={15} />
      </button>
    );
  }

  return (
    <button type="button" onClick={go} disabled={busy}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 999, border: '1.5px solid var(--line)', background: 'transparent', color: 'var(--text-primary)', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.82rem', cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1, ...style }}>
      <Download size={14} /> {busy ? 'Making…' : label}
    </button>
  );
}
