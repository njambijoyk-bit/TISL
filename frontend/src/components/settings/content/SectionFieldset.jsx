import { useRef, useState } from 'react';
import { Link as LinkIcon, ImageIcon, Upload, X, Loader2, Link, ChevronDown, ChevronUp } from 'lucide-react';
import ItemsEditor from './ItemsEditor';
import { getFieldConfig } from './sectionConfig';

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputStyle = {
  width: '100%', padding: '7px 11px', borderRadius: 8, fontSize: '0.8rem',
  background: 'rgba(168,85,247,0.04)',
  border: '1.5px solid rgba(168,85,247,0.18)',
  color: '#111827', outline: 'none',
  transition: 'border-color 150ms, box-shadow 150ms',
  fontFamily: 'inherit', boxSizing: 'border-box',
};
const inputError = {
  ...inputStyle,
  borderColor: 'rgba(239,68,68,0.5)',
};
const inputFocus = (e) => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.1)'; };
const inputBlur  = (e) => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.18)'; e.currentTarget.style.boxShadow = 'none'; };

const labelStyle = {
  fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.08em', color: '#9ca3af', display: 'block', marginBottom: 5,
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
            ? '2px solid #a855f7'
            : hasImage
              ? '1.5px solid rgba(168,85,247,0.2)'
              : '1.5px dashed rgba(168,85,247,0.2)',
          background: dragOver
            ? 'rgba(168,85,247,0.06)'
            : hasImage ? 'transparent' : 'rgba(168,85,247,0.03)',
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
              <Loader2 size={28} style={{ color: '#a855f7', animation: 'spin 1s linear infinite' }} />
            ) : (
              <>
                <ImageIcon size={30} style={{ color: '#d1d5db' }} strokeWidth={1.5} />
                <span style={{ fontSize: '0.68rem', color: '#9ca3af', fontWeight: 500 }}>
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
            background: 'rgba(168,85,247,0.12)', pointerEvents: 'none',
          }}>
            <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#7c3aed' }}>Drop image here</p>
          </div>
        )}
      </div>

      {/* Tab panel */}
      <div style={{
        borderRadius: 10, overflow: 'hidden',
        border: '1.5px solid rgba(168,85,247,0.15)',
      }}>
        {/* Tab bar — only if upload available */}
        {onUpload && (
          <div style={{
            display: 'flex', borderBottom: '1px solid rgba(168,85,247,0.1)',
            background: 'rgba(168,85,247,0.03)',
          }}>
            {[
              { id: 'url',    icon: Link,   label: 'Paste URL'   },
              { id: 'upload', icon: Upload, label: 'Upload file' },
            ].map(({ id, icon: Icon, label }) => (
              <button key={id} type="button" onClick={() => setTab(id)} style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                padding: '8px', fontSize: '0.72rem', fontWeight: 700, fontFamily: 'inherit',
                cursor: 'pointer', border: 'none', transition: 'all 150ms',
                background: tab === id ? 'white' : 'transparent',
                color: tab === id ? '#7c3aed' : '#9ca3af',
                borderBottom: tab === id ? '2px solid #a855f7' : '2px solid transparent',
                marginBottom: -1,
              }}>
                <Icon size={11} /> {label}
              </button>
            ))}
          </div>
        )}

        <div style={{ padding: 12, background: 'white' }}>
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
                background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white',
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
                border: '1.5px dashed rgba(168,85,247,0.25)', background: 'transparent',
                color: '#9ca3af', cursor: uploading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                opacity: uploading ? 0.6 : 1, transition: 'border-color 150ms, color 150ms',
              }}
                onMouseEnter={e => { if (!uploading) { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.5)'; e.currentTarget.style.color = '#a855f7'; } }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.25)'; e.currentTarget.style.color = '#9ca3af'; }}
              >
                {uploading
                  ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Uploading…</>
                  : <><Upload size={13} /> Choose image file</>
                }
              </button>
              <p style={{ fontSize: '0.65rem', color: '#9ca3af', marginTop: 6, textAlign: 'center' }}>
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
      border: '1.5px solid rgba(168,85,247,0.15)',
    }}>
      {/* Toggle header */}
      <button type="button" onClick={() => setOpen(o => !o)} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', background: 'rgba(168,85,247,0.03)',
        border: 'none', cursor: 'pointer', fontFamily: 'inherit',
        transition: 'background 150ms',
      }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.06)'}
        onMouseLeave={e => e.currentTarget.style.background = 'rgba(168,85,247,0.03)'}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af' }}>
            Settings
          </span>
          <span style={{
            fontSize: '0.6rem', padding: '1px 7px', borderRadius: 99, fontWeight: 600,
            background: 'rgba(107,114,128,0.12)', color: '#9ca3af',
          }}>
            JSON · optional
          </span>
          {keyCount > 0 && (
            <span style={{
              fontSize: '0.6rem', padding: '1px 7px', borderRadius: 99, fontWeight: 700,
              background: 'rgba(168,85,247,0.1)', color: '#7c3aed',
            }}>
              {keyCount} key{keyCount !== 1 ? 's' : ''} set
            </span>
          )}
        </div>
        {open
          ? <ChevronUp size={13} style={{ color: '#9ca3af' }} />
          : <ChevronDown size={13} style={{ color: '#9ca3af' }} />
        }
      </button>

      {open && (
        <div style={{ padding: 14, background: 'white', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: '0.68rem', color: '#9ca3af', lineHeight: 1.6, margin: 0 }}>
            Extra per-section options as a JSON object — e.g. layout, colors, or display flags your frontend reads when rendering this section. Leave blank if unused.
          </p>
          <div style={{
            fontSize: '0.68rem', color: '#9ca3af', fontFamily: 'monospace', lineHeight: 1.8,
            background: 'rgba(168,85,247,0.03)', borderRadius: 8, padding: '8px 12px',
            border: '1px solid rgba(168,85,247,0.1)',
          }}>
            <p style={{ color: '#d1d5db', margin: '0 0 2px' }}>// examples</p>
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
              <LinkIcon size={13} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }} />
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