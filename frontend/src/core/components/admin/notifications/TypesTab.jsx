import { useState } from 'react';
import toast from 'react-hot-toast';
import notificationSettingsAPI from '../../../../_shared/api/notificationSettings';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import SimpleTable from '../ui/SimpleTable';
import { btnPrimary, colors } from '../../../../_shared/theme/tokens';

const ALL = ['email', 'whatsapp'];
const VARS = ['name', 'title', 'message', 'company', 'link'];
const rowOf = (rules, key) => ({ enabled: rules[key]?.enabled !== false, channels: rules[key]?.channels ?? ALL, template: rules[key]?.template ?? '', variables: (rules[key]?.variables ?? ['name', 'message']).join(', ') });
const same = (a, b) => a.enabled === b.enabled && a.channels.length === b.channels.length && a.channels.every((c) => b.channels.includes(c)) && a.template === b.template && a.variables === b.variables;
const parseVars = (text) => text.split(',').map((x) => x.trim()).filter(Boolean);

/** Every kind of message the system sends: switch it off, or limit it to email or to WhatsApp. (The bell is always on.) */
export default function TypesTab({ data, canEdit, onChanged }) {
  const rules = data.parts.types.rules ?? {};
  const [rows, setRows] = useState(() => Object.fromEntries(data.types.map((t) => [t.key, rowOf(rules, t.key)])));
  const [busy, setBusy] = useState(false);
  const dirty = data.types.some((t) => !same(rows[t.key], rowOf(rules, t.key)));

  const patch = (key, p) => setRows((r) => ({ ...r, [key]: { ...r[key], ...p } }));
  const toggleChannel = (key, ch) => {
    const cur = rows[key].channels;
    patch(key, { channels: cur.includes(ch) ? cur.filter((c) => c !== ch) : [...cur, ch] });
  };
  const save = async () => {
    setBusy(true);
    try {
      const next = {};
      data.types.forEach((t) => {
        const r = rows[t.key];
        const tpl = r.template.trim();
        if (r.enabled && r.channels.length === ALL.length && !tpl) return;   // untouched: no rule
        next[t.key] = { enabled: r.enabled, channels: r.channels.length === ALL.length ? null : r.channels, template: tpl || null, variables: tpl ? parseVars(r.variables) : null };
      });
      const res = await notificationSettingsAPI.save('types', { rules: next });
      toast.success(res.message); onChanged();
    } catch (e) { toast.error(errMsg(e, 'Could not save'), { duration: 8000 }); } finally { setBusy(false); }
  };

  const box = (t, ch, label) => (
    <label key={ch} style={{ display: 'inline-flex', gap: 5, alignItems: 'center', fontSize: '0.78rem', marginRight: 12, opacity: rows[t.key].enabled ? 1 : 0.45 }}>
      <input type="checkbox" checked={rows[t.key].channels.includes(ch)} disabled={!canEdit || !rows[t.key].enabled} onChange={() => toggleChannel(t.key, ch)} style={{ accentColor: colors.primary }} aria-label={`${t.label} by ${label}`} /> {label}
    </label>
  );
  const columns = [
    { key: 'label', label: 'Message', render: (t) => <strong>{t.label}</strong> },
    { key: 'essential', label: 'Kind', render: (t) => (t.essential ? 'Essential' : 'Optional') },
    { key: 'audience', label: 'For', render: (t) => (t.audience === 'staff' ? 'Staff' : 'Customers') },
    { key: 'channels', label: 'Sent by', render: (t) => <span>{box(t, 'email', 'Email')}{t.audience === 'customer' && box(t, 'whatsapp', 'WhatsApp')}</span> },
    ...(data.whatsapp_api?.providers && data.parts.whatsapp.provider ? [{ key: 'tpl', label: 'WhatsApp template (automatic)', render: (t) => (t.audience === 'customer' ? (
      <span style={{ display: 'grid', gap: 4, minWidth: 220 }}>
        <input aria-label={`${t.label} template`} placeholder={data.parts.whatsapp.provider === 'twilio' ? 'Content SID, HX…' : 'approved template name'} value={rows[t.key].template} disabled={!canEdit} onChange={(e) => patch(t.key, { template: e.target.value })} style={{ padding: '5px 8px', borderRadius: 6, border: `1px solid ${colors.tint(0.15)}`, fontFamily: 'inherit', fontSize: '0.76rem' }} />
        {rows[t.key].template.trim() && <input aria-label={`${t.label} values in order`} placeholder="values in order, e.g. name, message" value={rows[t.key].variables} disabled={!canEdit} onChange={(e) => patch(t.key, { variables: e.target.value })} style={{ padding: '5px 8px', borderRadius: 6, border: `1px solid ${parseVars(rows[t.key].variables).every((x) => VARS.includes(x)) ? colors.tint(0.15) : colors.danger}`, fontFamily: 'inherit', fontSize: '0.72rem' }} />}
      </span>) : '—') }] : []),
    { key: 'on', label: 'Send', align: 'right', render: (t) => (
      <input type="checkbox" aria-label={`Send ${t.label}`} checked={rows[t.key].enabled} disabled={!canEdit} onChange={(e) => patch(t.key, { enabled: e.target.checked })} style={{ width: 16, height: 16, accentColor: colors.primary }} />
    ) },
  ];

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p style={{ margin: 0, fontSize: '0.78rem', color: colors.textMuted }}>Untick “Send” to stop a message, or limit it to one channel. The bell always shows it. A message with no channel ticked only appears in the bell. With a WhatsApp provider set up, give a customer message its approved template to send it automatically; the values fill {'{{1}}'}, {'{{2}}'} … in order from: name, title, message, company, link. Without a template it waits in “WhatsApp to send”.</p>
      <SimpleTable columns={columns} rows={data.types} rowKey="key" />
      {canEdit && <div><button type="button" style={{ ...btnPrimary, opacity: dirty ? 1 : 0.5 }} disabled={!dirty || busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button></div>}
    </div>
  );
}
