import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import pinsAPI from '../../_shared/api/pins';
import { errMsg } from '../../_shared/store/helpers/apiState';
import { btnPrimary, card, colors } from '../../_shared/theme/tokens';
import { filterStyle } from '../../core/components/admin/books/booksFmt';

/** Whether customers may add their own pins, and the most each can add in a month. Admin and super admin change it; managers see it. */
export default function CustomerPinSettings({ canChange }) {
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { pinsAPI.settings().then(setS).catch(() => setS(null)); }, []);
  if (!s) return null;

  const save = async () => {
    setBusy(true);
    try { const r = await pinsAPI.saveSettings({ enabled: s.enabled, per_month: Number(s.per_month) || 0 }); setS(r.data); toast.success('Saved'); }
    catch (e) { toast.error(errMsg(e, 'Could not save')); } finally { setBusy(false); }
  };

  return (
    <div style={{ ...card, padding: '12px 16px', margin: '0 0 16px', display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
      <strong style={{ fontSize: '0.84rem', color: colors.text }}>Customer pins</strong>
      <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: '0.82rem', color: colors.text }}>
        <input type="checkbox" checked={s.enabled} disabled={!canChange} onChange={(e) => setS({ ...s, enabled: e.target.checked })} /> Customers can add their own pins
      </label>
      <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: '0.82rem', color: colors.text, opacity: s.enabled ? 1 : 0.5 }}>
        Most per customer each month
        <input type="number" min="0" value={s.per_month} disabled={!canChange || !s.enabled} onChange={(e) => setS({ ...s, per_month: e.target.value })} style={{ ...filterStyle, width: 80 }} />
        <span style={{ fontSize: '0.72rem', color: colors.textFaint }}>0 = no limit</span>
      </label>
      {canChange && <button type="button" style={{ ...btnPrimary, marginLeft: 'auto' }} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>}
    </div>
  );
}
