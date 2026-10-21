import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import { colors, card, radius, btnPrimary, btnGhost } from '../../../_shared/theme/tokens';
import { th, td, linkStyle, fmtLongDate, fmtDateTime, fmtFee, fmtSize, METHOD_LABELS, SUBMISSION_LABELS, CATEGORY_LABELS, DOC_TYPE_LABELS, GROUP_LABELS, NOTICE_TYPE_LABELS } from './format';

const TONES = {
  neutral: { bg: colors.neutralBg, text: colors.neutralText },
  info:    { bg: colors.infoBg, text: colors.infoText },
  warning: { bg: colors.warningBg, text: colors.warningText },
  success: { bg: colors.successBg, text: colors.successText },
  danger:  { bg: colors.dangerBg, text: colors.dangerText },
};

const STATUS_TONE = {
  draft: 'neutral', withdrawn: 'neutral', pending: 'neutral',
  published: 'info', open: 'info', terminated: 'danger', submitted: 'info', sent: 'info',
  closed: 'warning', under_review: 'warning', shortlisted: 'warning', pending_approval: 'warning', evaluating: 'warning',
  awarded: 'success', qualified: 'success', active: 'success', delivered: 'success', approved: 'success',
  rejected: 'danger', cancelled: 'danger', inactive: 'danger', suspended: 'danger',
};

export function StatusBadge({ status, label }) {
  const t = TONES[STATUS_TONE[status] || 'neutral'];
  return (
    <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: radius.sm, textTransform: 'uppercase', letterSpacing: '0.04em', background: t.bg, color: t.text, whiteSpace: 'nowrap' }}>
      {label ?? String(status || 'pending').replace(/_/g, ' ')}
    </span>
  );
}

export function Page({ width = 1100, children }) {
  return <div style={{ padding: '32px 24px', maxWidth: width, margin: '0 auto' }}>{children}</div>;
}

/** A page on the customer-facing site: the site header with its navigation, the content, and the footer. */
export function SitePage({ width, children }) {
  return (
    <div className="min-h-screen">
      <Header />
      <Page width={width}>{children}</Page>
      <Footer />
    </div>
  );
}

export function AdminPage({ width, children }) {
  return <AdminLayout><Page width={width}>{children}</Page></AdminLayout>;
}

