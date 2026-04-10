import React, { useState } from 'react';
import { X, ChevronLeft, ChevronRight, Save, Check } from 'lucide-react';
import Step1BasicInfo from './Step1BasicInfo';
import Step2SelectItems from './Step2SelectItems';
import Step3AdditionalDetails from './Step3AdditionalDetails';
import Step4Review from './Step4Review';

// ─── Design tokens ────────────────────────────────────────────────────────────
const purple   = '#a855f7';
const purpleDk = '#7c3aed';
const purpleLt = 'rgba(168,85,247,0.08)';
const purpleBd = 'rgba(168,85,247,0.2)';
const green    = '#10b981';
const greenLt  = 'rgba(16,185,129,0.1)';

// ─── Atoms ────────────────────────────────────────────────────────────────────
const Btn = ({ children, onClick, disabled, variant = 'outline', icon, type = 'button' }) => {
  const variants = {
    primary: { background: `linear-gradient(135deg,${purple},${purpleDk})`, color: 'white', border: 'none', boxShadow: '0 4px 12px rgba(168,85,247,0.3)' },
    outline: { background: purpleLt, color: purple, border: `1.5px solid ${purpleBd}`, boxShadow: 'none' },
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{
      ...variants[variant],
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '8px 18px', borderRadius: 10, fontSize: '0.83rem', fontWeight: 700,
      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1,
      transition: 'transform 0.1s',
    }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      {icon}{children}
    </button>
  );
};

