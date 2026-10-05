import { useRef, useState } from 'react';
import { Link as LinkIcon, ImageIcon, Upload, X, Loader2, Link, ChevronDown, ChevronUp } from 'lucide-react';
import ItemsEditor from './ItemsEditor';
import { getFieldConfig } from './sectionConfig';

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputStyle = {
  width: '100%', padding: '7px 11px', borderRadius: 8, fontSize: '0.8rem',
  background: 'var(--surface-input, color-mix(in srgb, var(--color-primary-500) 4%, transparent))',
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
  letterSpacing: '0.08em', color: 'var(--text-tertiary)', display: 'block', marginBottom: 5,
};

// ── Field wrapper ─────────────────────────────────────────────────────────────

function Field({ label, required, error, children }) {
  return (
    <div>
      {label && (
        <label style={labelStyle}>
          {label}
          {required && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
        </label>
      )}
      {children}
      {error && <p style={{ fontSize: '0.68rem', color: '#ef4444', marginTop: 4 }}>{error}</p>}
    </div>
  );
}

function SI({ hasError, style: extra = {}, ...props }) {
  return (
    <input {...props}
      style={{ ...(hasError ? inputError : inputStyle), ...extra }}
      onFocus={inputFocus} onBlur={inputBlur}
    />
  );
}

function ST({ hasError, rows = 4, style: extra = {}, ...props }) {
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

// ── ImageField ────────────────────────────────────────────────────────────────

function ImageField({ value, onChange, onUpload, error }) {
  const [tab,      setTab]      = useState('url');
  const [urlInput, setUrlInput] = useState(value ?? '');
  const [uploading,setUploading]= useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  const commitUrl = () => { const t = urlInput.trim(); onChange(t || null); };

  const handleFile = async (file) => {
    if (!file || !onUpload) return;
    setUploading(true);
    try { const url = await onUpload(file); onChange(url); setUrlInput(url); }
    catch (err) { console.error('Upload failed', err); }
    finally { setUploading(false); }
  };

  const handleRemove = () => {
    onChange(null); setUrlInput('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const hasImage = !!value;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

      {/* Preview area */}
      <div
        style={{
          position: 'relative', width: '100%', borderRadius: 10, overflow: 'hidden',
          aspectRatio: '16/7', minHeight: 130,
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
            <img src={value} alt="Section preview"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              onError={e => { e.currentTarget.style.display = 'none'; }}
            />
            <button type="button" onClick={handleRemove} title="Remove image" style={{
              position: 'absolute', top: 10, right: 10, width: 28, height: 28,
              borderRadius: '50%', background: 'rgba(0,0,0,0.6)', border: 'none',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', transition: 'background 120ms',
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.85)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0.6)'}
            >
              <X size={13} />
            </button>
          </>
        ) : (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 6, pointerEvents: 'none', userSelect: 'none',
          }}>
            {uploading ? (
              <Loader2 size={28} style={{ color: 'var(--color-primary-500)', animation: 'spin 1s linear infinite' }} />
            ) : (
              <>
                <ImageIcon size={30} style={{ color: 'var(--text-tertiary)' }} strokeWidth={1.5} />
                <span style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', fontWeight: 500 }}>
                  {dragOver ? 'Drop to upload' : 'No image yet'}
                </span>
              </>
            )}
          </div>
        )}

        {dragOver && (
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'color-mix(in srgb, var(--color-primary-500) 12%, transparent)', pointerEvents: 'none',
          }}>
            <p style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-primary-600)' }}>Drop image here</p>
          </div>
        )}
      </div>

      {/* Tab panel */}
      <div style={{
        borderRadius: 10, overflow: 'hidden',
        border: '1.5px solid color-mix(in srgb, var(--color-primary-500) 15%, transparent)',
      }}>
        {/* Tab bar — only if upload available */}
        {onUpload && (
          <div style={{
            display: 'flex', borderBottom: '1px solid color-mix(in srgb, var(--color-primary-500) 10%, transparent)',
            background: 'color-mix(in srgb, var(--color-primary-500) 3%, transparent)',
          }}>
            {[
              { id: 'url',    icon: Link,   label: 'Paste URL'   },
              { id: 'upload', icon: Upload, label: 'Upload file' },
            ].map(({ id, icon: Icon, label }) => (
              <button key={id} type="button" onClick={() => setTab(id)} style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                padding: '8px', fontSize: '0.72rem', fontWeight: 700, fontFamily: 'inherit',
                cursor: 'pointer', border: 'none', transition: 'all 150ms',
                background: tab === id ? 'var(--surface-card, #fff)' : 'transparent',
                color: tab === id ? 'var(--color-primary-600)' : 'var(--text-tertiary)',
                borderBottom: tab === id ? '2px solid var(--color-primary-500)' : '2px solid transparent',
                marginBottom: -1,
              }}>
                <Icon size={11} /> {label}
              </button>
            ))}
          </div>
        )}

        <div style={{ padding: 12, background: 'var(--surface-card, #fff)' }}>
          {/* URL tab */}
          {(!onUpload || tab === 'url') && (
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="url" value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                onBlur={commitUrl}
                onKeyDown={e => e.key === 'Enter' && commitUrl()}
                placeholder="https://example.com/image.jpg"
                style={{ ...inputStyle, flex: 1 }}
                onFocus={inputFocus}
                onBlur={e => { inputBlur(e); commitUrl(); }}
              />
              <button type="button" onClick={commitUrl} style={{
                padding: '0 14px', borderRadius: 8, fontSize: '0.72rem', fontWeight: 700,
                border: 'none', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
                background: 'linear-gradient(135deg,var(--color-primary-500),var(--color-primary-600))', color: 'white',
              }}>
                Apply
              </button>
            </div>
          )}

          {/* Upload tab */}
          {onUpload && tab === 'upload' && (
            <>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
                onChange={e => handleFile(e.target.files?.[0])} />
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} style={{
                width: '100%', height: 36, borderRadius: 8, fontSize: '0.72rem', fontWeight: 700,
                border: '1.5px dashed color-mix(in srgb, var(--color-primary-500) 25%, transparent)', background: 'transparent',
                color: 'var(--text-tertiary)', cursor: uploading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                opacity: uploading ? 0.6 : 1, transition: 'border-color 150ms, color 150ms',
              }}
                onMouseEnter={e => { if (!uploading) { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-primary-500) 50%, transparent)'; e.currentTarget.style.color = 'var(--color-primary-500)'; } }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-primary-500) 25%, transparent)'; e.currentTarget.style.color = 'var(--text-tertiary)'; }}
              >
                {uploading
                  ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Uploading…</>
                  : <><Upload size={13} /> Choose image file</>
                }
              </button>
              <p style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', marginTop: 6, textAlign: 'center' }}>
                PNG, JPG, GIF, WebP · or drag & drop onto the preview above
              </p>
            </>
          )}
        </div>
      </div>

      {error && <p style={{ fontSize: '0.68rem', color: '#ef4444', fontWeight: 500 }}>{error}</p>}
    </div>
  );
}

