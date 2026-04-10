import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  FileText,
  Package,
  Upload,
  CheckCircle,
  ArrowLeft,
  ArrowRight,
  AlertCircle,
} from 'lucide-react';
import Header from '../../components/layout/Header';
import useQuoteRequestStore from '../../store/quoteRequestStore';
import useServiceStore from '../../store/serviceStore';
import useProductStore from '../../store/productStore';

import Step1BasicInfo from '../../components/quotes/request-wizard/Step1BasicInfo';
import Step2SelectItems from '../../components/quotes/request-wizard/Step2SelectItems';
import Step3AdditionalDetails from '../../components/quotes/request-wizard/Step3AdditionalDetails';
import Step4Review from '../../components/quotes/request-wizard/Step4Review';

// ─── Design tokens ────────────────────────────────────────────────────────────
const purple   = '#a855f7';
const purpleDk = '#7c3aed';
const purpleLt = 'rgba(168,85,247,0.08)';
const purpleBd = 'rgba(168,85,247,0.2)';
const green    = '#10b981';
const greenLt  = 'rgba(16,185,129,0.1)';
const greenBd  = 'rgba(16,185,129,0.25)';

// ─── Atoms ────────────────────────────────────────────────────────────────────
const Btn = ({ children, onClick, disabled, variant = 'outline', icon, size = 'md', type = 'button' }) => {
  const variants = {
    primary: {
      background: `linear-gradient(135deg,${purple},${purpleDk})`,
      color: 'white', border: 'none',
      boxShadow: '0 4px 12px rgba(168,85,247,0.3)',
    },
    outline: {
      background: purpleLt,
      color: purple,
      border: `1.5px solid ${purpleBd}`,
      boxShadow: 'none',
    },
    ghost: {
      background: purpleLt,
      color: purple,
      border: `1.5px solid ${purpleBd}`,
      boxShadow: 'none',
    },
    danger: {
      background: 'transparent',
      color: '#ef4444',
      border: '1.5px solid #fca5a5',
      boxShadow: 'none',
    },
  };
  const pad = size === 'sm' ? '5px 14px' : '10px 22px';
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        ...variants[variant],
        display: 'inline-flex', alignItems: 'center', gap: 7,
        padding: pad, borderRadius: 10,
        fontSize: size === 'sm' ? '0.75rem' : '0.875rem',
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'transform 0.12s, box-shadow 0.12s',
        minWidth: size === 'sm' ? 'unset' : 120,
      }}
      onMouseEnter={e => { if (!disabled) { e.currentTarget.style.transform = 'translateY(-1px)'; if (variant === 'primary') e.currentTarget.style.boxShadow = '0 6px 20px rgba(168,85,247,0.4)'; } }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; if (variant === 'primary') e.currentTarget.style.boxShadow = '0 4px 12px rgba(168,85,247,0.3)'; }}
    >
      {icon}{children}
    </button>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────
