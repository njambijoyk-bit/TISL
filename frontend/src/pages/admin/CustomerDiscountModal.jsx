import { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, Percent, Truck, Star, CreditCard, Search, ChevronRight,
  ChevronUp, ChevronDown, ArrowUpDown,
  TrendingUp, ShieldCheck, AlertCircle, Gift, Users, Zap,
  ArrowRight, Package,
} from 'lucide-react';
import customersAPI    from '../../api/customers';
import customerTiersAPI from '../../api/customerTiers';
import loyaltyAPI      from '../../api/loyalty';
import shippingAPI     from '../../api/shipping';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const fmt    = (n) => Number(n ?? 0).toLocaleString('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 });
const fmtPts = (n) => Number(n ?? 0).toLocaleString();
const pct    = (n) => `${Number(n ?? 0).toFixed(1)}%`;

const TIER_FALLBACK = {
  bronze:   { bg: 'rgba(249,115,22,0.1)',  color: '#c2410c', ring: 'rgba(249,115,22,0.25)'  },
  silver:   { bg: 'rgba(107,114,128,0.1)', color: '#4b5563', ring: 'rgba(107,114,128,0.2)'  },
  gold:     { bg: 'rgba(234,179,8,0.1)',   color: '#b45309', ring: 'rgba(234,179,8,0.25)'   },
  platinum: { bg: 'rgba(168,85,247,0.1)',  color: '#7c3aed', ring: 'rgba(168,85,247,0.25)'  },
};

function tierStyle(slug, tierOptions = []) {
  const opt = tierOptions.find(t => t.slug === slug);
  if (opt?.color) return { bg: `${opt.color}18`, color: opt.color, ring: `${opt.color}40` };
  return TIER_FALLBACK[slug] ?? TIER_FALLBACK.silver;
}

function calcEffective(customer, tiers = [], types = []) {
  const personal = Number(customer?.discount_percentage ?? 0);
  const tierObj  = tiers.find(t => t.slug === customer?.tier);
  const typeObj  = types.find(t => t.slug === customer?.customer_type);
  const tierPct  = Number(tierObj?.discount_percentage ?? 0);
  const typePct  = Number(typeObj?.discount_percentage ?? 0);
  const stacked  = personal + tierPct + typePct;
  const capped   = stacked > 30;
  const effective = capped ? 30 : stacked;
  return { personal, tierPct, typePct, stacked, effective, capped };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab2 sort fields
// ─────────────────────────────────────────────────────────────────────────────
const TAB2_SORT_FIELDS = [
  { key: 'first_name',          label: 'Customer'     },
  { key: 'discount_percentage', label: 'Discount'     },
  { key: 'store_credit',        label: 'Store Credit' },
  { key: 'loyalty_points',      label: 'Points'       },
];

// ─────────────────────────────────────────────────────────────────────────────
// Shared UI primitives
// ─────────────────────────────────────────────────────────────────────────────
function Spinner({ size = 30 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 0', gap: 12 }}>
      <div style={{ width: size, height: size, border: '3px solid rgba(168,85,247,0.15)', borderTopColor: '#a855f7', borderRadius: '50%', animation: 'dm-spin 0.8s linear infinite' }} />
      <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: 0 }}>Loading…</p>
    </div>
  );
}

