import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Modal from '../../core/components/admin/ui/Modal';
import pinsAPI from '../../_shared/api/pins';
import { errMsg } from '../../_shared/store/helpers/apiState';
import { btnPrimary, btnGhost, colors } from '../../_shared/theme/tokens';
import { filterStyle } from '../../core/components/admin/books/booksFmt';
import PinThumb from './PinThumb';

/** Choose pins from the library to put on a board. Pins already on the board are left out. */
export default function PinPicker({ exclude = [], single = false, title = 'Add pins', onClose, onPick }) {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      try { setRows((await pinsAPI.list({ status: 'visible', q: q || undefined })).data); }
      catch (e) { toast.error(errMsg(e, 'Could not load the pins')); }
      finally { setLoading(false); }
    }, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [q]);

  const shown = rows.filter((p) => !exclude.includes(p.id));
  const toggle = (id) => setPicked((x) => (x.includes(id) ? x.filter((i) => i !== id) : single ? [id] : [...x, id]));

  return (
    <Modal title={title} subtitle={single ? 'Tap the pin to use' : 'Tap the pins to put on this board'} onClose={onClose} width={760}
      footer={<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button type="button" style={btnGhost} onClick={onClose}>Cancel</button><button type="button" style={{ ...btnPrimary, opacity: picked.length ? 1 : 0.5 }} disabled={!picked.length} onClick={() => onPick(picked, rows.filter((p) => picked.includes(p.id)))}>{single ? 'Use this pin' : `Add ${picked.length || ''} ${picked.length === 1 ? 'pin' : 'pins'}`}</button></div>}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, caption or credit…" style={{ ...filterStyle, width: '100%', marginBottom: 12, boxSizing: 'border-box' }} />
      {loading && <p style={{ color: colors.textFaint }}>Loading…</p>}
      {!loading && shown.length === 0 && <p style={{ color: colors.textMuted, fontSize: '0.84rem' }}>No pins to add. Make some in the Pins page first.</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
        {shown.map((p) => {
          const on = picked.includes(p.id);
          return (
            <button key={p.id} type="button" onClick={() => toggle(p.id)} style={{ padding: 0, textAlign: 'left', cursor: 'pointer', borderRadius: 10, overflow: 'hidden', background: 'var(--surface-card)', border: `2px solid ${on ? 'var(--color-primary-500)' : 'var(--line)'}` }}>
              <PinThumb p={p} ratio="1 / 1" />
              <div style={{ padding: '6px 8px', fontSize: '0.72rem', fontWeight: 600, color: colors.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{on ? '✓ ' : ''}{p.title || p.item?.name || p.kind}</div>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