export function Heading({ title, description, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
      <div style={{ maxWidth: 640 }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: colors.primary, letterSpacing: '-0.02em', margin: '0 0 4px' }}>{title}</h1>
        {description && <p style={{ fontSize: '0.8rem', color: colors.textMuted, margin: 0, lineHeight: 1.55 }}>{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** A server error shown on the page itself (the message the server sent), not only in the network tab. */
export function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <p role="alert" style={{ margin: '0 0 14px', padding: '10px 14px', borderRadius: radius.sm, fontSize: '0.8rem', lineHeight: 1.5, background: colors.dangerBg, color: colors.dangerText, overflowWrap: 'anywhere' }}>
      {message}
    </p>
  );
}

export function Loading() {
  return <p style={{ padding: 32, textAlign: 'center', color: colors.textMuted, margin: 0 }}>Loading…</p>;
}

export function Empty({ icon: Icon, children }) {
  return (
    <div style={{ ...card, padding: 48, textAlign: 'center' }}>
      {Icon && <Icon size={32} style={{ color: colors.tint(0.35), margin: '0 auto 10px', display: 'block' }} />}
      <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, color: colors.textMuted }}>{children}</p>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 18, borderBottom: `1.5px solid ${colors.tint(0.18)}` }}>
      {tabs.map(([key, label]) => (
        <button key={key} type="button" onClick={() => onChange(key)}
          style={{ padding: '9px 16px', background: 'none', border: 'none', fontFamily: 'inherit', fontSize: '0.82rem', cursor: 'pointer', marginBottom: -1.5,
            fontWeight: value === key ? 700 : 500, color: value === key ? colors.primary : colors.textMuted,
            borderBottom: `2px solid ${value === key ? colors.primary : 'transparent'}` }}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function Table({ head, children }) {
  return (
    <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>{head.map((h, i) => <th key={i} style={th}>{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function GroupBadge({ group }) {
  if (!group) return null;
  return <span style={{ fontSize: '0.66rem', fontWeight: 700, padding: '2px 8px', borderRadius: radius.sm, background: colors.infoBg, color: colors.infoText, whiteSpace: 'nowrap' }}>{GROUP_LABELS[group] || group}</span>;
}

const miniBtn = { background: 'none', border: 'none', padding: 0, fontFamily: 'inherit', fontSize: '0.8rem', cursor: 'pointer', ...linkStyle };

/** One attachment: its type, name, upload date and time, and Open (PDF and HTML) / Download. `onOpen(doc, inline)` fetches the file. */
export function AttachmentRow({ doc: d, onOpen, extra }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '2px 14px', fontSize: '0.82rem', color: colors.text }}>
      <span style={{ fontWeight: 700, minWidth: 120 }}>{DOC_TYPE_LABELS[d.type || d.document_type] || 'Other'}</span>
      <span style={{ overflowWrap: 'anywhere', flex: '1 1 200px' }}>{d.name}</span>
      <span style={{ color: colors.textMuted }}>{fmtDateTime(d.uploaded_at || d.created_at)}{d.size || d.file_size ? ` · ${fmtSize(d.size || d.file_size)}` : ''}</span>
      <span style={{ display: 'inline-flex', gap: 12 }}>
        {d.viewable !== false && ['pdf', 'html', 'htm'].includes(String(d.extension || '').toLowerCase()) && <button type="button" style={miniBtn} onClick={() => onOpen(d, true)}>Open</button>}
        <button type="button" style={miniBtn} onClick={() => onOpen(d, false)}>Download</button>
        {extra}
      </span>
    </div>
  );
}

const cell = { ...card, padding: '16px 20px', minWidth: 0 };
const cellLabel = { fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: colors.primaryDeep, paddingBottom: 8, marginBottom: 10, borderBottom: `1px solid ${colors.tint(0.1)}` };
const chip = { display: 'inline-block', fontSize: '0.8rem', fontWeight: 600, padding: '5px 14px', borderRadius: 999, background: colors.tint(0.1), color: colors.primaryDeep };

function copyText(text) {
  Promise.resolve(navigator.clipboard?.writeText(text)).catch(() => {});
}

/**
 * The notice details of a tender as a set of cards (two to a row, one on a phone), then the lots and an attachments table.
 * `extra` adds cards ([label, value]); `onOpen(doc, inline)` opens or downloads an attachment.
 */
export function NoticeDetails({ tender: t, extra = [], onOpen }) {
  const cards = [
    ['OCID', t.ocid],
    ['Tender number', t.tender_number],
    ['Notice type', NOTICE_TYPE_LABELS[t.notice_type] || null],
    ['Title', t.title, true],
    ['Procuring entity', t.procuring_entity],
    ['Procurement method', METHOD_LABELS[t.procurement_method] || t.procurement_method],
    ['Procurement category', CATEGORY_LABELS[t.category] || t.category],
    ['Submission methods', SUBMISSION_LABELS[t.submission_method] && <span style={chip}>{SUBMISSION_LABELS[t.submission_method]}</span>],
    ['Reservation scheme', t.reservation_scheme && <span style={chip}>{GROUP_LABELS[t.reservation_scheme] || t.reservation_scheme}</span>],
    ['Opening venue', t.opening_venue],
    ['Published date', t.published_at ? fmtLongDate(t.published_at) : null],
    ['Close date and time', fmtDateTime(t.submission_deadline)],
    ['Tender fee', fmtFee(t.tender_fee, t.currency)],
    ['Tender validity in days', t.validity_days],
    ['Financial year', t.financial_year],
    ['Preference and reservation scheme', t.has_preference_scheme ? 'YES' : 'NO'],
    ['Public link', t.public_link && (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <a href={t.public_link} target="_blank" rel="noopener noreferrer" style={{ ...linkStyle, wordBreak: 'break-all' }}>{t.public_link}</a>
        <button type="button" onClick={() => copyText(t.public_link)} style={{ ...btnPrimary, padding: '6px 14px', fontSize: '0.72rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Copy URL</button>
      </span>
    )],
    ...extra,
  ].filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== false);

  const docs = t.documents || [];
  const lots = t.lots || [];
  const sectionTitle = { fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', color: colors.text, margin: '22px 4px 10px' };

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 14 }}>
        {cards.map(([label, value, wide]) => (
          <div key={label} style={{ ...cell, ...(wide ? { gridColumn: '1 / -1' } : {}) }}>
            <div style={cellLabel}>{label}</div>
            <div style={{ fontSize: wide ? '0.95rem' : '0.9rem', color: colors.text, overflowWrap: 'anywhere', lineHeight: 1.5 }}>{value}</div>
          </div>
        ))}
      </div>

      {lots.length > 0 && (
        <>
          <div style={sectionTitle}>Lots</div>
          <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['Lot', 'Title', 'Reserved for'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {lots.map(l => (
                  <tr key={l.code}>
                    <td style={{ ...td, fontWeight: 700 }}>{l.code}</td>
                    <td style={{ ...td, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{l.title}{l.description && <div style={{ color: colors.textMuted, fontSize: '0.76rem' }}>{l.description}</div>}</td>
                    <td style={td}>{l.reservation_group ? <GroupBadge group={l.reservation_group} /> : 'Open to all'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {(t.addenda || []).length > 0 && (
        <>
          <div style={sectionTitle}>Addenda</div>
          <div style={{ display: 'grid', gap: 10 }}>
            {t.addenda.map(a => {
              const files = (t.documents || []).filter(d => d.addendum_id === a.id);
              return (
                <div key={a.id} style={{ ...card, padding: '14px 18px' }}>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
                    <strong style={{ color: colors.text }}>Addendum {a.number}: {a.title}</strong>
                    <span style={{ fontSize: '0.76rem', color: colors.textMuted }}>{fmtDateTime(a.created_at)}</span>
                  </div>
                  {a.new_deadline && <div style={{ fontSize: '0.82rem', marginTop: 6, color: colors.warningText }}>Closing date changed{a.previous_deadline ? ` from ${fmtDateTime(a.previous_deadline)}` : ''} to {fmtDateTime(a.new_deadline)}.</div>}
                  {a.note && <p style={{ margin: '6px 0 0', fontSize: '0.84rem', lineHeight: 1.55, whiteSpace: 'pre-wrap', color: colors.textBody }}>{a.note}</p>}
                  {files.length > 0 && (
                    <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {files.map(f => <button key={f.id} type="button" onClick={() => onOpen(f, ['pdf', 'html', 'htm'].includes(String(f.extension || '').toLowerCase()))} style={{ ...btnGhost, padding: '4px 12px', fontSize: '0.74rem' }}>{f.name}</button>)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {(t.awards || []).length > 0 && (
        <>
          <div style={sectionTitle}>Award</div>
          <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['Lot', 'Awarded to', 'Amount', 'Date'].map(h => <th key={h} style={{ ...th, padding: '12px 16px' }}>{h}</th>)}</tr></thead>
              <tbody>
                {t.awards.map((w, i) => (
                  <tr key={i}>
                    <td style={{ ...td, padding: '12px 16px' }}>{w.lot_code ? `${w.lot_code}${w.lot_title ? `: ${w.lot_title}` : ''}` : 'Whole tender'}</td>
                    <td style={{ ...td, padding: '12px 16px', fontWeight: 600 }}>{w.winner}</td>
                    <td style={{ ...td, padding: '12px 16px' }}>{w.amount != null && w.amount !== '' ? `${w.currency || 'KES'} ${Number(w.amount).toLocaleString()}` : '—'}</td>
                    <td style={{ ...td, padding: '12px 16px', whiteSpace: 'nowrap' }}>{w.awarded_on ? fmtLongDate(w.awarded_on) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div style={sectionTitle}>Attachments</div>
      {docs.length === 0 ? <div style={{ ...card, padding: 18, fontSize: '0.85rem', color: colors.textMuted }}>None</div> : (
        <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
            <thead><tr>{['Document type', 'Description', 'Date uploaded', 'Action'].map(h => <th key={h} style={{ ...th, padding: '14px 16px', fontSize: '0.74rem' }}>{h}</th>)}</tr></thead>
            <tbody>
              {docs.map(d => {
                const canView = ['pdf', 'html', 'htm'].includes(String(d.extension || '').toLowerCase());
                return (
                  <tr key={d.id}>
                    <td style={{ ...td, padding: '14px 16px', fontSize: '0.85rem' }}>{DOC_TYPE_LABELS[d.type || d.document_type] || 'Other'}</td>
                    <td style={{ ...td, padding: '14px 16px', fontSize: '0.85rem', whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{d.name}{(d.size || d.file_size) ? <span style={{ color: colors.textMuted }}> · {fmtSize(d.size || d.file_size)}</span> : null}</td>
                    <td style={{ ...td, padding: '14px 16px', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>{fmtDateTime(d.uploaded_at || d.created_at)}</td>
                    <td style={{ ...td, padding: '14px 16px', whiteSpace: 'nowrap' }}>
                      {canView && <button type="button" onClick={() => onOpen(d, true)} style={{ ...btnPrimary, padding: '6px 16px', fontSize: '0.72rem', letterSpacing: '0.06em', textTransform: 'uppercase', marginRight: 8 }}>View</button>}
                      <button type="button" onClick={() => onOpen(d, false)} style={{ ...btnGhost, padding: '6px 14px', fontSize: '0.72rem' }}>Download</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