function SectionHeading({ icon, label, color = '#a855f7' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
      <div style={{ width: 26, height: 26, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${color}18`, color, flexShrink: 0 }}>
        {icon}
      </div>
      <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6b7280' }}>{label}</span>
    </div>
  );
}

function StatPill({ label, value, accent, bg }) {
  return (
    <div style={{ flex: 1, padding: '12px 14px', borderRadius: 10, background: bg, border: `1px solid ${accent}28`, display: 'flex', flexDirection: 'column', gap: 3 }}>
      <p style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: accent, margin: 0, opacity: 0.75 }}>{label}</p>
      <p style={{ fontSize: '1.05rem', fontWeight: 800, color: accent, margin: 0, letterSpacing: '-0.02em' }}>{value}</p>
    </div>
  );
}

function DiscountRow({ label, sub, value, highlight, color = '#374151' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', borderRadius: 8, background: highlight ? 'rgba(168,85,247,0.04)' : 'transparent', border: highlight ? '1px solid rgba(168,85,247,0.12)' : '1px solid transparent' }}>
      <div>
        <p style={{ fontSize: '0.8rem', color: '#374151', margin: 0, fontWeight: highlight ? 600 : 400 }}>{label}</p>
        {sub && <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: '2px 0 0' }}>{sub}</p>}
      </div>
      <span style={{ fontSize: highlight ? '1rem' : '0.85rem', fontWeight: highlight ? 800 : 600, color, letterSpacing: highlight ? '-0.02em' : 0 }}>{value}</span>
    </div>
  );
}

function Tooltip({ children, tip }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && tip && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)',
          background: '#1f2937', color: 'white', borderRadius: 8, padding: '8px 12px',
          fontSize: '0.7rem', lineHeight: 1.6, whiteSpace: 'nowrap', zIndex: 100,
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)', pointerEvents: 'none',
        }}>
          {tip}
          <div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', borderWidth: 5, borderStyle: 'solid', borderColor: '#1f2937 transparent transparent transparent' }} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1 — Single customer deep-dive
// ─────────────────────────────────────────────────────────────────────────────
function Tab1({ initialCustomer, tierOptions, typeOptions, loyaltySettings, shippingOptions }) {
  const [query,       setQuery]       = useState(initialCustomer ? `${initialCustomer.first_name} ${initialCustomer.last_name}` : '');
  const [results,     setResults]     = useState([]);
  const [searching,   setSearching]   = useState(false);
  const [selected,    setSelected]    = useState(initialCustomer ?? null);
  const [showDrop,    setShowDrop]    = useState(false);
  const [loyaltyData, setLoyaltyData] = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);
  const debounceRef = useRef(null);
  const dropRef     = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (dropRef.current && !dropRef.current.contains(e.target)) setShowDrop(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!query.trim() || selected) { if (!selected) { setResults([]); setShowDrop(false); } return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await customersAPI.getAllCustomers({ search: query, per_page: 8 });
        setResults(data.data ?? []);
        setShowDrop(true);
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 320);
  }, [query, selected]);

  useEffect(() => {
    if (!selected) return;
    setLoading(true); setError(null);
    loyaltyAPI.show(selected.id)
      .then(d => setLoyaltyData(d.customer ?? d))
      .catch(() => setError('Could not load loyalty data'))
      .finally(() => setLoading(false));
  }, [selected]);

  useEffect(() => {
    if (initialCustomer) {
      setLoading(true);
      loyaltyAPI.show(initialCustomer.id)
        .then(d => setLoyaltyData(d.customer ?? d))
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, []);

  function pickCustomer(c) {
    setSelected(c); setQuery(`${c.first_name} ${c.last_name}`); setShowDrop(false); setResults([]);
  }
  function clearCustomer() {
    setSelected(null); setQuery(''); setLoyaltyData(null); setResults([]);
  }

  // ── derived ──────────────────────────────────────────────────────────────
  const { personal: personalDiscount, tierPct, typePct, stacked: stackedDiscount, effective: effectiveDiscount }
    = calcEffective(selected, tierOptions, typeOptions);

  const tierObj = tierOptions.find(t => t.slug === selected?.tier);
  const typeObj = typeOptions.find(t => t.slug === selected?.customer_type);

  const loyaltyPoints = loyaltyData?.loyalty_points ?? selected?.loyalty_points ?? 0;
  const storeCredit   = loyaltyData?.store_credit   ?? selected?.store_credit   ?? 0;
  const minRedeem     = loyaltySettings?.settings?.min_redemption_points ?? loyaltySettings?.min_redemption_points ?? 500;

  const now             = new Date();
  const redemptionRules = (loyaltySettings?.redemption_rules ?? []).filter(r => {
    if (r.active === false || r.active === 0) return false;
    if (r.valid_until && new Date(r.valid_until) < now) return false;
    return true;
  });
  const creditEarningRules = redemptionRules.filter(r => r.type === 'cashback' || r.type === 'voucher');
  const bestRateRule        = creditEarningRules.reduce((best, r) => {
    const rate = Number(r.value_kes) / Number(r.points_required);
    return (!best || rate > (Number(best.value_kes) / Number(best.points_required))) ? r : best;
  }, null);
  const redemptionRate = bestRateRule ? (Number(bestRateRule.value_kes) / Number(bestRateRule.points_required)) : 0;
  const pointsKesValue = loyaltyPoints * redemptionRate;
  const totalWallet    = Number(storeCredit || 0) + Number(pointsKesValue || 0);
  const canRedeem      = loyaltyPoints >= minRedeem;

  const affordableRules = redemptionRules.filter(r => loyaltyPoints >= r.points_required);

  const freeShippingThreshold  = tierObj?.free_shipping_threshold;
  const tierAlwaysFreeShipping = tierObj != null && (freeShippingThreshold == null || Number(freeShippingThreshold) === 0);
  const hasFreeThreshold       = tierObj != null && Number(freeShippingThreshold) > 0;

  const ts = selected ? tierStyle(selected.tier, tierOptions) : {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* search bar */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(168,85,247,0.08)', flexShrink: 0 }}>
        <div ref={dropRef} style={{ position: 'relative' }}>
          <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: '#c4b5fd', pointerEvents: 'none' }} />
          <input
            type="text"
            placeholder="Search customer by name or email…"
            value={query}
            onChange={e => { setQuery(e.target.value); if (!e.target.value) clearCustomer(); }}
            style={{ width: '100%', padding: '8px 34px 8px 34px', borderRadius: 9, fontSize: '0.82rem', background: 'rgba(168,85,247,0.04)', border: '1.5px solid rgba(168,85,247,0.18)', color: '#111827', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', transition: 'border-color 150ms, box-shadow 150ms' }}
            onFocus={e => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.1)'; if (results.length) setShowDrop(true); }}
            onBlur={e  => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.18)'; e.currentTarget.style.boxShadow = 'none'; }}
          />
          {selected && (
            <button onClick={clearCustomer} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex', padding: 0 }}>
              <X size={14} />
            </button>
          )}

          {showDrop && !selected && (
            <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 10, background: 'white', borderRadius: 10, border: '1.5px solid rgba(168,85,247,0.18)', boxShadow: '0 8px 24px rgba(168,85,247,0.12)', overflow: 'hidden' }}>
              {searching ? (
                <div style={{ padding: '14px 16px', fontSize: '0.78rem', color: '#9ca3af' }}>Searching…</div>
              ) : results.length === 0 ? (
                <div style={{ padding: '14px 16px', fontSize: '0.78rem', color: '#9ca3af' }}>No customers found</div>
              ) : results.map(c => {
                const ts2 = tierStyle(c.tier, tierOptions);
                return (
                  <div key={c.id} onMouseDown={() => pickCustomer(c)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid rgba(168,85,247,0.06)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#111827', margin: '0 0 2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.first_name} {c.last_name}</p>
                      <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: 0, fontFamily: 'monospace' }}>{c.email}</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 10 }}>
                      <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: '0.6rem', fontWeight: 700, background: ts2.bg, color: ts2.color, textTransform: 'capitalize' }}>{c.tier}</span>
                      <ChevronRight size={12} style={{ color: '#c4b5fd' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {!selected && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '40px 24px' }}>
            <Search size={36} style={{ color: 'rgba(168,85,247,0.2)' }} />
            <p style={{ fontSize: '0.8rem', color: '#9ca3af', margin: 0, textAlign: 'center' }}>Search for a customer above to see their full discount &amp; wallet breakdown</p>
          </div>
        )}

        {selected && loading && <Spinner />}
        {selected && error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
            <AlertCircle size={14} style={{ color: '#ef4444', flexShrink: 0 }} />
            <p style={{ fontSize: '0.78rem', color: '#b91c1c', margin: 0 }}>{error}</p>
          </div>
        )}

        {selected && !loading && (<>

          {/* customer chip */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, background: 'rgba(168,85,247,0.04)', border: '1px solid rgba(168,85,247,0.12)' }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: ts.bg, color: ts.color, fontSize: '0.82rem', fontWeight: 800 }}>
              {`${selected.first_name?.[0] ?? ''}${selected.last_name?.[0] ?? ''}`.toUpperCase()}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                <p style={{ fontSize: '0.88rem', fontWeight: 700, color: '#111827', margin: 0 }}>{selected.first_name} {selected.last_name}</p>
                <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: '0.6rem', fontWeight: 700, background: ts.bg, color: ts.color, textTransform: 'capitalize' }}>{selected.tier}</span>
                <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: '0.6rem', fontWeight: 700, background: 'rgba(107,114,128,0.08)', color: '#6b7280', textTransform: 'capitalize' }}>{selected.customer_type}</span>
              </div>
              <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: '2px 0 0', fontFamily: 'monospace' }}>{selected.email}</p>
            </div>
          </div>

          {/* ── wallet ── */}
          <div>
            <SectionHeading icon={<CreditCard size={13} />} label="Wallet & Savings" color="#059669" />
            <div style={{ display: 'flex', gap: 8 }}>
              <StatPill label="Store credit"   value={fmt(storeCredit)}                                               accent="#059669" bg="rgba(5,150,105,0.06)"   />
              <StatPill label="Loyalty points" value={fmtPts(loyaltyPoints) + ' pts'}                                 accent="#d97706" bg="rgba(217,119,6,0.06)"   />
              <StatPill label="Points → KES"   value={redemptionRate > 0 ? fmt(pointsKesValue) : '—'}                accent="#7c3aed" bg="rgba(124,58,237,0.06)"  />
              <StatPill label="Discount"       value={pct(effectiveDiscount)}                                         accent="#a855f7" bg="rgba(168,85,247,0.06)"  />
            </div>
            <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, background: 'rgba(217,119,6,0.05)', border: '1px solid rgba(217,119,6,0.12)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <TrendingUp size={13} style={{ color: '#d97706', flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: '0.7rem', color: '#92400e', margin: 0, lineHeight: 1.5 }}>
                {redemptionRate > 0
                  ? <><strong>{fmtPts(loyaltyPoints)} pts</strong> redeemable for up to <strong>{fmt(pointsKesValue)}</strong> store credit{bestRateRule ? <> via <strong>{bestRateRule.name}</strong></> : null}{canRedeem ? ' · eligible to redeem now' : ` · needs ${fmtPts(minRedeem - loyaltyPoints)} more pts to unlock (min ${fmtPts(minRedeem)})`}.</>
                  : <><strong>{fmtPts(loyaltyPoints)} pts</strong> accrued · no active cashback or voucher rules configured for redemption.</>
                }
                {' '}Store credit is applied directly at checkout.
              </p>
            </div>
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', borderRadius: 8, background: 'rgba(5,150,105,0.06)', border: '1px solid rgba(5,150,105,0.15)' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#065f46' }}>Total purchasing power</span>
              <span style={{ fontSize: '1rem', fontWeight: 800, color: '#059669', letterSpacing: '-0.02em' }}>{fmt(totalWallet)}</span>
            </div>
          </div>

          {/* ── redemption rules ── */}
          <div>
            <SectionHeading icon={<Gift size={13} />} label="Redemption Options" color="#7c3aed" />
            {redemptionRules.length === 0 ? (
              <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: 0, padding: '8px 0' }}>No active redemption rules configured.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {redemptionRules.map(rule => {
                  const affordable = loyaltyPoints >= rule.points_required;
                  const shortage   = rule.points_required - loyaltyPoints;
                  return (
                    <div key={rule.id ?? rule.name} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 12px', borderRadius: 9,
                      background: affordable ? 'rgba(124,58,237,0.04)' : 'rgba(156,163,175,0.05)',
                      border: `1px solid ${affordable ? 'rgba(124,58,237,0.15)' : 'rgba(156,163,175,0.15)'}`,
                      opacity: affordable ? 1 : 0.7,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: affordable ? 'rgba(124,58,237,0.1)' : 'rgba(156,163,175,0.1)', color: affordable ? '#7c3aed' : '#9ca3af' }}>
                          {rule.type === 'cashback' ? <Zap size={13} /> : rule.type === 'gift' ? <Gift size={13} /> : <Package size={13} />}
                        </div>
                        <div>
                          <p style={{ fontSize: '0.8rem', fontWeight: 600, color: affordable ? '#111827' : '#6b7280', margin: '0 0 2px' }}>{rule.name}</p>
                          <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: 0 }}>
                            {fmtPts(rule.points_required)} pts
                            {affordable
                              ? <span style={{ color: '#059669', fontWeight: 600 }}> · unlocked ✓</span>
                              : <span style={{ color: '#ef4444' }}> · needs {fmtPts(shortage)} more pts</span>
                            }
                          </p>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 10 }}>
                        <p style={{ fontSize: '0.88rem', fontWeight: 800, color: affordable ? '#7c3aed' : '#9ca3af', margin: '0 0 1px', letterSpacing: '-0.02em' }}>{fmt(rule.value_kes)}</p>
                        <p style={{ fontSize: '0.62rem', color: '#9ca3af', margin: 0, textTransform: 'capitalize' }}>{rule.type}</p>
                      </div>
                    </div>
                  );
                })}

                {affordableRules.length > 0 && (
                  <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(5,150,105,0.05)', border: '1px solid rgba(5,150,105,0.15)', display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                    <ShieldCheck size={13} style={{ color: '#059669', flexShrink: 0 }} />
                    <p style={{ fontSize: '0.7rem', color: '#065f46', margin: 0 }}>
                      Customer can redeem <strong>{affordableRules.length} rule{affordableRules.length > 1 ? 's' : ''}</strong> now, earning up to <strong>{fmt(Math.max(...affordableRules.map(r => r.value_kes)))}</strong> store credit.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── discounts ── */}
          <div>
            <SectionHeading icon={<Percent size={13} />} label="Discounts" color="#a855f7" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <DiscountRow label="Personal discount"                          sub="Custom rate set on this customer"                    value={pct(personalDiscount)} color={personalDiscount > 0 ? '#7c3aed' : '#9ca3af'} />
              <DiscountRow label={`Tier · ${tierObj?.name ?? selected.tier}`} sub={`${selected.tier} tier benefit`}                    value={pct(tierPct)}          color={tierPct > 0 ? '#7c3aed' : '#9ca3af'} />
              <DiscountRow label={`Type · ${typeObj?.name ?? selected.customer_type}`} sub={`${selected.customer_type} type benefit`}  value={pct(typePct)}          color={typePct > 0 ? '#7c3aed' : '#9ca3af'} />
              <div style={{ height: 1, background: 'rgba(168,85,247,0.1)', margin: '4px 0' }} />
                <DiscountRow
                label="Effective discount" highlight
                sub={`Personal (${pct(personalDiscount)}) + Tier (${pct(tierPct)}) + Type (${pct(typePct)}) = ${pct(stackedDiscount)} stacked`}
                value={pct(effectiveDiscount)} color="#7c3aed"
                />
                {personalDiscount + tierPct + typePct > 30 && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 12px', borderRadius: 8, background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.25)', marginTop: 2 }}>
                    <AlertCircle size={13} style={{ color: '#d97706', flexShrink: 0, marginTop: 1 }} />
                    <p style={{ fontSize: '0.7rem', color: '#92400e', margin: 0, lineHeight: 1.5 }}>
                    Stacked discount of <strong>{pct(stackedDiscount)}</strong> exceeds the system cap. Orders will apply a maximum discount of <strong>30%</strong>.
                    </p>
                </div>
                )}
            </div>
          </div>

          {/* ── points multiplier ── */}
          {tierObj && (
            <div>
              <SectionHeading icon={<Star size={13} />} label="Points Multiplier" color="#d97706" />
              <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(217,119,6,0.05)', border: '1px solid rgba(217,119,6,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontSize: '0.8rem', color: '#374151', fontWeight: 500, margin: '0 0 2px' }}>{tierObj.name} multiplier</p>
                  <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: 0 }}>Earns {tierObj.loyalty_points_multiplier}× points on every order</p>
                </div>
                <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#d97706', letterSpacing: '-0.02em' }}>{tierObj.loyalty_points_multiplier}×</span>
              </div>
            </div>
          )}

          {/* ── shipping ── */}
          <div>
            <SectionHeading icon={<Truck size={13} />} label="Shipping Privileges" color="#2563eb" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>

              <div style={{
                padding: '10px 12px', borderRadius: 9,
                background: tierAlwaysFreeShipping ? 'rgba(5,150,105,0.05)' : hasFreeThreshold ? 'rgba(37,99,235,0.04)' : 'rgba(156,163,175,0.05)',
                border: `1px solid ${tierAlwaysFreeShipping ? 'rgba(5,150,105,0.2)' : hasFreeThreshold ? 'rgba(37,99,235,0.15)' : 'rgba(156,163,175,0.15)'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <p style={{ fontSize: '0.8rem', fontWeight: 600, margin: '0 0 2px', color: tierAlwaysFreeShipping ? '#065f46' : hasFreeThreshold ? '#1d4ed8' : '#6b7280' }}>
                      {tierAlwaysFreeShipping
                        ? 'Free shipping on all orders'
                        : hasFreeThreshold
                          ? `Free shipping above ${fmt(freeShippingThreshold)}`
                          : 'No free shipping privilege'}
                    </p>
                    <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: 0 }}>
                      {tierAlwaysFreeShipping
                        ? `${tierObj?.name ?? selected.tier} tier — all orders ship free regardless of amount`
                        : hasFreeThreshold
                          ? `${tierObj?.name ?? selected.tier} tier — orders over ${fmt(freeShippingThreshold)} ship free`
                          : `${tierObj?.name ?? selected.tier} tier has no free shipping configured`}
                    </p>
                  </div>
                  {tierAlwaysFreeShipping
                    ? <ShieldCheck size={16} style={{ color: '#059669', flexShrink: 0 }} />
                    : hasFreeThreshold
                      ? <ShieldCheck size={16} style={{ color: '#2563eb', flexShrink: 0 }} />
                      : <AlertCircle size={16} style={{ color: '#9ca3af', flexShrink: 0 }} />
                  }
                </div>

                {hasFreeThreshold && Number(selected.average_order_value) > 0 && (
                  <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 7, background: selected.average_order_value >= freeShippingThreshold ? 'rgba(5,150,105,0.08)' : 'rgba(239,68,68,0.06)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {selected.average_order_value >= freeShippingThreshold
                      ? <ShieldCheck size={12} style={{ color: '#059669', flexShrink: 0 }} />
                      : <AlertCircle size={12} style={{ color: '#ef4444', flexShrink: 0 }} />
                    }
                    <p style={{ fontSize: '0.68rem', margin: 0, color: selected.average_order_value >= freeShippingThreshold ? '#065f46' : '#b91c1c' }}>
                      {selected.average_order_value >= freeShippingThreshold
                        ? `Avg order ${fmt(selected.average_order_value)} typically qualifies`
                        : `Avg order ${fmt(selected.average_order_value)} usually falls short — customer typically pays shipping`}
                    </p>
                  </div>
                )}
              </div>

              {shippingOptions.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 2 }}>
                  <p style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af', margin: '0 0 4px' }}>Available shipping methods</p>
                  {shippingOptions.map(opt => {
                    const baseCost  = Number(opt.cost ?? 0);
                    const freeAbove = Number(opt.free_above ?? 0);
                    const customerGetsFree = tierAlwaysFreeShipping || baseCost === 0 || freeAbove > 0;
                    const subLabel = tierAlwaysFreeShipping && baseCost > 0
                      ? `Base ${fmt(baseCost)} · free via ${tierObj?.name ?? selected.tier} tier`
                      : freeAbove > 0
                        ? `Free above ${fmt(freeAbove)}, otherwise ${fmt(baseCost)}`
                        : baseCost === 0 ? 'Always free' : `${fmt(baseCost)} per order`;
                    const displayCost = tierAlwaysFreeShipping && baseCost > 0
                      ? 'Free*'
                      : baseCost === 0 ? 'Free'
                      : freeAbove > 0 ? `Free / ${fmt(baseCost)}`
                      : fmt(baseCost);
                    return (
                      <div key={opt.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 11px', borderRadius: 8, background: 'rgba(37,99,235,0.03)', border: '1px solid rgba(37,99,235,0.1)' }}>
                        <div>
                          <p style={{ fontSize: '0.78rem', fontWeight: 600, color: '#1e40af', margin: '0 0 1px' }}>{opt.name}</p>
                          <p style={{ fontSize: '0.65rem', color: '#9ca3af', margin: 0 }}>{subLabel}</p>
                        </div>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: customerGetsFree ? '#059669' : '#374151' }}>
                          {displayCost}
                        </span>
                      </div>
                    );
                  })}
                  {tierAlwaysFreeShipping && shippingOptions.some(o => Number(o.cost) > 0) && (
                    <p style={{ fontSize: '0.65rem', color: '#6b7280', margin: '2px 0 0 2px' }}>* Free on all orders ({tierObj?.name ?? selected.tier} tier benefit)</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── credit account ── */}
          {selected.has_credit_account && (
            <div>
              <SectionHeading icon={<CreditCard size={13} />} label="Credit Account" color="#0891b2" />
              <div style={{ display: 'flex', gap: 8 }}>
                <StatPill label="Credit limit" value={fmt(selected.credit_limit)}                                            accent="#0891b2" bg="rgba(8,145,178,0.06)"  />
                <StatPill label="Credit used"  value={fmt(selected.credit_used)}                                             accent="#ef4444" bg="rgba(239,68,68,0.06)"  />
                <StatPill label="Available"    value={fmt((selected.credit_limit ?? 0) - (selected.credit_used ?? 0))}       accent="#059669" bg="rgba(5,150,105,0.06)" />
              </div>
            </div>
          )}

        </>)}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2 — All customers overview (with load-more + sortable columns)
