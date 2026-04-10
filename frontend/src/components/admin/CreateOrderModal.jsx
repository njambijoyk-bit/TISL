import { useState, useEffect } from 'react';
import {
  X, Plus, Trash2, AlertCircle, RefreshCw,
  Package, Wrench, Tag, ArrowUp, ArrowDown,
  ChevronDown, ChevronUp, DollarSign, Percent,
  UserCheck, MapPin, FileText, ShieldCheck,
  Settings, CheckCircle, Info,
} from 'lucide-react';
import ProductSelectorModal from '../quotes/request-wizard/ProductSelectorModal';
import ServiceSelectorModal from '../quotes/request-wizard/ServiceSelectorModal';
import CustomItemModal from '../quotes/request-wizard/CustomItemModal';
import PricingValidationModal from '../quotes/PricingValidationModal';
import PromoCodeInput from '../common/PromoCodeInput';
import usePromoCodeStore from '../../store/promoCodeStore';
import currencyAPI from '../../api/currency';
import api from '../../api/axios';
import toast from 'react-hot-toast';

// ── Design tokens ─────────────────────────────────────────────────────────────
const purple   = '#a855f7';
const purpleDk = '#7c3aed';
const purpleLt = 'rgba(168,85,247,0.07)';
const purpleBd = 'rgba(168,85,247,0.2)';

// ── Input base ────────────────────────────────────────────────────────────────
const iBase = {
  width: '100%', padding: '9px 12px', borderRadius: 10,
  border: '1.5px solid #e5e7eb', fontSize: '0.82rem', outline: 'none',
  color: '#111827', boxSizing: 'border-box', fontWeight: 500,
  background: 'white', transition: 'border-color 0.15s, box-shadow 0.15s',
};
const fIn  = e => { e.currentTarget.style.borderColor = purple;    e.currentTarget.style.boxShadow = `0 0 0 3px ${purpleLt}`; };
const fOut = e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = 'none'; };

// ── Atoms ─────────────────────────────────────────────────────────────────────
const labelStyle   = { display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 };
const sectionStyle = { marginBottom: 26 };
const Req          = () => <span style={{ color: '#ef4444' }}>*</span>;

const SectionTitle = ({ children, icon: Icon }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 14 }}>
    {Icon && <Icon size={13} color={purple} />}
    <p style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', color: purple, margin: 0 }}>{children}</p>
  </div>
);

const Field = ({ label, required, children, hint, error }) => (
  <div>
    {label && <label style={labelStyle}>{label}{required && <> <Req /></>}</label>}
    {children}
    {error && <p style={{ fontSize: '0.72rem', color: '#ef4444', marginTop: 4 }}>{error}</p>}
    {hint && !error && <p style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 4 }}>{hint}</p>}
  </div>
);

const PrefixInput = ({ prefix, style: extraStyle, ...props }) => (
  <div style={{ position: 'relative' }}>
    {prefix && (
      <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: '0.72rem', color: '#9ca3af', fontWeight: 600, pointerEvents: 'none', zIndex: 1 }}>
        {prefix}
      </span>
    )}
    <input {...props} style={{ ...iBase, paddingLeft: prefix ? 40 : 12, ...extraStyle }}
      onFocus={fIn} onBlur={fOut} />
  </div>
);

