import { colors, radius } from '../../theme/tokens';

/**
 * One badge for every status the tax / withholding / currency screens show.
 * Unknown statuses render neutral with the raw value prettified.
 */
const TONES = {
  success: { bg: colors.successBg, fg: colors.successText, dot: colors.success },
  warning: { bg: colors.warningBg, fg: colors.warningText, dot: colors.warning },
  danger:  { bg: colors.dangerBg,  fg: colors.dangerText,  dot: colors.danger },
  info:    { bg: colors.infoBg,    fg: colors.infoText,    dot: colors.info },
  brand:   { bg: colors.tint(0.1), fg: colors.primaryDeep, dot: colors.primary },
  neutral: { bg: colors.neutralBg, fg: colors.neutralText, dot: colors.textFaint },
};

const STATUS_MAP = {
  // generic on/off
  active: ['success', 'Active'],
  inactive: ['neutral', 'Inactive'],

  // tax legitimacy certificates
  pending_verification: ['warning', 'Pending verification'],
  verified: ['success', 'Verified'],
  revoked: ['danger', 'Revoked'],
  expired: ['neutral', 'Expired'],

  // withholding certificates
  pending: ['warning', 'Pending'],
  issued: ['info', 'Issued'],
  received: ['success', 'Received'],

  // withholding credits
  held: ['warning', 'Held'],
  partially_cleared: ['info', 'Partially cleared'],
  cleared: ['success', 'Cleared'],
  written_off: ['neutral', 'Written off'],

  // tax types
  additive: ['brand', 'Added to price'],
  withheld: ['info', 'Withheld from payment'],
};

const prettify = (s) => String(s ?? '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/**
 * @param {string}  status   key from STATUS_MAP (or any string)
 * @param {string}  label    override the text
 * @param {string}  tone     force a tone: success | warning | danger | info | brand | neutral
 * @param {boolean} dot      show the leading dot (default true)
 */
export default function StatusBadge({ status, label, tone, dot = true, style }) {
  const [mappedTone, mappedLabel] = STATUS_MAP[status] ?? ['neutral', prettify(status)];
  const t = TONES[tone ?? mappedTone] ?? TONES.neutral;

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 9px', borderRadius: radius.pill,
      fontSize: '0.65rem', fontWeight: 700, whiteSpace: 'nowrap',
      background: t.bg, color: t.fg,
      ...style,
    }}>
      {dot && <span style={{ width: 5, height: 5, borderRadius: '50%', background: t.dot, flexShrink: 0 }} />}
      {label ?? mappedLabel}
    </span>
  );
}
