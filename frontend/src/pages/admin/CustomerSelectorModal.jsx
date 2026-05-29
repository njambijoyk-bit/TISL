import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../../api";// same base axios instance as EmployeeSelectorModal

// ─── DESIGN TOKENS (mirrors EmployeeSelectorModal / InventoryItemSelectorModal) ─
const C = {
  cyan:   "#00E5FF",
  green:  "#00FF88",
  amber:  "#FFB300",
  red:    "#FF3D57",
  purple: "#BF5AF2",
  blue:   "#0A84FF",
  dim:    "rgba(0,229,255,0.08)",
  dimHov: "rgba(0,229,255,0.14)",
  border: "rgba(0,229,255,0.18)",
};
const mono = "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace";

// ─── TIER CONFIG ──────────────────────────────────────────────────────────────
const TIER = {
  bronze:   { color: "#cd7f32", bg: "rgba(205,127,50,0.12)",  border: "rgba(205,127,50,0.4)"  },
  silver:   { color: "#a0a0b0", bg: "rgba(160,160,176,0.12)", border: "rgba(160,160,176,0.4)" },
  gold:     { color: "#FFB300", bg: "rgba(255,179,0,0.12)",   border: "rgba(255,179,0,0.4)"   },
  platinum: { color: "#00E5FF", bg: "rgba(0,229,255,0.12)",   border: "rgba(0,229,255,0.4)"   },
  vip:      { color: "#BF5AF2", bg: "rgba(191,90,242,0.12)",  border: "rgba(191,90,242,0.4)"  },
};

// ─── STATUS CONFIG ────────────────────────────────────────────────────────────
const STATUS = {
  active:      { color: "#00FF88", dot: "#00FF88" },
  inactive:    { color: "#666",    dot: "#555"    },
  suspended:   { color: "#FFB300", dot: "#FFB300" },
  blacklisted: { color: "#FF3D57", dot: "#FF3D57" },
};

// ─── SUB-COMPONENTS ───────────────────────────────────────────────────────────

