import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import PageHeader from '../../../_shared/components/layout/PageHeader';
import projectsAPI from '../../../_shared/api/projects';
import { message, money } from '../../lib/format';
import { Btn, Chip, DataTable, Field, Notice, Panel, PanelTitle, SelectInput, TextInput } from '../../components/ui';
import { td, th } from '../../components/uiTokens';
import ProjectKeys from '../../components/ProjectKeys';

/**
 * Client money (docs/PROJECTS_STAGE4_SPEC.md, build 4.4): money held for clients, never the firm's own. An account is a Books bank ledger with a
 * liability ledger; pooled (a balance per client) or dedicated (one balance). A balance belongs to one client or several jointly. What each holds
 * is worked out from the books. Receiving posts a journal in the books.
 */
export default function ProjectsClientMoney() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState('');
  const [mode, setMode] = useState(null);   // null | 'account' | { balance: account } | { receive: balance }
  const [form, setForm] = useState({});
  const [q, setQ] = useState('');
  const [found, setFound] = useState([]);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setData(await projectsAPI.clientMoney()); setFailed(''); } catch (e) { setFailed(message(e, 'Client money could not be loaded. Try again.')); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!mode?.balance || q.trim().length < 2) { setFound([]); return undefined; }
    let live = true;
    const id = setTimeout(() => { projectsAPI.customers(q).then((r) => { if (live) setFound(r); }).catch(() => { if (live) setFound([]); }); }, 250);
    return () => { live = false; clearTimeout(id); };
  }, [q, mode]);

  const open = (m, f) => { setMode(m); setForm(f); setProblem(''); setQ(''); };
  const run = async (call, done) => {
    setBusy(true);
    try { setData(await call()); setMode(null); setProblem(''); toast.success(done); } catch (e) { setProblem(message(e, 'That could not be done. Try again.')); } finally { setBusy(false); }
  };
  const set = (patch) => { setForm({ ...form, ...patch }); setProblem(''); };

  if (failed) return <AdminLayout><ProjectKeys /><PageHeader title="Client money" actions={<Btn onClick={() => navigate('/admin/projects')}>Close</Btn>} /><Notice status="problem">{failed}</Notice></AdminLayout>;
  if (!data) return <AdminLayout><ProjectKeys /><PageHeader title="Client money" /></AdminLayout>;
  const can = data.can;
  const cur = data.currency;
  const o = data.options;

  return (
    <AdminLayout><ProjectKeys />
      <PageHeader title="Client money" subtitle="Money held for clients, never the firm's own" actions={(
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Btn onClick={() => navigate('/admin/projects')}>Close</Btn>
          {can.manage && data.ready && !mode && <Btn variant="primary" onClick={() => open('account', { name: '', kind: 'pooled', bank: 'existing', bank_ledger_id: '', new_bank: { name: '', group_id: '', bank_name: '', account_number: '' }, liability: 'new', liability_ledger_id: '', liability_group_id: '' })}>New account</Btn>}
        </div>
      )} />
      {!data.ready && <Notice status="warning" style={{ marginBottom: 16 }}>Client money needs database script 260.</Notice>}

      {mode === 'account' && (
        <Panel as="form" style={{ marginBottom: 16 }} onSubmit={(e) => {
          e.preventDefault();
          run(() => projectsAPI.openClientAccount({ name: form.name, kind: form.kind, ...(form.bank === 'existing' ? { bank_ledger_id: Number(form.bank_ledger_id) } : { new_bank: { ...form.new_bank, group_id: Number(form.new_bank.group_id) } }),
            ...(form.liability === 'existing' ? { liability_ledger_id: Number(form.liability_ledger_id) } : { liability_group_id: Number(form.liability_group_id) }) }), 'The account is open');
        }}>
          <PanelTitle hint="The bank ledger is where the money sits; the liability ledger says it is owed to the clients.">New client money account</PanelTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <Field label="Name" htmlFor="ca-name"><TextInput id="ca-name" value={form.name} maxLength={120} onChange={(e) => set({ name: e.target.value })} required /></Field>
            <Field label="Kind" htmlFor="ca-kind"><SelectInput id="ca-kind" value={form.kind} onChange={(e) => set({ kind: e.target.value })}>{Object.entries(o.kinds).map(([k, label]) => <option key={k} value={k}>{label}</option>)}</SelectInput></Field>
            <Field label="Bank ledger" htmlFor="ca-bank">
              <SelectInput id="ca-bank" value={form.bank === 'new' ? 'new' : form.bank_ledger_id} onChange={(e) => (e.target.value === 'new' ? set({ bank: 'new' }) : set({ bank: 'existing', bank_ledger_id: e.target.value }))} required>
                <option value="">Choose…</option>
                {o.bank_ledgers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                {can.bank && <option value="new">Open a new bank ledger in Books</option>}
              </SelectInput>
            </Field>
            {form.bank === 'new' && <>
              <Field label="New bank ledger's name" htmlFor="ca-nb-name"><TextInput id="ca-nb-name" value={form.new_bank.name} maxLength={160} onChange={(e) => set({ new_bank: { ...form.new_bank, name: e.target.value } })} required /></Field>
              <Field label="Under" htmlFor="ca-nb-group"><SelectInput id="ca-nb-group" value={form.new_bank.group_id} onChange={(e) => set({ new_bank: { ...form.new_bank, group_id: e.target.value } })} required><option value="">Choose…</option>{o.bank_groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</SelectInput></Field>
              <Field label="Bank" htmlFor="ca-nb-bank"><TextInput id="ca-nb-bank" value={form.new_bank.bank_name} maxLength={80} onChange={(e) => set({ new_bank: { ...form.new_bank, bank_name: e.target.value } })} /></Field>
              <Field label="Account number" htmlFor="ca-nb-acc"><TextInput id="ca-nb-acc" value={form.new_bank.account_number} maxLength={60} onChange={(e) => set({ new_bank: { ...form.new_bank, account_number: e.target.value } })} /></Field>
            </>}
            <Field label="Owed to clients (liability ledger)" htmlFor="ca-liab">
              <SelectInput id="ca-liab" value={form.liability === 'new' ? 'new' : form.liability_ledger_id} onChange={(e) => (e.target.value === 'new' ? set({ liability: 'new' }) : set({ liability: 'existing', liability_ledger_id: e.target.value }))} required>
                <option value="new">Open "Client money: {form.name || '…'}" in Books</option>
                {o.liability_ledgers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </SelectInput>
            </Field>
            {form.liability === 'new' && <Field label="Under" htmlFor="ca-liab-group"><SelectInput id="ca-liab-group" value={form.liability_group_id} onChange={(e) => set({ liability_group_id: e.target.value })} required><option value="">Choose…</option>{o.liability_groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</SelectInput></Field>}
          </div>
          {problem && <Notice status="problem" style={{ marginTop: 12 }}>{problem}</Notice>}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}><Btn type="submit" variant="primary" busy={busy}>Open the account</Btn><Btn onClick={() => setMode(null)}>Cancel</Btn></div>
        </Panel>
      )}

      {data.accounts.length === 0 && data.ready && <Panel><p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>No client money accounts yet.{can.manage ? ' Open one with New account.' : ''}</p></Panel>}
      <div style={{ display: 'grid', gap: 16 }}>
        {data.accounts.map((a) => (
          <Panel key={a.id} data-account={a.name}>
            <PanelTitle
              hint={<>{a.kind === 'pooled' ? 'Pooled' : 'Dedicated'} · bank ledger {a.bank_ledger.name}{a.liability_ledger ? ` · owed through ${a.liability_ledger.name}` : ''}</>}
              right={<span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}><strong style={{ fontVariantNumeric: 'tabular-nums' }}>{money(a.held, cur)} held</strong><Chip status={a.guard_on ? 'good' : 'neutral'}>{a.guard_on ? 'Guard on' : 'Guard off'}</Chip></span>}
            >
              {a.name}
            </PanelTitle>
            {mode?.balance?.id === a.id && (
              <form onSubmit={(e) => { e.preventDefault(); run(() => projectsAPI.openClientBalance(a.id, { owners: form.owners.map((x) => x.id), label: form.label || null }), 'The balance is open'); }}
                style={{ display: 'grid', gap: 10, padding: 12, borderRadius: 10, background: 'var(--surface-input)', marginBottom: 12 }}>
                <Field label="Held for (one client, or several jointly)" htmlFor="cb-who" hint="Type two letters to find a client.">
                  <TextInput id="cb-who" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
                  {found.length > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>{found.filter((c) => !form.owners.some((x) => x.id === c.id)).map((c) => <Btn key={c.id} small onClick={() => { setForm({ ...form, owners: [...form.owners, { id: c.id, name: c.name }] }); setQ(''); }}>{c.name}</Btn>)}</div>}
                </Field>
                {form.owners.length > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{form.owners.map((x) => <span key={x.id} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><Chip status="info">{x.name}</Chip><Btn small variant="quiet" aria-label={`Remove ${x.name}`} onClick={() => setForm({ ...form, owners: form.owners.filter((y) => y.id !== x.id) })}>×</Btn></span>)}{form.owners.length > 1 && <Chip>Joint</Chip>}</div>}
                <Field label="How it reads (optional)" htmlFor="cb-label"><TextInput id="cb-label" value={form.label} maxLength={160} placeholder={form.owners.map((x) => x.name).join(' and ')} onChange={(e) => set({ label: e.target.value })} /></Field>
                {problem && <Notice status="problem">{problem}</Notice>}
                <div style={{ display: 'flex', gap: 8 }}><Btn type="submit" variant="primary" small busy={busy} disabled={form.owners.length === 0}>Open the balance</Btn><Btn small onClick={() => setMode(null)}>Cancel</Btn></div>
              </form>
            )}
            {a.balances.length === 0 && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>No balances yet.</p>}
            {a.balances.length > 0 && (
              <DataTable minWidth={620}>
                <thead><tr><th style={th}>Held for</th><th style={th}>Work</th><th style={{ ...th, textAlign: 'right' }}>Balance</th><th style={th}><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {a.balances.map((b) => (
                    <tr key={b.id} data-balance={b.label}>
                      <td style={td}><strong>{b.label}</strong>{b.joint && <Chip status="info" style={{ marginLeft: 6 }}>Joint</Chip>}{b.joint && <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-secondary)' }}>{b.owners.map((x) => x.name).join(', ')}</span>}</td>
                      <td style={td}>{b.project ? (b.project.id ? <Link to={`/admin/projects/${b.project.id}?tab=money`} style={{ color: 'var(--color-primary-500)' }}>{b.project.number}</Link> : b.project.number) : <span style={{ color: 'var(--text-secondary)' }}>·</span>}</td>
                      <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{money(b.held, cur)}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{can.manage && !b.is_closed && !mode && <Btn small aria-label={`Receive money for ${b.label}`} onClick={() => open({ receive: b }, { amount: '', from: '', reference: '', date: new Date().toISOString().slice(0, 10) })}>Receive</Btn>}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
            {mode?.receive && a.balances.some((b) => b.id === mode.receive.id) && (
              <form onSubmit={(e) => { e.preventDefault(); run(() => projectsAPI.receiveClientMoney(mode.receive.id, { ...form, amount: Number(form.amount) }), 'Recorded in the books'); }}
                style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, alignItems: 'end', padding: 12, borderRadius: 10, background: 'var(--surface-input)', marginTop: 12 }}>
                <strong style={{ gridColumn: '1 / -1', fontSize: 13.5 }}>Receive for {mode.receive.label}</strong>
                <Field label="Amount" htmlFor="rc-amount"><TextInput id="rc-amount" type="number" min={0.01} step="0.01" value={form.amount} onChange={(e) => set({ amount: e.target.value })} required /></Field>
                <Field label="From" htmlFor="rc-from"><TextInput id="rc-from" value={form.from} maxLength={120} onChange={(e) => set({ from: e.target.value })} required /></Field>
                <Field label="Date" htmlFor="rc-date"><TextInput id="rc-date" type="date" max={new Date().toISOString().slice(0, 10)} value={form.date} onChange={(e) => set({ date: e.target.value })} required /></Field>
                <Field label="Reference (optional)" htmlFor="rc-ref"><TextInput id="rc-ref" value={form.reference} maxLength={60} onChange={(e) => set({ reference: e.target.value })} /></Field>
                <span style={{ gridColumn: '1 / -1', fontSize: 12.5, color: 'var(--text-secondary)' }}>A journal is posted in the books: into {a.bank_ledger.name}, owed through {a.liability_ledger?.name}.</span>
                {problem && <Notice status="problem" style={{ gridColumn: '1 / -1' }}>{problem}</Notice>}
                <div style={{ display: 'flex', gap: 8 }}><Btn type="submit" variant="primary" small busy={busy}>Record it</Btn><Btn small onClick={() => setMode(null)}>Cancel</Btn></div>
              </form>
            )}
            {can.manage && !mode && (a.kind === 'pooled' || a.balances.filter((b) => !b.is_closed).length === 0) && <div style={{ marginTop: 10 }}><Btn small onClick={() => open({ balance: a }, { owners: [], label: '' })}>New balance</Btn></div>}
          </Panel>
        ))}
      </div>
    </AdminLayout>
  );
}
