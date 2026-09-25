import React, { useState, useEffect } from 'react';
import SettingsLayout from '../../../components/layout/SettingsLayout';
import useCurrencyStore from '../../../store/currencyStore';
import {
  Plus, Edit2, Save, X, Check, Info, Star,
  ChevronDown, ChevronUp, AlertTriangle, Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputStyle = {
  width: '100%', padding: '7px 11px', borderRadius: 8, fontSize: '0.82rem',
  background: 'rgba(168,85,247,0.04)',
  border: '1.5px solid rgba(168,85,247,0.18)',
  color: '#111827', outline: 'none',
  transition: 'border-color 150ms, box-shadow 150ms',
  fontFamily: 'inherit', boxSizing: 'border-box',
};
const inputFocus = (e) => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.1)'; };
const inputBlur  = (e) => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.18)'; e.currentTarget.style.boxShadow = 'none'; };

const labelStyle = {
  fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.08em', color: '#7c3aed', display: 'block', marginBottom: 5,
};

const card = {
  background: 'white', borderRadius: 12,
  border: '1px solid rgba(168,85,247,0.1)',
  boxShadow: '0 2px 12px rgba(168,85,247,0.06)',
};

const TH_LABEL = ({ children, right }) => (
  <span style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', display: 'block', textAlign: right ? 'right' : 'left' }}>
    {children}
  </span>
);

// ── Sub-components ────────────────────────────────────────────────────────────

function Field({ label, children, hint }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
      {hint && <p style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: 4 }}>{hint}</p>}
    </div>
  );
}

function InlineEdit({ value, onSave, onCancel, step = '0.00000001', width = 160, preview, saving = false }) {
  const [val, setVal] = useState(value);
  const onKey = (e) => { if (e.key === 'Enter') onSave(val); if (e.key === 'Escape') onCancel(); };
  return (
    <div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <input
        type="number" step={step} value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={onKey}
        style={{ ...inputStyle, width, padding: '5px 9px' }}
        onFocus={inputFocus} onBlur={inputBlur}
        autoFocus
      />
      <button onClick={() => onSave(val)} disabled={saving} aria-label="Save" style={{
        width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 7, border: 'none', cursor: 'pointer',
        background: 'rgba(5,150,105,0.1)', color: '#065f46',
      }}>
        <Check size={13} />
      </button>
      <button onClick={onCancel} style={{
        width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 7, border: 'none', cursor: 'pointer',
        background: 'rgba(107,114,128,0.1)', color: '#6b7280',
      }}>
        <X size={13} />
      </button>
    </div>
    {preview && <p style={{ fontSize: '0.68rem', color: '#7c3aed', margin: '4px 0 0' }}>{preview(val)}</p>}
    </div>
  );
}

/** 1 USD = N units, from an anchor rate (USD value of 1 unit). */
const unitsPerUsd = (anchor) => {
  const a = Number(anchor);
  return a > 0 ? (1 / a) : null;
};
const fmtRate = (n, dp = 4) => (n == null || !isFinite(n) ? '—' : Number(n).toLocaleString(undefined, { maximumFractionDigits: dp }));

function EditTrigger({ value, onEdit }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: '0.82rem', color: '#374151', fontFamily: 'monospace' }}>{value}</span>
      <button onClick={onEdit} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 26, height: 26, borderRadius: 6, border: 'none', cursor: 'pointer',
        background: 'rgba(168,85,247,0.07)', color: '#a855f7', transition: 'background 120ms',
      }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.15)'}
        onMouseLeave={e => e.currentTarget.style.background = 'rgba(168,85,247,0.07)'}
      >
        <Edit2 size={11} />
      </button>
    </div>
  );
}

