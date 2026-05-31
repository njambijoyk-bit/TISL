import { useState, useEffect, useCallback, useRef } from "react";
import inventoryAPI from "../../api/inventory";
import SettingsLayout from '../../components/layout/SettingsLayout';
import EmployeeSelectorModal from "./EmployeeSelectorModal";
import CustomerSelectorModal from "./CustomerSelectorModal";
import InventoryItemSelectorModal from "./InventoryItemSelectorModal";

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const C = {
  cyan:      "#00E5FF",
  green:     "#00FF88",
  amber:     "#FFB300",
  red:       "#FF3D57",
  purple:    "#BF5AF2",
  blue:      "#0A84FF",
  dim:       "rgba(0,229,255,0.08)",
  dimHov:    "rgba(0,229,255,0.14)",
  border:    "rgba(0,229,255,0.18)",
  borderHov: "rgba(0,229,255,0.4)",
};
const mono = "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace";
const sans = "'DM Sans', 'Segoe UI', sans-serif";

// ─── STATUS CHIPS ─────────────────────────────────────────────────────────────
const STATUS_COLOR = {
  available:  { bg: "rgba(0,255,136,0.12)",  border: "#00FF88", text: "#00FF88" },
  issued:     { bg: "rgba(0,229,255,0.12)",  border: "#00E5FF", text: "#00E5FF" },
  loaned:     { bg: "rgba(10,132,255,0.12)", border: "#0A84FF", text: "#0A84FF" },
  in_repair:  { bg: "rgba(255,179,0,0.12)",  border: "#FFB300", text: "#FFB300" },
  retired:    { bg: "rgba(130,130,130,0.12)",border: "#888",    text: "#888" },
  lost:       { bg: "rgba(255,61,87,0.12)",  border: "#FF3D57", text: "#FF3D57" },
  disposed:   { bg: "rgba(255,61,87,0.12)",  border: "#FF3D57", text: "#FF3D57" },
  damaged:    { bg: "rgba(255,179,0,0.12)",  border: "#FFB300", text: "#FFB300" },
  active:     { bg: "rgba(0,255,136,0.12)",  border: "#00FF88", text: "#00FF88" },
  returned:   { bg: "rgba(130,130,130,0.12)",border: "#888",    text: "#888" },
  overdue:    { bg: "rgba(255,61,87,0.12)",  border: "#FF3D57", text: "#FF3D57" },
  reported:   { bg: "rgba(255,179,0,0.12)",  border: "#FFB300", text: "#FFB300" },
  completed:  { bg: "rgba(0,255,136,0.12)",  border: "#00FF88", text: "#00FF88" },
  sent:       { bg: "rgba(10,132,255,0.12)", border: "#0A84FF", text: "#0A84FF" },
  unrepairable:{ bg:"rgba(255,61,87,0.12)", border: "#FF3D57", text: "#FF3D57" },
  open:       { bg: "rgba(255,179,0,0.12)",  border: "#FFB300", text: "#FFB300" },
  resolved:   { bg: "rgba(0,255,136,0.12)",  border: "#00FF88", text: "#00FF88" },
  dismissed:  { bg: "rgba(130,130,130,0.12)",border: "#888",    text: "#888" },
  draft:      { bg: "rgba(130,130,130,0.12)",border: "#888",    text: "#888" },
  finalised:  { bg: "rgba(0,255,136,0.12)",  border: "#00FF88", text: "#00FF88" },
  obsolete:   { bg: "rgba(130,130,130,0.12)",border: "#888",    text: "#888" },
};

function Chip({ label }) {
  const s = STATUS_COLOR[label?.toLowerCase()] || { bg: "rgba(130,130,130,0.12)", border: "#888", text: "#888" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "2px 10px", borderRadius: 4,
      background: s.bg, border: `1px solid ${s.border}`,
      color: s.text, fontSize: 11, fontFamily: mono, fontWeight: 600,
      letterSpacing: "0.06em", textTransform: "uppercase",
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: s.text, flexShrink: 0 }} />
      {label}
    </span>
  );
}

// ─── SHARED COMPONENTS ────────────────────────────────────────────────────────
function Panel({ children, style }) {
  return (
    <div style={{
      border: `1px solid ${C.border}`, borderRadius: 8,
      background: C.dim, padding: "20px 24px", ...style,
    }}>
      {children}
    </div>
  );
}

function ActionBtn({ children, color = C.cyan, onClick, outline, small, disabled }) {
  const [hov, setHov] = useState(false);
  const bg = outline ? (hov ? `${color}22` : "transparent") : (hov ? color + "dd" : color);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      disabled={disabled}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: small ? "5px 14px" : "8px 20px",
        border: `1px solid ${disabled ? "#444" : color}`,
        borderRadius: 6, background: disabled ? "transparent" : bg,
        color: disabled ? "#444" : (outline ? color : "#000"),
        fontFamily: mono, fontSize: small ? 11 : 12, fontWeight: 600,
        letterSpacing: "0.05em", cursor: disabled ? "not-allowed" : "pointer",
        transition: "all 0.15s", whiteSpace: "nowrap", opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

function SelectorTrigger({ label, filled, onOpen, onClear }) {
  const [hov, setHov] = useState(false);
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <button
        onClick={onOpen}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          flex: 1, padding: "8px 14px", textAlign: "left",
          background: hov ? C.dimHov : C.dim,
          border: `1px solid ${filled ? C.cyan : C.border}`,
          borderRadius: 6, color: filled ? "#e0e0e0" : "#555",
          fontFamily: mono, fontSize: 12, cursor: "pointer",
          transition: "all 0.15s",
        }}
      >
        {label}
      </button>
      {filled && (
        <button
          onClick={onClear}
          style={{
            background: "none", border: `1px solid ${C.border}`,
            borderRadius: 6, color: "#555", cursor: "pointer",
            fontFamily: mono, fontSize: 13, padding: "6px 10px",
            lineHeight: 1,
          }}
        >✕</button>
      )}
    </div>
  );
}

function SearchBar({ value, onChange, placeholder }) {
  return (
    <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
      <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: C.cyan, fontSize: 14, pointerEvents: "none" }}>⌕</span>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder || "Search..."}
        style={{
          width: "100%", padding: "8px 12px 8px 34px",
          background: C.dim, border: `1px solid ${C.border}`,
          borderRadius: 6, color: "inherit", fontFamily: mono, fontSize: 12,
          outline: "none", boxSizing: "border-box",
        }}
      />
    </div>
  );
}

function Select({ value, onChange, options, style }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        padding: "8px 12px", background: C.dim, border: `1px solid ${C.border}`,
        borderRadius: 6, color: "inherit", fontFamily: mono, fontSize: 12,
        cursor: "pointer", outline: "none", ...style,
      }}
    >
      {options.map(o => (
        <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>
      ))}
    </select>
  );
}

function Table({ cols, rows, onRowClick, loading }) {
  const [hov, setHov] = useState(null);
  if (loading) return (
    <div style={{ padding: "48px 0", textAlign: "center", fontFamily: mono, fontSize: 12, color: "#555" }}>
      <span style={{ color: C.cyan }}>◈</span> loading...
    </div>
  );
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: mono, fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border}` }}>
            {cols.map((c, i) => (
              <th key={i} style={{
                padding: "10px 14px", textAlign: "left", color: C.cyan,
                fontWeight: 600, letterSpacing: "0.08em", fontSize: 10,
                textTransform: "uppercase", whiteSpace: "nowrap",
              }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr
              key={row.id ?? ri}
              onClick={() => onRowClick && onRowClick(row)}
              onMouseEnter={() => setHov(ri)}
              onMouseLeave={() => setHov(null)}
              style={{
                borderBottom: `1px solid ${C.border}`,
                background: hov === ri ? C.dimHov : "transparent",
                cursor: onRowClick ? "pointer" : "default",
                transition: "background 0.1s",
              }}
            >
              {cols.map((c, ci) => (
                <td key={ci} style={{ padding: "11px 14px", color: "inherit", whiteSpace: "nowrap" }}>
                  {c.render ? c.render(row[c.key], row) : (row[c.key] ?? <span style={{ color: "#555" }}>—</span>)}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={cols.length} style={{ padding: "32px 14px", textAlign: "center", color: "#555", fontFamily: mono }}>
                // no records found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function InstanceSearchDropdown({ value, label, onSelect, onClear }) {
  const [search, setSearch]       = useState("");
  const [results, setResults]     = useState([]);
  const [loading, setLoading]     = useState(false);
  const [open, setOpen]           = useState(false);
  const ref                       = useRef(null);
  const debounce                  = useRef(null);

  // close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const fetchInstances = useCallback((q) => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await inventoryAPI.instances.index({ search: q, status: "available", per_page: 50 });
        setResults(res.data?.data ?? res.data ?? []);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 300);
  }, []);

  const handleFocus = () => { setOpen(true); fetchInstances(search); };
  const handleChange = (e) => { setSearch(e.target.value); setOpen(true); fetchInstances(e.target.value); };

  const handleSelect = (inst) => {
    onSelect(inst);
    setSearch("");
    setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {value ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{
            flex: 1, padding: "8px 14px",
            background: C.dim, border: `1px solid ${C.cyan}`,
            borderRadius: 6, color: "#e0e0e0", fontFamily: mono, fontSize: 12,
          }}>{label}</div>
          <button onClick={onClear} style={{
            background: "none", border: `1px solid ${C.border}`,
            borderRadius: 6, color: "#555", cursor: "pointer",
            fontFamily: mono, fontSize: 13, padding: "6px 10px", lineHeight: 1,
          }}>✕</button>
        </div>
      ) : (
        <input
          value={search}
          onChange={handleChange}
          onFocus={handleFocus}
          placeholder="Search by asset tag or item name…"
          style={{ ...inputStyle }}
        />
      )}
      {open && !value && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 200,
          background: "#0d0d0d", border: `1px solid ${C.border}`,
          borderRadius: 6, marginTop: 4, maxHeight: 240, overflowY: "auto",
        }}>
          {loading && (
            <div style={{ padding: "12px 14px", fontFamily: mono, fontSize: 11, color: "#555" }}>searching…</div>
          )}
          {!loading && results.length === 0 && (
            <div style={{ padding: "12px 14px", fontFamily: mono, fontSize: 11, color: "#555" }}>// no available instances</div>
          )}
          {results.map(inst => (
            <div
              key={inst.id}
              onClick={() => handleSelect(inst)}
              style={{
                padding: "10px 14px", cursor: "pointer", fontFamily: mono, fontSize: 12,
                borderBottom: `1px solid ${C.border}`,
                transition: "background 0.1s",
              }}
              onMouseEnter={e => e.currentTarget.style.background = C.dimHov}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <span style={{ color: C.cyan }}>{inst.asset_tag ?? `#${inst.id}`}</span>
              <span style={{ color: "#888", marginLeft: 10 }}>{inst.item?.name ?? "—"}</span>
              <span style={{ color: "#555", marginLeft: 10, fontSize: 10 }}>{inst.condition}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GroupSearchDropdown({ value, label, onSelect, onClear }) {
  const [search, setSearch]   = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen]       = useState(false);
  const ref                   = useRef(null);
  const debounce              = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const fetchGroups = useCallback((q) => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await inventoryAPI.groups.index({ search: q, per_page: 50 });
        console.log("groups res:", res);          // see the actual shape
        setResults(res?.data ?? res ?? []);       // fix: unwrap already happened
      } catch(e) {
        console.error("groups fetch error:", e);  // see if it's silently failing
        setResults([]);
      }
      finally { setLoading(false); }
    }, 300);
  }, []);

  const handleFocus  = () => { setOpen(true); fetchGroups(search); };
  const handleChange = (e) => { setSearch(e.target.value); setOpen(true); fetchGroups(e.target.value); };
  const handleSelect = (group) => { onSelect(group); setSearch(""); setOpen(false); };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {value ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ flex: 1, padding: "8px 14px", background: C.dim, border: `1px solid ${C.cyan}`, borderRadius: 6, color: "#e0e0e0", fontFamily: mono, fontSize: 12 }}>{label}</div>
          <button onClick={onClear} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 6, color: "#555", cursor: "pointer", fontFamily: mono, fontSize: 13, padding: "6px 10px", lineHeight: 1 }}>✕</button>
        </div>
      ) : (
        <input value={search} onChange={handleChange} onFocus={handleFocus} placeholder="Search groups…" style={inputStyle} />
      )}
      {open && !value && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 200, background: "#0d0d0d", border: `1px solid ${C.border}`, borderRadius: 6, marginTop: 4, maxHeight: 240, overflowY: "auto" }}>
          {loading && <div style={{ padding: "12px 14px", fontFamily: mono, fontSize: 11, color: "#555" }}>searching…</div>}
          {!loading && results.length === 0 && <div style={{ padding: "12px 14px", fontFamily: mono, fontSize: 11, color: "#555" }}>// no groups found</div>}
          {results.map(g => (
            <div key={g.id} onClick={() => handleSelect(g)}
              style={{ padding: "10px 14px", cursor: "pointer", fontFamily: mono, fontSize: 12, borderBottom: `1px solid ${C.border}`, transition: "background 0.1s" }}
              onMouseEnter={e => e.currentTarget.style.background = C.dimHov}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <span style={{ color: C.cyan }}>{g.name}</span>
              {g.description && <span style={{ color: "#555", marginLeft: 10, fontSize: 11 }}>{g.description}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color = C.cyan, icon, onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        border: `1px solid ${hov && onClick ? color + "88" : color + "33"}`,
        borderRadius: 8, background: `${color}08`,
        padding: "16px 20px", display: "flex", flexDirection: "column", gap: 6,
        cursor: onClick ? "pointer" : "default", transition: "all 0.15s",
      }}
    >
      <span style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color, opacity: 0.8 }}>{icon} {label}</span>
      <span style={{ fontFamily: mono, fontSize: 26, fontWeight: 700, color }}>{value ?? "—"}</span>
    </div>
  );
}

function Breadcrumb({ crumbs, onNavigate }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: mono, fontSize: 12, marginBottom: 20 }}>
      {crumbs.map((c, i) => (
        <span key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {i > 0 && <span style={{ color: C.border, fontSize: 14 }}>›</span>}
          {i < crumbs.length - 1 ? (
            <span
              onClick={() => onNavigate(i)}
              style={{ color: C.cyan, cursor: "pointer", opacity: 0.7, transition: "opacity 0.15s" }}
              onMouseEnter={e => e.target.style.opacity = 1}
              onMouseLeave={e => e.target.style.opacity = 0.7}
            >{c}</span>
          ) : (
            <span style={{ color: "inherit" }}>{c}</span>
          )}
        </span>
      ))}
    </div>
  );
}

// ─── LOAD MORE BAR (replaces Pagination) ─────────────────────────────────────
function LoadMoreBar({ meta, onLoadMore, onLoadAll, loading }) {
  if (!meta || meta.current_page >= meta.last_page) return null;
  const remaining = meta.total - meta.current_page * meta.per_page;

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "12px 14px", borderTop: `1px solid ${C.border}`,
      fontFamily: mono, fontSize: 11,
    }}>
      <span style={{ color: "#555" }}>
        showing {meta.current_page * meta.per_page} of {meta.total}
        {remaining > 0 && <span style={{ color: "#444" }}> · {remaining} more</span>}
      </span>
      <div style={{ display: "flex", gap: 8 }}>
        <ActionBtn small outline color={C.cyan} onClick={onLoadMore} disabled={loading}>
          {loading ? "Loading…" : `+ Load More (${Math.min(meta.per_page, remaining)})`}
        </ActionBtn>
        <ActionBtn small outline color={C.amber} onClick={onLoadAll} disabled={loading}>
          {loading ? "Loading…" : `⬇ Load All (${remaining} remaining)`}
        </ActionBtn>
      </div>
    </div>
  );
}

// ─── TOAST ────────────────────────────────────────────────────────────────────
function Toast({ message, type = "success", onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);
  const color = type === "error" ? C.red : type === "warning" ? C.amber : C.green;
  return (
    <div style={{
      position: "relative",
      background: "#0d0d0d", border: `1px solid ${color}`,
      borderRadius: 8, padding: "12px 40px 12px 20px",
      fontFamily: mono, fontSize: 12, color,
      boxShadow: `0 0 24px ${color}33`,
      display: "flex", alignItems: "center", gap: 10,
      animation: "slideUp 0.2s ease", minWidth: 260,
    }}>
      <span>{type === "error" ? "✕" : type === "warning" ? "⚠" : "✓"}</span>
      {message}
      <button
        onClick={onClose}
        style={{
          position: "absolute", top: 8, right: 10,
          background: "none", border: "none",
          color, opacity: 0.6, cursor: "pointer",
          fontSize: 14, fontFamily: mono, lineHeight: 1,
          padding: "2px 4px", transition: "opacity 0.15s",
        }}
        onMouseEnter={e => e.target.style.opacity = 1}
        onMouseLeave={e => e.target.style.opacity = 0.6}
      >✕</button>
    </div>
  );
}

// ─── MODAL ────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, width = 480 }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.75)", display: "flex",
      alignItems: "center", justifyContent: "center",
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        width, maxWidth: "90vw", maxHeight: "85vh", overflowY: "auto",
        background: "#0a0a0a", border: `1px solid ${C.border}`,
        borderRadius: 10, padding: "24px 28px",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <span style={{ fontFamily: mono, fontSize: 12, color: C.cyan, letterSpacing: "0.08em", textTransform: "uppercase" }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 18, padding: 4 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children, error }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontFamily: mono, fontSize: 10, color: "#888", display: "block", marginBottom: 6, letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</label>
      {children}
      {error && <span style={{ fontFamily: mono, fontSize: 10, color: C.red, display: "block", marginTop: 4 }}>{error}</span>}
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "8px 12px", background: "rgba(0,229,255,0.06)",
  border: `1px solid ${C.border}`, borderRadius: 6, color: "#fff",
  fontFamily: mono, fontSize: 12, outline: "none", boxSizing: "border-box",
};

const selectStyle = { ...inputStyle, cursor: "pointer" };

