import { colors, radius } from '../../../../_shared/theme/tokens';

const TONES = {
  requested: [colors.warningBg, colors.warningText, 'To price'],
  quoted: [colors.infoBg, colors.infoText, 'Sent'],
  revision_requested: [colors.warningBg, colors.warningText, 'Changes asked'],
  accepted: [colors.successBg, colors.successText, 'Accepted'],
  declined: [colors.dangerBg, colors.dangerText, 'Declined'],
  expired: [colors.neutralBg, colors.neutralText, 'Expired'],
  withdrawn: [colors.neutralBg, colors.neutralText, 'Withdrawn'],
};

/** Status pill for a quotation. */
export function DocChip({ status }) {
  const [bg, fg, label] = TONES[status] ?? [colors.neutralBg, colors.neutralText, status ?? '—'];
  return <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: radius.pill, background: bg, color: fg, fontSize: '0.68rem', fontWeight: 700 }}>{label}</span>;
}
