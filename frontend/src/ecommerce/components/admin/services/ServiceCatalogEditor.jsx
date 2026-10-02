import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2, Star, Sparkles, X } from 'lucide-react';
import serviceCatalogAPI from '../../../../_shared/api/serviceCatalog';
import useUomStore from '../../../../_shared/store/uomStore';
import { colors, card, input, btnPrimary, btnGhost, radius } from '../../../../_shared/theme/tokens';
import { getBaseCode } from '../../../../_shared/lib/baseCurrency';
import booksAPI from '../../../../_shared/api/books';
import resourcesAPI from '../../../../_shared/api/resources';

const cell = { ...input, padding: '6px 8px', fontSize: '0.8rem' };
const th = { textAlign: 'left', padding: '8px 10px', fontSize: '0.68rem', fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${colors.border ?? '#eee'}` };
const td = { padding: '6px 8px', verticalAlign: 'middle', borderBottom: '1px solid #f3f4f6' };
const FIELD_TYPES = [['text', 'Short text'], ['textarea', 'Long text'], ['number', 'Number'], ['select', 'Choice'], ['file', 'File / photo']];

function Section({ title, description, action, children }) {
  return (
    <section style={{ ...card, padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
        <div>
          <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 700, color: colors.primaryDeep }}>{title}</p>
          {description && <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: colors.textFaint, maxWidth: 620 }}>{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * The materials a package normally uses: products taken from stock, each CHARGED to the customer or INCLUDED in the price.
 * They fill in on every sale of the package (and can be changed there). Tools and things shared across many jobs are not
 * listed — only what is worth counting against the job.
 */
function PackageMaterials({ variants, serviceId, readOnly, busy, run }) {
  const [pkgId, setPkgId] = useState(variants[0]?.id ?? null);
  const pkg = variants.find((v) => v.id === pkgId) ?? variants[0];
  const [rows, setRows] = useState(() => (pkg?.materials ?? []).map((m) => ({ ...m })));
  const [q, setQ] = useState('');
  const [found, setFound] = useState([]);
  useEffect(() => { setRows((pkg?.materials ?? []).map((m) => ({ ...m }))); }, [pkg?.id, JSON.stringify(pkg?.materials ?? [])]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!q.trim()) { setFound([]); return undefined; }
    const t = setTimeout(() => { booksAPI.lookup('product', q, 'purchase').then(setFound).catch(() => setFound([])); }, 200);
    return () => clearTimeout(t);
  }, [q]);
  if (!pkg) return null;
  const dirty = JSON.stringify(rows.map((r) => [r.variant_id, Number(r.quantity), r.mode])) !== JSON.stringify((pkg.materials ?? []).map((r) => [r.variant_id, Number(r.quantity), r.mode]));
  const set = (i, patch) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <Section title="Materials used" description="What this package normally uses from stock. Included: no separate charge, its cost counts against the job. Charged: added to the customer’s bill. On each sale they fill in and can be changed. Leave out tools and things shared across many jobs.">
      {variants.length > 1 && (
        <select value={pkg.id} onChange={(e) => setPkgId(Number(e.target.value))} style={{ ...cell, width: 240, marginBottom: 12 }} aria-label="Package">
          {variants.map((v) => <option key={v.id} value={v.id}>{v.name || 'Standard'}</option>)}
        </select>
      )}
      {rows.length === 0 && <p style={{ margin: '0 0 10px', fontSize: '0.8rem', color: colors.textFaint }}>No materials for this package.</p>}
      {rows.map((r, i) => (
        <div key={`${r.variant_id}-${i}`} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
          <strong style={{ minWidth: 220, fontSize: '0.82rem' }}>{r.product}{r.variant && r.variant !== 'Standard' ? ` — ${r.variant}` : ''}{!r.for_sale && <span style={{ fontSize: '0.62rem', color: colors.textFaint, marginLeft: 6 }}>MATERIAL</span>}</strong>
          <input type="number" min="0" step="any" value={r.quantity} disabled={readOnly} onChange={(e) => set(i, { quantity: e.target.value })} style={{ ...cell, width: 90 }} aria-label="Quantity" />
          <span style={{ fontSize: '0.75rem', color: colors.textMuted, minWidth: 30 }}>{r.unit_code}</span>
          <select value={r.mode} disabled={readOnly} onChange={(e) => set(i, { mode: e.target.value })} style={{ ...cell, width: 150 }} aria-label="How it is used">
            <option value="included">Included in the price</option>
            <option value="charged">Charged separately</option>
          </select>
          {!readOnly && <button type="button" style={{ ...btnGhost, padding: '4px 8px' }} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 size={13} /></button>}
        </div>
      ))}
      {!readOnly && (
        <div style={{ position: 'relative', maxWidth: 360, marginTop: 8 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Add a product used by this package…" style={cell} />
          {found.length > 0 && (
            <div style={{ position: 'absolute', zIndex: 10, top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, maxHeight: 220, overflowY: 'auto' }}>
              {found.map((f) => {
                const base = f.units.find((u) => u.role === 'base') ?? f.units[0];
                return (
                  <button key={f.variant_id} type="button" onClick={() => { setRows((rs) => [...rs, { variant_id: f.variant_id, quantity: 1, mode: 'included', product: f.product, variant: f.variant, unit_code: base?.code, for_sale: f.for_sale }]); setQ(''); }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem' }}>
                    {f.product} <span style={{ color: '#9ca3af' }}>{f.variant && f.variant !== 'Standard' ? `${f.variant} · ` : ''}{f.sku}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
      {!readOnly && (
        <div style={{ marginTop: 12 }}>
          <button type="button" style={btnPrimary} disabled={busy || !dirty || rows.some((r) => !(Number(r.quantity) > 0))}
            onClick={() => run(() => serviceCatalogAPI.saveMaterials(serviceId, pkg.id, rows.map((r) => ({ variant_id: r.variant_id, quantity: Number(r.quantity), mode: r.mode }))), 'Materials saved')}>
            Save materials
          </button>
        </div>
      )}
    </Section>
  );
}

const FEE_WHEN = { booking: 'When booked', completion: 'When the service is done', late_cancel: 'On a late cancellation', no_show: 'On a no-show', reschedule: 'On a late reschedule' };
const FEE_CONDITIONS = [['always', 'Always'], ['onsite', 'On-site visits only'], ['urgent', 'Urgent bookings'], ['after_hours', 'Outside working hours'], ['group', 'Larger groups']];
const FEE_TAX = { taxable: 'VAT-able', zero_rated: 'Zero-rated', exempt: 'Exempt', out_of_scope: 'Not taxed' };
const FEE_BUCKETS = [
  ['With the service', ['call_out', 'travel', 'urgent', 'after_hours', 'consumables', 'equipment', 'extra_person', 'overtime', 'service_charge', 'payment_processing', 'other_service']],
  ['At booking', ['booking_fee', 'deposit']],
  ['When things go wrong', ['cancellation', 'no_show', 'reschedule']],
  ['Money held for the customer, not income', ['tip', 'disbursement']],
];

/**
 * The fees this service carries: switch each on, change its amount for this service, and say when it applies. The fees are
 * ledgers (Books → Chart of accounts → Service Income → Service Fees) that carry how they are worked out and their tax.
 */
function ServiceFees({ fees, currencyCode, serviceId, readOnly, busy, run }) {
  const fromServer = useMemo(() => fees.map((f) => ({ ledger_id: f.ledger.id, is_enabled: f.is_enabled, amount: f.amount ?? '', condition: f.condition, condition_value: f.condition_value ?? '' })), [fees]);
  const [rows, setRows] = useState(fromServer);
  useEffect(() => { setRows(fromServer); }, [fromServer]);
  const dirty = JSON.stringify(rows) !== JSON.stringify(fromServer);
  const patch = (id, p) => setRows((rs) => rs.map((r) => (r.ledger_id === id ? { ...r, ...p } : r)));

  if (fees.length === 0) {
    return (
      <Section title="Fees" description="Extra charges on top of the service price: call-out, travel, surcharges, deposit, cancellation and no-show fees, tips.">
        <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textMuted }}>No service fees are set up yet. They live under <Link to="/admin/books?tab=accounts">Books → Chart of accounts → Service Income → Service Fees</Link>.</p>
      </Section>
    );
  }
  const unit = (f) => (f.basis === 'percent' ? (f.kind === 'tip' ? '% of the bill' : '% of the price') : f.basis === 'per_unit' ? `${currencyCode} / ${f.unit || 'unit'}` : currencyCode);
  const tax = (f) => (f.not_income ? 'Not income' : `${FEE_TAX[f.ledger.tax_nature] ?? '—'}${f.ledger.tax_nature === 'taxable' && f.tax_rate?.rate_value != null ? ` ${Number(f.tax_rate.rate_value)}%` : ''}`);

  return (
    <Section title="Fees" description="Extra charges on top of the service price. Switch on the ones this service carries and change an amount just for this service. Each fee posts to its own ledger, with its own tax. A deposit, tips and disbursements are money held for the customer, not income.">
      {FEE_BUCKETS.map(([title, kinds]) => {
        const list = fees.filter((f) => kinds.includes(f.kind));
        if (!list.length) return null;
        return (
          <div key={title} style={{ marginBottom: 14 }}>
            <p style={{ margin: '0 0 4px', fontSize: '0.7rem', fontWeight: 800, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</p>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {list.map((f) => {
                  const r = rows.find((x) => x.ledger_id === f.ledger.id);
                  if (!r) return null;
                  return (
                    <tr key={f.ledger.id} style={{ opacity: r.is_enabled ? 1 : 0.55 }}>
                      <td style={{ ...td, width: 28 }}><input type="checkbox" disabled={readOnly} checked={r.is_enabled} onChange={(e) => patch(r.ledger_id, { is_enabled: e.target.checked })} aria-label={`Apply ${f.ledger.name}`} /></td>
                      <td style={td}>
                        <strong style={{ fontSize: '0.82rem' }}>{f.ledger.name}</strong>
                        <div style={{ fontSize: '0.7rem', color: colors.textFaint }}>{FEE_WHEN[f.timing] ?? f.timing}{f.refundable ? ' · refundable' : ''} · {tax(f)}</div>
                      </td>
                      <td style={{ ...td, whiteSpace: 'nowrap', textAlign: 'right' }}>
                        <input type="number" min="0" step="any" disabled={readOnly || !r.is_enabled} value={r.amount} onChange={(e) => patch(r.ledger_id, { amount: e.target.value })} style={{ ...cell, width: 96, textAlign: 'right' }} aria-label={`Amount of ${f.ledger.name}`} />
                        <span style={{ marginLeft: 6, fontSize: '0.72rem', color: colors.textMuted }}>{unit(f)}</span>
                      </td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>
                        <select disabled={readOnly || !r.is_enabled} value={r.condition} onChange={(e) => patch(r.ledger_id, { condition: e.target.value })} style={{ ...cell, width: 170 }} aria-label={`When ${f.ledger.name} applies`}>
                          {FEE_CONDITIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                        </select>
                        {(r.condition === 'urgent' || r.condition === 'group') && (
                          <>
                            <input type="number" min="1" step="any" disabled={readOnly || !r.is_enabled} value={r.condition_value} onChange={(e) => patch(r.ledger_id, { condition_value: e.target.value })} style={{ ...cell, width: 64, marginLeft: 6 }} aria-label="How many" />
                            <span style={{ marginLeft: 4, fontSize: '0.72rem', color: colors.textMuted }}>{r.condition === 'urgent' ? 'hours' : 'people +'}</span>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
      {!readOnly && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
          {dirty && <span style={{ fontSize: '0.74rem', color: '#b45309' }}>Unsaved changes</span>}
          <button type="button" style={btnPrimary} disabled={busy || !dirty}
            onClick={() => run(() => serviceCatalogAPI.saveFees(serviceId, rows.map((r) => ({ ledger_id: r.ledger_id, is_enabled: r.is_enabled, amount: r.amount === '' ? null : Number(r.amount), condition: r.condition, condition_value: r.condition_value === '' ? null : Number(r.condition_value) }))))}>
            {busy ? 'Saving…' : 'Save fees'}
          </button>
        </div>
      )}
    </Section>
  );
}

/**
 * Options, packages and requirements for one service.
 *
 * Packages work like product variants: generated from option combinations (each
 * with its own price, duration and unit), or hand-made. Every service always
 * has at least one — the automatic "Standard" package.
 */
/** Who is set up for which package: one state shared by the "Offered at" column and the "Who can do it" grid. `on` holds "resourceId:variantId" or "resourceId:all". */
const skey = (r, v) => `${r}:${v ?? 'all'}`;
function useStaffing(serviceId) {
  const [data, setData] = useState(null);
  const [on, setOn] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const apply = useCallback((d) => { setData(d); setOn(new Set(d.assigned.map((a) => skey(a.resource_id, a.service_variant_id)))); }, []);
  useEffect(() => { resourcesAPI.forService(serviceId).then(apply).catch(() => setData({ resources: [], assigned: [] })); }, [serviceId, apply]);
  const commit = async (set) => {
    setBusy(true); setNote(null);
    try {
      const rows = [...set].map((k) => { const [r, v] = k.split(':'); return { resource_id: Number(r), service_variant_id: v === 'all' ? null : Number(v) }; });
      const res = await resourcesAPI.saveForService(serviceId, rows); apply(res); setNote(res.message);
    } catch (e) { setNote(e?.response?.data?.message ?? 'Could not save'); } finally { setBusy(false); }
  };
  return { data, on, setOn, busy, note, commit };
}

const doesPackage = (on, r, v) => on.has(skey(r, null)) || on.has(skey(r, v));

/** Turn one person on or off for one package; a person who did every package ("all") is first split into the packages they do. */
function toggleOne(on, resourceId, variantId, allVariantIds, turnOn) {
  const n = new Set(on);
  if (turnOn) { n.add(skey(resourceId, variantId)); return n; }
  if (n.has(skey(resourceId, null))) { n.delete(skey(resourceId, null)); allVariantIds.forEach((id) => id !== variantId && n.add(skey(resourceId, id))); }
  n.delete(skey(resourceId, variantId));
  return n;
}

/** The "Offered at" cell of a package: the branches, ticking one lets everyone who works there do this package (fine-tune in Who can do it). */
function OfferedAt({ staff, variant, variants, readOnly }) {
  const { data, on, busy, commit } = staff;
  if (!data) return <span style={{ color: colors.textFaint, fontSize: '0.75rem' }}>…</span>;
  const active = data.resources.filter((r) => r.location_id);
  const branches = Object.values(active.reduce((m, r) => { (m[r.location_id] ??= { id: r.location_id, name: r.location, people: [] }).people.push(r); return m; }, {}));
  if (!branches.length) return <Link to="/admin/resources" style={{ fontSize: '0.72rem' }}>{data.resources.length ? 'Give staff a branch' : 'Add staff'}</Link>;
  const ids = variants.map((x) => x.id);
  const toggle = (b) => {
    const some = b.people.some((r) => doesPackage(on, r.id, variant.id));
    let next = on;
    b.people.forEach((r) => { next = toggleOne(next, r.id, variant.id, ids, !some); });
    commit(next);
  };
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', minWidth: 150 }}>
      {branches.map((b) => {
        const n = b.people.filter((r) => doesPackage(on, r.id, variant.id)).length;
        return (
          <button key={b.id} type="button" disabled={readOnly || busy} onClick={() => toggle(b)} title={`${n} of ${b.people.length} people at ${b.name} do this package`}
            style={{ padding: '3px 9px', borderRadius: 999, fontSize: '0.72rem', cursor: readOnly ? 'default' : 'pointer', border: `1.5px solid ${n ? '#10b981' : '#e5e7eb'}`, background: n ? '#ecfdf5' : '#fff', color: n ? '#065f46' : colors.textMuted, fontWeight: n ? 700 : 500 }}>
            {b.name}{n ? ` · ${n}` : ''}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Who can do this service, package by package — the detail behind "Offered at". People and rooms are listed under the branch they work at (set in Staff & resources);
 * a customer can book a package only with someone ticked here. "All" lets them do every package, including ones added later.
 */
function WhoDoesIt({ variants, staff, readOnly }) {
  const { data, on, setOn, busy, note, commit } = staff;
  if (!data) return null;
  const groups = Object.values(data.resources.reduce((m, r) => { const k = r.location ?? 'Any branch'; (m[k] ??= { name: k, rows: [] }).rows.push(r); return m; }, {}));
  const toggle = (r, v) => setOn((cur) => { const n = new Set(cur); const k = skey(r, v); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  return (
    <Section title="Who can do it" description="Tick who can do each package, grouped by the branch they work at. The Offered at column in Packages ticks a whole branch at once; use this to pick individuals. A customer can book a package only with someone ticked here. Add people and rooms in Staff & resources.">
      {!data.resources.length ? (
        <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textFaint }}>No one is bookable yet. <Link to="/admin/resources">Add staff or rooms</Link> first.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>Person / room</th><th style={{ ...th, textAlign: 'center' }}>All packages</th>{variants.map((v) => <th key={v.id} style={{ ...th, textAlign: 'center' }}>{v.name}</th>)}</tr></thead>
            <tbody>
              {groups.map((g) => (
                <Fragment key={g.name}>
                  <tr><td colSpan={variants.length + 2} style={{ ...td, fontSize: '0.7rem', fontWeight: 800, color: colors.textFaint, textTransform: 'uppercase', background: '#fafafa' }}>{g.name}</td></tr>
                  {g.rows.map((r) => (
                    <tr key={r.id}>
                      <td style={td}>{r.name} <span style={{ color: colors.textFaint, fontSize: '0.72rem' }}>{r.type}{!r.has_hours ? ' · no working hours yet' : ''}</span></td>
                      <td style={{ ...td, textAlign: 'center' }}><input type="checkbox" disabled={readOnly} checked={on.has(skey(r.id, null))} onChange={() => toggle(r.id, null)} /></td>
                      {variants.map((v) => <td key={v.id} style={{ ...td, textAlign: 'center' }}><input type="checkbox" disabled={readOnly || on.has(skey(r.id, null))} checked={doesPackage(on, r.id, v.id)} onChange={() => toggle(r.id, v.id)} /></td>)}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!readOnly && data.resources.length > 0 && (
        <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
          <button type="button" style={btnPrimary} disabled={busy} onClick={() => commit(on)}>{busy ? 'Saving…' : 'Save who can do it'}</button>
          {note && <span style={{ fontSize: '0.78rem', color: colors.textMuted }}>{note}</span>}
        </div>
      )}
    </Section>
  );
}

export default function ServiceCatalogEditor({ serviceId, currencyCode = getBaseCode(), readOnly = false }) {
  const [cat, setCat] = useState(null);
  const staff = useStaffing(serviceId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [newOption, setNewOption] = useState('');
  const [newValue, setNewValue] = useState({});          // { optionId: text }
  const [custom, setCustom] = useState(null);            // { name, price } while adding a hand-made package
  const [newReq, setNewReq] = useState({ label: '', field_type: 'text', is_required: false, choices: '' });
  const { fetchUnits, unitsByDimension } = useUomStore();

  useEffect(() => { fetchUnits().catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(() => serviceCatalogAPI.getCatalog(serviceId).then(setCat).catch((e) => setError(msg(e))), [serviceId]);
  useEffect(() => { setCat(null); load(); }, [load]);

  const msg = (e) => {
    const d = e?.response?.data;
    return d?.message || (d?.errors ? Object.values(d.errors).flat()[0] : null) || e?.message || 'Something went wrong';
  };

  // Every write returns the fresh catalog; failures surface on screen.
  const run = async (fn, okNotice) => {
    setBusy(true); setError(null); setNotice(null);
    try {
      const res = await fn();
      if (res?.options) setCat(res);
      setNotice(res?.message ?? okNotice ?? null);
      return true;
    } catch (e) {
      setError(msg(e));
      return false;
    } finally { setBusy(false); }
  };

  if (!cat) return <p style={{ fontSize: '0.8rem', color: colors.textFaint }}>{error ?? 'Loading packages…'}</p>;

  const durationUnits = unitsByDimension('duration');
  const priceUnits = unitsByDimension('service_unit');
  const hasValues = cat.options.some((o) => o.values.length > 0);

  const saveVariant = (v, patch) => run(() => serviceCatalogAPI.updateVariant(serviceId, v.id, patch));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {error && <p role="alert" style={{ margin: 0, padding: '8px 12px', borderRadius: radius.md, background: '#fef2f2', color: '#991b1b', fontSize: '0.8rem' }}>{error}</p>}
      {notice && !error && <p style={{ margin: 0, padding: '8px 12px', borderRadius: radius.md, background: '#f0fdf4', color: '#166534', fontSize: '0.8rem' }}>{notice}</p>}

      {/* ── Options ── */}
      <Section title="Options" description="What a customer chooses between — type, size, location. Each combination becomes a package with its own price.">
        {cat.options.length === 0 && <p style={{ margin: '0 0 10px', fontSize: '0.8rem', color: colors.textMuted }}>No options. A service without options simply has its Standard package.</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {cat.options.map((o) => (
            <div key={o.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              <strong style={{ fontSize: '0.82rem', minWidth: 110 }}>{o.name}</strong>
              {o.values.map((v) => (
                <span key={v.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: radius.pill, background: '#f5f3ff', fontSize: '0.78rem' }}>
                  {v.value}
                  {!readOnly && (
                    <button type="button" aria-label={`Remove ${v.value}`} disabled={busy} onClick={() => window.confirm(`Remove "${v.value}"? Packages using it are deleted.`) && run(() => serviceCatalogAPI.deleteValue(serviceId, o.id, v.id))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}><X size={12} /></button>
                  )}
                </span>
              ))}
              {!readOnly && (
                <>
                  <input value={newValue[o.id] ?? ''} placeholder="Add value + Enter" style={{ ...cell, width: 150 }}
                    onChange={(e) => setNewValue((m) => ({ ...m, [o.id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return;
                      e.preventDefault();
                      const text = (newValue[o.id] ?? '').trim();
                      if (text) run(() => serviceCatalogAPI.createValue(serviceId, o.id, text)).then((ok) => ok && setNewValue((m) => ({ ...m, [o.id]: '' })));
                    }} />
                  <button type="button" title="Delete this option" disabled={busy} onClick={() => window.confirm(`Delete the option "${o.name}"? Packages built from it are deleted.`) && run(() => serviceCatalogAPI.deleteOption(serviceId, o.id))}
                    style={{ ...btnGhost, padding: '4px 8px' }}><Trash2 size={13} /></button>
                </>
              )}
            </div>
          ))}
        </div>
        {!readOnly && (
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <input value={newOption} onChange={(e) => setNewOption(e.target.value)} placeholder="New option, e.g. Type" style={{ ...cell, width: 220 }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('svc-add-option')?.click(); } }} />
            <button id="svc-add-option" type="button" disabled={busy || !newOption.trim()} style={btnGhost}
              onClick={() => run(() => serviceCatalogAPI.createOption(serviceId, newOption.trim())).then((ok) => ok && setNewOption(''))}>
              <Plus size={13} /> Add option
            </button>
          </div>
        )}
      </Section>

      {/* ── Packages ── */}
      <Section
        title="Packages"
        description={`Each package is one thing a customer can ask for, with its own price (${currencyCode}, before tax), duration and what the price covers.`}
        action={!readOnly && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" disabled={busy || !hasValues} style={btnGhost} title={hasValues ? '' : 'Add option values first'}
              onClick={() => run(() => serviceCatalogAPI.generateVariants(serviceId))}>
              <Sparkles size={13} /> Generate from options
            </button>
            <button type="button" style={btnPrimary} onClick={() => setCustom({ name: '', price: '' })}><Plus size={13} /> Custom package</button>
          </div>
        )}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 760 }}>
            <thead>
              <tr>
                <th style={th} />
                <th style={th}>Package</th>
                <th style={th}>Price ({currencyCode})</th>
                <th style={th}>Duration</th>
                <th style={th}>Price covers</th>
                <th style={th}>Offered at</th>
                <th style={th}>Status</th>
                <th style={th} />
              </tr>
            </thead>
            <tbody>
              {cat.variants.map((v) => (
                <tr key={v.id}>
                  <td style={td}>
                    <button type="button" title={v.is_default ? 'Default package' : 'Make default'} disabled={readOnly || busy} onClick={() => !v.is_default && saveVariant(v, { is_default: true })}
                      style={{ background: 'none', border: 'none', cursor: v.is_default ? 'default' : 'pointer', padding: 2 }}>
                      <Star size={16} fill={v.is_default ? '#f59e0b' : 'none'} color={v.is_default ? '#f59e0b' : '#d1d5db'} />
                    </button>
                  </td>
                  <td style={td}>
                    <input defaultValue={v.name ?? ''} disabled={readOnly} style={{ ...cell, minWidth: 160 }}
                      onBlur={(e) => e.target.value !== (v.name ?? '') && saveVariant(v, { name: e.target.value })} />
                    {v.is_custom && <span style={{ fontSize: '0.62rem', color: colors.textFaint }}> custom</span>}
                  </td>
                  <td style={td}>
                    <input type="number" min="0" step="0.01" defaultValue={v.price ?? ''} disabled={readOnly} style={{ ...cell, width: 110 }}
                      onBlur={(e) => String(e.target.value) !== String(v.price ?? '') && saveVariant(v, { price: e.target.value === '' ? null : Number(e.target.value) })} />
                  </td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <input type="number" min="0" step="0.5" defaultValue={v.duration_value ?? ''} disabled={readOnly} style={{ ...cell, width: 70 }}
                        onBlur={(e) => String(e.target.value) !== String(v.duration_value ?? '') && saveVariant(v, { duration_value: e.target.value === '' ? null : Number(e.target.value) })} />
                      <select value={v.duration_unit_id ?? ''} disabled={readOnly} style={{ ...cell, width: 96 }}
                        onChange={(e) => saveVariant(v, { duration_unit_id: e.target.value === '' ? null : Number(e.target.value) })}>
                        <option value="">—</option>
                        {durationUnits.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                    </div>
                  </td>
                  <td style={td}>
                    <select value={v.price_unit_id ?? ''} disabled={readOnly} style={{ ...cell, width: 130 }}
                      onChange={(e) => saveVariant(v, { price_unit_id: e.target.value === '' ? null : Number(e.target.value) })}>
                      <option value="">—</option>
                      {priceUnits.map((u) => <option key={u.id} value={u.id}>per {u.name.toLowerCase()}</option>)}
                    </select>
                  </td>
                  <td style={td}><OfferedAt staff={staff} variant={v} variants={cat.variants} readOnly={readOnly} /></td>
                  <td style={td}>
                    <select value={v.status} disabled={readOnly} style={{ ...cell, width: 96 }} onChange={(e) => saveVariant(v, { status: e.target.value })}>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    {!readOnly && cat.variants.length > 1 && (
                      <button type="button" style={{ ...btnGhost, padding: '4px 8px' }} disabled={busy} title="Delete package"
                        onClick={() => window.confirm(`Delete the package "${v.name || 'Standard'}"?`) && run(() => serviceCatalogAPI.deleteVariant(serviceId, v.id))}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {custom && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <input autoFocus placeholder="Package name, e.g. Premium bundle" value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} style={{ ...cell, width: 260 }} />
            <input type="number" min="0" step="0.01" placeholder={`Price (${currencyCode})`} value={custom.price} onChange={(e) => setCustom({ ...custom, price: e.target.value })} style={{ ...cell, width: 130 }} />
            <button type="button" style={btnPrimary} disabled={busy || !custom.name.trim()}
              onClick={() => run(() => serviceCatalogAPI.createVariant(serviceId, { name: custom.name.trim(), price: custom.price === '' ? null : Number(custom.price) })).then((ok) => ok && setCustom(null))}>
              Add package
            </button>
            <button type="button" style={btnGhost} onClick={() => setCustom(null)}>Cancel</button>
          </div>
        )}
      </Section>

      <PackageMaterials variants={cat.variants} serviceId={serviceId} readOnly={readOnly} busy={busy} run={run} />

      <WhoDoesIt variants={cat.variants} staff={staff} readOnly={readOnly} />

      {/* ── Fees ── */}
      <ServiceFees fees={cat.fees ?? []} currencyCode={currencyCode} serviceId={serviceId} readOnly={readOnly} busy={busy} run={run} />

      {/* ── Requirements ── */}
      <Section title="What we need from the customer" description="Details the customer provides when they request a quote — an address, photos, a model number. Marked ones must be filled in.">
        {cat.requirements.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            {cat.requirements.map((r) => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.82rem', flexWrap: 'wrap' }}>
                <strong style={{ minWidth: 200 }}>{r.label}</strong>
                <span style={{ color: colors.textMuted }}>{FIELD_TYPES.find(([k]) => k === r.field_type)?.[1]}{r.field_type === 'select' && r.choices?.length ? `: ${r.choices.join(', ')}` : ''}</span>
                {r.is_required && <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#b45309' }}>Required</span>}
                {!readOnly && (
                  <button type="button" style={{ ...btnGhost, padding: '4px 8px', marginLeft: 'auto' }} disabled={busy}
                    onClick={() => run(() => serviceCatalogAPI.deleteRequirement(serviceId, r.id))}><Trash2 size={13} /></button>
                )}
              </div>
            ))}
          </div>
        )}
        {!readOnly && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input value={newReq.label} placeholder="e.g. Installation address" onChange={(e) => setNewReq({ ...newReq, label: e.target.value })} style={{ ...cell, width: 240 }} />
            <select value={newReq.field_type} onChange={(e) => setNewReq({ ...newReq, field_type: e.target.value })} style={{ ...cell, width: 130 }}>
              {FIELD_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            {newReq.field_type === 'select' && (
              <input value={newReq.choices} placeholder="Choices, comma separated" onChange={(e) => setNewReq({ ...newReq, choices: e.target.value })} style={{ ...cell, width: 220 }} />
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem' }}>
              <input type="checkbox" checked={newReq.is_required} onChange={(e) => setNewReq({ ...newReq, is_required: e.target.checked })} /> Required
            </label>
            <button type="button" style={btnGhost} disabled={busy || !newReq.label.trim()}
              onClick={() => run(() => serviceCatalogAPI.createRequirement(serviceId, {
                label: newReq.label.trim(), field_type: newReq.field_type, is_required: newReq.is_required,
                choices: newReq.field_type === 'select' ? newReq.choices.split(',').map((c) => c.trim()).filter(Boolean) : undefined,
              })).then((ok) => ok && setNewReq({ label: '', field_type: 'text', is_required: false, choices: '' }))}>
              <Plus size={13} /> Add
            </button>
          </div>
        )}
      </Section>
    </div>
  );
}