function InfoPanel() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ ...card, overflow: 'hidden', marginTop: 16 }}>
      <button onClick={() => setOpen(v => !v)} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer',
        fontFamily: 'inherit',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Info size={14} style={{ color: '#a855f7' }} />
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#374151' }}>How currency rates work</span>
        </div>
        {open ? <ChevronUp size={14} style={{ color: '#9ca3af' }} /> : <ChevronDown size={14} style={{ color: '#9ca3af' }} />}
      </button>

      {open && (
        <div style={{ padding: '0 20px 20px', borderTop: '1px solid rgba(168,85,247,0.08)', paddingTop: 16 }}>
          <p style={{ fontSize: '0.78rem', color: '#6b7280', lineHeight: 1.7, margin: '0 0 12px' }}>
            Two values are stored per currency: <strong style={{ color: '#374151' }}>Anchor Rate</strong> and <strong style={{ color: '#374151' }}>Conversion Rate</strong>.
            The anchor rate is the source of truth — it stays fixed to a single reference currency (typically USD).
            The conversion rate is automatically derived based on whichever currency is currently set as the base.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              {
                term: 'Anchor Rate',
                def: "The currency's value relative to the anchor (e.g., USD). If USD is anchor, its rate is 1.00000000. Example: KES anchor = 0.00775 means 1 KES = $0.00775.",
              },
              {
                term: 'Conversion Rate',
                def: 'Derived from anchor rates when you change the base: conversion_rate = currency.anchor_rate / base.anchor_rate. The base currency always has conversion_rate = 1.00.',
              },
            ].map(({ term, def }) => (
              <div key={term} style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(168,85,247,0.03)', border: '1px solid rgba(168,85,247,0.08)' }}>
                <p style={{ fontSize: '0.72rem', fontWeight: 700, color: '#7c3aed', margin: '0 0 3px' }}>{term}</p>
                <p style={{ fontSize: '0.72rem', color: '#6b7280', margin: 0, lineHeight: 1.6 }}>{def}</p>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: 'rgba(168,85,247,0.05)', border: '1px solid rgba(168,85,247,0.15)' }}>
            <p style={{ fontSize: '0.68rem', fontWeight: 700, color: '#7c3aed', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Example</p>
            <p style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: '#374151', margin: 0, lineHeight: 1.8 }}>
              Base = KES (anchor = 0.00775), USD (anchor = 1.0)<br />
              USD conversion_rate = 1.0 / 0.00775 = 129.03<br />
              → 1 USD = 129.03 KES
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function AddCurrencyModal({ onClose, onSave, baseCurrency, saving }) {
  const [form, setForm] = useState({ code: '', name: '', symbol: '', anchor_rate: '' });
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const perUsd = unitsPerUsd(form.anchor_rate);
  const baseAnchor = Number(baseCurrency?.anchor_rate);
  // The API still requires conversion_rate on create; derive it the same way the server does.
  const conversionRate = form.anchor_rate && baseAnchor > 0 ? Number(form.anchor_rate) / baseAnchor : 1;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({ ...form, code: form.code.toUpperCase(), conversion_rate: conversionRate });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(15,10,30,0.65)', backdropFilter: 'blur(6px)' }}>
      <div style={{ ...card, width: '100%', maxWidth: 420, padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <p style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111827', margin: 0 }}>Add currency</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex' }}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Code">
              <input type="text" required maxLength="3" value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="USD" style={inputStyle} onFocus={inputFocus} onBlur={inputBlur}
              />
            </Field>
            <Field label="Symbol">
              <input type="text" required value={form.symbol} onChange={set('symbol')}
                placeholder="$" style={inputStyle} onFocus={inputFocus} onBlur={inputBlur}
              />
            </Field>
          </div>
          <Field label="Name">
            <input type="text" required value={form.name} onChange={set('name')}
              placeholder="US Dollar" style={inputStyle} onFocus={inputFocus} onBlur={inputBlur}
            />
          </Field>
          <Field
            label="USD value of 1 unit (anchor rate)"
            hint={perUsd
              ? `So 1 USD = ${fmtRate(perUsd)} ${form.code || 'units'}${baseCurrency && form.code ? `, and 1 ${form.code} = ${fmtRate(conversionRate, 6)} ${baseCurrency.code}` : ''}`
              : 'Not the usual "1 USD = …" rate — it\'s the other way round. KES ≈ 0.00775 because 1 KES ≈ $0.00775.'}
          >
            <input type="number" step="0.00000001" required value={form.anchor_rate} onChange={set('anchor_rate')}
              placeholder="0.00775074" style={inputStyle} onFocus={inputFocus} onBlur={inputBlur}
            />
          </Field>

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{
              flex: 1, padding: '8px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600,
              background: 'transparent', border: '1.5px solid rgba(168,85,247,0.18)', color: '#9ca3af',
              cursor: 'pointer', fontFamily: 'inherit',
            }}>Cancel</button>
            <button type="submit" style={{
              flex: 1, padding: '8px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 700,
              border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white',
              boxShadow: '0 2px 10px rgba(168,85,247,0.3)', opacity: saving ? 0.6 : 1,
            }} disabled={saving}>{saving ? 'Adding…' : 'Add currency'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CurrencySettings() {
  const {
    adminCurrencies: currencies, baseCurrency, adminLoading, actionLoading,
    fetchAdminCurrencies, createCurrency, updateAnchorRate, setBaseCurrency,
    toggleStatus, deleteCurrency,
  } = useCurrencyStore();

  const [editingAnchor, setEditingAnchor] = useState(null); // { id, value }
  const [showAdd,       setShowAdd]       = useState(false);
  const loading = adminLoading && !currencies.length;

  useEffect(() => { fetchAdminCurrencies().catch(() => toast.error('Failed to load currencies')); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const serverMsg = (e, fallback) => e?.response?.data?.message || fallback;

  const handleSetBase = async (c) => {
    if (!confirm(`Make ${c.code} the base currency? Every conversion rate is recalculated, and items without their own currency will be priced in ${c.code}.`)) return;
    try { await setBaseCurrency(c.id); toast.success(`${c.code} is now the base currency`); }
    catch (e) { toast.error(serverMsg(e, 'Failed to set base currency')); }
  };

  const handleSaveAnchor = async (id, value) => {
    if (!(Number(value) > 0)) { toast.error('Enter a rate above zero'); return; }
    try { await updateAnchorRate(id, value); setEditingAnchor(null); toast.success('Rate updated'); }
    catch (e) { toast.error(serverMsg(e, 'Failed to update rate')); }
  };

  const handleToggle = async (c) => {
    if (c.is_base && c.is_active) { toast.error('The base currency must stay active. Set another base first.'); return; }
    try { await toggleStatus(c.id, !c.is_active); toast.success(`${c.code} ${c.is_active ? 'deactivated' : 'activated'}`); }
    catch (e) { toast.error(serverMsg(e, 'Failed to change status')); }
  };

  const handleDelete = async (c) => {
    if (!confirm(`Delete ${c.code}? If any products, services or tax rates are priced in ${c.code}, deactivate it instead.`)) return;
    try { await deleteCurrency(c.id); toast.success(`${c.code} deleted`); }
    catch (e) { toast.error(serverMsg(e, `${c.code} could not be deleted. It may still be in use — deactivate it instead.`)); }
  };

  const handleAdd = async (form) => {
    try { await createCurrency(form); setShowAdd(false); await fetchAdminCurrencies(); toast.success(`${form.code} added`); }
    catch (e) {
      const errs = e.response?.data?.errors;
      toast.error(errs ? Object.values(errs)[0][0] : serverMsg(e, 'Failed to add currency'));
    }
  };

  if (loading) return (
    <SettingsLayout>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
        {[80, 400].map((h, i) => (
          <div key={i} style={{ height: h, borderRadius: 12, background: 'rgba(168,85,247,0.07)', marginBottom: 16 }} />
        ))}
      </div>
    </SettingsLayout>
  );

  return (
    <SettingsLayout>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#a855f7', letterSpacing: '-0.02em', margin: '0 0 4px' }}>
              Currency Settings
            </h1>
            {baseCurrency && (
              <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Star size={11} style={{ color: '#f59e0b' }} />
                Base: <strong style={{ color: '#374151' }}>{baseCurrency.code}</strong> ({baseCurrency.symbol})
              </p>
            )}
          </div>
          <button onClick={() => setShowAdd(true)} style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '9px 18px', borderRadius: 10, fontSize: '0.82rem', fontWeight: 700,
            border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white',
            boxShadow: '0 4px 14px rgba(168,85,247,0.35)', transition: 'box-shadow 150ms',
          }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 6px 20px rgba(168,85,247,0.5)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = '0 4px 14px rgba(168,85,247,0.35)'}
          >
            <Plus size={15} /> Add currency
          </button>
        </div>

        {/* ── Table ── */}
        <div style={{ ...card, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(168,85,247,0.1)', background: 'rgba(168,85,247,0.02)' }}>
                  {[
                    { label: 'Code',            w: 120 },
                    { label: 'Name',            w: 180 },
                    { label: 'Symbol',          w: 80  },
                    { label: `Value in ${baseCurrency?.code ?? 'base'}`, w: 200 },
                    { label: 'USD value of 1 unit', w: 220 },
                    { label: 'Status',          w: 100 },
                    { label: '',                w: 120 },
                  ].map(({ label, w }) => (
                    <th key={label} style={{ padding: '10px 16px', textAlign: 'left', minWidth: w }}>
                      <TH_LABEL>{label}</TH_LABEL>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {currencies.map((c, i) => {
                  const isBase  = baseCurrency?.id === c.id;
                  const isLast  = i === currencies.length - 1;
                  const isUSD   = c.code === 'USD';

                  return (
                    <tr key={c.id} style={{
                      borderBottom: isLast ? 'none' : '1px solid rgba(168,85,247,0.05)',
                      background: isBase ? 'rgba(168,85,247,0.03)' : 'transparent',
                      transition: 'background 120ms',
                    }}
                      onMouseEnter={e => { if (!isBase) e.currentTarget.style.background = 'rgba(168,85,247,0.02)'; }}
                      onMouseLeave={e => { if (!isBase) e.currentTarget.style.background = 'transparent'; }}
                    >

                      {/* Code */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#111827', fontFamily: 'monospace' }}>{c.code}</span>
                          {isBase && (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 3,
                              padding: '2px 7px', borderRadius: 20, fontSize: '0.6rem', fontWeight: 800,
                              background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white',
                              textTransform: 'uppercase', letterSpacing: '0.06em',
                            }}>
                              <Star size={8} /> Base
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Name */}
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontSize: '0.82rem', color: '#374151' }}>{c.name}</span>
                      </td>

                      {/* Symbol */}
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontSize: '0.88rem', color: '#6b7280', fontWeight: 600 }}>{c.symbol}</span>
                      </td>

                      {/* Value in base — derived from anchor rates, not editable */}
                      <td style={{ padding: '12px 16px' }}>
                        {isBase ? (
                          <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>Base currency</span>
                        ) : (
                          <span style={{ fontSize: '0.8rem', color: '#374151' }}>
                            1 {c.code} = <strong style={{ fontFamily: 'monospace' }}>{fmtRate(Number(c.conversion_rate), 6)}</strong> {baseCurrency?.code}
                          </span>
                        )}
                      </td>

                      {/* Anchor rate */}
                      <td style={{ padding: '12px 16px' }}>
                        {isUSD ? (
                          <span style={{ fontSize: '0.82rem', color: '#d1d5db', fontFamily: 'monospace' }}>1.00000000</span>
                        ) : editingAnchor?.id === c.id ? (
                          <InlineEdit
                            value={editingAnchor.value}
                            onSave={(v) => handleSaveAnchor(c.id, v)}
                            onCancel={() => setEditingAnchor(null)}
                            saving={actionLoading}
                            preview={(v) => unitsPerUsd(v) ? `1 USD = ${fmtRate(unitsPerUsd(v))} ${c.code}` : 'Enter a value above zero'}
                          />
                        ) : (
                          <div>
                            <EditTrigger
                              value={Number(c.anchor_rate).toFixed(8)}
                              onEdit={() => setEditingAnchor({ id: c.id, value: c.anchor_rate })}
                            />
                            <p style={{ fontSize: '0.66rem', color: '#9ca3af', margin: '3px 0 0' }}>
                              1 USD = {fmtRate(unitsPerUsd(c.anchor_rate))} {c.code}
                            </p>
                          </div>
                        )}
                      </td>

                      {/* Status toggle */}
                      <td style={{ padding: '12px 16px' }}>
                        <button
                          onClick={() => handleToggle(c)}
                          title={isBase && c.is_active ? 'The base currency must stay active' : undefined}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '4px 10px', borderRadius: 20, fontSize: '0.65rem', fontWeight: 700,
                            cursor: 'pointer', border: 'none', fontFamily: 'inherit', transition: 'all 150ms',
                            ...(c.is_active
                              ? { background: 'rgba(16,185,129,0.1)', color: '#065f46', boxShadow: '0 0 0 1px rgba(16,185,129,0.25)' }
                              : { background: 'rgba(107,114,128,0.1)', color: '#4b5563', boxShadow: '0 0 0 1px rgba(107,114,128,0.2)' }
                            ),
                          }}
                        >
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: c.is_active ? '#10b981' : '#9ca3af', flexShrink: 0 }} />
                          {c.is_active ? 'Active' : 'Inactive'}
                        </button>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {!isBase && (
                            <button onClick={() => handleSetBase(c)} disabled={!c.is_active} title={!c.is_active ? 'Activate it first' : undefined} style={{
                              padding: '4px 10px', borderRadius: 7, fontSize: '0.7rem', fontWeight: 700,
                              background: 'rgba(168,85,247,0.07)', color: '#7c3aed',
                              border: '1px solid rgba(168,85,247,0.2)', cursor: 'pointer', fontFamily: 'inherit',
                              transition: 'background 120ms',
                            }}
                              onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.15)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'rgba(168,85,247,0.07)'}
                            >
                              Set base
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(c)}
                            aria-label={`Delete ${c.code}`}
                            disabled={isBase}
                            style={{
                              width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                              borderRadius: 7, border: 'none', cursor: isBase ? 'not-allowed' : 'pointer',
                              background: 'none', color: '#d1d5db', opacity: isBase ? 0.4 : 1,
                              transition: 'background 120ms, color 120ms',
                            }}
                            onMouseEnter={e => { if (!isBase) { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; e.currentTarget.style.color = '#ef4444'; } }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#d1d5db'; }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <InfoPanel />

        {showAdd && <AddCurrencyModal onClose={() => setShowAdd(false)} onSave={handleAdd} baseCurrency={baseCurrency} saving={actionLoading} />}
      </div>
    </SettingsLayout>
  );
}