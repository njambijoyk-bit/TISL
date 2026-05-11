import { useState, useRef, useEffect } from 'react';
import { productsAPI } from '../../../../../api';
import toast from 'react-hot-toast';

/**
 * ImageDrawer
 * Slides in from right to manage main image + gallery for one product
 */
export default function ImageDrawer({ product, onClose, onSaved }) {
  const [mainPreview, setMainPreview]     = useState(null); // new file preview
  const [mainFile, setMainFile]           = useState(null);
  const [extraFiles, setExtraFiles]       = useState([]);   // new extra files
  const [extraPreviews, setExtraPreviews] = useState([]);
  const [saving, setSaving]               = useState(false);
  const [visible, setVisible]             = useState(false);

  const mainInputRef   = useRef(null);
  const extraInputRef  = useRef(null);
  const mainCamRef     = useRef(null);
  const extraCamRef    = useRef(null);

  // Animate in
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 280);
  };

  // Main image pick
  const onMainFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMainFile(file);
    setMainPreview(URL.createObjectURL(file));
    e.target.value = '';
  };

  // Extra images pick (multiple)
  const onExtraFiles = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const newPreviews = files.map(f => URL.createObjectURL(f));
    setExtraFiles(prev => [...prev, ...files]);
    setExtraPreviews(prev => [...prev, ...newPreviews]);
    e.target.value = '';
  };

  const removeExtra = (idx) => {
    setExtraFiles(prev => prev.filter((_, i) => i !== idx));
    setExtraPreviews(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!mainFile && extraFiles.length === 0) {
      toast('No new images selected', { icon: 'ℹ️' });
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('_method', 'PUT');
      if (mainFile) fd.append('main_image', mainFile);
      extraFiles.forEach(f => fd.append('images[]', f));

      const res = await productsAPI.updateProduct(product.id, fd);
      toast.success('Images updated');
      onSaved(product.id, res?.data ?? res);
      handleClose();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save images');
    } finally {
      setSaving(false);
    }
  };

  // Current images from product
  const currentImages = Array.isArray(product.images)
    ? product.images
    : (product.image_urls ?? []);

  const currentMain = product.main_image_url || product.main_image;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={handleClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.35)',
          zIndex: 1200,
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.28s ease',
        }}
      />

      {/* Drawer */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 420,
        background: 'var(--bg-primary, #fff)',
        zIndex: 1201,
        boxShadow: '-4px 0 32px rgba(0,0,0,0.15)',
        transform: visible ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>

        {/* Header */}
        <div style={{
          padding: '18px 20px',
          borderBottom: '1px solid var(--border-color, #e5e7eb)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary, #111)' }}>
              Manage Images
            </div>
            <div style={{
              fontSize: 12, color: 'var(--text-muted, #6b7280)',
              marginTop: 2, maxWidth: 320,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {product.name}
            </div>
          </div>
          <button onClick={handleClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted, #6b7280)', fontSize: 20, lineHeight: 1,
            padding: 4,
          }}>×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

          {/* ── Main Image ───────────────────────────── */}
          <section style={{ marginBottom: 28 }}>
            <Label>Main Image</Label>

            {/* Current or preview */}
            <div style={{
              width: '100%', height: 200,
              background: 'var(--bg-secondary, #f9fafb)',
              border: '2px dashed var(--border-color, #e5e7eb)',
              borderRadius: 10,
              overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 10, position: 'relative',
            }}>
              {(mainPreview || currentMain) ? (
                <>
                  <img
                    src={mainPreview || currentMain}
                    alt="main"
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                  {mainPreview && (
                    <span style={{
                      position: 'absolute', top: 8, right: 8,
                      background: '#22c55e', color: '#fff',
                      fontSize: 10, fontWeight: 700,
                      padding: '2px 7px', borderRadius: 99,
                    }}>NEW</span>
                  )}
                </>
              ) : (
                <span style={{ fontSize: 12, color: 'var(--text-muted, #9ca3af)' }}>No image</span>
              )}
            </div>

            {/* Upload buttons */}
            <div style={{ display: 'flex', gap: 8 }}>
              {/* File pick */}
                <UploadBtn 
                onClick={() => mainInputRef.current?.click()} 
                icon={
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                } 
                label="Choose File" 
                />

                {/* Camera */}
                <UploadBtn 
                onClick={() => mainCamRef.current?.click()} 
                icon={
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="12" cy="12" r="3" />
                    <path d="M3 9a2 2 0 0 1 2-2h2.5" />
                    </svg>
                } 
                label="Camera" 
                />
            </div>

            {/* Hidden inputs */}
            <input ref={mainInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onMainFile} />
            <input ref={mainCamRef}   type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={onMainFile} />
          </section>

          {/* ── Additional Images ─────────────────────── */}
          <section>
            <Label>Additional Images</Label>

            {/* Existing + new previews grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 8, marginBottom: 12,
            }}>
              {/* Current saved images */}
              {currentImages.map((img, i) => (
                <div key={`cur-${i}`} style={thumbWrap}>
                  <img src={img} alt="" style={thumbImg} />
                  <span style={savedBadge}>Saved</span>
                </div>
              ))}

              {/* New uploads */}
              {extraPreviews.map((src, i) => (
                <div key={`new-${i}`} style={{ ...thumbWrap, border: '2px solid #22c55e' }}>
                  <img src={src} alt="" style={thumbImg} />
                  <button
                    onClick={() => removeExtra(i)}
                    style={{
                      position: 'absolute', top: 4, right: 4,
                      background: '#ef4444', color: '#fff',
                      border: 'none', borderRadius: '50%',
                      width: 18, height: 18, cursor: 'pointer',
                      fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >×</button>
                  <span style={{ ...savedBadge, background: '#22c55e' }}>NEW</span>
                </div>
              ))}

              {/* Add placeholder */}
              <div
                onClick={() => extraInputRef.current?.click()}
                style={{
                  ...thumbWrap,
                  border: '2px dashed var(--border-color, #e5e7eb)',
                  cursor: 'pointer',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'column',
                  gap: 4,
                  color: 'var(--text-muted, #9ca3af)',
                  fontSize: 11,
                }}
              >
                <span style={{ fontSize: 20 }}>+</span>
                <span>Add</span>
              </div>
            </div>

            {/* Upload buttons */}
            <div style={{ display: 'flex', gap: 8 }}>
                {/* Add Files */}
                <UploadBtn
                onClick={() => extraInputRef.current?.click()}
                icon={
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                }
                label="Add Files"
                />

                {/* Camera */}
                <UploadBtn
                onClick={() => extraCamRef.current?.click()}
                icon={
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="12" cy="12" r="3" />
                    <path d="M3 9a2 2 0 0 1 2-2h2.5" />
                    </svg>
                }
                label="Camera"
                />
            </div>

            {/* Hidden inputs */}
            <input ref={extraInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={onExtraFiles} />
            <input ref={extraCamRef}   type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={onExtraFiles} />
          </section>
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 20px',
          borderTop: '1px solid var(--border-color, #e5e7eb)',
          display: 'flex', gap: 10,
          flexShrink: 0,
        }}>
          <button onClick={handleClose} style={cancelBtn}>Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving || (!mainFile && extraFiles.length === 0)}
            style={{
              ...saveBtn,
              opacity: saving || (!mainFile && extraFiles.length === 0) ? 0.5 : 1,
              cursor: saving || (!mainFile && extraFiles.length === 0) ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'Saving…' : `Save Images${mainFile || extraFiles.length ? ` (${(mainFile ? 1 : 0) + extraFiles.length})` : ''}`}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────
function Label({ children }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: '0.06em', color: 'var(--text-muted, #6b7280)',
      marginBottom: 10,
    }}>{children}</div>
  );
}

