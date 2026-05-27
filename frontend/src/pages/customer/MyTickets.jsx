import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Ticket, Plus, Clock, CheckCircle, XCircle, MessageSquare, AlertTriangle } from 'lucide-react';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import LoadingSpinner from '../../components/layout/LoadingSpinner';
import AdminPagination from '../../components/common/AdminPagination';
import Modal from '../../components/common/Modal';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import Select from '../../components/common/Select';
import Badge from '../../components/common/Badge';
import useTicketStore from '../../store/ticketStore';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const purple   = '#a855f7';
const purpleLt = 'rgba(168,85,247,0.08)';
const purpleBd = 'rgba(168,85,247,0.2)';
const openBd   = 'rgba(255, 119, 0, 0.43)';

const STATUS_COLORS = {
  open:             { text: '#93c5fd', bg: 'rgba(30,58,138,0.55)', border: 'rgba(96,165,250,0.65)' },
  in_progress:      { text: '#fde68a', bg: 'rgba(120,53,15,0.55)',  border: 'rgba(251,191,36,0.65)' },
  waiting_customer: { text: '#d4d4d8', bg: 'rgba(39,39,42,0.65)',   border: 'rgba(161,161,170,0.5)' },
  resolved:         { text: '#6ee7b7', bg: 'rgba(6,78,59,0.55)',    border: 'rgba(52,211,153,0.65)' },
  closed:           { text: '#fca5a5', bg: 'rgba(127,29,29,0.55)',  border: 'rgba(248,113,113,0.65)' },
};

const StatusChip = ({ status }) => {
  const c = STATUS_COLORS[status] ?? STATUS_COLORS.open;
  const label = status?.replace(/_/g, ' ') ?? status;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 9999, fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase',
      color: c.text, background: c.bg, border: `1px solid ${c.border}`, letterSpacing: '0.1em',
    }}>
      {label}
    </span>
  );
};

