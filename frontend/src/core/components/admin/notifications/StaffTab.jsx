import { useState } from 'react';
import toast from 'react-hot-toast';
import notificationSettingsAPI from '../../../../_shared/api/notificationSettings';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import SimpleTable from '../ui/SimpleTable';
import { btnPrimary, colors } from '../../../../_shared/theme/tokens';

const rowsOf = (data) => Object.fromEntries(data.staff_groups.map((g) => [g.key, { mode: data.parts.general.staff_groups?.[g.key]?.mode ?? 'email', locked: !!data.parts.general.staff_groups?.[g.key]?.locked }]));

/**
 * How staff hear (docs/PROJECTS_STAGE6_SPEC.md, build 6.4): the company's default for each group of staff notices, and whether staff may change it.
 * Each person chooses for themselves in their profile ("How I hear about things"); a locked group uses the company's choice for everyone.
 */
export default function StaffTab({ data, canEdit, onChanged }) {
  const [rows, setRows] = useState(() => rowsOf(data));
  const [busy, setBusy] = useState(false);
  const start = rowsOf(data);
  const dirty = data.staff_groups.some((g) => rows[g.key].mode !== start[g.key].mode || rows[g.key].locked !== start[g.key].locked);
  const save = async () => {
    setBusy(true);
    try { const r = await notificationSettingsAPI.save('general', { staff_groups: rows }); toast.success(r.message); onChanged(); } catch (e) { toast.error(errMsg(e, 'Could not save'), { duration: 8000 }); } finally { setBusy(false); }
  };
  const columns = [
    { key: 'label', label: 'Group of notices', render: (g) => <span style={{ display: 'grid', gap: 2 }}><strong>{g.label}</strong>{g.types.length > 0 && <span style={{ fontSize: '0.72rem', color: colors.textMuted }}>{g.types.join(' · ')}</span>}</span> },
    { key: 'mode', label: 'Company default', render: (g) => (
      <select aria-label={`${g.label} default`} value={rows[g.key].mode} disabled={!canEdit} onChange={(e) => setRows({ ...rows, [g.key]: { ...rows[g.key], mode: e.target.value } })} style={{ padding: '5px 8px', borderRadius: 6, border: `1px solid ${colors.tint(0.15)}`, fontFamily: 'inherit' }}>
        {Object.entries(data.staff_modes).map(([k, l]) => <option key={k} value={k} disabled={k === 'whatsapp' && !data.parts.general.whatsapp_enabled}>{l}</option>)}
      </select>
    ) },
    { key: 'locked', label: 'Staff may change it', align: 'right', render: (g) => (
      <input type="checkbox" aria-label={`Staff may change ${g.label}`} checked={!rows[g.key].locked} disabled={!canEdit} onChange={(e) => setRows({ ...rows, [g.key]: { ...rows[g.key], locked: !e.target.checked } })} style={{ width: 16, height: 16, accentColor: colors.primary }} />
    ) },
  ];

  return (
    <div style={{ display: 'grid', gap: 12 }} data-staff-tab>
      <p style={{ margin: 0, fontSize: '0.85rem', color: colors.textMuted }}>The bell always shows everything. Choose where else each group reaches staff by default; untick "Staff may change it" to decide for everyone (security messages on email, for example). WhatsApp goes to the phone on each person's staff profile, the way the company sends WhatsApp now.</p>
      <SimpleTable columns={columns} rows={data.staff_groups} rowKey="key" />
      {canEdit && <div><button type="button" onClick={save} disabled={!dirty || busy} style={{ ...btnPrimary, opacity: !dirty || busy ? 0.6 : 1 }}>{busy ? 'Saving…' : 'Save'}</button></div>}
    </div>
  );
}
