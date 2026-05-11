import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import AdminLayout from '../../components/layout/AdminLayout';
import LoadingSpinner from '../../components/layout/LoadingSpinner';
import useServiceStore from '../../store/serviceStore';
import {
  createCategory,
  updateCategory,
  deleteCategory,
} from '../../api/serviceCategories';
import {
  Plus, Search, Edit2, Trash2, X,
  FolderTree, CheckCircle, XCircle, GitBranch, AlertTriangle,
} from 'lucide-react';

// ─── Style tokens ──────────────────────────────────────────────────────────────

const card = {
  background: 'var(--color-background-primary)',
  border: '1px solid var(--color-border-tertiary)',
  borderRadius: 12,
  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
};

const inputStyle = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 8,
  fontSize: '0.875rem',
  border: '1px solid var(--color-border-tertiary)',
  background: 'var(--color-background-primary)',
  color: 'var(--color-text-primary)',
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

const thStyle = {
  padding: '10px 16px',
  textAlign: 'left',
  fontSize: '0.68rem',
  fontWeight: 700,
  color: 'var(--color-text-tertiary)',
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  borderBottom: '1px solid var(--color-border-tertiary)',
  background: 'var(--color-background-secondary)',
  whiteSpace: 'nowrap',
};

const tdStyle = {
  padding: '12px 16px',
  borderBottom: '1px solid var(--color-border-tertiary)',
  fontSize: '0.875rem',
  color: 'var(--color-text-primary)',
  verticalAlign: 'middle',
};

const labelStyle = {
  fontSize: '0.65rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  color: 'var(--color-text-tertiary)',
  display: 'block',
  marginBottom: 5,
};

// ─── Buttons ──────────────────────────────────────────────────────────────────

function Btn({ onClick, disabled, style, children, title }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '8px 14px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600,
      border: '1px solid var(--color-border-tertiary)',
      background: 'var(--color-background-primary)',
      color: 'var(--color-text-primary)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      fontFamily: 'inherit', transition: 'background 150ms', ...style,
    }}>
      {children}
    </button>
  );
}

function PrimaryBtn({ onClick, disabled, children, style }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '8px 16px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 700,
      border: 'none', background: '#7c3aed', color: 'white',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.6 : 1, fontFamily: 'inherit',
      boxShadow: '0 2px 8px rgba(124,58,237,0.3)', ...style,
    }}>
      {children}
    </button>
  );
}

function DangerBtn({ onClick, disabled, children, style }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '8px 14px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600,
      border: 'none', background: 'var(--color-background-danger)', color: 'var(--color-text-danger)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.6 : 1, fontFamily: 'inherit', ...style,
    }}>
      {children}
    </button>
  );
}

function IconBtn({ onClick, title, color, children }) {
  return (
    <button onClick={onClick} title={title} style={{
      width: 32, height: 32, borderRadius: 7,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: 'none', background: 'transparent',
      color, cursor: 'pointer', transition: 'background 150ms',
    }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--color-background-secondary)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {children}
    </button>
  );
}

// ─── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, iconBg, iconColor }) {
  return (
    <div style={{ ...card, padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <p style={{ margin: '0 0 4px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}
        </p>
        <p style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
          {value}
        </p>
      </div>
      <div style={{ width: 44, height: 44, borderRadius: 10, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={20} style={{ color: iconColor }} />
      </div>
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ active }) {
  return active ? (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 8px', borderRadius: 99, fontSize: '0.68rem', fontWeight: 700,
      background: 'var(--color-background-success)', color: 'var(--color-text-success)',
    }}>
      <CheckCircle size={11} /> ACTIVE
    </span>
  ) : (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 8px', borderRadius: 99, fontSize: '0.68rem', fontWeight: 700,
      background: 'var(--color-background-secondary)', color: 'var(--color-text-secondary)',
    }}>
      <XCircle size={11} /> INACTIVE
    </span>
  );
}

// ─── Modal wrapper ─────────────────────────────────────────────────────────────

function Modal({ children, onClose, maxWidth = 480 }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(0,0,0,0.35)',
        backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ ...card, background: 'white', color: '#7c3aed', width: '100%', maxWidth, maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  );
}

// ─── Create / Edit modal ───────────────────────────────────────────────────────

const emptyForm = { name: '', slug: '', description: '', parent_id: '', display_order: 0, is_active: true };

