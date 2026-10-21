import { useState, useEffect, useRef } from 'react';
import { GROUP_LABELS } from './vendorHelpers';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';
import { btnGhost, card, colors, radius } from '../../../../../_shared/theme/tokens';

const TONES = {
  success: { bg: colors.successBg, text: colors.successText },
  warning: { bg: colors.warningBg, text: colors.warningText },
  danger: { bg: colors.dangerBg, text: colors.dangerText },
  neutral: { bg: colors.neutralBg, text: colors.neutralText },
};

export function Chip({ tone = 'neutral', children, title }) {
  const t = TONES[tone];
  return <span title={title} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 10px', borderRadius: 999, fontSize: '0.7rem', fontWeight: 700, whiteSpace: 'nowrap', lineHeight: 1.6, background: t.bg, color: t.text }}>{children}</span>;
}

export function StatusChip({ status }) {
  if (status === 'active') return <Chip tone="success">Active</Chip>;
  if (status === 'suspended') return <Chip tone="danger">Suspended</Chip>;
  return <Chip tone="warning">{String(status || '').replace(/_/g, ' ') || 'Unknown'}</Chip>;
}

/** "2 to check", with what they are on hover. Nothing when the system found nothing. */
export function FlagChip({ flags }) {
  if (!flags?.length) return null;
  return <Chip tone="warning" title={flags.map((f) => f.text).join('\n')}>{flags.length} to check</Chip>;
}

/** The people category under a vendor's name: "Youth, confirmed" or "Youth, to confirm". */
export function GroupLine({ v }) {
  if (!v.special_group) return null;
  const ok = v.special_group_status === 'confirmed';
  return <div style={{ fontSize: '0.7rem', marginTop: 2, color: ok ? colors.successText : colors.warningText }}>{GROUP_LABELS[v.special_group] || v.special_group}, {ok ? 'confirmed' : 'to confirm'}</div>;
}

/** A "⋯" menu that floats above the page (so a table or card never clips it) and opens upward near the bottom. items: [{label, onClick, tone?}] (null entries are skipped; 'divider' draws a line). */
export function RowMenu({ items, label = 'More actions' }) {
  const [pos, setPos] = useState(null);
  const btn = useRef(null);
  const menu = useRef(null);
  const close = () => setPos(null);

  useEffect(() => {
    if (!pos) return undefined;
    const away = (e) => { if (!menu.current?.contains(e.target) && !btn.current?.contains(e.target)) close(); };
    const key = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', key);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', key); window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
  }, [pos]);

  const toggle = () => {
    if (pos) { close(); return; }
    const r = btn.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, bottom: window.innerHeight - r.top + 4, right: Math.max(8, window.innerWidth - r.right), up: window.innerHeight - r.bottom < 280 });
  };
  const shown = items.filter(Boolean);
  if (!shown.length) return null;

  return (
    <>
      <button ref={btn} type="button" aria-label={label} aria-expanded={!!pos} onClick={toggle} style={{ ...btnGhost, padding: '5px 9px' }}><MoreHorizontal size={15} /></button>
      {pos && createPortal(
        <div ref={menu} role="menu" style={{ ...card, position: 'fixed', zIndex: 1000, right: pos.right, ...(pos.up ? { bottom: pos.bottom } : { top: pos.top }), minWidth: 210, padding: 4 }}>
          {shown.map((it, i) => it === 'divider'
            ? <div key={i} style={{ height: 1, background: colors.tint(0.12), margin: '4px 6px' }} />
            : <button key={it.label} type="button" role="menuitem" onClick={() => { close(); it.onClick(); }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', borderRadius: radius.sm, fontFamily: 'inherit', fontSize: '0.8rem', cursor: 'pointer', color: it.tone === 'success' ? colors.successText : it.tone === 'danger' ? colors.dangerText : colors.text }}>{it.label}</button>)}
        </div>,
        document.body,
      )}
    </>
  );
}
