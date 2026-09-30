import { useState } from 'react';
import toast from 'react-hot-toast';
import { Download } from 'lucide-react';
import { colors, radius, btnGhost } from '../../../../_shared/theme/tokens';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { FORMATS } from './booksFmt';

const CHIP = {
  posted: [colors.successBg, colors.successText],
  draft: [colors.warningBg, colors.warningText],
  cancelled: [colors.dangerBg, colors.dangerText],
  open: [colors.infoBg, colors.infoText],
  partial: [colors.warningBg, colors.warningText],
  closed: [colors.neutralBg, colors.neutralText],
  received: [colors.warningBg, colors.warningText],
  issued: [colors.warningBg, colors.warningText],
  deposited: [colors.infoBg, colors.infoText],
  cleared: [colors.successBg, colors.successText],
  bounced: [colors.dangerBg, colors.dangerText],
};

export function Chip({ status }) {
  if (!status) return null;
  const [bg, fg] = CHIP[status] ?? [colors.neutralBg, colors.neutralText];
  return (
    <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: radius.pill, background: bg, color: fg, fontSize: '0.68rem', fontWeight: 700, textTransform: 'capitalize' }}>
      {status}
    </span>
  );
}

/** Download in any of the five formats; failures (e.g. PDF library missing) are shown, not swallowed. */
export function ExportMenu({ onExport, label = 'Export' }) {
  const [busy, setBusy] = useState(false);
  const go = async (e) => {
    const format = e.target.value;
    e.target.value = '';
    if (!format) return;
    setBusy(true);
    try { await onExport(format); } catch (err) { toast.error(errMsg(err, 'Export failed'), { duration: 7000 }); }
    finally { setBusy(false); }
  };
  return (
    <label style={{ ...btnGhost, padding: '6px 12px', gap: 6, position: 'relative', opacity: busy ? 0.6 : 1 }}>
      <Download size={14} /> {busy ? 'Preparing…' : label}
      <select defaultValue="" onChange={go} disabled={busy} aria-label={label}
        style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%' }}>
        <option value="" disabled>{label} as…</option>
        {FORMATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}
