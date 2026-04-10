import { useEffect, useRef, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  Search, MoreVertical, X, Copy, Trash2, Pencil,
  Check, Loader2, CheckSquare, Square,
  ChevronDown, AlertTriangle,
} from 'lucide-react';

// ── Constants ─────────────────────────────────────────────────────────────────

const STAFF_ROLES = ['super_admin', 'admin', 'manager', 'sales_rep'];

const VISIBILITY_STYLES = {
  customer: '',
  admin:    { borderLeft: '2px solid rgba(59,130,246,0.7)', paddingLeft: 12 },
  internal: { borderLeft: '2px solid rgba(245,158,11,0.7)', paddingLeft: 12 },
};

const VISIBILITY_LABELS = {
  admin:    { text: 'Staff only', color: '#3b82f6' },
  internal: { text: 'Internal',   color: '#f59e0b' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const formatTime = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return (
    d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) +
    ' ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  );
};

const highlightText = (text, query) => {
  if (!query || !text) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: 'rgba(245,158,11,0.3)', color: 'inherit', borderRadius: 3, padding: '0 2px' }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
};

// ── useOutsideClick ───────────────────────────────────────────────────────────

const useOutsideClick = (ref, callback) => {
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) callback();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ref, callback]);
};

// ── MessageMenu ───────────────────────────────────────────────────────────────

