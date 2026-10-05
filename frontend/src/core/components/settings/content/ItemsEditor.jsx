import { useRef, useState } from 'react';
import { Plus, Trash2, GripVertical, ImageIcon, Upload, X, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { ITEMS_SCHEMA } from './sectionConfig';

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputStyle = {
  width: '100%', padding: '6px 10px', borderRadius: 8, fontSize: '0.8rem',
  background: 'color-mix(in srgb, var(--color-primary-500) 4%, transparent)',
  border: '1.5px solid color-mix(in srgb, var(--color-primary-500) 18%, transparent)',
  color: 'var(--text-primary)', outline: 'none',
  transition: 'border-color 150ms, box-shadow 150ms',
  fontFamily: 'inherit', boxSizing: 'border-box',
};
const inputError = {
  ...inputStyle,
  borderColor: 'rgba(239,68,68,0.5)',
};
const inputFocus = (e) => { e.currentTarget.style.borderColor = 'var(--color-primary-500)'; e.currentTarget.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--color-primary-500) 10%, transparent)'; };
const inputBlur  = (e) => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-primary-500) 18%, transparent)'; e.currentTarget.style.boxShadow = 'none'; };

const labelStyle = {
  fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.08em', color: 'var(--text-tertiary)', display: 'block', marginBottom: 4,
};

function SI({ hasError, style: extra = {}, ...props }) {
  return (
    <input {...props}
      style={{ ...(hasError ? inputError : inputStyle), ...extra }}
      onFocus={inputFocus} onBlur={inputBlur}
    />
  );
}

function ST({ hasError, rows = 3, style: extra = {}, ...props }) {
  return (
    <textarea {...props} rows={rows}
      style={{ ...(hasError ? inputError : inputStyle), resize: 'none', ...extra }}
      onFocus={inputFocus} onBlur={inputBlur}
    />
  );
}

function SS({ hasError, children, style: extra = {}, ...props }) {
  return (
    <select {...props}
      style={{ ...(hasError ? inputError : inputStyle), ...extra }}
      onFocus={inputFocus} onBlur={inputBlur}
    >
      {children}
    </select>
  );
}

// ── ItemImageField ────────────────────────────────────────────────────────────

function ItemImageField({ value, onChange, onUpload }) {
  const [urlInput,  setUrlInput]  = useState(value ?? '');
  const [uploading, setUploading] = useState(false);
  const [dragOver,  setDragOver]  = useState(false);
  const fileRef = useRef(null);

  const commitUrl = () => { const t = urlInput.trim(); onChange(t || null); };

  const handleFile = async (file) => {
    if (!file || !onUpload) return;
    setUploading(true);
    try { const url = await onUpload(file); onChange(url); setUrlInput(url); }
    catch (e) { console.error('Upload failed', e); }
    finally { setUploading(false); }
  };

  const handleRemove = () => {
    onChange(null); setUrlInput('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const hasImage = !!value;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {/* Preview */}
      <div
        style={{
          position: 'relative', width: '100%', borderRadius: 9, overflow: 'hidden',
          aspectRatio: '16/6', minHeight: 90,
          border: dragOver
            ? '2px solid var(--color-primary-500)'
            : hasImage
              ? '1.5px solid color-mix(in srgb, var(--color-primary-500) 20%, transparent)'
              : '1.5px dashed color-mix(in srgb, var(--color-primary-500) 20%, transparent)',
          background: dragOver
            ? 'color-mix(in srgb, var(--color-primary-500) 6%, transparent)'
            : hasImage ? 'transparent' : 'color-mix(in srgb, var(--color-primary-500) 3%, transparent)',
          transition: 'border-color 150ms, background 150ms',
        }}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]); }}
      >
        {hasImage ? (
          <>
            <img src={value} alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              onError={e => { e.currentTarget.style.display = 'none'; }}
            />
            <button type="button" onClick={handleRemove} style={{
              position: 'absolute', top: 6, right: 6, width: 22, height: 22,
              borderRadius: '50%', background: 'rgba(0,0,0,0.6)', border: 'none',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', transition: 'background 120ms',
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.85)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0.6)'}
            >
              <X size={11} />
            </button>
          </>
        ) : (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 4, pointerEvents: 'none', userSelect: 'none',
          }}>
            {uploading
              ? <Loader2 size={20} style={{ color: 'var(--color-primary-500)', animation: 'spin 1s linear infinite' }} />
              : <>
                  <ImageIcon size={22} style={{ color: 'var(--text-tertiary)' }} strokeWidth={1.5} />
                  <span style={{ fontSize: '0.62rem', color: 'var(--text-tertiary)' }}>
                    {dragOver ? 'Drop here' : 'No image'}
                  </span>
                </>
            }
          </div>
        )}
        {dragOver && (
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 9, pointerEvents: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)',
          }}>
            <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-primary-600)' }}>Drop image</p>
          </div>
        )}
      </div>

      {/* URL row + upload */}
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          type="url" value={urlInput}
          onChange={e => setUrlInput(e.target.value)}
          onBlur={e => { inputBlur(e); commitUrl(); }}
          onKeyDown={e => e.key === 'Enter' && commitUrl()}
          placeholder="https://…"
          style={{ ...inputStyle, flex: 1, padding: '5px 9px', fontSize: '0.72rem' }}
          onFocus={inputFocus}
        />
        <button type="button" onClick={commitUrl} style={{
          padding: '0 11px', borderRadius: 7, fontSize: '0.68rem', fontWeight: 700,
          border: 'none', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
          background: 'linear-gradient(135deg,var(--color-primary-500),var(--color-primary-600))', color: 'white',
        }}>
          Apply
        </button>
        {onUpload && (
          <>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={e => handleFile(e.target.files?.[0])} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} style={{
              padding: '0 10px', borderRadius: 7, fontSize: '0.68rem', fontWeight: 600,
              border: '1.5px solid color-mix(in srgb, var(--color-primary-500) 20%, transparent)', background: 'transparent',
              color: 'var(--text-tertiary)', cursor: uploading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5,
              opacity: uploading ? 0.6 : 1, transition: 'border-color 150ms, color 150ms',
            }}
              onMouseEnter={e => { if (!uploading) { e.currentTarget.style.borderColor = 'var(--color-primary-500)'; e.currentTarget.style.color = 'var(--color-primary-600)'; } }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-primary-500) 20%, transparent)'; e.currentTarget.style.color = 'var(--text-tertiary)'; }}
            >
              <Upload size={11} /> Upload
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── ItemCard ──────────────────────────────────────────────────────────────────

