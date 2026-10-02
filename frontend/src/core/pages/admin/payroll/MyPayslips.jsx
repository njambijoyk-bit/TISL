import { useEffect, useState } from 'react';
import AdminLayout from '../../../../_shared/components/layout/AdminLayout';
import HubHeader from '../../../components/admin/ui/HubHeader';
import { myPayslipsAPI } from '../../../../_shared/api/payroll';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../../../_shared/theme/tokens';
import { money } from '../../../components/admin/books/booksFmt';

/** My payslips: a staff member's own pay, month by month, once a payroll has been approved. Only their own — never anyone else's. */

const monthName = (iso) => new Date(iso).toLocaleString([], { month: 'long', year: 'numeric' });
const PRINT = '@media print { body * { visibility: hidden !important; } #payslip, #payslip * { visibility: visible !important; } #payslip { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none !important; } }';
const Row = ({ l, v, bold, note }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '3px 0', fontWeight: bold ? 800 : 400, borderTop: bold ? '1px solid #e5e7eb' : 'none', marginTop: bold ? 4 : 0 }}>
    <span>{l}{note && <span style={{ color: colors.textFaint, fontSize: '0.72rem' }}> {note}</span>}</span><span>{money(v)}</span>
  </div>
);

function Slip({ p }) {
  return (
    <div id="payslip" style={{ ...card, padding: 20, maxWidth: 560 }}>
      <style>{PRINT}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div><div style={{ fontWeight: 800, fontSize: '1.05rem' }}>{p.company ?? 'Payslip'}</div><div style={{ color: colors.textMuted, fontSize: '0.84rem' }}>Payslip — {monthName(p.run.period_start)}</div></div>
        <div style={{ textAlign: 'right', fontSize: '0.8rem' }}><strong>{p.employee.name}</strong>{p.employee.number && <div style={{ color: colors.textFaint }}>No. {p.employee.number}</div>}{p.employee.job_title && <div style={{ color: colors.textFaint }}>{p.employee.job_title}{p.employee.department ? `, ${p.employee.department}` : ''}</div>}</div>
      </div>
      <div style={{ fontSize: '0.84rem', marginTop: 14 }}>
        <Row l="Basic pay" v={p.basic} />
        {p.absence_deduction > 0 && <Row l="Unpaid absence" note={`(${p.days_unpaid} day${p.days_unpaid === 1 ? '' : 's'})`} v={-p.absence_deduction} />}
        {p.overtime_pay > 0 && <Row l="Overtime" note={`(${p.overtime_hours} h)`} v={p.overtime_pay} />}
        {p.earnings.map((e) => <Row key={e.name} l={e.name} v={e.amount} />)}
        {p.bonuses.map((e, i) => <Row key={`b${i}`} l={e.name} v={e.amount} />)}
        <Row l="Gross pay" v={p.gross} bold />
        {p.deductions.map((d) => <Row key={d.name} l={d.name} v={-d.amount} />)}
        {p.other_deductions.map((d, i) => <Row key={`o${i}`} l={d.name} v={-d.amount} />)}
        <Row l="Net pay" v={p.net} bold />
      </div>
      <div style={{ marginTop: 10, fontSize: '0.74rem', color: colors.textFaint }}>
        Taxable pay {money(p.taxable)}{p.employee.kra_pin ? ` · KRA PIN ${p.employee.kra_pin}` : ''}{p.employee.nssf_number ? ` · NSSF ${p.employee.nssf_number}` : ''} · {p.run.status === 'paid' ? `Paid${p.run.paid_at ? ` on ${p.run.paid_at}` : ''}` : 'Approved — payment to follow'}
      </div>
    </div>
  );
}

export default function MyPayslips() {
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(null);
  const [slip, setSlip] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { myPayslipsAPI.list().then((r) => { setRows(r.rows); if (r.rows[0]) setOpen(r.rows[0].run_id); }).catch((e) => setError(errMsg(e, 'Could not load your payslips'))); }, []);
  useEffect(() => { setSlip(null); if (open) myPayslipsAPI.show(open).then(setSlip).catch((e) => setError(errMsg(e, 'Could not open that payslip'))); }, [open]);
  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1000, margin: '0 auto' }}>
        <HubHeader title="My payslips" description="Your pay for each month, once payroll has been approved. Only you can see these." />
        {error && <p role="alert" style={{ padding: '8px 12px', borderRadius: 8, background: '#fef2f2', color: '#991b1b', fontSize: '0.82rem' }}>{error}</p>}
        {rows && !rows.length && <p style={{ ...card, padding: 18, fontSize: '0.84rem', color: colors.textMuted }}>No payslips yet. They appear here once payroll for a month has been approved.</p>}
        {rows?.length > 0 && (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ display: 'grid', gap: 6, minWidth: 210 }}>
              {rows.map((r) => (
                <button key={r.run_id} type="button" onClick={() => setOpen(r.run_id)} style={{ ...btnGhost, textAlign: 'left', padding: '10px 12px', border: `1.5px solid ${open === r.run_id ? colors.primary ?? '#2563eb' : '#e5e7eb'}`, background: open === r.run_id ? '#eff6ff' : '#fff' }}>
                  <div style={{ fontWeight: 700 }}>{monthName(r.period_start)}</div>
                  <div style={{ fontSize: '0.76rem', color: colors.textMuted }}>Net {money(r.net)} · {r.status === 'paid' ? 'paid' : 'approved'}</div>
                </button>
              ))}
            </div>
            <div style={{ flex: 1, minWidth: 300 }}>
              {slip && <><Slip p={slip} /><div style={{ marginTop: 10 }}><button type="button" style={btnPrimary} onClick={() => window.print()}>Print</button></div></>}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
