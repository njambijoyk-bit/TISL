import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Truck, Package, CheckCircle, Clock, MapPin,
  ExternalLink, RefreshCw, AlertTriangle, Copy, Star, Flag,
  XCircle, Info, Navigation 
} from 'lucide-react';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import LoadingSpinner from '../../components/layout/LoadingSpinner';
import DeliveryRatingModal from './DeliveryRatingModal';
import DeliveryIncidentModal from './DeliveryIncidentModal';
import DriverTrackingModal from './DriverTrackingModal';
import deliveryAPI from '../../api/delivery';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

// ── Helpers ───────────────────────────────────────────────────────────────────
const safeFormat = (d, fmt) => {
  try { return format(new Date(String(d).replace(' ', 'T')), fmt); }
  catch { return '—'; }
};

// ── Status config ─────────────────────────────────────────────────────────────
const SHIPMENT_STATUS = {
  dispatched:  { color: '#a855f7', label: 'Dispatched',  Icon: Package },
  in_transit:  { color: '#3b82f6', label: 'In Transit',  Icon: Truck },
  delivered:   { color: '#10b981', label: 'Delivered',   Icon: CheckCircle },
  failed:      { color: '#ef4444', label: 'Failed',      Icon: XCircle },
};

const WORKFLOW_LABELS = {
  internal:         'Our Delivery Team',
  external_courier: 'Courier Service',
  instore:          'In-Store Pickup',
};

