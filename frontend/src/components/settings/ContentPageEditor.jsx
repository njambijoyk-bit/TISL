import { Eye, EyeOff, Plus, Trash2, Pencil, Check, X, GripVertical, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import useContentStore from '../../store/contentStore';
import SectionFieldset from './content/SectionFieldset';
import { getSectionTypes, ALL_SECTION_TYPES } from './content/sectionConfig';

// ── Shared styles ─────────────────────────────────────────────────────────────

const labelStyle = {
  fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.08em', color: '#7c3aed',
};

// ── TypeTag ───────────────────────────────────────────────────────────────────

const TypeTag = ({ type }) => {
  const label = ALL_SECTION_TYPES.find(t => t.value === type)?.label ?? type;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: 20,
      fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em',
      background: 'rgba(168,85,247,0.1)', color: '#7c3aed',
      border: '1px solid rgba(168,85,247,0.2)',
    }}>
      {label}
    </span>
  );
};

// ── Build blank draft ─────────────────────────────────────────────────────────

const toDraft = (section) => ({
  title:       section.title       ?? '',
  subtitle:    section.subtitle    ?? '',
  content:     section.content     ?? '',
  image_url:   section.image_url   ?? '',
  button_text: section.button_text ?? '',
  button_link: section.button_link ?? '',
  items:       section.items       ?? [],
  settings:    section.settings    ?? null,
});

// ── Pill button helper ────────────────────────────────────────────────────────

