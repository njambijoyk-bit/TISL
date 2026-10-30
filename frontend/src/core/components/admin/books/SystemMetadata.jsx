import { colors } from '../../../../_shared/theme/tokens';

const NOTE = 'System metadata: made by the system on every save. It cannot be edited by hand and is never shown on a customer copy.';

/** The system's record of a voucher, as the lines staff read. Mirrors what the server writes into the admin export. */
function metadataLines(n) {
  if (!n) return [];
  const out = [];
  if (n.invoice_mode) out.push(['Invoice mode', n.invoice_mode === 'accounting' ? 'Accounting invoice (ledger lines)' : 'Item invoice']);
  if (n.party) out.push(['Customer / supplier tax', `${n.party.ledger}: ${n.party.tax_treatment_note}`]);
  if (n.taxes_charged?.length) out.push(['Taxes charged', n.taxes_charged.map((t) => `${t.label} ${Number(t.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`).join('; ')]);
  [['branch', 'Branch'], ['currency', 'Currency'], ['channel', 'Made from']].forEach(([k, label]) => { if (n[k]) out.push([label, n[k]]); });
  if (n.created) out.push(['Made', `${n.created.by?.name ?? 'the system'} · ${n.created.at ?? ''}`]);
  if (n.last_saved) out.push(['Last saved', `${n.last_saved.by?.name ?? 'the system'} · ${n.last_saved.at ?? ''} · edited ${Number(n.times_edited ?? 0)} time(s)`]);
  return out;
}

/** Read-only, under the narration: nothing here can be typed into. `pending` says it is what the system will record when the voucher is saved. */
export default function SystemMetadata({ notes, pending = false }) {
  const rows = metadataLines(notes);
  if (!rows.length) return null;
  return (
    <div role="note" aria-label="System metadata" style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, background: colors.tint(0.05), border: `1px dashed ${colors.tint(0.25)}`, fontSize: '0.74rem', color: colors.textMuted }}>
      <div style={{ fontWeight: 700, color: colors.text, marginBottom: 4 }}>System metadata{pending ? ' · will be recorded on save' : ''}</div>
      {rows.map(([k, v]) => <div key={k}><span style={{ color: colors.textFaint }}>{k}: </span>{v}</div>)}
      <div style={{ marginTop: 6, fontStyle: 'italic', color: colors.textFaint }}>{notes._note ?? NOTE}</div>
    </div>
  );
}
