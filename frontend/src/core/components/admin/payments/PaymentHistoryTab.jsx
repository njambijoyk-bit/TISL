import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Undo2, KeyRound } from 'lucide-react';
import paymentSettingsAPI from '../../../../_shared/api/paymentSettings';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import SimpleTable from '../ui/SimpleTable';
import usePasswordPrompt from './usePasswordPrompt';
import { btnGhost, card, colors } from '../../../../_shared/theme/tokens';

const EVENTS = { saved: 'Saved', saved_anyway: 'Saved without a passing test', save_refused: 'Refused (the provider said no)', rolled_back: 'Rolled back', reset: 'Cleared', tested: 'Key test', token_rotated: 'New callback token',
  keys_purged: 'Old keys deleted', password_failed: 'Wrong password (refused)', test_prompt: 'KES 1 test prompt', test_prompt_failed: 'KES 1 test prompt failed' };
const when = (s) => (s ? s.replace('T', ' ').slice(0, 16) : '');

/** Every version of the payment settings with a way back, and the log of everything done, wrong passwords included. Rolling back or deleting keys asks for your password. */
export default function PaymentHistoryTab({ onChanged, parts = [{ key: 'mpesa', label: 'M-Pesa' }] }) {
  const [part, setPart] = useState('mpesa');
  const [versions, setVersions] = useState([]);
  const [picked, setPicked] = useState(new Set());
  const [log, setLog] = useState({ data: [], current_page: 1, last_page: 1 });
  const [logPage, setLogPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [ask, dialog] = usePasswordPrompt();

  const loadVersions = useCallback(() => paymentSettingsAPI.versions(part).then((r) => { setVersions(r.data); setPicked(new Set()); }).catch((e) => toast.error(errMsg(e, 'Could not load the history'))), [part]);
  const loadLog = useCallback(() => paymentSettingsAPI.log({ page: logPage }).then(setLog).catch(() => {}), [logPage]);
  useEffect(() => { loadVersions(); }, [loadVersions]);
  useEffect(() => { loadLog(); }, [loadLog]);

  const rollback = async (v) => {
    if (!window.confirm(`Restore version ${v.version_no}? It becomes a new version, so nothing is lost and you can undo it.`)) return;
    const password = await ask('Type your password to put these payment keys back.');
    if (!password) return;
    setBusy(true);
    try { const r = await paymentSettingsAPI.rollback(part, v.id, password); toast.success(r.message); loadVersions(); loadLog(); onChanged(); }
    catch (e) { toast.error(errMsg(e, 'Could not restore it'), { duration: 9000 }); } finally { setBusy(false); }
  };
  const purge = async () => {
    if (!window.confirm(`Delete the keys kept in ${picked.size} old version${picked.size === 1 ? '' : 's'}? The versions stay in the history, but those keys can never be restored.`)) return;
    const password = await ask('Type your password to delete these old keys for good.');
    if (!password) return;
    setBusy(true);
    try { const r = await paymentSettingsAPI.purgeKeys([...picked], password); toast.success(r.message); loadVersions(); loadLog(); }
    catch (e) { toast.error(errMsg(e, 'Could not delete them')); } finally { setBusy(false); }
  };
  const toggle = (id) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const vcols = [
    { key: 'pick', label: '', render: (v) => (!v.is_current && v.has_secrets && !v.keys_deleted ? <input type="checkbox" aria-label={`Select version ${v.version_no} to delete its keys`} checked={picked.has(v.id)} onChange={() => toggle(v.id)} /> : null) },
    { key: 'version_no', label: 'Version', render: (v) => <strong>v{v.version_no}{v.is_current ? ' · in use' : ''}</strong> },
    { key: 'at', label: 'When', render: (v) => when(v.at) },
    { key: 'by', label: 'By', render: (v) => v.by ?? '—' },
    { key: 'summary', label: 'What changed', render: (v) => <span>{v.summary}{v.tested_ok === true && ' The provider accepted the key.'}{v.tested_ok === false && ' Saved although the provider did not accept the key.'}{v.keys_deleted && <em style={{ color: colors.danger }}> Keys deleted.</em>}</span> },
    { key: 'act', label: '', align: 'right', render: (v) => (!v.is_current ? <button type="button" style={{ ...btnGhost, padding: '4px 10px', fontSize: '0.74rem' }} disabled={busy || v.keys_deleted} title={v.keys_deleted ? 'Its keys were deleted' : undefined} onClick={() => rollback(v)}><Undo2 size={12} /> Restore</button> : null) },
  ];
  const lcols = [
    { key: 'at', label: 'When', render: (l) => when(l.at) },
    { key: 'by', label: 'Who', render: (l) => l.by ?? 'System' },
    { key: 'part', label: 'For', render: (l) => parts.find((p) => p.key === l.part)?.label ?? l.part ?? '—' },
    { key: 'event', label: 'Action', render: (l) => EVENTS[l.event] ?? l.event },
    { key: 'summary', label: 'Detail', render: (l) => l.summary },
    { key: 'ip', label: 'From', render: (l) => l.ip ?? '—' },
  ];

  return (
    <div style={{ display: 'grid', gap: 22 }}>
      {dialog}
      <section>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
          <h2 style={{ margin: 0, fontSize: '1rem' }}>Versions</h2>
          {parts.length > 1 && (
            <select aria-label="Show the history of" value={part} onChange={(e) => setPart(e.target.value)} style={{ padding: '5px 8px', borderRadius: 8, border: '1.5px solid var(--line, #d1d5db)', background: 'var(--surface-input, #fff)', color: 'inherit', fontFamily: 'inherit', fontSize: '0.8rem' }}>
              {parts.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          )}
          <span style={{ flex: 1 }} />
          {picked.size > 0 && <button type="button" style={{ ...btnGhost, color: colors.danger }} disabled={busy} onClick={purge}><KeyRound size={13} /> Delete keys in {picked.size} old version{picked.size === 1 ? '' : 's'}</button>}
        </div>
        <SimpleTable columns={vcols} rows={versions} empty="Nothing has been saved here yet." />
        <p style={{ margin: '8px 0 0', fontSize: '0.72rem', color: colors.textFaint }}>Restoring puts an earlier version back as a new one (for M-Pesa the callback token in use is kept, so payments in flight are not lost). You can delete the keys kept in old versions; the live ones are never touched.</p>
      </section>
      <section>
        <h2 style={{ margin: '0 0 10px', fontSize: '1rem' }}>Everything that was done</h2>
        <SimpleTable columns={lcols} rows={log.data} empty="No actions yet." />
        {log.last_page > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, alignItems: 'center', marginTop: 12, fontSize: '0.8rem', color: colors.textMuted }}>
            <button type="button" style={btnGhost} disabled={logPage <= 1} onClick={() => setLogPage((p) => p - 1)}>Previous</button>
            Page {log.current_page} of {log.last_page}
            <button type="button" style={btnGhost} disabled={logPage >= log.last_page} onClick={() => setLogPage((p) => p + 1)}>Next</button>
          </div>
        )}
        <div style={{ ...card, padding: '8px 12px', marginTop: 10, fontSize: '0.72rem', color: colors.textFaint }}>This log can not be edited or deleted by anyone. It never records a password or a key, only that something was done, by whom and from where.</div>
      </section>
    </div>
  );
}