function Avatar({ firstName, lastName, size = 34 }) {
  const initials = [firstName?.[0], lastName?.[0]]
    .filter(Boolean).join("").toUpperCase() || "?";
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: "rgba(0,229,255,0.12)", border: `1px solid ${C.border}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: mono, fontSize: size * 0.33, fontWeight: 700, color: C.cyan,
    }}>
      {initials}
    </div>
  );
}

function TierBadge({ tier }) {
  const t = TIER[tier?.toLowerCase()] ?? TIER.bronze;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "1px 7px", borderRadius: 3,
      background: t.bg, border: `1px solid ${t.border}`,
      color: t.color, fontSize: 9, fontFamily: mono, fontWeight: 700,
      letterSpacing: "0.08em", textTransform: "uppercase",
    }}>
      {tier ?? "bronze"}
    </span>
  );
}

function StatusDot({ status }) {
  const s = STATUS[status?.toLowerCase()] ?? STATUS.inactive;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: s.dot, flexShrink: 0 }} />
      <span style={{ fontFamily: mono, fontSize: 9, color: s.color, letterSpacing: "0.06em", textTransform: "uppercase" }}>
        {status}
      </span>
    </span>
  );
}

function TypeTag({ type }) {
  const color = type === "business" ? C.blue : C.purple;
  return (
    <span style={{
      fontFamily: mono, fontSize: 9, color,
      letterSpacing: "0.06em", textTransform: "uppercase",
    }}>
      {type === "business" ? "BIZ" : "IND"}
    </span>
  );
}

// ─── MAIN MODAL ───────────────────────────────────────────────────────────────

/**
 * CustomerSelectorModal
 *
 * Props:
 *   onSelect(customer)  — called with the full customer object on selection
 *   onClose()           — called on cancel / backdrop click
 *   title               — optional modal title override
 *   filter              — optional extra params passed to API (e.g. { status: 'active' })
 */
export default function CustomerSelectorModal({
  onSelect,
  onClose,
  title = "Select Customer",
  filter = {},
}) {
  const [search, setSearch]       = useState("");
  const [customers, setCustomers] = useState([]);
  const [meta, setMeta]           = useState(null);
  const [page, setPage]           = useState(1);
  const [loading, setLoading]     = useState(false);
  const [hov, setHov]             = useState(null);
  const debounceRef               = useRef(null);

  const load = useCallback(async (q, p, replace = true) => {
    setLoading(true);
    try {
      const res = await api.get("/admin/customers", {
        params: { search: q, page: p, per_page: 15, ...filter },
      });
      const data = res.data?.data ?? res.data ?? [];
      const m    = res.data?.meta ?? null;
      setCustomers(prev => replace ? data : [...prev, ...data]);
      setMeta(m);
    } catch {
      // silent — parent toast handles global errors
    } finally {
      setLoading(false);
    }
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      load(search, 1, true);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [search, load]);

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    load(search, next, false);
  };

  const remaining = meta ? meta.total - customers.length : 0;
  const hasMore   = remaining > 0;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1100,
        background: "rgba(0,0,0,0.82)", display: "flex",
        alignItems: "center", justifyContent: "center",
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        width: 580, maxWidth: "92vw", maxHeight: "80vh",
        display: "flex", flexDirection: "column",
        background: "#0a0a0a", border: `1px solid ${C.border}`,
        borderRadius: 10,
      }}>

        {/* ── Header ── */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "18px 24px", borderBottom: `1px solid ${C.border}`, flexShrink: 0,
        }}>
          <span style={{
            fontFamily: mono, fontSize: 11, color: C.cyan,
            letterSpacing: "0.1em", textTransform: "uppercase",
          }}>
            ◈ {title}
          </span>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 18, padding: 4 }}
          >✕</button>
        </div>

        {/* ── Search ── */}
        <div style={{ padding: "14px 24px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <div style={{ position: "relative" }}>
            <span style={{
              position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
              color: C.cyan, fontSize: 14, pointerEvents: "none",
            }}>⌕</span>
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, email, phone, company, customer #…"
              style={{
                width: "100%", padding: "8px 12px 8px 34px",
                background: C.dim, border: `1px solid ${C.border}`,
                borderRadius: 6, color: "#fff", fontFamily: mono, fontSize: 12,
                outline: "none", boxSizing: "border-box",
              }}
            />
          </div>
          {meta && (
            <div style={{ marginTop: 8, fontFamily: mono, fontSize: 10, color: "#555" }}>
              {meta.total} customer{meta.total !== 1 ? "s" : ""} found
              {search && (
                <span> · matching <span style={{ color: C.cyan }}>"{search}"</span></span>
              )}
            </div>
          )}
        </div>

        {/* ── List ── */}
        <div style={{ overflowY: "auto", flex: 1 }}>
          {loading && customers.length === 0 ? (
            <div style={{ padding: "40px 0", textAlign: "center", fontFamily: mono, fontSize: 12, color: "#555" }}>
              <span style={{ color: C.cyan }}>◈</span> loading...
            </div>
          ) : customers.length === 0 ? (
            <div style={{ padding: "40px 0", textAlign: "center", fontFamily: mono, fontSize: 12, color: "#555" }}>
              // no customers found
            </div>
          ) : (
            customers.map((c, i) => (
              <div
                key={c.id}
                onClick={() => onSelect(c)}
                onMouseEnter={() => setHov(i)}
                onMouseLeave={() => setHov(null)}
                style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "11px 24px", cursor: "pointer",
                  borderBottom: `1px solid ${C.border}`,
                  background: hov === i ? C.dimHov : "transparent",
                  transition: "background 0.1s",
                }}
              >
                {/* Avatar */}
                <Avatar firstName={c.first_name} lastName={c.last_name} />

                {/* Main info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: mono, fontSize: 13, color: "#e0e0e0", fontWeight: 600 }}>
                      {c.first_name} {c.last_name}
                    </span>
                    <TierBadge tier={c.tier} />
                    {c.customer_type && <TypeTag type={c.customer_type} />}
                    {c.is_verified === 1 && (
                      <span style={{ fontSize: 10, color: C.cyan, fontFamily: mono }} title="Verified">✦</span>
                    )}
                  </div>

                  <div style={{ fontFamily: mono, fontSize: 10, color: "#666", marginTop: 3 }}>
                    {[c.email, c.phone, c.company_name].filter(Boolean).join(" · ")}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
                    <StatusDot status={c.status} />
                    {c.customer_number && (
                      <span style={{ fontFamily: mono, fontSize: 9, color: "#444" }}>
                        #{c.customer_number}
                      </span>
                    )}
                    {c.total_orders > 0 && (
                      <span style={{ fontFamily: mono, fontSize: 9, color: "#555" }}>
                        {c.total_orders} order{c.total_orders !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right side: credit / spend */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                  {c.has_credit_account ? (
                    <span style={{ fontFamily: mono, fontSize: 10, color: C.amber }}>
                      credit
                    </span>
                  ) : null}
                  {c.total_spent > 0 && (
                    <span style={{ fontFamily: mono, fontSize: 10, color: "#555" }}>
                      {Number(c.total_spent).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} spent
                    </span>
                  )}
                </div>
              </div>
            ))
          )}

          {/* Load more */}
          {hasMore && (
            <div style={{
              padding: "12px 24px", borderTop: `1px solid ${C.border}`,
              display: "flex", alignItems: "center", justifyContent: "space-between",
              fontFamily: mono, fontSize: 11,
            }}>
              <span style={{ color: "#555" }}>
                showing {customers.length} of {meta?.total}
              </span>
              <button
                onClick={loadMore}
                disabled={loading}
                style={{
                  padding: "5px 16px", borderRadius: 6,
                  border: `1px solid ${C.cyan}`, background: "transparent",
                  color: loading ? "#444" : C.cyan,
                  fontFamily: mono, fontSize: 11, fontWeight: 600,
                  letterSpacing: "0.05em", cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                {loading ? "Loading…" : `+ Load More (${remaining})`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}