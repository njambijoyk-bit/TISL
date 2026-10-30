import { useState } from 'react';
import { btnGhost, card, colors } from '../../../../_shared/theme/tokens';

const TONE = { draft: ['Draft', colors.textMuted], submitted: ['Waiting for approval', colors.warningText], approved: ['Approved', colors.successText], locked: ['Locked', colors.primaryDeep] };
const TYPES = { operating: 'Operating', sales: 'Sales', purchases: 'Purchases', payroll: 'Payroll', capex: 'Capital expenditure', cash: 'Cash', project: 'Project', departmental: 'Departmental', master: 'Master' };
const th = { padding: '6px 8px', fontSize: '0.64rem', fontWeight: 700, color: colors.textFaint, textAlign: 'left', whiteSpace: 'nowrap' };
const td = { padding: '8px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.06)}` };

/** The current budget version: the newest approved or locked one, else the newest. */
const currentOf = (b) => [...b.versions].reverse().find((v) => v.status === 'approved' || v.status === 'locked') ?? b.versions[b.versions.length - 1];

/**
 * Current and past budgets in one list: a budget is past once its last month has gone. Pick one to open it below; the line shows its type, months and where its current version stands.
 */
export default function BudgetsList({ budgets, openId, open }) {
  const now = new Date().toISOString().slice(0, 7);
  const [show, setShow] = useState('current');
  const past = (b) => b.to_month < now;
  const list = budgets.filter((b) => (show === 'all' ? true : show === 'past' ? past(b) : !past(b)));
  const pill = (id, label, n) => (
    <button type="button" onClick={() => setShow(id)} aria-pressed={show === id} style={{ ...btnGhost, padding: '4px 12px', fontSize: '0.74rem', fontWeight: show === id ? 700 : 500, background: show === id ? colors.tint(0.1) : 'transparent', color: show === id ? colors.primaryDeep : colors.textMuted }}>{label} ({n})</button>
  );
  if (!budgets.length) return null;
  return (
    <div style={{ ...card, padding: 14, marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
        <b style={{ fontSize: '0.88rem' }}>Your budgets</b>
        <span style={{ flex: 1 }} />
        {pill('current', 'Current', budgets.filter((b) => !past(b)).length)}{pill('past', 'Past', budgets.filter(past).length)}{pill('all', 'All', budgets.length)}
      </div>
      {list.length === 0 ? <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textFaint }}>{show === 'past' ? 'No budget has ended yet.' : 'No current budget. Make one with "New budget" below.'}</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr><th style={th}>Budget</th><th style={th}>Type</th><th style={th}>Months</th><th style={th}>Versions</th><th style={th}>Current version</th><th style={th} /></tr></thead>
            <tbody>{list.map((b) => {
              const v = currentOf(b);
              const [label, tone] = TONE[v.status] ?? TONE.draft;
              const isOpen = b.versions.some((x) => x.id === openId);
              return (
                <tr key={b.id} style={{ background: isOpen ? colors.tint(0.04) : undefined }}>
                  <td style={{ ...td, fontWeight: 700 }}>{b.name}{past(b) && <span style={{ marginLeft: 6, fontSize: '0.64rem', fontWeight: 400, color: colors.textFaint }}>ended</span>}</td>
                  <td style={td}>{TYPES[b.type] ?? b.type}</td><td style={td}>{b.from_month} to {b.to_month}</td><td style={td}>{b.versions.length}</td>
                  <td style={td}>{v.name} <span style={{ fontSize: '0.7rem', fontWeight: 700, color: tone }}>{label}</span></td>
                  <td style={td}><button type="button" style={{ ...btnGhost, padding: '3px 10px', fontSize: '0.72rem' }} onClick={() => open(b, v)} aria-label={`Open ${b.name}`}>{isOpen ? 'Open' : 'Open it'}</button></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
