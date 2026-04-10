import React, { useEffect, useState } from 'react';
import { FolderTree, Plus, Edit2, Trash2, Save, X, ChevronRight } from 'lucide-react';
import useServiceStore from '../../store/serviceStore';
import {
  getAdminCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../../api/serviceCategories';
import AdminLayout from '../../components/layout/AdminLayout';
import LoadingSpinner from '../../components/layout/LoadingSpinner';
import toast from 'react-hot-toast';

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputStyle = {
  width: '100%', padding: '7px 11px', borderRadius: 8, fontSize: '0.82rem',
  background: 'rgba(168,85,247,0.04)',
  border: '1.5px solid rgba(168,85,247,0.18)',
  color: '#111827', outline: 'none',
  transition: 'border-color 150ms, box-shadow 150ms',
  fontFamily: 'inherit', boxSizing: 'border-box',
};
const inputFocus = (e) => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.1)'; };
const inputBlur  = (e) => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.18)'; e.currentTarget.style.boxShadow = 'none'; };

const labelStyle = {
  fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.08em', color: '#7c3aed', display: 'block', marginBottom: 5,
};

const card = {
  background: 'white', borderRadius: 12,
  border: '1px solid rgba(168,85,247,0.1)',
  boxShadow: '0 2px 12px rgba(168,85,247,0.06)',
};

// ── Atom components ───────────────────────────────────────────────────────────

function Field({ label, children }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function SI({ style: extra = {}, ...props }) {
  return (
    <input {...props} style={{ ...inputStyle, ...extra }}
      onFocus={inputFocus} onBlur={inputBlur} />
  );
}

function SS({ children, style: extra = {}, ...props }) {
  return (
    <select {...props} style={{ ...inputStyle, ...extra }}
      onFocus={inputFocus} onBlur={inputBlur}>
      {children}
    </select>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <div onClick={() => onChange(!checked)} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
      background: 'rgba(168,85,247,0.03)', border: '1.5px solid rgba(168,85,247,0.1)',
      userSelect: 'none',
    }}>
      <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151', margin: 0 }}>{label}</p>
      <div style={{
        width: 36, height: 20, borderRadius: 10, position: 'relative', flexShrink: 0,
        background: checked ? 'linear-gradient(135deg,#a855f7,#7c3aed)' : 'rgba(168,85,247,0.15)',
        transition: 'background 200ms',
      }}>
        <span style={{
          position: 'absolute', top: 3, width: 14, height: 14, borderRadius: '50%',
          background: checked ? 'white' : '#c4b5fd',
          left: checked ? 19 : 3, transition: 'left 200ms',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }} />
      </div>
    </div>
  );
}

function StatusBadge({ active }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 20, fontSize: '0.62rem', fontWeight: 700,
      background: active ? 'rgba(16,185,129,0.1)' : 'rgba(107,114,128,0.1)',
      color: active ? '#065f46' : '#4b5563',
      boxShadow: `0 0 0 1px ${active ? 'rgba(16,185,129,0.25)' : 'rgba(107,114,128,0.2)'}`,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: active ? '#10b981' : '#9ca3af' }} />
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

