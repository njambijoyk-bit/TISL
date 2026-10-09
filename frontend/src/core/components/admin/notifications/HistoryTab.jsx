import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Undo2, KeyRound } from 'lucide-react';
import notificationSettingsAPI from '../../../../_shared/api/notificationSettings';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import SimpleTable from '../ui/SimpleTable';
import { btnGhost, card, colors } from '../../../../_shared/theme/tokens';

const PARTS = [['email', 'Email'], ['whatsapp', 'WhatsApp API'], ['general', 'General'], ['types', 'Messages']];
const EVENTS = { saved: 'Saved', saved_anyway: 'Saved without a passing test', save_refused: 'Refused (failed test)', rolled_back: 'Rolled back', reset: 'Cleared', tested: 'Test email', keys_purged: 'Keys deleted', message_retried: 'Message tried again' };
const when = (s) => (s ? s.replace('T', ' ').slice(0, 16) : '');

/**
 * Every version of the settings, with a way back, and the log of every action. Replacing a key never loses the old one: it stays in its version, and a
 * rollback restores it as a new version. Only the owner can delete old keys; nobody can change or delete the log.
 */
export default function HistoryTab({ canEdit, canPurge, onChanged }) {
  const [part, setPart] = useState('email');
  const [versions, setVersions] = useState([]);
  const [picked, setPicked] = useState(new Set());
  const [log, setLog] = useState({ data: [], current_page: 1, last_page: 1 });
  const [logPage, setLogPage] = useState(1);
  const [busy, setBusy] = useState(false);

  const loadVersions = useCallback(() => notificationSettingsAPI.versions(part).then((r) => { setVersions(r.data); setPicked(new Set()); }).catch((e) => toast.error(errMsg(e, 'Could not load the history'))), [part]);
  const loadLog = useCallback(() => notificationSettingsAPI.log({ page: logPage }).then(setLog).catch(() => {}), [logPage]);
  useEffect(() => { loadVersions(); }, [loadVersions]);
  useEffect(() => { loadLog(); }, [loadLog]);

  const rollback = async (v) => {
    if (!window.confirm(`Restore version ${v.version_no}? It becomes a new version, so nothing is lost and you can undo it.`)) return;
    setBusy(true);
    try { const r = await notificationSettingsAPI.rollback(part, v.id); toast.success(r.message); loadVersions(); loadLog(); onChanged(); }
    catch (e) { toast.error(errMsg(e, 'Could not restore it'), { duration: 9000 }); } finally { setBusy(false); }
  };
  const purge = async () => {
    if (!window.confirm(`Delete the keys and passwords kept in ${picked.size} old version${picked.size === 1 ? '' : 's'}? The versions stay in the history, but those keys can never be restored.`)) return;
    setBusy(true);
    try { const r = await notificationSettingsAPI.purgeKeys([...picked]); toast.success(r.message); loadVersions(); loadLog(); }
    catch (e) { toast.error(errMsg(e, 'Could not delete them')); } finally { setBusy(false); }
  };
  const toggle = (id) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const vcols = [
    ...(canPurge ? [{ key: 'pick', label: '', render: (v) => (!v.is_current && v.has_secrets && !v.keys_deleted
      ? <input type="checkbox" aria-label={`Select version ${v.version_no} to delete its keys`} checked={picked.has(v.id)} onChange={() => toggle(v.id)} /> : null) }] : []),
    { key: 'version_no', label: 'Version', render: (v) => <strong>v{v.version_no}{v.is_current ? ' · in use' : ''}</strong> },
    { key: 'at', label: 'When', render: (v) => when(v.at) },
    { key: 'by', label: 'By', render: (v) => v.by ?? '—' },
    { key: 'summary', label: 'What changed', render: (v) => (
      <span>{v.summary}{v.tested_ok === true && ' Test passed.'}{v.tested_ok === false && ' Saved without a passing test.'}{v.keys_deleted && <em style={{ color: colors.danger }}> Keys deleted.</em>}</span>
    ) },
    { key: 'act', label: '', align: 'right', render: (v) => (canEdit && !v.is_current
      ? <button type="button" style={{ ...btnGhost, padding: '4px 10px', fontSize: '0.74rem' }} disabled={busy || v.keys_deleted} title={v.keys_deleted ? 'Its keys were deleted by the owner' : undefined} onClick={() => rollback(v)}><Undo2 size={12} /> Restore</button> : null) },
  ];
  const lcols = [
    { key: 'at', label: 'When', render: (l) => when(l.at) },
    { key: 'by', label: 'Who', render: (l) => l.by ?? 'System' },
    { key: 'event', label: 'Action', render: (l) => EVENTS[l.event] ?? l.event },
    { key: 'summary', label: 'Detail', render: (l) => l.summary },
    { key: 'ip', label: 'From', render: (l) => l.ip ?? '—' },
  ];

  return (
    <div style={{ display: 'grid', gap: 22 }}>
      <section>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
          <h2 style={{ margin: 0, fontSize: '1rem' }}>Versions</h2>
          {PARTS.map(([id, label]) => <button key={id} type="button" onClick={() => setPart(id)} style={{ ...btnGhost, padding: '4px 12px', fontWeight: part === id ? 800 : 500, borderColor: part === id ? colors.primary : undefined }}>{label}</button>)}
          <span style={{ flex: 1 }} />
          {canPurge && picked.size > 0 && <button type="button" style={{ ...btnGhost, color: colors.danger }} disabled={busy} onClick={purge}><KeyRound size={13} /> Delete keys in {picked.size} old version{picked.size === 1 ? '' : 's'}</button>}
        </div>
        <SimpleTable columns={vcols} rows={versions} empty="Nothing has been saved here yet." />
        <p style={{ margin: '8px 0 0', fontSize: '0.72rem', color: colors.textFaint }}>
          Restoring puts an earlier version back as a new one. {canPurge ? 'As the owner you can delete the keys kept in old versions.' : 'Only the owner can delete old keys.'}
        </p>
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
        <div style={{ ...card, padding: '8px 12px', marginTop: 10, fontSize: '0.72rem', color: colors.textFaint }}>This log can not be edited or deleted by anyone. It never records a password or key, only that it was changed.</div>
      </section>
    </div>
  );
}