// ── Primitives ────────────────────────────────────────────────────────────────
function StatusPill({ label, color }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full text-xs font-semibold whitespace-nowrap"
      style={{ background: `${color}15`, border: `1.5px solid ${color}40`, color, padding: '3px 10px 3px 8px' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {label}
    </span>
  );
}

function Section({ title, icon: Icon, accent, children, action }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl overflow-hidden mb-5"
      style={{ border: '1px solid rgba(168,85,247,0.2)' }}>
      {accent && <div style={{ height: 3, background: accent }} />}
      <div className="p-5">
        {(title || action) && (
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              {Icon && <Icon size={13} color="#c084fc" />}
              <p className="text-xs font-semibold uppercase tracking-widest m-0" style={{ color: '#c084fc' }}>{title}</p>
            </div>
            {action}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-4 py-2.5"
      style={{ borderBottom: '1px solid rgba(168,85,247,0.07)' }}>
      <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 shrink-0">{label}</span>
      <span className={`text-xs font-semibold text-right dark:text-gray-200 ${mono ? 'font-mono' : ''}`}
        style={{ color: '#111827' }}>{value}</span>
    </div>
  );
}

// ── Timeline step ─────────────────────────────────────────────────────────────
function TimelineStep({ label, date, color, active, last }) {
  return (
    <div className="flex gap-3">
      {/* Dot + line */}
      <div className="flex flex-col items-center" style={{ width: 20, flexShrink: 0 }}>
        <div style={{
          width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
          background: active ? color : 'transparent',
          border: `2px solid ${active ? color : '#e5e7eb'}`,
          boxShadow: active ? `0 0 0 4px ${color}18` : 'none',
          transition: 'all 0.2s',
        }} />
        {!last && (
          <div style={{ flex: 1, width: 2, background: active ? `${color}30` : '#f3f4f6', minHeight: 28, marginTop: 3 }} />
        )}
      </div>
      {/* Content */}
      <div className="pb-5" style={{ flex: 1 }}>
        <p className="text-xs font-bold m-0" style={{ color: active ? color : '#9ca3af' }}>{label}</p>
        {date && (
          <p className="text-[11px] mt-0.5 m-0 font-medium" style={{ color: '#9ca3af' }}>
            {safeFormat(date, 'MMM d, yyyy · h:mm a')}
          </p>
        )}
        {!date && !active && (
          <p className="text-[11px] mt-0.5 m-0" style={{ color: '#d1d5db' }}>Pending</p>
        )}
      </div>
    </div>
  );
}

// ── Big status card ───────────────────────────────────────────────────────────
function StatusHero({ shipment }) {
  const cfg = SHIPMENT_STATUS[shipment.status] || { color: '#9ca3af', label: shipment.status_label || shipment.status, Icon: Package };
  const { color, label, Icon } = cfg;

  return (
    <div className="rounded-2xl overflow-hidden mb-5"
      style={{ border: `1px solid ${color}30`, background: `${color}08` }}>
      <div style={{ height: 4, background: `linear-gradient(90deg, ${color}, ${color}aa)` }} />
      <div className="p-6 flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{ background: `${color}15`, border: `1.5px solid ${color}30` }}>
          <Icon size={24} color={color} />
        </div>
        <div style={{ flex: 1 }}>
          <p className="text-xs font-bold uppercase tracking-widest m-0 mb-0.5" style={{ color: `${color}99` }}>
            Shipment Status
          </p>
          <p className="text-xl font-bold m-0" style={{ color }}>{label}</p>
          {shipment.estimated_delivery_date && shipment.status !== 'delivered' && (
            <p className="text-xs font-medium mt-1 m-0" style={{ color: '#6b7280' }}>
              Expected by {safeFormat(shipment.estimated_delivery_date, 'EEEE, MMM d')}
            </p>
          )}
          {shipment.delivered_at && shipment.status === 'delivered' && (
            <p className="text-xs font-medium mt-1 m-0" style={{ color: '#059669' }}>
              Delivered on {safeFormat(shipment.delivered_at, 'EEEE, MMM d · h:mm a')}
            </p>
          )}
        </div>
        <StatusPill label={label} color={color} />
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function CustomerShipmentTracking() {
  const { id: orderId } = useParams();
  const navigate    = useNavigate();

  const [shipment, setShipment]         = useState(null);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [ratingModal, setRatingModal]   = useState(false);
  const [incidentModal, setIncidentModal] = useState(false);
  const [trackingModal, setTrackingModal] = useState(false); // ✅ Added tracking modal state

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const data = await deliveryAPI.getOrderShipment(orderId);
      setShipment(data.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not load shipment details.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, [orderId]);

  const handleCopyTracking = () => {
    if (!shipment?.tracking_number) return;
    navigator.clipboard.writeText(shipment.tracking_number);
    toast.success('Tracking number copied!');
  };

  // ── Timeline steps ────────────────────────────────────────────────────────
  const buildTimeline = (s) => {
    if (!s) return [];
    const steps = [
      { key: 'dispatched',  label: 'Order Dispatched', color: '#a855f7' },
      { key: 'in_transit',  label: 'In Transit',       color: '#3b82f6' },
      { key: 'delivered',   label: 'Delivered',        color: '#10b981' },
    ];
    const order = ['dispatched', 'in_transit', 'delivered'];
    const currentIdx = order.indexOf(s.status);
    return steps.map((step, i) => ({
      ...step,
      active: i <= currentIdx && s.status !== 'failed',
      date: i === 0 ? s.dispatched_at : i === 2 ? s.delivered_at : null,
    }));
  };

  // ── Loading / error ───────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      <Header />
      <div className="flex-1 flex items-center justify-center"><LoadingSpinner size="lg" /></div>
      <Footer />
    </div>
  );

  if (!shipment) return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      <Header />
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ background: 'rgba(168,85,247,0.08)' }}>
            <Truck size={28} color="#c084fc" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">No Shipment Found</h2>
          <p className="text-sm text-gray-400 mb-6">We couldn't find shipment details for this order.</p>
          <button onClick={() => navigate(`/orders/${orderId}`)} type="button"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold"
            style={{ background: 'linear-gradient(135deg,#a855f7,#7c3aed)', boxShadow: '0 4px 12px rgba(168,85,247,0.3)' }}>
            <ArrowLeft size={14} /> Back to Order
          </button>
        </div>
      </div>
      <Footer />
    </div>
  );

  const timeline         = buildTimeline(shipment);
  const isDelivered      = shipment.status === 'delivered';
  const hasTracking      = !!shipment.tracking_number;
  const isExternalCourier = shipment.workflow === 'external_courier';
  const isInternalActive = shipment.workflow === 'internal'
    && !['delivered', 'failed', 'returned'].includes(shipment.your_status ?? shipment.status);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      <Header />

      {/* ── Page header ──────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 px-6 pt-6 pb-5"
        style={{ borderBottom: '2px solid rgba(168,85,247,0.2)' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>

          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 mb-5" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
            <button onClick={() => navigate('/orders')} type="button"
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#9ca3af', fontWeight: 600, fontSize: '0.75rem' }}
              onMouseEnter={e => e.currentTarget.style.color = '#a855f7'}
              onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}>
              Orders
            </button>
            <span style={{ color: '#d1d5db' }}>/</span>
            <button onClick={() => navigate(`/orders/${orderId}`)} type="button"
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#9ca3af', fontWeight: 600, fontSize: '0.75rem' }}
              onMouseEnter={e => e.currentTarget.style.color = '#a855f7'}
              onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}>
              Order Details
            </button>
            <span style={{ color: '#d1d5db' }}>/</span>
            <span style={{ color: '#a855f7' }}>Track Delivery</span>
          </nav>

          {/* Header row */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)' }}>
                <Truck size={18} color="#a855f7" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest m-0" style={{ color: '#c084fc' }}>Track Delivery</p>
                <h1 className="text-xl font-bold m-0" style={{ color: '#a855f7' }}>
                  {WORKFLOW_LABELS[shipment.workflow] || shipment.workflow_label || 'Shipment'}
                </h1>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 flex-wrap">

              {/* ✅ Track Live Button — Only for internal active deliveries */}
              {isInternalActive && (
                <button onClick={() => setTrackingModal(true)} type="button"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 12px rgba(168,85,247,0.3)' }}>
                  <Navigation size={14} /> Track Live
                </button>
              )}

              {/* Refresh */}
              <button onClick={() => load(true)} disabled={refreshing} type="button"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 text-sm font-semibold transition-colors hover:border-purple-300 hover:text-purple-500 disabled:opacity-40">
                <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                Refresh
              </button>

              {/* Rate Delivery — only if delivered */}
              {isDelivered && (
                <button onClick={() => setRatingModal(true)} type="button"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#fbbf24,#d97706)', color: 'white', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 12px rgba(245,158,11,0.3)' }}>
                  <Star size={14} /> Rate Delivery
                </button>
              )}

              {/* Report Incident */}
              <button onClick={() => setIncidentModal(true)} type="button"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 12, border: '1px solid rgba(239,68,68,0.35)', background: 'transparent', color: '#ef4444', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.06)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <Flag size={14} /> Report Issue
              </button>

            </div>
          </div>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────── */}
      <div className="flex-1 px-6 py-6" style={{ maxWidth: 900, margin: '0 auto', width: '100%' }}>

        {/* Big status hero */}
        <StatusHero shipment={shipment} />

        <div className="cst-grid">
          <style>{`
            .cst-grid {
              display: grid;
              grid-template-columns: 1fr 280px;
              gap: 20px;
              align-items: start;
            }
            @media (max-width: 760px) {
              .cst-grid { grid-template-columns: 1fr; }
            }
          `}</style>

          {/* ── Left column ── */}
          <div>

            {/* Timeline */}
            <Section title="Manifest Progress" icon={Clock}
              accent="linear-gradient(90deg,#a855f7,#7c3aed)">
              <div className="pt-1">
                {timeline.map((step, i) => (
                  <TimelineStep
                    key={step.key}
                    label={step.label}
                    date={step.date}
                    color={step.color}
                    active={step.active}
                    last={i === timeline.length - 1}
                  />
                ))}

                {shipment.status === 'failed' && (
                  <div className="flex items-start gap-3 p-3 rounded-xl mt-2"
                    style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
                    <AlertTriangle size={14} color="#ef4444" className="flex-shrink-0 mt-0.5" />
                    <p className="text-xs font-medium m-0" style={{ color: '#ef4444' }}>
                      This delivery attempt failed. Please contact us so we can arrange re-delivery.
                    </p>
                  </div>
                )}
              </div>
            </Section>

            {/* ── Delivery Details Section ── */}
            <Section title="Delivery Details" icon={MapPin}
              accent="linear-gradient(90deg,#10b981,#059669)">

              <InfoRow label="Driver"      value={shipment.driver_name} />
              <InfoRow label="Stop #"      value={shipment.your_stop_number ? `#${shipment.your_stop_number}` : null} />
              <InfoRow label="Your Status" value={shipment.your_status?.replace(/_/g, ' ')} />
              <InfoRow label="Delivered"   value={shipment.delivered_at ? safeFormat(shipment.delivered_at, 'MMM d, yyyy · h:mm a') : null} />

              {/* Delivery Notes */}
              {shipment.delivery_notes && (
                <div className="mt-3 p-3 rounded-xl"
                  style={{ background: 'rgba(168,85,247,0.05)', border: '1px solid rgba(168,85,247,0.15)' }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest m-0 mb-1" style={{ color: '#c084fc' }}>
                    Delivery Notes
                  </p>
                  <p className="text-xs m-0 leading-relaxed" style={{ color: '#6b7280', fontStyle: 'italic' }}>
                    "{shipment.delivery_notes}"
                  </p>
                </div>
              )}

              {/* Failed Reason */}
              {shipment.failed_reason && (
                <div className="mt-3 flex items-start gap-2 p-3 rounded-xl"
                  style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <AlertTriangle size={13} color="#ef4444" className="flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest m-0 mb-1" style={{ color: '#ef4444' }}>
                      Failure Reason
                    </p>
                    <p className="text-xs m-0" style={{ color: '#fca5a5', textTransform: 'capitalize' }}>
                      {shipment.failed_reason.replace(/_/g, ' ')}
                    </p>
                  </div>
                </div>
              )}

              {/* Proof of Delivery */}
              {shipment.proof_of_delivery_url && (
                <div className="mt-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest m-0 mb-2" style={{ color: '#c084fc' }}>
                    Proof of Delivery
                  </p>
                  <img
                    src={shipment.proof_of_delivery_url}
                    alt="Proof of delivery"
                    className="w-full rounded-xl object-cover"
                    style={{ maxHeight: 200, border: '1px solid rgba(168,85,247,0.2)' }}
                    onError={e => { e.currentTarget.style.display = 'none'; }}
                  />
                </div>
              )}

            </Section>

            {/* Tracking info — external courier only */}
            {isExternalCourier && hasTracking && (
              <Section title="Tracking" icon={MapPin}
                accent="linear-gradient(90deg,#3b82f6,#2563eb)">

                {/* Tracking number row */}
                <div className="flex items-center justify-between gap-3 p-3 rounded-xl mb-3"
                  style={{ background: 'rgba(168,85,247,0.04)', border: '1px solid rgba(168,85,247,0.12)' }}>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest m-0 mb-0.5" style={{ color: '#c084fc' }}>
                      Tracking Number
                    </p>
                    <p className="text-sm font-bold font-mono m-0" style={{ color: '#111827' }}>
                      {shipment.tracking_number}
                    </p>
                  </div>
                  <button onClick={handleCopyTracking} type="button"
                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                    style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)' }}
                    title="Copy tracking number"
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.15)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(168,85,247,0.08)'}>
                    <Copy size={13} color="#a855f7" />
                  </button>
                </div>

                {/* Track on courier site */}
                {shipment.tracking_url && (
                  <a href={shipment.tracking_url} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#3b82f6,#2563eb)', color: 'white', fontSize: '0.875rem', fontWeight: 600, textDecoration: 'none', boxShadow: '0 4px 12px rgba(59,130,246,0.3)' }}>
                    <ExternalLink size={14} /> Track on {shipment.courier_name || 'Courier Site'}
                  </a>
                )}
              </Section>
            )}

            {/* In-store pickup info */}
            {shipment.workflow === 'instore' && (
              <div className="flex items-start gap-3 p-4 rounded-xl mb-5"
                style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
                <Info size={15} color="#10b981" className="flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold m-0 mb-1" style={{ color: '#065f46' }}>Ready for Pickup</p>
                  <p className="text-xs m-0" style={{ color: '#065f46', opacity: 0.8 }}>
                    Your order is ready at our store. Bring your order number when you come to collect.
                  </p>
                </div>
              </div>
            )}

          </div>

          {/* ── Right column ── */}
          <div>

            {/* Shipment details */}
            <Section title="Shipment Details" icon={Package}
              accent="linear-gradient(90deg,#a855f7,#7c3aed)">
              <InfoRow label="Via"       value={WORKFLOW_LABELS[shipment.workflow] || shipment.workflow_label} />
              <InfoRow label="Courier"   value={shipment.courier_name} />
              {shipment.workflow === 'internal' && shipment.driver_name && (
                <InfoRow label="Driver" value={shipment.driver_name} />
              )}
              <InfoRow label="Expected"  value={shipment.estimated_delivery_date ? safeFormat(shipment.estimated_delivery_date, 'MMM d, yyyy') : null} />
              <InfoRow label="Delivered" value={shipment.delivered_at ? safeFormat(shipment.delivered_at, 'MMM d, yyyy · h:mm a') : null} />
            </Section>

            {/* Quick actions card */}
            <Section title="Actions" icon={Info}>
              <div className="flex flex-col gap-2">

                <button onClick={() => navigate(`/orders/${orderId}`)} type="button"
                  className="w-full inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 text-sm font-semibold transition-colors hover:border-purple-300 hover:text-purple-500">
                  <Package size={14} /> View Order Details
                </button>

                {/* ✅ Track Live Button (Mobile friendly placement) */}
                {isInternalActive && (
                  <button onClick={() => setTrackingModal(true)} type="button"
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-white text-sm font-semibold"
                    style={{ background: 'linear-gradient(135deg,#a855f7,#7c3aed)', boxShadow: '0 4px 12px rgba(168,85,247,0.3)' }}>
                    <Navigation size={14} /> Track Driver Live
                  </button>
                )}

                {isDelivered && (
                  <button onClick={() => setRatingModal(true)} type="button"
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-white text-sm font-semibold"
                    style={{ background: 'linear-gradient(135deg,#fbbf24,#d97706)', boxShadow: '0 4px 12px rgba(245,158,11,0.25)' }}>
                    <Star size={14} /> Rate This Delivery
                  </button>
                )}

                <button onClick={() => setIncidentModal(true)} type="button"
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold"
                  style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444' }}>
                  <Flag size={14} /> Report an Issue
                </button>

              </div>
            </Section>

          </div>
        </div>
      </div>

      <Footer />

      {/* ── Modals ────────────────────────────────────────────────────── */}
      {ratingModal && (
        <DeliveryRatingModal
          orderId={orderId}
          deliveryItemId={shipment?.delivery_item_id}
          onClose={() => setRatingModal(false)}
          onSuccess={() => { setRatingModal(false); toast.success('Thanks for your rating!'); }}
        />
      )}

      {incidentModal && (
        <DeliveryIncidentModal
          orderId={orderId}
          driverName={shipment?.driver_name}
          driverId={shipment?.driver_id}
          deliveryItemId={shipment?.delivery_item_id}
          manifestId={shipment?.manifest_id}
          onClose={() => setIncidentModal(false)}
          onSuccess={() => { setIncidentModal(false); toast.success('Incident reported. We\'ll look into it.'); }}
        />
      )}

      {trackingModal && (
        <DriverTrackingModal
            isOpen={trackingModal}
            onClose={() => setTrackingModal(false)}
            orderId={orderId}
            manifest={{
                manifest_number: shipment.tracking_number || `Order #${orderId}`,
                driver_name: shipment.driver_name || 'Our Driver',
            }}
            shipment={shipment}  // ← adds delivery_notes, proof_of_delivery_url, your_status etc.
        />
    )}
    </div>
  );
}