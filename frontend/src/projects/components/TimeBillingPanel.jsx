import { Fragment, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { day, message, money } from '../lib/format';
import { hm } from '../lib/tasks';
import { Btn, Chip, DataTable, Field, Notice, Panel, PanelTitle, TextInput } from './ui';
import { td, th } from './uiTokens';

/**
 * Time and costs to bill (docs/PROJECTS_STAGE5_SPEC.md, builds 5.8 and 5.9): approved, billable time not yet billed, by person and Books
 * package, with what it comes to at Books' price; costs marked to bill back. Billing makes one Books sales invoice, posted or drafted by the
 * money setting; a drafted one waits here until it is saved in Books, or is dropped. Time can be written off before it is billed.
 */
export default function TimeBillingPanel({ projectId, currency, onBilled }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [upTo, setUpTo] = useState('');
  const [open, setOpen] = useState(null);   // the group whose entries are shown
  const [writing, setWriting] = useState(null);   // { id, minutes, reason }
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setData(await projectsAPI.timeBilling(projectId, upTo ? { up_to: upTo } : {})); } catch (e) { setProblem(message(e, 'The time to bill could not be loaded.')); } }, [projectId, upTo]);
  useEffect(() => { load(); }, [load]);
  if (!data) return problem ? <Notice status="problem" style={{ marginTop: 16 }}>{problem}</Notice> : null;
  if (!data.ready) return null;
  const f = (n) => (n === null || n === undefined ? <span style={{ color: 'var(--text-secondary)' }}>no price</span> : money(n, currency));
  const bill = async () => {
    setBusy(true);
    try {
      const r = await projectsAPI.billTime(projectId, upTo ? { up_to: upTo } : {});
      if (r.mode === 'draft') { navigate(`/admin/books/vouchers/new?type=${r.form.voucher_type_id}&project_bill=${r.stage_id}`); return; }
      setData(r.unbilled); toast.success(`${r.voucher.number} is posted in the books`); onBilled?.();
    } catch (e) { setProblem(message(e, 'It could not be billed. Try again.')); } finally { setBusy(false); }
  };
  const costs = data.disbursements ?? [];
  const costTotal = costs.reduce((n, c) => n + c.amount, 0);
  const nothing = data.groups.length === 0 && costs.length === 0;

  return (
    <Panel style={{ marginTop: 16 }} data-time-billing>
      <PanelTitle hint={`Approved, billable and not yet billed${upTo ? ` up to ${day(upTo)}` : ''}. Prices are Books'.`} right={(
        <span style={{ display: 'inline-flex', gap: 8, alignItems: 'end', flexWrap: 'wrap' }}>
          <Chip status="info">{data.mode === 'post' ? 'Bills are posted' : 'Bills open on the Books form'}</Chip>
          <TextInput aria-label="Up to" type="date" value={upTo} onChange={(e) => setUpTo(e.target.value)} style={{ width: 150 }} />
          {data.can.bill && !nothing && <Btn small variant="primary" busy={busy} onClick={bill}>{data.mode === 'post' ? 'Bill it' : 'Open in Books'}</Btn>}
        </span>
      )}>Time and costs to bill</PanelTitle>
      {data.no_rate.length > 0 && <Notice status="warning" style={{ marginBottom: 12 }}>No rate covers the time of {data.no_rate.join(', ')}. Add them to the rate card before billing.</Notice>}
      {data.drafts.length > 0 && (
        <Notice status="info" style={{ marginBottom: 12 }}>
          {data.drafts.map((d) => (
            <span key={d.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }} data-draft={d.name}>
              {d.name} is drafted and not yet saved in Books ({d.entries} {d.entries === 1 ? 'entry' : 'entries'}).
              <Btn small onClick={() => navigate(`/admin/books/vouchers/new?type=${d.voucher_type_id}&project_bill=${d.id}`)}>Open in Books</Btn>
              {data.can.bill && <Btn small variant="quiet" onClick={async () => { try { setData(await projectsAPI.dropTimeBill(projectId, d.id)); toast.success('Dropped: the time is free to bill again'); } catch (e) { setProblem(message(e, 'It could not be dropped.')); } }}>Drop it</Btn>}
            </span>
          ))}
        </Notice>
      )}
      {nothing && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>Nothing waits to be billed.</p>}
      {data.groups.length > 0 && (
        <DataTable minWidth={640}>
          <thead><tr><th style={th}>Person</th><th style={th}>Billed at</th><th style={{ ...th, textAlign: 'right' }}>Hours</th><th style={{ ...th, textAlign: 'right' }}>At Books' price</th><th style={th}><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {data.groups.map((g, i) => (
              <Fragment key={i}>
                <tr data-group={`${g.person} ${g.package?.name ?? 'no rate'}`}>
                  <td style={td}>{g.person}</td>
                  <td style={td}>{g.package ? `${g.package.service} · ${g.package.name}` : <Chip status="warning">No rate</Chip>}</td>
                  <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{g.hours}</td>
                  <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{f(g.amount)}</td>
                  <td style={{ ...td, textAlign: 'right' }}><Btn small variant="quiet" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>{open === i ? 'Hide' : 'Entries'}</Btn></td>
                </tr>
                {open === i && g.entries.map((e) => (
                  <tr key={e.id} data-billing-entry={e.id}>
                    <td style={{ ...td, paddingLeft: 26, fontSize: 12.5 }}>{day(e.work_date)}</td>
                    <td style={{ ...td, fontSize: 12.5 }} colSpan={2}>{e.task ?? 'The work in general'}{e.note ? ` · ${e.note}` : ''}{e.written_off_minutes > 0 && <Chip status="warning" style={{ marginLeft: 6 }}>{hm(e.written_off_minutes)} written off</Chip>}</td>
                    <td style={{ ...td, textAlign: 'right', fontSize: 12.5 }}>{hm(e.minutes - e.written_off_minutes)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      {writing?.id === e.id ? (
                        <form style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }} onSubmit={async (ev) => { ev.preventDefault(); setBusy(true); try { setData(await projectsAPI.writeOffTime(e.id, Number(writing.minutes), writing.reason)); setWriting(null); toast.success('Written off'); } catch (err) { setProblem(message(err, 'It could not be written off.')); } finally { setBusy(false); } }}>
                          <TextInput aria-label="Minutes to write off" type="number" min={0} max={e.minutes} value={writing.minutes} onChange={(ev) => setWriting({ ...writing, minutes: ev.target.value })} style={{ width: 80 }} required />
                          <TextInput aria-label="Why" placeholder="Why" value={writing.reason} maxLength={300} onChange={(ev) => setWriting({ ...writing, reason: ev.target.value })} style={{ width: 160 }} required />
                          <Btn type="submit" small variant="danger" busy={busy}>Write off</Btn><Btn small onClick={() => setWriting(null)}>×</Btn>
                        </form>
                      ) : data.can.writeoff && <Btn small variant="quiet" aria-label={`Write off time on ${day(e.work_date)}`} onClick={() => setWriting({ id: e.id, minutes: String(e.minutes - e.written_off_minutes), reason: '' })}>Write off</Btn>}
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
            <tr><td style={{ ...td, fontWeight: 700 }} colSpan={2}>Time</td><td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{data.hours}</td><td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{f(data.amount)}</td><td style={td} /></tr>
          </tbody>
        </DataTable>
      )}
      {costs.length > 0 && (
        <div style={{ marginTop: 12 }} data-costs-to-bill>
          <strong style={{ fontSize: 13.5 }}>Costs to bill back · {money(costTotal, currency)}</strong>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13 }}>{costs.map((c) => <li key={c.id}>{day(c.date)} · {c.narration || c.ledger} ({c.voucher}) · {money(c.amount, currency)}</li>)}</ul>
        </div>
      )}
      {problem && <Notice status="problem" style={{ marginTop: 10 }}>{problem}</Notice>}
    </Panel>
  );
}
