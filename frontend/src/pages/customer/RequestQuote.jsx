import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  FileText, 
  Package, 
  Wrench, 
  Upload, 
  CheckCircle,
  ArrowLeft,
  ArrowRight
} from 'lucide-react';
import Header from '../../components/layout/Header';
import useQuoteRequestStore from '../../store/quoteRequestStore';
import useServiceStore from '../../store/serviceStore';
import useProductStore from '../../store/productStore';
import useQuoteListStore from '../../store/quoteListStore';
import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/common/Button';
import LoadingSpinner from '../../components/layout/LoadingSpinner';

// Step Components
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
/**
 * RequestQuote Page
 * Multi-step wizard for creating quote requests
 */
const RequestQuote = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  const { submitting, error, createQuoteRequestWithFiles, clearError } = useQuoteRequestStore();
  const { fetchServices } = useServiceStore();
  const { fetchProducts } = useProductStore();
  const { items: quoteListItems, clearList: clearQuoteList } = useQuoteListStore();

  // Wizard state
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 4;

  // Form data
  const [formData, setFormData] = useState({
    // Step 1: Basic Info
    request_title: '',
    request_description: '',
    request_type: 'not_sure', // Will be auto-detected based on items
    budget_range: '',
    timeline_needed: '',

    // Step 2: Items
    selectedProducts: [], // { product_id, product, quantity, notes, is_custom, custom_details }
    selectedServices: [], // { service_id, service, quantity, estimated_hours, notes, is_custom, specifications, unit_of_measure, lead_time, custom_details }

    // Step 3: Additional Details
    delivery_location: '',
    customer_notes: '',
    attachments: [], // File objects
  });

  // Pre-select service if coming from service detail page
  useEffect(() => {
    const preselectedService = location.state?.preselectedService;
    const fromQuoteList      = location.state?.fromQuoteList;

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

    if (fromQuoteList && quoteListItems.length > 0) {
      const prefilledProducts = [];
      const prefilledServices = [];

      quoteListItems.forEach((listItem) => {
        // The store saves everything as { product: <obj>, quantity, notes }
        // Distinguish by the presence of service-specific fields
        const item    = listItem.service ?? listItem.product;
        const qty     = listItem.quantity ?? 1;
        const notes   = listItem.notes || '';
        const isService = !!(item?.pricing_model || item?.hourly_rate != null || item?.daily_rate != null || item?.requires_site_visit != null || item?.is_remote_available != null);

        if (!item) return;

        if (isService) {
          prefilledServices.push({
            service_id: item.id,
            service: item,
            quantity: qty,
            estimated_hours: null,
            notes,
            is_custom: false,
            specifications: '',
            unit_of_measure: item.unit_of_measure ?? 'hour',
            lead_time: item.lead_time ?? '',
            budget_per_unit: item.price_is_negotiable ? null : (
              item.hourly_rate ?? item.daily_rate ?? item.base_price ?? null
            ),
          });
        } else {
          prefilledProducts.push({
            product_id: item.id,
            product: item,
            quantity: qty,
            notes,
            is_custom: false,
            specifications: '',
            unit_of_measure: null,
            lead_time: null,
            budget_per_unit: item.price_is_negotiable ? null : Number(item.price ?? 0),
          });
        }
      });

      const totalItems = prefilledProducts.length + prefilledServices.length;

      setFormData(prev => ({
        ...prev,
        selectedProducts: prefilledProducts,
        selectedServices: prefilledServices,
        request_title: prev.request_title || `Quote request for ${totalItems} item${totalItems !== 1 ? 's' : ''}`,
      }));

      clearQuoteList();
    }
  }, [location.state]);

  // Fetch products and services for selection
  useEffect(() => {
    fetchServices();
    fetchProducts();
  }, []);

  // Steps configuration
  const steps = [
    {
      number: 1,
      title: 'Basic Information',
      icon: FileText,
      description: 'Tell us what you need',
    },
    {
      number: 2,
      title: 'Select Items',
      icon: Package,
      description: 'Choose products and services',
    },
    {
      number: 3,
      title: 'Additional Details',
      icon: Upload,
      description: 'Location and attachments',
    },
    {
      number: 4,
      title: 'Review & Submit',
      icon: CheckCircle,
      description: 'Review your request',
    },
  ];

  // Update form data
  const updateFormData = (updates) => {
    setFormData(prev => ({ ...prev, ...updates }));
  };

  // Auto-detect request type based on selected items
  useEffect(() => {
    const hasProducts = formData.selectedProducts.length > 0;
    const hasServices = formData.selectedServices.length > 0;

    let requestType = 'not_sure';
    if (hasProducts && hasServices) {
      requestType = 'mixed';
    } else if (hasProducts) {
      requestType = 'product';
    } else if (hasServices) {
      requestType = 'service';
    }

    if (requestType !== formData.request_type) {
      updateFormData({ request_type: requestType });
    }
  }, [formData.selectedProducts, formData.selectedServices]);

  // Navigation
  const goToStep = (step) => {
    if (step >= 1 && step <= totalSteps) {
      setCurrentStep(step);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const nextStep = () => {
    if (validateCurrentStep()) {
      goToStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    goToStep(currentStep - 1);
  };

  // Validation
  const validateCurrentStep = () => {
    clearError();

    switch (currentStep) {
      case 1:
        if (!formData.request_title.trim()) {
          alert('Please enter a request title');
          return false;
        }
        if (!formData.request_description.trim()) {
          alert('Please enter a description');
          return false;
        }
        return true;

      case 2:
        if (formData.selectedProducts.length === 0 && formData.selectedServices.length === 0) {
          alert('Please select at least one product or service');
          return false;
        }
        return true;

      case 3:
        // Optional step - always valid
        return true;

      default:
        return true;
    }
  };
  const getServiceUnitPrice = (service) => {
    if (!service) return null;
    if (service.price_is_negotiable) return null;

    switch (service.pricing_model) {
      case 'hourly': return service.hourly_rate ?? null;
      case 'daily': return service.daily_rate ?? null;
      case 'fixed':
      case 'project_based':
      case 'subscription':
        return service.base_price ?? null;
      default:
        return service.base_price ?? service.hourly_rate ?? service.daily_rate ?? null;
    }
  };

  // Submit
  const handleSubmit = async () => {
    try {
      // Build requested_items array
      const requestedItems = [
        // Products
        ...formData.selectedProducts.map(item => ({
          item_type: item.is_custom ? 'custom_product' : 'product',
          product_id: item.is_custom ? null : item.product_id,
          description: item.is_custom 
            ? item.custom_details.description 
            : item.product?.name,
          quantity: item.quantity || 1,
          //specifications: item.is_custom ? item.custom_details.specifications : null,
          specifications: item.is_custom
          ? (item.custom_details.specifications ?? null)
          : (item.specifications ?? null),
          budget_per_unit: item.is_custom
          ? (item.custom_details.budget ?? item.budget_per_unit ?? null)
          : (item.budget_per_unit ?? item.product?.price ?? null),
          notes: item.notes,
          unit_of_measure: item.is_custom
            ? (item.custom_details.unit_of_measure ?? null)
            : (item.unit_of_measure ?? null),

          lead_time: item.is_custom
            ? (item.custom_details.lead_time ?? null)
            : (item.lead_time ?? null),
        })),
        
        // Services
        ...formData.selectedServices.map(item => ({
          item_type: item.is_custom ? 'custom_service' : 'service',
          service_id: item.is_custom ? null : item.service_id,
          description: item.is_custom 
            ? item.custom_details.description 
            : item.service?.name,
          quantity: item.quantity || 1,
          estimated_hours: item.is_custom
          ? (item.custom_details.estimated_hours ?? item.estimated_hours ?? null)
          : (item.estimated_hours ?? null),
          specifications: item.is_custom
          ? (item.custom_details.specifications ?? null)
          : (item.specifications ?? null),
          //specifications: item.is_custom ? item.custom_details.specifications : null,
          budget_per_unit: item.is_custom
          ? (item.custom_details.budget ?? item.budget_per_unit ?? null)
          : (item.budget_per_unit ?? getServiceUnitPrice(item.service)),
          unit_of_measure: item.is_custom
          ? (item.custom_details.unit_of_measure ?? null)
          : (item.unit_of_measure ?? null),

        lead_time: item.is_custom
          ? (item.custom_details.lead_time ?? null)
          : (item.lead_time ?? null),
          notes: item.notes,
        })),
      ];

      // Prepare data
      const data = {
        request_title: formData.request_title,
        request_description: formData.request_description,
        request_type: formData.request_type,
        requested_items: requestedItems,
        budget_range: formData.budget_range || null,
        timeline_needed: formData.timeline_needed || null,
        delivery_location: formData.delivery_location || null,
        customer_notes: formData.customer_notes || null,
      };

      // Submit with files
      await createQuoteRequestWithFiles(data, formData.attachments);

      // Success - navigate to my requests
      navigate('/my-quote-requests', {
        state: { 
          message: 'Quote request submitted successfully! We will review it and get back to you soon.' 
        }
      });

    } catch (err) {
      console.error('Failed to submit quote request:', err);
      // Error is handled by store
    }
  };

  // Render current step
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />
      {/* ── Page Header ───────────────────────────────────────────────── */}
      <div style={{
        position: 'relative', overflow: 'hidden',
        borderBottom: '1px solid var(--border,#a855f7)',
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
            <h1 style={{ fontSize:'1.5rem', fontWeight:900, color:'#a855f7', margin:'0 0 4px', letterSpacing:'-0.025em' }}>
              Request a Quote
            </h1>
            <p style={{ fontSize:'0.875rem', color:'#6b7280', margin:0 }}>
              Tell us what you need and we'll get back to you with a custom quote
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Progress Steps */}
        <div className="mb-8">
          <div>
            
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
              </div>
          </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <p className="text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        {/* Current Step Content */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
          {renderStep()}
        </div>

        {/* Navigation Buttons */}
        <div className="flex items-center justify-between">
          {/* Back Button */}
          <Btn
            variant="outline"
            onClick={prevStep}
            disabled={currentStep === 1 || submitting}
            className="flex items-center"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Btn>

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

          {/* Next/Submit Button */}
          {currentStep < totalSteps ? (
            <Btn
              variant="primary"
              onClick={nextStep}
              disabled={submitting}
              className="flex items-center"
            >
              Next
              <ArrowRight className="w-4 h-4 ml-2" />
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

        {/* Help Text */}
        <div className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
          Need help? Contact us at <a href="mailto:quotes@ropeengineering.co.ke" className="text-primary-600 hover:underline">quotes@ropeengineering.co.ke</a>
        </div>
      </div>
    </div>
    </>
  );
};

export default RequestQuote;