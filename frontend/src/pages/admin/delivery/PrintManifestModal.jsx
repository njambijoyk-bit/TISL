import { useState, useMemo } from 'react';
import {
    X, Printer, Download, FileText, Truck, User,
    ChevronRight, ChevronLeft, CheckSquare, Square,
    FileSpreadsheet,
} from 'lucide-react';
import useAuthStore from '../../../store/authStore';
import {
    D, DeliveryBtn,
} from './DeliveryShared';
import {
    shapeAdminData, shapeDriverData, shapeCustomerData,
    triggerPrint, exportAdminCSV, exportAdminXLS,
} from './usePrintManifest';

// ─────────────────────────────────────────────────────────────────────────────
// PRINT STYLES — injected into opened print window
// ─────────────────────────────────────────────────────────────────────────────
// Light overrides for white modal
const L = {
    text:    '#111111',
    textDim: '#6b7280',
    border:  '#e5e7eb',
    bg:      '#f9fafb',
    bgHover: '#f3f4f6',
};
const PRINT_BASE_CSS = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 10.5pt; color: #111; background: #fff; }
    @page { margin: 14mm 12mm; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 5px 7px; border: 1px solid #ddd; text-align: left; font-size: 10pt; }
    th { background: #f3f4f6; font-weight: 700; }
    h1 { font-size: 16pt; } h2 { font-size: 13pt; } h3 { font-size: 11pt; }
    .page-break { page-break-after: always; }
    .no-break { page-break-inside: avoid; }
    .sig-block { border: 1px solid #ccc; padding: 10px 14px; margin-top: 8px; min-height: 60px; }
    .sig-line { border-bottom: 1px solid #888; margin-top: 28px; margin-bottom: 4px; }
    .label { font-size: 8.5pt; color: #555; text-transform: uppercase; letter-spacing: 0.05em; }
    .badge { display: inline-block; padding: 2px 7px; border-radius: 3px; font-size: 8.5pt; font-weight: 700; background: #f3f4f6; }
    .credit-block { background: #fff8e1; border: 1px solid #ffe082; padding: 6px 10px; border-radius: 4px; margin-top: 6px; }
    .header-bar { border-bottom: 2.5px solid #111; padding-bottom: 8px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: flex-end; }
    .footer-bar { border-top: 1px solid #ccc; margin-top: 20px; padding-top: 8px; font-size: 8.5pt; color: #555; display: flex; justify-content: space-between; }
    .stop-header { background: #111; color: #fff; padding: 5px 10px; margin: 18px 0 6px; font-weight: 700; font-size: 10.5pt; display: flex; justify-content: space-between; }
    .checkbox-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; border-bottom: 1px dotted #ddd; }
    .checkbox-box { width: 13px; height: 13px; border: 1.5px solid #333; flex-shrink: 0; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; margin: 8px 0; }
    .info-row { display: flex; flex-direction: column; gap: 1px; }
    .delivery-note-header { text-align: center; padding-bottom: 10px; border-bottom: 2px solid #111; margin-bottom: 14px; }
    .totals-table td { border: none; padding: 3px 7px; } 
    .totals-table td:last-child { text-align: right; font-weight: 600; }
    .total-row td { border-top: 2px solid #111 !important; font-weight: 700; font-size: 11pt; }
`;

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENT RENDERERS (hidden divs → print)
// ─────────────────────────────────────────────────────────────────────────────

function AdminReportHTML({ data }) {
    if (!data) return null;
    return (
        <div id="print-admin-report" style={{ display: 'none' }}>
            <style>{PRINT_BASE_CSS}</style>

            {/* ── Cover / manifest header ── */}
            <div className="no-break">
                <div className="header-bar">
                    <div>
                        <h1>TISL — Admin Manifest Report</h1>
                        <div style={{ fontSize: '10pt', marginTop: 3, color: '#444' }}>
                            Confidential — Internal Use Only
                        </div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '10pt' }}>
                        <div><strong>{data.manifest.number}</strong></div>
                        <div>{data.manifest.scheduledDate}</div>
                        <span className="badge">{data.manifest.status}</span>
                    </div>
                </div>

                <div className="info-grid" style={{ marginBottom: 12 }}>
                    <div className="info-row"><span className="label">Driver</span><span>{data.driver.name}</span></div>
                    <div className="info-row"><span className="label">Driver Phone</span><span>{data.driver.phone}</span></div>
                    <div className="info-row"><span className="label">Assigned By</span><span>{data.manifest.assigner}</span></div>
                    <div className="info-row"><span className="label">Delivery Method</span><span>{data.manifest.method}</span></div>
                    <div className="info-row"><span className="label">Dispatched At</span><span>{data.manifest.dispatchedAt}</span></div>
                    <div className="info-row"><span className="label">Completed At</span><span>{data.manifest.completedAt}</span></div>
                    {data.manifest.distanceKm && (
                        <div className="info-row"><span className="label">Total Distance</span><span>{data.manifest.distanceKm} km</span></div>
                    )}
                    {data.manifest.durationMins && (
                        <div className="info-row"><span className="label">Duration</span><span>{data.manifest.durationMins} mins</span></div>
                    )}
                    <div className="info-row"><span className="label">Total Stops</span><span>{data.totalStops}</span></div>
                </div>

                {data.manifest.notes && (
                    <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', padding: '7px 10px', marginBottom: 10, fontSize: '10pt' }}>
                        <span className="label">Notes: </span>{data.manifest.notes}
                    </div>
                )}
            </div>

            {/* ── Stops ── */}
            {data.stops.map((stop, i) => (
                <div key={stop.itemId} className={i < data.stops.length - 1 ? 'no-break' : ''}>
                    <div className="stop-header">
                        <span>Stop {stop.stopNo} — {stop.order.number}</span>
                        <span>{stop.status}</span>
                    </div>

                    <div className="info-grid">
                        <div className="info-row"><span className="label">Customer #</span><span>{stop.customer.number}</span></div>
                        <div className="info-row"><span className="label">Name</span><span>{stop.customer.name}{stop.customer.company ? ` (${stop.customer.company})` : ''}</span></div>
                        <div className="info-row"><span className="label">Phone</span><span>{stop.customer.phone}{stop.customer.alternatePhone ? ` / ${stop.customer.alternatePhone}` : ''}</span></div>
                        <div className="info-row"><span className="label">Email</span><span>{stop.customer.email}</span></div>
                        <div className="info-row"><span className="label">Type</span><span>{stop.customer.type}</span></div>
                        <div className="info-row"><span className="label">Tier</span><span>{stop.customer.tier}</span></div>
                        <div className="info-row" style={{ gridColumn: '1 / -1' }}><span className="label">Delivery Address</span><span>{stop.order.shippingAddress}</span></div>
                    </div>

                    {stop.customer.hasCreditAccount && (
                        <div className="credit-block">
                            <strong>⚠ Credit Account</strong> &nbsp;|&nbsp;
                            Limit: {stop.customer.creditLimit} &nbsp;|&nbsp;
                            Used: {stop.customer.creditUsed} &nbsp;|&nbsp;
                            Available: {stop.customer.availableCredit}
                        </div>
                    )}

                    <table style={{ marginTop: 8 }}>
                        <thead>
                            <tr>
                                <th style={{ width: '40%' }}>Product</th>
                                <th>SKU</th>
                                <th style={{ width: 50 }}>Qty</th>
                                <th>Unit Price</th>
                                <th>Line Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {stop.orderItems.map((oi, j) => (
                                <tr key={j}>
                                    <td>{oi.product}</td>
                                    <td>{oi.sku}</td>
                                    <td>{oi.qty}</td>
                                    <td>{oi.unitPrice}</td>
                                    <td>{oi.lineTotal}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <table className="totals-table" style={{ marginTop: 4, width: '40%', marginLeft: 'auto' }}>
                        <tbody>
                            <tr><td>Subtotal</td><td>{stop.order.subtotalKes}</td></tr>
                            <tr><td>Shipping ({stop.order.shippingMethod})</td><td>{stop.order.shippingCost}</td></tr>
                            <tr className="total-row"><td>Total</td><td>{stop.order.totalKes}</td></tr>
                        </tbody>
                    </table>

                    <div className="info-grid" style={{ marginTop: 6 }}>
                        <div className="info-row"><span className="label">Payment Method</span><span>{stop.order.paymentMethod}</span></div>
                        {stop.deliveredAt !== '—' && <div className="info-row"><span className="label">Delivered At</span><span>{stop.deliveredAt}</span></div>}
                        {stop.failedReason && <div className="info-row" style={{ gridColumn: '1 / -1' }}><span className="label" style={{ color: '#b91c1c' }}>Failed Reason</span><span>{stop.failedReason}</span></div>}
                        {stop.deliveryNotes && <div className="info-row" style={{ gridColumn: '1 / -1' }}><span className="label">Delivery Notes</span><span>{stop.deliveryNotes}</span></div>}
                    </div>

                    {i < data.stops.length - 1 && <div className="page-break" />}
                </div>
            ))}

            {/* ── Footer ── */}
            <div className="footer-bar">
                <span>Manifest {data.manifest.number} — {data.totalStops} stops</span>
                <span>Printed by {data.printedBy} on {data.printedAt}</span>
            </div>
        </div>
    );
}

function DriverSheetHTML({ data }) {
    if (!data) return null;
    return (
        <div id="print-driver-sheet" style={{ display: 'none' }}>
            <style>{PRINT_BASE_CSS}</style>

            {/* ── Driver sheet header ── */}
            <div className="header-bar no-break">
                <div>
                    <h1>Delivery Sheet</h1>
                    <div style={{ fontSize: '10pt', marginTop: 3 }}>
                        Driver copy — retain until all stops complete
                    </div>
                </div>
                <div style={{ textAlign: 'right', fontSize: '10pt' }}>
                    <div><strong>{data.manifest.number}</strong></div>
                    <div>{data.manifest.scheduledDate}</div>
                </div>
            </div>

            <div className="info-grid no-break" style={{ marginBottom: 14 }}>
                <div className="info-row"><span className="label">Driver</span><span><strong>{data.driver.name}</strong></span></div>
                <div className="info-row"><span className="label">Phone</span><span>{data.driver.phone}</span></div>
                <div className="info-row"><span className="label">Total Stops</span><span>{data.totalStops}</span></div>
                <div className="info-row"><span className="label">Date</span><span>{data.manifest.scheduledDate}</span></div>
            </div>

            {/* ── Stops ── */}
            {data.stops.map((stop, i) => (
                <div key={stop.itemId} className="no-break" style={{ marginBottom: 24 }}>
                    <div className="stop-header">
                        <span>Stop {stop.stopNo} — {stop.order.number}</span>
                        <span>{stop.customer.name}</span>
                    </div>

                    <div className="info-grid" style={{ margin: '6px 0 10px' }}>
                        <div className="info-row"><span className="label">Customer</span><span>{stop.customer.name}</span></div>
                        <div className="info-row"><span className="label">Phone</span><span>{stop.customer.phone}</span></div>
                        <div className="info-row" style={{ gridColumn: '1 / -1' }}><span className="label">Delivery Address</span><span>{stop.order.shippingAddress}</span></div>
                    </div>

                    {/* Item checklist */}
                    <div style={{ border: '1px solid #ddd', padding: '8px 12px', background: '#fafafa' }}>
                        <div className="label" style={{ marginBottom: 6 }}>Items to deliver — tick each item as you hand it over</div>
                        {stop.orderItems.map((oi, j) => (
                            <div key={j} className="checkbox-row">
                                <div className="checkbox-box" />
                                <span style={{ flex: 1, fontSize: '10.5pt' }}>{oi.product}</span>
                                <span style={{ fontWeight: 700, fontSize: '10.5pt' }}>×{oi.qty}</span>
                            </div>
                        ))}
                        {stop.orderItems.length === 0 && (
                            <div style={{ fontSize: '9.5pt', color: '#888', fontStyle: 'italic' }}>No items listed</div>
                        )}
                    </div>

                    {/* Signature block */}
                    <div className="sig-block" style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                        <div>
                            <div className="label">Customer signature</div>
                            <div className="sig-line" />
                            <div style={{ display: 'flex', gap: 20, marginTop: 6 }}>
                                <div style={{ flex: 1 }}>
                                    <div className="label">Name</div>
                                    <div className="sig-line" style={{ marginTop: 14 }} />
                                </div>
                                <div>
                                    <div className="label">Date</div>
                                    <div className="sig-line" style={{ marginTop: 14, width: 90 }} />
                                </div>
                            </div>
                        </div>
                        <div>
                            <div className="label">Driver signature</div>
                            <div className="sig-line" />
                            <div style={{ display: 'flex', gap: 20, marginTop: 6 }}>
                                <div style={{ flex: 1 }}>
                                    <div className="label">Name</div>
                                    <div className="sig-line" style={{ marginTop: 14 }} />
                                </div>
                                <div>
                                    <div className="label">Date</div>
                                    <div className="sig-line" style={{ marginTop: 14, width: 90 }} />
                                </div>
                            </div>
                        </div>
                    </div>

                    {i < data.stops.length - 1 && <div className="page-break" />}
                </div>
            ))}

            <div className="footer-bar">
                <span>Manifest {data.manifest.number} — {data.totalStops} stops</span>
                <span>Printed {data.printedAt}</span>
            </div>
        </div>
    );
}

function CustomerNotesHTML({ notes }) {
    if (!notes || notes.length === 0) return null;
    return (
        <div id="print-customer-notes" style={{ display: 'none' }}>
            <style>{PRINT_BASE_CSS}</style>
            {notes.map((note, i) => (
                <div key={i} className={i < notes.length - 1 ? 'page-break' : ''}>
                    <div className="delivery-note-header">
                        <div style={{ fontSize: '8.5pt', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#555', marginBottom: 3 }}>TISL</div>
                        <h1 style={{ fontSize: '17pt' }}>Delivery Note</h1>
                        <div style={{ fontSize: '10pt', marginTop: 4, color: '#444' }}>
                            Please retain this note as proof of delivery
                        </div>
                    </div>

                    <div className="info-grid" style={{ marginBottom: 14 }}>
                        <div className="info-row"><span className="label">Delivery Note Ref</span><span><strong>{note.order.number}</strong></span></div>
                        <div className="info-row"><span className="label">Manifest Ref</span><span>{note.manifestNumber}</span></div>
                        <div className="info-row"><span className="label">Delivery Date</span><span>{note.deliveryDate}</span></div>
                        <div className="info-row"><span className="label">Customer #</span><span>{note.customer.number}</span></div>
                        <div className="info-row"><span className="label">Customer Name</span><span>{note.customer.name}{note.customer.company ? ` — ${note.customer.company}` : ''}</span></div>
                        <div className="info-row"><span className="label">Phone</span><span>{note.customer.phone}</span></div>
                        <div className="info-row" style={{ gridColumn: '1 / -1' }}><span className="label">Delivery Address</span><span>{note.order.shippingAddress}</span></div>
                    </div>

                    <table>
                        <thead>
                            <tr>
                                <th style={{ width: '45%' }}>Product</th>
                                <th style={{ width: 50 }}>Qty</th>
                                <th>Unit Price</th>
                                <th>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {note.orderItems.map((oi, j) => (
                                <tr key={j}>
                                    <td>{oi.product}</td>
                                    <td>{oi.qty}</td>
                                    <td>{oi.unitPrice}</td>
                                    <td>{oi.lineTotal}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <table className="totals-table" style={{ marginTop: 6, width: '40%', marginLeft: 'auto' }}>
                        <tbody>
                            <tr><td>Subtotal</td><td>{note.order.subtotalKes}</td></tr>
                            <tr><td>Shipping ({note.order.shippingMethod})</td><td>{note.order.shippingCost}</td></tr>
                            <tr className="total-row"><td>Total</td><td>{note.order.totalKes}</td></tr>
                        </tbody>
                    </table>

                    <div className="info-grid" style={{ marginTop: 10 }}>
                        <div className="info-row"><span className="label">Payment Method</span><span>{note.order.paymentMethod}</span></div>
                    </div>

                    {/* Signature block */}
                    <div className="sig-block" style={{ marginTop: 16 }}>
                        <div className="label" style={{ marginBottom: 10 }}>Receipt confirmation</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 20 }}>
                            <div>
                                <div className="label">Received by (full name)</div>
                                <div className="sig-line" />
                            </div>
                            <div>
                                <div className="label">Signature</div>
                                <div className="sig-line" />
                            </div>
                            <div>
                                <div className="label">Date</div>
                                <div className="sig-line" />
                            </div>
                        </div>
                    </div>

                    <div className="footer-bar">
                        <span>Order {note.order.number} | Customer {note.customer.number}</span>
                        <span>Manifest {note.manifestNumber}</span>
                    </div>
                </div>
            ))}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL SHELL STYLES
// ─────────────────────────────────────────────────────────────────────────────

const overlay = {
    position:        'fixed',
    inset:           0,
    background:      'rgba(0,0,0,0.7)',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    zIndex:          1000,
    padding:         '20px 16px',
};

const modal = {
    background:    '#ffffff',
    border:        '1px solid #e5e7eb',
    borderRadius:  D.radiusLg,
    width:         '100%',
    maxWidth:      560,
    maxHeight:     '90vh',
    overflow:      'hidden',
    display:       'flex',
    flexDirection: 'column',
};

const modalHeader = {
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'space-between',
    padding:         '16px 20px',
    borderBottom:    '1px solid #e5e7eb',
    flexShrink:      0,
};

const modalBody = {
    padding:    '20px',
    overflowY:  'auto',
    flex:       1,
};

const modalFooter = {
    padding:         '14px 20px',
    borderTop:       '1px solid #e5e7eb',
    display:         'flex',
    gap:             10,
    justifyContent:  'flex-end',
    flexShrink:      0,
};

// ─────────────────────────────────────────────────────────────────────────────
// TYPE CARDS
// ─────────────────────────────────────────────────────────────────────────────

const DOC_TYPES = [
    {
        id:    'admin',
        icon:  FileText,
        label: 'Admin Report',
        desc:  'Full detail — customers, credit, all items, financials. Multipage.',
        color: D.purple,
    },
    {
        id:    'driver',
        icon:  Truck,
        label: 'Driver Sheet',
        desc:  'All stops in order with item checklists and signature blocks.',
        color: D.teal,
    },
    {
        id:    'customer',
        icon:  User,
        label: 'Customer Delivery Notes',
        desc:  'One delivery note per order. Customer keeps as proof of receipt.',
        color: '#f59e0b',
    },
];

function TypeCard({ type, selected, onClick }) {
    const Icon = type.icon;
    return (
        <div
            onClick={onClick}
            style={{
                display:      'flex',
                alignItems:   'flex-start',
                gap:          14,
                padding:      '14px 16px',
                borderRadius: D.radiusSm,
                border:       `1.5px solid ${selected ? type.color : D.purpleBorder}`,
                background:   selected ? `${type.color}14` : 'transparent',
                cursor:       'pointer',
                transition:   'all 0.15s',
                userSelect:   'none',
            }}
        >
            <div style={{
                width: 36, height: 36, borderRadius: D.radiusSm,
                background: `${type.color}1a`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
            }}>
                <Icon size={18} color={type.color} />
            </div>
            <div>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: D.text, marginBottom: 3 }}>
                    {type.label}
                </div>
                <div style={{ fontSize: '0.75rem', color: D.textDim, lineHeight: 1.4 }}>
                    {type.desc}
                </div>
            </div>
            {selected && (
                <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
                    <CheckSquare size={16} color={type.color} />
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN MODAL
// ─────────────────────────────────────────────────────────────────────────────

export default function PrintManifestModal({ manifest, open, onClose, audio }) {
    const user = useAuthStore(s => s.user);

    const [step,          setStep]          = useState(1); // 1 = type, 2 = options, 3 = ready
    const [docType,       setDocType]       = useState(null); // 'admin' | 'driver' | 'customer'
    const [adminFormat,   setAdminFormat]   = useState('pdf'); // 'pdf' | 'xls' | 'csv'
    const [selectedOrders, setSelectedOrders] = useState(null); // null = all

    // ── shape data (memoised) ────────────────────────────────────────────────
    const adminData    = useMemo(() => manifest ? shapeAdminData(manifest, user?.name)    : null, [manifest, user]);
    const driverData   = useMemo(() => manifest ? shapeDriverData(manifest)               : null, [manifest]);
    const customerNotes = useMemo(() => manifest
        ? shapeCustomerData(manifest, selectedOrders)
        : [], [manifest, selectedOrders]);

    const allOrders = useMemo(() =>
        (manifest?.items ?? []).map(item => ({
            id:     item.order?.id,
            number: item.order?.order_number ?? '—',
            customer: item.order?.customer
                ? `${item.order.customer.first_name ?? ''} ${item.order.customer.last_name ?? ''}`.trim()
                : '—',
        })).filter(o => o.id),
    [manifest]);

    if (!open || !manifest) return null;

    const handleClose = () => {
        setStep(1);
        setDocType(null);
        setAdminFormat('pdf');
        setSelectedOrders(null);
        onClose();
    };

    const canNext = () => {
        if (step === 1) return !!docType;
        if (step === 2) return true;
        return false;
    };

    const handleNext = () => {
        if (step === 1) {
            // driver has no options step — go straight to ready
            setStep(docType === 'driver' ? 3 : 2);
        } else {
            setStep(3);
        }
        audio?.playHover();
    };

    const handleBack = () => {
        setStep(s => (s === 3 && docType === 'driver') ? 1 : s - 1);
        audio?.playHover();
    };

    const handleGenerate = () => {
        audio?.playDownload?.();

        if (docType === 'admin') {
            const data = adminData;
            if (adminFormat === 'csv') return exportAdminCSV(data, manifest);
            if (adminFormat === 'xls') return exportAdminXLS(data, manifest);
            // PDF
            triggerPrint('print-admin-report');
        } else if (docType === 'driver') {
            triggerPrint('print-driver-sheet');
        } else if (docType === 'customer') {
            triggerPrint('print-customer-notes');
        }
    };

    const toggleOrder = (id) => {
        setSelectedOrders(prev => {
            const all = allOrders.map(o => o.id);
            const current = prev ?? all;
            if (current.includes(id)) {
                const next = current.filter(x => x !== id);
                return next.length === all.length ? null : next;
            } else {
                const next = [...current, id];
                return next.length === all.length ? null : next;
            }
        });
    };

    const selectedCount = selectedOrders === null ? allOrders.length : selectedOrders.length;

    // ── step labels ──────────────────────────────────────────────────────────
    const stepLabels = docType === 'driver'
        ? ['Choose type', 'Ready']
        : ['Choose type', 'Options', 'Ready'];

    const currentStepLabel = docType === 'driver'
        ? (step === 1 ? 'Choose type' : 'Ready')
        : ['Choose type', 'Options', 'Ready'][step - 1];

    return (
        <>
            {/* Hidden print renderers — always mounted when modal is open */}
            <AdminReportHTML    data={adminData} />
            <DriverSheetHTML    data={driverData} />
            <CustomerNotesHTML  notes={customerNotes} />

            <div style={overlay} onClick={e => e.target === e.currentTarget && handleClose()}>
                <div style={modal}>

                    {/* ── Header ── */}
                    <div style={modalHeader}>
                        <div>
                            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: D.text, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Printer size={15} color={D.purple} />
                                Print / Export
                            </div>
                            <div style={{ fontSize: '0.72rem', color: D.textDim, marginTop: 2 }}>
                                {manifest.manifest_number} &nbsp;·&nbsp; {currentStepLabel}
                            </div>
                        </div>
                        <button onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: D.textDim, padding: 4 }}>
                            <X size={16} />
                        </button>
                    </div>

                    {/* ── Step indicator ── */}
                    <div style={{ display: 'flex', padding: '10px 20px 0', gap: 6 }}>
                        {stepLabels.map((label, i) => {
                            const stepNum = i + 1;
                            const realStep = docType === 'driver' && stepNum === 2 ? 3 : stepNum;
                            const active   = step === realStep;
                            const done     = step > realStep;
                            return (
                                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <div style={{
                                        width: 20, height: 20, borderRadius: '50%',
                                        background:  done ? D.teal : active ? D.purple : D.purpleDim,
                                        display:     'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize:    '0.65rem', fontWeight: 700,
                                        color:       done || active ? '#fff' : D.textDim,
                                        flexShrink:  0,
                                    }}>
                                        {stepNum}
                                    </div>
                                    <span style={{ fontSize: '0.72rem', color: active ? D.text : D.textDim, fontWeight: active ? 600 : 400 }}>
                                        {label}
                                    </span>
                                    {i < stepLabels.length - 1 && (
                                        <ChevronRight size={12} color={D.textDim} />
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* ── Body ── */}
                    <div style={modalBody}>

                        {/* Step 1 — Choose type */}
                        {step === 1 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <div style={{ fontSize: '0.8rem', color: D.textDim, marginBottom: 6 }}>
                                    Select the document you want to generate for manifest <strong style={{ color: D.text }}>{manifest.manifest_number}</strong>.
                                </div>
                                {DOC_TYPES.map(type => (
                                    <TypeCard
                                        key={type.id}
                                        type={type}
                                        selected={docType === type.id}
                                        onClick={() => { setDocType(type.id); audio?.playHover(); }}
                                    />
                                ))}
                            </div>
                        )}

                        {/* Step 2 — Options */}
                        {step === 2 && docType === 'admin' && (
                            <div>
                                <div style={{ fontSize: '0.8rem', color: D.textDim, marginBottom: 16 }}>
                                    Choose an export format for the admin report.
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {[
                                        { id: 'pdf', icon: Printer,         label: 'PDF',   desc: 'Print-ready. Opens in a new tab for printing or saving.' },
                                        { id: 'xls', icon: FileSpreadsheet, label: 'Excel', desc: 'Two sheets — summary and stop detail. Download immediately.' },
                                        { id: 'csv', icon: FileText,        label: 'CSV',   desc: 'Flat file. All stops and items, one row per line item.' },
                                    ].map(fmt => {
                                        const Icon = fmt.icon;
                                        const active = adminFormat === fmt.id;
                                        return (
                                            <div
                                                key={fmt.id}
                                                onClick={() => { setAdminFormat(fmt.id); audio?.playHover(); }}
                                                style={{
                                                    display:      'flex',
                                                    alignItems:   'center',
                                                    gap:          12,
                                                    padding:      '12px 14px',
                                                    borderRadius: D.radiusSm,
                                                    border:       `1.5px solid ${active ? D.purple : D.purpleBorder}`,
                                                    background:   active ? D.purpleDim : 'transparent',
                                                    cursor:       'pointer',
                                                    transition:   'all 0.15s',
                                                }}
                                            >
                                                <Icon size={16} color={active ? D.purple : D.textDim} />
                                                <div>
                                                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: D.text }}>{fmt.label}</div>
                                                    <div style={{ fontSize: '0.73rem', color: D.textDim }}>{fmt.desc}</div>
                                                </div>
                                                {active && <CheckSquare size={15} color={D.purple} style={{ marginLeft: 'auto' }} />}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {step === 2 && docType === 'customer' && (
                            <div>
                                <div style={{ fontSize: '0.8rem', color: D.textDim, marginBottom: 14 }}>
                                    Each order gets its own delivery note. Select which orders to include.
                                </div>
                                <div
                                    onClick={() => { setSelectedOrders(null); audio?.playHover(); }}
                                    style={{
                                        display:      'flex',
                                        alignItems:   'center',
                                        gap:          10,
                                        padding:      '10px 14px',
                                        borderRadius: D.radiusSm,
                                        border:       `1.5px solid ${selectedOrders === null ? '#f59e0b' : D.purpleBorder}`,
                                        background:   selectedOrders === null ? 'rgba(245,158,11,0.08)' : 'transparent',
                                        cursor:       'pointer',
                                        marginBottom: 10,
                                    }}
                                >
                                    {selectedOrders === null
                                        ? <CheckSquare size={15} color="#f59e0b" />
                                        : <Square size={15} color={D.textDim} />
                                    }
                                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: D.text }}>
                                        All orders ({allOrders.length})
                                    </span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {allOrders.map(o => {
                                        const checked = selectedOrders === null || selectedOrders.includes(o.id);
                                        return (
                                            <div
                                                key={o.id}
                                                onClick={() => { toggleOrder(o.id); audio?.playHover(); }}
                                                style={{
                                                    display:      'flex',
                                                    alignItems:   'center',
                                                    gap:          10,
                                                    padding:      '9px 14px',
                                                    borderRadius: D.radiusSm,
                                                    border:       `1px solid ${D.purpleBorder}`,
                                                    cursor:       'pointer',
                                                    background:   checked ? 'rgba(245,158,11,0.05)' : 'transparent',
                                                }}
                                            >
                                                {checked
                                                    ? <CheckSquare size={14} color="#f59e0b" />
                                                    : <Square size={14} color={D.textDim} />
                                                }
                                                <div>
                                                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: D.text }}>{o.number}</div>
                                                    <div style={{ fontSize: '0.72rem', color: D.textDim }}>{o.customer}</div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Step 3 — Ready */}
                        {step === 3 && (
                            <div style={{ textAlign: 'center', padding: '24px 0' }}>
                                <div style={{
                                    width: 56, height: 56, borderRadius: '50%',
                                    background: D.purpleDim,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    margin: '0 auto 16px',
                                }}>
                                    <Printer size={24} color={D.purple} />
                                </div>
                                <div style={{ fontSize: '1rem', fontWeight: 700, color: D.text, marginBottom: 8 }}>
                                    Ready to generate
                                </div>
                                <div style={{ fontSize: '0.82rem', color: D.textDim, lineHeight: 1.5 }}>
                                    {docType === 'admin' && adminFormat === 'pdf' &&
                                        'Admin report will open in a new tab for printing or saving as PDF.'}
                                    {docType === 'admin' && adminFormat === 'xls' &&
                                        'Excel file will download immediately with two sheets.'}
                                    {docType === 'admin' && adminFormat === 'csv' &&
                                        'CSV file will download immediately.'}
                                    {docType === 'driver' &&
                                        `Driver sheet — ${driverData?.totalStops} stop${driverData?.totalStops !== 1 ? 's' : ''} with item checklists and signature blocks.`}
                                    {docType === 'customer' &&
                                        `${selectedCount} delivery note${selectedCount !== 1 ? 's' : ''} — one per order, all in one print job.`}
                                </div>

                                {/* Summary pill */}
                                <div style={{
                                    display:      'inline-flex',
                                    alignItems:   'center',
                                    gap:          8,
                                    marginTop:    16,
                                    padding:      '6px 14px',
                                    borderRadius: 20,
                                    background:   D.purpleDim,
                                    border:       `1px solid ${D.purpleBorder}`,
                                    fontSize:     '0.78rem',
                                    color:        D.purple,
                                    fontWeight:   600,
                                }}>
                                    {DOC_TYPES.find(t => t.id === docType)?.label}
                                    {docType === 'admin' && ` — ${adminFormat.toUpperCase()}`}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ── Footer ── */}
                    <div style={modalFooter}>
                        {step > 1 && (
                            <DeliveryBtn variant="ghost" size="sm" onClick={handleBack} onHover={audio?.playHover} style={{ marginRight: 'auto' }}>
                                <ChevronLeft size={13} /> Back
                            </DeliveryBtn>
                        )}

                        {step < 3 && (
                            <DeliveryBtn
                                variant="ghost"
                                size="sm"
                                onClick={handleClose}
                                onHover={audio?.playHover}
                            >
                                Cancel
                            </DeliveryBtn>
                        )}

                        {step < 3 ? (
                            <DeliveryBtn
                                variant="primary"
                                size="sm"
                                onClick={handleNext}
                                onHover={audio?.playHover}
                                disabled={!canNext()}
                            >
                                Next <ChevronRight size={13} />
                            </DeliveryBtn>
                        ) : (
                            <>
                                <DeliveryBtn variant="ghost" size="sm" onClick={handleClose} onHover={audio?.playHover}>
                                    Cancel
                                </DeliveryBtn>
                                <DeliveryBtn
                                    variant="primary"
                                    size="sm"
                                    onClick={handleGenerate}
                                    onHover={audio?.playHover}
                                >
                                    {docType === 'admin' && adminFormat !== 'pdf'
                                        ? <><Download size={13} /> Download {adminFormat.toUpperCase()}</>
                                        : <><Printer size={13} /> Print / Save PDF</>
                                    }
                                </DeliveryBtn>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}