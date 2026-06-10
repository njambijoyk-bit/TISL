import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, X, Send, Minimize2, Sparkles } from 'lucide-react';
import api from '../../api/axios';
import useAuthStore from '../../store/authStore';


const PURPLE_TEXT = '#a855f7';

const SUGGESTED = [
  'What products do you have?',
  'What services do you offer?',
  'How do I track my order?',
  'Can I request a quote?',
  'What is your return policy?',
];

function TypingIndicator() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', background: 'white', borderRadius: '18px 18px 18px 4px', border: '1px solid #f3f4f6', width: 'fit-content' }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: 7, height: 7, borderRadius: '50%', background: '#a855f7',
          animation: 'mimiBounce 1.2s ease-in-out infinite',
          animationDelay: `${i * 0.2}s`,
        }} />
      ))}
    </div>
  );
}

// ── Markdown renderer 
function renderMarkdown(text) {
  const lines = text.split('\n');
  const elements = [];
  let listBuffer = [];
  let key = 0;

  const flushList = () => {
    if (listBuffer.length === 0) return;
    elements.push(
      <ul key={key++} style={{ margin: '6px 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {listBuffer.map((item, i) => (
          <li key={i} style={{ fontSize: '0.83rem', lineHeight: 1.55, color: 'inherit' }}>
            {inlineFormat(item)}
          </li>
        ))}
      </ul>
    );
    listBuffer = [];
  };

  lines.forEach(line => {
    // Bullet lines: -, *, •
    if (/^[\-\*•]\s+/.test(line)) {
      listBuffer.push(line.replace(/^[\-\*•]\s+/, ''));
      return;
    }

    flushList();

    // Empty line
    if (!line.trim()) {
      elements.push(<div key={key++} style={{ height: 6 }} />);
      return;
    }

    // ### Heading
    if (/^###\s+/.test(line)) {
      elements.push(
        <p key={key++} style={{ margin: '8px 0 2px', fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.6 }}>
          {line.replace(/^###\s+/, '')}
        </p>
      );
      return;
    }

    // ## Heading
    if (/^##\s+/.test(line)) {
      elements.push(
        <p key={key++} style={{ margin: '10px 0 3px', fontSize: '0.88rem', fontWeight: 800 }}>
          {inlineFormat(line.replace(/^##\s+/, ''))}
        </p>
      );
      return;
    }

    // Regular paragraph
    elements.push(
      <p key={key++} style={{ margin: '2px 0', fontSize: '0.83rem', lineHeight: 1.6 }}>
        {inlineFormat(line)}
      </p>
    );
  });

  flushList();
  return elements;
}

function inlineFormat(text) {
  // Split on **bold**, *italic*, `code`
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      return <strong key={i} style={{ fontWeight: 800 }}>{part.slice(2, -2)}</strong>;
    }
    if (/^\*[^*]+\*$/.test(part)) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    if (/^`[^`]+`$/.test(part)) {
      return (
        <code key={i} style={{
          fontFamily: 'monospace', fontSize: '0.8rem',
          background: 'rgba(168,85,247,0.12)', color: '#7c3aed',
          padding: '1px 5px', borderRadius: 4,
        }}>
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

function Message({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
      {!isUser && (
        <div style={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0, marginRight: 8, marginTop: 2,
          background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.65rem', fontWeight: 900, color: 'white',
        }}>M</div>
      )}
      <div style={{
        maxWidth: '75%', padding: '10px 14px',
        borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
        background: isUser ? 'linear-gradient(135deg, #a855f7, #7c3aed)' : 'white',
        
        color: isUser ? 'white' : '#111827',
        border: isUser ? 'none' : '1px solid #f3f4f6',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}>
        {isUser
          ? <p style={{ margin: 0, fontSize: '0.83rem', lineHeight: 1.55, fontWeight: 500 }}>{msg.content}</p>
          : renderMarkdown(msg.content)
        }
      </div>
    </div>
  );
}

export default function Mimi({ embedded = false }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated); 
  const navigate = useNavigate();
  const [open, setOpen]       = useState(embedded);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Hi! I'm Mimi 👋 TISL Store's assistant. How can I help you today?" }
  ]);
  const [input, setInput]     = useState('');
  const [loading, setLoading] = useState(false);
  const [showSuggested, setShowSuggested] = useState(true);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);
  const [pos, setPos] = useState({ x: 24, y: 24 }); // bottom-right offset
  const dragging = useRef(false);
  const dragStart = useRef({ mx: 0, my: 0, x: 0, y: 0 });

  const didDrag = useRef(false);

  const onBubbleMouseDown = useCallback((e) => {
    e.preventDefault();
    didDrag.current = false;
    dragging.current = true;
    dragStart.current = { mx: e.clientX, my: e.clientY, x: pos.x, y: pos.y };

    const onMove = (e) => {
      if (!dragging.current) return;
      const dx = dragStart.current.mx - e.clientX;
      const dy = dragStart.current.my - e.clientY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDrag.current = true;
      setPos({
        x: Math.max(8, dragStart.current.x + dx),
        y: Math.max(8, dragStart.current.y + dy),
      });
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [pos]);

  const onDragMouseDown = useCallback((e) => {
    e.preventDefault();
    dragging.current = true;
    dragStart.current = { mx: e.clientX, my: e.clientY, x: pos.x, y: pos.y };

    const onMove = (e) => {
      if (!dragging.current) return;
      const dx = dragStart.current.mx - e.clientX;
      const dy = dragStart.current.my - e.clientY;
      setPos({
        x: Math.max(8, dragStart.current.x + dx),
        y: Math.max(8, dragStart.current.y + dy),
      });
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [pos]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (open && !embedded) inputRef.current?.focus();
  }, [open]);

  // ── Mimi session token (sessionStorage — clears on tab close) ─────────────
  const getMimiToken = () => sessionStorage.getItem('mimi_session_token') ?? '';
  const setMimiToken = (token) => { if (token) sessionStorage.setItem('mimi_session_token', token); };

  const sendMessage = async (text) => {
    const userMessage = text || input.trim();
    if (!userMessage || loading) return;

    setShowSuggested(false);
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      const history = messages.map(m => ({ role: m.role, content: m.content })).slice(-20);

      const { data, headers } = await api.post(
        isAuthenticated ? '/chat' : '/chat/guest', 
        { message: userMessage, history },
        { headers: { 'X-Mimi-Session': getMimiToken() } }
      );

      // Persist the session token the server returns
      setMimiToken(headers['x-mimi-session-token']);

      if (data.error) {
        setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ ${data.error}` }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
      }

    } catch (err) {
        const errorMsg = err.response?.data?.error          // ← add this first
          || err.response?.data?.errors?.history?.[0]
          || err.response?.data?.message
          || "Sorry, I'm having trouble connecting right now.";

        setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ ${errorMsg}` }]);
        console.error('Chat error:', err.response?.data || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  // ── Embedded mode (for Contact page) ─────────────────────────────────────
  if (embedded) {
    return (
      <ChatWindow
        messages={messages} loading={loading} input={input} setInput={setInput}
        sendMessage={sendMessage} handleKey={handleKey} inputRef={inputRef}
        bottomRef={bottomRef} showSuggested={showSuggested} embedded
        navigate={navigate}
      />
    );
  }

  // ── Floating bubble mode ──────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes mimiBounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-5px); }
        }
        @keyframes mimiPop {
          from { opacity: 0; transform: scale(0.85) translateY(16px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes mimiBubblePulse {
          0%, 100% { box-shadow: 0 4px 20px rgba(168,85,247,0.4); }
          50%       { box-shadow: 0 4px 32px rgba(168,85,247,0.7); }
        }
      `}</style>

      {/* Chat window */}
      {open && (
        <div style={{
          position: 'fixed', bottom: pos.y + 70, right: pos.x, zIndex: 10000,
          width: 360, height: 520,
          animation: 'mimiPop 250ms cubic-bezier(0.34,1.56,0.64,1)',
          display: 'flex', flexDirection: 'column',
          borderRadius: 20, overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(0,0,0,0.18), 0 4px 16px rgba(168,85,247,0.15)',
        }}>
          {/* Draggable header */}
          <div
            onMouseDown={onDragMouseDown}
            style={{
              background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
              padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10,
              cursor: 'grab', userSelect: 'none',
            }}
          >
            <div style={{
              width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1rem', fontWeight: 900, color: 'white', flexShrink: 0,
            }}>M</div>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: 800, color: 'white' }}>Mimi</p>
              <p style={{ margin: 0, fontSize: '0.7rem', color: 'rgba(255,255,255,0.75)' }}>
                <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#4ade80', marginRight: 4 }} />
                TISL Store Assistant
              </p>
            </div>
            {/* Drag hint */}
            <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', marginRight: 4, pointerEvents: 'none' }}>
              drag
            </span>
            {/* Close/minimise X */}
            <button
              type="button"
              onMouseDown={e => e.stopPropagation()} // don't trigger drag
              onClick={() => setOpen(false)}
              style={{
                background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8,
                width: 30, height: 30, cursor: 'pointer', color: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 150ms',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
            >
              <X size={15} />
            </button>
          </div>

          <ChatWindow
            messages={messages} loading={loading} input={input} setInput={setInput}
            sendMessage={sendMessage} handleKey={handleKey} inputRef={inputRef}
            bottomRef={bottomRef} showSuggested={showSuggested}
            navigate={navigate}
          />
        </div>
      )}

      {/* Floating bubble */}
      <button
        type="button"
        onMouseDown={onBubbleMouseDown}
        onClick={() => { if (!didDrag.current) setOpen(o => !o); }}
        style={{
          position: 'fixed', bottom: pos.y, right: pos.x, zIndex: 10000,
          width: 48, height: 48, borderRadius: '50%', border: 'none',
          cursor: dragging.current ? 'grabbing' : 'grab',
          background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
          color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'mimiBubblePulse 2.5s ease-in-out infinite',
          transition: 'transform 150ms ease',
        }}
        onMouseEnter={e => { if (!dragging.current) e.currentTarget.style.transform = 'scale(1.08)'; }}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
      >
        {open ? <X size={22} /> : <MessageCircle size={22} />}

        {!open && (
          <span style={{
            position: 'absolute', bottom: '110%', right: 0,
            background: '#111827', color: 'white',
            fontSize: '0.72rem', fontWeight: 700,
            padding: '4px 10px', borderRadius: 8,
            whiteSpace: 'nowrap', pointerEvents: 'none',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          }}>
            Chat with Mimi ✨
          </span>
        )}
      </button>
    </>
  );
}