const RequestQuote = () => {
  const navigate  = useNavigate();
  const location  = useLocation();

  const { submitting, error, createQuoteRequestWithFiles, clearError } = useQuoteRequestStore();
  const { fetchServices } = useServiceStore();
  const { fetchProducts }  = useProductStore();

  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 4;

  const [formData, setFormData] = useState({
    request_title: '',
    request_description: '',
    request_type: 'not_sure',
    budget_range: '',
    timeline_needed: '',
    selectedProducts: [],
    selectedServices: [],
    delivery_location: '',
    customer_notes: '',
    attachments: [],
  });

  // Pre-select service from navigation state
  useEffect(() => {
    const preselectedService = location.state?.preselectedService;
    if (preselectedService) {
      setFormData(prev => ({
        ...prev,
        selectedServices: [{
          service_id: preselectedService.id,
          service: preselectedService,
          quantity: 1,
          estimated_hours: null,
          notes: '',
          is_custom: false,
          specifications: '',
          unit_of_measure: preselectedService.unit_of_measure ?? 'hour',
          lead_time: preselectedService.lead_time ?? '',
        }],
        request_title: `Request for ${preselectedService.name}`,
      }));
    }
  }, [location.state]);

  useEffect(() => { fetchServices(); fetchProducts(); }, []);

  // Auto-detect request type
  useEffect(() => {
    const hasProducts = formData.selectedProducts.length > 0;
    const hasServices = formData.selectedServices.length > 0;
    let requestType = 'not_sure';
    if (hasProducts && hasServices) requestType = 'mixed';
    else if (hasProducts) requestType = 'product';
    else if (hasServices) requestType = 'service';
    if (requestType !== formData.request_type) updateFormData({ request_type: requestType });
  }, [formData.selectedProducts, formData.selectedServices]);

  const updateFormData = updates => setFormData(prev => ({ ...prev, ...updates }));

  const steps = [
    { number: 1, title: 'Basic Info',      shortTitle: '1',  icon: FileText,    description: 'Tell us what you need' },
    { number: 2, title: 'Select Items',    shortTitle: '2',  icon: Package,     description: 'Products & services' },
    { number: 3, title: 'Details',         shortTitle: '3',  icon: Upload,      description: 'Location & attachments' },
    { number: 4, title: 'Review',          shortTitle: '4',  icon: CheckCircle, description: 'Review & submit' },
  ];

  const goToStep = step => {
    if (step >= 1 && step <= totalSteps) {
      setCurrentStep(step);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const validateCurrentStep = () => {
    clearError();
    switch (currentStep) {
      case 1:
        if (!formData.request_title.trim())       { alert('Please enter a request title'); return false; }
        if (!formData.request_description.trim()) { alert('Please enter a description');  return false; }
        return true;
      case 2:
        if (!formData.selectedProducts.length && !formData.selectedServices.length) {
          alert('Please select at least one product or service'); return false;
        }
        return true;
      default: return true;
    }
  };

  const nextStep = () => { if (validateCurrentStep()) goToStep(currentStep + 1); };
  const prevStep = () => goToStep(currentStep - 1);

  const getServiceUnitPrice = service => {
    if (!service || service.price_is_negotiable) return null;
    switch (service.pricing_model) {
      case 'hourly':       return service.hourly_rate ?? null;
      case 'daily':        return service.daily_rate  ?? null;
      default:             return service.base_price  ?? service.hourly_rate ?? service.daily_rate ?? null;
    }
  };

  const handleSubmit = async () => {
    try {
      const requestedItems = [
        ...formData.selectedProducts.map(item => ({
          item_type:      item.is_custom ? 'custom_product' : 'product',
          product_id:     item.is_custom ? null : item.product_id,
          description:    item.is_custom ? item.custom_details.description : item.product?.name,
          quantity:       item.quantity || 1,
          specifications: item.is_custom ? (item.custom_details.specifications ?? null) : (item.specifications ?? null),
          budget_per_unit:item.is_custom ? (item.custom_details.budget ?? item.budget_per_unit ?? null) : (item.budget_per_unit ?? item.product?.price ?? null),
          notes:          item.notes,
          unit_of_measure:item.is_custom ? (item.custom_details.unit_of_measure ?? null) : (item.unit_of_measure ?? null),
          lead_time:      item.is_custom ? (item.custom_details.lead_time ?? null) : (item.lead_time ?? null),
        })),
        ...formData.selectedServices.map(item => ({
          item_type:       item.is_custom ? 'custom_service' : 'service',
          service_id:      item.is_custom ? null : item.service_id,
          description:     item.is_custom ? item.custom_details.description : item.service?.name,
          quantity:        item.quantity || 1,
          estimated_hours: item.is_custom ? (item.custom_details.estimated_hours ?? item.estimated_hours ?? null) : (item.estimated_hours ?? null),
          specifications:  item.is_custom ? (item.custom_details.specifications ?? null) : (item.specifications ?? null),
          budget_per_unit: item.is_custom ? (item.custom_details.budget ?? item.budget_per_unit ?? null) : (item.budget_per_unit ?? getServiceUnitPrice(item.service)),
          unit_of_measure: item.is_custom ? (item.custom_details.unit_of_measure ?? null) : (item.unit_of_measure ?? null),
          lead_time:       item.is_custom ? (item.custom_details.lead_time ?? null) : (item.lead_time ?? null),
          notes:           item.notes,
        })),
      ];

      await createQuoteRequestWithFiles({
        request_title:       formData.request_title,
        request_description: formData.request_description,
        request_type:        formData.request_type,
        requested_items:     requestedItems,
        budget_range:        formData.budget_range       || null,
        timeline_needed:     formData.timeline_needed    || null,
        delivery_location:   formData.delivery_location  || null,
        customer_notes:      formData.customer_notes     || null,
      }, formData.attachments);

      navigate('/my-quote-requests', {
        state: { message: 'Quote request submitted successfully! We will review it and get back to you soon.' },
      });
    } catch (err) {
      console.error('Failed to submit quote request:', err);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1: return <Step1BasicInfo           formData={formData} updateFormData={updateFormData} />;
      case 2: return <Step2SelectItems         formData={formData} updateFormData={updateFormData} />;
      case 3: return <Step3AdditionalDetails   formData={formData} updateFormData={updateFormData} />;
      case 4: return <Step4Review              formData={formData} onEdit={goToStep} />;
      default: return null;
    }
  };

  const currentStepMeta = steps[currentStep - 1];

  return (
    <>
      <style>{`
        @keyframes rqFadeIn  { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        @keyframes spin       { to   { transform: rotate(360deg); } }
        .rq-step-content { animation: rqFadeIn 0.22s ease both; }
      `}</style>

      <div style={{ minHeight: '100vh', background: 'var(--page-bg,#f9fafb)' }}>
        <Header />

        {/* ── Page Header ───────────────────────────────────────────────── */}
        <div style={{
          position: 'relative', overflow: 'hidden',
          background: 'var(--panel-bg,white)',
          borderBottom: '1px solid var(--border,#f3f4f6)',
          padding: '36px 32px 32px',
        }}>
          {/* Abstract background shapes */}
          <div style={{ position:'absolute', inset:0, pointerEvents:'none', overflow:'hidden' }}>
            {/* Large circle top-right */}
            <div style={{ position:'absolute', top:-60, right:-60, width:260, height:260, borderRadius:'50%', background: purpleLt, border: `1.5px solid ${purpleBd}` }} />
            {/* Small circle mid-right */}
            <div style={{ position:'absolute', top:20, right:160, width:80, height:80, borderRadius:'50%', background:'rgba(168,85,247,0.04)', border:`1px solid ${purpleBd}` }} />
            {/* Rectangle bottom-left */}
            <div style={{ position:'absolute', bottom:-24, left:40, width:120, height:120, borderRadius:24, background:'rgba(168,85,247,0.04)', border:`1px solid ${purpleBd}`, transform:'rotate(18deg)' }} />
            {/* Tiny dot cluster */}
            <div style={{ position:'absolute', top:18, left:'42%', width:8, height:8, borderRadius:'50%', background: purpleBd }} />
            <div style={{ position:'absolute', top:32, left:'44%', width:5, height:5, borderRadius:'50%', background: purpleBd }} />
            <div style={{ position:'absolute', top:12, left:'46%', width:4, height:4, borderRadius:'50%', background: purpleBd }} />
          </div>

          {/* Content */}
          <div style={{ position:'relative', display:'flex', alignItems:'center', gap:18, maxWidth:1280, margin:'0 auto' }}>
            <div style={{
              width:56, height:56, borderRadius:16, flexShrink:0,
              background: `linear-gradient(135deg,${purpleLt},rgba(124,58,237,0.12))`,
              border: `1.5px solid ${purpleBd}`,
              display:'flex', alignItems:'center', justifyContent:'center',
              boxShadow: `0 4px 16px ${purpleBd}`,
            }}>
              <FileText size={26} color={purple} />
            </div>
            <div>
              <h1 style={{ fontSize:'1.5rem', fontWeight:900, color:'var(--text,#111827)', margin:'0 0 4px', letterSpacing:'-0.025em' }}>
                Request a Quote
              </h1>
              <p style={{ fontSize:'0.875rem', color:'#6b7280', margin:0 }}>
                Tell us what you need and we'll get back to you with a custom quote
              </p>
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 24px 60px' }}>

          {/* ── Progress Stepper ────────────────────────────────────────── */}
          <div style={{
            background: 'var(--panel-bg,white)',
            borderRadius: 20,
            boxShadow: '0 4px 24px rgba(0,0,0,0.07)',
            padding: '24px 28px 20px',
            marginBottom: 24,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
              {steps.map((step, index) => {
                const Icon       = step.icon;
                const isActive   = currentStep === step.number;
                const isCompleted= currentStep > step.number;
                const isClickable= isCompleted;

                return (
                  <React.Fragment key={step.number}>
                    {/* Step node */}
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', flex:1, minWidth:0 }}>
                      <button
                        onClick={() => isClickable && goToStep(step.number)}
                        disabled={!isClickable}
                        style={{
                          width: 44, height: 44, borderRadius: '50%',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          border: isActive    ? `2.5px solid ${purple}`
                                : isCompleted ? `2.5px solid ${green}`
                                : '2.5px solid #e5e7eb',
                          background: isActive    ? purpleLt
                                    : isCompleted ? greenLt
                                    : 'var(--panel-bg,white)',
                          color: isActive    ? purple
                               : isCompleted ? green
                               : '#d1d5db',
                          cursor: isClickable ? 'pointer' : 'default',
                          transition: 'all 0.2s',
                          boxShadow: isActive ? `0 0 0 4px ${purpleBd}` : 'none',
                          flexShrink: 0,
                        }}
                      >
                        {isCompleted
                          ? <CheckCircle size={20} />
                          : <Icon size={18} />
                        }
                      </button>

                      {/* Label */}
                      <div style={{ marginTop: 8, textAlign: 'center', padding: '0 4px' }}>
                        <p style={{
                          fontSize: '0.72rem', fontWeight: 700, margin: 0, lineHeight: 1.2,
                          color: isActive    ? purple
                               : isCompleted ? green
                               : '#9ca3af',
                          whiteSpace: 'nowrap',
                        }}>
                          {step.title}
                        </p>
                        <p style={{ fontSize: '0.65rem', color: '#9ca3af', margin: '2px 0 0', display: 'none' }}
                          className="step-desc">
                          {step.description}
                        </p>
                      </div>
                    </div>

                    {/* Connector */}
                    {index < steps.length - 1 && (
                      <div style={{
                        flex: 1, height: 2, marginTop: 21, borderRadius: 2,
                        background: isCompleted ? green : '#e5e7eb',
                        transition: 'background 0.3s',
                        minWidth: 12,
                      }} />
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            {/* Current step subtitle */}
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border,#f3f4f6)', display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:'0.72rem', fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.06em' }}>
                Step {currentStep} of {totalSteps}
              </span>
              <span style={{ width:4, height:4, borderRadius:'50%', background:'#d1d5db', display:'inline-block' }} />
              <span style={{ fontSize:'0.82rem', fontWeight:700, color: purple }}>
                {currentStepMeta?.title}
              </span>
              <span style={{ fontSize:'0.8rem', color:'#9ca3af' }}>
                — {currentStepMeta?.description}
              </span>
            </div>
          </div>

          {/* ── Error Banner ─────────────────────────────────────────────── */}
          {error && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 12,
              background: 'rgba(239,68,68,0.06)', border: '1.5px solid rgba(239,68,68,0.25)',
              borderRadius: 12, padding: '14px 16px', marginBottom: 20,
            }}>
              <AlertCircle size={18} color="#ef4444" style={{ flexShrink:0, marginTop:1 }} />
              <p style={{ fontSize: '0.85rem', color: '#ef4444', margin: 0, fontWeight:500 }}>{error}</p>
            </div>
          )}

          {/* ── Step Content Card ────────────────────────────────────────── */}
          <div
            key={currentStep}
            className="rq-step-content"
            style={{
              background: 'var(--panel-bg,white)',
              borderRadius: 20,
              boxShadow: '0 4px 24px rgba(0,0,0,0.07)',
              border: '1px solid var(--border,#f3f4f6)',
              padding: '28px 28px',
              marginBottom: 20,
              position: 'relative',
            }}
          >
            {renderStep()}
          </div>

          {/* ── Navigation ───────────────────────────────────────────────── */}
          <div style={{
            background: 'var(--panel-bg,white)',
            borderRadius: 16,
            boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
            border: '1px solid var(--border,#f3f4f6)',
            padding: '16px 24px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            {/* Back */}
            {currentStep > 1 ? (
              <Btn
                variant="outline"
                onClick={prevStep}
                disabled={submitting}
                icon={<ArrowLeft size={15} />}
              >
                Back
              </Btn>
            ) : (
              <div style={{ minWidth: 120 }} />
            )}

            {/* Step dots */}
            <div style={{ display:'flex', gap:6 }}>
              {steps.map(s => (
                <div key={s.number} style={{
                  width: currentStep === s.number ? 20 : 7,
                  height: 7, borderRadius: 99,
                  background: currentStep === s.number ? purple
                            : currentStep > s.number  ? greenBd
                            : '#e5e7eb',
                  transition: 'all 0.25s',
                }} />
              ))}
            </div>

            {/* Next / Submit */}
            {currentStep < totalSteps ? (
              <Btn
                variant="primary"
                onClick={nextStep}
                disabled={submitting}
                icon={<ArrowRight size={15} />}
              >
                Next
              </Btn>
            ) : (
              <Btn
                variant="primary"
                onClick={handleSubmit}
                disabled={submitting}
                icon={submitting
                  ? <div style={{ width:15, height:15, border:`2px solid rgba(255,255,255,0.3)`, borderTopColor:'white', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
                  : <CheckCircle size={15} />
                }
              >
                {submitting ? 'Submitting…' : 'Submit Request'}
              </Btn>
            )}
          </div>

          {/* Help text */}
          <p style={{ textAlign:'center', fontSize:'0.78rem', color:'#9ca3af', marginTop:20 }}>
            Need help? Email us at{' '}
            <a href="mailto:quotes@ropeengineering.co.ke" style={{ color:purple, fontWeight:600, textDecoration:'none' }}>
              quotes@ropeengineering.co.ke
            </a>
          </p>
        </div>
      </div>
    </>
  );
};

export default RequestQuote;