const PRIORITY_OPTIONS = [
  { value: 'low',    label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high',   label: 'High' },
  { value: 'urgent', label: 'Urgent — Need help ASAP' },
];
const CATEGORY_OPTIONS = [
  { value: 'general',  label: 'General Enquiry' },
  { value: 'billing',  label: 'Billing / Payment' },
  { value: 'technical',label: 'Technical Issue' },
  { value: 'shipping', label: 'Shipping / Delivery' },
  { value: 'returns',  label: 'Returns / Refunds' },
  { value: 'other',    label: 'Other' },
];

const STATUS_TABS = [
  { id: '',       label: 'All' },
  { id: 'open',   label: 'Open' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'resolved',    label: 'Resolved' },
  { id: 'closed',      label: 'Closed' },
];

export default function MyTickets() {
  const navigate = useNavigate();
  
  const { tickets, pagination, loading, fetchMyTickets, createTicket } = useTicketStore();
  const [currentPage, setCurrentPage] = useState(1);

  const [statusFilter, setStatusFilter] = useState('');

  // new ticket modal
  const [showNew, setShowNew]     = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ subject: '', description: '', priority: 'medium', category: 'general' });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    fetchMyTickets({ status: statusFilter, page: currentPage, per_page: 15 });
  }, [statusFilter, currentPage]);

  const handleTabChange = (tabId) => {
    setStatusFilter(tabId);
    setCurrentPage(1);
  };

  const allTickets = Array.isArray(tickets) ? tickets : [];
  const filtered = useMemo(() => {
    if (!statusFilter) return allTickets;
    return allTickets.filter(t => t.status === statusFilter);
  }, [allTickets, statusFilter]);

  const handleFormChange = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const validate = () => {
    const e = {};
    if (!form.subject.trim())     e.subject     = 'Subject is required';
    if (!form.description.trim()) e.description = 'Please describe your issue';
    return e;
  };

  const handleSubmit = async () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setSubmitting(true);
    try {
      const res = await createTicket(form);
      toast.success('Ticket submitted! Our team will respond shortly.');
      setShowNew(false);
      setForm({ subject: '', description: '', priority: 'medium', category: 'general' });
      setErrors({});
      navigate(`/my-tickets/${res.ticket.id}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit ticket');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Helmet><title>My Support Tickets</title></Helmet>
      <Header />

      <main style={{ flex: 1, maxWidth: 860, margin: '0 auto', padding: '40px 20px', width: '100%' }}>
        {/* Page header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.7rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Ticket size={22} color={purple} /> My Support Tickets
            </h1>
            <p style={{ margin: '4px 0 0', color: '#9ca3af', fontSize: '0.88rem' }}>
              Track your support requests
            </p>
          </div>
          <button
            onClick={() => setShowNew(true)}
            type="button"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 10, fontSize: '0.85rem', fontWeight: 600,
              background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.3)',
              color: '#a855f7', cursor: 'pointer', transition: 'all 150ms ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(168,85,247,0.18)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(168,85,247,0.1)'; }}
          >
            <Plus size={15} /> New Ticket
          </button>
        </div>

        {/* Status tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 24, overflowX: 'auto', paddingBottom: 4 }}>
          {STATUS_TABS.map(tab => (
            <button key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              style={{
                padding: '7px 18px', borderRadius: 20, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                fontWeight: 700, fontSize: '0.8rem',
                background: statusFilter === tab.id ? purple : purpleLt,
                color:      statusFilter === tab.id ? 'white' : '#9ca3af',
                transition: 'all 150ms',
              }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Ticket list */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><LoadingSpinner /></div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#9ca3af' }}>
            <Ticket size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
            <p>No tickets found</p>
            <button
              onClick={() => setShowNew(true)}
              style={{
                marginTop: 12,
                padding: '8px 16px',
                borderRadius: 10,
                fontSize: '0.85rem',
                fontWeight: 600,
                background: 'rgba(168,85,247,0.1)',
                border: '1px solid rgba(168,85,247,0.3)',
                color: '#a855f7',
                cursor: 'pointer',
                transition: 'all 150ms ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(168,85,247,0.18)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(168,85,247,0.1)'; }}
            >
              Open a Ticket
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filtered.map(t => (
              <div key={t.id}
                onClick={() => navigate(`/my-tickets/${t.id}`)}
                style={{
                  padding: '16px 20px', borderRadius: 14,
                  border: `1px solid ${t.status === 'open' ? purpleBd : openBd}`,
                  cursor: 'pointer',
                  transition: 'box-shadow 150ms',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)'}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: purple, fontWeight: 700 }}>
                        {t.ticket_number}
                      </span>
                      <StatusChip status={t.status} />
                    </div>
                    <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: '0.92rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.subject}
                    </p>
                    <div style={{ display: 'flex', gap: 14, fontSize: '0.75rem', color: '#9ca3af', flexWrap: 'wrap' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={11} /> {format(new Date(t.created_at), 'dd MMM yyyy')}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <MessageSquare size={11} /> {t.replies_count ?? 0} repl{t.replies_count === 1 ? 'y' : 'ies'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {pagination?.last_page > 1 && (
          <div style={{ marginTop: 32, display: 'flex', justifyContent: 'center' }}>
            <AdminPagination 
              pagination={pagination} 
              onPageChange={(p) => { 
                setCurrentPage(p); 
                window.scrollTo({ top: 0, behavior: 'smooth' }); 
              }} 
            />
          </div>
        )}
      </main>

      <Footer />

      {/* New Ticket Modal */}
      <Modal isOpen={showNew} onClose={() => { setShowNew(false); setErrors({}); }} title="Open a Support Ticket" size="lg">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Input
            label="Subject"
            value={form.subject}
            onChange={e => handleFormChange('subject', e.target.value)}
            placeholder="Brief summary of your issue"
            error={errors.subject}
            required
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Select
              label="Category"
              value={form.category}
              onChange={e => handleFormChange('category', e.target.value)}
              options={CATEGORY_OPTIONS}
            />
            <Select
              label="Priority"
              value={form.priority}
              onChange={e => handleFormChange('priority', e.target.value)}
              options={PRIORITY_OPTIONS}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 6, color: '#374151' }}>
              Description <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <textarea
              value={form.description}
              onChange={e => handleFormChange('description', e.target.value)}
              placeholder="Describe your issue in detail…"
              rows={6}
              style={{
                width: '100%', boxSizing: 'border-box', borderRadius: 10, padding: '10px 14px',
                border: `1.5px solid ${errors.description ? '#ef4444' : '#e5e7eb'}`,
                fontSize: '0.88rem', resize: 'vertical', outline: 'none',
              }}
            />
            {errors.description && <p style={{ color: '#ef4444', fontSize: '0.78rem', margin: '4px 0 0' }}>{errors.description}</p>}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <Button variant="secondary" onClick={() => { setShowNew(false); setErrors({}); }}>Cancel</Button>
            <Button onClick={handleSubmit} loading={submitting}>Submit Ticket</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
