import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../../api";// adjust to your base axios instance

const C = {
  cyan:      "#00E5FF",
  green:     "#00FF88",
  amber:     "#FFB300",
  red:       "#FF3D57",
  dim:       "rgba(0,229,255,0.08)",
  dimHov:    "rgba(0,229,255,0.14)",
  border:    "rgba(0,229,255,0.18)",
};
const mono = "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace";

function Avatar({ email, size = 32 }) {
  const initials = email?.split("@")[0]?.slice(0, 2)?.toUpperCase() ?? "?";
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: "rgba(0,229,255,0.15)", border: `1px solid ${C.border}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: mono, fontSize: size * 0.35, fontWeight: 700, color: C.cyan,
    }}>
      {initials}
    </div>
  );
}

/**
 * EmployeeSelectorModal
 *
 * Props:
 *   onSelect(employee)  — called with { id, name, email, department?, job_title? }
 *   onClose()
 *   title               — optional override
 */
export default function EmployeeSelectorModal({ onSelect, onClose, title = "Select Employee" }) {
  const [search, setSearch]     = useState("");
  const [employees, setEmployees] = useState([]);
  const [meta, setMeta]         = useState(null);
  const [page, setPage]         = useState(1);
  const [loading, setLoading]   = useState(false);
  const [hov, setHov]           = useState(null);
  const debounceRef             = useRef(null);

  const load = useCallback(async (q, p, replace = true) => {
    setLoading(true);
    try {
      const res = await api.get("/admin/employees", {
        params: { search: q, page: p, per_page: 15 },
      });
      const data = res.data?.data ?? res.data ?? [];
      const m    = res.data?.meta ?? null;
      setEmployees(prev => replace ? data : [...prev, ...data]);
      setMeta(m);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

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

  const remaining = meta ? meta.total - employees.length : 0;
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
        width: 520, maxWidth: "92vw", maxHeight: "80vh",
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
              placeholder="Search by name, email, department…"
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
              {meta.total} employee{meta.total !== 1 ? "s" : ""} found
            </div>
          )}
        </div>

        {/* List */}
        <div style={{ overflowY: "auto", flex: 1 }}>
          {loading && employees.length === 0 ? (
            <div style={{ padding: "40px 0", textAlign: "center", fontFamily: mono, fontSize: 12, color: "#555" }}>
              <span style={{ color: C.cyan }}>◈</span> loading...
            </div>
          ) : employees.length === 0 ? (
            <div style={{ padding: "40px 0", textAlign: "center", fontFamily: mono, fontSize: 12, color: "#555" }}>
              // no employees found
            </div>
          ) : (
            employees.map((emp, i) => (
              <div
                key={emp.id}
                onClick={() => onSelect(emp)}
                onMouseEnter={() => setHov(i)}
                onMouseLeave={() => setHov(null)}
                style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "12px 24px", cursor: "pointer",
                  borderBottom: `1px solid ${C.border}`,
                  background: hov === i ? C.dimHov : "transparent",
                  transition: "background 0.1s",
                }}
              >
                <Avatar name={emp.work_email} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: mono, fontSize: 13, color: "#e0e0e0", fontWeight: 600 }}>
                    {emp.work_email}
                  </div>
                  <div style={{ fontFamily: mono, fontSize: 10, color: "#666", marginTop: 2 }}>
                    {[emp.email, emp.department, emp.job_title].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <span style={{
                  fontFamily: mono, fontSize: 10, color: "#444",
                  flexShrink: 0, letterSpacing: "0.04em",
                }}>
                  #{emp.id}
                </span>
              </div>
            ))
          )}

          {hasMore && (
            <div style={{
              padding: "12px 24px", borderTop: `1px solid ${C.border}`,
              display: "flex", alignItems: "center", justifyContent: "space-between",
              fontFamily: mono, fontSize: 11,
            }}>
              <span style={{ color: "#555" }}>showing {employees.length} of {meta?.total}</span>
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