import { useEffect, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AdminLayout from '../../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../components/admin/ui/HubHeader';
import Modal from '../../../components/admin/ui/Modal';
import { Field, SelectInput, TextInput } from '../../../components/admin/ui/Form';
import booksAPI from '../../../../_shared/api/books';
import useAuthStore from '../../../../_shared/store/authStore';
import { canReadFinance } from '../../../../_shared/lib/roles';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { card, colors } from '../../../../_shared/theme/tokens';

const th = { padding: '8px 10px', fontSize: '0.68rem', fontWeight: 700, color: colors.textFaint, textAlign: 'left', whiteSpace: 'nowrap' };
const td = { padding: '8px 10px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.05)}` };
const RED = { color: '#dc2626', fontWeight: 600 };
const when = (s) => (s ? String(s).replace('T', ' ').slice(0, 16) : '');

/** One labelled table per part of the voucher. A value that differs from the other version shows in red. */
function Part({ title, mine, other, rows }) {
  if (!mine?.length && !other?.length) return null;
  const n = Math.max(mine?.length ?? 0, other?.length ?? 0);
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ ...th, padding: '6px 0' }}>{title}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {Array.from({ length: n }).map((_, i) => rows(mine?.[i], other?.[i], i))}
        </tbody>
      </table>
    </div>
  );
}

function Side({ v, other }) {
  if (!v) return <div style={{ color: colors.textMuted, fontSize: '0.8rem' }}>Not available</div>;
  const s = v.snapshot ?? {}; const o = other?.snapshot ?? {};
  const cell = (a, b) => (String(a ?? '') === String(b ?? '') ? {} : RED);
  const keys = Object.keys(s.header ?? {});
  const obj = (title, key) => (
    <Part title={title} mine={s[key]} other={o[key]} rows={(a, b, i) => a ? (
      <tr key={i}><td style={td}>{Object.entries(a).map(([k, val]) => <div key={k} style={cell(val, b?.[k])}><span style={{ color: colors.textFaint, fontSize: '0.7rem' }}>{k}</span> {String(val ?? '')}</div>)}</td></tr>
    ) : <tr key={i}><td style={{ ...td, ...RED }}>—</td></tr>} />
  );
  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 2 }}>Version {v.version} <span style={{ color: colors.textMuted, fontWeight: 500 }}>{v.activity === 'created' ? 'Created' : v.activity === 'deleted' ? 'Deleted' : v.activity ? 'Altered' : 'Before the log began'}</span></div>
      <div style={{ color: colors.textMuted, fontSize: '0.72rem', marginBottom: 8 }}>{v.user ?? '—'} · {when(v.at)}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
        <thead><tr><th style={th}>Particulars</th><th style={th}>Value</th></tr></thead>
        <tbody>{keys.map((k) => <tr key={k}><td style={td}>{k}</td><td style={{ ...td, ...cell(s.header[k], o.header?.[k]) }}>{String(s.header[k] ?? '')}</td></tr>)}</tbody>
      </table>
      {obj('Items', 'items')}{obj('Ledger entries', 'entries')}{obj('Payments', 'payments')}{obj('Bills', 'bills')}
    </div>
  );
}

