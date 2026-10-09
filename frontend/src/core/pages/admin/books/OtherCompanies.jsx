import { useCallback, useEffect, useRef, useState } from 'react';
import { Upload, Plug, Download, KeyRound, Trash2, Copy, X } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../components/admin/ui/HubHeader';
import Tabs from '../../../components/admin/ui/Tabs';
import { Field, TextInput, SelectInput, FormError } from '../../../components/admin/ui/Form';
import OtherBooksViewer from '../../../components/admin/books/other/OtherBooksViewer';
import exchangeAPI from '../../../../_shared/api/exchange';
import { openWnkjap } from '../../../../_shared/lib/wnkjap';
import { hasPermission } from '../../../../_shared/lib/roles';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../../../_shared/theme/tokens';

const box = { ...card, padding: 18, display: 'grid', gap: 12, maxWidth: 640 };

/** Open a file or fetch one, type its password, and look at it: everything stays in this page's memory. */
function OpenBooks({ options, connections, onOpened }) {
  const fileRef = useRef(null);
  const [bytes, setBytes] = useState(null);       // { name, data } the sealed file, not yet opened
  const [password, setPassword] = useState('');
  const [conn, setConn] = useState('');
  const [fetchOpts, setFetchOpts] = useState({ level: 2, from: '', to: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const pick = async (file) => {
    if (!file) return;
    setErr(null);
    setBytes({ name: file.name, data: await file.arrayBuffer() });
  };
  const fetchIt = async () => {
    setBusy(true); setErr(null);
    try {
      const data = await exchangeAPI.fetch(conn, { level: Number(fetchOpts.level), from: fetchOpts.from || undefined, to: fetchOpts.to || undefined });
      setBytes({ name: connections.find((c) => String(c.id) === String(conn))?.name ?? 'fetched file', data });
    } catch (e) { setErr(errMsg(e, 'Could not fetch the file')); } finally { setBusy(false); }
  };
  const open = async () => {
    setBusy(true); setErr(null);
    try { const doc = await openWnkjap(bytes.data, password); setPassword(''); setBytes(null); onOpened(doc); } catch (e) { setErr(e.message || 'Could not open the file'); } finally { setBusy(false); }
  };

  if (bytes) {
    return (
      <div style={box}>
        <p style={{ margin: 0, fontSize: '0.85rem' }}><strong>{bytes.name}</strong> is ready. Type its password to open it here. The password and the books stay in this page and are not sent to the server.</p>
        <Field label="File password"><TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && password && open()} autoFocus autoComplete="off" /></Field>
        <FormError message={err} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" style={btnPrimary} onClick={open} disabled={busy || password.length < 1}>{busy ? 'Opening…' : 'Open'}</button>
          <button type="button" style={btnGhost} onClick={() => { setBytes(null); setPassword(''); setErr(null); }}>Choose another</button>
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={box}>
        <strong style={{ fontSize: '0.9rem' }}>Open a file</strong>
        <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textMuted }}>A <code>.wnkjap</code> file another company gave you. It is opened in your browser and nothing of it is saved here.</p>
        <input ref={fileRef} type="file" accept=".wnkjap" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
        <div><button type="button" style={btnPrimary} onClick={() => fileRef.current?.click()}><Upload size={14} /> Choose a .wnkjap file</button></div>
        <FormError message={err} />
      </div>
      <div style={box}>
        <strong style={{ fontSize: '0.9rem' }}>Fetch from a company</strong>
        {connections.length === 0 ? <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textMuted }}>No connections yet. Add one under Connections.</p> : (
          <>
            <Field label="Company"><SelectInput value={conn} onChange={(e) => setConn(e.target.value)}><option value="">Choose…</option>{connections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectInput></Field>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
              <Field label="How much"><SelectInput value={fetchOpts.level} onChange={(e) => setFetchOpts((o) => ({ ...o, level: e.target.value }))}>{options.levels.map((l) => <option key={l.level} value={l.level}>{l.label}</option>)}</SelectInput></Field>
              <Field label="From"><TextInput type="date" value={fetchOpts.from} onChange={(e) => setFetchOpts((o) => ({ ...o, from: e.target.value }))} /></Field>
              <Field label="To"><TextInput type="date" value={fetchOpts.to} onChange={(e) => setFetchOpts((o) => ({ ...o, to: e.target.value }))} /></Field>
            </div>
            <div><button type="button" style={btnPrimary} onClick={fetchIt} disabled={!conn || busy}><Plug size={14} /> {busy ? 'Fetching…' : 'Fetch'}</button></div>
          </>
        )}
      </div>
    </div>
  );
}

