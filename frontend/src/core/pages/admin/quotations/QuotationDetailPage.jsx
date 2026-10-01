import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, Pencil, Send, Ban } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../../_shared/components/layout/AdminLayout';
import quotationsAPI from '../../../../_shared/api/quotations';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { btnPrimary, btnGhost, card, colors } from '../../../../_shared/theme/tokens';
import { ExportMenu } from '../../../components/admin/books/booksUi';
import { money } from '../../../components/admin/books/booksFmt';
import { DocChip } from './DocChip';

const th = { padding: '8px 10px', fontSize: '0.65rem', fontWeight: 700, color: colors.textFaint, textAlign: 'left' };
const td = { padding: '8px 10px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.05)}` };
const r = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

export default function QuotationDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [q, setQ] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => quotationsAPI.voucher(id).then(setQ).catch((e) => setError(errMsg(e, 'Could not load the quotation'))), [id]);
  useEffect(() => { load(); }, [load]);

  const act = async (fn, ok) => {
    setBusy(true);
    try { const res = await fn(); toast.success(res.message ?? ok); await load(); }
    catch (e) { toast.error(errMsg(e, 'That did not work'), { duration: 7000 }); }
    finally { setBusy(false); }
  };

  if (error) return <AdminLayout><div style={{ padding: 32 }}><p role="alert" style={{ color: colors.dangerText }}>{error}</p><Link to="/admin/quotes">Back</Link></div></AdminLayout>;
  if (!q) return <AdminLayout><div style={{ padding: 32, color: colors.textMuted }}>Loading…</div></AdminLayout>;

  const lines = (q.items ?? []).filter((i) => !i.parent_item_id);
  const pending = lines.filter((i) => i.pending_price).length;
  const cancelled = q.status === 'cancelled';
  const canEdit = !cancelled && ['requested', 'quoted', 'revision_requested'].includes(q.doc_status);
  const order = (q.children ?? []).find((c) => c.status === 'posted');

  return (
    <AdminLayout>
      <div style={{ padding: '28px 24px', maxWidth: 1000, margin: '0 auto' }}>
        <Link to="/admin/quotes" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: '0.78rem', color: colors.textMuted, textDecoration: 'none', marginBottom: 10 }}><ArrowLeft size={14} /> Quotations</Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: colors.primary }}>Quotation <span style={{ fontFamily: 'monospace' }}>{q.voucher_number}</span></h1>
            <p style={{ margin: '6px 0 0', fontSize: '0.8rem', color: colors.textMuted }}>
              <DocChip status={cancelled ? 'withdrawn' : q.doc_status} /> {q.valid_until && <> · valid until {q.valid_until}</>}
              {order && <> · <Link to={`/admin/books/vouchers/${order.id}`}>{order.voucher_number}</Link></>}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <ExportMenu onExport={(f) => quotationsAPI.exportQuotation(q.id, f)} />
            {canEdit && <button type="button" style={btnGhost} onClick={() => nav(`/admin/quotes/${q.id}/edit`)}><Pencil size={14} /> {pending ? 'Price it' : 'Edit prices'}</button>}
            {canEdit && <button type="button" disabled={busy || pending > 0} title={pending ? `${pending} line(s) still need a price` : ''} style={{ ...btnPrimary, opacity: busy || pending ? 0.5 : 1 }} onClick={() => act(() => quotationsAPI.send(q.id), 'Sent')}><Send size={14} /> Send to customer</button>}
            {canEdit && <button type="button" disabled={busy} style={{ ...btnGhost, color: colors.danger }} onClick={() => { const reason = window.prompt('Withdraw this quotation? Reason:'); if (reason !== null) act(() => quotationsAPI.withdraw(q.id, reason), 'Withdrawn'); }}><Ban size={14} /> Withdraw</button>}
          </div>
        </div>

        {q.doc_status === 'requested' && canEdit && pending === 0 && <p role="status" style={{ padding: '10px 14px', borderRadius: 8, background: colors.successBg ?? colors.warningBg, color: colors.successText ?? colors.warningText, fontSize: '0.82rem' }}>Every line is priced, but the customer still sees “we're preparing your prices” — they can't see anything until you press <strong>Send to customer</strong>.</p>}
        {q.doc_status === 'revision_requested' && q.response_note && <p role="status" style={{ padding: '10px 14px', borderRadius: 8, background: colors.warningBg, color: colors.warningText, fontSize: '0.82rem' }}>The customer asked for changes: “{q.response_note}”</p>}
        {q.doc_status === 'declined' && q.response_note && <p role="status" style={{ padding: '10px 14px', borderRadius: 8, background: colors.dangerBg, color: colors.dangerText, fontSize: '0.82rem' }}>Declined: “{q.response_note}”</p>}
        {pending > 0 && canEdit && <p role="status" style={{ padding: '10px 14px', borderRadius: 8, background: colors.warningBg, color: colors.warningText, fontSize: '0.82rem' }}>{pending} line(s) have no price yet. Choose “Price it”, enter the prices, then send.</p>}

        <div style={{ ...card, padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12, marginBottom: 16, fontSize: '0.82rem' }}>
          <div><span style={{ color: colors.textFaint, fontSize: '0.68rem', display: 'block' }}>CUSTOMER</span>{q.party_ledger?.name ?? '—'}</div>
          <div><span style={{ color: colors.textFaint, fontSize: '0.68rem', display: 'block' }}>CURRENCY</span>{q.currency?.code}</div>
          {q.meta?.request?.timeline_needed && <div><span style={{ color: colors.textFaint, fontSize: '0.68rem', display: 'block' }}>NEEDED BY</span>{q.meta.request.timeline_needed}</div>}
          {q.narration && <div style={{ gridColumn: '1 / -1' }}><span style={{ color: colors.textFaint, fontSize: '0.68rem', display: 'block' }}>REQUEST</span><span style={{ whiteSpace: 'pre-wrap' }}>{q.narration}</span></div>}
        </div>

        <div style={{ ...card, overflow: 'hidden', marginBottom: 16 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: colors.tint(0.02) }}><th style={th}>Item</th><th style={th}>Package / variant</th><th style={{ ...th, textAlign: 'right' }}>Qty</th><th style={{ ...th, textAlign: 'right' }}>Rate</th><th style={{ ...th, textAlign: 'right' }}>Amount</th><th style={{ ...th, textAlign: 'right' }}>Tax</th></tr></thead>
            <tbody>
              {lines.map((i) => (
                <tr key={i.id}>
                  <td style={td}>{i.description}{i.notes && <div style={{ fontSize: '0.7rem', color: colors.textFaint }}>{i.notes}</div>}</td>
                  <td style={td}>{i.variant_label && i.variant_label !== 'Standard' ? i.variant_label : ''}</td>
                  <td style={{ ...td, ...r }}>{Number(i.quantity)} {i.unit_code}</td>
                  <td style={{ ...td, ...r }}>{i.pending_price ? <span style={{ color: colors.warningText, fontWeight: 700 }}>needs price</span> : money(i.rate)}</td>
                  <td style={{ ...td, ...r }}>{money(i.amount)}</td>
                  <td style={{ ...td, ...r }}>{Number(i.tax_amount) ? money(i.tax_amount) : ''}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 800, background: colors.tint(0.03) }}><td style={td} colSpan={4}>Total {q.currency?.code}</td><td style={{ ...td, ...r }} colSpan={2}>{money(q.total_amount)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
