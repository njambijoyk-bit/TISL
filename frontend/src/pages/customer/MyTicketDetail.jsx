import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ChevronLeft, User, UserCheck, Send, CheckCircle, Clock, MessageSquare, Ticket } from 'lucide-react';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import LoadingSpinner from '../../components/layout/LoadingSpinner';
import Button from '../../components/common/Button';
import useTicketStore from '../../store/ticketStore';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const purple   = '#a855f7';
const purpleLt = 'rgba(168,85,247,0.08)';
const purpleBd = 'rgba(168,85,247,0.2)';

const STATUS_COLORS = {
  open:             { text: '#93c5fd', bg: 'rgba(30,58,138,0.55)', border: 'rgba(96,165,250,0.65)' },
  in_progress:      { text: '#fde68a', bg: 'rgba(120,53,15,0.55)', border: 'rgba(251,191,36,0.65)' },
  waiting_customer: { text: '#d4d4d8', bg: 'rgba(39,39,42,0.65)',  border: 'rgba(161,161,170,0.5)' },
  resolved:         { text: '#6ee7b7', bg: 'rgba(6,78,59,0.55)',   border: 'rgba(52,211,153,0.65)' },
  closed:           { text: '#fca5a5', bg: 'rgba(127,29,29,0.55)', border: 'rgba(248,113,113,0.65)' },
};

const StatusChip = ({ status }) => {
  const c = STATUS_COLORS[status] ?? STATUS_COLORS.open;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '3px 12px', borderRadius: 9999, fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase',
      color: c.text, background: c.bg, border: `1px solid ${c.border}`, letterSpacing: '0.1em',
    }}>
      {status?.replace(/_/g, ' ')}
    </span>
  );
};

export default function MyTicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentTicket, loading, fetchMyTicket, customerReply, customerClose } = useTicketStore();

  const [replyText, setReplyText] = useState('');
  const [sending, setSending]     = useState(false);
  const [closing, setClosing]     = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    fetchMyTicket(id);
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentTicket?.replies?.length]);

  const handleReply = async () => {
    if (!replyText.trim()) return;
    setSending(true);
    try {
      await customerReply(id, replyText.trim());
      setReplyText('');
      toast.success('Reply sent');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send reply');
    } finally {
      setSending(false);
    }
  };

  const handleClose = async () => {
    if (!window.confirm('Close this ticket? You can still reply later if needed.')) return;
    setClosing(true);
    try {
      await customerClose(id);
      toast.success('Ticket closed');
    } catch { toast.error('Failed to close ticket'); }
    finally { setClosing(false); }
  };

  if (loading && !currentTicket) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Header />
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <LoadingSpinner />
        </div>
        <Footer />
      </div>
    );
  }

  if (!currentTicket) return null;

  const ticket  = currentTicket;
  const replies = ticket.replies ?? [];
  const isClosed = ticket.status === 'closed';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Helmet><title>{ticket.ticket_number} — Support</title></Helmet>
      <Header />

      <main style={{ flex: 1, maxWidth: 760, margin: '0 auto', padding: '36px 20px', width: '100%' }}>

        {/* Back */}
        <button onClick={() => navigate('/my-tickets')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: purple, fontWeight: 600, fontSize: '0.85rem', marginBottom: 20 }}>
          <ChevronLeft size={16} /> My Tickets
        </button>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: purple, fontSize: '0.85rem', background: purpleLt, padding: '3px 10px', borderRadius: 8, border: `1px solid ${purpleBd}` }}>
              {ticket.ticket_number}
            </span>
            <StatusChip status={ticket.status} />
          </div>
          <h1 style={{ margin: '0 0 4px', fontSize: '1.35rem', fontWeight: 800 }}>{ticket.subject}</h1>
          <p style={{ margin: 0, fontSize: '0.78rem', color: '#9ca3af' }}>
            Opened {format(new Date(ticket.created_at), 'dd MMM yyyy, HH:mm')}
            {ticket.assignedTo && ` · Assigned to ${ticket.assignedTo.name}`}
          </p>
        </div>

        {/* Thread */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Original description */}
          <div style={{
            padding: '16px 18px', borderRadius: 14,
            background: purpleLt, border: `1px solid ${purpleBd}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <User size={14} color={purple} />
              <span style={{ fontWeight: 700, fontSize: '0.84rem', color: purple }}>You</span>
              <span style={{ marginLeft: 'auto', fontSize: '0.73rem', color: '#9ca3af' }}>
                {format(new Date(ticket.created_at), 'dd MMM yyyy, HH:mm')}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.88rem', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{ticket.description}</p>
          </div>

          {/* Replies */}
          {replies.map((reply) => {
            const isStaff = reply.sender?.type === 'staff' || reply.user_id;

            return (
              <div key={reply.id} style={{
                padding: '14px 18px', borderRadius: 14,
                background: isStaff ? '#f8f5ff' : 'white',
                border: `1px solid ${isStaff ? purpleBd : '#e5e7eb'}`,
                marginLeft: isStaff ? 0 : 32,
                marginRight: isStaff ? 32 : 0,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  {isStaff
                    ? <UserCheck size={13} color={purple} />
                    : <User size={13} color="#6b7280" />
                  }
                  <span style={{ fontWeight: 700, fontSize: '0.82rem', color: isStaff ? purple : '#374151' }}>
                    {isStaff ? (reply.sender?.name || 'Support Team') : 'You'}
                  </span>
                  <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: '#9ca3af' }}>
                    {format(new Date(reply.created_at), 'dd MMM yyyy, HH:mm')}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: '0.87rem', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{reply.message}</p>
              </div>
            );
          })}

          <div ref={bottomRef} />
        </div>

        {/* Reply / close section */}
        {!isClosed ? (
          <div style={{ marginTop: 24, background: 'white', border: '1px solid #e5e7eb', borderRadius: 14, padding: 20 }}>
            <p style={{ fontSize: '0.78rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 10px' }}>
              Add a reply
            </p>
            <textarea
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              placeholder="Describe any additional details or questions…"
              rows={5}
              style={{
                width: '100%', boxSizing: 'border-box', borderRadius: 10, padding: '10px 14px',
                border: '1.5px solid #e5e7eb', fontSize: '0.88rem', resize: 'vertical', outline: 'none', lineHeight: 1.6,
              }}
            />
            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Button variant="ghost" size="sm" onClick={handleClose} loading={closing}
                icon={<CheckCircle size={14} />} style={{ color: '#10b981' }}>
                Mark as Resolved
              </Button>
              <Button onClick={handleReply} loading={sending} disabled={!replyText.trim()} icon={<Send size={14} />}>
                Send Reply
              </Button>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 24, textAlign: 'center', padding: '20px 0', borderTop: '1px solid #f3f4f6', color: '#9ca3af', fontSize: '0.85rem' }}>
            <CheckCircle size={18} style={{ marginBottom: 6, opacity: 0.5, display: 'block', margin: '0 auto 8px' }} />
            This ticket is closed. <button onClick={() => navigate('/my-tickets')} style={{ color: purple, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Open a new ticket</button> if you need further help.
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
