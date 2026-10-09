import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { MessageCircle, Check, SkipForward } from 'lucide-react';
import notificationSettingsAPI from '../../../../_shared/api/notificationSettings';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { SelectInput } from '../ui/Form';
import { Toolbar } from '../ui/HubHeader';
import { btnGhost, btnPrimary, card, colors } from '../../../../_shared/theme/tokens';

const when = (s) => (s ? s.replace('T', ' ').slice(0, 16) : '');

/**
 * WhatsApp messages waiting for a person to send. Each row has a button that opens WhatsApp with the customer's number and the message ready; the person
 * presses Send there, comes back and marks it sent (or skips it). Who did what is recorded in the history.
 */
export default function WhatsAppQueueTab({ canSend, onChanged }) {
  const [status, setStatus] = useState('to_send');
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1 });
  const [page, setPage] = useState(1);
  const [opened, setOpened] = useState(new Set());   // rows whose WhatsApp link was opened in this visit: the next step is to mark them sent
  const [busy, setBusy] = useState(null);

  const load = useCallback(() => notificationSettingsAPI.whatsapp({ status, page }).then((r) => { setRows(r.data); setMeta({ current_page: r.current_page, last_page: r.last_page }); })
    .catch((e) => toast.error(errMsg(e, 'Could not load the list'))), [status, page]);
  useEffect(() => { load(); }, [load]);

  const act = async (id, fn, ok) => {
    setBusy(id);
    try { const r = await fn(); toast.success(ok ?? r.message); load(); onChanged(); }
    catch (e) { toast.error(errMsg(e, 'Could not do that'), { duration: 8000 }); } finally { setBusy(null); }
  };
  const open = (row) => { window.open(row.wa_url, '_blank', 'noopener'); setOpened((s) => new Set(s).add(row.id)); };
  const skip = (row) => {
    const why = window.prompt('Why skip it? (optional)', '');
    if (why === null) return;
    act(row.id, () => notificationSettingsAPI.skip(row.id, why), 'Skipped.');
  };

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Toolbar>
        <SelectInput aria-label="Show" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} style={{ width: 200 }}>
          <option value="to_send">Waiting to be sent</option><option value="sent">Sent</option><option value="skipped">Skipped</option><option value="all">All</option>
        </SelectInput>
      </Toolbar>
      {rows.length === 0 && <p style={{ margin: 0, color: colors.textMuted, fontSize: '0.85rem' }}>{status === 'to_send' ? 'Nothing is waiting. Messages for customers who get WhatsApp appear here.' : 'Nothing here.'}</p>}
      {rows.map((r) => (
        <div key={r.id} style={{ ...card, padding: 14, display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <strong>{r.name ?? 'Customer'}</strong>
            <span style={{ fontSize: '0.8rem', color: colors.textMuted }}>{r.to}</span>
            <span style={{ fontSize: '0.74rem', color: colors.textFaint }}>{r.type_label} · {when(r.at)}</span>
            <span style={{ flex: 1 }} />
            {r.status !== 'to_send' && <span style={{ fontSize: '0.74rem', fontWeight: 700, color: r.status === 'sent' ? '#047857' : colors.textFaint }}>{r.status === 'sent' ? `Sent ${when(r.sent_at)}` : 'Skipped'}</span>}
          </div>
          <p style={{ margin: 0, fontSize: '0.84rem', lineHeight: 1.5, whiteSpace: 'pre-line' }}>{r.message}</p>
          {r.status === 'to_send' && canSend && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button type="button" style={btnPrimary} onClick={() => open(r)}><MessageCircle size={13} /> Send in WhatsApp</button>
              <button type="button" style={opened.has(r.id) ? btnPrimary : btnGhost} disabled={busy === r.id} onClick={() => act(r.id, () => notificationSettingsAPI.markSent(r.id), 'Marked as sent.')}><Check size={13} /> I sent it</button>
              <button type="button" style={btnGhost} disabled={busy === r.id} onClick={() => skip(r)}><SkipForward size={13} /> Skip</button>
              {opened.has(r.id) && <span style={{ fontSize: '0.74rem', color: colors.textFaint }}>Press Send in WhatsApp, then come back and tick “I sent it”.</span>}
            </div>
          )}
        </div>
      ))}
      {meta.last_page > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, alignItems: 'center', fontSize: '0.8rem', color: colors.textMuted }}>
          <button type="button" style={btnGhost} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
          Page {meta.current_page} of {meta.last_page}
          <button type="button" style={btnGhost} disabled={page >= meta.last_page} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
