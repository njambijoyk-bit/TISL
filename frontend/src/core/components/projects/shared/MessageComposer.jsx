import { useState, useRef, useEffect } from 'react';
import { Paperclip, SendHorizonal, X, Link } from 'lucide-react';

const VISIBILITY_OPTIONS = [
  { value: 'customer', label: 'Customer & Staff' },
  { value: 'admin',    label: 'Staff only' },
  { value: 'internal', label: 'Internal note' },
];

const VISIBILITY_ACTIVE = {
  customer: { color: '#c084fc', bg: 'rgba(168,85,247,0.15)', border: 'rgba(168,85,247,0.4)'  },
  admin:    { color: '#60a5fa', bg: 'rgba(59,130,246,0.15)',  border: 'rgba(59,130,246,0.4)'  },
  internal: { color: '#fcd34d', bg: 'rgba(245,158,11,0.15)',  border: 'rgba(245,158,11,0.4)'  },
};

const MessageComposer = ({
  onSend,
  loading,
  isAdmin = false,
  disabled = false,
}) => {
  const [message,    setMessage]    = useState('');
  const [visibility, setVisibility] = useState('customer');
  const [files,      setFiles]      = useState([]);
  const [url,        setUrl]        = useState('');

  const textareaRef  = useRef(null);
  const fileInputRef = useRef(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [message]);

  const handleSend = () => {
    if (!message.trim() && files.length === 0 && !url) return;
    onSend({ message: message.trim(), visibility, files, url });
    setMessage('');
    setFiles([]);
    setUrl('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const canSend = (message.trim() || files.length > 0 || url) && !loading && !disabled;
  const activeVis = VISIBILITY_ACTIVE[visibility];

  return (
    <div style={{
      borderTop: '1px solid rgba(168,85,247,0.15)',
      background: 'var(--color-background-primary)',
      padding: '10px 14px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>

      {/* ── Visibility selector (admin only) ── */}
      {isAdmin && (
        <div style={{ display: 'flex', gap: 6 }}>
          {VISIBILITY_OPTIONS.map(opt => {
            const active = visibility === opt.value;
            const tok    = VISIBILITY_ACTIVE[opt.value];
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setVisibility(opt.value)}
                style={{
                  fontSize: '0.7rem', fontWeight: 700,
                  padding: '3px 11px', borderRadius: 20, cursor: 'pointer',
                  color:      active ? tok.color      : 'var(--color-text-secondary)',
                  background: active ? tok.bg         : 'transparent',
                  border:     active ? `1px solid ${tok.border}` : '1px solid var(--color-border-tertiary)',
                  transition: 'all 150ms',
                }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.borderColor = tok.border; e.currentTarget.style.color = tok.color; }}}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.borderColor = 'var(--color-border-tertiary)'; e.currentTarget.style.color = 'var(--color-text-secondary)'; }}}>
                {opt.label}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Main input row ── */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>

        {/* Attach */}
        <button
          type="button"
          onClick={() => fileInputRef.current.click()}
          disabled={disabled}
          title="Attach file"
          style={{
            width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent',
            border: '1.5px solid rgba(168,85,247,0.22)',
            color: '#9ca3af', cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.4 : 1,
            transition: 'border-color 150ms, color 150ms, background 150ms',
          }}
          onMouseEnter={e => { if (!disabled) { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.5)'; e.currentTarget.style.color = '#c084fc'; e.currentTarget.style.background = 'rgba(168,85,247,0.06)'; }}}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.22)'; e.currentTarget.style.color = '#9ca3af'; e.currentTarget.style.background = 'transparent'; }}>
          <Paperclip style={{ width: 13, height: 13 }} />
        </button>

        <input ref={fileInputRef} type="file" multiple hidden
          onChange={(e) => setFiles([...files, ...Array.from(e.target.files)])} />

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          rows={1}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={disabled ? 'You do not have permission to comment.' : 'Type a message…'}
          style={{
            flex: 1, resize: 'none',
            padding: '8px 14px',
            borderRadius: 20,
            fontSize: '0.83rem', lineHeight: 1.5,
            background: 'rgba(168,85,247,0.06)',
            border: '1.5px solid rgba(168,85,247,0.18)',
            color: 'var(--color-text-primary)',
            outline: 'none',
            opacity: disabled ? 0.5 : 1,
            cursor: disabled ? 'not-allowed' : 'text',
            transition: 'border-color 150ms, box-shadow 150ms',
            fontFamily: 'inherit',
          }}
          onFocus={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.5)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.08)'; }}
          onBlur={e  => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.18)'; e.currentTarget.style.boxShadow = 'none'; }}
        />

        {/* Send */}
        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend}
          title="Send"
          style={{
            width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: canSend ? 'linear-gradient(135deg,#a855f7,#7c3aed)' : 'transparent',
            border: canSend ? 'none' : '1.5px solid rgba(168,85,247,0.22)',
            color: canSend ? 'white' : '#6b7280',
            cursor: canSend ? 'pointer' : 'not-allowed',
            boxShadow: canSend ? '0 2px 10px rgba(168,85,247,0.35)' : 'none',
            transition: 'all 150ms',
          }}
          onMouseEnter={e => { if (canSend) e.currentTarget.style.boxShadow = '0 4px 16px rgba(168,85,247,0.5)'; }}
          onMouseLeave={e => { if (canSend) e.currentTarget.style.boxShadow = '0 2px 10px rgba(168,85,247,0.35)'; }}>
          <SendHorizonal style={{ width: 13, height: 13 }} />
        </button>
      </div>

      {/* ── URL input ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 12px', borderRadius: 20,
        background: 'rgba(168,85,247,0.04)',
        border: '1.5px solid rgba(168,85,247,0.14)',
        transition: 'border-color 150ms, box-shadow 150ms',
      }}
        onFocusCapture={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.4)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.07)'; }}
        onBlurCapture={e  => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.14)'; e.currentTarget.style.boxShadow = 'none'; }}>
        <Link style={{ width: 12, height: 12, flexShrink: 0, color: '#9ca3af' }} />
        <input
          type="text"
          placeholder="Paste a link (optional)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={disabled}
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            fontSize: '0.78rem', color: 'var(--color-text-primary)',
            opacity: disabled ? 0.4 : 1,
            fontFamily: 'inherit',
          }}
        />
        {url && (
          <button type="button" onClick={() => setUrl('')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 0, display: 'flex' }}
            onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
            onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}>
            <X style={{ width: 11, height: 11 }} />
          </button>
        )}
      </div>

      {/* ── Attachment + URL previews ── */}
      {(files.length > 0 || url) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {files.map((file, i) => (
            <span key={i} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: '0.7rem', fontWeight: 500,
              color: '#c084fc', background: 'rgba(168,85,247,0.1)',
              border: '1px solid rgba(168,85,247,0.25)',
              padding: '3px 10px', borderRadius: 20,
            }}>
              <Paperclip style={{ width: 10, height: 10, flexShrink: 0 }} />
              <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {file.name}
              </span>
              <button type="button" onClick={() => setFiles(files.filter((_, idx) => idx !== i))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 0, display: 'flex', marginLeft: 2 }}
                onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
                onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}>
                <X style={{ width: 10, height: 10 }} />
              </button>
            </span>
          ))}
          {url && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: '0.7rem', fontWeight: 500,
              color: '#60a5fa', background: 'rgba(59,130,246,0.1)',
              border: '1px solid rgba(59,130,246,0.25)',
              padding: '3px 10px', borderRadius: 20,
            }}>
              <Link style={{ width: 10, height: 10, flexShrink: 0 }} />
              <span style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {url}
              </span>
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default MessageComposer;