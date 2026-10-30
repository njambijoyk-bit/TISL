import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import booksAPI from '../../../../_shared/api/books';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { openOnForm } from './voucherDrafts';
import { btnGhost, btnPrimary, card, colors } from '../../../../_shared/theme/tokens';

/** The drafts that repeating templates have left: open one on its form to check and post it, or skip it. Posting is always a person's act. Hidden when there is nothing waiting. */
export default function VoucherInbox({ canWrite }) {
  const nav = useNavigate();
  const [drafts, setDrafts] = useState([]);
  const load = useCallback(() => booksAPI.voucherTemplates().then((r) => setDrafts(r.drafts ?? [])).catch(() => setDrafts([])), []);
  useEffect(() => { load(); }, [load]);
  if (!drafts.length) return null;

  const open = async (d) => {
    try { await booksAPI.handleVoucherDraft(d.id, 'opened'); } catch (e) { toast.error(errMsg(e, 'Could not open the draft')); return; }
    openOnForm(d, nav);
  };
  const skip = async (d) => {
    try { const r = await booksAPI.handleVoucherDraft(d.id, 'skipped'); setDrafts(r.drafts ?? []); toast.success('Skipped'); } catch (e) { toast.error(errMsg(e, 'Could not skip it')); }
  };

  return (
    <div role="region" aria-label="Drafts from repeating templates" style={{ ...card, padding: 14, marginBottom: 14 }}>
      <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 8 }}>Due from your repeating templates ({drafts.length})</div>
      <div style={{ display: 'grid', gap: 6 }}>
        {drafts.map((d) => (
          <div key={d.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: '0.82rem' }}>
            <span style={{ flex: '1 1 220px' }}><strong>{d.name}</strong> <span style={{ color: colors.textMuted }}>· due {d.due_on}{d.status === 'opened' ? ' · opened, not posted yet' : ''}</span></span>
            {canWrite && <button type="button" style={{ ...btnPrimary, padding: '4px 12px', fontSize: '0.75rem' }} onClick={() => open(d)}>{d.status === 'opened' ? 'Open again' : 'Open and check'}</button>}
            {canWrite && <button type="button" style={{ ...btnGhost, padding: '4px 10px', fontSize: '0.72rem' }} onClick={() => skip(d)}>Skip</button>}
          </div>
        ))}
      </div>
    </div>
  );
}
