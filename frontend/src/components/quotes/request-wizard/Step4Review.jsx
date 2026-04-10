import React from 'react';
import { Edit2, Package, Wrench, MapPin, DollarSign, Clock, FileText, Paperclip } from 'lucide-react';

// ─── Design tokens ────────────────────────────────────────────────────────────
const purple   = '#a855f7';
const purpleDk = '#7c3aed';
const purpleLt = 'rgba(168,85,247,0.08)';
const purpleBd = 'rgba(168,85,247,0.2)';

// ─── Atoms ────────────────────────────────────────────────────────────────────
const Btn = ({ children, onClick, size = 'sm', type = 'button' }) => (
  <button type={type} onClick={onClick} style={{
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: size === 'sm' ? '5px 12px' : '8px 16px',
    borderRadius: 9, border: '1.5px solid #e5e7eb', background: 'transparent',
    color: '#6b7280', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
    transition: 'transform 0.1s',
  }}
    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
    onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
  >
    {children}
  </button>
);

const ReviewPanel = ({ title, icon: Icon, onEdit, children }) => (
  <div style={{ borderRadius: 14, border: '1.5px solid var(--border,#f3f4f6)', overflow: 'hidden', background: 'var(--panel-bg,white)' }}>
    <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border,#f3f4f6)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--row-bg,rgba(249,250,251,0.6))' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {Icon && <Icon size={15} color={purple} />}
        <p style={{ fontSize: '0.8rem', fontWeight: 800, color: '#10b981', margin: 0 }}>{title}</p>
      </div>
      {onEdit && <Btn onClick={onEdit} size="sm"><Edit2 size={12} />Edit</Btn>}
    </div>
    <div style={{ padding: '16px 18px' }}>{children}</div>
  </div>
);

const ReviewRow = ({ label, icon: Icon, children }) => (
  <div>
    <p style={{ fontSize: '0.72rem', fontWeight: 700, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 5, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
      {Icon && <Icon size={11} />}{label}
    </p>
    <div style={{ fontSize: '0.85rem', color: 'var(--text,#111827)' }}>{children}</div>
  </div>
);

const Pill = ({ children, color = '#6b7280', bg = '#f3f4f6' }) => (
  <span style={{ display: 'inline-block', fontSize: '0.72rem', fontWeight: 700, padding: '3px 10px', borderRadius: 9999, background: bg, color }}>{children}</span>
);

const ItemCard = ({ name, isCustom, badge, meta, note, right }) => (
  <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--row-bg,rgba(249,250,251,0.7))', border: '1px solid var(--border,#f3f4f6)', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
    <div style={{ flex: 1, minWidth: 0 }}>
      <p style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text,#111827)', margin: '0 0 4px' }}>{name}</p>
      {isCustom && <Pill bg={purpleLt} color={purple}>Custom</Pill>}
      {badge && <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: '4px 0 0' }}>{badge}</p>}
      {meta  && <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: '2px 0 0' }}>{meta}</p>}
      {note  && <p style={{ fontSize: '0.72rem', color: '#9ca3af', fontStyle: 'italic', margin: '2px 0 0' }}>Note: {note}</p>}
    </div>
    {right && <div style={{ textAlign: 'right', flexShrink: 0 }}><p style={{ fontSize: '0.82rem', fontWeight: 800, color: '#a855f7', margin: 0 }}>{right}</p></div>}
  </div>
);

