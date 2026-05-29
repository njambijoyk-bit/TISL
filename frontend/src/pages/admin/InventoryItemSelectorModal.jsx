import { useState, useEffect, useCallback, useRef } from "react";
import inventoryAPI from "../../api/inventory";

const C = {
  cyan:      "#00E5FF",
  green:     "#00FF88",
  amber:     "#FFB300",
  red:       "#FF3D57",
  purple:    "#BF5AF2",
  dim:       "rgba(0,229,255,0.08)",
  dimHov:    "rgba(0,229,255,0.14)",
  border:    "rgba(0,229,255,0.18)",
};
const mono = "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace";

const TYPE_COLOR = {
  asset:      { bg: "rgba(0,229,255,0.12)",  border: "#00E5FF", text: "#00E5FF" },
  stock:      { bg: "rgba(0,255,136,0.12)",  border: "#00FF88", text: "#00FF88" },
  consumable: { bg: "rgba(255,179,0,0.12)",  border: "#FFB300", text: "#FFB300" },
  loanable:   { bg: "rgba(10,132,255,0.12)", border: "#0A84FF", text: "#0A84FF" },
};

function TypeChip({ type }) {
  const s = TYPE_COLOR[type] || { bg: "rgba(130,130,130,0.12)", border: "#888", text: "#888" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: 4,
      background: s.bg, border: `1px solid ${s.border}`,
      color: s.text, fontSize: 10, fontFamily: mono, fontWeight: 600,
      letterSpacing: "0.06em", textTransform: "uppercase",
    }}>
      {type}
    </span>
  );
}

/**
 * InventoryItemSelectorModal
 *
 * Props:
 *   onSelect(item)  — called with the full item object on selection
 *   onClose()       — called on cancel / backdrop click
 *   filter          — optional object passed to API (e.g. { type: 'asset', is_active: 1 })
 *   title           — optional modal title override
 */
export default function InventoryItemSelectorModal({ onSelect, onClose, filter = {}, title = "Select Item" }) {
  const [search, setSearch]   = useState("");
  const [items, setItems]     = useState([]);
  const [meta, setMeta]       = useState(null);
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(false);
  const [hov, setHov]         = useState(null);
  const debounceRef           = useRef(null);

  const load = useCallback(async (q, p, replace = true) => {
    setLoading(true);
    try {
      const res = await inventoryAPI.items.index({
        search: q, page: p, per_page: 55, ...filter,
        });
        const data = res.data ?? [];
        const m    = res.meta ?? null;
      setItems(prev => replace ? data : [...prev, ...data]);
      setMeta(m);
    } catch {
      // silently fail — parent toast handles global errors
    } finally {
      setLoading(false);
    }
  }, [filter]);

  // debounce search
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

  const remaining = meta ? meta.total - items.length : 0;
  const hasMore   = remaining > 0;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1100,
        background: "rgba(0,0,0,0.8)", display: "flex",
        alignItems: "center", justifyContent: "center",
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        width: 600, maxWidth: "92vw", maxHeight: "80vh",
        display: "flex", flexDirection: "column",
        background: "#0a0a0a", border: `1px solid ${C.border}`,
        borderRadius: 10,
      }}>
        {/* Header */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "18px 24px", borderBottom: `1px solid ${C.border}`, flexShrink: 0,
        }}>
          <span style={{ fontFamily: mono, fontSize: 11, color: C.cyan, letterSpacing: "0.1em", textTransform: "uppercase" }}>
            ◈ {title}
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 18, padding: 4 }}>✕</button>
        </div>

        {/* Search */}
        <div style={{ padding: "14px 24px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: C.cyan, fontSize: 14, pointerEvents: "none" }}>⌕</span>
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, brand, model, category…"
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
              {meta.total} item{meta.total !== 1 ? "s" : ""} found
              {search && <span> · matching <span style={{ color: C.cyan }}>"{search}"</span></span>}
            </div>
          )}
        </div>

        {/* List */}
        <div style={{ overflowY: "auto", flex: 1 }}>
          {loading && items.length === 0 ? (
            <div style={{ padding: "40px 0", textAlign: "center", fontFamily: mono, fontSize: 12, color: "#555" }}>
              <span style={{ color: C.cyan }}>◈</span> loading...
            </div>
          ) : items.length === 0 ? (
            <div style={{ padding: "40px 0", textAlign: "center", fontFamily: mono, fontSize: 12, color: "#555" }}>
              // no items found
            </div>
          ) : (
            items.map((item, i) => (
              <div
                key={item.id}
                onClick={() => onSelect(item)}
                onMouseEnter={() => setHov(i)}
                onMouseLeave={() => setHov(null)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "12px 24px", cursor: "pointer",
                  borderBottom: `1px solid ${C.border}`,
                  background: hov === i ? C.dimHov : "transparent",
                  transition: "background 0.1s",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                  <span style={{ fontFamily: mono, fontSize: 13, color: "#e0e0e0", fontWeight: 600 }}>
                    {item.name}
                  </span>
                  <span style={{ fontFamily: mono, fontSize: 10, color: "#666" }}>
                    {[item.brand, item.model, item.category?.name].filter(Boolean).join(" · ")}
                    {item.is_serialized && (
                        <span style={{ marginLeft: 6, color: "#FFB300" }}>· serialized</span>
                    )}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0, marginLeft: 16 }}>
                  <span style={{ fontFamily: mono, fontSize: 11, color: C.green }}>
                    {item.available_qty ?? 0} avail
                  </span>
                  <TypeChip type={item.type} />
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
              <span style={{ color: "#555" }}>showing {items.length} of {meta?.total}</span>
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