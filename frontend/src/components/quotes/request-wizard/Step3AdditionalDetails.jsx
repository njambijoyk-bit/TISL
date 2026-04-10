import React from 'react';
import { Upload, X, FileText, Image as ImageIcon } from 'lucide-react';

// ─── Design tokens ────────────────────────────────────────────────────────────
const purple   = '#f59e0b';
const purpleLt = 'rgba(168,85,247,0.08)';
const purpleBd = 'rgba(168,85,247,0.2)';

// ─── Atoms ────────────────────────────────────────────────────────────────────
const Field = ({ label, hint, children }) => (
  <div>
    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: 6 }}>{label}</label>
    {children}
    {hint && <p style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 5 }}>{hint}</p>}
  </div>
);

const StyledInput = (props) => (
  <input {...props} style={{
    width: '100%', padding: '9px 12px', borderRadius: 10,
    border: '1.5px solid var(--border,#e5e7eb)', background: 'var(--panel-bg,white)',
    color: 'var(--text,#111827)', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  }}
    onFocus={e => { e.target.style.borderColor = purple; e.target.style.boxShadow = `0 0 0 3px ${purpleLt}`; }}
    onBlur={e => { e.target.style.borderColor = 'var(--border,#e5e7eb)'; e.target.style.boxShadow = 'none'; }}
  />
);

const StyledTextarea = ({ rows = 4, ...props }) => (
  <textarea rows={rows} {...props} style={{
    width: '100%', padding: '9px 12px', borderRadius: 10,
    border: '1.5px solid var(--border,#e5e7eb)', background: 'var(--panel-bg,white)',
    color: 'var(--text,#111827)', fontSize: '0.85rem', outline: 'none', resize: 'vertical',
    boxSizing: 'border-box', fontFamily: 'inherit', transition: 'border-color 0.15s',
  }}
    onFocus={e => { e.target.style.borderColor = purple; e.target.style.boxShadow = `0 0 0 3px ${purpleLt}`; }}
    onBlur={e => { e.target.style.borderColor = 'var(--border,#e5e7eb)'; e.target.style.boxShadow = 'none'; }}
  />
);

const formatFileSize = (bytes) => {
  if (!bytes) return '';
  const k = 1024, sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

const getFileIcon = (file) => {
  const fileType = file.type || file.mime_type || '';
  const fileName = file.name || '';
  return (fileType.startsWith('image/') || fileName.match(/\.(jpg|jpeg|png|gif|webp)$/i))
    ? <ImageIcon size={16} />
    : <FileText size={16} />;
};

// ─── Component ────────────────────────────────────────────────────────────────
const Step3AdditionalDetails = ({ formData, updateFormData }) => {
  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    updateFormData({ attachments: [...formData.attachments, ...files] });
    e.target.value = '';
  };

  const removeFile = (index) => {
    updateFormData({ attachments: formData.attachments.filter((_, i) => i !== index) });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 900, letterSpacing: '-0.02em', color: '#f59e0b', margin: '0 0 5px' }}>Additional Details</h2>
        <p style={{ fontSize: '0.83rem', color: '#9ca3af', margin: 0 }}>Provide additional information to help us prepare your quote</p>
      </div>

      <Field label="Delivery/Service Location" hint="Where should products be delivered or services performed?">
        <StyledInput type="text" placeholder="e.g., Nairobi CBD, Westlands Office Building…" value={formData.delivery_location} onChange={e => updateFormData({ delivery_location: e.target.value })} />
      </Field>

      <Field label="Additional Notes" hint="Include any special requirements, preferences, or questions">
        <StyledTextarea rows={5} placeholder="Any other information that would help us provide an accurate quote…" value={formData.customer_notes} onChange={e => updateFormData({ customer_notes: e.target.value })} />
      </Field>

      {/* File attachments */}
      <div>
        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#f59e0b', marginBottom: 6 }}>Attachments</label>

        {/* Drop zone */}
        <label htmlFor="s3-file-upload" style={{ display: 'block', cursor: 'pointer' }}>
          <div style={{
            border: `2px dashed ${purpleBd}`, borderRadius: 12, padding: '28px 20px',
            textAlign: 'center', background: purpleLt, transition: 'border-color 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = purple; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = purpleBd; }}
          >
            <div style={{ width: 44, height: 44, borderRadius: 12, background: purple, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
              <Upload size={20} color="white" />
            </div>
            <p style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f59e0b', margin: '0 0 4px' }}>Click to upload files</p>
            <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: 0 }}>PDF, Images, Documents · Max 10MB per file</p>
          </div>
        </label>
        <input id="s3-file-upload" type="file" multiple onChange={handleFileSelect} style={{ display: 'none' }} accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" />

        {/* File list */}
        {formData.attachments?.length > 0 && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text,#374151)', margin: 0 }}>Attached Files ({formData.attachments.length})</p>
            {formData.attachments.map((file, index) => {
              const isFileObj = file instanceof File;
              return (
                <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, border: '1.5px solid var(--border,#f3f4f6)', background: 'var(--panel-bg,white)' }}>
                  <div style={{ color: '#9ca3af', flexShrink: 0 }}>{getFileIcon(file)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text,#111827)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</p>
                    <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: 0 }}>
                      {formatFileSize(file.size)}
                      {!isFileObj && <span style={{ color: '#3b82f6', marginLeft: 8 }}>Already uploaded</span>}
                    </p>
                  </div>
                  <button onClick={() => removeFile(index)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#ef4444', display: 'flex', borderRadius: 6, flexShrink: 0 }}>
                    <X size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <p style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 8 }}>Attach specifications, drawings, photos, or any relevant documents</p>
      </div>

      {/* Tip box */}
      <div style={{ borderRadius: 12, border: '1.5px solid rgba(59,130,246,0.2)', background: 'rgba(59,130,246,0.05)', padding: '14px 16px' }}>
        <p style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#3b82f6', margin: '0 0 8px' }}>💡 Helpful Attachments</p>
        <div style={{ fontSize: '0.78rem', color: '#6b7280', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {['Technical specifications or datasheets', 'Site photos or layout drawings', 'Reference images of what you need', 'Existing quotes for comparison', 'Any relevant documentation'].map((t, i) => (
            <span key={i}>• {t}</span>
          ))}
        </div>
      </div>

      <div style={{ borderRadius: 12, background: 'var(--row-bg,rgba(249,250,251,0.8))', border: '1px solid var(--border,#f3f4f6)', padding: '12px 16px' }}>
        <p style={{ fontSize: '0.78rem', color: '#6b7280', margin: 0 }}>
          <strong style={{ color: 'var(--text,#374151)' }}>Note:</strong> All fields on this page are optional, but providing more details helps us give you a more accurate quote faster.
        </p>
      </div>
    </div>
  );
};

export default Step3AdditionalDetails;