// ─────────────────────────────────────────────────────────────────────────────
function Tab2({ tierOptions, typeOptions, onViewCustomer }) {
  const [customers,   setCustomers]   = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingAll,  setLoadingAll]  = useState(false);
  const [page,        setPage]        = useState(1);
  const [meta,        setMeta]        = useState({ current_page: 1, last_page: 1, total: 0 });
  const [search,      setSearch]      = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy,      setSortBy]      = useState('first_name');
  const [sortOrder,   setSortOrder]   = useState('asc');
  const debRef = useRef(null);

  useEffect(() => {
    clearTimeout(debRef.current);
    debRef.current = setTimeout(() => setDebouncedSearch(search), 300);
  }, [search]);

  const buildParams = useCallback((pg) => ({
    page: pg, per_page: 15, sort_by: sortBy, sort_order: sortOrder,
    ...(debouncedSearch && { search: debouncedSearch }),
  }), [debouncedSearch, sortBy, sortOrder]);

  // initial / filter-change fetch — replaces list
  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await customersAPI.getAllCustomers(buildParams(1));
      setCustomers(data.data ?? []);
      setMeta({ current_page: data.current_page ?? 1, last_page: data.last_page ?? 1, total: data.total ?? 0 });
      setPage(1);
    } catch {} finally { setLoading(false); }
  }, [buildParams]);

  // append next page
  const handleLoadMore = async () => {
    const next = page + 1;
    setLoadingMore(true);
    try {
      const data = await customersAPI.getAllCustomers(buildParams(next));
      setCustomers(prev => [...prev, ...(data.data ?? [])]);
      setMeta({ current_page: data.current_page ?? next, last_page: data.last_page ?? 1, total: data.total ?? 0 });
      setPage(next);
    } catch {} finally { setLoadingMore(false); }
  };

  // load all remaining pages
  const handleLoadAll = async () => {
    setLoadingAll(true);
    try {
      const allPages = [];
      for (let pg = page + 1; pg <= meta.last_page; pg++) {
        const data = await customersAPI.getAllCustomers(buildParams(pg));
        allPages.push(...(data.data ?? []));
      }
      setCustomers(prev => [...prev, ...allPages]);
      setPage(meta.last_page);
    } catch {} finally { setLoadingAll(false); }
  };

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  const handleSort = (field) => {
    if (sortBy === field) setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
    else { setSortBy(field); setSortOrder('desc'); }
  };

  // aggregate stats across all loaded customers
  const totalStoreCredit      = customers.reduce((s, c) => s + Number(c.store_credit   ?? 0), 0);
  const totalLoyaltyPoints    = customers.reduce((s, c) => s + Number(c.loyalty_points ?? 0), 0);
  const avgEffective          = customers.length
    ? customers.reduce((s, c) => s + calcEffective(c, tierOptions, typeOptions).effective, 0) / customers.length
    : 0;
  const customersWithDiscount = customers.filter(c => calcEffective(c, tierOptions, typeOptions).effective > 0).length;

  function SortBtn({ field }) {
    const active = sortBy === field.key;
    return (
      <button
        onClick={() => handleSort(field.key)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
          width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          fontFamily: 'inherit', padding: 0,
          fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase',
          letterSpacing: '0.07em', color: active ? '#a855f7' : '#9ca3af',
          transition: 'color 150ms',
        }}
      >
        {field.label}
        {active
          ? sortOrder === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />
          : <ArrowUpDown size={10} style={{ opacity: 0.4 }} />
        }
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* stats strip + search */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(168,85,247,0.08)', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <StatPill label="Avg discount"       value={pct(avgEffective)}                accent="#a855f7" bg="rgba(168,85,247,0.06)" />
          <StatPill label="With any discount"  value={customersWithDiscount + ' cust.'} accent="#7c3aed" bg="rgba(124,58,237,0.06)" />
          <StatPill label="Total store credit" value={fmt(totalStoreCredit)}            accent="#059669" bg="rgba(5,150,105,0.06)"  />
          <StatPill label="Total pts (loaded)" value={fmtPts(totalLoyaltyPoints)}       accent="#d97706" bg="rgba(217,119,6,0.06)"  />
        </div>
        <div style={{ position: 'relative', marginTop: 10 }}>
          <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: '#c4b5fd', pointerEvents: 'none' }} />
          <input
            type="text" placeholder="Filter customers…" value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '7px 12px 7px 30px', borderRadius: 8, fontSize: '0.78rem', background: 'rgba(168,85,247,0.04)', border: '1.5px solid rgba(168,85,247,0.15)', color: '#111827', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
            onFocus={e => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.1)'; }}
            onBlur={e  => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.15)'; e.currentTarget.style.boxShadow = 'none'; }}
          />
        </div>
      </div>

      {/* table */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? <Spinner /> : customers.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '40px 24px' }}>
            <Users size={36} style={{ color: 'rgba(168,85,247,0.2)' }} />
            <p style={{ fontSize: '0.8rem', color: '#9ca3af', margin: 0 }}>No customers found</p>
          </div>
        ) : (<>

          {/* sortable header */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px 70px 70px', padding: '8px 20px', background: 'rgba(168,85,247,0.03)', borderBottom: '1px solid rgba(168,85,247,0.08)', position: 'sticky', top: 0, zIndex: 2 }}>
            <SortBtn field={TAB2_SORT_FIELDS[0]} />
            <SortBtn field={TAB2_SORT_FIELDS[1]} />
            <SortBtn field={TAB2_SORT_FIELDS[2]} />
            <SortBtn field={TAB2_SORT_FIELDS[3]} />
            <p style={{ fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af', margin: 0, textAlign: 'center' }}>Tier</p>
            <p style={{ margin: 0 }} />
          </div>

          {customers.map(c => {
            const ts2  = tierStyle(c.tier, tierOptions);
            const disc = calcEffective(c, tierOptions, typeOptions);
            const tooltipText = disc.capped
                ? `Personal: ${pct(disc.personal)}  ·  Tier: ${pct(disc.tierPct)}  ·  Type: ${pct(disc.typePct)}  ·  Capped at 30%`
                : `Personal: ${pct(disc.personal)}  ·  Tier: ${pct(disc.tierPct)}  ·  Type: ${pct(disc.typePct)}`;
            return (
              <div key={c.id}
                style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px 70px 70px', padding: '10px 20px', borderBottom: '1px solid rgba(168,85,247,0.06)', alignItems: 'center' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.025)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {/* name + email */}
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#111827', margin: '0 0 2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.first_name} {c.last_name}</p>
                  <p style={{ fontSize: '0.65rem', color: '#9ca3af', margin: 0, fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.email}</p>
                </div>

                {/* effective discount with tooltip */}
                <div style={{ textAlign: 'center' }}>
                  <Tooltip tip={tooltipText}>
                    <span style={{
                      display: 'inline-block', padding: '3px 8px', borderRadius: 20,
                      fontSize: '0.72rem', fontWeight: 700, cursor: 'default',
                      background: disc.effective > 0 ? 'rgba(124,58,237,0.1)' : 'rgba(156,163,175,0.1)',
                      color: disc.effective > 0 ? '#7c3aed' : '#9ca3af',
                      borderBottom: disc.effective > 0 ? '1.5px dashed rgba(124,58,237,0.3)' : 'none',
                    }}>
                      {pct(disc.effective)}
                    </span>
                  </Tooltip>
                </div>

                {/* store credit */}
                <p style={{ fontSize: '0.75rem', fontWeight: 600, color: Number(c.store_credit) > 0 ? '#059669' : '#9ca3af', margin: 0, textAlign: 'center' }}>
                  {Number(c.store_credit) > 0 ? fmt(c.store_credit) : '—'}
                </p>

                {/* loyalty points */}
                <p style={{ fontSize: '0.75rem', fontWeight: 600, color: Number(c.loyalty_points) > 0 ? '#d97706' : '#9ca3af', margin: 0, textAlign: 'center' }}>
                  {Number(c.loyalty_points) > 0 ? fmtPts(c.loyalty_points) : '—'}
                </p>

                {/* tier badge */}
                <div style={{ textAlign: 'center' }}>
                  <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: '0.6rem', fontWeight: 700, background: ts2.bg, color: ts2.color, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>{c.tier}</span>
                </div>

                {/* view button */}
                <div style={{ textAlign: 'center' }}>
                  <button
                    onClick={() => onViewCustomer(c)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 7, border: '1px solid rgba(168,85,247,0.25)', background: 'rgba(168,85,247,0.06)', color: '#7c3aed', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 120ms', whiteSpace: 'nowrap' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.12)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(168,85,247,0.06)'}
                  >
                    View <ArrowRight size={10} />
                  </button>
                </div>
              </div>
            );
          })}

        </>)}
      </div>

      {/* ── Load More / Load All footer ── */}
      {!loading && customers.length > 0 && page < meta.last_page && (
        <div style={{
          padding: '10px 20px', borderTop: '1px solid rgba(168,85,247,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'rgba(168,85,247,0.02)', flexShrink: 0,
        }}>
          <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: 0 }}>
            {customers.length.toLocaleString()} of {meta.total.toLocaleString()} loaded
          </p>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={handleLoadMore}
              disabled={loadingMore || loadingAll}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 7, fontSize: '0.72rem', fontWeight: 700, fontFamily: 'inherit', cursor: loadingMore || loadingAll ? 'not-allowed' : 'pointer', background: 'rgba(168,85,247,0.06)', border: '1.5px solid rgba(168,85,247,0.2)', color: '#7c3aed', opacity: loadingMore || loadingAll ? 0.6 : 1, transition: 'all 150ms' }}
              onMouseEnter={e => { if (!loadingMore && !loadingAll) e.currentTarget.style.background = 'rgba(168,85,247,0.12)'; }}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(168,85,247,0.06)'}
            >
              {loadingMore
                ? <><div style={{ width: 10, height: 10, border: '2px solid rgba(124,58,237,0.3)', borderTopColor: '#7c3aed', borderRadius: '50%', animation: 'dm-spin 0.7s linear infinite' }} /> Loading…</>
                : 'Load 15 more'
              }
            </button>
            <button
              onClick={handleLoadAll}
              disabled={loadingMore || loadingAll}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 7, fontSize: '0.72rem', fontWeight: 700, fontFamily: 'inherit', cursor: loadingMore || loadingAll ? 'not-allowed' : 'pointer', background: 'transparent', border: '1.5px solid rgba(168,85,247,0.15)', color: '#9ca3af', opacity: loadingMore || loadingAll ? 0.6 : 1, transition: 'all 150ms' }}
              onMouseEnter={e => { if (!loadingMore && !loadingAll) { e.currentTarget.style.background = 'rgba(168,85,247,0.05)'; e.currentTarget.style.color = '#7c3aed'; } }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9ca3af'; }}
            >
              {loadingAll
                ? <><div style={{ width: 10, height: 10, border: '2px solid rgba(156,163,175,0.3)', borderTopColor: '#9ca3af', borderRadius: '50%', animation: 'dm-spin 0.7s linear infinite' }} /> Loading all…</>
                : `Load all (${(meta.total - customers.length).toLocaleString()} left)`
              }
            </button>
          </div>
        </div>
      )}
      {!loading && customers.length > 0 && page >= meta.last_page && (
        <div style={{ padding: '8px 20px', borderTop: '1px solid rgba(168,85,247,0.08)', background: 'rgba(168,85,247,0.02)', flexShrink: 0 }}>
          <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: 0 }}>All {meta.total.toLocaleString()} customers loaded</p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Root modal