// ── SettingsField — collapsible JSON editor ───────────────────────────────────

function SettingsField({ value, onChange, error }) {
  const [open, setOpen]         = useState(false);
  const [raw,  setRaw]          = useState(value ? JSON.stringify(value, null, 2) : '');
  const [jsonError, setJsonError] = useState('');

  const handleChange = (text) => {
    setRaw(text);
    if (!text.trim()) { setJsonError(''); onChange(null); return; }
    try { onChange(JSON.parse(text)); setJsonError(''); }
    catch { setJsonError('Invalid JSON — keep editing…'); }
  };

  const keyCount = value ? Object.keys(value).length : 0;

  return (
    <div style={{
      borderRadius: 10, overflow: 'hidden',
      border: '1.5px solid color-mix(in srgb, var(--color-primary-500) 15%, transparent)',
    }}>
      {/* Toggle header */}
      <button type="button" onClick={() => setOpen(o => !o)} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', background: 'color-mix(in srgb, var(--color-primary-500) 3%, transparent)',
        border: 'none', cursor: 'pointer', fontFamily: 'inherit',
        transition: 'background 150ms',
      }}
        onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--color-primary-500) 6%, transparent)'}
        onMouseLeave={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--color-primary-500) 3%, transparent)'}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)' }}>
            Settings
          </span>
          <span style={{
            fontSize: '0.6rem', padding: '1px 7px', borderRadius: 99, fontWeight: 600,
            background: 'rgba(107,114,128,0.12)', color: 'var(--text-tertiary)',
          }}>
            JSON · optional
          </span>
          {keyCount > 0 && (
            <span style={{
              fontSize: '0.6rem', padding: '1px 7px', borderRadius: 99, fontWeight: 700,
              background: 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)', color: 'var(--color-primary-600)',
            }}>
              {keyCount} key{keyCount !== 1 ? 's' : ''} set
            </span>
          )}
        </div>
        {open
          ? <ChevronUp size={13} style={{ color: 'var(--text-tertiary)' }} />
          : <ChevronDown size={13} style={{ color: 'var(--text-tertiary)' }} />
        }
      </button>

      {open && (
        <div style={{ padding: 14, background: 'var(--surface-card, #fff)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', lineHeight: 1.6, margin: 0 }}>
            Extra per-section options as a JSON object — e.g. layout, colors, or display flags your frontend reads when rendering this section. Leave blank if unused.
          </p>
          <div style={{
            fontSize: '0.68rem', color: 'var(--text-tertiary)', fontFamily: 'monospace', lineHeight: 1.8,
            background: 'color-mix(in srgb, var(--color-primary-500) 3%, transparent)', borderRadius: 8, padding: '8px 12px',
            border: '1px solid color-mix(in srgb, var(--color-primary-500) 10%, transparent)',
          }}>
            <p style={{ color: 'var(--text-tertiary)', margin: '0 0 2px' }}>// examples</p>
            <p style={{ margin: '0 0 2px' }}>{`{ "bg": "dark", "text_align": "center" }`}</p>
            <p style={{ margin: '0 0 2px' }}>{`{ "columns": 3, "lightbox": true }`}</p>
            <p style={{ margin: 0 }}>{`{ "overlay_opacity": 0.4 }`}</p>
          </div>
          <ST
            hasError={!!(error || jsonError)}
            rows={4}
            value={raw}
            placeholder={'{\n  "key": "value"\n}'}
            onChange={e => handleChange(e.target.value)}
            style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
          />
          {(jsonError || error) && (
            <p style={{ fontSize: '0.68rem', color: '#ef4444', margin: 0 }}>{jsonError || error}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main SectionFieldset ──────────────────────────────────────────────────────

export default function SectionFieldset({
  sectionType,
  pageType,
  draft,
  onChange,
  onItemsChange,
  errors = {},
  isNew = false,
  onTypeChange,
  sectionTypes = [],
  onUploadImage,
}) {
  const cfg = getFieldConfig(sectionType, pageType);
  const err = (key) => { const v = errors[key]; return Array.isArray(v) ? v[0] : v; };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* New section: key + type */}
      {isNew && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Key (unique, snake_case)" required error={err('section_key')}>
            <SI
              type="text" hasError={!!err('section_key')}
              value={draft.section_key ?? ''} placeholder="e.g. hero_main"
              pattern="[a-z0-9_]+"
              onChange={e => onChange('section_key', e.target.value)}
            />
          </Field>
          <Field label="Type" required>
            <SS value={sectionType} onChange={e => onTypeChange(e.target.value)}>
              {sectionTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </SS>
          </Field>
        </div>
      )}

      {/* Title */}
      <Field label="Title" required error={err('title')}>
        <SI
          type="text" hasError={!!err('title')}
          value={draft.title ?? ''} placeholder="Section heading"
          onChange={e => onChange('title', e.target.value)}
        />
      </Field>

      {/* Subtitle */}
      {cfg.subtitle.show && (
        <Field label="Subtitle" required={cfg.subtitle.required} error={err('subtitle')}>
          <SI
            type="text" hasError={!!err('subtitle')}
            value={draft.subtitle ?? ''} placeholder="Supporting line"
            onChange={e => onChange('subtitle', e.target.value)}
          />
        </Field>
      )}

      {/* Content */}
      {cfg.content.show && (
        <Field label="Content" required={cfg.content.required} error={err('content')}>
          <ST
            hasError={!!err('content')}
            rows={4}
            value={draft.content ?? ''} placeholder="Body text or HTML…"
            onChange={e => onChange('content', e.target.value)}
          />
        </Field>
      )}

      {/* Image */}
      {cfg.image_url.show && (
        <Field label="Image" required={cfg.image_url.required}>
          <ImageField
            value={draft.image_url || null}
            onChange={url => onChange('image_url', url ?? '')}
            onUpload={onUploadImage}
            error={err('image_url')}
          />
        </Field>
      )}

      {/* Button row */}
      {cfg.button_text.show && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Button text" required={cfg.button_text.required} error={err('button_text')}>
            <SI
              type="text" hasError={!!err('button_text')}
              value={draft.button_text ?? ''} placeholder="e.g. Learn more"
              onChange={e => onChange('button_text', e.target.value)}
            />
          </Field>
          <Field label="Button link" required={cfg.button_link.required} error={err('button_link')}>
            <div style={{ position: 'relative' }}>
              <LinkIcon size={13} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', pointerEvents: 'none' }} />
              <SI
                type="text" hasError={!!err('button_link')}
                value={draft.button_link ?? ''} placeholder="/path or https://…"
                onChange={e => onChange('button_link', e.target.value)}
                style={{ paddingLeft: 30 }}
              />
            </div>
          </Field>
        </div>
      )}

      {/* Items */}
      {cfg.items.show && (
        <Field label="Items" required={cfg.items.required} error={err('items')}>
          <ItemsEditor
            sectionType={sectionType}
            pageType={pageType}
            value={draft.items ?? []}
            onChange={onItemsChange}
            errors={errors}
            onUploadImage={onUploadImage}
          />
        </Field>
      )}

      {/* Settings JSON */}
      {cfg.settings.show && (
        <SettingsField
          value={draft.settings}
          onChange={val => onChange('settings', val)}
          error={err('settings')}
        />
      )}
    </div>
  );
}