/** Make a sealed file of this company's books. */
function MakeFile({ options }) {
  const [f, setF] = useState({ level: 2, from: '', to: '', location_id: '', password: '', again: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const go = async () => {
    setErr(null);
    if (f.password.length < 8) { setErr('The password must be at least 8 characters.'); return; }
    if (f.password !== f.again) { setErr('The two passwords are not the same.'); return; }
    setBusy(true);
    try { await exchangeAPI.exportFile({ level: Number(f.level), from: f.from || null, to: f.to || null, location_id: f.location_id || null, password: f.password }); toast.success('File made. Give the password to the other company separately.'); setF((x) => ({ ...x, password: '', again: '' })); }
    catch (e) { setErr(errMsg(e, 'Could not make the file')); } finally { setBusy(false); }
  };
  return (
    <div style={box}>
      <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textMuted }}>The books of <strong>{options.company}</strong> sealed with a password. Whoever has both the file and the password can read it, so send them by different ways.</p>
      <Field label="How much" hint="Each level includes the ones before it."><SelectInput value={f.level} onChange={set('level')}>{options.levels.map((l) => <option key={l.level} value={l.level}>{l.level}. {l.label}</option>)}</SelectInput></Field>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
        <Field label="From"><TextInput type="date" value={f.from} onChange={set('from')} /></Field>
        <Field label="To"><TextInput type="date" value={f.to} onChange={set('to')} /></Field>
        {options.branches.length > 1 && <Field label="Branch"><SelectInput value={f.location_id} onChange={set('location_id')}><option value="">All branches</option>{options.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</SelectInput></Field>}
      </div>
      <Field label="File password"><TextInput type="password" value={f.password} onChange={set('password')} autoComplete="new-password" /></Field>
      <Field label="Type it again"><TextInput type="password" value={f.again} onChange={set('again')} autoComplete="new-password" /></Field>
      <FormError message={err} />
      <div><button type="button" style={btnPrimary} onClick={go} disabled={busy}><Download size={14} /> {busy ? 'Making the file…' : 'Make the file'}</button></div>
    </div>
  );
}

/** Keys another company's viewer uses to fetch this company's books. */
function Keys({ options }) {
  const [rows, setRows] = useState(null);
  const [label, setLabel] = useState('');
  const [maxLevel, setMaxLevel] = useState(2);
  const [made, setMade] = useState(null);
  const load = useCallback(() => exchangeAPI.keys().then((r) => setRows(r.data)).catch((e) => toast.error(errMsg(e, 'Could not load the keys'))), []);
  useEffect(() => { load(); }, [load]);
  const make = async () => {
    try { const r = await exchangeAPI.makeKey({ label, max_level: Number(maxLevel) }); setMade(r.data); setLabel(''); load(); } catch (e) { toast.error(errMsg(e, 'Could not make the key')); }
  };
  const copy = (t) => navigator.clipboard?.writeText(t).then(() => toast.success('Copied')).catch(() => {});
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={box}>
        <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textMuted }}>A key lets another company's system fetch a file of these books (never more than the depth you allow). Each key has its own file password. Both are shown once.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 220px auto', gap: 8, alignItems: 'end' }}>
          <Field label="Who is it for"><TextInput value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nairobi shop viewer" /></Field>
          <Field label="Deepest level"><SelectInput value={maxLevel} onChange={(e) => setMaxLevel(e.target.value)}>{options.levels.map((l) => <option key={l.level} value={l.level}>{l.level}. {l.label.split(':')[0]}</option>)}</SelectInput></Field>
          <button type="button" style={btnPrimary} onClick={make} disabled={!label.trim()}><KeyRound size={14} /> Make a key</button>
        </div>
      </div>
      {made && (
        <div style={{ ...box, border: `2px solid ${colors.primary}` }}>
          <strong>Copy these now. They will not be shown again.</strong>
          {[['Key', made.key], ['File password', made.file_password]].map(([l, v]) => (
            <div key={l} style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span style={{ width: 100, fontSize: '0.78rem', color: colors.textMuted }}>{l}</span><code style={{ flex: 1, wordBreak: 'break-all', fontSize: '0.8rem' }}>{v}</code><button type="button" style={btnGhost} onClick={() => copy(v)}><Copy size={13} /></button></div>
          ))}
          <div><button type="button" style={btnGhost} onClick={() => setMade(null)}>I have copied them</button></div>
        </div>
      )}
      <div style={{ ...card, overflow: 'hidden' }}>
        {(rows ?? []).length === 0 && <p style={{ padding: 16, margin: 0, fontSize: '0.82rem', color: colors.textMuted }}>No keys yet.</p>}
        {(rows ?? []).map((k) => (
          <div key={k.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 14px', borderTop: `1px solid ${colors.tint(0.05)}`, opacity: k.is_active ? 1 : 0.5, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: '0.85rem' }}>{k.label}</strong>
            <code style={{ fontSize: '0.74rem', color: colors.textMuted }}>{k.key_id}</code>
            <span style={{ fontSize: '0.74rem' }}>up to level {k.max_level}</span>
            <span style={{ fontSize: '0.74rem', color: colors.textMuted }}>{k.uses} use{k.uses === 1 ? '' : 's'}{k.last_used_at ? ` · last ${new Date(k.last_used_at).toLocaleString()}${k.last_used_ip ? ` from ${k.last_used_ip}` : ''}` : ''}</span>
            <span style={{ flex: 1 }} />
            {k.is_active ? <button type="button" style={{ ...btnGhost, color: colors.danger }} onClick={async () => { if (window.confirm(`Switch off ${k.label}'s key? It stops working at once.`)) { try { await exchangeAPI.revokeKey(k.id); load(); } catch (e) { toast.error(errMsg(e, 'Could not switch it off')); } } }}><X size={13} /> Switch off</button> : <span style={{ fontSize: '0.74rem', color: colors.textMuted }}>switched off</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

/** The other companies this system may fetch from: a name, an address and the key they gave. */
function Connections({ canManage, onChanged }) {
  const [rows, setRows] = useState(null);
  const [f, setF] = useState({ id: null, name: '', base_url: '', key: '' });
  const [err, setErr] = useState(null);
  const load = useCallback(() => exchangeAPI.connections().then((r) => { setRows(r.data); onChanged?.(r.data); }).catch((e) => toast.error(errMsg(e, 'Could not load the connections'))), [onChanged]);
  useEffect(() => { load(); }, [load]);
  const save = async () => {
    setErr(null);
    try { await exchangeAPI.saveConnection({ name: f.name, base_url: f.base_url, key: f.key || undefined }, f.id); toast.success('Saved.'); setF({ id: null, name: '', base_url: '', key: '' }); load(); } catch (e) { setErr(errMsg(e, 'Could not save')); }
  };
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {canManage && (
        <div style={box}>
          <strong style={{ fontSize: '0.9rem' }}>{f.id ? 'Change a connection' : 'Add a company'}</strong>
          <p style={{ margin: 0, fontSize: '0.78rem', color: colors.textMuted }}>Only the name, address and key are kept here, with the key encrypted. None of their books are ever kept.</p>
          <Field label="Name"><TextInput value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} placeholder="Mombasa branch company" /></Field>
          <Field label="Their address" hint="A secure address, for example https://books.example.co.ke"><TextInput value={f.base_url} onChange={(e) => setF((x) => ({ ...x, base_url: e.target.value }))} placeholder="https://" /></Field>
          <Field label="Their key" hint={f.id ? 'Leave empty to keep the key you saved.' : 'They make it in Other companies > Keys.'}><TextInput type="password" value={f.key} onChange={(e) => setF((x) => ({ ...x, key: e.target.value }))} autoComplete="off" /></Field>
          <FormError message={err} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" style={btnPrimary} onClick={save} disabled={!f.name.trim() || !f.base_url.trim() || (!f.id && !f.key.trim())}>Save</button>
            {f.id && <button type="button" style={btnGhost} onClick={() => setF({ id: null, name: '', base_url: '', key: '' })}>Cancel</button>}
          </div>
        </div>
      )}
      <div style={{ ...card, overflow: 'hidden' }}>
        {(rows ?? []).length === 0 && <p style={{ padding: 16, margin: 0, fontSize: '0.82rem', color: colors.textMuted }}>No connections yet.</p>}
        {(rows ?? []).map((c) => (
          <div key={c.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 14px', borderTop: `1px solid ${colors.tint(0.05)}` }}>
            <strong style={{ fontSize: '0.85rem' }}>{c.name}</strong><span style={{ fontSize: '0.78rem', color: colors.textMuted }}>{c.base_url}</span><span style={{ flex: 1 }} />
            {canManage && <button type="button" style={btnGhost} onClick={() => setF({ id: c.id, name: c.name, base_url: c.base_url, key: '' })}>Change</button>}
            {canManage && <button type="button" style={{ ...btnGhost, color: colors.danger }} onClick={async () => { if (window.confirm(`Remove ${c.name}?`)) { try { await exchangeAPI.deleteConnection(c.id); load(); } catch (e) { toast.error(errMsg(e, 'Could not remove it')); } } }} aria-label={`Remove ${c.name}`}><Trash2 size={13} /></button>}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function OtherCompanies() {
  const canExport = hasPermission(null, 'imports.export');
  const canManage = hasPermission(null, 'imports.manage');
  const [tab, setTab] = useState('open');
  const [options, setOptions] = useState(null);
  const [connections, setConnections] = useState([]);
  const [doc, setDoc] = useState(null);

  useEffect(() => { exchangeAPI.options().then(setOptions).catch((e) => toast.error(errMsg(e, 'Could not load'))); }, []);
  useEffect(() => { exchangeAPI.connections().then((r) => setConnections(r.data)).catch(() => {}); }, []);
  // the opened books live in this page's state only: leaving the page discards them

  const tabs = [{ id: 'open', label: 'Open books' }, ...(canExport ? [{ id: 'make', label: 'Make a file' }, { id: 'keys', label: 'Keys' }] : []), { id: 'connections', label: 'Connections' }];

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1200, margin: '0 auto' }}>
        {!hasPermission(null, 'imports.view') && !canExport ? <NoAccess what="other companies' books" /> : (
          <>
            <HubHeader title="Other companies" description="Look at another company's books from a .wnkjap file or a connection. View only: they are opened in your browser, never saved to this system, and can not be changed or posted from here." />
            {doc ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}><button type="button" style={btnGhost} onClick={() => setDoc(null)}><X size={13} /> Close these books</button></div>
                <OtherBooksViewer doc={doc} />
              </>
            ) : (
              <>
                <Tabs tabs={tabs} active={tab} onChange={setTab} />
                {!options ? <p style={{ color: colors.textMuted }}>Loading…</p> : (
                  <>
                    {tab === 'open' && <OpenBooks options={options} connections={connections} onOpened={setDoc} />}
                    {tab === 'make' && canExport && <MakeFile options={options} />}
                    {tab === 'keys' && canExport && <Keys options={options} />}
                    {tab === 'connections' && <Connections canManage={canManage} onChanged={setConnections} />}
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