function PillBtn({ onClick, disabled, children, primary, danger, ghost }) {
  const base = {
    height: 34, padding: '0 16px', borderRadius: 99,
    fontSize: '0.78rem', fontWeight: 700, fontFamily: 'inherit',
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
    display: 'inline-flex', alignItems: 'center', gap: 6,
    border: 'none', transition: 'all 150ms',
  };
  const variant = primary
    ? { background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white', boxShadow: '0 2px 10px rgba(168,85,247,0.3)' }
    : danger
      ? { background: 'rgba(239,68,68,0.08)', color: '#b91c1c', border: '1px solid rgba(239,68,68,0.2)' }
      : ghost
        ? { background: 'transparent', color: '#9ca3af', border: '1.5px solid rgba(168,85,247,0.18)' }
        : { background: 'rgba(168,85,247,0.06)', color: '#7c3aed', border: '1.5px solid rgba(168,85,247,0.2)' };

  return (
    <button type="button" onClick={onClick} disabled={disabled}
      style={{ ...base, ...variant }}
      onMouseEnter={e => {
        if (!disabled) {
          if (primary) e.currentTarget.style.boxShadow = '0 4px 16px rgba(168,85,247,0.45)';
          else if (danger) e.currentTarget.style.background = 'rgba(239,68,68,0.14)';
          else if (ghost) { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.4)'; e.currentTarget.style.color = '#a855f7'; }
          else e.currentTarget.style.background = 'rgba(168,85,247,0.12)';
        }
      }}
      onMouseLeave={e => {
        if (primary) e.currentTarget.style.boxShadow = '0 2px 10px rgba(168,85,247,0.3)';
        else if (danger) e.currentTarget.style.background = 'rgba(239,68,68,0.08)';
        else if (ghost) { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.18)'; e.currentTarget.style.color = '#9ca3af'; }
        else e.currentTarget.style.background = 'rgba(168,85,247,0.06)';
      }}
    >
      {children}
    </button>
  );
}

// ── SectionCard ───────────────────────────────────────────────────────────────

const SectionCard = ({ section, pageType, onSave, onDelete, onToggle, onUploadImage }) => {
  const { errors, clearErrors } = useContentStore();
  const [editing,  setEditing]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [draft,    setDraft]    = useState(() => toDraft(section));

  const handleChange      = (key, val) => setDraft(d => ({ ...d, [key]: val }));
  const handleItemsChange = (items)    => setDraft(d => ({ ...d, items }));
  const handleEdit   = () => { clearErrors(); setDraft(toDraft(section)); setEditing(true); };
  const handleCancel = () => { clearErrors(); setDraft(toDraft(section)); setEditing(false); };

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      title:       draft.title       || null,
      subtitle:    draft.subtitle    || null,
      content:     draft.content     || null,
      image_url:   draft.image_url   || null,
      button_text: draft.button_text || null,
      button_link: draft.button_link || null,
      items:       draft.items?.length ? draft.items : null,
      settings:    draft.settings    || null,
    };
    const res = await onSave(section.id, payload);
    setSaving(false);
    if (res.success) { toast.success('Section saved'); clearErrors(); setEditing(false); }
    else toast.error(res.message ?? 'Failed to save');
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${section.title ?? section.section_key}"?`)) return;
    setDeleting(true);
    const res = await onDelete(section.id);
    if (!res.success) { toast.error(res.message ?? 'Failed to delete'); setDeleting(false); }
  };

  const initial = (section.title ?? section.section_key)?.[0]?.toUpperCase() ?? '?';

  return (
    <div style={{
      borderRadius: 14, overflow: 'hidden',
      border: editing
        ? '1.5px solid rgba(168,85,247,0.4)'
        : '1px solid rgba(168,85,247,0.1)',
      background: 'white',
      boxShadow: editing
        ? '0 8px 32px rgba(168,85,247,0.12)'
        : '0 2px 8px rgba(168,85,247,0.05)',
      transition: 'border-color 200ms, box-shadow 200ms',
    }}>

      {/* Card header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px',
        background: editing ? 'rgba(168,85,247,0.03)' : 'white',
        borderBottom: editing ? '1px solid rgba(168,85,247,0.1)' : 'none',
      }}>

        <GripVertical size={15} style={{ color: '#e5e7eb', flexShrink: 0, cursor: 'grab' }} />

        <div style={{
          width: 42, height: 42, borderRadius: 11, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1rem', fontWeight: 800, color: 'white',
          background: section.is_active
            ? 'linear-gradient(135deg,#a855f7,#7c3aed)'
            : 'linear-gradient(135deg,#d1d5db,#9ca3af)',
          boxShadow: section.is_active ? '0 3px 10px rgba(168,85,247,0.3)' : 'none',
        }}>
          {initial}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {section.title ?? section.section_key}
            </span>
            <TypeTag type={section.section_type} />
          </div>
          {section.subtitle && !editing && (
            <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {section.subtitle}
            </p>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => onToggle(section.id)}
            title={section.is_active ? 'Hide section' : 'Show section'}
            style={{
              height: 32, padding: '0 12px', borderRadius: 99,
              fontSize: '0.72rem', fontWeight: 700, fontFamily: 'inherit',
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5,
              transition: 'all 150ms',
              ...(section.is_active
                ? { background: 'rgba(16,185,129,0.1)', color: '#065f46', border: '1px solid rgba(16,185,129,0.25)' }
                : { background: 'rgba(107,114,128,0.1)', color: '#4b5563', border: '1px solid rgba(107,114,128,0.2)' }
              ),
            }}
          >
            {section.is_active ? <Eye size={12} /> : <EyeOff size={12} />}
            {section.is_active ? 'Live' : 'Hidden'}
          </button>

          {!editing ? (
            <>
              <PillBtn onClick={handleEdit}>
                <Pencil size={12} /> Edit
              </PillBtn>
              <PillBtn onClick={handleDelete} disabled={deleting} danger>
                <Trash2 size={12} /> {deleting ? '…' : 'Delete'}
              </PillBtn>
            </>
          ) : (
            <>
              <PillBtn onClick={handleSave} disabled={saving} primary>
                <Check size={12} /> {saving ? 'Saving…' : 'Save'}
              </PillBtn>
              <PillBtn onClick={handleCancel} ghost>
                <X size={12} /> Cancel
              </PillBtn>
            </>
          )}
        </div>
      </div>

      {/* Inline edit form */}
      {editing && (
        <div style={{ padding: '20px 24px', background: 'white' }}>
          <SectionFieldset
            sectionType={section.section_type}
            pageType={pageType}
            draft={draft}
            onChange={handleChange}
            onItemsChange={handleItemsChange}
            errors={errors}
            onUploadImage={onUploadImage}
          />
        </div>
      )}

      {/* Content preview strip */}
      {!editing && section.content && (
        <div style={{
          padding: '10px 20px',
          borderTop: '1px solid rgba(168,85,247,0.06)',
          background: 'rgba(168,85,247,0.02)',
        }}>
          <p style={{
            fontSize: '0.72rem', color: '#9ca3af', margin: 0, lineHeight: 1.5,
            overflow: 'hidden', display: '-webkit-box',
            WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>
            {section.content.replace(/<[^>]+>/g, '')}
          </p>
        </div>
      )}
    </div>
  );
};

// ── AddSectionForm ────────────────────────────────────────────────────────────

const AddSectionForm = ({ pageId, pageType, onCreated, onCancel, onUploadImage }) => {
  const { createSection, errors, clearErrors } = useContentStore();
  const sectionTypes = getSectionTypes(pageType);

  const [saving,      setSaving]      = useState(false);
  const [sectionType, setSectionType] = useState(sectionTypes[0]?.value ?? 'text');
  const [draft, setDraft] = useState({
    section_key: '', title: '', subtitle: '', content: '',
    image_url: '', button_text: '', button_link: '', items: [], settings: null,
  });

  const handleTypeChange  = (newType) => { setSectionType(newType); setDraft(d => ({ ...d, items: [] })); };
  const handleChange      = (key, val) => setDraft(d => ({ ...d, [key]: val }));
  const handleItemsChange = (items)    => setDraft(d => ({ ...d, items }));

  const handleSubmit = async () => {
    if (!draft.section_key.trim()) { toast.error('Section key is required'); return; }
    setSaving(true);
    const payload = {
      section_key:  draft.section_key,
      section_type: sectionType,
      title:        draft.title        || null,
      subtitle:     draft.subtitle     || null,
      content:      draft.content      || null,
      image_url:    draft.image_url    || null,
      button_text:  draft.button_text  || null,
      button_link:  draft.button_link  || null,
      items:        draft.items?.length ? draft.items : null,
      settings:     draft.settings     || null,
    };
    const res = await createSection(pageId, payload);
    setSaving(false);
    if (res.success) { toast.success('Section added'); clearErrors(); onCreated(); }
    else toast.error(res.message ?? 'Failed to add section');
  };

  return (
    <div style={{
      borderRadius: 14, padding: 24,
      border: '1.5px dashed rgba(168,85,247,0.35)',
      background: 'rgba(168,85,247,0.03)',
      display: 'flex', flexDirection: 'column', gap: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <Sparkles size={13} style={{ color: '#a855f7' }} />
        <p style={{ ...labelStyle, margin: 0 }}>New section</p>
      </div>

      <SectionFieldset
        sectionType={sectionType}
        pageType={pageType}
        draft={draft}
        onChange={handleChange}
        onItemsChange={handleItemsChange}
        errors={errors}
        isNew
        onTypeChange={handleTypeChange}
        sectionTypes={sectionTypes}
        onUploadImage={onUploadImage}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <PillBtn onClick={handleSubmit} disabled={saving} primary>
          <Check size={13} /> {saving ? 'Adding…' : 'Add section'}
        </PillBtn>
        <PillBtn onClick={() => { clearErrors(); onCancel(); }} ghost>
          Cancel
        </PillBtn>
      </div>
    </div>
  );
};

// ── Main export ───────────────────────────────────────────────────────────────

export default function ContentPageEditor({ pageType, title, subtitle, icon: Icon, iconBg }) {
  const {
    pages, activePage, loading,
    fetchPages, fetchPage,
    togglePage, updateSection, toggleSection, deleteSection,
    uploadSectionImage,
  } = useContentStore();

  const [showAddForm, setShowAddForm] = useState(false);

  const pageMeta = pages.find(p => p.page_type === pageType);
  const page     = activePage?.page_type === pageType ? activePage : null;
  const sections = page?.sections ?? [];

  useEffect(() => { if (pages.length === 0) fetchPages(); }, []);
  useEffect(() => { if (pageMeta?.id) fetchPage(pageMeta.id); }, [pageMeta?.id]);

  const handleTogglePage = async () => {
    if (!page) return;
    const res = await togglePage(page.id);
    if (res.success) toast.success(res.data.is_active ? 'Page published' : 'Page hidden');
    else toast.error(res.message);
  };

  const handleUploadImage = useCallback(async (file) => {
    if (!page?.id) throw new Error('Page not loaded');
    const res = await uploadSectionImage(page.id, file);
    if (!res.success) throw new Error(res.message ?? 'Upload failed');
    return res.url;
  }, [page?.id, uploadSectionImage]);

  const handleSaveSection   = (sectionId, data) => updateSection(page.id, sectionId, data);
  const handleDeleteSection = (sectionId)       => deleteSection(page.id, sectionId);
  const handleToggleSection = async (sectionId) => {
    const res = await toggleSection(page.id, sectionId);
    if (!res.success) toast.error(res.message);
  };

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 24px' }}>

      {/* ── Page header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 36 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 16, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: iconBg || 'linear-gradient(135deg,#a855f7,#7c3aed)',
            boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
          }}>
            <Icon size={24} color="white" strokeWidth={1.8} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#a855f7', letterSpacing: '-0.025em', margin: '0 0 3px', lineHeight: 1 }}>
              {title}
            </h1>
            <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: 0 }}>{subtitle}</p>
          </div>
        </div>

        {page && (
          <button
            type="button"
            onClick={handleTogglePage}
            style={{
              height: 36, padding: '0 18px', borderRadius: 99,
              fontSize: '0.78rem', fontWeight: 700, fontFamily: 'inherit',
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7,
              transition: 'all 150ms',
              ...(page.is_active
                ? { background: 'rgba(16,185,129,0.1)', color: '#065f46', border: '1.5px solid rgba(16,185,129,0.3)', boxShadow: '0 2px 8px rgba(16,185,129,0.15)' }
                : { background: 'white', color: '#6b7280', border: '1.5px solid rgba(168,85,247,0.2)' }
              ),
            }}
          >
            {page.is_active ? <Eye size={14} /> : <EyeOff size={14} />}
            {page.is_active ? 'Published' : 'Hidden'}
          </button>
        )}
      </div>

      {/* ── Loading skeleton ── */}
      {loading.page && !page && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ height: 72, borderRadius: 14, background: 'rgba(168,85,247,0.07)' }} />
          ))}
        </div>
      )}

      {/* ── No page found ── */}
      {!loading.page && !pageMeta && (
        <div style={{
          borderRadius: 14, padding: '48px 24px', textAlign: 'center',
          border: '1px solid rgba(168,85,247,0.1)', background: 'white',
          boxShadow: '0 2px 8px rgba(168,85,247,0.05)',
        }}>
          <p style={{ fontSize: '0.875rem', color: '#9ca3af', margin: '0 0 6px' }}>
            No <strong>{pageType}</strong> page exists yet.
          </p>
          <p style={{ fontSize: '0.75rem', color: '#d1d5db', margin: 0 }}>
            Seed your database with a <code>{pageType}</code> content page.
          </p>
        </div>
      )}

      {/* ── Page loaded ── */}
      {page && (
        <>
          <p style={{ ...labelStyle, marginBottom: 14, display: 'block' }}>
            Sections — {sections.length}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>

            {sections.length === 0 && !showAddForm && (
              <div style={{
                borderRadius: 14, padding: '48px 24px', textAlign: 'center',
                border: '1px solid rgba(168,85,247,0.08)', background: 'white',
                fontSize: '0.82rem', color: '#9ca3af',
              }}>
                No sections yet. Add your first one below.
              </div>
            )}

            {sections.map(section => (
              <SectionCard
                key={section.id}
                section={section}
                pageType={pageType}
                onSave={handleSaveSection}
                onDelete={handleDeleteSection}
                onToggle={handleToggleSection}
                onUploadImage={handleUploadImage}
              />
            ))}
          </div>

          {showAddForm ? (
            <AddSectionForm
              pageId={page.id}
              pageType={pageType}
              onCreated={() => setShowAddForm(false)}
              onCancel={() => setShowAddForm(false)}
              onUploadImage={handleUploadImage}
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              style={{
                width: '100%', padding: '16px', borderRadius: 14, fontSize: '0.875rem', fontWeight: 600,
                border: '1.5px dashed rgba(168,85,247,0.25)', background: 'transparent',
                color: '#9ca3af', cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'border-color 150ms, color 150ms, background 150ms',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'rgba(168,85,247,0.5)';
                e.currentTarget.style.color = '#a855f7';
                e.currentTarget.style.background = 'rgba(168,85,247,0.04)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'rgba(168,85,247,0.25)';
                e.currentTarget.style.color = '#9ca3af';
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <Plus size={16} /> Add section
            </button>
          )}
        </>
      )}
    </div>
  );
}