function ItemCard({ item, idx, columns, errors, onUpdate, onRemove, onUploadImage, collapsed, onToggleCollapse }) {
  const previewField = columns.find(c => c.type !== 'image' && item[c.key]);
  const previewText  = previewField ? item[previewField.key] : null;

  return (
    <div style={{
      borderRadius: 11, overflow: 'hidden',
      border: '1.5px solid color-mix(in srgb, var(--color-primary-500) 12%, transparent)',
      background: 'var(--surface-card, #fff)',
      boxShadow: '0 1px 6px color-mix(in srgb, var(--color-primary-500) 6%, transparent)',
    }}>
      {/* Item header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '9px 14px', background: 'color-mix(in srgb, var(--color-primary-500) 3%, transparent)',
        borderBottom: collapsed ? 'none' : '1px solid color-mix(in srgb, var(--color-primary-500) 8%, transparent)',
      }}>
        <GripVertical size={13} style={{ color: 'var(--line)', flexShrink: 0, cursor: 'grab' }} />

        <button type="button" onClick={onToggleCollapse} style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 8,
          background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', minWidth: 0,
        }}>
          <span style={{ fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-tertiary)', flexShrink: 0 }}>
            Item {idx + 1}
          </span>
          {previewText && collapsed && (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
              — {previewText}
            </span>
          )}
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
          <button type="button" onClick={onToggleCollapse} style={{
            width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 7, border: 'none', cursor: 'pointer', background: 'none', color: 'var(--text-tertiary)',
            transition: 'background 120ms',
          }}
            onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--color-primary-500) 8%, transparent)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            {collapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
          </button>
          <button type="button" onClick={onRemove} style={{
            width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 7, border: 'none', cursor: 'pointer', background: 'none', color: '#fca5a5',
            transition: 'background 120ms, color 120ms',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; e.currentTarget.style.color = '#ef4444'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#fca5a5'; }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Fields — mounted but hidden when collapsed so values persist */}
      <div style={{ display: collapsed ? 'none' : 'block', padding: '14px 16px' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: columns.length <= 2 ? '1fr 1fr' : '1fr 1fr',
          gap: 10,
        }}>
          {columns.map(col => {
            const rawErr     = errors[`items.${idx}.${col.key}`];
            const fieldError = Array.isArray(rawErr) ? rawErr[0] : rawErr;
            const isErrored  = Boolean(fieldError);
            const spanFull   = col.type === 'image' || col.type === 'textarea';

            return (
              <div key={col.key} style={{ gridColumn: spanFull ? '1 / -1' : undefined }}>
                <label style={labelStyle}>
                  {col.label}
                  {col.required && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
                </label>

                {col.type === 'image' ? (
                  <ItemImageField
                    value={item[col.key] ?? null}
                    onChange={url => onUpdate(col.key, url ?? '')}
                    onUpload={onUploadImage}
                  />
                ) : col.type === 'textarea' ? (
                  <ST hasError={isErrored} rows={3}
                    value={item[col.key] ?? ''} placeholder={col.placeholder ?? ''}
                    onChange={e => onUpdate(col.key, e.target.value)}
                  />
                ) : col.type === 'select' ? (
                  <SS hasError={isErrored}
                    value={item[col.key] ?? ''}
                    onChange={e => onUpdate(col.key, e.target.value)}
                  >
                    <option value="">Select…</option>
                    {col.options.map(o => <option key={o} value={o}>{o}</option>)}
                  </SS>
                ) : (
                  <SI
                    type={col.type === 'url' ? 'url' : 'text'}
                    hasError={isErrored}
                    value={item[col.key] ?? ''} placeholder={col.placeholder ?? ''}
                    onChange={e => onUpdate(col.key, e.target.value)}
                  />
                )}

                {isErrored && (
                  <p style={{ fontSize: '0.65rem', color: '#ef4444', marginTop: 3 }}>{fieldError}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Main ItemsEditor ──────────────────────────────────────────────────────────

export default function ItemsEditor({ sectionType, pageType, value = [], onChange, errors = {}, onUploadImage }) {
  const schema = ITEMS_SCHEMA[sectionType];
  const [collapsed, setCollapsed] = useState({});
  const toggleCollapse = (idx) => setCollapsed(s => ({ ...s, [idx]: !s[idx] }));

  // No schema → raw JSON fallback
  if (!schema) {
    return (
      <ST
        rows={5}
        value={value.length ? JSON.stringify(value, null, 2) : ''}
        onChange={e => { try { onChange(JSON.parse(e.target.value)); } catch { /* typing */ } }}
        placeholder={'[\n  { "key": "value" }\n]'}
        style={{ fontFamily: 'monospace', fontSize: '0.72rem' }}
      />
    );
  }

  const columns = schema.map(col => {
    if (col.key === 'icon' && sectionType === 'links') {
      return { ...col, required: pageType === 'manual' };
    }
    return col;
  });

  const makeBlankItem = () => Object.fromEntries(columns.map(c => [c.key, '']));

  const addItem = () => {
    const newIdx = value.length;
    onChange([...value, makeBlankItem()]);
    setCollapsed(s => ({ ...s, [newIdx]: false }));
  };

  const removeItem = (idx) => {
    onChange(value.filter((_, i) => i !== idx));
    setCollapsed(s => { const next = { ...s }; delete next[idx]; return next; });
  };

  const updateField = (idx, key, val) =>
    onChange(value.map((item, i) => i === idx ? { ...item, [key]: val } : item));

  const normalizedItems = value.map(item => ({ ...makeBlankItem(), ...item }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

      {/* Empty state */}
      {normalizedItems.length === 0 && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '32px 24px', borderRadius: 11, textAlign: 'center',
          border: '1.5px dashed color-mix(in srgb, var(--color-primary-500) 20%, transparent)', background: 'color-mix(in srgb, var(--color-primary-500) 2%, transparent)',
        }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', fontWeight: 500, margin: '0 0 3px' }}>No items yet</p>
          <p style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', margin: 0 }}>Click "Add item" below to get started</p>
        </div>
      )}

      {/* Item cards */}
      {normalizedItems.map((item, idx) => (
        <ItemCard
          key={idx}
          item={item} idx={idx} columns={columns} errors={errors}
          onUpdate={(key, val) => updateField(idx, key, val)}
          onRemove={() => removeItem(idx)}
          onUploadImage={onUploadImage}
          collapsed={collapsed[idx] ?? false}
          onToggleCollapse={() => toggleCollapse(idx)}
        />
      ))}

      {/* Add button */}
      <button
        type="button"
        onClick={addItem}
        style={{
          width: '100%', padding: '11px', borderRadius: 11, fontSize: '0.78rem', fontWeight: 700,
          border: '1.5px dashed color-mix(in srgb, var(--color-primary-500) 25%, transparent)', background: 'transparent',
          color: 'var(--text-tertiary)', cursor: 'pointer', fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          transition: 'border-color 150ms, color 150ms, background 150ms',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-primary-500) 50%, transparent)';
          e.currentTarget.style.color = 'var(--color-primary-500)';
          e.currentTarget.style.background = 'color-mix(in srgb, var(--color-primary-500) 4%, transparent)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-primary-500) 25%, transparent)';
          e.currentTarget.style.color = 'var(--text-tertiary)';
          e.currentTarget.style.background = 'transparent';
        }}
      >
        <Plus size={13} /> Add item
      </button>
    </div>
  );
}