const MessageMenu = ({ msg, isOwn, canEdit, canDelete, onCopy, onEdit, onDelete, selectMode, onSelectModeActivate }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useOutsideClick(ref, () => setOpen(false));

  const items = [
    { icon: <Copy style={{ width: 11, height: 11 }} />,        label: 'Copy',            action: () => { onCopy(); setOpen(false); },               show: true },
    { icon: <Pencil style={{ width: 11, height: 11 }} />,      label: 'Edit',            action: () => { onEdit(); setOpen(false); },               show: canEdit },
    { icon: <CheckSquare style={{ width: 11, height: 11 }} />, label: 'Select messages', action: () => { onSelectModeActivate(); setOpen(false); }, show: !selectMode && (canEdit || canDelete) },
    { icon: <Trash2 style={{ width: 11, height: 11 }} />,      label: 'Delete',          action: () => { onDelete(); setOpen(false); },             show: canDelete, danger: true },
  ].filter((i) => i.show);

  return (
    <div ref={ref} className="relative">
      {/* Trigger — circular ring matching avatar style */}
      <button type="button" onClick={() => setOpen((v) => !v)}
        title="Message options"
        style={{
          width: 24, height: 24, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'transparent',
          border: open ? '1.5px solid rgba(168,85,247,0.5)' : '1.5px solid rgba(168,85,247,0.22)',
          color: open ? '#c084fc' : '#9ca3af',
          cursor: 'pointer',
          transition: 'border-color 150ms, color 150ms, background 150ms',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.borderColor = 'rgba(168,85,247,0.5)';
          e.currentTarget.style.color = '#c084fc';
          e.currentTarget.style.background = 'rgba(168,85,247,0.06)';
        }}
        onMouseLeave={e => {
          if (!open) {
            e.currentTarget.style.borderColor = 'rgba(168,85,247,0.22)';
            e.currentTarget.style.color = '#9ca3af';
            e.currentTarget.style.background = 'transparent';
          }
        }}>
        <ChevronDown style={{ width: 11, height: 11 }} />
      </button>

      {open && (
        <div
          className={`absolute z-40 mt-1.5 overflow-hidden ${isOwn ? 'right-0' : 'left-0'}`}
          style={{
            minWidth: 164, borderRadius: 12,
            background: '#1e1b2e',
            border: '1px solid rgba(168,85,247,0.3)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(168,85,247,0.08)',
          }}>
          {items.map((item, idx) => (
            <button key={item.label} type="button" onClick={item.action}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 14px',
                borderTop: idx > 0 && item.danger ? '1px solid rgba(168,85,247,0.1)' : 'none',
                background: 'transparent', border: 'none', cursor: 'pointer',
                fontSize: '0.8rem', fontWeight: 500, textAlign: 'left',
                color: item.danger ? '#f87171' : '#e2e8f0',
                transition: 'background 120ms, color 120ms',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = item.danger
                  ? 'rgba(239,68,68,0.12)' : 'rgba(168,85,247,0.1)';
                e.currentTarget.style.color = item.danger ? '#fca5a5' : '#f1f0ff';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = item.danger ? '#f87171' : '#e2e8f0';
              }}>
              <span style={{
                width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: item.danger ? 'rgba(239,68,68,0.1)' : 'rgba(168,85,247,0.1)',
                border: item.danger ? '1px solid rgba(239,68,68,0.25)' : '1px solid rgba(168,85,247,0.2)',
                color: item.danger ? '#f87171' : '#c084fc',
              }}>
                {item.icon}
              </span>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ── DeleteConfirmModal ────────────────────────────────────────────────────────

const DeleteConfirmModal = ({ count = 1, onConfirm, onCancel, loading }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
    <div className="rounded-xl shadow-xl w-full max-w-sm overflow-hidden"
      style={{ background: 'white', border: '1px solid rgba(168,85,247,0.2)' }}>
      <div style={{ height: 3, background: 'linear-gradient(90deg,#ef4444,#dc2626)' }} />
      <div className="p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
            style={{ background: 'rgba(239,68,68,0.1)' }}>
            <AlertTriangle className="w-5 h-5" style={{ color: '#ef4444' }} />
          </div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            Delete {count > 1 ? `${count} messages` : 'message'}?
          </h3>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
          {count > 1
            ? `This will permanently delete ${count} messages. This action cannot be undone.`
            : 'This message will be permanently deleted and cannot be recovered.'}
        </p>
        <div className="flex justify-end gap-3 pt-4" style={{ borderTop: '1px solid rgba(168,85,247,0.12)' }}>
          <button onClick={onCancel} disabled={loading}
            className="px-3 py-1.5 text-sm rounded-lg text-gray-700 dark:text-gray-300 transition-colors disabled:opacity-50"
            style={{ border: '1px solid rgba(168,85,247,0.2)' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(168,85,247,0.4)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(168,85,247,0.2)'}>
            Cancel
          </button>
          <button onClick={onConfirm} disabled={loading}
            className="px-3 py-1.5 text-sm text-white rounded-lg transition-colors disabled:opacity-60 flex items-center gap-1.5"
            style={{ background: 'linear-gradient(135deg,#ef4444,#dc2626)', boxShadow: '0 2px 8px rgba(239,68,68,0.3)' }}>
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Delete
          </button>
        </div>
      </div>
    </div>
  </div>
);

// ── ClearChatModal ────────────────────────────────────────────────────────────

const ClearChatModal = ({ onConfirm, onCancel, loading }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
    <div className="rounded-xl shadow-xl w-full max-w-sm overflow-hidden"
      style={{ background: 'white', border: '1px solid rgba(168,85,247,0.2)' }}>
      <div style={{ height: 3, background: 'linear-gradient(90deg,#ef4444,#dc2626)' }} />
      <div className="p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
            style={{ background: 'rgba(239,68,68,0.1)' }}>
            <Trash2 className="w-5 h-5" style={{ color: '#ef4444' }} />
          </div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">Clear entire chat?</h3>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
          This will <strong>permanently delete all messages</strong> in this project thread.
          This action cannot be undone and affects all participants.
        </p>
        <div className="flex justify-end gap-3 pt-4" style={{ borderTop: '1px solid rgba(168,85,247,0.12)' }}>
          <button onClick={onCancel} disabled={loading}
            className="px-3 py-1.5 text-sm rounded-lg text-gray-700 dark:text-gray-300 transition-colors disabled:opacity-50"
            style={{ border: '1px solid rgba(168,85,247,0.2)' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(168,85,247,0.4)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(168,85,247,0.2)'}>
            Cancel
          </button>
          <button onClick={onConfirm} disabled={loading}
            className="px-3 py-1.5 text-sm text-white rounded-lg transition-colors disabled:opacity-60 flex items-center gap-1.5"
            style={{ background: 'linear-gradient(135deg,#ef4444,#dc2626)', boxShadow: '0 2px 8px rgba(239,68,68,0.3)' }}>
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Clear all messages
          </button>
        </div>
      </div>
    </div>
  </div>
);

// ── Main Component ────────────────────────────────────────────────────────────

const MessageThread = ({
  messages = [],
  loading = false,
  currentUserId,
  userRole = 'customer',
  onDeleteMessage,
  onDeleteMessages,
  onEditMessage,
  onClearChat,
}) => {
  const isStaff      = STAFF_ROLES.includes(userRole);
  const isSuperAdmin = userRole === 'super_admin';

  const canEditMsg = useCallback(
    (msg) => isSuperAdmin || msg.sender_user_id === currentUserId,
    [isSuperAdmin, currentUserId]
  );

  const canDeleteMsg = useCallback(
    (msg) => {
      if (isSuperAdmin) return true;
      if (msg.sender_user_id === currentUserId) return true;
      if (isStaff && !STAFF_ROLES.includes(msg.sender?.role)) return true;
      return false;
    },
    [isSuperAdmin, isStaff, currentUserId]
  );

  const [searchOpen,          setSearchOpen]          = useState(false);
  const [searchQuery,         setSearchQuery]         = useState('');
  const [selectMode,          setSelectMode]          = useState(false);
  const [selected,            setSelected]            = useState(new Set());
  const [topMenuOpen,         setTopMenuOpen]         = useState(false);
  const [editingId,           setEditingId]           = useState(null);
  const [editText,            setEditText]            = useState('');
  const [savingEdit,          setSavingEdit]          = useState(false);
  const [confirmDelete,       setConfirmDelete]       = useState(null);
  const [confirmBulkDelete,   setConfirmBulkDelete]   = useState(false);
  const [confirmClear,        setConfirmClear]        = useState(false);
  const [deletingIds,         setDeletingIds]         = useState(new Set());
  const [clearingChat,        setClearingChat]        = useState(false);

  const topMenuRef = useRef(null);
  const searchRef  = useRef(null);
  const bottomRef  = useRef(null);

  useOutsideClick(topMenuRef, () => setTopMenuOpen(false));

  useEffect(() => {
    if (searchOpen || selectMode) return;
    const timeout = setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
    return () => clearTimeout(timeout);
  }, [messages]);

  const visibleMessages = searchQuery
    ? messages.filter((m) =>
        m.message?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.sender?.name?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : messages;

  const handleCopyMessage       = (text) => navigator.clipboard.writeText(text ?? '').catch(() => {});
  const handleToggleSelect      = (id) => setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const handleExitSelectMode    = () => { setSelectMode(false); setSelected(new Set()); };
  const handleEditStart         = (msg) => { setEditingId(msg.id); setEditText(msg.message ?? ''); };
  const handleEditCancel        = () => { setEditingId(null); setEditText(''); };

  const handleEditSave = async (msgId) => {
    if (!onEditMessage) return;
    setSavingEdit(true);
    try {
      const res = await onEditMessage(msgId, editText.trim());
      if (res?.success === false) toast.error(res.error || 'Failed to update message.');
      else toast.success('Message updated.');
    } finally {
      setSavingEdit(false); setEditingId(null); setEditText('');
    }
  };

  const handleDeleteOne = async () => {
    if (!confirmDelete || !onDeleteMessage) return;
    const id = confirmDelete.id;
    setDeletingIds((p) => new Set(p).add(id));
    try {
      const res = await onDeleteMessage(id);
      if (res?.success === false) toast.error(res.error || 'Failed to delete message.');
      else toast.success('Message deleted.');
    } finally {
      setDeletingIds((p) => { const n = new Set(p); n.delete(id); return n; });
      setConfirmDelete(null);
    }
  };

  const handleBulkDelete = async () => {
    if (!onDeleteMessages) return;
    const ids = [...selected];
    setConfirmBulkDelete(false);
    try {
      const res = await onDeleteMessages(ids);
      if (res?.success === false) toast.error(res.error || 'Failed to delete messages.');
      else toast.success(`${ids.length} message${ids.length !== 1 ? 's' : ''} deleted.`);
      handleExitSelectMode();
    } catch (_) {}
  };

  const handleClearChat = async () => {
    if (!onClearChat) return;
    setClearingChat(true);
    try {
      const res = await onClearChat();
      if (res?.success === false) toast.error(res.error || 'Failed to clear chat.');
      else toast.success('Chat cleared.');
    } finally {
      setClearingChat(false); setConfirmClear(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={`flex gap-3 ${i % 2 === 0 ? '' : 'justify-end'}`}>
            {i % 2 === 0 && <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse shrink-0" />}
            <div className="flex-1 max-w-[60%] space-y-2 pt-1">
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/3 animate-pulse" />
              <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-2xl animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const isEmpty = !messages || messages.length === 0;

  return (
    <div className="flex flex-col gap-0">

      {/* ── Toolbar ── */}
      <div className="sticky top-0 z-20 bg-white dark:bg-gray-900 flex items-center justify-between gap-2 px-3 py-2"
        style={{ borderBottom: '1px solid rgba(168,85,247,0.12)' }}>

        {selectMode ? (
          <div className="flex items-center gap-3 flex-1">
            <button type="button" onClick={handleExitSelectMode}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: '#9ca3af' }}>
              <X className="w-4 h-4" />
            </button>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {selected.size} selected
            </span>
            {selected.size > 0 && (
              <button type="button" onClick={() => setConfirmBulkDelete(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white rounded-lg transition-colors"
                style={{ background: 'linear-gradient(135deg,#ef4444,#dc2626)', boxShadow: '0 2px 8px rgba(239,68,68,0.3)' }}>
                <Trash2 className="w-3.5 h-3.5" />
                Delete selected
              </button>
            )}
          </div>
        ) : (
          <div className="flex-1" />
        )}

        {!selectMode && (
          <div className="flex items-center gap-1">
            <button type="button"
              onClick={() => { setSearchOpen((v) => !v); if (searchOpen) setSearchQuery(''); }}
              className="p-1.5 rounded-lg transition-colors"
              style={searchOpen
                ? { background: 'rgba(168,85,247,0.1)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.3)' }
                : { color: '#9ca3af', border: '1px solid transparent' }}
              title="Search messages">
              <Search className="w-4 h-4" />
            </button>

            <div ref={topMenuRef} className="relative">
              <button type="button" onClick={() => setTopMenuOpen((v) => !v)}
                className="p-1.5 rounded-lg transition-colors"
                style={{ color: '#9ca3af', border: '1px solid transparent' }}
                onMouseEnter={e => { e.currentTarget.style.border = '1px solid rgba(168,85,247,0.2)'; e.currentTarget.style.color = '#a855f7'; }}
                onMouseLeave={e => { e.currentTarget.style.border = '1px solid transparent'; e.currentTarget.style.color = '#9ca3af'; }}
                title="More options">
                <MoreVertical className="w-4 h-4" />
              </button>

              {topMenuOpen && (
                <div className="absolute right-0 top-full mt-1 z-30 min-w-[180px] rounded-xl shadow-xl py-1 overflow-hidden"
                  style={{ background: 'white', border: '1px solid rgba(168,85,247,0.2)' }}>
                  <button type="button"
                    onClick={() => { setSelectMode(true); setTopMenuOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left
                      text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <CheckSquare className="w-4 h-4" style={{ color: '#a855f7' }} />
                    Select messages
                  </button>
                  {isSuperAdmin && (
                    <button type="button"
                      onClick={() => { setConfirmClear(true); setTopMenuOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors"
                      style={{ color: '#ef4444' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.06)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <Trash2 className="w-4 h-4" />
                      Clear all messages
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Search bar ── */}
      {searchOpen && (
        <div className="relative mb-3 mx-3 mt-2" ref={searchRef}>
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#c084fc' }} />
          <input autoFocus type="text" value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search messages…"
            className="w-full pl-9 pr-9 py-2 text-sm rounded-xl bg-gray-50 dark:bg-gray-700/60
              text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none"
            style={{ border: '1.5px solid rgba(168,85,247,0.2)' }}
            onFocus={e => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.1)'; }}
            onBlur={e =>  { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.2)'; e.currentTarget.style.boxShadow = 'none'; }}
          />
          {searchQuery && (
            <button type="button" onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2"
              style={{ color: '#c084fc', background: 'none', border: 'none', cursor: 'pointer' }}>
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {searchQuery && (
        <p className="text-xs mb-2 px-1" style={{ color: '#c084fc' }}>
          {visibleMessages.length === 0
            ? 'No messages match your search.'
            : `${visibleMessages.length} result${visibleMessages.length !== 1 ? 's' : ''}`}
        </p>
      )}

      {/* ── Empty state ── */}
      {isEmpty && (
        <div className="py-10 text-center text-sm text-gray-400 dark:text-gray-500">
          No messages yet. Start the conversation.
        </div>
      )}

      {/* ── Message list ── */}
      <div className="space-y-5 pt-3">
        {visibleMessages.map((msg) => {
          const isOwn      = msg.sender_user_id === currentUserId;
          const canEdit    = canEditMsg(msg);
          const canDelete  = canDeleteMsg(msg);
          const isEditing  = editingId === msg.id;
          const isDeleting = deletingIds.has(msg.id);
          const isSelected = selected.has(msg.id);
          const visLabel   = VISIBILITY_LABELS[msg.visibility];
          const visStyle   = VISIBILITY_STYLES[msg.visibility] || {};

          const initials = msg.sender?.name
            ? msg.sender.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
            : '?';

          return (
            <div key={msg.id}
              className={`flex ${isOwn ? 'justify-end' : 'justify-start'} items-end gap-2
                ${isDeleting ? 'opacity-40 pointer-events-none' : ''}
                ${selectMode ? 'cursor-pointer' : ''}`}
              onClick={selectMode ? () => handleToggleSelect(msg.id) : undefined}>

              {/* Select checkbox */}
              {selectMode && (
                <button type="button"
                  className={`shrink-0 mb-1 ${isOwn ? 'order-last ml-2' : 'order-first mr-1'}`}
                  onClick={(e) => { e.stopPropagation(); handleToggleSelect(msg.id); }}>
                  {isSelected
                    ? <CheckSquare className="w-4 h-4" style={{ color: '#a855f7' }} />
                    : <Square className="w-4 h-4 text-gray-400" />
                  }
                </button>
              )}

              {/* Avatar — no background, purple initials with subtle ring */}
              {!isOwn && (
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.65rem', fontWeight: 700, marginBottom: 4,
                  color: '#c084fc',
                  background: 'transparent',
                  border: '1.5px solid rgba(168,85,247,0.25)',
                }}>
                  {initials}
                </div>
              )}

              {/* Message column */}
              <div className={`flex flex-col max-w-[75%] ${isOwn ? 'items-end' : 'items-start'} group/msg relative`}>
                <div className="flex items-end gap-1.5">

                  {/* Per-message menu */}
                  {!selectMode && (
                    <div className={`shrink-0 opacity-0 group-hover/msg:opacity-100 transition-opacity
                      ${isOwn ? 'order-first' : 'order-last'} relative`}>
                      <MessageMenu
                        msg={msg} isOwn={isOwn} canEdit={canEdit} canDelete={canDelete} selectMode={selectMode}
                        onCopy={() => handleCopyMessage(msg.message)}
                        onEdit={() => handleEditStart(msg)}
                        onDelete={() => setConfirmDelete({ id: msg.id })}
                        onSelectModeActivate={() => setSelectMode(true)}
                      />
                    </div>
                  )}

                  {/* Bubble */}
                  {isEditing ? (
                    <div className="flex flex-col gap-1.5 min-w-[220px]">
                      <textarea autoFocus value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEditSave(msg.id); }
                          if (e.key === 'Escape') handleEditCancel();
                        }}
                        rows={2}
                        className="w-full px-3 py-2 text-sm rounded-xl bg-white dark:bg-gray-700
                          text-gray-900 dark:text-white focus:outline-none resize-none"
                        style={{ border: '1.5px solid rgba(168,85,247,0.4)', boxShadow: '0 0 0 3px rgba(168,85,247,0.08)' }}
                      />
                      <div className="flex gap-1.5 justify-end">
                        <button type="button" onClick={handleEditCancel} disabled={savingEdit}
                          className="px-2.5 py-1 text-xs rounded-lg transition-colors text-gray-600 dark:text-gray-400 disabled:opacity-50"
                          style={{ border: '1px solid rgba(168,85,247,0.2)' }}>
                          Cancel
                        </button>
                        <button type="button" onClick={() => handleEditSave(msg.id)}
                          disabled={savingEdit || !editText.trim()}
                          className="px-2.5 py-1 text-xs rounded-lg text-white disabled:opacity-50 flex items-center gap-1"
                          style={{ background: 'linear-gradient(135deg,#a855f7,#7c3aed)', boxShadow: '0 2px 8px rgba(168,85,247,0.3)' }}>
                          {savingEdit ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`rounded-2xl text-sm leading-relaxed shadow-sm px-3 py-2
                        ${isSelected ? 'ring-2' : ''}`}
                      style={{
                        ...(isOwn
                          ? { background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white', borderBottomRightRadius: 4, boxShadow: '0 2px 12px rgba(168,85,247,0.25)' }
                          : { background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.15)', borderBottomLeftRadius: 4 }
                        ),
                        ...(isSelected ? { outline: '2px solid #a855f7', outlineOffset: 2 } : {}),
                        ...visStyle,
                      }}>
                      {highlightText(msg.message, searchQuery)}
                    </div>
                  )}
                </div>

                {/* Meta */}
                {!isEditing && (
                  <div className={`flex items-center gap-1 mt-1 text-[11px] text-gray-400 dark:text-gray-500
                    ${isOwn ? 'justify-end pr-1' : 'justify-start pl-1'}`}>
                    {!isOwn && (
                      <span className="font-semibold" style={{ color: '#a855f7' }}>
                        {msg.sender?.name || 'Unknown'}
                      </span>
                    )}
                    {visLabel && (
                      <span className="italic font-medium" style={{ color: visLabel.color }}>
                        • {visLabel.text}
                      </span>
                    )}
                    <span>• {formatTime(msg.created_at)}</span>
                    {msg.edited_at && <span className="italic opacity-70">• edited</span>}
                  </div>
                )}

                {/* Attachments */}
                {msg.attachments?.length > 0 && (
                  <div className={`flex flex-wrap gap-1 mt-1 ${isOwn ? 'justify-end' : ''}`}>
                    {msg.attachments.map((att, i) => (
                      <a key={i} href={att.url || '#'} target="_blank" rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs px-2 py-1 rounded-lg transition-colors"
                        style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)', color: '#a855f7' }}>
                        {att.name || `Attachment ${i + 1}`}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>

      {/* ── Confirm modals ── */}
      {confirmDelete && (
        <DeleteConfirmModal count={1} loading={deletingIds.has(confirmDelete.id)}
          onConfirm={handleDeleteOne} onCancel={() => setConfirmDelete(null)} />
      )}
      {confirmBulkDelete && (
        <DeleteConfirmModal count={selected.size} loading={false}
          onConfirm={handleBulkDelete} onCancel={() => setConfirmBulkDelete(false)} />
      )}
      {confirmClear && (
        <ClearChatModal loading={clearingChat}
          onConfirm={handleClearChat} onCancel={() => setConfirmClear(false)} />
      )}
    </div>
  );
};

export default MessageThread;