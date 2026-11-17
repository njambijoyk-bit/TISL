import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { day, message } from '../lib/format';
import { Btn, Chip, DataTable, Field, Notice, Panel, PanelTitle, SelectInput, TextInput } from './ui';
import { td, th } from './uiTokens';

/**
 * Ledgers made in Books from this piece of work (build 4.3). Books owns each one from then on; this lists the ones that were asked for here.
 * A new one goes into an income, expense or liability group, or for a bank account into a bank group. No opening balance is taken.
 */
export default function LedgersPanel({ projectId }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setData(await projectsAPI.projectLedgers(projectId)); } catch { setData(null); } }, [projectId]);
  useEffect(() => { load(); }, [load]);
  if (!data) return null;
  const bank = form && form.purpose === 'bank';
  const groups = form ? data.groups[bank ? 'bank' : 'general'] : [];
  const set = (patch) => { setForm({ ...form, ...patch }); setProblem(''); };
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { setData(await projectsAPI.makeProjectLedger(projectId, { ...form, group_id: Number(form.group_id) })); setForm(null); toast.success('The ledger is made in Books'); }
    catch (err) { setProblem(message(err, 'That could not be made. Try again.')); } finally { setBusy(false); }
  };

  return (
    <Panel style={{ marginTop: 16 }} data-ledgers>
      <PanelTitle hint="Made in Books for this work. Books owns them; post to them there like any other ledger." right={data.can.make && !form && <Btn small onClick={() => setForm({ name: '', group_id: '', purpose: 'general', note: '', bank_name: '', account_number: '', branch: '' })}>New ledger</Btn>}>Ledgers</PanelTitle>
      {form && (
        <form onSubmit={save} style={{ display: 'grid', gap: 10, padding: 12, borderRadius: 10, background: 'var(--surface-input)', marginBottom: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            <Field label="What it is for" htmlFor="ledger-purpose">
              <SelectInput id="ledger-purpose" value={form.purpose} onChange={(e) => set({ purpose: e.target.value, group_id: '' })}>
                {Object.entries(data.purposes).filter(([k]) => k !== 'bank' || data.can.bank).filter(([k]) => !['client_money', 'retention', 'advance'].includes(k)).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </SelectInput>
            </Field>
            <Field label="Name in the books" htmlFor="ledger-name"><TextInput id="ledger-name" value={form.name} maxLength={160} onChange={(e) => set({ name: e.target.value })} required /></Field>
            <Field label="Goes under" htmlFor="ledger-group"><SelectInput id="ledger-group" value={form.group_id} onChange={(e) => set({ group_id: e.target.value })} required><option value="">Choose…</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</SelectInput></Field>
            {bank && <Field label="Bank" htmlFor="ledger-bank"><TextInput id="ledger-bank" value={form.bank_name} maxLength={80} onChange={(e) => set({ bank_name: e.target.value })} /></Field>}
            {bank && <Field label="Account number" htmlFor="ledger-account"><TextInput id="ledger-account" value={form.account_number} maxLength={60} onChange={(e) => set({ account_number: e.target.value })} /></Field>}
            {bank && <Field label="Branch" htmlFor="ledger-branch"><TextInput id="ledger-branch" value={form.branch} maxLength={80} onChange={(e) => set({ branch: e.target.value })} /></Field>}
            <Field label="Note (optional)" htmlFor="ledger-note"><TextInput id="ledger-note" value={form.note} maxLength={200} onChange={(e) => set({ note: e.target.value })} /></Field>
          </div>
          <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>It starts at nothing. Money only enters the books as a voucher.{bank ? ' Bank details may ask you to confirm it is you, as they do in Books.' : ''}</span>
          {problem && <Notice status="problem">{problem}</Notice>}
          <div style={{ display: 'flex', gap: 8 }}><Btn type="submit" variant="primary" small busy={busy}>Make it in Books</Btn><Btn small onClick={() => setForm(null)}>Cancel</Btn></div>
        </form>
      )}
      {data.ledgers.length === 0 && !form && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>None made from this work.</p>}
      {data.ledgers.length > 0 && (
        <DataTable minWidth={560}>
          <thead><tr><th style={th}>Ledger</th><th style={th}>Under</th><th style={th}>For</th><th style={th}>Made</th></tr></thead>
          <tbody>
            {data.ledgers.map((l) => (
              <tr key={l.id} data-ledger={l.name}>
                <td style={{ ...td, fontWeight: 600 }}>{l.name}{!l.is_active && <Chip style={{ marginLeft: 6 }}>Switched off in Books</Chip>}</td>
                <td style={td}>{l.group}</td>
                <td style={td}>{l.purpose_name}{l.note && <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-secondary)' }}>{l.note}</span>}</td>
                <td style={td}>{day(l.made_at)}{l.made_by && <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-secondary)' }}>{l.made_by}</span>}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </Panel>
  );
}