function UploadBtn({ onClick, icon, label }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '7px 12px',
        background: hover ? 'var(--bg-secondary, #f3f4f6)' : 'var(--bg-primary, #fff)',
        border: '1px solid var(--accent, #7c3aed)',
        boxShadow: '0 0 8px rgba(124, 58, 237, 0.35), inset 0 0 2px rgba(124, 58, 237, 0.1)',
        borderRadius: 6,
        fontSize: 12, cursor: 'pointer',
        color: 'var(--text-primary, #111)',
        transition: 'background 0.15s',
      }}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

const thumbWrap = {
  position: 'relative',
  aspectRatio: '1/1',
  background: 'var(--bg-secondary, #f9fafb)',
  borderRadius: 8,
  overflow: 'hidden',
  border: '1px solid var(--accent, #7c3aed)',
  boxShadow: '0 0 8px rgba(124, 58, 237, 0.35), inset 0 0 2px rgba(124, 58, 237, 0.1)',
  display: 'flex',
};

const thumbImg = {
  width: '100%', height: '100%', objectFit: 'cover',
};

const savedBadge = {
  position: 'absolute', bottom: 4, left: 4,
  background: 'rgba(0,0,0,0.5)', color: '#fff',
  fontSize: 9, fontWeight: 700, padding: '1px 5px',
  borderRadius: 4,
};

const cancelBtn = {
  flex: 1,
  padding: '9px 0',
  background: 'var(--bg-secondary, #f9fafb)',
  border: '1px solid var(--accent, #7c3aed)',
  boxShadow: '0 0 8px rgba(124, 58, 237, 0.35), inset 0 0 2px rgba(124, 58, 237, 0.1)',
  borderRadius: 7,
  fontSize: 13, fontWeight: 500,
  cursor: 'pointer',
  color: 'var(--text-primary, #111)',
};

const saveBtn = {
  flex: 2,
  padding: '9px 0',
  background: 'var(--accent, #7c3aed)',
  border: 'none',
  borderRadius: 7,
  fontSize: 13, fontWeight: 600,
  color: '#fff',
  transition: 'opacity 0.15s',
};