// ─────────────────────────────────────────────────────────────────────────────
export default function CustomerDiscountModal({ onClose }) {
  const [activeTab,      setActiveTab]      = useState(0);
  const [jumpToCustomer, setJumpToCustomer] = useState(null);
  const [tierOptions,    setTierOptions]    = useState([]);
  const [typeOptions,    setTypeOptions]    = useState([]);
  const [loyaltySettings, setLoyaltySettings] = useState(null);
  const [shippingOptions,  setShippingOptions]  = useState([]);

  useEffect(() => {
    customerTiersAPI.getActiveTiers().then(setTierOptions).catch(() => {});
    customerTiersAPI.getActiveTypes().then(setTypeOptions).catch(() => {});
    loyaltyAPI.getSettings().then(setLoyaltySettings).catch(() => {});
    shippingAPI.getActiveOptions().then(d => setShippingOptions(Array.isArray(d) ? d : (d.data ?? []))).catch(() => {});
  }, []);

  function handleViewCustomer(customer) {
    setJumpToCustomer(customer);
    setActiveTab(1);
  }

  const tab1Key = jumpToCustomer?.id ?? 'empty';
  const TABS = ['All Customers', 'Customer Detail'];

  return (
    <>
      <style>{`
        @keyframes dm-spin { to { transform: rotate(360deg); } }
        @keyframes dm-in   { from { opacity: 0; transform: scale(0.97) translateY(6px); } to { opacity: 1; transform: none; } }
      `}</style>

      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.48)', backdropFilter: 'blur(2px)' }} />

      <div style={{ position: 'fixed', inset: 0, zIndex: 51, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, pointerEvents: 'none' }}>
        <div style={{
          background: 'white', borderRadius: 14, border: '1px solid rgba(168,85,247,0.12)',
          boxShadow: '0 4px 32px rgba(168,85,247,0.1)',
          width: '100%', maxWidth: 680, height: '88vh', maxHeight: 720,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          pointerEvents: 'all', animation: 'dm-in 200ms ease',
        }}>

          {/* header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid rgba(168,85,247,0.1)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(168,85,247,0.1)' }}>
                <Percent size={15} style={{ color: '#a855f7' }} />
              </div>
              <div>
                <p style={{ fontSize: '0.88rem', fontWeight: 700, color: '#111827', margin: '0 0 1px' }}>Discount Overview</p>
                <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: 0 }}>Discounts · wallet · loyalty · shipping</p>
              </div>
            </div>

            {/* tabs */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(168,85,247,0.06)', borderRadius: 9, padding: 3 }}>
              {TABS.map((t, i) => (
                <button key={i} onClick={() => setActiveTab(i)}
                  style={{
                    padding: '5px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                    fontSize: '0.75rem', fontWeight: 600, transition: 'all 150ms',
                    background: activeTab === i ? 'white' : 'transparent',
                    color:      activeTab === i ? '#7c3aed' : '#9ca3af',
                    boxShadow:  activeTab === i ? '0 1px 4px rgba(168,85,247,0.15)' : 'none',
                  }}
                >{t}</button>
              ))}
            </div>

            <button onClick={onClose}
              style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.06)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <X size={16} />
            </button>
          </div>

          {/* tab content */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {activeTab === 0
              ? <Tab2
                  tierOptions={tierOptions}
                  typeOptions={typeOptions}
                  onViewCustomer={handleViewCustomer}
                />
              : <Tab1
                  key={tab1Key}
                  initialCustomer={jumpToCustomer}
                  tierOptions={tierOptions}
                  typeOptions={typeOptions}
                  loyaltySettings={loyaltySettings}
                  shippingOptions={shippingOptions}
                />
            }
          </div>

        </div>
      </div>
    </>
  );
}