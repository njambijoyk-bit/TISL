import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertOctagon, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Settings } from 'lucide-react';
import { card, colors } from '../../../../_shared/theme/tokens';
import { formatAmount } from './engineFmt';

const LOOK = {
  fail: { icon: AlertOctagon, color: colors.dangerText, word: 'Fail' },
  warn: { icon: AlertTriangle, color: colors.warningText ?? colors.dangerText, word: 'Check' },
  pass: { icon: CheckCircle2, color: colors.successText, word: 'Pass' },
  setup: { icon: Settings, color: colors.textMuted, word: 'Not set up' },
};
const ORDER = ['Balance', 'Postings', 'Accounts', 'Reconciliation', 'Tax', 'Set-up'];

/** The Books health panel: each check with its result; a check with findings opens to list them, and a finding opens the voucher or ledger it is about. */
export default function BooksHealthView({ result }) {
  const nav = useNavigate();
  const [open, setOpen] = useState({});
  const d = result.data;
  const A = (v) => formatAmount(v, result.format);
  const go = (to) => {
    if (!to) return;
    if (to.voucher) nav(`/admin/books/vouchers/${to.voucher}`);
    else if (to.ledger) nav(`/admin/books?tab=reports&report=ledger&ledger=${to.ledger}`);
    else if (to.recon) nav('/admin/books?tab=recon');
  };
  const sections = ORDER.filter((s) => d.checks.some((c) => c.section === s));

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {['fail', 'warn', 'pass', 'setup'].map((k) => {
          const L = LOOK[k];
          return (
            <div key={k} style={{ ...card, padding: '10px 16px', minWidth: 110 }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: d.totals[k] && k !== 'pass' && k !== 'setup' ? L.color : colors.text }}>{d.totals[k] ?? 0}</div>
              <div style={{ fontSize: '0.7rem', color: colors.textFaint }}>{L.word}</div>
            </div>
          );
        })}
      </div>
      {sections.map((s) => (
        <div key={s} style={{ ...card, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', fontSize: '0.7rem', fontWeight: 700, color: colors.textFaint, background: colors.tint(0.02) }}>{s.toUpperCase()}</div>
          {d.checks.filter((c) => c.section === s).map((c) => {
            const L = LOOK[c.status] ?? LOOK.setup;
            const Icon = L.icon;
            const isOpen = open[c.key];
            const more = c.count > c.items.length;
            return (
              <div key={c.key} style={{ borderTop: `1px solid ${colors.tint(0.05)}` }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 14px', cursor: c.items.length ? 'pointer' : 'default' }}
                  onClick={() => c.items.length && setOpen((o) => ({ ...o, [c.key]: !o[c.key] }))}>
                  <Icon size={18} style={{ color: L.color, flexShrink: 0, marginTop: 1 }} aria-label={L.word} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{c.title}</div>
                    <div style={{ fontSize: '0.76rem', color: colors.textMuted }}>{c.summary}</div>
                  </div>
                  {c.report && c.status !== 'pass' && <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600, color: colors.primary }} onClick={(e) => { e.stopPropagation(); nav(`/admin/books?tab=reports&report=${c.report}`); }}>Open report</button>}
                  {c.items.length > 0 && (isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />)}
                </div>
                {isOpen && (
                  <div style={{ padding: '0 14px 10px 42px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <tbody>
                        {c.items.map((i, n) => (
                          <tr key={n} onClick={() => go(i.to)} style={{ cursor: i.to ? 'pointer' : 'default' }}>
                            <td style={{ padding: '5px 8px', fontSize: '0.78rem', borderTop: `1px solid ${colors.tint(0.05)}` }}>{i.label}</td>
                            <td style={{ padding: '5px 8px', fontSize: '0.74rem', color: colors.textMuted, borderTop: `1px solid ${colors.tint(0.05)}` }}>{i.detail}</td>
                            <td style={{ padding: '5px 8px', fontSize: '0.78rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums', borderTop: `1px solid ${colors.tint(0.05)}` }}>{i.amount != null ? A(i.amount) : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {more && <div style={{ fontSize: '0.72rem', color: colors.textFaint, marginTop: 4 }}>and {c.count - c.items.length} more. The first {c.items.length} are shown.</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
