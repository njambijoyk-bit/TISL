import { colors } from '../../../../_shared/theme/tokens';
import { ACCESS_LABEL } from '../../../lib/priceList/format';
import { fieldStyle, useCatalogueMeta } from './catalogueMeta';

const BADGE = {
  draft: { label: 'Draft', bg: colors.neutralBg, fg: colors.neutralText },
  pending: { label: 'Waiting for activation', bg: colors.warningBg, fg: colors.warningText },
  published: { label: 'Published', bg: colors.successBg, fg: colors.successText },
  scheduled: { label: 'Published, not active yet', bg: colors.infoBg, fg: colors.infoText },
  bin: { label: 'In the bin', bg: colors.dangerBg, fg: colors.dangerText },
};

/** status: draft, pending, published; `live` false on a published list means its Active-from date is still ahead. */
export function StatusBadge({ status, live = true, trashed = false }) {
  const key = trashed ? 'bin' : status === 'published' && !live ? 'scheduled' : status;
  const b = BADGE[key] ?? BADGE.draft;

  return <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 999, fontSize: '0.7rem', fontWeight: 700, background: b.bg, color: b.fg, whiteSpace: 'nowrap' }}>{b.label}</span>;
}

/** Who can see it: the dropdown, and, for "selected customer types", the types read from the database. */
export function AudiencePicker({ access, types = [], onChange, disabled }) {
  const [meta] = useCatalogueMeta();
  const known = meta?.customer_types ?? [];
  const toggle = (slug) => onChange({ access, customer_types: types.includes(slug) ? types.filter((t) => t !== slug) : [...types, slug] });

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <select value={access} disabled={disabled} onChange={(e) => onChange({ access: e.target.value, customer_types: types })} style={fieldStyle} aria-label="Who can see it">
        {Object.entries(ACCESS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      {access === 'types' && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {known.length === 0 && <span style={{ fontSize: '0.78rem', color: colors.textFaint }}>No customer types are set up yet.</span>}
          {known.map((t) => (
            <label key={t.slug} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: '0.84rem', color: colors.text }}>
              <input type="checkbox" disabled={disabled} checked={types.includes(t.slug)} onChange={() => toggle(t.slug)} /> {t.name}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

