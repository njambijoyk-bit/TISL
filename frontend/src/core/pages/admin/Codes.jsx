import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Printer, QrCode, Sparkles, Pencil, Search } from 'lucide-react';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader, { Toolbar } from '../../components/admin/ui/HubHeader';
import Tabs from '../../components/admin/ui/Tabs';
import SimpleTable from '../../components/admin/ui/SimpleTable';
import codesAPI from '../../../_shared/api/codes';
import useAuthStore from '../../../_shared/store/authStore';
import { hasPermission } from '../../../_shared/lib/roles';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import CodeScanner from '../../components/admin/codes/CodeScanner';
import LabelDialog from '../../components/admin/codes/LabelDialog';
import CodesSettingsTab from '../../components/admin/codes/CodesSettingsTab';
import { btnGhost, btnPrimary, card, colors } from '../../../_shared/theme/tokens';

const TYPES = [
  { id: 'variant', label: 'Products' }, { id: 'pack', label: 'Packs and cartons' }, { id: 'asset', label: 'Assets' }, { id: 'batch', label: 'Stock batches' },
];
const TABS = [...TYPES, { id: 'prints', label: 'Print log' }, { id: 'settings', label: 'Settings' }];
const when = (s) => (s ? String(s).replace('T', ' ').slice(0, 16) : '');
const input = { padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--line, #d1d5db)', background: 'var(--surface-input, #fff)', color: 'inherit', fontFamily: 'inherit', fontSize: '0.85rem' };

/**
 * Admin → Codes & labels. Give products, packs, assets and batches a code, print labels to stick on them, and scan a code to see what it is. The same codes are what
 * the stock screens (and, later, the checkout) read.
 */
export default function Codes() {
  const [params, setParams] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const can = { manage: hasPermission(user, 'codes.manage'), print: hasPermission(user, 'codes.print') };
  const [tab, setTab] = useState(TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'variant');
  const [q, setQ] = useState('');
  const [missing, setMissing] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ data: [], total: 0, last_page: 1, ready: true, packs_ready: true });
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState({});   // `${type}:${id}` => row
  const [kinds, setKinds] = useState([]);
  const [defaults, setDefaults] = useState({ name: true, sku: true, price: false, code_text: true, batch: true, size: 'a4-24' });
  const [printing, setPrinting] = useState(null);
  const [edit, setEdit] = useState(null);
  const [found, setFound] = useState(null);
  const [log, setLog] = useState([]);

  useEffect(() => {
    codesAPI.kinds().then((r) => setKinds(r.kinds)).catch(() => {});
    codesAPI.settings().then((r) => setDefaults(r.settings.label)).catch(() => {});
  }, []);

  const isType = TYPES.some((t) => t.id === tab);
  const load = useCallback(() => {
    if (!isType) return Promise.resolve();
    setLoading(true);
    return codesAPI.items({ type: tab, q: q || undefined, missing: missing ? 1 : undefined, page }).then(setData).catch((e) => toast.error(errMsg(e, 'Could not load the list'))).finally(() => setLoading(false));
  }, [tab, q, missing, page, isType]);
  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);
  useEffect(() => { if (tab === 'prints') codesAPI.prints().then((r) => setLog(r.data)).catch(() => {}); }, [tab]);

  const key = (r) => `${r.type}:${r.id}`;
  const chosen = useMemo(() => Object.values(picked), [picked]);
  const togglePick = (r) => setPicked((p) => { const n = { ...p }; if (n[key(r)]) delete n[key(r)]; else n[key(r)] = r; return n; });
  const pickAll = () => setPicked((p) => { const n = { ...p }; const all = data.data.every((r) => n[key(r)]); data.data.forEach((r) => { if (all) delete n[key(r)]; else n[key(r)] = r; }); return n; });
  const withoutCode = chosen.filter((r) => !r.code);

  const giveCodes = async (rows) => {
    try {
      const r = await codesAPI.assign(rows.map((x) => ({ type: x.type, id: x.id })));
      toast.success(`${r.made.length} code${r.made.length === 1 ? '' : 's'} made${r.kept ? `, ${r.kept} already had one` : ''}${r.failed.length ? `, ${r.failed.length} could not be done` : ''}`);
      if (r.failed.length) toast.error(r.failed[0].message);
      setPicked({}); load();
    } catch (e) { toast.error(errMsg(e, 'Could not make the codes')); }
  };
  const scanned = async (code) => {
    try { setFound(await codesAPI.lookup(code)); } catch (e) { toast.error(errMsg(e, 'Could not look that up')); }
  };
  const saveEdit = async () => {
    try { await codesAPI.setCode({ type: edit.row.type, id: edit.row.id, code: edit.code }); toast.success('Saved'); setEdit(null); load(); }
    catch (e) { toast.error(errMsg(e, 'Could not save'), { duration: 8000 }); }
  };

  const columns = [
    { key: 'pick', label: '', width: 36, render: (r) => <input type="checkbox" aria-label={`Select ${r.label}`} checked={!!picked[key(r)]} onChange={() => togglePick(r)} /> },
    { key: 'label', label: 'Item', render: (r) => <span style={{ fontWeight: 600 }}>{r.label}</span> },
    { key: 'sku', label: 'SKU', render: (r) => r.sku ?? '—' },
    { key: 'code', label: 'Code', render: (r) => (r.code ? <code style={{ fontSize: '0.78rem' }}>{r.code}</code> : <span style={{ color: colors.danger, fontSize: '0.78rem' }}>none yet</span>) },
    { key: 'act', label: '', align: 'right', render: (r) => (
      <span style={{ display: 'inline-flex', gap: 6 }}>
        {!r.code && can.manage && <button type="button" style={{ ...btnGhost, padding: '4px 10px', fontSize: '0.74rem' }} onClick={() => giveCodes([r])}><Sparkles size={12} /> Give a code</button>}
        {!r.derived && can.manage && <button type="button" style={{ ...btnGhost, padding: '4px 10px', fontSize: '0.74rem' }} onClick={() => setEdit({ row: r, code: r.code ?? '' })} aria-label={`Set the code of ${r.label}`}><Pencil size={12} /></button>}
        {can.print && r.code && <button type="button" style={{ ...btnGhost, padding: '4px 10px', fontSize: '0.74rem' }} onClick={() => setPrinting([r])} aria-label={`Print a label for ${r.label}`}><Printer size={12} /></button>}
      </span>
    ) },
  ];

  const body = () => {
    if (tab === 'settings') return <CodesSettingsTab kinds={kinds} can={can} />;
    if (tab === 'prints') {
      return <SimpleTable columns={[{ key: 'created_at', label: 'When', render: (r) => when(r.created_at) }, { key: 'by', label: 'By', render: (r) => r.by ?? '—' }, { key: 'label_count', label: 'Labels' }, { key: 'size', label: 'Sheet or roll' }]} rows={log} empty="Nothing has been printed yet." />;
    }

    return (
      <>
        {!data.ready && <p role="status" style={{ ...card, padding: 12, fontSize: '0.82rem', color: colors.textMuted }}>Run database script 119_codes.sql, then reload: until then codes can be listed and typed but not made automatically.</p>}
        {tab === 'pack' && !data.packs_ready && <p role="status" style={{ ...card, padding: 12, fontSize: '0.82rem', color: colors.textMuted }}>Pack and carton codes need database script 119_codes.sql.</p>}
        <Toolbar right={chosen.length > 0 && (
          <>
            <span style={{ fontSize: '0.8rem', color: colors.textMuted }}>{chosen.length} selected</span>
            {can.manage && withoutCode.length > 0 && <button type="button" style={btnGhost} onClick={() => giveCodes(withoutCode)}><Sparkles size={13} /> Give codes to {withoutCode.length}</button>}
            {can.print && <button type="button" style={btnPrimary} onClick={() => setPrinting(chosen)}><Printer size={13} /> Print labels</button>}
            <button type="button" style={btnGhost} onClick={() => setPicked({})}>Clear</button>
          </>
        )}>
          <div style={{ position: 'relative' }}>
            <Search size={14} aria-hidden="true" style={{ position: 'absolute', left: 10, top: 11, color: colors.textFaint }} />
            <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search name, SKU or code" aria-label="Search" style={{ ...input, paddingLeft: 30, minWidth: 240 }} />
          </div>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.82rem' }}><input type="checkbox" checked={missing} onChange={(e) => { setMissing(e.target.checked); setPage(1); }} /> Only those without a code</label>
          <button type="button" style={btnGhost} onClick={pickAll} disabled={!data.data.length}>Select this page</button>
        </Toolbar>
        <SimpleTable columns={columns} rows={data.data} loading={loading} rowKey="id" empty={missing ? 'Everything here has a code.' : 'Nothing here yet.'} />
        {data.last_page > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, alignItems: 'center', marginTop: 12, fontSize: '0.8rem', color: colors.textMuted }}>
            <button type="button" style={btnGhost} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
            Page {page} of {data.last_page} · {data.total} items
            <button type="button" style={btnGhost} disabled={page >= data.last_page} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        )}
      </>
    );
  };

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1200, margin: '0 auto' }}>
        <HubHeader title="Codes & labels" description="Give products, packs, assets and stock batches a barcode, print labels to stick on them, and scan any code to see what it is. The stock screens and, later, the checkout read these same codes." />

        <div style={{ ...card, padding: 16, marginBottom: 20, display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.85rem', fontWeight: 700 }}><QrCode size={15} aria-hidden="true" /> Find by scanning</div>
          <CodeScanner onScan={scanned} autoFocus={false} />
          {found && (
            <div role="status" style={{ fontSize: '0.84rem' }}>
              {found.found ? found.matches.map((m) => (
                <div key={`${m.type}:${m.id}`} style={{ padding: '6px 0', borderTop: `1px solid ${colors.tint(0.06)}` }}>
                  <strong>{m.label}</strong> <span style={{ color: colors.textMuted }}>· {({ variant: 'Product', pack: 'Pack', asset: 'Asset', batch: 'Batch' })[m.type]}{m.sku ? ` · ${m.sku}` : ''}</span>
                  {m.retired && <span style={{ color: colors.danger }}> · an old code, this item has a new one: {m.code}</span>}
                </div>
              )) : <span style={{ color: colors.danger }}>Nothing has the code {found.code}.</span>}
              {found.ambiguous && <div style={{ color: '#b45309', marginTop: 4 }}>More than one item has this code: fix it by giving one of them a different code.</div>}
            </div>
          )}
        </div>

        <Tabs tabs={TABS} active={tab} onChange={(id) => { setTab(id); setPage(1); setPicked({}); setParams({ tab: id }, { replace: true }); }} />
        {body()}
      </div>

      {printing && <LabelDialog items={printing} defaults={defaults} kinds={kinds} onClose={() => setPrinting(null)} />}
      {edit && (
        <div role="presentation" onClick={() => setEdit(null)} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,10,30,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <form role="dialog" aria-modal="true" aria-label="Set the code" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); saveEdit(); }}
            style={{ width: '100%', maxWidth: 420, background: 'var(--surface-card, #fff)', color: colors.text, borderRadius: 14, padding: 20, display: 'grid', gap: 12 }}>
            <strong>Set the code of {edit.row.label}</strong>
            <input autoFocus value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} aria-label="Code" placeholder="Scan or type the barcode" style={input} />
            <p style={{ margin: 0, fontSize: '0.74rem', color: colors.textFaint }}>A retail barcode (8, 12, 13 or 14 digits) must have a correct check digit. The old code stays findable, marked as old, so labels already stuck on shelves still scan.</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" style={btnGhost} onClick={() => setEdit(null)}>Cancel</button>
              <button type="submit" style={btnPrimary} disabled={!edit.code.trim()}>Save</button>
            </div>
          </form>
        </div>
      )}
    </AdminLayout>
  );
}