// ── Shared chat body ──────────────────────────────────────────────────────────
function ChatWindow({ messages, loading, input, setInput, sendMessage, handleKey, inputRef, bottomRef, showSuggested, embedded, navigate  }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fafafa', minHeight: 0 }}>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px', display: 'flex', flexDirection: 'column' }}>
        {messages.map((msg, i) => <Message key={i} msg={msg} />)}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, marginRight: 8, background: 'linear-gradient(135deg, #a855f7, #7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 900, color: 'white' }}>M</div>
            <TypingIndicator />
          </div>
        )}

        {/* Suggested questions */}
        {showSuggested && messages.length === 1 && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <p style={{ fontSize: '0.68rem', fontWeight: 700, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 4px' }}>
              <Sparkles size={10} style={{ display: 'inline', marginRight: 4 }} />
              Suggested
            </p>
            {SUGGESTED.map(q => (
              <button key={q} type="button" onClick={() => sendMessage(q)}
                style={{
                  textAlign: 'left', padding: '8px 12px', borderRadius: 10,
                  border: '1px solid rgba(168,85,247,0.2)', background: 'white',
                  fontSize: '0.78rem', fontWeight: 500, color: '#374151',
                  cursor: 'pointer', transition: 'all 120ms ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.color = '#a855f7'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.2)'; e.currentTarget.style.color = '#374151'; }}
              >
                {q}
              </button>
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div style={{ padding: '10px 12px', borderTop: '1px solid #f3f4f6', background: 'white', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask Mimi anything…"
          rows={1}
          style={{
            flex: 1, padding: '9px 12px', borderRadius: 12,
            border: '1.5px solid #e5e7eb', fontSize: '0.83rem',
            outline: 'none', resize: 'none', fontFamily: 'inherit',
            lineHeight: 1.5, maxHeight: 80, overflowY: 'auto',
            transition: 'border-color 150ms',
          }}
          onFocus={e => e.target.style.borderColor = '#a855f7'}
          onBlur={e =>  e.target.style.borderColor = '#e5e7eb'}
        />
        <button
          type="button"
          onClick={() => sendMessage()}
          disabled={!input.trim() || loading}
          style={{
            width: 38, height: 38, borderRadius: 10, border: 'none', cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
            background: input.trim() && !loading ? 'linear-gradient(135deg, #a855f7, #7c3aed)' : '#e5e7eb',
            color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, transition: 'all 150ms ease',
          }}
        >
          <Send size={16} />
        </button>
      </div>

      {/* AI Policy footer */}
      <div style={{
        padding: '6px 14px',
        borderTop: '1px solid #f3f4f6',
        background: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <button
          onClick={() => navigate('/ai-policy')}
          style={{
            fontSize: '0.63rem',
            color: '#9ca3af',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'color 150ms',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: 0,
          }}
          onMouseEnter={e => e.currentTarget.style.color = '#a855f7'}
          onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          View our AI usage policy
        </button>
      </div>
    </div>
  );
}