// ─── HOOK: useToast ───────────────────────────────────────────────────────────
function useToast() {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, message, type }]);
  }, []);
  const remove = useCallback((id) => setToasts(t => t.filter(x => x.id !== id)), []);
  const ToastContainer = useCallback(() => (
    <div style={{ position: "fixed", bottom: 28, right: 28, zIndex: 9999, display: "flex", flexDirection: "column", gap: 10 }}>
      {toasts.map(t => <Toast key={t.id} message={t.message} type={t.type} onClose={() => remove(t.id)} />)}
    </div>
  ), [toasts, remove]);
  return { push, ToastContainer };
}

// ─── MOVEMENT COLORS ─────────────────────────────────────────────────────────
const MOVEMENT_COLOR = {
  procured: C.green, issued: C.cyan, loaned: C.blue,
  returned: "#888", loan_returned: "#888", repair_out: C.amber,
  repair_in: C.green, condition_updated: C.purple, status_changed: C.amber,
  written_off: C.red, disposed: C.red, declared_obsolete: "#888",
};

// ═══════════════════════════════════════════════════════════════════════════════
// MODAL FORMS
// ═══════════════════════════════════════════════════════════════════════════════

function IssueModal({ instance, mode = "issue", onClose, onSuccess, toast }) {
  const [form, setForm] = useState({
    instance_id: instance?.id ?? "",
    item_id: instance?.item_id ?? "",
    item_label: instance ? `${instance.item?.name ?? "Item"} — ${instance.asset_tag ?? `#${instance.id}`}` : "",
    assignee_type: "employee",
    assignee_id: "",
    assignee_label: "",
    notes: "",
    due_date: "",
    expected_return_date: "",
    quantity: 1,
  });
  const [saving, setSaving] = useState(false);
  const [itemPicker, setItemPicker]         = useState(false);
  const [assigneePicker, setAssigneePicker] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const [useInstance, setUseInstance] = useState(!!instance || mode === "loan"); 

  const handleSelectItem = (item) => {
    if (item.is_serialized) {
      toast("This item is serialized — please select a specific instance instead", "error");
      setItemPicker(false);
      return;
    }
    set("item_id", item.id);
    set("item_label", item.name);
    setItemPicker(false);
  };

  const handleSelectAssignee = (person) => {
    if (form.assignee_type === "employee") {
      set("assignee_id", person.id);
      set("assignee_label", person.work_email); 
    } else {
      set("assignee_id", person.id);
      set("assignee_label", `${person.first_name} ${person.last_name}`.trim());
    }
    setAssigneePicker(false);
  };

  const submit = async () => {
    setSaving(true);
    try {
      const instanceId = form.instance_id ? parseInt(form.instance_id, 10) : undefined;
      const itemId = form.item_id ? parseInt(form.item_id, 10) : undefined;

      if (mode === "loan") {
        if (!form.instance_id) {
          toast("Loans require a specific instance (serialized item)", "error");
          setSaving(false);
          return;
        }
        if (!form.expected_return_date) {
          toast("Loans require an expected return date", "error");
          setSaving(false);
          return;
        }
      }

      if (mode === "department") {
        await inventoryAPI.assignments.department({
          subject_type: instanceId ? "instance" : "item",
          subject_id: instanceId ?? itemId,
          department: form.assignee_label,
          quantity: instanceId ? undefined : form.quantity,
        });
      } else if (mode === "group") {
        await inventoryAPI.assignments.group({
          subject_type: instanceId ? "instance" : "item",
          subject_id: instanceId ?? itemId,
          group_id: form.assignee_id ? parseInt(form.assignee_id, 10) : undefined,
          quantity: instanceId ? undefined : form.quantity,
        });
      } else {
        if (form.assignee_type === "group" && mode !== "loan") {
          await inventoryAPI.assignments.group({
            subject_type: instanceId ? "instance" : "item",
            subject_id: instanceId ?? itemId,
            group_id: form.assignee_id ? parseInt(form.assignee_id, 10) : undefined,
            quantity: instanceId ? undefined : form.quantity,
          });
          toast("group assignment created", "success");
          onSuccess();
          onClose();
          return;
        }
        if (form.assignee_type === "department" && mode !== "loan") {
          await inventoryAPI.assignments.department({
            subject_type: instanceId ? "instance" : "item",
            subject_id: instanceId ?? itemId,
            department: form.assignee_label,
            quantity: instanceId ? undefined : form.quantity,
          });
          toast("department assignment created", "success");
          onSuccess();
          onClose();
          return;
        }
        const payload = {
          ...(instanceId ? { instance_id: instanceId } : { item_id: itemId, quantity: form.quantity }),
          assignee_type: form.assignee_type,
          assignee_id: form.assignee_id ? parseInt(form.assignee_id, 10) : undefined,
          assignee_label: form.assignee_label,
          issue_notes: form.notes || undefined,
        };

        if (mode === "loan") payload.expected_return_date = form.expected_return_date;
        if (mode === "issue" && form.due_date) payload.expected_return_date = form.due_date;

        await (mode === "issue"
          ? inventoryAPI.assignments.issue(payload)
          : inventoryAPI.assignments.loan(payload));
      }

      toast(`${mode} assignment created`, "success");
      onSuccess();
      onClose();
    } catch (e) {
      toast(e?.response?.data?.message ?? "Failed to create assignment", "error");
    } finally { setSaving(false); }
  };

  const showAssigneePicker = form.assignee_type === "employee" || form.assignee_type === "customer";
  const showGroupPicker    = form.assignee_type === "group";

  return (
    <>
      <Modal title={`// ${mode} item`} onClose={onClose}>
        {!instance && (
        <>
          {/* Toggle — only show for issue mode, loan always needs instance */}
          {mode === "issue" && (
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <ActionBtn
                small
                color={C.cyan}
                outline={!useInstance}
                onClick={() => {
                  setUseInstance(true);
                  set("item_id", ""); set("instance_id", ""); set("item_label", "");
                }}
              >
                Serialized (Instance)
              </ActionBtn>
              <ActionBtn
                small
                color={C.cyan}
                outline={useInstance}
                onClick={() => {
                  setUseInstance(false);
                  set("item_id", ""); set("instance_id", ""); set("item_label", "");
                }}
              >
                Non-Serialized (Item)
              </ActionBtn>
            </div>
          )}

          <Field label={useInstance ? "Instance (Asset)" : "Item"}>
            {useInstance ? (
              <InstanceSearchDropdown
                value={form.instance_id}
                label={form.item_label}
                onSelect={(inst) => {
                  set("instance_id", inst.id);
                  set("item_id", inst.item_id);
                  set("item_label", `${inst.item?.name ?? "Item"} — ${inst.asset_tag ?? `#${inst.id}`}`);
                }}
                onClear={() => { set("instance_id", ""); set("item_id", ""); set("item_label", ""); }}
              />
            ) : (
              <SelectorTrigger
                label={form.item_label || "Select item…"}
                filled={!!form.item_id}
                onOpen={() => setItemPicker(true)}
                onClear={() => { set("item_id", ""); set("item_label", ""); }}
              />
            )}
          </Field>

          {!useInstance && (
            <Field label="Quantity">
              <input
                style={inputStyle}
                type="number"
                min="1"
                value={form.quantity}
                onChange={e => set("quantity", parseInt(e.target.value, 10))}
              />
            </Field>
          )}
        </>
      )}
        <Field label="Assignee Type">
          <select style={selectStyle} value={form.assignee_type} onChange={e => {
            set("assignee_type", e.target.value);
            set("assignee_id", "");
            set("assignee_label", "");
          }}>
            {["employee", "customer", "department", "group"].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Assignee">
          {showAssigneePicker ? (
            <SelectorTrigger
              label={form.assignee_label || `Select ${form.assignee_type}…`}
              filled={!!form.assignee_id}
              onOpen={() => setAssigneePicker(true)}
              onClear={() => { set("assignee_id", ""); set("assignee_label", ""); }}
            />
          ) : showGroupPicker ? (
            <GroupSearchDropdown
              value={form.assignee_id}
              label={form.assignee_label}
              onSelect={(g) => { set("assignee_id", g.id); set("assignee_label", g.name); }}
              onClear={() => { set("assignee_id", ""); set("assignee_label", ""); }}
            />
          ) : (
            <input style={inputStyle} value={form.assignee_label} onChange={e => set("assignee_label", e.target.value)} placeholder="Department name" />
          )}
        </Field>
        {mode === "loan" && (
          <Field label="Expected Return Date">
            <input style={inputStyle} type="date" value={form.expected_return_date} onChange={e => set("expected_return_date", e.target.value)} />
          </Field>
        )}
        {mode === "issue" && (
          <Field label="Due Date (optional)">
            <input style={inputStyle} type="date" value={form.due_date} onChange={e => set("due_date", e.target.value)} />
          </Field>
        )}
        <Field label="Notes (optional)">
          <textarea style={{ ...inputStyle, resize: "vertical", minHeight: 70 }} value={form.notes} onChange={e => set("notes", e.target.value)} />
        </Field>
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <ActionBtn color={C.green} onClick={submit} disabled={saving}>{saving ? "Saving…" : `Confirm ${mode}`}</ActionBtn>
          <ActionBtn color={C.cyan} outline onClick={onClose}>Cancel</ActionBtn>
        </div>
      </Modal>

      {itemPicker && (
        <InventoryItemSelectorModal
          onSelect={handleSelectItem}
          onClose={() => setItemPicker(false)}
          title="Select Item"
        />
      )}
      {assigneePicker && form.assignee_type === "employee" && (
        <EmployeeSelectorModal
          onSelect={handleSelectAssignee}
          onClose={() => setAssigneePicker(false)}
        />
      )}
      {assigneePicker && form.assignee_type === "customer" && (
        <CustomerSelectorModal
          onSelect={handleSelectAssignee}
          onClose={() => setAssigneePicker(false)}
        />
      )}
    </>
  );
}

function ReturnModal({ assignment, onClose, onSuccess, toast }) {
  const [form, setForm] = useState({ condition: "good", notes: "" });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    setSaving(true);
    try {
      await inventoryAPI.assignments.return(parseInt(assignment.id, 10), form);
      toast("Assignment returned", "success");
      onSuccess();
      onClose();
    } catch (e) {
      toast(e?.response?.data?.message ?? "Failed to return", "error");
    } finally { setSaving(false); }
  };

  return (
    <Modal title="// process return" onClose={onClose}>
      <div style={{ fontFamily: mono, fontSize: 12, color: "#888", marginBottom: 20 }}>
        Returning <span style={{ color: C.cyan }}>{assignment?.instance?.asset_tag ?? `Assignment #${assignment?.id}`}</span>
      </div>
      <Field label="Return Condition">
        <select style={selectStyle} value={form.condition} onChange={e => set("condition", e.target.value)}>
          {["new", "excellent", "good", "fair", "poor", "damaged", "unusable"].map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </Field>
      <Field label="Notes (optional)">
        <textarea style={{ ...inputStyle, resize: "vertical", minHeight: 70 }} value={form.notes} onChange={e => set("notes", e.target.value)} />
      </Field>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <ActionBtn color={C.green} onClick={submit} disabled={saving}>{saving ? "Saving…" : "Confirm Return"}</ActionBtn>
        <ActionBtn color={C.cyan} outline onClick={onClose}>Cancel</ActionBtn>
      </div>
    </Modal>
  );
}

function MoveModal({ instance, locations, onClose, onSuccess, toast }) {
  const [form, setForm] = useState({ to_location_id: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    setSaving(true);
    try {
      await inventoryAPI.instances.move(instance.id, {
        ...form,
        to_location_id: form.to_location_id ? parseInt(form.to_location_id, 10) : undefined,
      });
      toast("Instance moved", "success");
      onSuccess();
      onClose();
    } catch (e) {
      toast(e?.response?.data?.message ?? "Failed to move", "error");
    } finally { setSaving(false); }
  };

  return (
    <Modal title="// move location" onClose={onClose}>
      <Field label="New Location">
        <select value={form.to_location_id} onChange={e => set("to_location_id", e.target.value)}>
          <option value="">Select location…</option>
          {(locations ?? []).map(l => <option key={l.id} value={l.id}>{l.name} ({l.code})</option>)}
        </select>
      </Field>
      <Field label="Notes (optional)">
        <textarea style={{ ...inputStyle, resize: "vertical", minHeight: 70 }} value={form.notes} onChange={e => set("notes", e.target.value)} />
      </Field>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <ActionBtn color={C.amber} onClick={submit} disabled={saving}>{saving ? "Moving…" : "Confirm Move"}</ActionBtn>
        <ActionBtn color={C.cyan} outline onClick={onClose}>Cancel</ActionBtn>
      </div>
    </Modal>
  );
}

function WriteOffModal({ instance, mode = "write-off", onClose, onSuccess, toast }) {
  const [form, setForm] = useState({ reason: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    setSaving(true);
    try {
      if (mode === "write-off") await inventoryAPI.instances.writeOff(instance.id, form);
      else if (mode === "dispose") await inventoryAPI.instances.dispose(instance.id, form);
      else if (mode === "obsolete") await inventoryAPI.instances.declareObsolete(instance.id, form);
      toast(`Instance ${mode === "write-off" ? "written off" : mode === "dispose" ? "disposed" : "declared obsolete"}`, "success");
      onSuccess();
      onClose();
    } catch (e) {
      toast(e?.response?.data?.message ?? "Action failed", "error");
    } finally { setSaving(false); }
  };

  const color = mode === "write-off" || mode === "dispose" ? C.red : C.purple;
  const label = mode === "write-off" ? "Write Off" : mode === "dispose" ? "Dispose" : "Declare Obsolete";

  return (
    <Modal title={`// ${label.toLowerCase()}`} onClose={onClose}>
      <div style={{ fontFamily: mono, fontSize: 12, color: "#888", marginBottom: 20 }}>
        Instance: <span style={{ color: C.cyan }}>{instance?.asset_tag}</span>
      </div>
      <Field label="Reason">
        <input style={inputStyle} value={form.reason} onChange={e => set("reason", e.target.value)} placeholder="Reason for this action" />
      </Field>
      <Field label="Notes (optional)">
        <textarea style={{ ...inputStyle, resize: "vertical", minHeight: 70 }} value={form.notes} onChange={e => set("notes", e.target.value)} />
      </Field>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <ActionBtn color={color} onClick={submit} disabled={saving}>{saving ? "Saving…" : `Confirm ${label}`}</ActionBtn>
        <ActionBtn color={C.cyan} outline onClick={onClose}>Cancel</ActionBtn>
      </div>
    </Modal>
  );
}

function RepairModal({ instance, onClose, onSuccess, toast }) {
  const [form, setForm] = useState({
    instance_id: instance?.id ?? "",
    instance_label: instance ? `${instance.item?.name ?? "Item"} — ${instance.asset_tag ?? `#${instance.id}`}` : "",
    fault_description: "",
    fault_category: "wear",       // ← required by backend
    issue_description: "",            // ← required by backend
    reported_condition: "damaged",
    vendor: "",
    notes: "",
  });
  const [saving, setSaving]       = useState(false);
  const [itemPicker, setItemPicker] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    setSaving(true);
    try {
      await inventoryAPI.repairs.report({
        instance_id:        form.instance_id ? parseInt(form.instance_id, 10) : undefined,
        fault_category:     form.fault_category,
        issue_description:  form.issue_description,
        fault_description:  form.fault_description,
        reported_condition: form.reported_condition,
        vendor:             form.vendor || undefined,
        notes:              form.notes  || undefined,
      });
      toast("Repair reported", "success");
      onSuccess();
      onClose();
    } catch (e) {
      toast(e?.response?.data?.message ?? "Failed to report repair", "error");
    } finally { setSaving(false); }
  };

  return (
    <>
      <Modal title="// report repair" onClose={onClose}>
        {!instance && (
          <Field label="Instance (Asset)">
            <InstanceSearchDropdown
              value={form.instance_id}
              label={form.instance_label}
              onSelect={(inst) => {
                set("instance_id", inst.id);
                set("instance_label", `${inst.item?.name ?? "Item"} — ${inst.asset_tag ?? `#${inst.id}`}`);
              }}
              onClear={() => { set("instance_id", ""); set("instance_label", ""); }}
            />
          </Field>
        )}
        <Field label="Fault Category">
          <select style={selectStyle} value={form.fault_category} onChange={e => set("fault_category", e.target.value)}>
            {["electrical", "mechanical", "physical", "software", "wear", "cosmetic"].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Issue Description">
          <textarea style={{ ...inputStyle, resize: "vertical", minHeight: 60 }} value={form.issue_description} onChange={e => set("issue_description", e.target.value)} placeholder="Detailed issue description…" />
        </Field>
        <Field label="Fault Description">
          <textarea style={{ ...inputStyle, resize: "vertical", minHeight: 80 }} value={form.fault_description} onChange={e => set("fault_description", e.target.value)} placeholder="Describe the fault or damage…" />
        </Field>
        <Field label="Reported Condition">
          <select style={selectStyle} value={form.reported_condition} onChange={e => set("reported_condition", e.target.value)}>
            {["fair", "poor", "damaged", "unusable"].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Vendor (optional)">
          <input style={inputStyle} value={form.vendor} onChange={e => set("vendor", e.target.value)} placeholder="Repair vendor name" />
        </Field>
        <Field label="Notes (optional)">
          <textarea style={{ ...inputStyle, resize: "vertical", minHeight: 60 }} value={form.notes} onChange={e => set("notes", e.target.value)} />
        </Field>
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <ActionBtn color={C.amber} onClick={submit} disabled={saving}>{saving ? "Saving…" : "Report Repair"}</ActionBtn>
          <ActionBtn color={C.cyan} outline onClick={onClose}>Cancel</ActionBtn>
        </div>
      </Modal>

      {itemPicker && (
        <InventoryItemSelectorModal
          onSelect={item => { set("item_id", item.id); set("item_label", item.name); setItemPicker(false); }}
          onClose={() => setItemPicker(false)}
          title="Select Item"
        />
      )}
    </>
  );
}

function DisputeModal({ assignments, onClose, onSuccess, toast }) {
  const [form, setForm] = useState({
    assignment_id: "",
    item_id: "",
    dispute_type: "damage",
    description: "",
    evidence_notes: "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const [assignmentSearch, setAssignmentSearch] = useState("");

  const filteredAssignments = (assignments ?? []).filter(a =>
    `#${a.id} ${a.assignee_label} ${a.instance?.asset_tag ?? ""}`.toLowerCase()
      .includes(assignmentSearch.toLowerCase())
  );

  const submit = async () => {
    setSaving(true);
    try {
      await inventoryAPI.disputes.open({
        ...form,
        assignment_id: form.assignment_id ? parseInt(form.assignment_id, 10) : undefined,
        item_id: form.item_id ? parseInt(form.item_id, 10) : undefined,
      });
      toast("Dispute opened", "success");
      onSuccess();
      onClose();
    } catch (e) {
      toast(e?.response?.data?.message ?? "Failed to open dispute", "error");
    } finally { setSaving(false); }
  };

  return (
    <Modal title="// open dispute" onClose={onClose}>
      <Field label="Assignment">
        <select style={selectStyle} value={form.assignment_id} onChange={e => {
          const a = (assignments ?? []).find(x => String(x.id) === e.target.value);
          set("assignment_id", e.target.value);
          if (a) set("item_id", a.item_id ?? "");
        }}>
          <option value="">Select assignment…</option>
          {(assignments ?? []).map(a => <option key={a.id} value={a.id}>#{a.id} — {a.assignee_label}</option>)}
        </select>
      </Field>
      <Field label="Assignment">
        <input
          style={{ ...inputStyle, marginBottom: 6 }}
          value={assignmentSearch}
          onChange={e => setAssignmentSearch(e.target.value)}
          placeholder="Search by ID, assignee, asset tag…"
        />
        <select style={{ ...selectStyle, maxHeight: 160 }} size={4} value={form.assignment_id} onChange={e => {
          const a = filteredAssignments.find(x => String(x.id) === e.target.value);
          set("assignment_id", e.target.value);
          if (a) set("item_id", a.item_id ?? "");
        }}>
          <option value="">Select assignment…</option>
          {filteredAssignments.map(a => (
            <option key={a.id} value={a.id}>
              #{a.id} — {a.assignee_label} {a.instance?.asset_tag ? `(${a.instance.asset_tag})` : ""}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Dispute Type">
        <select style={selectStyle} value={form.dispute_type} onChange={e => set("dispute_type", e.target.value)}>
          {["damage", "loss", "missing", "condition_disagreement", "wrong_item", "theft"].map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </Field>
      <Field label="Description">
        <textarea style={{ ...inputStyle, resize: "vertical", minHeight: 80 }} value={form.description} onChange={e => set("description", e.target.value)} placeholder="Describe the dispute…" />
      </Field>
      <Field label="Evidence Notes (optional)">
        <textarea style={{ ...inputStyle, resize: "vertical", minHeight: 60 }} value={form.evidence_notes} onChange={e => set("evidence_notes", e.target.value)} />
      </Field>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <ActionBtn color={C.red} onClick={submit} disabled={saving}>{saving ? "Saving…" : "Open Dispute"}</ActionBtn>
        <ActionBtn color={C.cyan} outline onClick={onClose}>Cancel</ActionBtn>
      </div>
    </Modal>
  );
}

function RuleModal({ dispute, onClose, onSuccess, toast }) {
  const [form, setForm] = useState({
    ruling: "company_liable",
    ruling_notes: "",
    replacement_required: false,
    repair_required: false,
    financial_liability: "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    setSaving(true);
    try {
      await inventoryAPI.disputes.rule(dispute.id, {
        ...form,
        financial_liability: form.financial_liability ? parseFloat(form.financial_liability) : undefined,
      });
      toast("Dispute ruled", "success");
      onSuccess();
      onClose();
    } catch (e) {
      toast(e?.response?.data?.message ?? "Failed to rule dispute", "error");
    } finally { setSaving(false); }
  };

  return (
    <Modal title="// rule dispute" onClose={onClose}>
      <Field label="Ruling">
        <select style={selectStyle} value={form.ruling} onChange={e => set("ruling", e.target.value)}>
          {["assignee_liable", "company_liable", "shared", "unresolved", "dismissed"].map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </Field>
      <Field label="Ruling Notes (optional)">
        <textarea style={{ ...inputStyle, resize: "vertical", minHeight: 80 }} value={form.ruling_notes} onChange={e => set("ruling_notes", e.target.value)} />
      </Field>
      <Field label="Financial Liability (optional)">
        <input style={inputStyle} type="number" min="0" value={form.financial_liability} onChange={e => set("financial_liability", e.target.value)} placeholder="Amount" />
      </Field>
      <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: mono, fontSize: 12, cursor: "pointer" }}>
          <input type="checkbox" checked={form.replacement_required} onChange={e => set("replacement_required", e.target.checked)} style={{ accentColor: C.cyan }} />
          Replacement Required
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: mono, fontSize: 12, cursor: "pointer" }}>
          <input type="checkbox" checked={form.repair_required} onChange={e => set("repair_required", e.target.checked)} style={{ accentColor: C.cyan }} />
          Repair Required
        </label>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <ActionBtn color={C.purple} onClick={submit} disabled={saving}>{saving ? "Saving…" : "Submit Ruling"}</ActionBtn>
        <ActionBtn color={C.cyan} outline onClick={onClose}>Cancel</ActionBtn>
      </div>
    </Modal>
  );
}

function RepairActionModal({ repair, action, onClose, onSuccess, toast }) {
  const [form, setForm] = useState({ notes: "", cost: "", completed_condition: "good" });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const titles = { send: "Send to Vendor", complete: "Mark Complete", unrepairable: "Mark Unrepairable" };
  const colors = { send: C.blue, complete: C.green, unrepairable: C.red };

  const submit = async () => {
    setSaving(true);
    try {
      const payload = { notes: form.notes };
      if (action === "complete") {
        payload.cost = form.cost ? parseFloat(form.cost) : undefined;
        payload.condition_after = form.completed_condition;
      }
      await inventoryAPI.repairs[action](repair.id, payload);
      toast(`Repair ${action === "send" ? "sent to vendor" : action === "complete" ? "completed" : "marked unrepairable"}`, "success");
      onSuccess();
      onClose();
    } catch (e) {
      toast(e?.response?.data?.message ?? "Action failed", "error");
    } finally { setSaving(false); }
  };

  return (
    <Modal title={`// ${titles[action]?.toLowerCase()}`} onClose={onClose}>
      <div style={{ fontFamily: mono, fontSize: 12, color: "#888", marginBottom: 16 }}>
        Repair #{repair?.id} — {repair?.instance?.asset_tag ?? "instance"}
      </div>
      {action === "complete" && (
        <>
          <Field label="Returned Condition">
            <select style={selectStyle} value={form.completed_condition} onChange={e => set("completed_condition", e.target.value)}>
              {["new", "excellent", "good", "fair", "poor"].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Cost (optional)">
            <input style={inputStyle} type="number" min="0" value={form.cost} onChange={e => set("cost", e.target.value)} placeholder="Repair cost" />
          </Field>
        </>
      )}
      <Field label="Notes (optional)">
        <textarea style={{ ...inputStyle, resize: "vertical", minHeight: 70 }} value={form.notes} onChange={e => set("notes", e.target.value)} />
      </Field>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <ActionBtn color={colors[action]} onClick={submit} disabled={saving}>{saving ? "Saving…" : titles[action]}</ActionBtn>
        <ActionBtn color={C.cyan} outline onClick={onClose}>Cancel</ActionBtn>
      </div>
    </Modal>
  );
}

function NewItemModal({ categories, locations, onClose, onSuccess, toast }) {
  const [form, setForm] = useState({
    name: "", category_id: "", type: "asset", description: "", brand: "",
    model: "", is_serialized: true, is_active: true, default_location_id: "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    setSaving(true);
    try {
      await inventoryAPI.items.store({
        ...form,
        category_id: form.category_id ? parseInt(form.category_id, 10) : undefined,
        default_location_id: form.default_location_id ? parseInt(form.default_location_id, 10) : undefined,
      });
      toast("Item created", "success");
      onSuccess();
      onClose();
    } catch (e) {
      toast(e?.response?.data?.message ?? "Failed to create item", "error");
    } finally { setSaving(false); }
  };

  return (
    <Modal title="// new catalogue item" onClose={onClose} width={520}>
      <Field label="Name">
        <input style={inputStyle} value={form.name} onChange={e => set("name", e.target.value)} placeholder="Item name" />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Category">
          <select style={selectStyle} value={form.category_id} onChange={e => set("category_id", e.target.value)}>
            <option value="">None</option>
            {(categories ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Type">
          <select style={selectStyle} value={form.type} onChange={e => set("type", e.target.value)}>
            {["asset", "consumable", "loanable", "stock"].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Brand (optional)">
          <input style={inputStyle} value={form.brand} onChange={e => set("brand", e.target.value)} />
        </Field>
        <Field label="Model (optional)">
          <input style={inputStyle} value={form.model} onChange={e => set("model", e.target.value)} />
        </Field>
      </div>
      <Field label="Default Location">
        <select style={selectStyle} value={form.default_location_id} onChange={e => set("default_location_id", e.target.value)}>
          <option value="">None</option>
          {(locations ?? []).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </Field>
      <Field label="Description (optional)">
        <textarea style={{ ...inputStyle, resize: "vertical", minHeight: 60 }} value={form.description} onChange={e => set("description", e.target.value)} />
      </Field>
      <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: mono, fontSize: 12, cursor: "pointer" }}>
          <input type="checkbox" checked={form.is_serialized} onChange={e => set("is_serialized", e.target.checked)} style={{ accentColor: C.cyan }} />
          Serialized
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: mono, fontSize: 12, cursor: "pointer" }}>
          <input type="checkbox" checked={form.is_active} onChange={e => set("is_active", e.target.checked)} style={{ accentColor: C.cyan }} />
          Active
        </label>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <ActionBtn color={C.green} onClick={submit} disabled={saving}>{saving ? "Saving…" : "Create Item"}</ActionBtn>
        <ActionBtn color={C.cyan} outline onClick={onClose}>Cancel</ActionBtn>
      </div>
    </Modal>
  );
}

function NewInstanceModal({ locations, onClose, onSuccess, toast }) {
  const [form, setForm] = useState({
    item_id: "", item_label: "", asset_tag: "", serial_number: "",
    condition: "new", location_id: "", notes: "",
    purchase_date: "", purchase_cost: "", warranty_expiry: "",
  });
  const [saving, setSaving]         = useState(false);
  const [itemPicker, setItemPicker] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    setSaving(true);
    try {
      await inventoryAPI.instances.store({
        ...form,
        item_id:      form.item_id      ? parseInt(form.item_id, 10)      : undefined,
        location_id:  form.location_id  ? parseInt(form.location_id, 10)  : undefined,
        purchase_cost: form.purchase_cost ? parseFloat(form.purchase_cost) : undefined,
      });
      toast("Instance created", "success");
      onSuccess();
      onClose();
    } catch (e) {
      toast(e?.response?.data?.message ?? "Failed to create instance", "error");
    } finally { setSaving(false); }
  };

  return (
    <>
      <Modal title="// add instance" onClose={onClose} width={520}>
        <Field label="Item">
          <SelectorTrigger
            label={form.item_label || "Select item…"}
            filled={!!form.item_id}
            onOpen={() => setItemPicker(true)}
            onClear={() => { set("item_id", ""); set("item_label", ""); }}
          />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Asset Tag">
            <input style={inputStyle} value={form.asset_tag} onChange={e => set("asset_tag", e.target.value)} placeholder="TISL-IT-0001" />
          </Field>
          <Field label="Serial Number (optional)">
            <input style={inputStyle} value={form.serial_number} onChange={e => set("serial_number", e.target.value)} />
          </Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Condition">
            <select style={selectStyle} value={form.condition} onChange={e => set("condition", e.target.value)}>
              {["new", "excellent", "good", "fair", "poor"].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Location">
            <select style={selectStyle} value={form.location_id} onChange={e => set("location_id", e.target.value)}>
              <option value="">Select location…</option>
              {(locations ?? []).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <Field label="Purchase Date">
            <input style={inputStyle} type="date" value={form.purchase_date} onChange={e => set("purchase_date", e.target.value)} />
          </Field>
          <Field label="Cost">
            <input style={inputStyle} type="number" min="0" value={form.purchase_cost} onChange={e => set("purchase_cost", e.target.value)} placeholder="0.00" />
          </Field>
          <Field label="Warranty Expiry">
            <input style={inputStyle} type="date" value={form.warranty_expiry} onChange={e => set("warranty_expiry", e.target.value)} />
          </Field>
        </div>
        <Field label="Notes (optional)">
          <textarea style={{ ...inputStyle, resize: "vertical", minHeight: 60 }} value={form.notes} onChange={e => set("notes", e.target.value)} />
        </Field>
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <ActionBtn color={C.green} onClick={submit} disabled={saving}>{saving ? "Saving…" : "Add Instance"}</ActionBtn>
          <ActionBtn color={C.cyan} outline onClick={onClose}>Cancel</ActionBtn>
        </div>
      </Modal>

      {itemPicker && (
        <InventoryItemSelectorModal
          onSelect={item => { set("item_id", item.id); set("item_label", item.name); setItemPicker(false); }}
          onClose={() => setItemPicker(false)}
          title="Select Item"
        />
      )}
    </>
  );
}

function AuditCreateModal({ onClose, onSuccess, toast }) {
  const [form, setForm] = useState({
    trigger_type: "ad_hoc", assignee_type: "employee",
    assignee_id: "", assignee_label: "", audit_date: "", notes: "",
  });
  const [saving, setSaving]               = useState(false);
  const [assigneePicker, setAssigneePicker] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const showAssigneePicker = form.assignee_type === "employee" || form.assignee_type === "customer";
  const showGroupPicker    = form.assignee_type === "group";

  const submit = async () => {
    setSaving(true);
    try {
      await inventoryAPI.audits.create({
        ...form,
        assignee_id: form.assignee_id ? parseInt(form.assignee_id, 10) : undefined,
      });
      toast("Audit created", "success");
      onSuccess();
      onClose();
    } catch (e) {
      toast(e?.response?.data?.message ?? "Failed to create audit", "error");
    } finally { setSaving(false); }
  };

  return (
    <>
      <Modal title="// create return audit" onClose={onClose}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Trigger Type">
            <select style={selectStyle} value={form.trigger_type} onChange={e => set("trigger_type", e.target.value)}>
              {["offboarding", "scheduled", "ad_hoc", "dispute"].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Assignee Type">
            <select style={selectStyle} value={form.assignee_type} onChange={e => {
              set("assignee_type", e.target.value);
              set("assignee_id", "");
              set("assignee_label", "");
            }}>
              {["employee", "customer", "department", "group"].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Assignee">
          {showAssigneePicker ? (
            <SelectorTrigger
              label={form.assignee_label || `Select ${form.assignee_type}…`}
              filled={!!form.assignee_id}
              onOpen={() => setAssigneePicker(true)}
              onClear={() => { set("assignee_id", ""); set("assignee_label", ""); }}
            />
          ) : showGroupPicker ? (
            <GroupSearchDropdown
              value={form.assignee_id}
              label={form.assignee_label}
              onSelect={(g) => { set("assignee_id", g.id); set("assignee_label", g.name); }}
              onClear={() => { set("assignee_id", ""); set("assignee_label", ""); }}
            />
          ) : (
            <input style={inputStyle} value={form.assignee_label} onChange={e => set("assignee_label", e.target.value)} placeholder="Department name" />
          )}
        </Field>
        <Field label="Audit Date (optional)">
          <input style={inputStyle} type="date" value={form.audit_date} onChange={e => set("audit_date", e.target.value)} />
        </Field>
        <Field label="Notes (optional)">
          <textarea style={{ ...inputStyle, resize: "vertical", minHeight: 70 }} value={form.notes} onChange={e => set("notes", e.target.value)} />
        </Field>
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <ActionBtn color={C.cyan} onClick={submit} disabled={saving}>{saving ? "Saving…" : "Create Audit"}</ActionBtn>
          <ActionBtn color={C.cyan} outline onClick={onClose}>Cancel</ActionBtn>
        </div>
      </Modal>

      {assigneePicker && form.assignee_type === "employee" && (
        <EmployeeSelectorModal
          onSelect={emp => { set("assignee_id", emp.id); set("assignee_label", emp.work_email); setAssigneePicker(false); }}
          onClose={() => setAssigneePicker(false)}
        />
      )}
      {assigneePicker && form.assignee_type === "customer" && (
        <CustomerSelectorModal
          onSelect={c => { set("assignee_id", c.id); set("assignee_label", `${c.first_name} ${c.last_name}`); setAssigneePicker(false); }}
          onClose={() => setAssigneePicker(false)}
        />
      )}
    </>
  );
}

function GroupModal({ group, onClose, onSuccess, toast }) {
  const [form, setForm] = useState({ name: group?.name ?? "", description: group?.description ?? "" });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    setSaving(true);
    try {
      if (group) await inventoryAPI.groups.update(group.id, form);
      else await inventoryAPI.groups.store(form);
      toast(group ? "Group updated" : "Group created", "success");
      onSuccess();
      onClose();
    } catch (e) {
      toast(e?.response?.data?.message ?? "Failed", "error");
    } finally { setSaving(false); }
  };

  return (
    <Modal title={group ? "// edit group" : "// new group"} onClose={onClose}>
      <Field label="Group Name">
        <input style={inputStyle} value={form.name} onChange={e => set("name", e.target.value)} placeholder="Group name" />
      </Field>
      <Field label="Description (optional)">
        <textarea style={{ ...inputStyle, resize: "vertical", minHeight: 70 }} value={form.description} onChange={e => set("description", e.target.value)} />
      </Field>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <ActionBtn color={C.green} onClick={submit} disabled={saving}>{saving ? "Saving…" : group ? "Save Changes" : "Create Group"}</ActionBtn>
        <ActionBtn color={C.cyan} outline onClick={onClose}>Cancel</ActionBtn>
      </div>
    </Modal>
  );
}

function AddMemberModal({ group, onClose, onSuccess, toast }) {
  const [form, setForm] = useState({ member_type: "employee", member_id: "", member_label: "" });
  const [saving, setSaving]               = useState(false);
  const [memberPicker, setMemberPicker]   = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const showMemberPicker = form.member_type === "employee" || form.member_type === "customer";

  const submit = async () => {
    setSaving(true);
    try {
      await inventoryAPI.groups.addMember(group.id, {
        ...form,
        member_id: form.member_id ? parseInt(form.member_id, 10) : undefined,
      });
      toast("Member added", "success");
      onSuccess();
      onClose();
    } catch (e) {
      toast(e?.response?.data?.message ?? "Failed", "error");
    } finally { setSaving(false); }
  };

  return (
    <>
      <Modal title="// add member" onClose={onClose}>
        <Field label="Member Type">
          <select style={selectStyle} value={form.member_type} onChange={e => {
            set("member_type", e.target.value);
            set("member_id", "");
            set("member_label", "");
          }}>
            {["employee", "customer"].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Member">
          {showMemberPicker ? (
            <SelectorTrigger
              label={form.member_label || `Select ${form.member_type}…`}
              filled={!!form.member_id}
              onOpen={() => setMemberPicker(true)}
              onClear={() => { set("member_id", ""); set("member_label", ""); }}
            />
          ) : (
            <input style={inputStyle} value={form.member_label} onChange={e => set("member_label", e.target.value)} placeholder="Department name" />
          )}
        </Field>
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <ActionBtn color={C.green} onClick={submit} disabled={saving}>{saving ? "Saving…" : "Add Member"}</ActionBtn>
          <ActionBtn color={C.cyan} outline onClick={onClose}>Cancel</ActionBtn>
        </div>
      </Modal>

      {memberPicker && form.member_type === "employee" && (
        <EmployeeSelectorModal
          onSelect={emp => { set("member_id", emp.id); set("member_label", emp.work_email); setMemberPicker(false); }}
          onClose={() => setMemberPicker(false)}
        />
      )}
      {memberPicker && form.member_type === "customer" && (
        <CustomerSelectorModal
          onSelect={c => { set("member_id", c.id); set("member_label", `${c.first_name} ${c.last_name}`); setMemberPicker(false); }}
          onClose={() => setMemberPicker(false)}
        />
      )}
    </>
  );
}

// ─── DEV NOTES MODAL ──────────────────────────────────────────────────────────
const DEV_NOTES = {
  pitfalls: [
    {
      title: "Paginator meta shape mismatch",
      severity: "critical",
      detail: "Laravel's response()->json($paginator) returns a flat structure — { data, current_page, last_page, total } — NOT nested under meta. Any load() function that does setMeta(res?.meta ?? null) will always set meta to null, breaking LoadMoreBar silently. Always normalize: res?.meta ?? (res?.current_page != null ? res : null).",
      outcome: "If unguarded, every paginated tab shows only page 1 forever with no load-more controls rendered. Extremely easy to reintroduce on new tabs.",
    },
    {
      title: "ItemDetailView loads all instances unbounded",
      severity: "warning",
      detail: "itemsShow eager-loads with(['instances']) with no limit. For high-volume stock items (cables, consumables, office chairs) this could return hundreds of rows in a single payload.",
      outcome: "Slow initial render on item detail pages as inventory grows. Fix: drop instances from itemsShow, call instancesIndex with item_id filter and paginate separately.",
    },
    {
      title: "fetchAllPages fires all remaining pages in parallel",
      severity: "warning",
      detail: "handleLoadAll uses Promise.all() across every remaining page simultaneously. On a large dataset (e.g. ledger with 50 pages) this fires 49 concurrent API requests in one click.",
      outcome: "Potential request flooding and server strain on Railway's free tier. Consider chunking into batches of 5 (already noted in the ledger tab comment but not enforced globally).",
    },
    {
      title: "'Showing X of Y' uses calculated count not actual rows",
      severity: "low",
      detail: "LoadMoreBar displays meta.current_page * meta.per_page as the loaded count. This is always a theoretical number, not items.length. They diverge whenever the last page is partial.",
      outcome: "Minor display inaccuracy. Easy fix: pass items.length as a prop (loadedCount) and display that instead.",
    },
    {
      title: "load() useCallback deps only include toast",
      severity: "low",
      detail: "All tab load() functions declare [toast] as their only dependency but capture search, typeFilter, linkFilter via closure. This is safe because every caller passes params explicitly — but it's fragile. A future developer adding a filter that's read from state inside load() instead of passed as a param will get a stale closure bug with no warning.",
      outcome: "Silent stale data bugs on new filter additions. Pattern: always pass all filter state as explicit params to load(), never read from closure inside it.",
    },
    {
      title: "Assignments dashboard stat uses unfiltered total",
      severity: "low",
      detail: "Dashboard fetches assignments with per_page:5 and reads the total as 'active assignments'. But assignmentsIndex has no default status filter — it returns ALL statuses unless filtered. The count includes returned and overdue assignments.",
      outcome: "Dashboard KPI overstates active assignments. Fix: pass status:'active' to the dashboard assignments fetch.",
    },
  ],
  strengths: [
    {
      title: "Service-layer architecture",
      detail: "Business logic is cleanly separated into InventoryTransactionService, InventoryOperationsService, and InventoryStockService. The controller is thin — it only validates, delegates, and responds. This makes individual operations independently testable.",
    },
    {
      title: "syncItemQty consistency",
      detail: "Every mutation that affects instance counts (create, delete, issue, return) calls transactions.syncItemQty(). Quantities are always derived from the source of truth rather than incremented/decremented manually, eliminating count drift.",
    },
    {
      title: "Lifecycle ledger on every instance",
      detail: "Every significant state change (procured, issued, returned, repaired, written off) is logged to InventoryLifecycleMovement. Full audit trail is baked in from day one.",
    },
    {
      title: "Condition scoring system",
      detail: "Instances carry condition + condition_score_override, and scores flow through repairs, returns, and audits. This is a strong foundation for depreciation tracking and replacement planning.",
    },
    {
      title: "Load-more + load-all pattern",
      detail: "Avoiding full traditional pagination in favour of append-on-scroll with a load-all escape hatch is a good UX choice for inventory admin. Users can work with partial data immediately.",
    },
    {
      title: "Polymorphic assignments (employee, customer, department, group)",
      detail: "The assignee_type / assignee_id / assignee_label pattern handles all assignment targets without separate tables. Flexible and extensible.",
    },
  ],
  future: [
    {
      title: "Depreciation engine",
      detail: "The data is all here — purchase_cost, purchase_date, useful_life_years, condition_score. A scheduled command could compute book value and flag items approaching end-of-life automatically.",
      horizon: "medium",
    },
    {
      title: "Barcode / QR scan check-in/out",
      detail: "serial_number, barcode, and asset_tag fields already exist. A mobile-friendly scan-to-assign flow would dramatically speed up high-volume issuance.",
      horizon: "medium",
    },
    {
      title: "Instance pagination on item detail",
      detail: "As noted above, the instances relation will need its own paginated sub-query once stock items accumulate hundreds of instances.",
      horizon: "near",
    },
    {
      title: "Scheduled overdue sweep",
      detail: "assignmentsMarkOverdue() exists but must be manually triggered. A Laravel scheduled command (daily) would keep overdue statuses accurate without admin intervention.",
      horizon: "near",
    },
    {
      title: "Export as real file download",
      detail: "exportRun() currently logs the export but the frontend has no file download flow. The natural next step is streaming a CSV/XLSX back to the browser.",
      horizon: "near",
    },
  ],
};

const SEVERITY_COLOR = { critical: "#ff4d4d", warning: C.amber, low: "#7c6aff" };
const HORIZON_COLOR  = { near: C.cyan, medium: C.amber };

function DevNotesModal({ onClose }) {
  const [tab, setTab] = useState("pitfalls");

  const sections = {
    pitfalls: DEV_NOTES.pitfalls,
    strengths: DEV_NOTES.strengths,
    future: DEV_NOTES.future,
  };

  return (
    <Modal title="// dev notes" onClose={onClose} width={780}>
      <div style={{ fontFamily: mono, fontSize: 11, color: "#555", marginBottom: 16 }}>
        internal system analysis · not visible to end users
      </div>

      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${C.border}`, marginBottom: 20 }}>
        {["pitfalls", "strengths", "future"].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "10px 20px", background: "none", border: "none",
            borderBottom: tab === t ? `2px solid #7c6aff` : "2px solid transparent",
            color: tab === t ? "#7c6aff" : "inherit", fontFamily: mono, fontSize: 12,
            cursor: "pointer", opacity: tab === t ? 1 : 0.5, marginBottom: -1,
          }}>{t}</button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: 520, overflowY: "auto", paddingRight: 4 }}>
        {tab === "pitfalls" && sections.pitfalls.map((note, i) => (
          <div key={i} style={{
            padding: "14px 16px", borderRadius: 6,
            border: `1px solid ${SEVERITY_COLOR[note.severity]}33`,
            background: `${SEVERITY_COLOR[note.severity]}08`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span style={{
                fontFamily: mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
                color: SEVERITY_COLOR[note.severity], textTransform: "uppercase",
                background: `${SEVERITY_COLOR[note.severity]}18`, padding: "2px 7px", borderRadius: 3,
              }}>{note.severity}</span>
              <span style={{ fontFamily: mono, fontSize: 13, fontWeight: 700 }}>{note.title}</span>
            </div>
            <div style={{ fontSize: 12, color: "#aaa", lineHeight: 1.6, marginBottom: 6 }}>{note.detail}</div>
            <div style={{ fontSize: 11, color: "#666", fontFamily: mono }}>
              <span style={{ color: "#444" }}>→ outcome: </span>{note.outcome}
            </div>
          </div>
        ))}

        {tab === "strengths" && sections.strengths.map((note, i) => (
          <div key={i} style={{
            padding: "14px 16px", borderRadius: 6,
            border: `1px solid ${C.cyan}22`, background: `${C.cyan}06`,
          }}>
            <div style={{ fontFamily: mono, fontSize: 13, fontWeight: 700, color: C.cyan, marginBottom: 6 }}>
              ✓ {note.title}
            </div>
            <div style={{ fontSize: 12, color: "#aaa", lineHeight: 1.6 }}>{note.detail}</div>
          </div>
        ))}

        {tab === "future" && sections.future.map((note, i) => (
          <div key={i} style={{
            padding: "14px 16px", borderRadius: 6,
            border: `1px solid ${C.border}`, background: "#0a0a0a",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span style={{
                fontFamily: mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
                color: HORIZON_COLOR[note.horizon], textTransform: "uppercase",
                background: `${HORIZON_COLOR[note.horizon]}18`, padding: "2px 7px", borderRadius: 3,
              }}>{note.horizon}-term</span>
              <span style={{ fontFamily: mono, fontSize: 13, fontWeight: 700 }}>{note.title}</span>
            </div>
            <div style={{ fontSize: 12, color: "#aaa", lineHeight: 1.6 }}>{note.detail}</div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SETTINGS MODAL
// ═══════════════════════════════════════════════════════════════════════════════
function SettingsModal({ onClose, toast }) {
  const [tab, setTab] = useState("categories");
  const [categories, setCategories] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [catForm, setCatForm] = useState({ name: "", description: "", icon: "", is_active: true });
  const [editCat, setEditCat] = useState(null);
  const [locForm, setLocForm] = useState({ name: "", code: "", type: "warehouse", address: "", is_active: true });
  const [editLoc, setEditLoc] = useState(null);

  const loadCategories = useCallback(async () => {
    setLoading(true);
    try { setCategories((await inventoryAPI.categories.index({ active_only: false })) ?? []); }
    catch { toast("Failed to load categories", "error"); }
    finally { setLoading(false); }
  }, [toast]);

  const loadLocations = useCallback(async () => {
    setLoading(true);
    try { setLocations((await inventoryAPI.locations.index({ active_only: false })) ?? []); }
    catch { toast("Failed to load locations", "error"); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { tab === "categories" ? loadCategories() : loadLocations(); }, [tab, loadCategories, loadLocations]);

  const saveCategory = async () => {
    try {
      if (editCat) await inventoryAPI.categories.update(editCat.id, catForm);
      else await inventoryAPI.categories.store(catForm);
      toast(editCat ? "Category updated" : "Category created", "success");
      setEditCat(null); setCatForm({ name: "", description: "", icon: "", is_active: true });
      loadCategories();
    } catch (e) { toast(e?.response?.data?.message ?? "Failed", "error"); }
  };

  const deleteCategory = async (id) => {
    if (!window.confirm("Delete this category?")) return;
    try { await inventoryAPI.categories.destroy(id); toast("Category deleted", "success"); loadCategories(); }
    catch (e) { toast(e?.response?.data?.message ?? "Failed", "error"); }
  };

  const saveLocation = async () => {
    try {
      if (editLoc) await inventoryAPI.locations.update(editLoc.id, locForm);
      else await inventoryAPI.locations.store(locForm);
      toast(editLoc ? "Location updated" : "Location created", "success");
      setEditLoc(null); setLocForm({ name: "", code: "", type: "warehouse", address: "", is_active: true });
      loadLocations();
    } catch (e) { toast(e?.response?.data?.message ?? "Failed", "error"); }
  };

  const deleteLocation = async (id) => {
    if (!window.confirm("Delete this location?")) return;
    try { await inventoryAPI.locations.destroy(id); toast("Location deleted", "success"); loadLocations(); }
    catch (e) { toast(e?.response?.data?.message ?? "Failed", "error"); }
  };

  return (
    <Modal title="// settings" onClose={onClose} width={700}>
      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${C.border}`, marginBottom: 20 }}>
        {["categories", "locations"].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "10px 20px", background: "none", border: "none",
            borderBottom: tab === t ? `2px solid ${C.cyan}` : "2px solid transparent",
            color: tab === t ? C.cyan : "inherit", fontFamily: mono, fontSize: 12,
            cursor: "pointer", opacity: tab === t ? 1 : 0.5, marginBottom: -1,
          }}>{t}</button>
        ))}
      </div>

      {tab === "categories" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div>
            <div style={{ fontFamily: mono, fontSize: 10, color: C.cyan, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 14 }}>
              {editCat ? `// editing: ${editCat.name}` : "// new category"}
            </div>
            <Field label="Name"><input style={inputStyle} value={catForm.name} onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))} /></Field>
            <Field label="Icon (optional)"><input style={inputStyle} value={catForm.icon} onChange={e => setCatForm(f => ({ ...f, icon: e.target.value }))} placeholder="emoji or icon code" /></Field>
            <Field label="Description"><textarea style={{ ...inputStyle, resize: "vertical", minHeight: 60 }} value={catForm.description} onChange={e => setCatForm(f => ({ ...f, description: e.target.value }))} /></Field>
            <div style={{ display: "flex", gap: 8 }}>
              <ActionBtn color={C.green} small onClick={saveCategory}>{editCat ? "Update" : "Add"}</ActionBtn>
              {editCat && <ActionBtn color={C.cyan} small outline onClick={() => { setEditCat(null); setCatForm({ name: "", description: "", icon: "", is_active: true }); }}>Cancel</ActionBtn>}
            </div>
          </div>
          <div>
            <div style={{ fontFamily: mono, fontSize: 10, color: C.cyan, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 14 }}>// categories</div>
            {loading ? <div style={{ color: "#555", fontFamily: mono, fontSize: 12 }}>loading…</div> : (categories ?? []).map(c => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 0", borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontFamily: mono, fontSize: 12 }}>{c.icon} {c.name}</span>
                <div style={{ display: "flex", gap: 6 }}>
                  <ActionBtn small outline color={C.cyan} onClick={() => { setEditCat(c); setCatForm({ name: c.name, description: c.description ?? "", icon: c.icon ?? "", is_active: c.is_active }); }}>Edit</ActionBtn>
                  <ActionBtn small outline color={C.red} onClick={() => deleteCategory(c.id)}>✕</ActionBtn>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "locations" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div>
            <div style={{ fontFamily: mono, fontSize: 10, color: C.cyan, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 14 }}>
              {editLoc ? `// editing: ${editLoc.name}` : "// new location"}
            </div>
            <Field label="Name"><input style={inputStyle} value={locForm.name} onChange={e => setLocForm(f => ({ ...f, name: e.target.value }))} /></Field>
            <Field label="Code"><input style={inputStyle} value={locForm.code} onChange={e => setLocForm(f => ({ ...f, code: e.target.value }))} placeholder="MAIN-WH-01" /></Field>
            <Field label="Type">
              <select style={selectStyle} value={locForm.type} onChange={e => setLocForm(f => ({ ...f, type: e.target.value }))}>
                {["warehouse", "office", "site", "vehicle", "external", "virtual"].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Address"><input style={inputStyle} value={locForm.address} onChange={e => setLocForm(f => ({ ...f, address: e.target.value }))} /></Field>
            <div style={{ display: "flex", gap: 8 }}>
              <ActionBtn color={C.green} small onClick={saveLocation}>{editLoc ? "Update" : "Add"}</ActionBtn>
              {editLoc && <ActionBtn color={C.cyan} small outline onClick={() => { setEditLoc(null); setLocForm({ name: "", code: "", type: "warehouse", address: "", is_active: true }); }}>Cancel</ActionBtn>}
            </div>
          </div>
          <div>
            <div style={{ fontFamily: mono, fontSize: 10, color: C.cyan, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 14 }}>// locations</div>
            {loading ? <div style={{ color: "#555", fontFamily: mono, fontSize: 12 }}>loading…</div> : (locations ?? []).map(l => (
              <div key={l.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 0", borderBottom: `1px solid ${C.border}` }}>
                <div>
                  <span style={{ fontFamily: mono, fontSize: 12 }}>{l.name}</span>
                  <span style={{ fontFamily: mono, fontSize: 10, color: "#555", marginLeft: 8 }}>{l.code} · {l.type}</span>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <ActionBtn small outline color={C.cyan} onClick={() => { setEditLoc(l); setLocForm({ name: l.name, code: l.code, type: l.type, address: l.address ?? "", is_active: l.is_active }); }}>Edit</ActionBtn>
                  <ActionBtn small outline color={C.red} onClick={() => deleteLocation(l.id)}>✕</ActionBtn>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-PAGES
// ═══════════════════════════════════════════════════════════════════════════════
function ItemDetailPage({ itemId, onBack, toast }) {
  const [item, setItem] = useState(null);
  const [instances, setInstances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);
  const [locations, setLocations] = useState([]);
  const [allItems, setAllItems] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [itemData, locsData, itemsData] = await Promise.all([
        inventoryAPI.items.show(itemId),
        inventoryAPI.locations.index(),
        inventoryAPI.items.index({ per_page: 200 }),
      ]);
      setItem(itemData);
      setInstances(itemData.instances ?? []);
      setLocations(locsData ?? []);
      setAllItems(itemsData?.data ?? itemsData ?? []);
    } catch { toast("Failed to load item", "error"); }
    finally { setLoading(false); }
  }, [itemId, toast]);

  useEffect(() => { load(); }, [load]);

  if (loading || !item) return <div style={{ padding: 40, textAlign: "center", fontFamily: mono, color: "#555" }}>◈ loading…</div>;

  const filtered = instances.filter(i =>
    (i.asset_tag ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (i.serial_number ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: instances.length,
    available: instances.filter(i => i.status === "available").length,
    out: instances.filter(i => ["issued", "loaned"].includes(i.status)).length,
    repair: instances.filter(i => i.status === "in_repair").length,
  };

  return (
    <div>
      <Breadcrumb crumbs={["Inventory", "Catalogue", item.name]} onNavigate={i => { if (i <= 1) onBack(); }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div style={{ fontFamily: mono, fontSize: 10, color: C.cyan, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>
            item · {item.type} · {item.is_serialized ? "serialized" : "non-serialized"}
          </div>
          <h2 style={{ margin: 0, fontFamily: sans, fontSize: 22, fontWeight: 600 }}>{item.name}</h2>
          <div style={{ fontFamily: mono, fontSize: 12, color: "#888", marginTop: 4 }}>{item.category?.name ?? "—"}</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <ActionBtn color={C.green} outline small onClick={() => setModal("new-instance")}>+ Add Instance</ActionBtn>
          <ActionBtn color={C.amber} outline small onClick={() => setModal("repair")}>⚙ Report Repair</ActionBtn>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 28 }}>
        <StatCard label="Total" value={stats.total} color={C.cyan} />
        <StatCard label="Available" value={stats.available} color={C.green} />
        <StatCard label="Issued / Loaned" value={stats.out} color={C.amber} />
        <StatCard label="In Repair" value={stats.repair} color={C.red} />
      </div>

      <Panel>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontFamily: mono, fontSize: 11, color: C.cyan, letterSpacing: "0.08em", textTransform: "uppercase" }}>// instances [{filtered.length}]</span>
          <SearchBar value={search} onChange={setSearch} placeholder="Search asset tag, serial..." />
        </div>
        <Table
          cols={[
            { key: "asset_tag", label: "Asset Tag", render: v => <span style={{ color: C.cyan, fontWeight: 700 }}>{v}</span> },
            { key: "serial_number", label: "Serial No." },
            { key: "status", label: "Status", render: v => <Chip label={v} /> },
            { key: "condition", label: "Condition" },
            { key: "location", label: "Location", render: (_, row) => row.location?.name ?? "—" },
            { key: "_actions", label: "", render: (_, row) => (
              <div style={{ display: "flex", gap: 6 }}>
                {row.status === "available" && <ActionBtn color={C.cyan} outline small onClick={() => setModal({ type: "issue", instance: row })}>Issue</ActionBtn>}
                {row.status === "available" && <ActionBtn color={C.blue} outline small onClick={() => setModal({ type: "loan", instance: row })}>Loan</ActionBtn>}
                {(row.status === "issued" || row.status === "loaned") && <ActionBtn color={C.green} outline small onClick={() => setModal({ type: "return", instance: row })}>Return</ActionBtn>}
              </div>
            )},
          ]}
          rows={filtered}
        />
      </Panel>

      {modal === "new-instance" && <NewInstanceModal items={allItems} locations={locations} onClose={() => setModal(null)} onSuccess={load} toast={toast} />}
      {modal === "repair" && <RepairModal items={allItems} onClose={() => setModal(null)} onSuccess={load} toast={toast} />}
      {modal?.type === "issue" && <IssueModal instance={modal.instance} mode="issue" onClose={() => setModal(null)} onSuccess={load} toast={toast} />}
      {modal?.type === "loan" && <IssueModal instance={modal.instance} mode="loan" onClose={() => setModal(null)} onSuccess={load} toast={toast} />}
      {modal?.type === "return" && <ReturnModal assignment={{ id: modal.instance?.active_assignment_id, instance: modal.instance }} onClose={() => setModal(null)} onSuccess={load} toast={toast} />}
    </div>
  );
}

function InstanceDetailPage({ instanceId, onBack, toast }) {
  const [instance, setInstance] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [locationHistory, setLocationHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState([]);
  const [modal, setModal] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [inst, led, locHist, locs] = await Promise.all([
        inventoryAPI.instances.show(instanceId),
        inventoryAPI.instances.ledger(instanceId),
        inventoryAPI.instances.locationHistory(instanceId),
        inventoryAPI.locations.index(),
      ]);
      setInstance(inst);
      setLedger(led ?? []);
      setLocationHistory(locHist ?? []);
      setLocations(locs ?? []);
    } catch { toast("Failed to load instance", "error"); }
    finally { setLoading(false); }
  }, [instanceId, toast]);

  useEffect(() => { load(); }, [load]);

  if (loading || !instance) return <div style={{ padding: 40, textAlign: "center", fontFamily: mono, color: "#555" }}>◈ loading…</div>;

  return (
    <div>
      <Breadcrumb crumbs={["Inventory", "Instances", instance.asset_tag]} onNavigate={i => { if (i <= 1) onBack(); }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div style={{ fontFamily: mono, fontSize: 10, color: C.cyan, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>
            instance · {instance.item?.name ?? "—"}
          </div>
          <h2 style={{ margin: 0, fontFamily: mono, fontSize: 22, fontWeight: 700, color: C.cyan }}>{instance.asset_tag}</h2>
          <div style={{ fontFamily: mono, fontSize: 12, color: "#888", marginTop: 4 }}>SN: {instance.serial_number ?? "—"}</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Chip label={instance.status} />
          {instance.status === "available" && <ActionBtn color={C.cyan} outline small onClick={() => setModal("issue")}>Issue</ActionBtn>}
          {instance.status === "available" && <ActionBtn color={C.blue} outline small onClick={() => setModal("loan")}>Loan</ActionBtn>}
          <ActionBtn color={C.amber} outline small onClick={() => setModal("move")}>Move Location</ActionBtn>
          <ActionBtn color={C.amber} outline small onClick={() => setModal("repair")}>Report Repair</ActionBtn>
          <ActionBtn color={C.purple} outline small onClick={() => setModal("obsolete")}>Declare Obsolete</ActionBtn>
          <ActionBtn color={C.red} outline small onClick={() => setModal("write-off")}>Write Off</ActionBtn>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        <Panel>
          <div style={{ fontFamily: mono, fontSize: 10, color: C.cyan, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 14 }}>// details</div>
          {[
            ["Item", instance.item?.name],
            ["Asset Tag", instance.asset_tag],
            ["Serial No.", instance.serial_number],
            ["Condition", instance.condition],
            ["Location", instance.location?.name],
            ["Purchase Date", instance.purchase_date],
            ["Purchase Cost", instance.purchase_cost ? `${instance.purchase_cost}` : null],
            ["Warranty Expiry", instance.warranty_expiry],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.border}`, fontFamily: mono, fontSize: 12 }}>
              <span style={{ color: "#888" }}>{k}</span>
              <span>{v ?? "—"}</span>
            </div>
          ))}
        </Panel>

        <Panel>
          <div style={{ fontFamily: mono, fontSize: 10, color: C.cyan, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 14 }}>// location history</div>
          {locationHistory.length === 0
            ? <div style={{ color: "#555", fontFamily: mono, fontSize: 12 }}>No location changes recorded.</div>
            : locationHistory.slice(0, 6).map((lh, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.border}`, fontFamily: mono, fontSize: 11 }}>
                <span style={{ color: C.cyan }}>{lh.location?.name ?? lh.to_location?.name ?? "—"}</span>
                <span style={{ color: "#555" }}>{lh.moved_at?.slice(0, 10)}</span>
              </div>
            ))
          }
        </Panel>
      </div>

      <Panel>
        <div style={{ fontFamily: mono, fontSize: 10, color: C.cyan, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 14 }}>// lifecycle ledger</div>
        <Table
          cols={[
            { key: "movement_type", label: "Movement", render: v => <span style={{ color: MOVEMENT_COLOR[v] || "#888", fontWeight: 600 }}>{v}</span> },
            { key: "performed_at", label: "Timestamp", render: v => <span style={{ color: "#555" }}>{v?.slice(0, 16).replace("T", " ")}</span> },
            { key: "performed_by", label: "By", render: (_, row) => row.performedBy?.name ?? "System" },
            { key: "status_before", label: "Before", render: v => v ? <Chip label={v} /> : <span style={{ color: "#555" }}>—</span> },
            { key: "status_after", label: "After", render: v => v ? <Chip label={v} /> : <span style={{ color: "#555" }}>—</span> },
          ]}
          rows={ledger}
        />
      </Panel>

      {modal === "issue" && <IssueModal instance={instance} mode="issue" onClose={() => setModal(null)} onSuccess={load} toast={toast} />}
      {modal === "loan" && <IssueModal instance={instance} mode="loan" onClose={() => setModal(null)} onSuccess={load} toast={toast} />}
      {modal === "move" && <MoveModal instance={instance} locations={locations} onClose={() => setModal(null)} onSuccess={load} toast={toast} />}
      {modal === "repair" && <RepairModal instance={instance} onClose={() => setModal(null)} onSuccess={load} toast={toast} />}
      {modal === "write-off" && <WriteOffModal instance={instance} mode="write-off" onClose={() => setModal(null)} onSuccess={load} toast={toast} />}
      {modal === "dispose" && <WriteOffModal instance={instance} mode="dispose" onClose={() => setModal(null)} onSuccess={load} toast={toast} />}
      {modal === "obsolete" && <WriteOffModal instance={instance} mode="obsolete" onClose={() => setModal(null)} onSuccess={load} toast={toast} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN TABS
// ═══════════════════════════════════════════════════════════════════════════════
function DashboardTab({ onNavigate, toast }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [itemsRes, instancesRes, assignmentsRes, repairsRes, disputesRes, auditsRes, ledgerRes] = await Promise.all([
          inventoryAPI.items.index({ per_page: 1 }),
          inventoryAPI.instances.index({ per_page: 1 }),
          inventoryAPI.assignments.index({ per_page: 5 }),
          inventoryAPI.repairs.index({ per_page: 1 }),
          inventoryAPI.disputes.index({ per_page: 1 }),
          inventoryAPI.audits.index({ per_page: 1 }),
          inventoryAPI.ledger.index({ per_page: 5 }),
        ]);
        setData({
          totalItems: itemsRes?.total ?? itemsRes?.meta?.total ?? 0,
          totalInstances: instancesRes?.total ?? instancesRes?.meta?.total ?? 0,
          activeAssignments: assignmentsRes?.total ?? assignmentsRes?.meta?.total ?? 0,
          inRepair: repairsRes?.total ?? repairsRes?.meta?.total ?? 0,
          openDisputes: disputesRes?.total ?? disputesRes?.meta?.total ?? 0,
          pendingAudits: auditsRes?.total ?? auditsRes?.meta?.total ?? 0,
          recentAssignments: assignmentsRes?.data ?? [],
          recentMovements: ledgerRes?.data ?? [],
        });
      } catch { toast("Failed to load dashboard", "error"); }
      finally { setLoading(false); }
    })();
  }, [toast]);

  if (loading || !data) return (
    <div style={{ padding: 48, textAlign: "center", fontFamily: mono, color: "#555" }}>◈ loading dashboard…</div>
  );

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
        <StatCard label="Total Items" value={data.totalItems} color={C.cyan} icon="◈" onClick={() => onNavigate("catalogue")} />
        <StatCard label="Instances" value={data.totalInstances} color={C.green} icon="◉" onClick={() => onNavigate("instances")} />
        <StatCard label="Active Assignments" value={data.activeAssignments} color={C.blue} icon="⇢" onClick={() => onNavigate("assignments")} />
        <StatCard label="In Repair" value={data.inRepair} color={C.amber} icon="⚙" onClick={() => onNavigate("repairs")} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 28 }}>
        <StatCard label="Open Disputes" value={data.openDisputes} color={C.red} icon="⚑" onClick={() => onNavigate("disputes")} />
        <StatCard label="Pending Audits" value={data.pendingAudits} color={C.purple} icon="✦" onClick={() => onNavigate("audits")} />
        <StatCard label="Lifecycle Events" value={data.recentMovements.length} color={C.cyan} icon="≡" onClick={() => onNavigate("ledger")} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Panel>
          <div style={{ fontFamily: mono, fontSize: 10, color: C.cyan, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 14 }}>// recent movements</div>
          {data.recentMovements.length === 0
            ? <div style={{ color: "#555", fontFamily: mono, fontSize: 12 }}>No movements yet.</div>
            : data.recentMovements.map((m, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontFamily: mono, fontSize: 11, color: MOVEMENT_COLOR[m.movement_type] || "#888", fontWeight: 700, minWidth: 110 }}>{m.movement_type}</span>
                <span style={{ fontFamily: mono, fontSize: 11, flex: 1 }}>{m.instance?.asset_tag ?? "—"}</span>
                <span style={{ fontFamily: mono, fontSize: 10, color: "#555" }}>{m.performed_at?.slice(0, 16).replace("T", " ")}</span>
              </div>
            ))
          }
        </Panel>
        <Panel>
          <div style={{ fontFamily: mono, fontSize: 10, color: C.cyan, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 14 }}>// recent assignments</div>
          {data.recentAssignments.length === 0
            ? <div style={{ color: "#555", fontFamily: mono, fontSize: 12 }}>No assignments yet.</div>
            : data.recentAssignments.map((a, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontFamily: mono, fontSize: 11, color: C.cyan, fontWeight: 700, minWidth: 110 }}>{a.instance?.asset_tag ?? `#${a.id}`}</span>
                <span style={{ fontFamily: mono, fontSize: 11, flex: 1 }}>{a.assignee_label}</span>
                <Chip label={a.status} />
              </div>
            ))
          }
        </Panel>
      </div>
    </div>
  );
}

// ─── Linked item styling ──────────────────────────────────────────────────────
const LINKED_BG    = "rgba(139, 92, 246, 0.08)";
const LINKED_BADGE = {
  display: "inline-flex", alignItems: "center", gap: 4,
  padding: "2px 7px", borderRadius: 4,
  background: "rgba(139, 92, 246, 0.18)", border: "1px solid rgba(139, 92, 246, 0.45)",
  color: "#a78bfa", fontFamily: mono, fontSize: 9, fontWeight: 700,
  letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap",
};
const LOCKED_INPUT  = { ...inputStyle,  opacity: 0.45, cursor: "not-allowed", background: "rgba(255,255,255,0.03)" };
const LOCKED_SELECT = { ...selectStyle, opacity: 0.45, cursor: "not-allowed", background: "rgba(255,255,255,0.03)" };

function ReadOnlyField({ label, value }) {
  return (
    <Field label={
      <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
        {label}
        <span style={{ fontSize: 9, color: "#a78bfa", fontWeight: 700 }}>⊘ PRODUCT</span>
      </span>
    }>
      <input style={LOCKED_INPUT} value={value ?? "—"} readOnly disabled />
    </Field>
  );
}

function EditItemModal({ item, categories, locations, onClose, onSuccess, toast }) {
  const isLinked = !!item.product_id;
  const [form, setForm] = useState({
    default_location_id:  item.default_location_id ?? "",
    condition:            item.condition           ?? "good",
    notes:                item.notes               ?? "",
    low_stock_threshold:  item.low_stock_threshold ?? "",
    name:                 item.name                ?? "",
    brand:                item.brand               ?? "",
    type:                 item.type                ?? "stock",
    unit_of_measure:      item.unit_of_measure     ?? "unit",
    category_id:          item.category_id         ?? "",
    description:          item.description         ?? "",
    is_active:            item.is_active            ?? true,
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    setSaving(true);
    try {
      const payload = isLinked
        ? {
            default_location_id: form.default_location_id ? parseInt(form.default_location_id) : null,
            condition: form.condition, notes: form.notes,
            low_stock_threshold: form.low_stock_threshold ? parseInt(form.low_stock_threshold) : null,
          }
        : {
            name: form.name, brand: form.brand, type: form.type,
            unit_of_measure: form.unit_of_measure,
            category_id: form.category_id ? parseInt(form.category_id) : null,
            default_location_id: form.default_location_id ? parseInt(form.default_location_id) : null,
            description: form.description, condition: form.condition, notes: form.notes,
            low_stock_threshold: form.low_stock_threshold ? parseInt(form.low_stock_threshold) : null,
            is_active: form.is_active,
          };
      await inventoryAPI.items.update(item.id, payload);
      toast("Item updated", "success");
      onSuccess(); onClose();
    } catch (e) {
      toast(e?.response?.data?.message ?? "Failed to update item", "error");
    } finally { setSaving(false); }
  };

  const product = item.product ?? {};
  return (
    <Modal title={isLinked ? "// edit linked item" : "// edit catalogue item"} onClose={onClose} width={560}>
      {isLinked && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", marginBottom: 18, background: LINKED_BG, border: "1px solid rgba(139,92,246,0.3)", borderRadius: 6 }}>
          <span style={LINKED_BADGE}>⬡ linked</span>
          <span style={{ fontFamily: mono, fontSize: 11, color: "#a78bfa" }}>Synced from product #{item.product_id}. Name, brand, price and UOM are managed by the product catalogue.</span>
        </div>
      )}
      {isLinked ? <ReadOnlyField label="Name" value={product.name ?? item.name} /> : <Field label="Name"><input style={inputStyle} value={form.name} onChange={e => set("name", e.target.value)} /></Field>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {isLinked ? <ReadOnlyField label="Type" value={item.type} /> : <Field label="Type"><select style={selectStyle} value={form.type} onChange={e => set("type", e.target.value)}>{["asset","consumable","loanable","stock"].map(t=><option key={t} value={t}>{t}</option>)}</select></Field>}
        <Field label="Inv. Category"><select style={selectStyle} value={form.category_id} onChange={e => set("category_id", e.target.value)}><option value="">None</option>{(categories??[]).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {isLinked ? <ReadOnlyField label="Brand" value={item.brand} /> : <Field label="Brand"><input style={inputStyle} value={form.brand} onChange={e => set("brand", e.target.value)} /></Field>}
        {isLinked ? <ReadOnlyField label="Unit of Measure" value={item.unit_of_measure} /> : <Field label="Unit of Measure"><input style={inputStyle} value={form.unit_of_measure} onChange={e => set("unit_of_measure", e.target.value)} /></Field>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {isLinked ? <ReadOnlyField label="Price / Cost" value={item.purchase_cost ? `${parseFloat(item.purchase_cost).toLocaleString()}` : "—"} /> : <Field label="Purchase Cost"><input style={inputStyle} type="number" min="0" value={form.purchase_cost??""} onChange={e=>set("purchase_cost",e.target.value)} /></Field>}
        <Field label="Low Stock Threshold"><input style={inputStyle} type="number" min="0" value={form.low_stock_threshold} onChange={e=>set("low_stock_threshold",e.target.value)} placeholder="e.g. 10" /></Field>
      </div>
      <Field label="Default Location"><select style={selectStyle} value={form.default_location_id} onChange={e=>set("default_location_id",e.target.value)}><option value="">None</option>{(locations??[]).map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
      <Field label="Condition"><select style={selectStyle} value={form.condition} onChange={e=>set("condition",e.target.value)}>{["new","excellent","good","fair","poor","damaged","unusable"].map(c=><option key={c} value={c}>{c}</option>)}</select></Field>
      {!isLinked && <Field label="Description"><textarea style={{...inputStyle,resize:"vertical",minHeight:56}} value={form.description} onChange={e=>set("description",e.target.value)} /></Field>}
      <Field label="Notes"><textarea style={{...inputStyle,resize:"vertical",minHeight:56}} value={form.notes} onChange={e=>set("notes",e.target.value)} placeholder={isLinked?"Inventory-specific notes (not synced to product)":"Optional notes"} /></Field>
      {!isLinked && <label style={{display:"flex",alignItems:"center",gap:8,fontFamily:mono,fontSize:12,cursor:"pointer",marginBottom:16}}><input type="checkbox" checked={form.is_active} onChange={e=>set("is_active",e.target.checked)} style={{accentColor:C.cyan}} />Active</label>}
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <ActionBtn color={C.green} onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save Changes"}</ActionBtn>
        <ActionBtn color={C.cyan} outline onClick={onClose}>Cancel</ActionBtn>
      </div>
    </Modal>
  );
}

// ─── Helper: build loadAll for any tab ───────────────────────────────────────
// Fires all remaining pages in parallel and returns the combined rows.
async function fetchAllPages(apiFn, params, currentPage, lastPage) {
  const pages = Array.from({ length: lastPage - currentPage }, (_, i) => currentPage + 1 + i);
  const results = await Promise.all(pages.map(p => apiFn({ ...params, page: p })));
  return results.flatMap(r => r?.data ?? r ?? []);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CATALOGUE TAB
// ═══════════════════════════════════════════════════════════════════════════════
function CatalogueTab({ onItemClick, toast }) {
  const [items,        setItems]        = useState([]);
  const [meta,         setMeta]         = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [loadingMore,  setLoadingMore]  = useState(false);
  const [syncing,      setSyncing]      = useState(false);
  const [search,       setSearch]       = useState("");
  const [typeFilter,   setTypeFilter]   = useState("all");
  const [linkFilter,   setLinkFilter]   = useState("all");
  const [page,         setPage]         = useState(1);
  const [modal,        setModal]        = useState(null);
  const [categories,   setCategories]   = useState([]);
  const [locations,    setLocations]    = useState([]);
  const [syncProgress, setSyncProgress] = useState(null);
  const debounceRef = useRef(null);

  const buildParams = (p, s, tf, lf) => {
    const params = { page: p, per_page: 25 };
    if (s)            params.search = s;
    if (tf !== "all") params.type   = tf;
    if (lf === "linked")   params.linked = 1;
    if (lf === "unlinked") params.linked = 0;
    return params;
  };

  const load = useCallback(async (p = 1, s = search, tf = typeFilter, lf = linkFilter, append = false) => {
    append ? setLoadingMore(true) : setLoading(true);
    try {
      const res = await inventoryAPI.items.index(buildParams(p, s, tf, lf));
      const rows = res?.data ?? [];
      setItems(prev => append ? [...prev, ...rows] : rows);
      setMeta(res?.meta ?? (res?.current_page != null ? res : null));
    } catch { toast("Failed to load items", "error"); }
    finally { append ? setLoadingMore(false) : setLoading(false); }
  }, [toast]); // eslint-disable-line

  const loadSupport = useCallback(async () => {
    try {
      const [cats, locs] = await Promise.all([inventoryAPI.categories.index(), inventoryAPI.locations.index()]);
      setCategories(cats ?? []); setLocations(locs ?? []);
    } catch {}
  }, []);

  useEffect(() => { load(1); loadSupport(); }, [load, loadSupport]);

  const handleSearch = (v) => {
    setSearch(v); setPage(1); setItems([]);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(1, v, typeFilter, linkFilter, false), 400);
  };
  const handleType = (v) => { setTypeFilter(v); setPage(1); setItems([]); load(1, search, v, linkFilter, false); };
  const handleLink = (v) => { setLinkFilter(v); setPage(1); setItems([]); load(1, search, typeFilter, v, false); };

  const handleLoadMore = () => {
    const next = page + 1;
    setPage(next);
    load(next, search, typeFilter, linkFilter, true);
  };

  const handleLoadAll = async () => {
    if (!meta) return;
    setLoadingMore(true);
    try {
      const rows = await fetchAllPages(
        params => inventoryAPI.items.index(params),
        buildParams(1, search, typeFilter, linkFilter),
        page, meta.last_page,
      );
      setItems(prev => [...prev, ...rows]);
      setPage(meta.last_page);
      setMeta(prev => ({ ...prev, current_page: meta.last_page }));
    } catch { toast("Failed to load all items", "error"); }
    finally { setLoadingMore(false); }
  };

  const handleSync = async () => {
    setSyncing(true); setSyncProgress(null);
    let offset = 0; const limit = 50;
    let totalCreated = 0, totalUpdated = 0, totalErrors = 0;
    try {
      while (true) {
        const res = await inventoryAPI.items.syncProducts({ offset, limit });
        totalCreated += res.created; totalUpdated += res.updated; totalErrors += res.errors?.length ?? 0;
        setSyncProgress({ processed: res.processed, total: res.total, pct: Math.round((res.processed / res.total) * 100) });
        if (res.done) break;
        offset = res.next_offset;
      }
      toast(`Sync complete — ${totalCreated} created, ${totalUpdated} updated${totalErrors ? ` (${totalErrors} errors)` : ""}`, totalErrors ? "warning" : "success");
      setPage(1); setItems([]); load(1);
    } catch (e) { toast(e?.response?.data?.message ?? "Sync failed", "error"); }
    finally { setSyncing(false); setSyncProgress(null); }
  };

  const rowStyle = (row) => row.product_id
    ? { background: LINKED_BG, borderLeft: "2px solid rgba(139,92,246,0.4)" }
    : {};

  return (
    <div>
      {syncing && syncProgress && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: mono, fontSize: 11, color: "#a78bfa", marginBottom: 4 }}>
            <span>⬡ syncing products…</span>
            <span>{syncProgress.processed} / {syncProgress.total} ({syncProgress.pct}%)</span>
          </div>
          <div style={{ height: 3, background: "#1a1a1a", borderRadius: 2 }}>
            <div style={{ height: "100%", width: `${syncProgress.pct}%`, background: "linear-gradient(90deg, #7c3aed, #a78bfa)", borderRadius: 2, transition: "width 0.3s ease" }} />
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginBottom: 20, alignItems: "center", flexWrap: "wrap" }}>
        <SearchBar value={search} onChange={handleSearch} placeholder="Search items, brands, models…" />
        <select style={{ ...selectStyle, width: 130 }} value={typeFilter} onChange={e => handleType(e.target.value)}>
          {["all","asset","stock","consumable","loanable"].map(t => <option key={t} value={t}>{t === "all" ? "All types" : t}</option>)}
        </select>
        <select style={{ ...selectStyle, width: 140 }} value={linkFilter} onChange={e => handleLink(e.target.value)}>
          <option value="all">All items</option>
          <option value="linked">Linked only</option>
          <option value="unlinked">Unlinked only</option>
        </select>
        <ActionBtn color={C.green} onClick={() => setModal("new-item")}>+ New Item</ActionBtn>
        <ActionBtn color="#a78bfa" onClick={handleSync} disabled={syncing}>{syncing ? "⟳ Syncing…" : "⬡ Sync Products"}</ActionBtn>
      </div>

      <Panel style={{ padding: 0 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: mono, fontSize: 12 }}>
          <thead>
            <tr>
              {["Item","Category","Type","Brand","Price","Available","Issued","Total",""].map(h => (
                <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: C.cyan, borderBottom: "1px solid #1a1a1a", fontWeight: 600, fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={9} style={{ padding: "48px 14px", textAlign: "center", color: "#555" }}><span style={{ color: C.cyan }}>◈</span> loading…</td></tr>}
            {!loading && items.length === 0 && <tr><td colSpan={9} style={{ padding: "32px 14px", textAlign: "center", color: "#555" }}>No items found</td></tr>}
            {!loading && items.map(row => {
              const isLinked = !!row.product_id;
              const price    = row.purchase_cost;
              return (
                <tr key={row.id} style={{ borderBottom: "1px solid #111", transition: "background 0.15s", ...rowStyle(row) }}
                  onMouseEnter={e => e.currentTarget.style.background = isLinked ? "rgba(139,92,246,0.14)" : "rgba(0,229,255,0.04)"}
                  onMouseLeave={e => e.currentTarget.style.background = isLinked ? LINKED_BG : "transparent"}
                >
                  <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {isLinked && <span style={LINKED_BADGE}>⬡ linked</span>}
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <span style={{ color: isLinked ? "#a78bfa" : C.cyan, cursor: "pointer", fontWeight: 600 }} onClick={() => onItemClick(row.id)}>{row.name}</span>
                        {row.is_serialized && <span style={{ fontFamily: mono, fontSize: 9, color: C.amber, letterSpacing: "0.06em" }}>◉ serialized</span>}
                      </div>
                    </div>
                    {isLinked && row.product?.sku && <div style={{ color: "#555", fontSize: 10, marginTop: 2 }}>SKU: {row.product.sku}</div>}
                  </td>
                  <td style={{ padding: "10px 14px", color: "#aaa" }}>{row.category?.name ?? "—"}</td>
                  <td style={{ padding: "10px 14px" }}><Chip label={row.type} /></td>
                  <td style={{ padding: "10px 14px", color: "#aaa" }}>{row.brand ?? "—"}</td>
                  <td style={{ padding: "10px 14px", color: isLinked ? "#a78bfa" : "#aaa", whiteSpace: "nowrap" }}>{price ? `KES ${parseFloat(price).toLocaleString()}` : "—"}</td>
                  <td style={{ padding: "10px 14px" }}>
                    <span style={{ color: (row.low_stock_threshold && row.available_qty <= row.low_stock_threshold) ? C.amber : C.green, fontWeight: 700 }}>{row.available_qty ?? "—"}</span>
                  </td>
                  <td style={{ padding: "10px 14px", color: C.cyan }}>{row.issued_qty ?? "—"}</td>
                  <td style={{ padding: "10px 14px", color: "#aaa" }}>{row.total_qty ?? "—"}</td>
                  <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <ActionBtn color={isLinked ? "#a78bfa" : C.cyan} outline small onClick={() => onItemClick(row.id)}>View ›</ActionBtn>
                      <ActionBtn color={isLinked ? "#a78bfa" : C.cyan} outline small onClick={() => setModal({ type: "edit", item: row })}>Edit</ActionBtn>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <LoadMoreBar meta={meta} onLoadMore={handleLoadMore} onLoadAll={handleLoadAll} loading={loadingMore} />
      </Panel>

      {modal === "new-item" && <NewItemModal categories={categories} locations={locations} onClose={() => setModal(null)} onSuccess={() => { setPage(1); setItems([]); load(1); }} toast={toast} />}
      {modal?.type === "edit" && <EditItemModal item={modal.item} categories={categories} locations={locations} onClose={() => setModal(null)} onSuccess={() => load(page, search, typeFilter, linkFilter, false)} toast={toast} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// INSTANCES TAB
// ═══════════════════════════════════════════════════════════════════════════════
function InstancesTab({ onInstanceClick, toast }) {
  const [instances,   setInstances]   = useState([]);
  const [meta,        setMeta]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search,      setSearch]      = useState("");
  const [statusFilter,setStatusFilter]= useState("all");
  const [page,        setPage]        = useState(1);
  const [modal,       setModal]       = useState(null);
  const [items,       setItems]       = useState([]);
  const [locations,   setLocations]   = useState([]);
  const debounceRef = useRef(null);

  const buildParams = (p, s, sf) => {
    const params = { page: p, per_page: 25 };
    if (s) params.search = s;
    if (sf !== "all") params.status = sf;
    return params;
  };

  const load = useCallback(async (p = 1, s = search, sf = statusFilter, append = false) => {
    append ? setLoadingMore(true) : setLoading(true);
    try {
      const res = await inventoryAPI.instances.index(buildParams(p, s, sf));
      const rows = res?.data ?? [];
      setInstances(prev => append ? [...prev, ...rows] : rows);
      setMeta(res?.meta ?? (res?.current_page != null ? res : null));
    } catch { toast("Failed to load instances", "error"); }
    finally { append ? setLoadingMore(false) : setLoading(false); }
  }, [toast]); // eslint-disable-line

  const loadSupport = useCallback(async () => {
    try {
      const [its, locs] = await Promise.all([inventoryAPI.items.index({ per_page: 200 }), inventoryAPI.locations.index()]);
      setItems(its?.data ?? its ?? []); setLocations(locs ?? []);
    } catch {}
  }, []);

  useEffect(() => { load(1); loadSupport(); }, [load, loadSupport]);

  const handleSearch = (v) => {
    setSearch(v); setPage(1); setInstances([]);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(1, v, statusFilter, false), 400);
  };
  const handleStatus = (v) => { setStatusFilter(v); setPage(1); setInstances([]); load(1, search, v, false); };

  const handleLoadMore = () => { const next = page + 1; setPage(next); load(next, search, statusFilter, true); };
  const handleLoadAll  = async () => {
    if (!meta) return;
    setLoadingMore(true);
    try {
      const rows = await fetchAllPages(params => inventoryAPI.instances.index(params), buildParams(1, search, statusFilter), page, meta.last_page);
      setInstances(prev => [...prev, ...rows]);
      setPage(meta.last_page);
      setMeta(prev => ({ ...prev, current_page: meta.last_page }));
    } catch { toast("Failed to load all instances", "error"); }
    finally { setLoadingMore(false); }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "center" }}>
        <SearchBar value={search} onChange={handleSearch} placeholder="Search asset tag, serial, item..." />
        <Select value={statusFilter} onChange={handleStatus} options={["all","available","issued","loaned","in_repair","retired","lost","disposed","obsolete"].map(s=>({value:s,label:s}))} />
        <ActionBtn color={C.green} onClick={() => setModal("new-instance")}>+ Add Instance</ActionBtn>
      </div>
      <Panel style={{ padding: 0 }}>
        <Table
          loading={loading}
          cols={[
            { key: "asset_tag", label: "Asset Tag", render: (v, row) => <span style={{ color: C.cyan, fontWeight: 700, cursor: "pointer" }} onClick={() => onInstanceClick(row.id)}>{v}</span> },
            { key: "item", label: "Item", render: (_, row) => row.item?.name ?? "—" },
            { key: "serial_number", label: "Serial No." },
            { key: "status", label: "Status", render: v => <Chip label={v} /> },
            { key: "condition", label: "Condition" },
            { key: "location", label: "Location", render: (_, row) => row.location?.name ?? "—" },
            { key: "_view", label: "", render: (_, row) => <ActionBtn color={C.cyan} outline small onClick={() => onInstanceClick(row.id)}>View ›</ActionBtn> },
          ]}
          rows={instances}
        />
        <LoadMoreBar meta={meta} onLoadMore={handleLoadMore} onLoadAll={handleLoadAll} loading={loadingMore} />
      </Panel>
      {modal === "new-instance" && <NewInstanceModal items={items} locations={locations} onClose={() => setModal(null)} onSuccess={() => { setPage(1); setInstances([]); load(1); }} toast={toast} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ASSIGNMENTS TAB
// ═══════════════════════════════════════════════════════════════════════════════
function AssignmentsTab({ toast }) {
  const [assignments, setAssignments] = useState([]);
  const [meta,        setMeta]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search,      setSearch]      = useState("");
  const [filter,      setFilter]      = useState("all");
  const [page,        setPage]        = useState(1);
  const [modal,       setModal]       = useState(null);
  const debounceRef = useRef(null);

  const buildParams = (p, s, f) => {
    const params = { page: p, per_page: 25 };
    if (s) params.search = s;
    if (f !== "all") params.status = f;
    return params;
  };

  const load = useCallback(async (p = 1, s = search, f = filter, append = false) => {
    append ? setLoadingMore(true) : setLoading(true);
    try {
      const res = await inventoryAPI.assignments.index(buildParams(p, s, f));
      const rows = res?.data ?? [];
      setAssignments(prev => append ? [...prev, ...rows] : rows);
      setMeta(res?.meta ?? (res?.current_page != null ? res : null));
    } catch { toast("Failed to load assignments", "error"); }
    finally { append ? setLoadingMore(false) : setLoading(false); }
  }, [toast]); // eslint-disable-line

  useEffect(() => { load(1); }, [load]);

  const handleSearch = (v) => {
    setSearch(v); setPage(1); setAssignments([]);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(1, v, filter, false), 400);
  };
  const handleFilter = (v) => { setFilter(v); setPage(1); setAssignments([]); load(1, search, v, false); };

  const handleLoadMore = () => { const next = page + 1; setPage(next); load(next, search, filter, true); };
  const handleLoadAll  = async () => {
    if (!meta) return;
    setLoadingMore(true);
    try {
      const rows = await fetchAllPages(params => inventoryAPI.assignments.index(params), buildParams(1, search, filter), page, meta.last_page);
      setAssignments(prev => [...prev, ...rows]);
      setPage(meta.last_page);
      setMeta(prev => ({ ...prev, current_page: meta.last_page }));
    } catch { toast("Failed to load all assignments", "error"); }
    finally { setLoadingMore(false); }
  };

  const markOverdue = async () => {
    try { await inventoryAPI.assignments.markOverdue(); toast("Overdue sweep complete", "success"); setPage(1); setAssignments([]); load(1); }
    catch { toast("Failed to run overdue sweep", "error"); }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "center", flexWrap: "wrap" }}>
        <SearchBar value={search} onChange={handleSearch} placeholder="Search assignee, asset tag..." />
        <Select value={filter} onChange={handleFilter} options={["all","active","overdue","returned","lost","disputed"].map(s=>({value:s,label:s}))} />
        <ActionBtn color={C.cyan} onClick={() => setModal("issue")}>Issue Item</ActionBtn>
        <ActionBtn color={C.blue} outline onClick={() => setModal("loan")}>New Loan</ActionBtn>
        <ActionBtn color={C.purple} outline onClick={() => setModal("department")}>Dept Assignment</ActionBtn>
        <ActionBtn color={C.amber} outline onClick={markOverdue}>⚠ Mark Overdue</ActionBtn>
      </div>
      <Panel style={{ padding: 0 }}>
        <Table
          loading={loading}
          cols={[
            { key: "instance", label: "Asset Tag", render: (_, row) => <span style={{ color: C.cyan, fontWeight: 700 }}>{row.instance?.asset_tag ?? `#${row.id}`}</span> },
            { key: "item", label: "Item", render: (_, row) => row.instance?.item?.name ?? row.item?.name ?? "—" },
            { key: "assignment_type", label: "Type", render: v => <span style={{ color: v === "loan" ? C.blue : C.cyan, fontFamily: mono, fontSize: 11, fontWeight: 600 }}>{v}</span> },
            { key: "assignee_label", label: "Assignee" },
            { key: "assignee_type", label: "To", render: v => <span style={{ color: "#888", fontSize: 11 }}>{v}</span> },
            { key: "issued_at", label: "Issued", render: v => v?.slice(0, 10) },
            { key: "expected_return_date", label: "Due", render: v => v ? <span style={{ color: C.amber }}>{v?.slice(0,10)}</span> : <span style={{ color: "#555" }}>—</span> },
            { key: "status", label: "Status", render: v => <Chip label={v} /> },
            { key: "_actions", label: "", render: (_, row) => (row.status === "active" || row.status === "overdue") ? <ActionBtn color={C.green} outline small onClick={() => setModal({ type: "return", assignment: row })}>Return</ActionBtn> : null },
          ]}
          rows={assignments}
        />
        <LoadMoreBar meta={meta} onLoadMore={handleLoadMore} onLoadAll={handleLoadAll} loading={loadingMore} />
      </Panel>
      {modal === "issue" && <IssueModal mode="issue" onClose={() => setModal(null)} onSuccess={() => { setPage(1); setAssignments([]); load(1); }} toast={toast} />}
      {modal === "loan" && <IssueModal mode="loan" onClose={() => setModal(null)} onSuccess={() => { setPage(1); setAssignments([]); load(1); }} toast={toast} />}
      {modal === "department" && <IssueModal mode="department" onClose={() => setModal(null)} onSuccess={() => { setPage(1); setAssignments([]); load(1); }} toast={toast} />}
      {modal?.type === "return" && <ReturnModal assignment={modal.assignment} onClose={() => setModal(null)} onSuccess={() => { setPage(1); setAssignments([]); load(1); }} toast={toast} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPAIRS TAB
// ═══════════════════════════════════════════════════════════════════════════════
function RepairsTab({ toast }) {
  const [repairs,     setRepairs]     = useState([]);
  const [meta,        setMeta]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter,      setFilter]      = useState("all");
  const [page,        setPage]        = useState(1);
  const [modal,       setModal]       = useState(null);
  const [items,       setItems]       = useState([]);

  const buildParams = (p, f) => {
    const params = { page: p, per_page: 25 };
    if (f !== "all") params.status = f;
    return params;
  };

  const load = useCallback(async (p = 1, f = filter, append = false) => {
    append ? setLoadingMore(true) : setLoading(true);
    try {
      const res = await inventoryAPI.repairs.index(buildParams(p, f));
      const rows = res?.data ?? [];
      setRepairs(prev => append ? [...prev, ...rows] : rows);
      setMeta(res?.meta ?? (res?.current_page != null ? res : null));
    } catch { toast("Failed to load repairs", "error"); }
    finally { append ? setLoadingMore(false) : setLoading(false); }
  }, [toast]); // eslint-disable-line

  const loadItems = useCallback(async () => {
    try { const res = await inventoryAPI.items.index({ per_page: 200 }); setItems(res?.data ?? res ?? []); } catch {}
  }, []);

  useEffect(() => { load(1); loadItems(); }, [load, loadItems]);

  const handleFilter = (v) => { setFilter(v); setPage(1); setRepairs([]); load(1, v, false); };

  const handleLoadMore = () => { const next = page + 1; setPage(next); load(next, filter, true); };
  const handleLoadAll  = async () => {
    if (!meta) return;
    setLoadingMore(true);
    try {
      const rows = await fetchAllPages(params => inventoryAPI.repairs.index(params), buildParams(1, filter), page, meta.last_page);
      setRepairs(prev => [...prev, ...rows]);
      setPage(meta.last_page);
      setMeta(prev => ({ ...prev, current_page: meta.last_page }));
    } catch { toast("Failed to load all repairs", "error"); }
    finally { setLoadingMore(false); }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "center" }}>
        <Select value={filter} onChange={handleFilter} options={["all","reported","sent","completed","unrepairable"].map(s=>({value:s,label:s}))} />
        <ActionBtn color={C.amber} onClick={() => setModal("report")}>⚙ Report Repair</ActionBtn>
      </div>
      <Panel style={{ padding: 0 }}>
        <Table
          loading={loading}
          cols={[
            { key: "id", label: "#", render: v => <span style={{ color: "#555" }}>#{v}</span> },
            { key: "instance", label: "Instance", render: (_, row) => <span style={{ color: C.cyan, fontWeight: 700 }}>{row.instance?.asset_tag ?? "—"}</span> },
            { key: "item", label: "Item", render: (_, row) => row.instance?.item?.name ?? row.item?.name ?? "—" },
            { key: "fault_description", label: "Fault", render: v => <span style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", display: "inline-block" }}>{v}</span> },
            { key: "status", label: "Status", render: v => <Chip label={v} /> },
            { key: "reported_condition", label: "Condition" },
            { key: "created_at", label: "Reported", render: v => v?.slice(0, 10) },
            { key: "_actions", label: "", render: (_, row) => (
              <div style={{ display: "flex", gap: 6 }}>
                {row.status === "reported" && <ActionBtn color={C.blue} outline small onClick={() => setModal({ type: "send", repair: row })}>Send</ActionBtn>}
                {(row.status === "sent" || row.status === "reported") && (
                  <div title={row.status === "reported" ? "Send to vendor first before marking complete" : undefined} style={{ display: "inline-flex" }}>
                    <ActionBtn
                      color={C.green}
                      outline
                      small
                      disabled={row.status === "reported"}
                      onClick={() => row.status === "sent" && setModal({ type: "complete", repair: row })}
                    >
                      Complete
                    </ActionBtn>
                  </div>
                )}
                {row.status !== "completed" && row.status !== "unrepairable" && <ActionBtn color={C.red} outline small onClick={() => setModal({ type: "unrepairable", repair: row })}>Unrepairable</ActionBtn>}
              </div>
            )},
          ]}
          rows={repairs}
        />
        <LoadMoreBar meta={meta} onLoadMore={handleLoadMore} onLoadAll={handleLoadAll} loading={loadingMore} />
      </Panel>
      {modal === "report" && <RepairModal items={items} onClose={() => setModal(null)} onSuccess={() => { setPage(1); setRepairs([]); load(1); }} toast={toast} />}
      {modal?.type === "send" && <RepairActionModal repair={modal.repair} action="send" onClose={() => setModal(null)} onSuccess={() => load(page, filter, false)} toast={toast} />}
      {modal?.type === "complete" && <RepairActionModal repair={modal.repair} action="complete" onClose={() => setModal(null)} onSuccess={() => load(page, filter, false)} toast={toast} />}
      {modal?.type === "unrepairable" && <RepairActionModal repair={modal.repair} action="unrepairable" onClose={() => setModal(null)} onSuccess={() => load(page, filter, false)} toast={toast} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DISPUTES TAB
// ═══════════════════════════════════════════════════════════════════════════════
function DisputesTab({ toast }) {
  const [disputes,    setDisputes]    = useState([]);
  const [meta,        setMeta]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter,      setFilter]      = useState("all");
  const [page,        setPage]        = useState(1);
  const [modal,       setModal]       = useState(null);
  const [assignments, setAssignments] = useState([]);

  const buildParams = (p, f) => {
    const params = { page: p, per_page: 25 };
    if (f !== "all") params.status = f;
    return params;
  };

  const load = useCallback(async (p = 1, f = filter, append = false) => {
    append ? setLoadingMore(true) : setLoading(true);
    try {
      const res = await inventoryAPI.disputes.index(buildParams(p, f));
      const rows = res?.data ?? [];
      setDisputes(prev => append ? [...prev, ...rows] : rows);
      setMeta(res?.meta ?? (res?.current_page != null ? res : null));
    } catch { toast("Failed to load disputes", "error"); }
    finally { append ? setLoadingMore(false) : setLoading(false); }
  }, [toast]); // eslint-disable-line

  const loadAssignments = useCallback(async () => {
    try { const res = await inventoryAPI.assignments.index({ per_page: 200, status: "active" }); setAssignments(res?.data ?? res ?? []); } catch {}
  }, []);

  useEffect(() => { load(1); loadAssignments(); }, [load, loadAssignments]);

  const handleFilter = (v) => { setFilter(v); setPage(1); setDisputes([]); load(1, v, false); };

  const handleLoadMore = () => { const next = page + 1; setPage(next); load(next, filter, true); };
  const handleLoadAll  = async () => {
    if (!meta) return;
    setLoadingMore(true);
    try {
      const rows = await fetchAllPages(params => inventoryAPI.disputes.index(params), buildParams(1, filter), page, meta.last_page);
      setDisputes(prev => [...prev, ...rows]);
      setPage(meta.last_page);
      setMeta(prev => ({ ...prev, current_page: meta.last_page }));
    } catch { toast("Failed to load all disputes", "error"); }
    finally { setLoadingMore(false); }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "center" }}>
        <Select value={filter} onChange={handleFilter} options={["all","open","resolved","dismissed"].map(s=>({value:s,label:s}))} />
        <ActionBtn color={C.red} onClick={() => setModal("open")}>⚑ Open Dispute</ActionBtn>
      </div>
      <Panel style={{ padding: 0 }}>
        <Table
          loading={loading}
          cols={[
            { key: "id", label: "#", render: v => <span style={{ color: "#555" }}>#{v}</span> },
            { key: "instance", label: "Instance", render: (_, row) => <span style={{ color: C.cyan, fontWeight: 700 }}>{row.instance?.asset_tag ?? "—"}</span> },
            { key: "dispute_type", label: "Type", render: v => <span style={{ color: C.red, fontFamily: mono, fontSize: 11, fontWeight: 600 }}>{v}</span> },
            { key: "description", label: "Description", render: v => <span style={{ maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", display: "inline-block" }}>{v}</span> },
            { key: "raisedBy", label: "Raised By", render: (_, row) => row.raisedBy?.name ?? "—" },
            { key: "status", label: "Status", render: v => <Chip label={v} /> },
            { key: "ruling", label: "Ruling", render: v => v ? <span style={{ color: C.purple, fontFamily: mono, fontSize: 11 }}>{v}</span> : <span style={{ color: "#555" }}>—</span> },
            { key: "_actions", label: "", render: (_, row) => row.status === "open" ? <ActionBtn color={C.purple} outline small onClick={() => setModal({ type: "rule", dispute: row })}>Rule</ActionBtn> : null },
          ]}
          rows={disputes}
        />
        <LoadMoreBar meta={meta} onLoadMore={handleLoadMore} onLoadAll={handleLoadAll} loading={loadingMore} />
      </Panel>
      {modal === "open" && <DisputeModal assignments={assignments} onClose={() => setModal(null)} onSuccess={() => { setPage(1); setDisputes([]); load(1); }} toast={toast} />}
      {modal?.type === "rule" && <RuleModal dispute={modal.dispute} onClose={() => setModal(null)} onSuccess={() => load(page, filter, false)} toast={toast} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUDITS TAB
// ═══════════════════════════════════════════════════════════════════════════════
function AuditsTab({ toast }) {
  const [audits,      setAudits]      = useState([]);
  const [meta,        setMeta]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter,      setFilter]      = useState("all");
  const [page,        setPage]        = useState(1);
  const [modal,       setModal]       = useState(null);

  const buildParams = (p, f) => {
    const params = { page: p, per_page: 25 };
    if (f !== "all") params.status = f;
    return params;
  };

  const load = useCallback(async (p = 1, f = filter, append = false) => {
    append ? setLoadingMore(true) : setLoading(true);
    try {
      const res = await inventoryAPI.audits.index(buildParams(p, f));
      const rows = res?.data ?? [];
      setAudits(prev => append ? [...prev, ...rows] : rows);
      setMeta(res?.meta ?? (res?.current_page != null ? res : null));
    } catch { toast("Failed to load audits", "error"); }
    finally { append ? setLoadingMore(false) : setLoading(false); }
  }, [toast]); // eslint-disable-line

  useEffect(() => { load(1); }, [load]);

  const handleFilter = (v) => { setFilter(v); setPage(1); setAudits([]); load(1, v, false); };

  const handleLoadMore = () => { const next = page + 1; setPage(next); load(next, filter, true); };
  const handleLoadAll  = async () => {
    if (!meta) return;
    setLoadingMore(true);
    try {
      const rows = await fetchAllPages(params => inventoryAPI.audits.index(params), buildParams(1, filter), page, meta.last_page);
      setAudits(prev => [...prev, ...rows]);
      setPage(meta.last_page);
      setMeta(prev => ({ ...prev, current_page: meta.last_page }));
    } catch { toast("Failed to load all audits", "error"); }
    finally { setLoadingMore(false); }
  };

  const finalise = async (audit) => {
    try { await inventoryAPI.audits.finalise(audit.id, { auto_process_returns: true }); toast("Audit finalised", "success"); load(page, filter, false); }
    catch (e) { toast(e?.response?.data?.message ?? "Failed to finalise", "error"); }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "center" }}>
        <Select value={filter} onChange={handleFilter} options={["all","draft","in_progress","finalised"].map(s=>({value:s,label:s}))} />
        <ActionBtn color={C.cyan} onClick={() => setModal("create")}>✦ Create Audit</ActionBtn>
      </div>
      <Panel style={{ padding: 0 }}>
        <Table
          loading={loading}
          cols={[
            { key: "id", label: "#", render: v => <span style={{ color: "#555" }}>#{v}</span> },
            { key: "trigger_type", label: "Trigger", render: v => <span style={{ color: C.cyan, fontFamily: mono, fontSize: 11, fontWeight: 600 }}>{v}</span> },
            { key: "assignee_label", label: "Assignee" },
            { key: "assignee_type", label: "Type", render: v => <span style={{ color: "#888", fontSize: 11 }}>{v}</span> },
            { key: "audit_date", label: "Date", render: v => v?.slice(0, 10) },
            { key: "status", label: "Status", render: v => <Chip label={v} /> },
            { key: "conductedBy", label: "Conducted By", render: (_, row) => row.conductedBy?.name ?? "—" },
            { key: "_actions", label: "", render: (_, row) => row.status !== "finalised" ? <ActionBtn color={C.green} outline small onClick={() => finalise(row)}>Finalise</ActionBtn> : null },
          ]}
          rows={audits}
        />
        <LoadMoreBar meta={meta} onLoadMore={handleLoadMore} onLoadAll={handleLoadAll} loading={loadingMore} />
      </Panel>
      {modal === "create" && <AuditCreateModal onClose={() => setModal(null)} onSuccess={() => { setPage(1); setAudits([]); load(1); }} toast={toast} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// GROUPS TAB (no pagination needed — loads all at once)
// ═══════════════════════════════════════════════════════════════════════════════
function GroupsTab({ toast }) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await inventoryAPI.groups.index(); setGroups(res?.data ?? res ?? []); }
    catch { toast("Failed to load groups", "error"); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const deleteGroup = async (id) => {
    if (!window.confirm("Delete this group?")) return;
    try { await inventoryAPI.groups.destroy(id); toast("Group deleted", "success"); load(); }
    catch (e) { toast(e?.response?.data?.message ?? "Failed", "error"); }
  };

  const removeMember = async (groupId, memberId) => {
    try { await inventoryAPI.groups.removeMember(groupId, memberId); toast("Member removed", "success"); load(); }
    catch (e) { toast(e?.response?.data?.message ?? "Failed", "error"); }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <ActionBtn color={C.green} onClick={() => setModal("new-group")}>+ New Group</ActionBtn>
      </div>
      {loading ? (
        <div style={{ padding: 48, textAlign: "center", fontFamily: mono, color: "#555" }}>◈ loading…</div>
      ) : groups.length === 0 ? (
        <Panel><div style={{ fontFamily: mono, fontSize: 12, color: "#555", textAlign: "center", padding: "24px 0" }}>// no groups found</div></Panel>
      ) : groups.map(g => (
        <Panel key={g.id} style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: expanded === g.id ? 16 : 0 }}>
            <div>
              <span style={{ fontFamily: mono, fontSize: 14, fontWeight: 700 }}>{g.name}</span>
              <span style={{ fontFamily: mono, fontSize: 11, color: "#555", marginLeft: 12 }}>{g.members?.length ?? 0} members</span>
              {g.description && <div style={{ fontFamily: mono, fontSize: 11, color: "#888", marginTop: 4 }}>{g.description}</div>}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <ActionBtn small outline color={C.cyan} onClick={() => setExpanded(expanded === g.id ? null : g.id)}>{expanded === g.id ? "▲ Collapse" : "▼ Members"}</ActionBtn>
              <ActionBtn small outline color={C.green} onClick={() => setModal({ type: "add-member", group: g })}>+ Member</ActionBtn>
              <ActionBtn small outline color={C.cyan} onClick={() => setModal({ type: "edit-group", group: g })}>Edit</ActionBtn>
              <ActionBtn small outline color={C.red} onClick={() => deleteGroup(g.id)}>✕</ActionBtn>
            </div>
          </div>
          {expanded === g.id && (
            <div>
              {(!g.members || g.members.length === 0)
                ? <div style={{ fontFamily: mono, fontSize: 12, color: "#555" }}>No members.</div>
                : g.members.map(m => (
                  <div key={m.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontFamily: mono, fontSize: 12 }}>
                          {m.member_type === "customer"
                            ? `${m.member?.first_name ?? ""} ${m.member?.last_name ?? ""}`.trim() || m.member_label
                            : m.member_label}
                        </span>
                        <span style={{ fontFamily: mono, fontSize: 10, color: "#555" }}>{m.member_type}</span>
                      </div>
                      {m.member_type === "customer" && m.member?.email && (
                        <span style={{ fontFamily: mono, fontSize: 10, color: "#888" }}>{m.member.email}</span>
                      )}
                      {m.member_type === "employee" && m.member?.is_admin && m.member?.work_email && (
                        <span style={{ fontFamily: mono, fontSize: 10, color: C.amber }}>⚑ {m.member.work_email}</span>
                      )}
                    </div>
                    <ActionBtn small outline color={C.red} onClick={() => removeMember(g.id, m.id)}>Remove</ActionBtn>
                  </div>
                ))
              }
            </div>
          )}
        </Panel>
      ))}
      {modal === "new-group" && <GroupModal onClose={() => setModal(null)} onSuccess={load} toast={toast} />}
      {modal?.type === "edit-group" && <GroupModal group={modal.group} onClose={() => setModal(null)} onSuccess={load} toast={toast} />}
      {modal?.type === "add-member" && <AddMemberModal group={modal.group} onClose={() => setModal(null)} onSuccess={load} toast={toast} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LEDGER TAB
// ═══════════════════════════════════════════════════════════════════════════════
function LedgerTab({ toast }) {
  const [movements,   setMovements]   = useState([]);
  const [meta,        setMeta]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [typeFilter,  setTypeFilter]  = useState("all");
  const [page,        setPage]        = useState(1);

  const buildParams = (p, tf) => {
    const params = { page: p, per_page: 50 };
    if (tf !== "all") params.movement_type = tf;
    return params;
  };

  const load = useCallback(async (p = 1, tf = typeFilter, append = false) => {
    append ? setLoadingMore(true) : setLoading(true);
    try {
      const res = await inventoryAPI.ledger.index(buildParams(p, tf));
      const rows = res?.data ?? [];
      setMovements(prev => append ? [...prev, ...rows] : rows);
      setMeta(res?.meta ?? (res?.current_page != null ? res : null));
    } catch { toast("Failed to load ledger", "error"); }
    finally { append ? setLoadingMore(false) : setLoading(false); }
  }, [toast]); // eslint-disable-line

  useEffect(() => { load(1); }, [load]);

  const handleTypeFilter = (v) => { setTypeFilter(v); setPage(1); setMovements([]); load(1, v, false); };

  const handleLoadMore = () => { const next = page + 1; setPage(next); load(next, typeFilter, true); };

  // Ledger may have many pages — batched sequential fetch in groups of 5
  const handleLoadAll = async () => {
    if (!meta) return;
    setLoadingMore(true);
    try {
      const remaining = Array.from({ length: meta.last_page - page }, (_, i) => page + 1 + i);
      const batchSize = 5;
      let allRows = [];
      for (let i = 0; i < remaining.length; i += batchSize) {
        const batch = remaining.slice(i, i + batchSize);
        const results = await Promise.all(batch.map(p => inventoryAPI.ledger.index(buildParams(p, typeFilter))));
        allRows = [...allRows, ...results.flatMap(r => r?.data ?? r ?? [])];
      }
      setMovements(prev => [...prev, ...allRows]);
      setPage(meta.last_page);
      setMeta(prev => ({ ...prev, current_page: meta.last_page }));
    } catch { toast("Failed to load all ledger entries", "error"); }
    finally { setLoadingMore(false); }
  };

  const types = ["all","procured","issued","loaned","returned","loan_returned","repair_out","repair_in","condition_updated","status_changed","written_off","disposed","declared_obsolete"];

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "center" }}>
        <Select value={typeFilter} onChange={handleTypeFilter} options={types.map(t => ({ value: t, label: t }))} />
        <span style={{ fontFamily: mono, fontSize: 11, color: "#555" }}>// immutable append-only ledger</span>
      </div>
      <Panel style={{ padding: 0 }}>
        <Table
          loading={loading}
          cols={[
            { key: "id", label: "#", render: v => <span style={{ color: "#555" }}>#{v}</span> },
            { key: "movement_type", label: "Movement", render: v => <span style={{ color: MOVEMENT_COLOR[v] || "#888", fontWeight: 700, fontFamily: mono }}>{v}</span> },
            { key: "instance", label: "Instance", render: (_, row) => <span style={{ color: C.cyan }}>{row.instance?.asset_tag ?? "—"}</span> },
            { key: "item", label: "Item", render: (_, row) => row.item?.name ?? row.instance?.item?.name ?? "—" },
            { key: "status_before", label: "Before", render: v => v ? <Chip label={v} /> : <span style={{ color: "#555" }}>—</span> },
            { key: "status_after", label: "After", render: v => v ? <Chip label={v} /> : <span style={{ color: "#555" }}>—</span> },
            { key: "performedBy", label: "By", render: (_, row) => <span style={{ color: "#888", fontSize: 11 }}>{row.performedBy?.name ?? "System"}</span> },
            { key: "performed_at", label: "Timestamp", render: v => <span style={{ color: "#555", fontSize: 11 }}>{v?.slice(0,16).replace("T"," ")}</span> },
          ]}
          rows={movements}
        />
        <LoadMoreBar meta={meta} onLoadMore={handleLoadMore} onLoadAll={handleLoadAll} loading={loadingMore} />
      </Panel>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORT TAB (unchanged — no pagination)
// ═══════════════════════════════════════════════════════════════════════════════
function ExportTab({ toast }) {
  const [exportType, setExportType] = useState("instances");
  const [selectedCols, setSelectedCols] = useState(["id","asset_tag","item","status","condition","location","assignee","purchase_date","warranty_expiry"]);
  const [presets, setPresets] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loadingPresets, setLoadingPresets] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [running, setRunning] = useState(false);
  const [presetName, setPresetName] = useState("");
  const exportTypes = ["items","instances","assignments","lifecycle_movements","location_movements","repairs","audits","disputes","full"];
  const allCols = ["id","asset_tag","item","status","condition","location","assignee","purchase_date","warranty_expiry","serial_number","brand","model","cost","category"];

  const loadPresets = useCallback(async () => {
    setLoadingPresets(true);
    try { setPresets((await inventoryAPI.export.presets()) ?? []); }
    catch { toast("Failed to load presets", "error"); }
    finally { setLoadingPresets(false); }
  }, [toast]);

  const loadLogs = useCallback(async () => {
    setLoadingLogs(true);
    try { const res = await inventoryAPI.export.logs({ per_page: 10 }); setLogs(res?.data ?? res ?? []); }
    catch { toast("Failed to load export logs", "error"); }
    finally { setLoadingLogs(false); }
  }, [toast]);

  useEffect(() => { loadPresets(); loadLogs(); }, [loadPresets, loadLogs]);

  const toggleCol = (col) => setSelectedCols(c => c.includes(col) ? c.filter(x => x !== col) : [...c, col]);

  const runExport = async () => {
    setRunning(true);
    try { await inventoryAPI.export.run({ export_type: exportType, columns_included: selectedCols }); toast("Export queued successfully", "success"); loadLogs(); }
    catch (e) { toast(e?.response?.data?.message ?? "Export failed", "error"); }
    finally { setRunning(false); }
  };

  const savePreset = async () => {
    if (!presetName) { toast("Enter a preset name", "warning"); return; }
    try { await inventoryAPI.export.savePreset({ name: presetName, export_type: exportType, column_config: selectedCols }); toast("Preset saved", "success"); setPresetName(""); loadPresets(); }
    catch (e) { toast(e?.response?.data?.message ?? "Failed to save preset", "error"); }
  };

  const deletePreset = async (id) => {
    try { await inventoryAPI.export.deletePreset(id); toast("Preset deleted", "success"); loadPresets(); }
    catch { toast("Failed to delete preset", "error"); }
  };

  const loadPreset = (p) => { setExportType(p.export_type); setSelectedCols(p.column_config ?? []); };

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <Panel>
          <div style={{ fontFamily: mono, fontSize: 10, color: C.cyan, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 18 }}>// configure export</div>
          <Field label="Export Type">
            <select style={selectStyle} value={exportType} onChange={e => setExportType(e.target.value)}>
              {exportTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Columns">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {allCols.map(col => (
                <label key={col} style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: mono, fontSize: 12, cursor: "pointer" }}>
                  <input type="checkbox" checked={selectedCols.includes(col)} onChange={() => toggleCol(col)} style={{ accentColor: C.cyan }} />
                  <span>{col}</span>
                </label>
              ))}
            </div>
          </Field>
          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <ActionBtn color={C.green} onClick={runExport} disabled={running}>{running ? "Running…" : "⬇ Run Export"}</ActionBtn>
          </div>
          <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 20, paddingTop: 16 }}>
            <div style={{ fontFamily: mono, fontSize: 10, color: "#888", marginBottom: 8 }}>Save as preset</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input style={{ ...inputStyle, flex: 1 }} value={presetName} onChange={e => setPresetName(e.target.value)} placeholder="Preset name" />
              <ActionBtn color={C.cyan} outline onClick={savePreset}>Save</ActionBtn>
            </div>
          </div>
        </Panel>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Panel>
            <div style={{ fontFamily: mono, fontSize: 10, color: C.cyan, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 14 }}>// saved presets</div>
            {loadingPresets ? <div style={{ color: "#555", fontFamily: mono, fontSize: 12 }}>loading…</div>
              : presets.length === 0 ? <div style={{ color: "#555", fontFamily: mono, fontSize: 12 }}>No saved presets.</div>
              : presets.map((p, i) => (
                <div key={p.id ?? i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
                  <div>
                    <span style={{ fontFamily: mono, fontSize: 12 }}>{p.name}</span>
                    {p.is_default && <span style={{ marginLeft: 8, fontSize: 10, color: C.green, fontFamily: mono }}>DEFAULT</span>}
                    <div style={{ fontFamily: mono, fontSize: 10, color: "#555", marginTop: 2 }}>{p.export_type}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <ActionBtn color={C.cyan} outline small onClick={() => loadPreset(p)}>Load</ActionBtn>
                    <ActionBtn color={C.red} outline small onClick={() => deletePreset(p.id)}>✕</ActionBtn>
                  </div>
                </div>
              ))}
          </Panel>
          <Panel>
            <div style={{ fontFamily: mono, fontSize: 10, color: C.cyan, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 14 }}>// export log</div>
            {loadingLogs ? <div style={{ color: "#555", fontFamily: mono, fontSize: 12 }}>loading…</div>
              : logs.length === 0 ? <div style={{ color: "#555", fontFamily: mono, fontSize: 12 }}>No exports yet.</div>
              : logs.map((l, i) => (
                <div key={l.id ?? i} style={{ padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontFamily: mono, fontSize: 11, color: C.cyan }}>{l.file_name ?? l.export_type}</span>
                    <span style={{ fontFamily: mono, fontSize: 10, color: "#555" }}>{l.exported_at?.slice(0,16).replace("T"," ")}</span>
                  </div>
                  <div style={{ fontFamily: mono, fontSize: 10, color: "#888" }}>{l.export_type} · {l.row_count ?? "?"} rows · by {l.exportedBy?.name ?? "?"}</div>
                </div>
              ))}
          </Panel>
        </div>
      </div>
    </div>
  );
}

// ─── TABS CONFIG ──────────────────────────────────────────────────────────────
const TABS = [
  { id: "dashboard",   label: "Dashboard",   icon: "◈" },
  { id: "catalogue",   label: "Catalogue",   icon: "▤" },
  { id: "instances",   label: "Instances",   icon: "◉" },
  { id: "assignments", label: "Assignments", icon: "⇢" },
  { id: "repairs",     label: "Repairs",     icon: "⚙" },
  { id: "disputes",    label: "Disputes",    icon: "⚑" },
  { id: "audits",      label: "Audits",      icon: "✦" },
  { id: "groups",      label: "Groups",      icon: "⬡" },
  { id: "ledger",      label: "Ledger",      icon: "≡" },
  { id: "export",      label: "Export",      icon: "⬇" },
];

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function InventoryPage() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [subPage, setSubPage] = useState(null);
  const [clock, setClock] = useState(new Date());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [devNotesOpen, setDevNotesOpen] = useState(false);
  const { push: toast, ToastContainer } = useToast();

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    document.documentElement.classList.add('dark');
    return () => document.documentElement.classList.remove('dark');
  }, []);

  const handleTabChange = (tabId) => { setActiveTab(tabId); setSubPage(null); };
  const handleItemClick = (id) => setSubPage({ type: "item", id });
  const handleInstanceClick = (id) => setSubPage({ type: "instance", id });
  const handleBack = () => setSubPage(null);

  return (
    <SettingsLayout>
    <div style={{ fontFamily: sans, minHeight: "100vh", padding: "0 0 60px" }}>
      <style>{`
        @keyframes slideUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        select option { background: #111; color: #ddd; }
        input[type=date]::-webkit-calendar-picker-indicator { filter: invert(0.5); }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(0,229,255,0.2); border-radius: 3px; }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 28px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 34, height: 34, borderRadius: 6, border: `1px solid ${C.cyan}`, display: "flex", alignItems: "center", justifyContent: "center", background: `${C.cyan}14` }}>
            <span style={{ color: C.cyan, fontSize: 16, fontWeight: 700 }}>◈</span>
          </div>
          <div>
            <div style={{ fontFamily: mono, fontSize: 14, fontWeight: 700, letterSpacing: "0.06em", color: C.cyan }}>INVENTORY</div>
            <div style={{ fontFamily: mono, fontSize: 10, color: "#555", letterSpacing: "0.08em" }}>ASSET MANAGEMENT SYSTEM</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <span style={{ fontFamily: mono, fontSize: 11, color: "#555" }}>
            {clock.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>
          <ActionBtn color={C.amber} outline small onClick={() => setSettingsOpen(true)}>⚙ Settings</ActionBtn>
          <ActionBtn color={"#7c6aff"} outline small onClick={() => setDevNotesOpen(true)}>// dev</ActionBtn>
        </div>
      </div>

      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${C.border}`, padding: "0 28px", overflowX: "auto" }}>
        {TABS.map(tab => {
          const active = activeTab === tab.id && !subPage;
          return (
            <button key={tab.id} onClick={() => handleTabChange(tab.id)} style={{
              display: "flex", alignItems: "center", gap: 8, padding: "14px 18px",
              background: "transparent", border: "none",
              borderBottom: active ? `2px solid ${C.cyan}` : "2px solid transparent",
              color: active ? C.cyan : "inherit", fontFamily: mono, fontSize: 12,
              fontWeight: active ? 700 : 400, letterSpacing: "0.05em", cursor: "pointer",
              transition: "all 0.15s", opacity: active ? 1 : 0.5, marginBottom: -1, whiteSpace: "nowrap",
            }}>
              <span>{tab.icon}</span>{tab.label}
            </button>
          );
        })}
      </div>

      <div style={{ padding: "28px 28px 0" }}>
        {subPage ? (
          subPage.type === "item"
            ? <ItemDetailPage itemId={subPage.id} onBack={handleBack} toast={toast} />
            : <InstanceDetailPage instanceId={subPage.id} onBack={handleBack} toast={toast} />
        ) : (
          <>
            {activeTab === "dashboard"   && <DashboardTab onNavigate={handleTabChange} toast={toast} />}
            {activeTab === "catalogue"   && <CatalogueTab onItemClick={handleItemClick} toast={toast} />}
            {activeTab === "instances"   && <InstancesTab onInstanceClick={handleInstanceClick} toast={toast} />}
            {activeTab === "assignments" && <AssignmentsTab toast={toast} />}
            {activeTab === "repairs"     && <RepairsTab toast={toast} />}
            {activeTab === "disputes"    && <DisputesTab toast={toast} />}
            {activeTab === "audits"      && <AuditsTab toast={toast} />}
            {activeTab === "groups"      && <GroupsTab toast={toast} />}
            {activeTab === "ledger"      && <LedgerTab toast={toast} />}
            {activeTab === "export"      && <ExportTab toast={toast} />}
          </>
        )}
      </div>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} toast={toast} />}
      {devNotesOpen && <DevNotesModal onClose={() => setDevNotesOpen(false)} />}
      <ToastContainer />
    </div>
    </SettingsLayout>
  );
}