const EditQuoteRequestModal = ({ quoteRequest, onClose, onSave }) => {
  const [currentStep, setCurrentStep] = useState(1);

  const [formData, setFormData] = useState({
    request_title:       quoteRequest.request_title       || '',
    request_description: quoteRequest.request_description || '',
    request_type:        quoteRequest.request_type        || 'not_sure',
    budget_range:        quoteRequest.budget_range        || '',
    timeline_needed:     quoteRequest.timeline_needed     || '',
    delivery_location:   quoteRequest.delivery_location   || '',
    customer_notes:      quoteRequest.customer_notes      || '',
    selectedProducts:    parseRequestedItems(quoteRequest.requested_items, 'product'),
    selectedServices:    parseRequestedItems(quoteRequest.requested_items, 'service'),
    attachments:         quoteRequest.attachments         || [],
  });

  const [submitting, setSubmitting] = useState(false);

  function parseRequestedItems(items, type) {
    if (!Array.isArray(items)) return [];
    return items
      .filter(item => {
        const t = item.item_type || item.type;
        return type === 'product' ? (t === 'product' || t === 'custom_product') : (t === 'service' || t === 'custom_service');
      })
      .map(item => {
        const itemType = item.item_type || item.type || '';
        const isCustom = itemType.includes('custom');
        const common = {
          is_custom:       isCustom,
          quantity:        item.quantity        ?? 1,
          specifications:  item.specifications  ?? '',
          notes:           item.notes           ?? '',
          budget_per_unit: item.budget_per_unit ?? null,
          unit_of_measure: item.unit_of_measure ?? '',
          lead_time:       item.lead_time       ?? '',
        };
        if (type === 'product') {
          return {
            ...common,
            product_id:     item.product_id ?? null,
            custom_details: isCustom ? { description: item.description ?? '', specifications: item.specifications ?? '', quantity: item.quantity ?? 1, budget: item.budget_per_unit ?? null, unit_of_measure: item.unit_of_measure ?? '', lead_time: item.lead_time ?? '', notes: item.notes ?? '' } : null,
            product:        isCustom ? null : { id: item.product_id, name: item.description, sku: item.sku ?? null, ...(item.product || {}) },
          };
        }
        return {
          ...common,
          service_id:      item.service_id ?? null,
          estimated_hours: item.estimated_hours ?? null,
          custom_details:  isCustom ? { description: item.description ?? '', specifications: item.specifications ?? '', quantity: item.quantity ?? 1, estimated_hours: item.estimated_hours ?? null, budget: item.budget_per_unit ?? null, unit_of_measure: item.unit_of_measure ?? '', lead_time: item.lead_time ?? '', notes: item.notes ?? '' } : null,
          service:         isCustom ? null : { id: item.service_id, name: item.description, ...(item.service || {}) },
        };
      });
  }

  const updateFormData = updates => setFormData(prev => ({ ...prev, ...updates }));

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const requestedItems = [
        ...formData.selectedProducts.map(p => ({
          item_type:       p.is_custom ? 'custom_product' : 'product',
          product_id:      p.is_custom ? null : p.product_id,
          description:     p.is_custom ? p.custom_details?.description : p.product?.name,
          quantity:        p.is_custom ? (p.custom_details?.quantity ?? p.quantity ?? 1) : (p.quantity ?? 1),
          specifications:  p.is_custom ? (p.custom_details?.specifications ?? p.specifications ?? null) : (p.specifications ?? null),
          budget_per_unit: p.is_custom ? (p.custom_details?.budget ?? p.budget_per_unit ?? null) : (p.budget_per_unit ?? null),
          unit_of_measure: p.is_custom ? (p.custom_details?.unit_of_measure ?? p.unit_of_measure ?? null) : (p.unit_of_measure ?? null),
          lead_time:       p.is_custom ? (p.custom_details?.lead_time ?? p.lead_time ?? null) : (p.lead_time ?? null),
          notes:           p.notes ?? null,
        })),
        ...formData.selectedServices.map(s => ({
          item_type:       s.is_custom ? 'custom_service' : 'service',
          service_id:      s.is_custom ? null : s.service_id,
          description:     s.is_custom ? s.custom_details?.description : s.service?.name,
          quantity:        s.is_custom ? (s.custom_details?.quantity ?? s.quantity ?? 1) : (s.quantity ?? 1),
          estimated_hours: s.is_custom ? (s.custom_details?.estimated_hours ?? s.estimated_hours ?? null) : (s.estimated_hours ?? null),
          specifications:  s.is_custom ? (s.custom_details?.specifications ?? s.specifications ?? null) : (s.specifications ?? null),
          budget_per_unit: s.is_custom ? (s.custom_details?.budget ?? s.budget_per_unit ?? null) : (s.budget_per_unit ?? null),
          unit_of_measure: s.is_custom ? (s.custom_details?.unit_of_measure ?? s.unit_of_measure ?? null) : (s.unit_of_measure ?? null),
          lead_time:       s.is_custom ? (s.custom_details?.lead_time ?? s.lead_time ?? null) : (s.lead_time ?? null),
          notes:           s.notes ?? null,
        })),
      ];

      const existingAttachments = quoteRequest.attachments || [];
      const currentAttachments  = formData.attachments || [];
      const newFiles             = currentAttachments.filter(a => a instanceof File);
      const keptPaths            = currentAttachments.filter(a => !(a instanceof File)).map(a => a.path).filter(Boolean);
      const removedAttachmentPaths = existingAttachments.map(a => a.path).filter(Boolean).filter(p => !keptPaths.includes(p));

      await onSave({
        request_title:       formData.request_title,
        request_description: formData.request_description,
        request_type:        formData.request_type,
        requested_items:     requestedItems,
        budget_range:        formData.budget_range,
        timeline_needed:     formData.timeline_needed,
        delivery_location:   formData.delivery_location,
        customer_notes:      formData.customer_notes,
      }, newFiles, removedAttachmentPaths);
    } catch (error) {
      console.error('Failed to update:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const steps = [
    { number: 1, title: 'Basic Info' },
    { number: 2, title: 'Items' },
    { number: 3, title: 'Details' },
    { number: 4, title: 'Review' },
  ];

  return (
    <>
      <style>{`
        @keyframes eqmFadeIn  { from { opacity:0; } to { opacity:1; } }
        @keyframes eqmSlideUp { from { opacity:0; transform:translateY(16px) scale(0.99); } to { opacity:1; transform:translateY(0) scale(1); } }
        .eqm-overlay { animation: eqmFadeIn 0.18s ease both; }
        .eqm-modal   { animation: eqmSlideUp 0.22s ease both; display:flex; flex-direction:column; }
        .eqm-scroll::-webkit-scrollbar { width:6px; }
        .eqm-scroll::-webkit-scrollbar-track { background:transparent; }
        .eqm-scroll::-webkit-scrollbar-thumb { background:#e5e7eb; border-radius:99px; }
      `}</style>

      {/* Backdrop — true viewport overlay */}
      <div
        className="eqm-overlay"
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '20px 16px',
        }}
      >
        {/* Modal — full height, wide */}
        <div
          className="eqm-modal"
          onClick={e => e.stopPropagation()}
          style={{
            width: '100%', maxWidth: 1100,
            height: 'calc(100vh - 40px)', maxHeight: 820,
            background: 'var(--panel-bg,white)',
            borderRadius: 20, overflow: 'hidden',
            boxShadow: '0 32px 100px rgba(0,0,0,0.25)',
          }}
        >
          {/* Header */}
          <div style={{ padding: '20px 28px', borderBottom: '1px solid var(--border,#f3f4f6)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: purpleLt, flexShrink: 0 }}>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 900, color: purple, margin: 0 }}>Edit Quote Request</h2>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 8, color: '#9ca3af', display: 'flex' }}>
              <X size={20} />
            </button>
          </div>

          {/* Step indicator */}
          <div style={{ padding: '18px 28px', borderBottom: '1px solid var(--border,#f3f4f6)', display: 'flex', alignItems: 'center', gap: 0, flexShrink: 0 }}>
            {steps.map((step, index) => {
              const done   = currentStep > step.number;
              const active = currentStep === step.number;
              return (
                <React.Fragment key={step.number}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 800, fontSize: '0.78rem', flexShrink: 0,
                      background: done ? green : active ? purple : '#f3f4f6',
                      color: done || active ? 'white' : '#9ca3af',
                      boxShadow: active ? `0 0 0 3px ${purpleLt}` : 'none',
                      transition: 'all 0.2s',
                    }}>
                      {done ? <Check size={14} /> : step.number}
                    </div>
                    <span style={{ fontSize: '0.78rem', fontWeight: active ? 800 : 600, color: active ? purple : done ? green : '#9ca3af', whiteSpace: 'nowrap' }}>
                      {step.title}
                    </span>
                  </div>
                  {index < steps.length - 1 && (
                    <div style={{ flex: 1, height: 2, margin: '0 10px', background: currentStep > step.number ? green : '#f3f4f6', borderRadius: 2, minWidth: 20, transition: 'background 0.3s' }} />
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {/* Step content — fills remaining space, scrolls */}
          <div
            className="eqm-scroll"
            style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}
          >
            {currentStep === 1 && <Step1BasicInfo          formData={formData} updateFormData={updateFormData} />}
            {currentStep === 2 && <Step2SelectItems        formData={formData} updateFormData={updateFormData} />}
            {currentStep === 3 && <Step3AdditionalDetails  formData={formData} updateFormData={updateFormData} />}
            {currentStep === 4 && <Step4Review             formData={formData} onEdit={setCurrentStep} />}
          </div>

          {/* Footer */}
          <div style={{ padding: '16px 28px', borderTop: '1px solid var(--border,#f3f4f6)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <Btn variant="outline" onClick={onClose} disabled={submitting}>Cancel</Btn>
            <div style={{ display: 'flex', gap: 10 }}>
              {currentStep > 1 && (
                <Btn variant="outline" onClick={() => setCurrentStep(s => s - 1)} icon={<ChevronLeft size={14} />}>Previous</Btn>
              )}
              {currentStep < 4 ? (
                <Btn variant="primary" onClick={() => setCurrentStep(s => s + 1)} icon={<ChevronRight size={14} />}>Next</Btn>
              ) : (
                <Btn variant="primary" onClick={handleSubmit} disabled={submitting} icon={submitting ? null : <Save size={14} />}>
                  {submitting ? 'Saving…' : 'Save Changes'}
                </Btn>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default EditQuoteRequestModal;