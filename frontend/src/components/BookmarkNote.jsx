/**
 * BookmarkNote.jsx — with useFloatingWidgetAudio wired in
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  BookMarked, X, GripHorizontal, Trash2, Save,
  NotebookPen, CheckCircle, AlertCircle, ChevronRight,
  PinOff,
} from 'lucide-react';
import useNoteStore, { NOTE_MAX_LENGTH } from '../store/noteStore';
import { useAuthStore } from '../store';
import { useFloatingWidgetAudio } from '../hooks/useFloatingWidgetAudio';

const STORAGE_KEY_COLLAPSED  = 'bookmark_note_collapsed';
const STORAGE_KEY_PANEL_POS  = 'bookmark_note_panel_pos';
const STORAGE_KEY_PILL_TOP   = 'bookmark_note_pill_top';
const STORAGE_KEY_DOCKED     = 'bookmark_note_docked';
const STORAGE_KEY_DOCK_TOP   = 'bookmark_note_dock_top';

const ACCENT       = '#a855f7';
const ACCENT_DEEP  = '#7c3aed';
const ACCENT_FAINT = 'rgba(168,85,247,0.10)';
const ACCENT_BORDER= 'rgba(168,85,247,0.25)';
const PANEL_W      = 300;
const PANEL_GAP    = 8;

// ── Save status badge ─────────────────────────────────────────────────────────
function SaveStatus({ isSyncing, lastSyncedAt }) {
  if (isSyncing) return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10,
      color: '#117c05', fontWeight: 600 }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: '#117c05', opacity: 0.7,
        animation: 'notePulse 1s ease-in-out infinite',
        display: 'inline-block',
      }} />
      syncing…
    </span>
  );
  if (lastSyncedAt) return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10,
      color: 'rgba(100,100,100,0.6)', fontWeight: 500 }}>
      <CheckCircle size={10} strokeWidth={2.5} />
      saved
    </span>
  );
  return null;
}

const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
const safeLS = {
  get:     (k)    => { try { return localStorage.getItem(k); } catch { return null; } },
  set:     (k, v) => { try { localStorage.setItem(k, String(v)); } catch {} },
  getJSON: (k)    => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
  setJSON: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

export default function BookmarkNote() {
  const { isAuthenticated, user } = useAuthStore();
  const { note, setNote, clearNote, isSyncing, lastSyncedAt } = useNoteStore();
  const audio = useFloatingWidgetAudio();

  // ── Visibility delay ──────────────────────────────────────────────────────
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 700);
    return () => clearTimeout(t);
  }, []);

  // ── Collapsed ─────────────────────────────────────────────────────────────
  const [collapsed, setCollapsed] = useState(
    () => safeLS.get(STORAGE_KEY_COLLAPSED) !== 'false'
  );
  const setCollapsedPersist = (val) => {
    setCollapsed(val);
    safeLS.set(STORAGE_KEY_COLLAPSED, val);
    val ? audio.playCollapse() : audio.playExpand();
  };

  // ── Docked state ──────────────────────────────────────────────────────────
  const [docked, setDocked] = useState(
    () => safeLS.get(STORAGE_KEY_DOCKED) !== 'false'
  );
  const setDockedPersist = (val) => {
    setDocked(val);
    safeLS.set(STORAGE_KEY_DOCKED, val);
  };

  // ── Dock top ──────────────────────────────────────────────────────────────
  const [dockTop, setDockTop] = useState(() => {
    const v = safeLS.get(STORAGE_KEY_DOCK_TOP);
    return v ? clamp(Number(v), PANEL_GAP, window.innerHeight - 80) : 80;
  });
  const setDockTopPersist = (val) => {
    setDockTop(val);
    safeLS.set(STORAGE_KEY_DOCK_TOP, val);
  };

  // ── Pill top ──────────────────────────────────────────────────────────────
  const [pillTop, setPillTop] = useState(() => {
    const v = safeLS.get(STORAGE_KEY_PILL_TOP);
    return v ? Number(v) : null;
  });
  const getPillTop = () => pillTop ?? (window.innerHeight / 2);

  // ── Float panel position ──────────────────────────────────────────────────
  const [panelPos, setPanelPos] = useState(() => {
    const saved = safeLS.getJSON(STORAGE_KEY_PANEL_POS);
    if (saved) return {
      x: clamp(saved.x, PANEL_GAP, window.innerWidth - PANEL_W - PANEL_GAP),
      y: clamp(saved.y, PANEL_GAP, window.innerHeight - 60),
    };
    return { x: window.innerWidth - PANEL_W - PANEL_GAP, y: 80 };
  });

  // ── Pill drag ─────────────────────────────────────────────────────────────
  const pillDragging  = useRef(false);
  const pillDidDrag   = useRef(false);
  const pillDragStart = useRef({ my: 0, top: 0 });

  const onPillMouseDown = useCallback((e) => {
    e.preventDefault();
    pillDidDrag.current  = false;
    pillDragging.current = true;
    pillDragStart.current = { my: e.clientY, top: getPillTop() };
    audio.playDragStart();

    const onMove = (mv) => {
      if (!pillDragging.current) return;
      const dy = mv.clientY - pillDragStart.current.my;
      if (Math.abs(dy) > 3) pillDidDrag.current = true;
      const next = clamp(pillDragStart.current.top + dy, 48, window.innerHeight - 48);
      setPillTop(next);
      safeLS.set(STORAGE_KEY_PILL_TOP, next);
    };
    const onUp = () => {
      pillDragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [pillTop, audio]);

  // ── Panel drag ────────────────────────────────────────────────────────────
  const panelDragging  = useRef(false);
  const panelDragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });
  const dragDetached   = useRef(false);

  const onPanelHeaderMouseDown = useCallback((e) => {
    if (e.target.closest('button')) return;
    e.preventDefault();
    panelDragging.current = true;
    dragDetached.current  = false;
    audio.playDragStart();

    const startX = docked ? (window.innerWidth - PANEL_W) : panelPos.x;
    const startY = docked ? dockTop : panelPos.y;
    panelDragStart.current = { mx: e.clientX, my: e.clientY, px: startX, py: startY };

    const onMove = (mv) => {
      if (!panelDragging.current) return;
      const dx = mv.clientX - panelDragStart.current.mx;
      const dy = mv.clientY - panelDragStart.current.my;

      if (docked && !dragDetached.current) {
        if (Math.abs(dx) > 20) {
          dragDetached.current = true;
          setDockedPersist(false);
        } else {
          const ny = clamp(panelDragStart.current.py + dy, PANEL_GAP, window.innerHeight - 60);
          setDockTopPersist(ny);
          return;
        }
      }

      const nx = clamp(panelDragStart.current.px + dx, PANEL_GAP, window.innerWidth - PANEL_W - PANEL_GAP);
      const ny = clamp(panelDragStart.current.py + dy, PANEL_GAP, window.innerHeight - 60);
      const pos = { x: nx, y: ny };
      setPanelPos(pos);
      safeLS.setJSON(STORAGE_KEY_PANEL_POS, pos);
    };

    const onUp = () => {
      panelDragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [docked, panelPos, dockTop, audio]);

  // ── Clear confirmation ────────────────────────────────────────────────────
  const [confirmClear, setConfirmClear] = useState(false);
  const handleClear = () => {
    if (!confirmClear) { setConfirmClear(true); audio.playDelete(); return; }
    clearNote();
    setConfirmClear(false);
    audio.playDelete();
  };
  useEffect(() => { setConfirmClear(false); }, [note]);

  // ── Char warn tracking ────────────────────────────────────────────────────
  const prevCharsWarn = useRef(false);
  const prevCharsCrit = useRef(false);

  const handleNoteChange = (val) => {
    setNote(val);
    const left = NOTE_MAX_LENGTH - val.length;
    const warn = left < 200;
    const crit = left < 50;
    if ((warn && !prevCharsWarn.current) || (crit && !prevCharsCrit.current)) {
      audio.playCharWarn();
    }
    prevCharsWarn.current = warn;
    prevCharsCrit.current = crit;
  };

  // ── Guard ─────────────────────────────────────────────────────────────────
  const isCustomer = isAuthenticated && user?.role === 'customer';
  if (!visible || !isCustomer) return null;

  const charsLeft = NOTE_MAX_LENGTH - (note?.length ?? 0);
  const charsWarn = charsLeft < 200;
  const charsCrit = charsLeft < 50;

  const styleBlock = `
    @keyframes notePulse { 0%,100%{opacity:.4} 50%{opacity:1} }
    @keyframes noteSlideIn {
      from { opacity:0; transform: scale(0.96) translateX(12px); }
      to   { opacity:1; transform: scale(1)    translateX(0);    }
    }
    .note-textarea {
      width: 100%; box-sizing: border-box; resize: none;
      border: 1px solid rgba(168,85,247,0.15); border-radius: 10px;
      padding: 11px 12px; font-size: 13px; line-height: 1.65;
      font-family: 'Georgia','Palatino',serif;
      color: var(--text-primary, #e8e8e8);
      background: rgba(168,85,247,0.04); outline: none;
      transition: border-color 0.2s, background 0.2s;
      min-height: 160px; max-height: 300px;
    }
    .note-textarea:focus { border-color: rgba(168,85,247,0.45); background: rgba(168,85,247,0.07); }
    .note-textarea::placeholder { color: rgba(168,85,247,0.3); font-style: italic; }
    .note-btn {
      display:flex; align-items:center; justify-content:center; gap:5px;
      padding:6px 12px; border-radius:7px; border:none;
      font-size:11px; font-weight:700; cursor:pointer;
      transition: opacity 0.15s, transform 0.1s; letter-spacing:0.03em;
    }
    .note-btn:active { transform: scale(0.97); }
    .note-btn-primary { background: linear-gradient(135deg,${ACCENT},${ACCENT_DEEP}); color:#fff; }
    .note-btn-ghost   { background: rgba(168,85,247,0.08); color:${ACCENT}; border:1px solid ${ACCENT_BORDER}; }
    .note-btn-danger  { background: rgba(239,68,68,0.10); color:#ef4444; border:1px solid rgba(239,68,68,0.20); }
    .note-btn:hover   { opacity: 0.85; }
  `;

  // ── Collapsed pill ────────────────────────────────────────────────────────
  if (collapsed) return (
    <>
      <style>{styleBlock}</style>
      <button
        onMouseDown={onPillMouseDown}
        onClick={() => { if (!pillDidDrag.current) setCollapsedPersist(false); }}
        onMouseEnter={audio.playHover}
        title="Open bookmark notes"
        style={{
          position: 'fixed', right: 0, top: getPillTop(),
          transform: 'translateY(-50%)',
          zIndex: 900,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 5,
          width: 36, padding: '14px 0',
          borderRadius: '10px 0 0 10px',
          border: `1px solid ${ACCENT_BORDER}`, borderRight: 'none',
          background: 'var(--bg-primary, #0f0f0f)',
          boxShadow: `-3px 0 16px rgba(0,0,0,0.18), inset 3px 0 0 ${ACCENT}`,
          cursor: 'grab', userSelect: 'none',
          transition: 'box-shadow 0.2s, transform 0.2s',
        }}
        onMouseLeave={e => {
          e.currentTarget.style.boxShadow = `-3px 0 16px rgba(0,0,0,0.18), inset 3px 0 0 ${ACCENT}`;
          e.currentTarget.style.transform = 'translateY(-50%)';
        }}
      >
        <BookMarked size={15} color={ACCENT} strokeWidth={2.2} />
        {note?.trim() && (
          <span style={{
            writingMode: 'vertical-rl', textOrientation: 'mixed',
            fontSize: 9, fontWeight: 800, color: ACCENT,
            letterSpacing: '0.05em', marginTop: 4,
            maxHeight: 60, overflow: 'hidden', opacity: 0.75,
          }}>note</span>
        )}
        <ChevronRight size={11} color={ACCENT} strokeWidth={2.5} style={{ opacity: 0.5, marginTop: 2 }} />
      </button>
    </>
  );

  // ── Expanded panel ────────────────────────────────────────────────────────
  const panelStyle = docked
    ? { position: 'fixed', right: 0, top: dockTop, width: PANEL_W, borderRadius: '16px 0 0 16px', borderRight: 'none' }
    : { position: 'fixed', left: panelPos.x, top: panelPos.y, width: clamp(PANEL_W, 200, window.innerWidth - PANEL_GAP * 2), borderRadius: 16 };

  return (
    <>
      <style>{styleBlock}</style>
      <div style={{
        ...panelStyle,
        zIndex: 950,
        border: `1px solid ${ACCENT_BORDER}`,
        background: 'var(--bg-primary, #111114)',
        boxShadow: docked
          ? `-6px 0 32px rgba(0,0,0,0.3), -2px 0 0 ${ACCENT}`
          : `0 8px 40px rgba(0,0,0,0.35), 0 0 0 1px rgba(168,85,247,0.08), inset 0 1px 0 rgba(255,255,255,0.04)`,
        animation: 'noteSlideIn 0.24s cubic-bezier(0.34,1.56,0.64,1)',
        overflow: 'hidden',
        userSelect: 'none',
      }}>

        {/* ── Header ── */}
        <div
          onMouseDown={onPanelHeaderMouseDown}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '11px 14px',
            background: ACCENT_FAINT,
            borderBottom: `1px solid ${ACCENT_BORDER}`,
            cursor: docked ? 'ns-resize' : 'grab',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BookMarked size={15} color={ACCENT} strokeWidth={2.2} />
            <span style={{ fontSize: 12, fontWeight: 800, color: ACCENT, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Bookmark Note
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 9, color: 'rgba(168,85,247,0.35)', fontWeight: 500, letterSpacing: '0.04em', marginRight: 2 }}>
              {docked ? 'drag left to float' : ''}
            </span>
            <GripHorizontal size={13} color='rgba(168,85,247,0.35)' strokeWidth={2} />

            {!docked && (
              <button
                onMouseDown={e => e.stopPropagation()}
                onMouseEnter={audio.playHover}
                onClick={() => {
                  setDockedPersist(true);
                  setDockTopPersist(clamp(panelPos.y, PANEL_GAP, window.innerHeight - 80));
                }}
                title="Re-dock to edge"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(168,85,247,0.4)', padding: '2px 4px', borderRadius: 5, display: 'flex', alignItems: 'center', transition: 'color 0.15s' }}
                onMouseLeave={e => e.currentTarget.style.color = 'rgba(168,85,247,0.4)'}
              >
                <PinOff size={12} strokeWidth={2.5} />
              </button>
            )}

            <button
              onMouseDown={e => e.stopPropagation()}
              onMouseEnter={audio.playHover}
              onClick={() => setCollapsedPersist(true)}
              title="Minimise"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(168,85,247,0.5)', padding: '2px 4px', borderRadius: 5, display: 'flex', alignItems: 'center', transition: 'color 0.15s' }}
              onMouseLeave={e => e.currentTarget.style.color = 'rgba(168,85,247,0.5)'}
            >
              <X size={14} strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div style={{ padding: '14px 14px 12px', userSelect: 'text' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <NotebookPen size={12} color='rgba(168,85,247,0.5)' strokeWidth={2} />
              <span style={{ fontSize: 10, color: 'rgba(168,85,247,0.5)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                scratch pad
              </span>
            </div>
            <SaveStatus isSyncing={isSyncing} lastSyncedAt={lastSyncedAt} />
          </div>

          <textarea
            className="note-textarea"
            value={note ?? ''}
            onChange={e => handleNoteChange(e.target.value)}
            onFocus={audio.playFieldFocus}
            placeholder="jot down a thought, product ref, or anything you want to remember…"
            maxLength={NOTE_MAX_LENGTH}
            spellCheck
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 5, marginBottom: 10 }}>
            <span style={{
              fontSize: 10, fontWeight: 600,
              color: charsCrit ? '#ef4444' : charsWarn ? '#f59e0b' : 'rgba(100,100,100,0.5)',
              transition: 'color 0.2s',
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              {charsCrit && <AlertCircle size={10} strokeWidth={2.5} />}
              {charsLeft} / {NOTE_MAX_LENGTH}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 7 }}>
            {note?.trim() && (
              <button
                className={`note-btn ${confirmClear ? 'note-btn-danger' : 'note-btn-ghost'}`}
                onClick={handleClear}
                onMouseEnter={audio.playHover}
                style={{ flex: 1 }}
              >
                <Trash2 size={11} strokeWidth={2.5} />
                {confirmClear ? 'confirm clear' : 'clear'}
              </button>
            )}
            <button
              className="note-btn note-btn-primary"
              onMouseEnter={audio.playHover}
              style={{ flex: note?.trim() ? 1 : 2 }}
              onClick={() => {
                if (note?.trim()) {
                  audio.playSave();
                  import('../api/axios').then(({ default: api }) => {
                    api.post('/customer/note/sync', { note }).catch(() => {});
                  });
                }
              }}
            >
              <Save size={11} strokeWidth={2.5} />
              save now
            </button>
          </div>

          {confirmClear && (
            <p style={{ margin: '8px 0 0', fontSize: 10, color: '#ef4444', textAlign: 'center', opacity: 0.8, lineHeight: 1.4 }}>
              this will erase your note permanently. tap again to confirm.
            </p>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{ padding: '7px 14px 10px', borderTop: `1px solid rgba(168,85,247,0.07)`, display: 'flex', alignItems: 'center', gap: 5 }}>
          <BookMarked size={10} color='rgba(168,85,247,0.25)' strokeWidth={2} />
          <span style={{ fontSize: 9, color: 'rgba(100,100,100,0.35)', fontWeight: 500, lineHeight: 1.4 }}>
            only you can see this note · clears on request
          </span>
        </div>
      </div>
    </>
  );
}