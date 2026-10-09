import { useState } from 'react';
import toast from 'react-hot-toast';
import notificationSettingsAPI from '../../../../_shared/api/notificationSettings';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import SimpleTable from '../ui/SimpleTable';
import { btnPrimary, colors } from '../../../../_shared/theme/tokens';

/** Every kind of message the system sends. A type can be switched off (customers still see it in the bell only if the company leaves it on there). */
export default function TypesTab({ data, canEdit, onChanged }) {
  const rules = data.parts.types.rules ?? {};
  const [off, setOff] = useState(() => new Set(Object.entries(rules).filter(([, r]) => r.enabled === false).map(([k]) => k)));
  const [busy, setBusy] = useState(false);
  const was = new Set(Object.entries(rules).filter(([, r]) => r.enabled === false).map(([k]) => k));
  const dirty = off.size !== was.size || [...off].some((k) => !was.has(k));

  const toggle = (key) => setOff((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const save = async () => {
    setBusy(true);
    try {
      const next = {};
      Object.entries(rules).forEach(([k, r]) => { next[k] = { ...r, enabled: !off.has(k) }; });
      off.forEach((k) => { next[k] = { ...(next[k] ?? {}), enabled: false }; });
      const r = await notificationSettingsAPI.save('types', { rules: next });
      toast.success(r.message); onChanged();
    } catch (e) { toast.error(errMsg(e, 'Could not save'), { duration: 8000 }); } finally { setBusy(false); }
  };

  const columns = [
    { key: 'label', label: 'Message', render: (t) => <strong>{t.label}</strong> },
    { key: 'essential', label: 'Kind', render: (t) => (t.essential ? 'Essential' : 'Optional') },
    { key: 'audience', label: 'For', render: (t) => (t.audience === 'staff' ? 'Staff' : 'Customers') },
    { key: 'on', label: 'Send', align: 'right', render: (t) => (
      <input type="checkbox" aria-label={`Send ${t.label}`} checked={!off.has(t.key)} disabled={!canEdit} onChange={() => toggle(t.key)} style={{ width: 16, height: 16, accentColor: colors.primary }} />
    ) },
  ];

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p style={{ margin: 0, fontSize: '0.78rem', color: colors.textMuted }}>Untick a message to stop sending it by email. Essential messages (orders, payments, refunds, delays) should normally stay on.</p>
      <SimpleTable columns={columns} rows={data.types} rowKey="key" />
      {canEdit && <div><button type="button" style={{ ...btnPrimary, opacity: dirty ? 1 : 0.5 }} disabled={!dirty || busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button></div>}
    </div>
  );
}