function IconBtn({ onClick, danger, title, children }) {
  return (
    <button type="button" onClick={onClick} title={title} style={{
      width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
      borderRadius: 8, border: 'none', cursor: 'pointer', flexShrink: 0,
      background: 'none', color: danger ? '#fca5a5' : '#c4b5fd',
      transition: 'background 120ms, color 120ms',
    }}
      onMouseEnter={e => { e.currentTarget.style.background = danger ? 'rgba(239,68,68,0.08)' : 'rgba(168,85,247,0.08)'; e.currentTarget.style.color = danger ? '#ef4444' : '#a855f7'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = danger ? '#fca5a5' : '#c4b5fd'; }}
    >
      {children}
    </button>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function CategoryModal({ open, onClose, editing, parentCategories, onSaved }) {
  const [formData, setFormData]   = useState({ name: '', slug: '', description: '', parent_id: '', is_active: true, display_order: 0 });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setFormData(editing ? {
        name:          editing.name          || '',
        slug:          editing.slug          || '',
        description:   editing.description   || '',
        parent_id:     editing.parent_id     || '',
        is_active:     editing.is_active !== undefined ? editing.is_active : true,
        display_order: editing.display_order || 0,
      } : { name: '', slug: '', description: '', parent_id: '', is_active: true, display_order: 0 });
    }
  }, [open, editing]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(p => ({ ...p, [name]: type === 'checkbox' ? checked : value }));
    if (name === 'name' && !editing) {
      setFormData(p => ({
        ...p,
        slug: value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true); setError(null);
    try {
      if (editing) await updateCategory(editing.id, formData);
      else         await createCategory(formData);
      onSaved();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save category');
    } finally { setSubmitting(false); }
  };

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(15,10,30,0.65)', backdropFilter: 'blur(6px)' }}>
      <div style={{ ...card, width: '100%', maxWidth: 460, padding: 24 }}>

        {/* Modal header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <p style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111827', margin: 0 }}>
            {editing ? 'Edit category' : 'New category'}
          </p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex', padding: 2, transition: 'color 120ms' }}
            onMouseEnter={e => e.currentTarget.style.color = '#a855f7'}
            onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}
          >
            <X size={16} />
          </button>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            marginBottom: 14, padding: '10px 14px', borderRadius: 8,
            background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)',
            fontSize: '0.78rem', color: '#b91c1c',
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Category name *">
            <SI name="name" value={formData.name} onChange={handleChange} placeholder="e.g. IT Services" required />
          </Field>

          <Field label="Slug *">
            <SI name="slug" value={formData.slug} onChange={handleChange} placeholder="it-services" required style={{ fontFamily: 'monospace' }} />
          </Field>

          <Field label="Description">
            <SI name="description" value={formData.description} onChange={handleChange} placeholder="Brief description…" />
          </Field>

          <Field label="Parent category">
            <SS name="parent_id" value={formData.parent_id} onChange={handleChange}>
              <option value="">None (top-level)</option>
              {parentCategories
                .filter(c => c.id !== editing?.id)
                .map(c => <option key={c.id} value={c.id}>{c.name}</option>)
              }
            </SS>
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Display order">
              <SI type="number" name="display_order" value={formData.display_order} onChange={handleChange} min="0" />
            </Field>
            <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
              <Toggle
                checked={formData.is_active}
                onChange={v => setFormData(p => ({ ...p, is_active: v }))}
                label="Active"
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, paddingTop: 6 }}>
            <button type="button" onClick={onClose} disabled={submitting} style={{
              flex: 1, padding: '9px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600,
              background: 'transparent', border: '1.5px solid rgba(168,85,247,0.2)', color: '#9ca3af',
              cursor: 'pointer', fontFamily: 'inherit',
            }}>Cancel</button>
            <button type="submit" disabled={submitting} style={{
              flex: 1, padding: '9px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 700,
              border: 'none', cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white',
              opacity: submitting ? 0.7 : 1, boxShadow: '0 2px 10px rgba(168,85,247,0.3)',
            }}>
              {submitting ? 'Saving…' : editing ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const ServiceCategories = () => {
  const { categories, loading, fetchCategories } = useServiceStore();

  const [showModal,        setShowModal]        = useState(false);
  const [editingCategory,  setEditingCategory]  = useState(null);

  useEffect(() => { fetchCategories({ all: true }); }, []);

  const handleCreate = () => { setEditingCategory(null); setShowModal(true); };
  const handleEdit   = (cat) => { setEditingCategory(cat); setShowModal(true); };

  const handleDelete = async (cat) => {
    if (!confirm(`Delete "${cat.name}"?`)) return;
    try {
      await deleteCategory(cat.id);
      fetchCategories({ all: true });
      toast.success(`"${cat.name}" deleted`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete category');
    }
  };

  const parentCategories = (categories || []).filter(c => !c.parent_id);
  const getChildren      = (pid) => (categories || []).filter(c => c.parent_id === pid);

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(168,85,247,0.1)', color: '#a855f7',
            }}>
              <FolderTree size={18} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#a855f7', letterSpacing: '-0.02em', margin: '0 0 2px' }}>
                Service categories
              </h1>
              <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: 0 }}>
                Manage service categories and subcategories
              </p>
            </div>
          </div>
          <button onClick={handleCreate} style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '9px 18px', borderRadius: 10, fontSize: '0.82rem', fontWeight: 700,
            border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white',
            boxShadow: '0 4px 14px rgba(168,85,247,0.35)', transition: 'box-shadow 150ms',
          }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 6px 20px rgba(168,85,247,0.5)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = '0 4px 14px rgba(168,85,247,0.35)'}
          >
            <Plus size={15} /> Add category
          </button>
        </div>

        {/* ── Content ── */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
            <LoadingSpinner size="lg" />
          </div>
        ) : parentCategories.length === 0 ? (
          <div style={{
            ...card, padding: '64px 24px', textAlign: 'center',
            border: '1.5px dashed rgba(168,85,247,0.2)', background: 'transparent',
            boxShadow: 'none',
          }}>
            <FolderTree size={36} style={{ color: 'rgba(168,85,247,0.2)', margin: '0 auto 12px', display: 'block' }} />
            <p style={{ fontSize: '0.875rem', color: '#9ca3af', margin: '0 0 16px' }}>No categories yet</p>
            <button onClick={handleCreate} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 18px', borderRadius: 9, fontSize: '0.82rem', fontWeight: 700,
              border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white',
            }}>
              <Plus size={14} /> Add first category
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
            {parentCategories.map(parent => {
              const children = getChildren(parent.id);
              return (
                <div key={parent.id} style={card}>

                  {/* Parent row */}
                  <div style={{
                    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                    gap: 12, padding: '16px 20px',
                    borderBottom: children.length ? '1px solid rgba(168,85,247,0.08)' : 'none',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                        <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#111827', margin: 0 }}>
                          {parent.name}
                        </p>
                        <StatusBadge active={parent.is_active} />
                      </div>
                      {parent.description && (
                        <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0 0 4px', lineHeight: 1.4 }}>
                          {parent.description}
                        </p>
                      )}
                      <p style={{ fontSize: '0.65rem', color: '#c4b5fd', fontFamily: 'monospace', margin: 0 }}>
                        {parent.slug}
                        {parent.services_count != null && (
                          <span style={{ color: '#9ca3af', fontFamily: 'inherit', marginLeft: 8 }}>
                            {parent.services_count} service{parent.services_count !== 1 ? 's' : ''}
                          </span>
                        )}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                      <IconBtn onClick={() => handleEdit(parent)} title="Edit"><Edit2 size={14} /></IconBtn>
                      <IconBtn onClick={() => handleDelete(parent)} title="Delete" danger><Trash2 size={14} /></IconBtn>
                    </div>
                  </div>

                  {/* Child rows */}
                  {children.length > 0 && (
                    <div style={{ padding: '8px 12px 12px' }}>
                      {children.map((child, i) => (
                        <div key={child.id} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                          padding: '9px 12px', borderRadius: 9,
                          background: 'rgba(168,85,247,0.03)',
                          border: '1px solid rgba(168,85,247,0.08)',
                          marginTop: i === 0 ? 0 : 6,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                            <ChevronRight size={12} style={{ color: '#c4b5fd', flexShrink: 0 }} />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151' }}>
                                  {child.name}
                                </span>
                                <StatusBadge active={child.is_active} />
                              </div>
                              {child.services_count != null && (
                                <p style={{ fontSize: '0.65rem', color: '#9ca3af', margin: '1px 0 0' }}>
                                  {child.services_count} service{child.services_count !== 1 ? 's' : ''}
                                </p>
                              )}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                            <IconBtn onClick={() => handleEdit(child)} title="Edit"><Edit2 size={13} /></IconBtn>
                            <IconBtn onClick={() => handleDelete(child)} title="Delete" danger><Trash2 size={13} /></IconBtn>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Modal ── */}
        <CategoryModal
          open={showModal}
          onClose={() => setShowModal(false)}
          editing={editingCategory}
          parentCategories={parentCategories}
          onSaved={() => fetchCategories({ all: true })}
        />
      </div>
    </AdminLayout>
  );
};

export default ServiceCategories;