function Differences({ id, onClose }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [a, setA] = useState(null);
  const [b, setB] = useState(null);
  useEffect(() => {
    booksAPI.versions(id).then((d) => {
      setData(d);
      const n = d.versions.length;
      setA(d.versions[Math.max(n - 2, 0)]?.version ?? null); setB(d.versions[n - 1]?.version ?? null);
    }).catch((e) => setErr(errMsg(e, 'Could not load the versions')));
  }, [id]);
  const find = (n) => data?.versions.find((x) => x.version === n);
  const pick = (val, set) => (
    <SelectInput value={val ?? ''} onChange={(e) => set(Number(e.target.value))} style={{ maxWidth: 220 }}>
      {(data?.versions ?? []).map((x) => <option key={x.version} value={x.version}>Version {x.version}</option>)}
    </SelectInput>
  );
  return (
    <Modal title={data ? `Differences — ${data.voucher.type} ${data.voucher.voucher_number}` : 'Differences'} subtitle="What is different between two versions shows in red." onClose={onClose} width={1000}>
      {err && <p role="alert" style={{ color: colors.dangerText }}>{err}</p>}
      {!data && !err && <p style={{ color: colors.textMuted }}>Loading…</p>}
      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 18 }}>
          <div>{pick(a, setA)}<div style={{ marginTop: 10 }}><Side v={find(a)} other={find(b)} /></div></div>
          <div>{pick(b, setB)}<div style={{ marginTop: 10 }}><Side v={find(b)} other={find(a)} /></div></div>
        </div>
      )}
    </Modal>
  );
}

/** Every voucher that was changed or deleted, with how many versions it has — like Tally's Edit Log Summary. */
export default function EditLog() {
  const user = useAuthStore((s) => s.user);
  const [params] = useSearchParams();
  const [f, setF] = useState({ from: '', to: '', search: '' });
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [open, setOpen] = useState(params.get('voucher') ? Number(params.get('voucher')) : null);

  const load = useCallback(() => {
    const q = Object.fromEntries(Object.entries(f).filter(([, v]) => v));
    booksAPI.editLog(q).then((d) => { setRows(d.rows); setErr(null); }).catch((e) => setErr(errMsg(e, 'Could not load the edit log')));
  }, [f]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const alive = (rows ?? []).filter((r) => !r.deleted);
  const gone = (rows ?? []).filter((r) => r.deleted);
  const line = (r) => (
    <tr key={r.id} onClick={() => setOpen(r.id)} style={{ cursor: 'pointer', background: r.deleted ? 'rgba(220,38,38,0.05)' : 'transparent' }}>
      <td style={td}>{r.date}</td><td style={td}>{r.particulars}</td><td style={td}>{r.type}</td>
      <td style={{ ...td, fontFamily: 'monospace' }}>{r.voucher_number}</td><td style={{ ...td, textAlign: 'right' }}>{r.versions}</td>
    </tr>
  );

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1100, margin: '0 auto' }}>
        {!canReadFinance(user) ? <NoAccess what="the edit log" /> : (
          <>
            <HubHeader title="Edit log" description="Every voucher that has been changed or deleted, and every version it went through. Click one to compare versions." />
            <Link to="/admin/books" style={{ fontSize: '0.78rem', color: colors.textMuted }}>← Books</Link>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '12px 0' }}>
              <Field label="From" htmlFor="el-from"><TextInput id="el-from" type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
              <Field label="To" htmlFor="el-to"><TextInput id="el-to" type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
              <Field label="Search" htmlFor="el-q"><TextInput id="el-q" placeholder="Party or voucher no." value={f.search} onChange={(e) => setF({ ...f, search: e.target.value })} /></Field>
            </div>
            {err && <p role="alert" style={{ color: colors.dangerText }}>{err}</p>}
            <div style={{ ...card, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>Date</th><th style={th}>Particulars</th><th style={th}>Vch type</th><th style={th}>Vch no.</th><th style={{ ...th, textAlign: 'right' }}>Versions</th></tr></thead>
                <tbody>
                  {rows === null && <tr><td style={td} colSpan={5}>Loading…</td></tr>}
                  {rows && rows.length === 0 && <tr><td style={{ ...td, color: colors.textMuted }} colSpan={5}>Nothing has been changed yet.</td></tr>}
                  {alive.map(line)}
                  {gone.length > 0 && <tr><td colSpan={5} style={{ ...td, fontWeight: 700, color: '#dc2626' }}>(Deleted)</td></tr>}
                  {gone.map(line)}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      {open && <Differences id={open} onClose={() => setOpen(null)} />}
    </AdminLayout>
  );
}