function CategoryModal({ open, onClose, editing, parentOptions, onSaved }) {
  const [form, setForm]           = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(editing ? {
      name:          editing.name           ?? '',
      slug:          editing.slug           ?? '',
      description:   editing.description    ?? '',
      parent_id:     editing.parent_id      ?? '',
      display_order: editing.display_order  ?? 0,
      is_active:     editing.is_active !== undefined ? Boolean(editing.is_active) : true,
    } : emptyForm);
  }, [open, editing]);

  const handleChange = e => {
    const { name, value } = e.target;
    setForm(p => ({ ...p, [name]: value }));
    // Auto-slug from name when creating
    if (name === 'name' && !editing) {
      setForm(p => ({
        ...p,
        name: value,
        slug: value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      }));
    }
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) { setError('Category name is required'); return; }
    if (!form.slug.trim()) { setError('Slug is required'); return; }
    setSubmitting(true); setError(null);
    try {
      const payload = {
        ...form,
        parent_id:     form.parent_id     || null,
        display_order: Number(form.display_order) || 0,
      };
      if (editing) await updateCategory(editing.id, payload);
      else         await createCategory(payload);
      onSaved();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save category');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <Modal onClose={onClose} maxWidth={460}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 0' }}>
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
          {editing ? 'Edit category' : 'New service category'}
        </h3>
        <IconBtn onClick={onClose} title="Close" color="var(--color-text-secondary)">
          <X size={16} />
        </IconBtn>
      </div>

      {/* Body */}
      <div style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {error && (
          <div style={{
            padding: '10px 14px', borderRadius: 8, fontSize: '0.8rem',
            background: 'var(--color-background-danger)', color: 'var(--color-text-danger)',
            border: '1px solid var(--color-border-danger)',
          }}>
            {error}
          </div>
        )}

        {/* Name */}
        <div>
          <label style={labelStyle}>Category name *</label>
          <input
            name="name"
            value={form.name}
            onChange={handleChange}
            placeholder="e.g. IT Services"
            style={inputStyle}
          />
        </div>

        {/* Slug */}
        <div>
          <label style={labelStyle}>Slug *</label>
          <input
            name="slug"
            value={form.slug}
            onChange={handleChange}
            placeholder="it-services"
            style={{ ...inputStyle, fontFamily: 'monospace' }}
          />
        </div>

        {/* Description */}
        <div>
          <label style={labelStyle}>Description</label>
          <textarea
            name="description"
            value={form.description}
            onChange={handleChange}
            placeholder="Brief description…"
            rows={3}
            style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
          />
        </div>

        {/* Parent category */}
        <div>
          <label style={labelStyle}>Parent category</label>
          <select
            name="parent_id"
            value={form.parent_id}
            onChange={handleChange}
            style={{
              ...inputStyle,
              backgroundColor: "#1e1b4b",   // dropdown background
              color: "#a78bfa",             // text color
              colorScheme: "dark",          // tells browser to use dark scrollbar/arrows
            }}
          >
            <option value="">None (top-level)</option>
            {parentOptions
              .filter(c => c.id !== editing?.id)
              .map(c => <option key={c.id} value={c.id}>{c.name}</option>)
            }
          </select>
        </div>

        {/* Display order + Active toggle */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Display order</label>
            <input
              type="number"
              name="display_order"
              value={form.display_order}
              onChange={handleChange}
              min="0"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Status</label>
            <div
              onClick={() => setForm(p => ({ ...p, is_active: !p.is_active }))}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
                border: '1px solid var(--color-border-tertiary)',
                background: 'var(--color-background-primary)',
                userSelect: 'none',
              }}
            >
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                Active
              </span>
              <div style={{
                width: 34, height: 18, borderRadius: 9, position: 'relative',
                background: form.is_active ? '#7c3aed' : 'var(--color-background-secondary)',
                border: '1px solid var(--color-border-tertiary)',
                transition: 'background 200ms', flexShrink: 0,
              }}>
                <span style={{
                  position: 'absolute', top: 2, width: 12, height: 12, borderRadius: '50%',
                  background: form.is_active ? 'white' : 'var(--color-text-tertiary)',
                  left: form.is_active ? 18 : 2, transition: 'left 200ms',
                }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '0 24px 24px', display: 'flex', gap: 10 }}>
        <Btn onClick={onClose} disabled={submitting} style={{ flex: 1, justifyContent: 'center' }}>
          Cancel
        </Btn>
        <PrimaryBtn onClick={handleSubmit} disabled={submitting} style={{ flex: 1, justifyContent: 'center' }}>
          {submitting ? <><LoadingSpinner /> Saving…</> : editing ? 'Update' : 'Create'}
        </PrimaryBtn>
      </div>
    </Modal>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function ServiceCategories() {
  const { categories, loading, fetchCategories } = useServiceStore();

  const [searchTerm,    setSearchTerm]    = useState('');
  const [formModal,     setFormModal]     = useState({ open: false, editing: null });
  const [deleteModal,   setDeleteModal]   = useState({ isOpen: false, category: null, loading: false });

  useEffect(() => { fetchCategories({ all: true }); }, []);

  const reload = () => fetchCategories({ all: true });

  // ── Derived ──────────────────────────────────────────────────────────────────

  const list = categories || [];

  const isActive   = c => Boolean(c.is_active) || c.is_active === 1 || c.is_active === '1';
  const childCount = id => list.filter(c => c.parent_id === id).length;
  const parentName = id => list.find(c => c.id === id)?.name ?? 'Unknown';

  const filtered = list.filter(c =>
    !searchTerm ||
    c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.slug?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Only root categories are valid parent options
  const parentOptions = list.filter(c => !c.parent_id);

  const hasChildren = deleteModal.category ? childCount(deleteModal.category.id) > 0 : false;

  // ── Delete ───────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    setDeleteModal(p => ({ ...p, loading: true }));
    try {
      await deleteCategory(deleteModal.category.id);
      toast.success(`"${deleteModal.category.name}" deleted`);
      setDeleteModal({ isOpen: false, category: null, loading: false });
      reload();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to delete category');
      setDeleteModal(p => ({ ...p, loading: false }));
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <AdminLayout>
      <div style={{ padding: '24px 24px 48px', display: 'flex', flexDirection: 'column', gap: 24, minHeight: '100vh' }}>

        {/* ── Page heading ───────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: '0 0 4px', fontSize: '1.5rem', fontWeight: 800, color: '#a855f7', display: 'flex', alignItems: 'center', gap: 10 }}>
              <FolderTree size={24} style={{ color: '#a855f7' }} /> Service Categories
            </h1>
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
              Manage service categories and subcategories
            </p>
          </div>
          <PrimaryBtn onClick={() => setFormModal({ open: true, editing: null })}>
            <Plus size={15} /> New Category
          </PrimaryBtn>
        </div>

        {/* ── Stat cards ─────────────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          <StatCard label="Total"         value={list.length}                           icon={FolderTree}  iconBg="rgba(124,58,237,0.1)" iconColor="#7c3aed" />
          <StatCard label="Active"        value={list.filter(isActive).length}           icon={CheckCircle} iconBg="rgba(16,185,129,0.1)" iconColor="#10b981" />
          <StatCard label="Inactive"      value={list.filter(c => !isActive(c)).length}  icon={XCircle}     iconBg="rgba(239,68,68,0.1)"  iconColor="#ef4444" />
          <StatCard label="Subcategories" value={list.filter(c => c.parent_id).length}   icon={GitBranch}   iconBg="rgba(59,130,246,0.1)"  iconColor="#3b82f6" />
        </div>

        {/* ── Search ─────────────────────────────────────────────────────────── */}
        <div style={{ ...card, padding: 16 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)', pointerEvents: 'none' }} />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search by name, slug, or description…"
                style={{ ...inputStyle, paddingLeft: 32 }}
              />
            </div>
            {searchTerm && (
              <Btn onClick={() => setSearchTerm('')} style={{ color: 'var(--color-text-danger)', borderColor: 'var(--color-border-danger)' }}>
                <X size={15} /> Clear
              </Btn>
            )}
          </div>
        </div>

        {/* ── Table ──────────────────────────────────────────────────────────── */}
        <div style={{ ...card, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 64 }}>
              <LoadingSpinner />
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '64px 24px' }}>
              <FolderTree size={48} style={{ color: 'var(--color-text-tertiary)', display: 'block', margin: '0 auto 12px' }} />
              <h3 style={{ margin: '0 0 6px', fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                {searchTerm ? 'No categories match your search' : 'No service categories yet'}
              </h3>
              <p style={{ margin: '0 0 20px', fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
                {searchTerm ? 'Try a different search term' : 'Get started by creating your first service category'}
              </p>
              {!searchTerm && (
                <PrimaryBtn onClick={() => setFormModal({ open: true, editing: null })}>
                  <Plus size={15} /> Create First Category
                </PrimaryBtn>
              )}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Category', 'Slug', 'Parent', 'Status', 'Order', ''].map((h, i) => (
                      <th key={i} style={{ ...thStyle, textAlign: i === 5 ? 'right' : 'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(category => {
                    const kids = childCount(category.id);
                    return (
                      <tr
                        key={category.id}
                        style={{ transition: 'background 120ms' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--color-background-secondary)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        {/* Category */}
                        <td style={tdStyle}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {/* Icon placeholder */}
                            <div style={{
                              width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                              background: category.color ? `${category.color}18` : 'rgba(124,58,237,0.08)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '1rem',
                            }}>
                              {category.icon
                                ? <span style={{ fontSize: '1rem' }}>{category.icon}</span>
                                : <FolderTree size={16} style={{ color: category.color || '#7c3aed' }} />
                              }
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <p style={{ margin: 0, fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                                  {category.name}
                                </p>
                                {kids > 0 && (
                                  <span style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 3,
                                    padding: '1px 6px', borderRadius: 99, fontSize: '0.65rem', fontWeight: 700,
                                    background: 'rgba(59,130,246,0.1)', color: '#3b82f6',
                                  }}>
                                    <GitBranch size={9} /> {kids}
                                  </span>
                                )}
                              </div>
                              {category.description && (
                                <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: 'var(--color-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>
                                  {category.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Slug */}
                        <td style={tdStyle}>
                          <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                            {category.slug}
                          </span>
                        </td>

                        {/* Parent */}
                        <td style={tdStyle}>
                          {category.parent_id ? (
                            <span style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <GitBranch size={12} style={{ color: 'var(--color-text-tertiary)' }} />
                              {parentName(category.parent_id)}
                            </span>
                          ) : (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              padding: '2px 7px', borderRadius: 99, fontSize: '0.68rem', fontWeight: 700,
                              background: 'rgba(124,58,237,0.08)', color: '#7c3aed',
                            }}>
                              Root
                            </span>
                          )}
                        </td>

                        {/* Status */}
                        <td style={tdStyle}>
                          <StatusBadge active={isActive(category)} />
                        </td>

                        {/* Display order */}
                        <td style={tdStyle}>
                          <span style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
                            {category.display_order ?? '—'}
                          </span>
                        </td>

                        {/* Actions */}
                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>
                            <IconBtn
                              onClick={() => setFormModal({ open: true, editing: category })}
                              title="Edit"
                              color="#7c3aed"
                            >
                              <Edit2 size={15} />
                            </IconBtn>
                            <IconBtn
                              onClick={() => setDeleteModal({ isOpen: true, category, loading: false })}
                              title={kids > 0 ? `Has ${kids} subcategories` : 'Delete'}
                              color="var(--color-text-danger)"
                            >
                              <Trash2 size={15} />
                            </IconBtn>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Create / Edit modal ───────────────────────────────────────────────── */}
      <CategoryModal
        open={formModal.open}
        onClose={() => setFormModal({ open: false, editing: null })}
        editing={formModal.editing}
        parentOptions={parentOptions}
        onSaved={reload}
      />

      {/* ── Delete modal ─────────────────────────────────────────────────────── */}
      {deleteModal.isOpen && (
        <Modal onClose={() => setDeleteModal({ isOpen: false, category: null, loading: false })}>
          <div style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: hasChildren ? 'var(--color-background-warning)' : 'var(--color-background-danger)',
              }}>
                {hasChildren
                  ? <AlertTriangle size={20} style={{ color: 'var(--color-text-warning)' }} />
                  : <Trash2 size={20} style={{ color: 'var(--color-text-danger)' }} />
                }
              </div>
              <div>
                <h3 style={{ margin: '0 0 2px', fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  {hasChildren ? 'Cannot delete category' : 'Delete category'}
                </h3>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
                  {hasChildren
                    ? `Has ${childCount(deleteModal.category?.id)} subcategories`
                    : 'This action cannot be undone'
                  }
                </p>
              </div>
            </div>

            {hasChildren ? (
              <>
                <p style={{ margin: '0 0 20px', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                  <strong style={{ color: 'var(--color-text-primary)' }}>"{deleteModal.category?.name}"</strong> has subcategories.
                  Please delete or reassign them before deleting this category.
                </p>
                <Btn onClick={() => setDeleteModal({ isOpen: false, category: null, loading: false })} style={{ width: '100%', justifyContent: 'center' }}>
                  Got it
                </Btn>
              </>
            ) : (
              <>
                <p style={{ margin: '0 0 20px', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                  Are you sure you want to delete{' '}
                  <strong style={{ color: 'var(--color-text-primary)' }}>"{deleteModal.category?.name}"</strong>?
                </p>
                <div style={{ display: 'flex', gap: 10 }}>
                  <Btn
                    onClick={() => setDeleteModal({ isOpen: false, category: null, loading: false })}
                    disabled={deleteModal.loading}
                    style={{ flex: 1, justifyContent: 'center' }}
                  >
                    Cancel
                  </Btn>
                  <DangerBtn
                    onClick={handleDelete}
                    disabled={deleteModal.loading}
                    style={{ flex: 1, justifyContent: 'center', background: '#ef4444', color: 'white' }}
                  >
                    {deleteModal.loading ? <><LoadingSpinner /> Deleting…</> : 'Delete category'}
                  </DangerBtn>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
    </AdminLayout>
  );
}