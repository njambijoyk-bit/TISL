import { useState } from 'react';

// ─── flag definitions ────────────────────────────────────────────────────────
// Each entry describes one toggle button in the "Flags" section.
// `field`   maps directly to the DB column / store flag key.
// `label`   shown on the button.
// `onColor` background when enabling; buttons for disabling always use a muted style.
const FLAG_DEFS = [
  { field: 'is_visible',  label: 'Visible',  onColor: '#16a34a', offColor: '#b91c1c' },
  { field: 'is_featured', label: 'Featured', onColor: '#b45309', offColor: '#6b7280' },
  { field: 'is_new',      label: 'New',      onColor: '#0369a1', offColor: '#6b7280' },
  { field: 'on_sale',     label: 'On Sale',  onColor: '#be185d', offColor: '#6b7280' },
];

const STATUS_DEFS = [
  { value: 'active',       label: 'Active',       color: '#16a34a' },
  { value: 'out_of_stock', label: 'Out of Stock',  color: '#d97706' },
  { value: 'inactive',     label: 'Inactive',      color: '#6b7280' },
  { value: 'draft',        label: 'Draft',         color: '#0369a1' },
];

/**
 * BulkActionsBar
 * Shows at bottom when rows are selected.
 *
 * Props
 * ─────
 * selectedCount   number
 * onSetPrice      (price: number) => void
 * onMarkNegotiable () => void
 * onSetFlags      (flags: Record<string, boolean>) => void   ← NEW
 * onClear         () => void
 */
export default function BulkActionsBar({
  selectedCount,
  onSetPrice,
  onMarkNegotiable,
  onSetFlags,
  onSetStatus, 
  onClear,
}) {
  const [bulkPrice, setBulkPrice] = useState('');

  const handleSetPrice = () => {
    const val = parseFloat(bulkPrice);
    if (isNaN(val) || val < 0) return;
    onSetPrice(val);
    setBulkPrice('');
  };

  if (selectedCount === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 24,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 900,
      background: 'var(--text-primary, #111)',
      color: '#fff',
      borderRadius: 12,
      padding: '12px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
      animation: 'slideUp 0.2s ease',
      whiteSpace: 'nowrap',
      flexWrap: 'wrap',
    }}>
      <style>{`
        @keyframes slideUp {
          from { transform: translateX(-50%) translateY(20px); opacity: 0; }
          to   { transform: translateX(-50%) translateY(0);    opacity: 1; }
        }
        .flag-btn { transition: filter 0.15s; }
        .flag-btn:hover { filter: brightness(1.15); }
      `}</style>

      {/* ── Count ──────────────────────────────────────────────────────── */}
      <span style={{
        background: 'var(--accent, #7c3aed)',
        borderRadius: 99,
        padding: '2px 10px',
        color: '#270330',
        fontSize: 12,
        fontWeight: 700,
      }}>
        {selectedCount} selected
      </span>

      <Divider />

      {/* ── Set price ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: '#7c3aed', fontSize: 15, fontWeight: 700 }}>Set price:</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={bulkPrice}
          onChange={e => setBulkPrice(e.target.value)}
          placeholder="0.00"
          style={{
            width: 80,
            padding: '5px 8px',
            borderRadius: 6,
            border: '1px solid #7c3aed',
            background: 'rgb(255,255,255)',
            color: '#270330',
            fontSize: 15,
            outline: 'none',
          }}
          onKeyDown={e => e.key === 'Enter' && handleSetPrice()}
        />
        <button
          onClick={handleSetPrice}
          disabled={!bulkPrice}
          style={{
            padding: '5px 12px',
            background: bulkPrice ? 'var(--accent, #7c3aed)' : 'rgba(255,255,255,0.15)',
            border: 'none',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: bulkPrice ? 'pointer' : 'not-allowed',
            color: '#fff',
          }}
        >Apply</button>
      </div>

      <Divider />

      {/* ── Mark negotiable ────────────────────────────────────────────── */}
      <button
        onClick={onMarkNegotiable}
        style={{
          padding: '5px 12px',
          background: 'rgba(255,47,193,0.99)',
          border: '1px solid rgb(240,10,171)',
          borderRadius: 6,
          color: '#5a0144',
          fontSize: 12,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        Mark Negotiable
      </button>

      <Divider />

      {/* ── Flag toggles ───────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em' }}>
          FLAGS:
        </span>
        {FLAG_DEFS.map(({ field, label, onColor, offColor }) => (
          <FlagToggle
            key={field}
            label={label}
            onColor={onColor}
            offColor={offColor}
            onEnable={() => onSetFlags({ [field]: true })}
            onDisable={() => onSetFlags({ [field]: false })}
          />
        ))}
      </div>

      <Divider />

      {/* ── Status ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em' }}>
          STATUS:
        </span>
        {STATUS_DEFS.map(({ value, label, color }) => (
          <button
            key={value}
            className="flag-btn"
            onClick={() => onSetStatus(value)}
            title={`Set status = ${value} for selected`}
            style={{
              padding: '4px 10px',
              background: color,
              border: 'none',
              borderRadius: 6,
              color: '#fff',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <Divider />

      {/* ── Clear ──────────────────────────────────────────────────────── */}
      <button
        onClick={onClear}
        style={{
          padding: '5px 10px',
          background: 'none',
          border: 'none',
          color: 'rgba(252,3,3,0.94)',
          fontSize: 13,
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >✕ Clear</button>
    </div>
  );
}

// ─── FlagToggle ──────────────────────────────────────────────────────────────
// Renders a split button:  [✓ Label]  [✕]
// Clicking the left side calls onEnable; right side calls onDisable.
function FlagToggle({ label, onColor, offColor, onEnable, onDisable }) {
  return (
    <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: `1px solid ${onColor}` }}>
      {/* Enable half */}
      <button
        className="flag-btn"
        onClick={onEnable}
        title={`Set ${label} = ON for selected`}
        style={{
          padding: '4px 9px',
          background: onColor,
          border: 'none',
          color: '#fff',
          fontSize: 11,
          fontWeight: 700,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          borderRight: `1px solid rgba(0,0,0,0.25)`,
        }}
      >
        <span style={{ fontSize: 10 }}>✓</span> {label}
      </button>

      {/* Disable half */}
      <button
        className="flag-btn"
        onClick={onDisable}
        title={`Set ${label} = OFF for selected`}
        style={{
          padding: '4px 7px',
          background: offColor,
          border: 'none',
          color: '#fff',
          fontSize: 11,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        ✕
      </button>
    </div>
  );
}

// ─── Divider ─────────────────────────────────────────────────────────────────
function Divider() {
  return <div style={{ width: 1, height: 24, background: '#7c3aed', flexShrink: 0 }} />;
}