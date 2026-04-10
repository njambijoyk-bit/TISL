import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Ticket, Search, X, RefreshCw, Trash2, RotateCcw,
  UserCheck, AlertTriangle, CheckCircle, Clock, MessageSquare, Filter
} from 'lucide-react';
import AdminLayout from '../../components/layout/AdminLayout';
import PageHeader from '../../components/layout/PageHeader';
import DataTable from '../../components/admin/DataTable';
import StatsCard from '../../components/admin/StatsCard';
import SearchBar from '../../components/admin/SearchBar';
import Select from '../../components/common/Select';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import LoadingSpinner from '../../components/layout/LoadingSpinner';
import { TicketStatusBadge, TicketPriorityBadge } from '../../components/admin/TicketStatusBadge';
import useTicketStore from '../../store/ticketStore';
import { useAuthStore } from '../../store';
import ticketsAPI from '../../api/tickets';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'open',             label: 'Open' },
  { value: 'in_progress',      label: 'In Progress' },
  { value: 'waiting_customer', label: 'Waiting Customer' },
  { value: 'resolved',         label: 'Resolved' },
  { value: 'closed',           label: 'Closed' },
];

const PRIORITY_OPTIONS = [
  { value: '',       label: 'All Priorities' },
  { value: 'low',    label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high',   label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

const CATEGORY_OPTIONS = [
  { value: '',         label: 'All Categories' },
  { value: 'general',  label: 'General' },
  { value: 'billing',  label: 'Billing' },
  { value: 'technical',label: 'Technical' },
  { value: 'shipping', label: 'Shipping' },
  { value: 'returns',  label: 'Returns' },
  { value: 'other',    label: 'Other' },
];

export default function AdminTickets() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'super_admin';

  const { tickets, statistics, loading, fetchAdminTickets, fetchStatistics, softDelete, restore, forceDelete } = useTicketStore();

  const [filters, setFilters] = useState({ search: '', status: '', priority: '', category: '' });
  const [pagination, setPagination] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

  // trash modal
  const [showTrash, setShowTrash] = useState(false);
  const [trashedTickets, setTrashedTickets] = useState([]);
  const [trashLoading, setTrashLoading] = useState(false);

  // staff list for assign dropdown filter
  const [staffList, setStaffList] = useState([]);

  const loadTickets = async (page = 1) => {
    const res = await fetchAdminTickets({ ...filters, page, per_page: 20 });
    setPagination(res?.meta ?? null);
  };

  useEffect(() => {
    fetchStatistics();
  }, []);

  useEffect(() => {
    loadTickets(currentPage);
  }, [filters, currentPage]);

  const handleFilterChange = (key, val) => {
    setFilters(f => ({ ...f, [key]: val }));
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setFilters({ search: '', status: '', priority: '', category: '' });
    setCurrentPage(1);
  };

  const hasFilters = Object.values(filters).some(Boolean);

  // ── Trash Modal ───────────────────────────────
  const openTrash = async () => {
    setShowTrash(true);
    setTrashLoading(true);
    try {
      const res = await ticketsAPI.getTrashedTickets();
      setTrashedTickets(res.data ?? res);
    } catch { toast.error('Failed to load trash'); }
    finally { setTrashLoading(false); }
  };

  const handleRestore = async (id) => {
    try {
      await restore(id);
      setTrashedTickets(t => t.filter(x => x.id !== id));
      toast.success('Ticket restored');
      loadTickets(currentPage);
    } catch { toast.error('Failed to restore'); }
  };

  const handleForceDelete = async (id) => {
    if (!window.confirm('Permanently delete this ticket? This cannot be undone.')) return;
    try {
      await forceDelete(id);
      setTrashedTickets(t => t.filter(x => x.id !== id));
      toast.success('Ticket permanently deleted');
    } catch { toast.error('Failed to delete permanently'); }
  };

  const handleSoftDelete = async (id) => {
    if (!window.confirm('Move this ticket to trash?')) return;
    try {
      await softDelete(id);
      toast.success('Ticket moved to trash');
      loadTickets(currentPage);
    } catch { toast.error('Failed to trash ticket'); }
  };

  // ── Table columns ─────────────────────────────
  const columns = [
    {
      key: 'ticket_number',
      label: 'Ticket #',
      render: (row) => (
        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#a855f7', fontSize: '0.8rem' }}>
          {row.ticket_number}
        </span>
      ),
    },
    {
      key: 'subject',
      label: 'Subject',
      render: (row) => (
        <div>
          <p style={{ fontWeight: 600, fontSize: '0.85rem', margin: 0 }}>{row.subject}</p>
          <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: '2px 0 0' }}>
            {row.category?.charAt(0).toUpperCase() + row.category?.slice(1)}
          </p>
        </div>
      ),
    },
    {
      key: 'customer',
      label: 'Customer',
      render: (row) => row.customer
        ? <span style={{ fontSize: '0.82rem' }}>{row.customer.first_name} {row.customer.last_name}</span>
        : '—',
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => <TicketStatusBadge status={row.status} />,
    },
    {
      key: 'priority',
      label: 'Priority',
      render: (row) => <TicketPriorityBadge priority={row.priority} />,
    },
    {
      key: 'assigned_to',
      label: 'Assigned To',
      render: (row) => row.assigned_to
        ? <span style={{ fontSize: '0.82rem' }}>{row.assigned_to.name}</span>
        : <span style={{ fontSize: '0.78rem', color: '#9ca3af', fontStyle: 'italic' }}>Unassigned</span>,
    },
    {
      key: 'replies_count',
      label: 'Replies',
      render: (row) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.82rem' }}>
          <MessageSquare size={13} /> {row.replies_count ?? 0}
        </span>
      ),
    },
    {
      key: 'created_at',
      label: 'Created',
      render: (row) => <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>{format(new Date(row.created_at), 'dd MMM yy')}</span>,
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (row) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button size="sm" variant="outline" onClick={() => navigate(`/admin/tickets/${row.id}`)}>
            View
          </Button>
          <Button size="sm" variant="ghost" icon={<Trash2 size={13} />}
            onClick={(e) => { e.stopPropagation(); handleSoftDelete(row.id); }}
          />
        </div>
      ),
    },
  ];

  // stats config
  const stats = [
    { title: 'Total',       value: statistics?.total       ?? '—', icon: Ticket,       color: 'primary' },
    { title: 'Open',        value: statistics?.open        ?? '—', icon: Clock,        color: 'info'    },
    { title: 'In Progress', value: statistics?.in_progress ?? '—', icon: RefreshCw,    color: 'warning' },
    { title: 'Unassigned',  value: statistics?.unassigned  ?? '—', icon: UserCheck,    color: 'danger'  },
    { title: 'Urgent',      value: statistics?.urgent      ?? '—', icon: AlertTriangle,color: 'danger'  },
    { title: 'Resolved',    value: statistics?.resolved    ?? '—', icon: CheckCircle,  color: 'success' },
  ];

  return (
    <AdminLayout>
      <PageHeader
        title="Tickets"
        subtitle="Support tickets from customers"
        actions={
          <Button variant="ghost" size="sm" icon={<Trash2 size={15} />} onClick={openTrash}>
            Trash {statistics?.trashed > 0 && `(${statistics.trashed})`}
          </Button>
        }
      />

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16, marginBottom: 24 }}>
        {stats.map(s => (
          <StatsCard key={s.title} title={s.title} value={s.value} icon={s.icon} color={s.color} loading={!statistics} />
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 20 }}>
        <div style={{ flex: '1 1 220px' }}>
          <SearchBar
            value={filters.search}
            onChange={v => handleFilterChange('search', v)}
            placeholder="Search ticket # or subject…"
          />
        </div>
        <div style={{ minWidth: 160 }}>
          <Select value={filters.status} onChange={e => handleFilterChange('status', e.target.value)}
            options={STATUS_OPTIONS} />
        </div>
        <div style={{ minWidth: 140 }}>
          <Select value={filters.priority} onChange={e => handleFilterChange('priority', e.target.value)}
            options={PRIORITY_OPTIONS} />
        </div>
        <div style={{ minWidth: 150 }}>
          <Select value={filters.category} onChange={e => handleFilterChange('category', e.target.value)}
            options={CATEGORY_OPTIONS} />
        </div>
        {hasFilters && (
          <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={clearFilters}>
            Clear
          </Button>
        )}
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={Array.isArray(tickets) ? tickets : []}
        loading={loading}
        pagination={pagination}
        onPageChange={setCurrentPage}
        emptyMessage="No tickets found"
      />

      {/* Trash Modal */}
      <Modal isOpen={showTrash} onClose={() => setShowTrash(false)} title="Ticket Trash" size="xl">
        {trashLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><LoadingSpinner /></div>
        ) : trashedTickets.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#9ca3af', padding: 40 }}>Trash is empty</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {trashedTickets.map(t => (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 16px', borderRadius: 10, border: '1px solid #f3f4f6', background: '#fafafa'
              }}>
                <div>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#a855f7', fontSize: '0.8rem' }}>{t.ticket_number}</span>
                  <span style={{ marginLeft: 12, fontSize: '0.85rem' }}>{t.subject}</span>
                  <span style={{ marginLeft: 12, fontSize: '0.75rem', color: '#9ca3af' }}>
                    Deleted {t.deleted_at ? format(new Date(t.deleted_at), 'dd MMM yyyy') : ''}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button size="sm" variant="outline" icon={<RotateCcw size={13} />} onClick={() => handleRestore(t.id)}>
                    Restore
                  </Button>
                  {isSuperAdmin && (
                    <Button size="sm" variant="danger" icon={<Trash2 size={13} />} onClick={() => handleForceDelete(t.id)}>
                      Delete Forever
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </AdminLayout>
  );
}
