import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, User, Clock, Tag, AlertTriangle, CheckCircle,
  MessageSquare, UserCheck, Send, Lock, Unlock, Trash2
} from 'lucide-react';
import AdminLayout from '../../components/layout/AdminLayout';
import Button from '../../components/common/Button';
import Select from '../../components/common/Select';
import { TicketStatusBadge, TicketPriorityBadge } from '../../components/admin/TicketStatusBadge';
import LoadingSpinner from '../../components/layout/LoadingSpinner';
import useTicketStore from '../../store/ticketStore';
import { useAuthStore } from '../../store';
import ticketsAPI from '../../api/tickets';
import AssignModal from '../../components/admin/AssignModal';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

// ─── Design tokens ─────────────────────────────────────────────────────────────
const purple   = '#a855f7';
const purpleLt = 'rgba(168,85,247,0.08)';
const purpleBd = 'rgba(168,85,247,0.2)';

const SectionLabel = ({ children, icon: Icon }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
    {Icon && <Icon size={13} color={purple} />}
    <p style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', color: purple, margin: 0 }}>
      {children}
    </p>
  </div>
);

const Panel = ({ children, style = {} }) => (
  <div style={{ background: 'white', border: '1px solid #f3f4f6', borderRadius: 16, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.05)', ...style }}>
    {children}
  </div>
);

const STATUS_OPTIONS = [
  { value: 'open',             label: 'Open' },
  { value: 'in_progress',      label: 'In Progress' },
  { value: 'waiting_customer', label: 'Waiting Customer' },
  { value: 'resolved',         label: 'Resolved' },
  { value: 'closed',           label: 'Closed' },
];
const PRIORITY_OPTIONS = [
  { value: 'low',    label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high',   label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

export default function AdminTicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const { currentTicket, loading, fetchAdminTicket, updateTicket, assignTicket, unassignTicket, adminReply, softDelete } = useTicketStore();

  const [replyText, setReplyText]   = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [sending, setSending]       = useState(false);

  const [assignModal, setAssignModal] = useState(false);
  const [assigning, setAssigning]     = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    fetchAdminTicket(id);
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentTicket?.replies?.length]);

  const handleStatusChange = async (status) => {
    try {
      await updateTicket(id, { status });
      toast.success(`Status → ${status.replace(/_/g, ' ')}`);
    } catch { toast.error('Failed to update status'); }
  };

  const handlePriorityChange = async (priority) => {
    try {
      await updateTicket(id, { priority });
      toast.success(`Priority → ${priority}`);
    } catch { toast.error('Failed to update priority'); }
  };

  const handleAssign = async (adminId) => {
    setAssigning(true);
    try {
      await assignTicket(id, adminId);
      toast.success('Ticket assigned');
      setAssignModal(false);
    } catch { toast.error('Failed to assign'); }
    finally { setAssigning(false); }
  };

  const handleUnassign = async () => {
    try {
      await unassignTicket(id);
      toast.success('Ticket unassigned');
    } catch { toast.error('Failed to unassign'); }
  };

  const handleReply = async () => {
    if (!replyText.trim()) return;
    setSending(true);
    try {
      await adminReply(id, { message: replyText.trim(), is_internal: isInternal });
      toast.success(isInternal ? 'Internal note added' : 'Reply sent');
      setReplyText('');
    } catch { toast.error('Failed to send reply'); }
    finally { setSending(false); }
  };

  const handleTrash = async () => {
    if (!window.confirm('Move this ticket to trash?')) return;
    try {
      await softDelete(id);
      toast.success('Ticket moved to trash');
      navigate('/admin/tickets');
    } catch { toast.error('Failed to trash ticket'); }
  };

  if (loading && !currentTicket) {
    return <AdminLayout><div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><LoadingSpinner /></div></AdminLayout>;
  }

  if (!currentTicket) return <AdminLayout><p style={{ padding: 40, color: '#9ca3af' }}>Ticket not found.</p></AdminLayout>;

  const ticket = currentTicket;
  const replies = ticket.replies ?? [];
  return (
    <AdminLayout>
      {/* Back */}
      <button onClick={() => navigate('/admin/tickets')}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: purple, fontWeight: 600, fontSize: '0.85rem', marginBottom: 20 }}>
        <ChevronLeft size={16} /> Back to Tickets
      </button>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: purple, fontSize: '0.9rem', background: purpleLt, padding: '3px 10px', borderRadius: 8, border: `1px solid ${purpleBd}` }}>
              {ticket.ticket_number}
            </span>
            <TicketStatusBadge status={ticket.status} />
            <TicketPriorityBadge priority={ticket.priority} />
          </div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>{ticket.subject}</h1>
          <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#9ca3af' }}>
            Opened {format(new Date(ticket.created_at), 'dd MMM yyyy, HH:mm')}
          </p>
        </div>
        <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={handleTrash}>
          Move to Trash
        </Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24, alignItems: 'start' }}>

        {/* ── Left: thread + reply ─────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Original description */}
          <Panel style={{ border: `1px solid ${purpleBd}`, background: purpleLt }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <User size={14} color={purple} />
              <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                {ticket.customer?.first_name} {ticket.customer?.last_name}
              </span>
              <span style={{ fontSize: '0.75rem', color: '#9ca3af', marginLeft: 'auto' }}>
                {format(new Date(ticket.created_at), 'dd MMM yyyy, HH:mm')}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.88rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{ticket.description}</p>
          </Panel>

          {/* Replies */}
          {replies.map((reply) => {
            const isStaff    = reply.sender?.type === 'staff' || reply.user_id;
            const internal   = reply.is_internal;

            return (
              <div key={reply.id} style={{
                padding: '14px 18px', borderRadius: 14,
                background: internal ? '#fffbeb' : isStaff ? '#f8f5ff' : 'white',
                border: `1px solid ${internal ? '#fde68a' : isStaff ? purpleBd : '#e5e7eb'}`,
                marginLeft: isStaff ? 32 : 0,
                marginRight: isStaff ? 0 : 32,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  {internal ? <Lock size={11} color="#f59e0b" /> : isStaff ? <UserCheck size={13} color={purple} /> : <User size={13} color="#6b7280" />}
                  <span style={{ fontWeight: 700, fontSize: '0.82rem', color: isStaff ? purple : '#374151' }}>
                    {reply.sender?.name ?? (isStaff ? 'Staff' : 'Customer')}
                  </span>
                  {internal && <span style={{ fontSize: '0.7rem', color: '#f59e0b', fontWeight: 700, background: '#fef3c7', padding: '1px 7px', borderRadius: 6 }}>INTERNAL NOTE</span>}
                  <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: '#9ca3af' }}>
                    {format(new Date(reply.created_at), 'dd MMM yyyy, HH:mm')}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: '0.86rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{reply.message}</p>
              </div>
            );
          })}

          <div ref={bottomRef} />

          {/* Reply composer */}
          {!['closed'].includes(ticket.status) && (
            <Panel>
              <SectionLabel icon={MessageSquare}>Add Reply</SectionLabel>

              {/* Internal toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <button
                  onClick={() => setIsInternal(false)}
                  style={{
                    padding: '5px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700,
                    background: !isInternal ? purple : 'transparent',
                    color:      !isInternal ? 'white' : '#9ca3af',
                  }}>
                  <Unlock size={11} style={{ marginRight: 5, verticalAlign: 'middle' }} />
                  Customer Reply
                </button>
                <button
                  onClick={() => setIsInternal(true)}
                  style={{
                    padding: '5px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700,
                    background: isInternal ? '#f59e0b' : 'transparent',
                    color:      isInternal ? 'white'  : '#9ca3af',
                  }}>
                  <Lock size={11} style={{ marginRight: 5, verticalAlign: 'middle' }} />
                  Internal Note
                </button>
              </div>

              <textarea
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                placeholder={isInternal ? 'Write an internal note (only staff can see this)…' : 'Write a reply to the customer…'}
                rows={5}
                style={{
                  width: '100%', boxSizing: 'border-box', borderRadius: 10, padding: '12px 14px',
                  border: `1.5px solid ${isInternal ? '#fde68a' : '#e5e7eb'}`,
                  fontSize: '0.88rem', resize: 'vertical', outline: 'none', lineHeight: 1.6,
                  background: isInternal ? '#fffbeb' : 'white',
                }}
              />
              <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
                <Button onClick={handleReply} loading={sending} disabled={!replyText.trim()} icon={<Send size={14} />}>
                  {isInternal ? 'Save Note' : 'Send Reply'}
                </Button>
              </div>
            </Panel>
          )}

          {ticket.status === 'closed' && (
            <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: '0.85rem', padding: '12px 0' }}>
              This ticket is closed. No further replies can be added.
            </p>
          )}
        </div>

        {/* ── Right sidebar ─────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Customer */}
          <Panel>
            <SectionLabel icon={User}>Customer</SectionLabel>
            {ticket.customer ? (
              <div>
                <p style={{ margin: '0 0 2px', fontWeight: 700, fontSize: '0.9rem' }}>
                  {ticket.customer.first_name} {ticket.customer.last_name}
                </p>
                <p style={{ margin: 0, fontSize: '0.78rem', color: '#6b7280' }}>{ticket.customer.email}</p>
              </div>
            ) : <p style={{ color: '#9ca3af', fontSize: '0.82rem' }}>No customer</p>}
          </Panel>

          {/* Status */}
          <Panel>
            <SectionLabel icon={Clock}>Status</SectionLabel>
            <Select
              value={ticket.status}
              onChange={e => handleStatusChange(e.target.value)}
              options={STATUS_OPTIONS}
            />
          </Panel>

          {/* Priority */}
          <Panel>
            <SectionLabel icon={AlertTriangle}>Priority</SectionLabel>
            <Select
              value={ticket.priority}
              onChange={e => handlePriorityChange(e.target.value)}
              options={PRIORITY_OPTIONS}
            />
          </Panel>

          {/* Assigned */}
          <Panel>
            <SectionLabel icon={UserCheck}>Assigned To</SectionLabel>
            {ticket.assigned_to ? (
              <div>
                <p style={{ margin: '0 0 8px', fontWeight: 600, fontSize: '0.87rem' }}>{ticket.assigned_to.name}</p>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Button size="sm" variant="outline" onClick={() => { setSelectedStaff(String(ticket.assigned_to.id)); setAssignModal(true); }}>
                    Reassign
                  </Button>
                  <Button size="sm" variant="ghost" onClick={handleUnassign}>Unassign</Button>
                </div>
              </div>
            ) : (
              <Button size="sm" fullWidth onClick={() => setAssignModal(true)} icon={<UserCheck size={14} />}>
                Assign Staff
              </Button>
            )}
          </Panel>

          {/* Details */}
          <Panel>
            <SectionLabel icon={Tag}>Details</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: 'Category',   value: ticket.category?.charAt(0).toUpperCase() + ticket.category?.slice(1) },
                { label: 'Replies',    value: replies.length },
                { label: 'First response', value: ticket.first_responded_at ? format(new Date(ticket.first_responded_at), 'dd MMM HH:mm') : '—' },
                { label: 'Resolved',   value: ticket.resolved_at ? format(new Date(ticket.resolved_at), 'dd MMM HH:mm') : '—' },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                  <span style={{ color: '#9ca3af' }}>{row.label}</span>
                  <span style={{ fontWeight: 600 }}>{row.value}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      {assignModal && (
        <AssignModal
          onClose={() => setAssignModal(false)}
          onAssign={handleAssign}
          currentAssignedId={ticket.assigned_to ?? null}
        />
      )}
    </AdminLayout>
  );
}