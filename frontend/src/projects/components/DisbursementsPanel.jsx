import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { day, message, money } from '../lib/format';
import { Btn, Chip, DataTable, Notice, Panel, PanelTitle, TextInput } from './ui';
import { td, th } from './uiTokens';

const STATE = { not_marked: ['', 'neutral'], to_bill: ['To bill', 'warning'], drafted: ['On a drafted bill', 'info'], billed: ['Billed', 'good'], written_off: ['Written off', 'neutral'] };

/**
 * Costs paid for the client (docs/PROJECTS_STAGE5_SPEC.md, build 5.9): the expense lines Books has on this work's cost centres. Mark one "bill to
 * the client" and it goes on the next bill at the amount Books has; or write it off, with a reason.
 */
export default function DisbursementsPanel({ projectId, currency, onChange }) {
  const [data, setData] = useState(null);
  const [writing, setWriting] = useState(null);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setData(await projectsAPI.disbursements(projectId)); } catch { setData(null); } }, [projectId]);
  useEffect(() => { load(); }, [load]);
  if (!data?.ready) return null;
  const run = async (call, done) => {
    setBusy(true);
    try { setData(await call()); setProblem(''); toast.success(done); onChange?.(); return true; } catch (e) { setProblem(message(e, 'That could not be done. Try again.')); return false; } finally { setBusy(false); }
  };

  return (
    <Panel style={{ marginTop: 16 }} data-disbursements>
      <PanelTitle hint="Costs in the books on this work's cost centres. Mark the ones paid for the client to bill them back.">Costs to bill back</PanelTitle>
      {data.lines.length === 0 && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>No costs on this work yet.</p>}
      {data.lines.length > 0 && (
        <DataTable minWidth={680}>
          <thead><tr><th style={th}>Day</th><th style={th}>Cost</th><th style={{ ...th, textAlign: 'right' }}>Amount</th><th style={th}>State</th><th style={th}><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {data.lines.map((l) => (
              <tr key={l.entry_id} data-cost={l.narration || l.ledger}>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>{day(l.date)}</td>
                <td style={td}>{l.narration || l.ledger}<span style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)' }}>{l.voucher} · {l.ledger}</span>{l.write_off_reason && <span style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)' }}>Written off: {l.write_off_reason}</span>}</td>
                <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(l.amount, currency)}</td>
                <td style={td}>{l.state !== 'not_marked' && <Chip status={STATE[l.state][1]}>{STATE[l.state][0]}</Chip>}</td>
                <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {writing?.id === l.entry_id ? (
                    <form style={{ display: 'inline-flex', gap: 6 }} onSubmit={(e) => { e.preventDefault(); run(() => projectsAPI.markDisbursement(projectId, l.entry_id, { write_off: true, reason: writing.reason }), 'Written off').then((ok) => ok && setWriting(null)); }}>
                      <TextInput aria-label="Why it is written off" placeholder="Why" value={writing.reason} maxLength={300} onChange={(e) => setWriting({ ...writing, reason: e.target.value })} required style={{ width: 170 }} />
                      <Btn type="submit" small variant="danger" busy={busy}>Write off</Btn><Btn small onClick={() => setWriting(null)}>×</Btn>
                    </form>
                  ) : (
                    <>
                      {data.can.mark && l.state === 'not_marked' && <Btn small aria-label={`Bill ${l.narration || l.ledger} to the client`} busy={busy} onClick={() => run(() => projectsAPI.markDisbursement(projectId, l.entry_id, { on: true }), 'Marked to bill')}>Bill to the client</Btn>}
                      {data.can.mark && l.state === 'to_bill' && <Btn small variant="quiet" busy={busy} onClick={() => run(() => projectsAPI.markDisbursement(projectId, l.entry_id, { on: false }), 'Unmarked')}>Unmark</Btn>}
                      {data.can.writeoff && l.state === 'to_bill' && <Btn small variant="quiet" aria-label={`Write off ${l.narration || l.ledger}`} onClick={() => setWriting({ id: l.entry_id, reason: '' })}>Write off</Btn>}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
      {problem && <Notice status="problem" style={{ marginTop: 10 }}>{problem}</Notice>}
    </Panel>
  );
}