const formatFileSize = (bytes) => {
  if (!bytes) return '';
  const k = 1024, sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

const getRequestTypeLabel = (type) => ({ product: 'Product Only', service: 'Service Only', mixed: 'Products & Services', not_sure: 'Not Sure' }[type] || type);

// ─── Component ────────────────────────────────────────────────────────────────
const Step4Review = ({ formData, onEdit }) => {
  const totalItems = formData.selectedProducts.length + formData.selectedServices.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 900, letterSpacing: '-0.02em', color: '#10b981', margin: '0 0 5px' }}>Review Your Request</h2>
        <p style={{ fontSize: '0.83rem', color: '#9ca3af', margin: 0 }}>Please review all information before submitting</p>
      </div>

      {/* Basic Info */}
      <ReviewPanel title="Basic Information" icon={FileText} onEdit={() => onEdit(1)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <ReviewRow label="Request Title">
            <strong style={{ fontSize: '0.88rem' }}>{formData.request_title}</strong>
          </ReviewRow>
          <ReviewRow label="Description">
            <p style={{ margin: 0, lineHeight: 1.6, whiteSpace: 'pre-line' }}>{formData.request_description}</p>
          </ReviewRow>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            <ReviewRow label="Request Type" icon={Package}>
              <Pill bg={purpleLt} color={purple}>{getRequestTypeLabel(formData.request_type)}</Pill>
            </ReviewRow>
            {formData.budget_range && (
              <ReviewRow label="Budget Range" icon={DollarSign}>
                <span style={{ fontSize: '0.85rem' }}>{formData.budget_range}</span>
              </ReviewRow>
            )}
            {formData.timeline_needed && (
              <ReviewRow label="Timeline" icon={Clock}>
                <span style={{ fontSize: '0.85rem' }}>{formData.timeline_needed}</span>
              </ReviewRow>
            )}
          </div>
        </div>
      </ReviewPanel>

      {/* Items */}
      <ReviewPanel title="Selected Items" onEdit={() => onEdit(2)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {formData.selectedProducts.length > 0 && (
            <div>
              <p style={{ fontSize: '0.72rem', fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 5 }}>
                <Package size={12} />Products ({formData.selectedProducts.length})
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {formData.selectedProducts.map((item, index) => (
                  <ItemCard
                    key={index}
                    name={item.is_custom ? item.custom_details.description : item.product?.name}
                    isCustom={item.is_custom}
                    badge={!item.is_custom && item.product?.sku ? `SKU: ${item.product.sku}` : null}
                    meta={item.is_custom && item.custom_details.specifications ? `Specs: ${item.custom_details.specifications}` : null}
                    note={item.notes}
                    right={`Qty: ${item.quantity}`}
                  />
                ))}
              </div>
            </div>
          )}

          {formData.selectedServices.length > 0 && (
            <div>
              <p style={{ fontSize: '0.72rem', fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 5 }}>
                <Wrench size={12} />Services ({formData.selectedServices.length})
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {formData.selectedServices.map((item, index) => (
                  <ItemCard
                    key={index}
                    name={item.is_custom ? item.custom_details.description : item.service?.name}
                    isCustom={item.is_custom}
                    badge={!item.is_custom && item.service?.short_description ? item.service.short_description : null}
                    meta={item.is_custom && item.custom_details.specifications ? `Specs: ${item.custom_details.specifications}` : null}
                    note={item.notes}
                    right={item.estimated_hours ? `${item.estimated_hours} hrs` : null}
                  />
                ))}
              </div>
            </div>
          )}

          <div style={{ paddingTop: 10, borderTop: '1px solid var(--border,#f3f4f6)', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>Total Items</span>
            <span style={{ fontSize: '0.82rem', fontWeight: 800, color: purple }}>{totalItems}</span>
          </div>
        </div>
      </ReviewPanel>

      {/* Additional Details */}
      <ReviewPanel title="Additional Details" onEdit={() => onEdit(3)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {formData.delivery_location && (
            <ReviewRow label="Delivery/Service Location" icon={MapPin}>
              <span style={{ fontSize: '0.85rem' }}>{formData.delivery_location}</span>
            </ReviewRow>
          )}
          {formData.customer_notes && (
            <ReviewRow label="Additional Notes">
              <p style={{ margin: 0, lineHeight: 1.6, whiteSpace: 'pre-line', fontSize: '0.85rem' }}>{formData.customer_notes}</p>
            </ReviewRow>
          )}
          {formData.attachments.length > 0 && (
            <ReviewRow label="Attachments" icon={Paperclip}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 4 }}>
                {formData.attachments.map((file, index) => (
                  <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: 'var(--row-bg,rgba(249,250,251,0.7))', border: '1px solid var(--border,#f3f4f6)' }}>
                    <FileText size={14} color="#9ca3af" />
                    <span style={{ flex: 1, fontSize: '0.78rem', color: 'var(--text,#374151)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                    <span style={{ fontSize: '0.7rem', color: '#9ca3af', flexShrink: 0 }}>{formatFileSize(file.size)}</span>
                  </div>
                ))}
              </div>
            </ReviewRow>
          )}
          {!formData.delivery_location && !formData.customer_notes && formData.attachments.length === 0 && (
            <p style={{ fontSize: '0.83rem', color: '#9ca3af', fontStyle: 'italic', margin: 0 }}>No additional details provided</p>
          )}
        </div>
      </ReviewPanel>

      {/* What happens next */}
      <div style={{ borderRadius: 12, border: '1.5px solid rgba(59,130,246,0.2)', background: 'rgba(59,130,246,0.05)', padding: '14px 16px' }}>
        <p style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#3b82f6', margin: '0 0 8px' }}>📋 What Happens Next?</p>
        <div style={{ fontSize: '0.78rem', color: '#6b7280', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {["We'll review your request within 24-48 hours", "You'll receive updates via email and in your dashboard", 'We may contact you if we need clarification', "Once ready, you'll receive a detailed quote"].map((t, i) => (
            <span key={i}>• {t}</span>
          ))}
        </div>
      </div>

      {/* Terms */}
      <div style={{ borderRadius: 12, background: 'var(--row-bg,rgba(249,250,251,0.8))', border: '1px solid var(--border,#f3f4f6)', padding: '12px 16px' }}>
        <p style={{ fontSize: '0.78rem', color: '#6b7280', margin: 0 }}>
          By submitting this request, you agree to our{' '}
          <a href="/terms" style={{ color: purple, textDecoration: 'none', fontWeight: 600 }}>Terms of Service</a>{' '}and{' '}
          <a href="/privacy" style={{ color: purple, textDecoration: 'none', fontWeight: 600 }}>Privacy Policy</a>.
          We will only use your information to process this quote request.
        </p>
      </div>
    </div>
  );
};

export default Step4Review;