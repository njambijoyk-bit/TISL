import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Star, Sparkles, X } from 'lucide-react';
import serviceCatalogAPI from '../../../../_shared/api/serviceCatalog';
import useUomStore from '../../../../_shared/store/uomStore';
import { colors, card, input, btnPrimary, btnGhost, radius } from '../../../../_shared/theme/tokens';
import { getBaseCode } from '../../../../_shared/lib/baseCurrency';
import booksAPI from '../../../../_shared/api/books';

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

/**
 * Options, packages and requirements for one service.
 *
 * Packages work like product variants: generated from option combinations (each
 * with its own price, duration and unit), or hand-made. Every service always
 * has at least one — the automatic "Standard" package.
 */
export default function ServiceCatalogEditor({ serviceId, currencyCode = getBaseCode(), readOnly = false }) {
  const [cat, setCat] = useState(null);
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