const Checkbox = ({ id, checked, onChange, label, disabled }) => (
  <label htmlFor={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, cursor: disabled ? 'not-allowed' : 'pointer', userSelect: 'none' }}>
    <div style={{ width: 17, height: 17, borderRadius: 5, flexShrink: 0, background: checked ? purple : 'white', border: `2px solid ${checked ? purple : '#d1d5db'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s', opacity: disabled ? 0.5 : 1 }}>
      {checked && <CheckCircle size={10} color="white" />}
    </div>
    <input type="checkbox" id={id} checked={checked} onChange={onChange} disabled={disabled} style={{ display: 'none' }} />
    <span style={{ fontSize: '0.82rem', color: '#374151', fontWeight: 500 }}>{label}</span>
  </label>
);

// ── Dropdown constants ────────────────────────────────────────────────────────
const PRODUCT_UNITS  = ['each','unit','piece','box','pack','set','dozen','kg','g','liter','ml','meter','cm','sqm','sqft'];
const SERVICE_UNITS  = ['hour','day','week','month','session','visit','project','job','each'];
const FEE_UNITS      = ['one-time','per_transaction','per_user','per_month','per_year','per_project','per_item','flat_rate','each'];

const DELIVERY_OPTS   = [['pickup','Pickup (Free)'],['standard_delivery','Standard Delivery'],['express_delivery','Express Delivery'],['courier','Courier']];
const PRIORITY_OPTS   = [['low','Low'],['medium','Medium'],['high','High'],['urgent','Urgent']];
const ORDER_TYPE_OPTS = [['standard','Standard'],['quotation','Quotation'],['bulk','Bulk'],['b2b','B2B'],['service','Service'],['mixed','Mixed'],['project','Project'],['subscription','Subscription']];
const PAY_STATUS_OPTS = [['unpaid','Unpaid'],['partially_paid','Partially Paid'],['paid','Paid']];
const PAY_METHOD_OPTS = [['request_invoice','Request Invoice'],['pay_on_delivery','Pay on Delivery'],['mpesa','M-Pesa'],['bank_transfer','Bank Transfer'],['credit_card','Credit Card'],['credit','Credit']];
const BILLING_OPTS    = [['','Not specified'],['one_time','One Time'],['milestone_based','Milestone Based'],['monthly','Monthly'],['hourly','Hourly'],['fixed_price','Fixed Price']];


const fmt     = (n, d = 2) => new Intl.NumberFormat('en-KE', { minimumFractionDigits: d, maximumFractionDigits: d }).format(Number(n || 0));
const fmtRate = (n)        => new Intl.NumberFormat('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 8 }).format(Number(n || 0));

// ── Blank item factory ────────────────────────────────────────────────────────
const blankItem = (order = 0) => ({
  item_type: 'product', is_custom_item: false,
  description: '', product_name: '', product_sku: '', brand_name: '', product_image: '',
  service_name: '', service_description: '', service_category: '',
  quantity: 1, unit_of_measure: 'each',
  unit_price: 0, original_price: 0,
  discount_amount: 0, line_total: 0, line_total_after_discount: 0,
  backorder_quantity: 0,
  allow_backorder: false,
  is_taxable: true, is_bulk_pricing: false, is_negotiated_price: false,
  requires_site_visit: false,
  estimated_hours: '', hourly_rate: '', labor_cost: '', material_cost: '',
  estimated_duration: '', scheduled_start_date: '', scheduled_end_date: '',
  pricing_notes: '', notes: '', prerequisites: '',
  variant_details: null, custom_item_details: null,
  product_id: null, service_id: null, quote_item_id: null,
  display_order: order,
});

const calcItemPricing = (item) => {
  const qty  = parseFloat(item.quantity)       || 0;
  const orig = parseFloat(item.original_price) || 0;
  const unit = parseFloat(item.unit_price)     || 0;
  return {
    line_total:                qty * orig,
    discount_amount:           (orig - unit) * qty,
    line_total_after_discount: qty * unit,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
export default function CreateOrderModal({ isOpen, onClose, onSuccess, editMode = false, initialData = null }) {

  // ── Customer ──────────────────────────────────────────────────────────────
  const [customerSearch,   setCustomerSearch]   = useState('');
  const [customers,        setCustomers]        = useState([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [customerId,       setCustomerId]       = useState('');

  // ── Currency ──────────────────────────────────────────────────────────────
  const [currencyOptions,   setCurrencyOptions]   = useState([]);
  const [loadingCurrencies, setLoadingCurrencies] = useState(false);
  const [currency,          setCurrency]          = useState('KES');

  // ── Items ─────────────────────────────────────────────────────────────────
  const [orderItems,    setOrderItems]    = useState([blankItem(0)]);
  const [expandedItems, setExpandedItems] = useState({});

  // ── Selectors / modals ────────────────────────────────────────────────────
  const [showProductSelector, setShowProductSelector] = useState(false);
  const [showServiceSelector, setShowServiceSelector] = useState(false);
  const [showCustomModal,     setShowCustomModal]     = useState(null);
  const [showPricingModal,    setShowPricingModal]    = useState(false);
  const [pricingErrors,       setPricingErrors]       = useState([]);

  // ── Order-level fields ────────────────────────────────────────────────────
  const [deliveryMethod,   setDeliveryMethod]   = useState('standard_delivery');
  const [shippingAddress,  setShippingAddress]  = useState('');
  const [billingAddress,   setBillingAddress]   = useState('');
  const [billingSame,      setBillingSame]       = useState(true);
  const [priority,         setPriority]         = useState('medium');
  const [orderType,        setOrderType]        = useState('standard');
  const [billingSchedule,  setBillingSchedule]  = useState('');
  const [projectName,      setProjectName]      = useState('');
  const [serviceStartDate, setServiceStartDate] = useState('');
  const [serviceEndDate,   setServiceEndDate]   = useState('');
  const [customerNotes,    setCustomerNotes]    = useState('');
  const [adminNotes,       setAdminNotes]       = useState('');
  const [paymentStatus,    setPaymentStatus]    = useState('unpaid');
  const [paymentMethod,    setPaymentMethod]    = useState('request_invoice');
  const [paymentReference, setPaymentReference] = useState('');
  const [applyTax,         setApplyTax]         = useState(true);
  const [shippingCost,     setShippingCost]     = useState(0);

  // ── Discounts ─────────────────────────────────────────────────────────────
  const [useDiscountPct, setUseDiscountPct] = useState(false);
  const [orderDiscount,  setOrderDiscount]  = useState(0);
  const [discountPct,    setDiscountPct]    = useState(0);

  const { appliedPromo, clearPromo, adminApplyPromoCode } = usePromoCodeStore();

  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  // ── Load on open ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen) { loadCustomers(); loadCurrencies(); }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !editMode || !initialData) return;

    setCustomerId(String(initialData.customer_id || ''));
    if (initialData.currency) setCurrency(initialData.currency);

    setDeliveryMethod(initialData.delivery_method || 'standard_delivery');
    setShippingAddress(initialData.shipping_address || '');
    setBillingAddress(initialData.billing_address || '');
    setBillingSame(initialData.billing_same_as_shipping == null ? true : Boolean(Number(initialData.billing_same_as_shipping)));
    setPriority(initialData.priority || 'medium');
    setOrderType(initialData.order_type || 'standard');
    setBillingSchedule(initialData.billing_schedule || '');
    setProjectName(initialData.project_name || '');
    setServiceStartDate(initialData.service_start_date?.slice(0, 10) || '');
    setServiceEndDate(initialData.service_end_date?.slice(0, 10) || '');
    setCustomerNotes(initialData.customer_notes || '');
    setAdminNotes('');
    setPaymentStatus(initialData.payment_status || 'unpaid');
    setPaymentMethod(initialData.payment_method || 'request_invoice');
    setPaymentReference(initialData.payment_reference || '');
    setApplyTax(Number(initialData.tax) > 0);
    setShippingCost(Number(initialData.shipping_cost || 0));
    setOrderDiscount(Number(initialData.discount || 0));
    if (Number(initialData.subtotal || 0) > 0) {
      setDiscountPct(((Number(initialData.discount || 0) / Number(initialData.subtotal)) * 100).toFixed(3));
    }

    if (initialData.items?.length) {
      const mapped = initialData.items.map((oi, idx) => {
        const unitPrice = parseFloat(oi.unit_price  || 0);
        const qty       = parseFloat(oi.quantity    || 1);
        const discAmt   = parseFloat(oi.discount_amount || 0);
        // Reverse-compute original (list) price from the stored signed discount
        // line_total = line_total_after_discount + discount_amount
        // => qty × origPrice = qty × unitPrice + discAmt
        // => origPrice = unitPrice + discAmt / qty
        const origPrice = qty > 0 ? unitPrice + discAmt / qty : unitPrice;

        const itemType = oi.item_type || 'product';
        const isService = itemType === 'service' || itemType === 'custom_service';
        const isFee     = itemType === 'fee';

        // Safely coerce DB tinyint (0/1) or JS boolean to boolean
        const toBool = (v, fallback = false) =>
          v == null ? fallback : Boolean(Number(v));

        const defaultUnit = isService ? 'hour' : isFee ? 'one-time' : 'each';

        return {
          ...blankItem(idx),

          // Identity
          product_id:           oi.product_id   || null,
          service_id:           oi.service_id   || null,
          quote_item_id:        oi.quote_item_id || null,
          display_order:        oi.display_order ?? idx,

          // Type
          item_type:            itemType,
          is_custom_item:       toBool(oi.is_custom_item),

          // Names / descriptions
          description:          oi.product_name || oi.service_name || oi.description || '',
          product_name:         oi.product_name         || '',
          product_sku:          oi.product_sku          || '',
          brand_name:           oi.brand_name           || '',
          product_image:        oi.product_image        || '',
          service_name:         oi.service_name         || '',
          service_description:  oi.service_description  || '',
          service_category:     oi.service_category     || '',

          // Quantity & unit
          quantity:             qty,
          unit_of_measure:      oi.unit_of_measure || defaultUnit,

          // Pricing
          unit_price:                unitPrice,
          original_price:            origPrice,
          discount_amount:           discAmt,
          line_total:                parseFloat(oi.line_total                 || 0),
          line_total_after_discount: parseFloat(oi.line_total_after_discount  || 0),
          backorder_quantity:        parseFloat(oi.backorder_quantity          || 0),

          // Boolean flags — all coerced safely from DB tinyint or JS bool
          is_taxable:           toBool(oi.is_taxable,           true),  // default true
          is_bulk_pricing:      toBool(oi.is_bulk_pricing,      false),
          is_negotiated_price:  toBool(oi.is_negotiated_price,  false),
          requires_site_visit:  toBool(oi.requires_site_visit,  false),
          allow_backorder:      toBool(oi.allow_backorder,       false),

          // Service detail fields — always strings for controlled inputs
          estimated_hours:      oi.estimated_hours      != null ? String(oi.estimated_hours)      : '',
          hourly_rate:          oi.hourly_rate           != null ? String(oi.hourly_rate)           : '',
          labor_cost:           oi.labor_cost            != null ? String(oi.labor_cost)            : '',
          material_cost:        oi.material_cost         != null ? String(oi.material_cost)         : '',
          estimated_duration:   oi.estimated_duration    || '',
          scheduled_start_date: oi.scheduled_start_date?.slice(0, 10) || '',
          scheduled_end_date:   oi.scheduled_end_date?.slice(0, 10)   || '',

          // Notes
          pricing_notes:        oi.pricing_notes   || '',
          notes:                oi.notes           || '',
          prerequisites:        oi.prerequisites   || '',

          // JSON blobs
          variant_details:      oi.variant_details     || null,
          custom_item_details:  oi.custom_item_details  || null,
        };
      });
      setOrderItems(mapped);
    }
  }, [isOpen, editMode, initialData]);

  const loadCustomers = async () => {
    setLoadingCustomers(true);
    try { const r = await api.get('/admin/customers'); setCustomers(r.data.data || r.data); }
    catch (e) { console.error(e); }
    finally   { setLoadingCustomers(false); }
  };

  const loadCurrencies = async () => {
    setLoadingCurrencies(true);
    try {
      const data   = await currencyAPI.getCurrencies();
      const active = (data || []).filter(c => c.is_active).map(c => ({
        value: c.code, label: `${c.name} (${c.code})`, symbol: c.symbol,
        is_base: c.is_base, conversion_rate: Number(c.conversion_rate),
        anchor_rate: Number(c.anchor_rate), updated_at: c.updated_at ?? null,
      }));
      setCurrencyOptions(active);
      if (!active.some(c => c.value === currency)) {
        const base = active.find(c => c.is_base);
        setCurrency(base?.value || active[0]?.value || 'KES');
      }
    } catch { toast.error('Failed to load currencies'); }
    finally { setLoadingCurrencies(false); }
  };

  // ── Currency helpers ──────────────────────────────────────────────────────
  const selectedCurrency = currencyOptions.find(c => c.value === currency);
  const isBaseCurrency   = !!selectedCurrency?.is_base || currency === 'KES';
  const exchangeRate     = !isBaseCurrency ? Number(selectedCurrency?.conversion_rate || 0) : 1;
  const showKes          = !isBaseCurrency && exchangeRate > 0;
  const csMap            = { KES: 'KSh', USD: '$', EUR: '€', GBP: '£' };
  const cs               = csMap[currency] || currency;
  const money            = (v) => `${cs} ${fmt(v)}`;
  const kesMoney         = (v) => `KSh ${fmt(v)}`;
  const toKes            = (v) => Number(v || 0) * exchangeRate;

  const filteredCustomers = customers.filter(c =>
    `${c.first_name || ''} ${c.last_name || ''} ${c.email || ''}`
      .toLowerCase().includes(customerSearch.toLowerCase())
  );

  // ── Totals ────────────────────────────────────────────────────────────────
  const validItems      = orderItems.filter(i => i.description || i.product_id || i.service_id);
  const validItemCount  = validItems.length;
  const itemsSubtotal   = validItems.reduce((s, i) => s + (parseFloat(i.line_total_after_discount) || 0), 0);
  const totalItemDisc   = validItems.reduce((s, i) => s + (parseFloat(i.discount_amount) || 0), 0);
  const origTotal       = validItems.reduce((s, i) => s + (parseFloat(i.line_total) || 0), 0);
  
  const promoDiscountAmt = appliedPromo?.discount ?? 0;
  const afterOrderDisc   = itemsSubtotal - (parseFloat(orderDiscount) || 0) - promoDiscountAmt;
  const taxAmount        = applyTax ? afterOrderDisc * 0.16 : 0;
  const shipping         = parseFloat(shippingCost) || 0;
  const grandTotal       = afterOrderDisc + taxAmount + shipping;
  const totalSavings     = totalItemDisc + (parseFloat(orderDiscount) || 0) + promoDiscountAmt;
  

  // ── Discount sync ─────────────────────────────────────────────────────────
  const handleDiscountChange = (field, value) => {
    if (field === 'pct') {
      setDiscountPct(value);
      setOrderDiscount((itemsSubtotal * parseFloat(value || 0)) / 100);
    } else {
      setOrderDiscount(value);
      if (itemsSubtotal > 0)
        setDiscountPct(((parseFloat(value || 0) / itemsSubtotal) * 100).toFixed(3));
    }
  };

  // ── Item helpers ──────────────────────────────────────────────────────────
  const updateItem = (index, field, value) => {
    const items = [...orderItems];
    items[index] = { ...items[index], [field]: value };
    if (['quantity', 'original_price', 'unit_price'].includes(field))
      Object.assign(items[index], calcItemPricing(items[index]));
    if (field === 'item_type') {
      items[index].unit_of_measure =
        (value === 'service' || value === 'custom_service') ? 'hour'
        : value === 'fee' ? 'one-time'
        : 'each';
      items[index].is_custom_item = value.startsWith('custom') || value === 'fee';
    }
    setOrderItems(items);
  };

  const removeItem = (i) => {
    const items = orderItems.filter((_, idx) => idx !== i);
    setOrderItems(items.length > 0 ? items : [blankItem(0)]);
    toast.success('Item removed');
  };

  const moveItem = (index, dir) => {
    const items  = [...orderItems];
    const target = dir === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target], items[index]];
    items.forEach((item, idx) => { item.display_order = idx; });
    setOrderItems(items);
  };

  // ── Selector callbacks ────────────────────────────────────────────────────
  const handleProductsSelected = (products) => {
    const existingIds = orderItems.filter(i => i.product_id).map(i => i.product_id);
    const fresh = products.filter(p => !existingIds.includes(p.id));
    if (!fresh.length) {
      toast.error('All selected products are already in the list');
      setShowProductSelector(false); return;
    }
    const maxOrder = orderItems.length > 0 ? Math.max(...orderItems.map(i => i.display_order || 0)) : -1;
    setOrderItems(prev => [
      ...prev.filter(i => i.product_id || i.service_id || i.description),
      ...fresh.map((p, idx) => {
        const price = parseFloat(p.price) || 0;
        return {
          ...blankItem(maxOrder + idx + 1),
          item_type: 'product', description: p.name, product_name: p.name,
          product_sku: p.sku || '', brand_name: p.brand || '',
          product_image: p.image || p.thumbnail || '',
          original_price: price, unit_price: price,
          line_total: price, line_total_after_discount: price,
          product_id: p.id,
        };
      }),
    ]);
    toast.success(`Added ${fresh.length} product${fresh.length > 1 ? 's' : ''}`);
    setShowProductSelector(false);
  };

  const handleServicesSelected = (services) => {
    const existingIds = orderItems.filter(i => i.service_id).map(i => i.service_id);
    const fresh = services.filter(s => !existingIds.includes(s.id));
    if (!fresh.length) {
      toast.error('All selected services are already in the list');
      setShowServiceSelector(false); return;
    }
    const maxOrder = orderItems.length > 0 ? Math.max(...orderItems.map(i => i.display_order || 0)) : -1;
    setOrderItems(prev => [
      ...prev.filter(i => i.product_id || i.service_id || i.description),
      ...fresh.map((s, idx) => {
        const price = parseFloat(s.price) || 0;
        return {
          ...blankItem(maxOrder + idx + 1),
          item_type: 'service', description: s.name, service_name: s.name,
          service_description: s.description || '',
          service_category: s.category || '',
          unit_of_measure: 'hour',
          original_price: price, unit_price: price,
          line_total: price, line_total_after_discount: price,
          service_id: s.id,
        };
      }),
    ]);
    toast.success(`Added ${fresh.length} service${fresh.length > 1 ? 's' : ''}`);
    setShowServiceSelector(false);
  };

  const handleCustomItemCreated = (customItem) => {
    const isService = customItem.type === 'service';
    const isFee     = customItem.type === 'fee';
    const qty       = parseFloat(customItem.quantity) || 1;
    const price     = parseFloat(customItem.price)    || 0;
    setOrderItems(prev => [
      ...prev.filter(i => i.product_id || i.service_id || i.description),
      {
        ...blankItem(prev.length),
        item_type:        isFee ? 'fee' : `custom_${customItem.type}`,
        is_custom_item:   true,
        description:      customItem.name || '',
        quantity:         qty,
        unit_of_measure:  customItem.unit_of_measure || (isService ? 'hour' : isFee ? 'one-time' : 'each'),
        original_price:   price, unit_price: price,
        line_total:       qty * price, line_total_after_discount: qty * price,
        notes:            customItem.notes         || '',
        pricing_notes:    customItem.pricing_notes || '',
        estimated_hours:  isService ? (customItem.estimated_hours  || '') : '',
        hourly_rate:      isService ? (customItem.hourly_rate      || '') : '',
        labor_cost:       isService ? (customItem.labor_cost       || '') : '',
        material_cost:    isService ? (customItem.material_cost    || '') : '',
        estimated_duration: isService ? (customItem.estimated_duration || '') : '',
        requires_site_visit: isService ? !!customItem.requires_site_visit : false,
      },
    ]);
    setShowCustomModal(null);
    toast.success('Custom item added');
  };

  // ── Pricing validation ────────────────────────────────────────────────────
  const validatePricing = () => {
    const errors = [];
    validItems.forEach((item, i) => {
      const o    = parseFloat(item.original_price) || 0;
      const u    = parseFloat(item.unit_price)     || 0;
      const desc = item.description || `Item ${i + 1}`;
      if (o === 0 || u === 0) {
        errors.push({ itemIndex: i, itemDescription: desc, originalPrice: o, unitPrice: u });
      } else if (u < o && ((o - u) / o) * 100 > 50) {
        errors.push({ itemIndex: i, itemDescription: desc, originalPrice: o, unitPrice: u, issueType: 'high_discount', discount_percent: ((o - u) / o) * 100 });
      } else if (u > o && ((u - o) / o) * 100 > 50) {
        errors.push({ itemIndex: i, itemDescription: desc, originalPrice: o, unitPrice: u, issueType: 'high_markup', markup_percent: ((u - o) / o) * 100 });
      }
    });
    return errors;
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!customerId)             return setError('Please select a customer');
    if (!shippingAddress.trim()) return setError('Please enter a shipping address');
    if (!validItemCount)         return setError('Please add at least one item');

    const pErrors = validatePricing();
    if (pErrors.length > 0) { setPricingErrors(pErrors); setShowPricingModal(true); return; }

    setLoading(true); setError('');
    try {
      await onSuccess({
        customer_id:       parseInt(customerId),
        currency,
        exchange_rate_to_kes: isBaseCurrency ? 1 : exchangeRate,
        delivery_method:   deliveryMethod,
        shipping_address:  shippingAddress,
        billing_address:   billingSame ? shippingAddress : billingAddress,
        billing_same_as_shipping: billingSame ? 1 : 0,
        priority,
        order_type:        orderType,
        billing_schedule:  billingSchedule || null,
        project_name:      projectName     || null,
        service_start_date: serviceStartDate || null,
        service_end_date:   serviceEndDate   || null,
        customer_notes:    customerNotes   || null,
        admin_notes:       adminNotes      || null,
        payment_status:    paymentStatus,
        payment_method:    paymentMethod,
        payment_reference: paymentReference || null,
        ...(appliedPromo ? { promo_code: appliedPromo.code } : {}),
        apply_tax:         applyTax,
        subtotal:          itemsSubtotal,
        subtotal_kes:      showKes ? toKes(itemsSubtotal) : itemsSubtotal,
        tax:               taxAmount,
        discount:          parseFloat(orderDiscount) || 0,
        shipping_cost:     shipping,
        total:             grandTotal,
        total_kes:         showKes ? toKes(grandTotal) : grandTotal,
        items: validItems.map((item, _idx) => {
          const qty       = parseFloat(item.quantity)       || 0;
          const unitPrice = parseFloat(item.unit_price)     || 0;
          const origPrice = parseFloat(item.original_price) || unitPrice;

          // Always recompute fresh — never trust stale derived state
          const lineAfter  = qty * unitPrice;               // net payable
          const discAmount = (origPrice - unitPrice) * qty; // positive = discount, negative = markup
          const lineTotal  = lineAfter + discAmount;         // gross ref = qty × origPrice

          return {
            // Identity
            item_type:            item.item_type,
            is_custom_item:       item.is_custom_item   ? 1 : 0,
            product_id:           item.product_id       || null,
            service_id:           item.service_id       || null,
            quote_item_id:        item.quote_item_id    || null,
            display_order:        item.display_order    ?? _idx,

            // Names
            product_name:         item.product_name     || item.description || null,
            product_sku:          item.product_sku      || null,
            brand_name: (typeof item.brand_name === 'object' && item.brand_name !== null)
                          ? item.brand_name.name
                          : item.brand_name             || null,
            product_image:        item.product_image    || null,
            service_name:         item.service_name     || null,
            service_description:  item.service_description || null,
            service_category:     item.service_category || null,
            description:          item.description      || null,

            // Quantity & unit
            quantity:             qty,
            unit_of_measure:      item.unit_of_measure  || 'each',
            backorder_quantity:   parseInt(item.backorder_quantity) || 0,
            allow_backorder:      item.allow_backorder   ? 1 : 0,

            // Pricing — always fresh-computed
            unit_price:                unitPrice,
            line_total:                lineTotal,
            discount_amount:           discAmount,
            line_total_after_discount: lineAfter,

            // Boolean flags — sent as 0/1 for Laravel
            is_taxable:           item.is_taxable           ? 1 : 0,
            is_bulk_pricing:      item.is_bulk_pricing       ? 1 : 0,
            is_negotiated_price:  item.is_negotiated_price   ? 1 : 0,
            requires_site_visit:  item.requires_site_visit   ? 1 : 0,

            // Service detail fields — null if blank/zero
            estimated_hours:      item.estimated_hours     ? parseFloat(item.estimated_hours)     : null,
            hourly_rate:          item.hourly_rate          ? parseFloat(item.hourly_rate)          : null,
            labor_cost:           item.labor_cost           ? parseFloat(item.labor_cost)           : null,
            material_cost:        item.material_cost        ? parseFloat(item.material_cost)        : null,
            estimated_duration:   item.estimated_duration   || null,
            scheduled_start_date: item.scheduled_start_date || null,
            scheduled_end_date:   item.scheduled_end_date   || null,

            // Notes
            pricing_notes:        item.pricing_notes        || null,
            notes:                item.notes                || null,
            prerequisites:        item.prerequisites        || null,

            // JSON blobs
            variant_details:      item.variant_details      || null,
            custom_item_details:  item.custom_item_details  || null,
          };
        }),
      });
      toast.success('Order created successfully');
      resetForm(); onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create order');
      setLoading(false);
    }
  };

  const resetForm = () => {
    setCustomerId(''); setOrderItems([blankItem(0)]); setExpandedItems({});
    setCurrency('KES'); setDeliveryMethod('standard_delivery');
    setShippingAddress(''); setBillingAddress(''); setBillingSame(true);
    setPriority('medium'); setOrderType('standard'); setBillingSchedule('');
    setProjectName(''); setServiceStartDate(''); setServiceEndDate('');
    setCustomerNotes(''); setAdminNotes('');
    setPaymentStatus('unpaid'); setPaymentMethod('request_invoice');
    setPaymentReference(''); setApplyTax(true); setShippingCost(0);
    setOrderDiscount(0); setDiscountPct(0); setUseDiscountPct(false);
    setError(''); setLoading(false); setPricingErrors([]); setShowPricingModal(false);
    clearPromo();
  };

  if (!isOpen) return null;

  const typeColor = (t) =>
    t === 'fee' ? '#6b7280'
    : (t === 'service' || t === 'custom_service') ? '#3b82f6'
    : purple;

  const TypeIcon = ({ type }) => {
    if (type === 'fee')                                  return <Tag    size={14} color="#6b7280" />;
    if (type === 'service' || type === 'custom_service') return <Wrench size={14} color="#3b82f6" />;
    return <Package size={14} color={purple} />;
  };

  const unitOptsFor = (t) =>
    t === 'fee' ? FEE_UNITS
    : (t === 'service' || t === 'custom_service') ? SERVICE_UNITS
    : PRODUCT_UNITS;

  return (
    <>
      <style>{`
        .com-backdrop {
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.52); backdrop-filter: blur(5px);
          display: flex; align-items: center; justify-content: center;
          z-index: 50; padding: 16px; overflow-y: auto;
        }
        .com-shell {
          border-radius: 20px; border: 1px solid #f3f4f6;
          box-shadow: 0 28px 80px rgba(0,0,0,0.18);
          width: 100%; max-width: 1400px;
          max-height: calc(100vh - 32px);
          overflow: hidden; background: white;
          display: flex; flex-direction: column;
          margin: auto;
        }
        /* Single-column layout — right panel always sits below */
        .com-body  { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow-y: auto; }
        .com-left  { padding: 24px 32px 28px; }
        .com-right {
          padding: 24px 32px 32px;
          display: flex; flex-direction: column; gap: 16px;
          background: rgba(249,250,251,0.6);
          border-top: 1px solid #f3f4f6;
        }
        .com-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .com-grid-3 { display: grid; grid-template-columns: repeat(3,1fr); gap: 14px; }
        .com-item-core { display: grid; grid-template-columns: 1fr 65px 105px 105px; gap: 9px; }
        .com-svc-grid  { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 9px; }
        .com-svc-dates { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; margin-top: 9px; }
        .com-notes-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .com-summary-cells { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; margin-top: 12px; }

        /* Right panel inner cards lay out horizontally on wider screens */
        @media (min-width: 860px) {
          .com-right { flex-direction: row; flex-wrap: wrap; align-items: flex-start; gap: 16px; }
          .com-right > * { flex: 1 1 260px; }
        }

        @media (max-width: 580px) {
          .com-shell { border-radius: 0; max-height: 100vh; }
          .com-backdrop { padding: 0; align-items: flex-start; }
          .com-left  { padding: 18px 16px 22px; }
          .com-right { padding: 20px 16px 32px; }
          .com-grid-2    { grid-template-columns: 1fr; }
          .com-grid-3    { grid-template-columns: 1fr; }
          .com-item-core { grid-template-columns: 1fr 1fr; }
          .com-svc-grid  { grid-template-columns: 1fr 1fr; }
          .com-svc-dates { grid-template-columns: 1fr; }
          .com-notes-grid { grid-template-columns: 1fr; }
        }
        @media (max-width: 380px) {
          .com-item-core { grid-template-columns: 1fr; }
          .com-svc-grid  { grid-template-columns: 1fr; }
          .com-summary-cells { grid-template-columns: 1fr 1fr; }
        }
      `}</style>

      {/* ── Backdrop ─────────────────────────────────────────────────────── */}
      <div className="com-backdrop" onClick={onClose}>
        {/* ── Modal shell ──────────────────────────────────────────────────── */}
        <div className="com-shell" onClick={e => e.stopPropagation()}>
          {/* Accent bar */}
          <div style={{ height: 3, background: `linear-gradient(90deg,${purple},${purpleDk})`, flexShrink: 0 }} />

          {/* ── Header ───────────────────────────────────────────────────── */}
          <div style={{ padding: '20px 28px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexShrink: 0, background: purpleLt }}>
            <div>
              <p style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#c084fc', marginBottom: 3 }}>Admin</p>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 900, color: purple, margin: 0 }}>
                {editMode ? `Edit Order` : 'Create Order'}
              </h2>
              <p style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: 3 }}>
                {editMode
                  ? `Editing ${initialData?.order_number} · Order number is preserved`
                  : 'Place an order on behalf of a customer'}
              </p>
            </div>
            <button onClick={onClose} disabled={loading} style={{ background: 'none', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', color: '#9ca3af', padding: 4, borderRadius: 8, display: 'flex' }}>
              <X size={20} />
            </button>
          </div>

          {/* ── Two-column body ───────────────────────────────────────────── */}
          <div className="com-body">

            {/* ─ LEFT: scrollable main form ─────────────────────────────── */}
            <div className="com-left">

              {/* Error */}
              {error && (
                <div style={{ display: 'flex', gap: 10, padding: '11px 15px', borderRadius: 10, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)', marginBottom: 20 }}>
                  <AlertCircle size={15} color="#ef4444" style={{ flexShrink: 0, marginTop: 1 }} />
                  <p style={{ fontSize: '0.82rem', color: '#b91c1c', margin: 0 }}>{error}</p>
                </div>
              )}

              {/* ── Customer ────────────────────────────────────────────── */}
              <div style={sectionStyle}>
                <SectionTitle icon={UserCheck}>Customer</SectionTitle>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input
                    placeholder="Search by name or email…"
                    value={customerSearch} onChange={e => setCustomerSearch(e.target.value)}
                    disabled={loadingCustomers || loading}
                    style={iBase} onFocus={fIn} onBlur={fOut}
                  />
                  <Field label="Select Customer" required>
                    <select value={customerId} onChange={e => setCustomerId(e.target.value)} disabled={loadingCustomers || loading}
                      style={{ ...iBase, appearance: 'auto' }} onFocus={fIn} onBlur={fOut}>
                      <option value="">{loadingCustomers ? 'Loading…' : 'Select customer'}</option>
                      {filteredCustomers.map(c => (
                        <option key={c.id} value={c.id}>
                          {[c.first_name, c.last_name].filter(Boolean).join(' ') || c.email} — {c.email}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {/* Currency */}
                  <div style={{ padding: '14px 16px', borderRadius: 14, border: `1px solid ${purpleBd}`, background: 'white' }}>
                    <SectionTitle icon={DollarSign}>Currency</SectionTitle>
                    <select value={currency} onChange={e => setCurrency(e.target.value)} disabled={loadingCurrencies || loading}
                      style={{ ...iBase, appearance: 'auto' }} onFocus={fIn} onBlur={fOut}>
                      {currencyOptions.length
                        ? currencyOptions.map(c => <option key={c.value} value={c.value}>{c.label}</option>)
                        : <option value={currency}>{currency}</option>}
                    </select>
                    {showKes && selectedCurrency && (
                      <p style={{ fontSize: '0.67rem', color: '#9ca3af', fontStyle: 'italic', marginTop: 6, textAlign: 'right' }}>
                        1 {currency} = {fmtRate(exchangeRate)} KES
                        {selectedCurrency.updated_at ? ` · ${new Date(selectedCurrency.updated_at).toLocaleDateString()}` : ''}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Order Items ──────────────────────────────────────────── */}
              <div style={sectionStyle}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
                  <SectionTitle icon={Package}>
                    Order Items{validItemCount > 0 && ` · ${validItemCount}`}
                  </SectionTitle>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => setShowProductSelector(true)} disabled={loading} type="button"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 9, border: `1.5px solid ${purpleBd}`, color: purple, fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer', background: purpleLt }}>
                      <Package size={12} /> Products
                    </button>
                    <button onClick={() => setShowServiceSelector(true)} disabled={loading} type="button"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 9, border: '1.5px solid rgba(59,130,246,0.3)', color: '#3b82f6', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer', background: 'rgba(59,130,246,0.06)' }}>
                      <Wrench size={12} /> Services
                    </button>
                    <select
                      onChange={e => { if (e.target.value) { setShowCustomModal({ type: e.target.value }); e.target.value = ''; } }}
                      disabled={loading}
                      style={{ ...iBase, width: 'auto', padding: '6px 10px', fontSize: '0.76rem', cursor: 'pointer' }}
                    >
                      <option value="">+ Custom</option>
                      <option value="product">Custom Product</option>
                      <option value="service">Custom Service</option>
                      <option value="fee">Fee / Charge</option>
                    </select>
                  </div>
                </div>

                {/* Empty state */}
                {validItemCount === 0 && (
                  <div style={{ textAlign: 'center', padding: '36px 20px', border: `2px dashed ${purpleBd}`, borderRadius: 14, marginBottom: 8 }}>
                    <Package size={26} color={purple} style={{ opacity: 0.25, marginBottom: 8 }} />
                    <p style={{ fontSize: '0.85rem', fontWeight: 700, color: '#9ca3af', margin: '0 0 12px' }}>No items yet</p>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                      <button onClick={() => setShowProductSelector(true)} type="button"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 9, border: `1.5px solid ${purpleBd}`, color: purple, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', background: purpleLt }}>
                        <Package size={13} /> Add Product
                      </button>
                      <button onClick={() => setShowServiceSelector(true)} type="button"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 9, border: '1.5px solid rgba(59,130,246,0.3)', color: '#3b82f6', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', background: 'rgba(59,130,246,0.06)' }}>
                        <Wrench size={13} /> Add Service
                      </button>
                    </div>
                  </div>
                )}

                {/* Item cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {validItems.map((item, visIdx) => {
                    const realIdx   = orderItems.indexOf(item);
                    const isExp     = !!expandedItems[visIdx];
                    const isService = item.item_type === 'service' || item.item_type === 'custom_service';
                    const isFee     = item.item_type === 'fee';
                    const origPrice = parseFloat(item.original_price) || 0;
                    const unitPrice = parseFloat(item.unit_price)     || 0;
                    const qty       = parseFloat(item.quantity)        || 0;
                    const discAmt   = parseFloat(item.discount_amount) || 0;
                    const lineAfter = parseFloat(item.line_total_after_discount) || 0;
                    const discPct   = origPrice > 0 ? (((origPrice - unitPrice) / origPrice) * 100).toFixed(1) : 0;
                    const hasDisc   = Math.abs(discAmt) > 0.01;

                    return (
                      <div key={realIdx} style={{ borderRadius: 12, border: `1px solid ${purpleBd}`, overflow: 'hidden' }}>

                        {/* Card header */}
                        <div style={{ padding: '11px 13px', background: 'rgba(249,250,251,0.8)', display: 'flex', alignItems: 'flex-start', gap: 9 }}>

                          {/* Reorder */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, paddingTop: 3, flexShrink: 0 }}>
                            <button type="button" onClick={() => moveItem(realIdx, 'up')} disabled={realIdx === 0}
                              style={{ background: 'none', border: 'none', cursor: realIdx === 0 ? 'not-allowed' : 'pointer', padding: 2, color: '#9ca3af', opacity: realIdx === 0 ? 0.25 : 1 }}>
                              <ArrowUp size={11} />
                            </button>
                            <span style={{ fontSize: '0.58rem', color: '#9ca3af', fontWeight: 700, textAlign: 'center' }}>{visIdx + 1}</span>
                            <button type="button" onClick={() => moveItem(realIdx, 'down')} disabled={visIdx === validItemCount - 1}
                              style={{ background: 'none', border: 'none', cursor: visIdx === validItemCount - 1 ? 'not-allowed' : 'pointer', padding: 2, color: '#9ca3af', opacity: visIdx === validItemCount - 1 ? 0.25 : 1 }}>
                              <ArrowDown size={11} />
                            </button>
                          </div>

                          {/* Type icon */}
                          <div style={{ width: 33, height: 33, borderRadius: 8, flexShrink: 0, background: `${typeColor(item.item_type)}10`, border: `1px solid ${typeColor(item.item_type)}28`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                            <TypeIcon type={item.item_type} />
                          </div>

                          <div style={{ flex: 1, minWidth: 0 }}>
                            {/* Name + price + actions */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                              <div>
                                <p style={{ fontSize: '0.86rem', fontWeight: 800, color: '#111827', margin: '0 0 3px', wordBreak: 'break-word' }}>
                                  {item.description || `Item ${visIdx + 1}`}
                                </p>
                                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: typeColor(item.item_type), background: `${typeColor(item.item_type)}12`, border: `1px solid ${typeColor(item.item_type)}22`, padding: '2px 7px', borderRadius: 999 }}>
                                  {item.item_type.replace(/_/g, ' ')}
                                </span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
                                <div style={{ textAlign: 'right' }}>
                                  <p style={{ fontSize: '0.94rem', fontWeight: 900, color: '#111827', margin: 0 }}>{money(lineAfter)}</p>
                              
                                  {hasDisc && (
                                    <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: '2px 0 0' }}>
                                      <span style={{ textDecoration: 'line-through' }}>{money(item.line_total)}</span>
                                      <span style={{
                                        marginLeft: 4,
                                        color: unitPrice > origPrice ? '#ef4444' : '#10b981',
                                        fontWeight: 700,
                                      }}>
                                        {unitPrice > origPrice ? `+${Math.abs(discPct)}% markup` : `${discPct}% off`}
                                      </span>
                                    </p>
                                  )}
                                  {showKes && (
                                    <p style={{ fontSize: '0.64rem', color: '#9ca3af', fontStyle: 'italic', marginTop: 1 }}>{kesMoney(toKes(lineAfter))}</p>
                                  )}
                                </div>
                                <button type="button" onClick={() => setExpandedItems(p => ({ ...p, [visIdx]: !p[visIdx] }))}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 3, borderRadius: 6, color: '#9ca3af' }}>
                                  {isExp ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                </button>
                                <button type="button" onClick={() => removeItem(realIdx)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 3, borderRadius: 6, color: '#ef4444' }}>
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>

                            {/* Core fields */}
                            <div className="com-item-core">
                              <Field label="Description" required>
                                <input value={item.description} onChange={e => updateItem(realIdx, 'description', e.target.value)}
                                  placeholder="Item description" disabled={loading} style={iBase} onFocus={fIn} onBlur={fOut} />
                              </Field>
                              <Field label="Qty" required>
                                <input type="number" min="0.01" step="0.01" value={item.quantity}
                                  onChange={e => updateItem(realIdx, 'quantity', e.target.value)} disabled={loading}
                                  style={iBase} onFocus={fIn} onBlur={fOut} />
                              </Field>
                              <Field label="List Price">
                                <PrefixInput type="number" min="0" step="0.01" value={item.original_price}
                                  onChange={e => updateItem(realIdx, 'original_price', e.target.value)} disabled={loading} prefix={cs} />
                              </Field>
                              <Field label="Sell Price" required>
                                <PrefixInput type="number" min="0" step="0.01" value={item.unit_price}
                                  onChange={e => updateItem(realIdx, 'unit_price', e.target.value)} disabled={loading} prefix={cs} />
                              </Field>
                            </div>

                            {/* Discount / Markup badge */}
                            {hasDisc && (
                              <div style={{
                                marginTop: 7, padding: '5px 11px', borderRadius: 8,
                                background: unitPrice > origPrice ? 'rgba(239,68,68,0.06)' : 'rgba(16,185,129,0.06)',
                                border: `1px solid ${unitPrice > origPrice ? 'rgba(239,68,68,0.18)' : 'rgba(16,185,129,0.18)'}`,
                                display: 'flex', justifyContent: 'space-between',
                              }}>
                                <span style={{ fontSize: '0.72rem', color: unitPrice > origPrice ? '#7f1d1d' : '#065f46' }}>
                                  {unitPrice > origPrice ? 'Markup' : 'Discount'}:{' '}
                                  {cs} {fmt(Math.abs(origPrice - unitPrice))} × {qty}
                                </span>
                                <span style={{ fontSize: '0.74rem', fontWeight: 700, color: unitPrice > origPrice ? '#ef4444' : '#10b981' }}>
                                  {unitPrice > origPrice ? '+' : '-'}{money(Math.abs(discAmt))}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* ── Expanded ─────────────────────────────────── */}
                        {isExp && (
                          <div style={{ padding: '14px 13px', borderTop: `1px solid ${purpleBd}`, background: purpleLt, display: 'flex', flexDirection: 'column', gap: 14 }}>

                            {/* Unit */}
                            <div style={{ marginBottom: 10 }}>
                              <Field label="Unit">
                                <select value={item.unit_of_measure} onChange={e => updateItem(realIdx, 'unit_of_measure', e.target.value)}
                                  disabled={loading} style={{ ...iBase, appearance: 'auto' }} onFocus={fIn} onBlur={fOut}>
                                  {unitOptsFor(item.item_type).map(u => <option key={u} value={u}>{u}</option>)}
                                </select>
                              </Field>
                            </div>

                            {/* Service details */}
                            {isService && (
                              <div style={{ padding: '12px 14px', borderRadius: 11, background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.18)' }}>
                                <p style={{ fontSize: '0.63rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#3b82f6', marginBottom: 10 }}>Service Details</p>
                                <div className="com-svc-grid">
                                  <Field label="Labor Cost">
                                    <PrefixInput type="number" min="0" step="0.01" value={item.labor_cost || ''}
                                      onChange={e => updateItem(realIdx, 'labor_cost', e.target.value)} disabled={loading} prefix={cs} placeholder="Optional" />
                                  </Field>
                                  <Field label="Material Cost">
                                    <PrefixInput type="number" min="0" step="0.01" value={item.material_cost || ''}
                                      onChange={e => updateItem(realIdx, 'material_cost', e.target.value)} disabled={loading} prefix={cs} placeholder="Optional" />
                                  </Field>
                                  <Field label="Est. Hours">
                                    <input type="number" min="0" step="0.5" value={item.estimated_hours || ''}
                                      onChange={e => updateItem(realIdx, 'estimated_hours', e.target.value)}
                                      disabled={loading} placeholder="Optional" style={iBase} onFocus={fIn} onBlur={fOut} />
                                  </Field>
                                  <Field label="Hourly Rate">
                                    <PrefixInput type="number" min="0" step="0.01" value={item.hourly_rate || ''}
                                      onChange={e => updateItem(realIdx, 'hourly_rate', e.target.value)} disabled={loading} prefix={cs} placeholder="Optional" />
                                  </Field>
                                  <Field label="Duration Estimate">
                                    <input value={item.estimated_duration || ''}
                                      onChange={e => updateItem(realIdx, 'estimated_duration', e.target.value)}
                                      disabled={loading} placeholder="e.g. 2–3 days" style={iBase} onFocus={fIn} onBlur={fOut} />
                                  </Field>
                                </div>
                                <div className="com-svc-dates">
                                  <Field label="Scheduled Start">
                                    <input type="date" value={item.scheduled_start_date || ''}
                                      onChange={e => updateItem(realIdx, 'scheduled_start_date', e.target.value)}
                                      disabled={loading} style={iBase} onFocus={fIn} onBlur={fOut} />
                                  </Field>
                                  <Field label="Scheduled End">
                                    <input type="date" value={item.scheduled_end_date || ''}
                                      onChange={e => updateItem(realIdx, 'scheduled_end_date', e.target.value)}
                                      disabled={loading} style={iBase} onFocus={fIn} onBlur={fOut} />
                                  </Field>
                                </div>
                                <div style={{ marginTop: 10 }}>
                                  <Checkbox id={`site_${realIdx}`} checked={!!item.requires_site_visit}
                                    onChange={e => updateItem(realIdx, 'requires_site_visit', e.target.checked)}
                                    label="Requires site visit" disabled={loading} />
                                </div>
                              </div>
                            )}

                            {/* Notes */}
                            <div className="com-grid-2">
                              <Field label="Pricing Notes (internal)">
                                <textarea value={item.pricing_notes || ''} onChange={e => updateItem(realIdx, 'pricing_notes', e.target.value)}
                                  rows={2} placeholder="Internal pricing notes…" disabled={loading}
                                  style={{ ...iBase, resize: 'vertical', fontFamily: 'inherit' }} onFocus={fIn} onBlur={fOut} />
                              </Field>
                              <Field label="Prerequisites">
                                <textarea value={item.prerequisites || ''} onChange={e => updateItem(realIdx, 'prerequisites', e.target.value)}
                                  rows={2} placeholder="Requirements or dependencies…" disabled={loading}
                                  style={{ ...iBase, resize: 'vertical', fontFamily: 'inherit' }} onFocus={fIn} onBlur={fOut} />
                              </Field>
                            </div>
                            <Field label="Notes (visible to customer)">
                              <textarea value={item.notes || ''} onChange={e => updateItem(realIdx, 'notes', e.target.value)}
                                rows={2} placeholder="Notes for this item…" disabled={loading}
                                style={{ ...iBase, resize: 'vertical', fontFamily: 'inherit' }} onFocus={fIn} onBlur={fOut} />
                            </Field>

                            {/* Flags */}
                            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                              <Checkbox id={`tax_${realIdx}`}  checked={item.is_taxable !== false}   onChange={e => updateItem(realIdx, 'is_taxable', e.target.checked)}          label="Taxable"          disabled={loading} />
                              <Checkbox id={`bulk_${realIdx}`} checked={!!item.is_bulk_pricing}      onChange={e => updateItem(realIdx, 'is_bulk_pricing', e.target.checked)}     label="Bulk Pricing"     disabled={loading} />
                              <Checkbox id={`neg_${realIdx}`}  checked={!!item.is_negotiated_price}  onChange={e => updateItem(realIdx, 'is_negotiated_price', e.target.checked)} label="Negotiated Price" disabled={loading} />
                              {!isService && !isFee && (
                                <Checkbox id={`bo_${realIdx}`} checked={!!item.allow_backorder}      onChange={e => updateItem(realIdx, 'allow_backorder', e.target.checked)}     label="Allow Backorder"  disabled={loading} />
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── Delivery ─────────────────────────────────────────────── */}
              <div style={sectionStyle}>
                <SectionTitle icon={MapPin}>Delivery</SectionTitle>
                <div className="com-grid-2" style={{ marginBottom: 14 }}>
                  <Field label="Delivery Method" required>
                    <select value={deliveryMethod} onChange={e => setDeliveryMethod(e.target.value)} disabled={loading}
                      style={{ ...iBase, appearance: 'auto' }} onFocus={fIn} onBlur={fOut}>
                      {DELIVERY_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </Field>
                  <Field label="Priority">
                    <select value={priority} onChange={e => setPriority(e.target.value)} disabled={loading}
                      style={{ ...iBase, appearance: 'auto' }} onFocus={fIn} onBlur={fOut}>
                      {PRIORITY_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="Shipping Address" required>
                  <textarea value={shippingAddress}
                    onChange={e => { setShippingAddress(e.target.value); if (billingSame) setBillingAddress(e.target.value); }}
                    placeholder="Enter full shipping address…" rows={2} disabled={loading}
                    style={{ ...iBase, resize: 'vertical', fontFamily: 'inherit' }} onFocus={fIn} onBlur={fOut} />
                </Field>
                <div style={{ marginTop: 10 }}>
                  <Checkbox id="billing_same" checked={billingSame}
                    onChange={e => { setBillingSame(e.target.checked); if (e.target.checked) setBillingAddress(shippingAddress); }}
                    label="Billing address same as shipping" disabled={loading} />
                </div>
                {!billingSame && (
                  <div style={{ marginTop: 12 }}>
                    <Field label="Billing Address">
                      <textarea value={billingAddress} onChange={e => setBillingAddress(e.target.value)}
                        placeholder="Billing address…" rows={2} disabled={loading}
                        style={{ ...iBase, resize: 'vertical', fontFamily: 'inherit' }} onFocus={fIn} onBlur={fOut} />
                    </Field>
                  </div>
                )}
              </div>

              {/* ── Order Settings ───────────────────────────────────────── */}
              <div style={sectionStyle}>
                <SectionTitle icon={Settings}>Order Settings</SectionTitle>
                <div className="com-grid-3" style={{ marginBottom: 14 }}>
                  <Field label="Order Type">
                    <select value={orderType} onChange={e => setOrderType(e.target.value)} disabled={loading}
                      style={{ ...iBase, appearance: 'auto' }} onFocus={fIn} onBlur={fOut}>
                      {ORDER_TYPE_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </Field>
                  <Field label="Billing Schedule">
                    <select value={billingSchedule} onChange={e => setBillingSchedule(e.target.value)} disabled={loading}
                      style={{ ...iBase, appearance: 'auto' }} onFocus={fIn} onBlur={fOut}>
                      {BILLING_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </Field>
                  <Field label="Project Name" hint="For service/project orders">
                    <input value={projectName} onChange={e => setProjectName(e.target.value)}
                      placeholder="Optional" disabled={loading} style={iBase} onFocus={fIn} onBlur={fOut} />
                  </Field>
                </div>
                <div className="com-grid-2" style={{ marginBottom: 14 }}>
                  <Field label="Service Start Date">
                    <input type="date" value={serviceStartDate} onChange={e => setServiceStartDate(e.target.value)}
                      disabled={loading} style={iBase} onFocus={fIn} onBlur={fOut} />
                  </Field>
                  <Field label="Service End Date">
                    <input type="date" value={serviceEndDate} onChange={e => setServiceEndDate(e.target.value)}
                      disabled={loading} style={iBase} onFocus={fIn} onBlur={fOut} />
                  </Field>
                </div>
                <div className="com-grid-2" style={{ marginBottom: 14 }}>
                  <Field label="Payment Status">
                    <select value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)} disabled={loading}
                      style={{ ...iBase, appearance: 'auto' }} onFocus={fIn} onBlur={fOut}>
                      {PAY_STATUS_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </Field>
                  <Field label="Payment Method">
                    <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} disabled={loading}
                      style={{ ...iBase, appearance: 'auto' }} onFocus={fIn} onBlur={fOut}>
                      {PAY_METHOD_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </Field>
                </div>
                {paymentStatus !== 'unpaid' && (
                  <div style={{ marginBottom: 14 }}>
                    <Field label="Payment Reference">
                      <input value={paymentReference} onChange={e => setPaymentReference(e.target.value)}
                        placeholder="Transaction ID, M-Pesa code, etc." disabled={loading}
                        style={iBase} onFocus={fIn} onBlur={fOut} />
                    </Field>
                  </div>
                )}
                <Checkbox id="apply_tax" checked={applyTax} onChange={e => setApplyTax(e.target.checked)} label="Apply 16% VAT" disabled={loading} />
              </div>

              {/* ── Notes ────────────────────────────────────────────────── */}
              <div style={sectionStyle}>
                <SectionTitle icon={FileText}>Notes</SectionTitle>
                <div className="com-notes-grid">
                  <Field label="Customer Notes" hint="Visible to customer">
                    <textarea value={customerNotes} onChange={e => setCustomerNotes(e.target.value)}
                      placeholder="e.g., Size: Large, Color: Blue…" rows={3} disabled={loading}
                      style={{ ...iBase, resize: 'vertical', fontFamily: 'inherit' }} onFocus={fIn} onBlur={fOut} />
                  </Field>
                  <div>
                    <label style={labelStyle}>Admin Notes</label>
                    <div style={{ position: 'relative' }}>
                      <ShieldCheck size={13} color={purple} style={{ position: 'absolute', left: 11, top: 11, pointerEvents: 'none' }} />
                      <textarea value={adminNotes} onChange={e => setAdminNotes(e.target.value)}
                        placeholder="Internal only…" rows={3} disabled={loading}
                        style={{ ...iBase, resize: 'vertical', fontFamily: 'inherit', paddingLeft: 30, background: purpleLt, borderColor: purpleBd }}
                        onFocus={fIn} onBlur={fOut} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 20, borderTop: '1px solid #f3f4f6' }}>
                <button onClick={() => { resetForm(); onClose(); }} disabled={loading} type="button"
                  style={{ padding: '10px 20px', borderRadius: 10, border: '1.5px solid #e5e7eb', color: '#6b7280', fontSize: '0.85rem', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1, background: 'transparent' }}>
                  Cancel
                </button>
                <button onClick={handleSubmit} disabled={loading || validItemCount === 0} type="button"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 24px', borderRadius: 10, border: 'none', cursor: (loading || validItemCount === 0) ? 'not-allowed' : 'pointer', background: `linear-gradient(135deg,${purple},${purpleDk})`, color: 'white', fontSize: '0.85rem', fontWeight: 800, boxShadow: '0 4px 14px rgba(168,85,247,0.3)', opacity: (loading || validItemCount === 0) ? 0.6 : 1 }}>
                  <Plus size={16} />
                  {loading ? (editMode ? 'Saving…' : 'Creating…') : (editMode ? 'Save Changes' : 'Create Order')}
                </button>
              </div>
            </div>

            {/* ─ RIGHT: sticky summary sidebar ─────────────────────────── */}
            <div className="com-right">

              {/* Currency */}
              <div style={{ padding: '14px 16px', borderRadius: 14, border: `1px solid ${purpleBd}`, background: 'white' }}>
                <SectionTitle icon={DollarSign}>Currency</SectionTitle>
                <select value={currency} onChange={e => setCurrency(e.target.value)} disabled={loadingCurrencies || loading}
                  style={{ ...iBase, appearance: 'auto' }} onFocus={fIn} onBlur={fOut}>
                  {currencyOptions.length
                    ? currencyOptions.map(c => <option key={c.value} value={c.value}>{c.label}</option>)
                    : <option value={currency}>{currency}</option>}
                </select>
                {showKes && selectedCurrency && (
                  <p style={{ fontSize: '0.67rem', color: '#9ca3af', fontStyle: 'italic', marginTop: 6, textAlign: 'right' }}>
                    1 {currency} = {fmtRate(exchangeRate)} KES
                    {selectedCurrency.updated_at ? ` · ${new Date(selectedCurrency.updated_at).toLocaleDateString()}` : ''}
                  </p>
                )}
              </div>

              {/* Shipping cost */}
              <div style={{ padding: '14px 16px', borderRadius: 14, border: '1px solid #e5e7eb', background: 'white' }}>
                <Field label="Shipping Cost">
                  <PrefixInput type="number" min="0" step="0.01" value={shippingCost}
                    onChange={e => setShippingCost(e.target.value)} disabled={loading} prefix={cs} />
                </Field>
              </div>

              {/* Order-level discount */}
              <div style={{ padding: '14px 16px', borderRadius: 14, border: '1px solid #e5e7eb', background: 'white' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <p style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: purple, margin: 0 }}>Order Discount</p>
                  <button type="button" onClick={() => setUseDiscountPct(!useDiscountPct)}
                    style={{ fontSize: '0.68rem', color: purple, fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    {useDiscountPct ? 'Switch to amount' : 'Switch to %'}
                  </button>
                </div>
                {useDiscountPct ? (
                  <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <input type="number" min="0" max="100" step="0.01" value={discountPct}
                        onChange={e => handleDiscountChange('pct', e.target.value)}
                        disabled={loading} style={iBase} onFocus={fIn} onBlur={fOut} />
                    </div>
                    <Percent size={14} color="#9ca3af" />
                  </div>
                ) : (
                  <PrefixInput type="number" min="0" step="0.01" value={orderDiscount}
                    onChange={e => handleDiscountChange('amt', e.target.value)} disabled={loading} prefix={cs} />
                )}
                {parseFloat(orderDiscount) > 0 && (
                  <p style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 700, marginTop: 5 }}>
                    -{money(orderDiscount)} order discount
                  </p>
                )}
                <p style={{ fontSize: '0.67rem', color: '#9ca3af', marginTop: 5, lineHeight: 1.5 }}>
                  Saved in <code style={{ fontSize: '0.65rem' }}>orders.discount</code>, separate from item discounts in <code style={{ fontSize: '0.65rem' }}>order_items.discount_amount</code>
                </p>
              </div>

              {/* Promo Code */}
              <div style={{
                padding: '14px 16px', borderRadius: 14,
                border: '1px solid #e5e7eb', background: 'white',
              }}>
                <p style={{
                  fontSize: '0.68rem', fontWeight: 800,
                  textTransform: 'uppercase', letterSpacing: '0.12em',
                  color: purple, marginBottom: 10,
                }}>
                  Promo Code
                </p>
                <PromoCodeInput
                  orderValue={itemsSubtotal}
                  referralDiscount={0}
                  customerId={customerId ? parseInt(customerId) : null}
                  onApplied={() => {}}
                  onCleared={() => {}}
                  disabled={loading || !customerId}
                  symbol={cs}
                />
                {!customerId && (
                  <p style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: 6 }}>
                    Select a customer first to apply a promo code.
                  </p>
                )}
              </div>

              {/* Financial summary */}
              {validItemCount > 0 && (
                <div style={{ padding: '14px 16px', borderRadius: 14, border: `1px solid ${purpleBd}`, background: purpleLt }}>
                  <p style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: purple, marginBottom: 12 }}>Summary</p>

                  {[
                    { label: 'Original Total',      value: money(origTotal),                        show: true },
                    { label: 'Item Discounts',       value: `-${money(totalItemDisc)}`,              show: totalItemDisc > 0, color: '#10b981' },
                    { label: 'After Item Discounts', value: money(itemsSubtotal),                    show: totalItemDisc > 0, divider: true },
                    { label: 'Order Discount',       value: `-${money(parseFloat(orderDiscount)||0)}`, show: parseFloat(orderDiscount) > 0, color: '#10b981' },
                    { label: 'Promo Discount', value: `-${money(promoDiscountAmt)}`, show: promoDiscountAmt > 0, color: '#a855f7' },
                    { label: 'VAT (16%)',            value: money(taxAmount),                        show: applyTax },
                    { label: 'Shipping',             value: money(shipping),                         show: shipping > 0 },
                  ].filter(r => r.show).map(({ label, value, color, divider }) => (
                    <div key={label} style={{ borderTop: divider ? `1px solid ${purpleBd}` : 'none', paddingTop: divider ? 8 : 0, marginBottom: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.76rem', color: '#9ca3af' }}>{label}</span>
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: color || '#111827' }}>{value}</span>
                      </div>
                    </div>
                  ))}

                  {totalSavings > 0 && (
                    <div style={{ padding: '7px 10px', borderRadius: 8, background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.22)', display: 'flex', justifyContent: 'space-between', marginTop: 6, marginBottom: 6 }}>
                      <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#065f46' }}>Total Savings</span>
                      <span style={{ fontSize: '0.82rem', fontWeight: 900, color: '#10b981' }}>-{money(totalSavings)}</span>
                    </div>
                  )}

                  {/* Grand total */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTop: `2px solid ${purpleBd}`, marginTop: 4 }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#111827' }}>Total</span>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: '1.15rem', fontWeight: 900, color: purple, margin: 0 }}>{money(grandTotal)}</p>
                      {showKes && <p style={{ fontSize: '0.66rem', color: '#9ca3af', fontStyle: 'italic', marginTop: 1 }}>{kesMoney(toKes(grandTotal))}</p>}
                    </div>
                  </div>
                  {/* Referral discount note — shown if customer has a pending referral */}
                  <div style={{
                    marginTop: 10, padding: '8px 10px', borderRadius: 8,
                    background: 'rgba(168,85,247,0.06)', border: `1px solid ${purpleBd}`,
                    fontSize: '0.72rem', color: purple, lineHeight: 1.5,
                  }}>
                    <strong>Note:</strong> If this customer was referred and hasn't placed an order yet, a referral discount will be automatically applied by the backend and shown in the saved order.
                  </div>

                  {/* Item type breakdown */}
                  <div className="com-summary-cells">
                    {[
                      ['Items',    validItemCount],
                      ['Products', validItems.filter(i => i.item_type === 'product' || i.item_type === 'custom_product').length],
                      ['Services', validItems.filter(i => i.item_type === 'service' || i.item_type === 'custom_service').length],
                    ].map(([label, val]) => (
                      <div key={label} style={{ padding: '7px 9px', borderRadius: 8, background: 'rgba(255,255,255,0.8)', border: `1px solid ${purpleBd}`, textAlign: 'center' }}>
                        <p style={{ fontSize: '0.58rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', margin: '0 0 2px' }}>{label}</p>
                        <p style={{ fontSize: '0.88rem', fontWeight: 900, color: purple, margin: 0 }}>{val}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Discount guide */}
              <div style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid #e5e7eb', background: 'white' }}>
                <p style={{ fontSize: '0.64rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: purple, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Info size={11} /> Discount Levels
                </p>
                <div style={{ padding: '7px 9px', borderRadius: 7, background: 'rgba(249,250,251,0.9)', border: '1px solid #f3f4f6', marginBottom: 6, fontSize: '0.72rem', color: '#6b7280', lineHeight: 1.5 }}>
                  <strong style={{ color: '#374151' }}>1. Item discount</strong> — set a lower Sell Price vs List Price per line item. Stored in <code style={{ fontSize: '0.65rem' }}>order_items.discount_amount</code>.
                </div>
                <div style={{ padding: '7px 9px', borderRadius: 7, background: purpleLt, border: `1px solid ${purpleBd}`, fontSize: '0.72rem', color: '#6b7280', lineHeight: 1.5 }}>
                  <strong style={{ color: purple }}>2. Order discount</strong> — flat or % off the whole order total. Stored in <code style={{ fontSize: '0.65rem' }}>orders.discount</code>.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Sub-modals ───────────────────────────────────────────────────────── */}
      {showProductSelector && (
        <ProductSelectorModal
          onClose={() => setShowProductSelector(false)}
          onSelect={handleProductsSelected}
          excludeIds={orderItems.filter(i => i.product_id).map(i => i.product_id)}
        />
      )}
      {showServiceSelector && (
        <ServiceSelectorModal
          onClose={() => setShowServiceSelector(false)}
          onSelect={handleServicesSelected}
          excludeIds={orderItems.filter(i => i.service_id).map(i => i.service_id)}
        />
      )}
      {showCustomModal && (
        <CustomItemModal
          type={showCustomModal.type}
          onClose={() => setShowCustomModal(null)}
          onSave={handleCustomItemCreated}
        />
      )}
      {showPricingModal && (
        <PricingValidationModal
          errors={pricingErrors}
          onClose={() => setShowPricingModal(false)}
          currencySymbol={cs}
        />
      )}
    </>
  );
}