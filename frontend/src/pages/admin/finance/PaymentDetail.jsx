import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Phone, FileText, RefreshCw } from 'lucide-react';
import { Panel, Btn, purple, purpleBd, SectionLabel, Pill } from '../../../lib/finance-ui';
import AdminLayout from '../../../components/layout/AdminLayout';
import DisputePanel from './components/DisputePanel';
import PaymentStatusPoller from './PaymentStatusPoller';
import paymentsAPI from '../../../api/payments';
import useAuthStore from '../../../store/authStore';
import toast from 'react-hot-toast';

export default function PaymentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [payment, setPayment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const { user } = useAuthStore();

  const fetchPayment = async () => {
    setLoading(true);
    try {
      const data = await paymentsAPI.getPayment(id);
      setPayment(data);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to load payment');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPayment(); }, [id]);

  const handleAction = async (type, payload) => {
    setActionLoading(true);
    try {
      let res;
      if (type === 'cancel') {
        res = await paymentsAPI.cancelPayment(id, payload?.reason || 'Manually cancelled');
      } else if (type === 'retry') {
        res = await paymentsAPI.retryPayment(id, payload || {});
      } else if (type === 'query-daraja') {
        res = await paymentsAPI.queryDarajaStatus(id);
      }

      toast.success(res.message || 'Action completed successfully');
      await fetchPayment(); // Refresh UI with latest state
    } catch (e) {
      toast.error(e.response?.data?.message || e.message || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <AdminLayout><div style={{padding:40, textAlign:'center'}}>Loading payment details...</div></AdminLayout>;
  if (!payment) return <AdminLayout><div style={{padding:40, textAlign:'center'}}>Payment not found</div></AdminLayout>;

  return (
    <AdminLayout>
      <div style={{ padding:20, maxWidth:1000, margin:'0 auto' }}>
        <Btn variant="ghost" icon={<ArrowLeft size={15}/>} onClick={()=>navigate('/admin/finance/payments')} style={{marginBottom:16}}>Back to Payments</Btn>
        <Panel accent style={{ marginBottom:20 }}>
            {/* ── Header: Payment # + Status + Method + Partial ─────────────────── */}
            <div style={{ padding:'18px 22px', display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:12 }}>
                <div>
                <h1 style={{ margin:0, fontSize:'1.4rem', fontWeight:900, color:purple, display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                    {payment.payment_number}
                    <Pill color={payment.status==='confirmed'?'#10b981':payment.status==='pending'?'#f59e0b':'#ef4444'}>
                    {payment.status}
                    </Pill>
                    {/* Method Pill */}
                    <Pill color="#3b82f6">
                    {payment.method?.replace('_', ' ').toUpperCase()}
                    </Pill>
                    {/* Is Partial Pill */}
                    {payment.is_partial && (
                    <Pill color="#f59e0b">Partial</Pill>
                    )}
                </h1>
                <p style={{ margin: '6px 0 0', fontSize: '0.85rem', color: '#9ca3af' }}>
                <span
                    onClick={() => navigate(`/admin/orders/${payment.order_id}`)}
                    style={{ color: '#3b82f6', cursor: 'pointer', textDecoration: 'underline' }}
                >
                    Order #{payment.order?.order_number}
                </span>
                {' '}• Initiated {new Date(payment.initiated_at).toLocaleString()}
                </p>
                </div>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                {payment.status==='pending' && (
                    <Btn variant="danger" size="sm" onClick={()=>handleAction('cancel', {reason:'Manually cancelled by admin'})} disabled={actionLoading}>Cancel</Btn>
                )}
                {payment.status==='failed' && (
                    <Btn variant="primary" size="sm" icon={<RefreshCw size={14}/>} onClick={()=>handleAction('retry')} disabled={actionLoading}>Retry</Btn>
                )}
                <Btn variant="outline" size="sm" icon={<FileText size={14}/>} onClick={()=>handleAction('query-daraja')} disabled={actionLoading}>Query Daraja</Btn>
                </div>
            </div>

            <div style={{ padding:'0 22px 12px', display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:12, borderTop:'1px solid rgba(168,85,247,0.1)' }}>
                {/* Customer */}
                <div>
                <p style={{ margin: 0, fontSize: '0.72rem', color: '#9ca3af' }}>Customer</p>
                {payment.customer ? (
                    <p
                    onClick={() => navigate(`/admin/customers/${payment.customer.id}`)}
                    style={{
                        margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#3b82f6',
                        cursor: 'pointer', textDecoration: 'underline',
                    }}
                    >
                    {`${payment.customer.first_name || ''} ${payment.customer.last_name || ''}`.trim() || '—'}
                    </p>
                ) : (
                    <p style={{ margin: 0, fontSize: '0.9rem', color: '#9ca3af' }}>—</p>
                )}
                {payment.customer?.email && (
                    <p style={{margin:0,fontSize:'0.75rem',color:'#6b7280'}}>{payment.customer.email}</p>
                )}
                </div>
                
                {/* Initiated By */}
                <div>
                <p style={{ margin: 0, fontSize: '0.72rem', color: '#9ca3af' }}>Initiated By</p>
                <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#374151' }}>
                    {payment.initiated_by?.name || payment.initiated_by?.email || '—'}
                </p>
                {payment.initiated_by?.role && (
                    <p style={{ margin: 0, fontSize: '0.7rem', color: '#9ca3af', textTransform: 'capitalize' }}>
                    {payment.initiated_by.role}
                    </p>
                )}
                </div>
                {/* Previous Payment */}
                <div>
                <p style={{ margin: 0, fontSize: '0.72rem', color: '#9ca3af' }}>Previous Payment</p>
                {payment.previous_payment_id ? (
                    <>
                    <p
                        onClick={() => navigate(`/admin/finance/payments/${payment.previous_payment_id}`)}
                        style={{
                        margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#a855f7',
                        cursor: 'pointer', textDecoration: 'underline',
                        }}
                    >
                        #{payment.previous_payment?.payment_number ?? payment.previous_payment_id}
                    </p>
                    <p style={{ margin: 0, fontSize: '0.7rem', color: '#9ca3af' }}>Retry attempt</p>
                    </>
                ) : (
                    <p style={{ margin: 0, fontSize: '0.9rem', color: '#9ca3af' }}>—</p>
                )}
                </div>
            </div>

            {/* ── Amounts Grid ─────────────────────────────────────────────────── */}
            <div style={{ padding:'12px 22px 20px', display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:16 }}>
                <div><p style={{margin:0,fontSize:'0.72rem',color:'#9ca3af'}}>Amount Expected</p><p style={{margin:0,fontSize:'1.1rem',fontWeight:800, color:'#f59e0b'}}>KES {Number(payment.amount_expected).toLocaleString()}</p></div>
                <div><p style={{margin:0,fontSize:'0.72rem',color:'#9ca3af'}}>Amount Received</p><p style={{margin:0,fontSize:'1.1rem',fontWeight:800,color:payment.amount_received?'#10b981':'#9ca3af'}}>{payment.amount_received?`KES ${payment.amount_received.toLocaleString()}`:'—'}</p></div>
                <div><p style={{margin:0,fontSize:'0.72rem',color:'#9ca3af'}}>Phone</p><p style={{margin:0,fontSize:'0.95rem',fontWeight:700,display:'flex', color:'#3b82f6',alignItems:'center',gap:4}}><Phone size={13}/>{payment.phone_number}</p></div>
            </div>
        </Panel>

        {payment.status === 'pending' && <PaymentStatusPoller paymentId={id} onStatusChange={fetchPayment} />}
        
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
        }}>
            <Panel>
            <div style={{ padding: 18, borderBottom: '1px solid #f3f4f6' }}>
                <SectionLabel>Transaction Details</SectionLabel>
            </div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* ── Phone ─────────────────────────────────────────────────────── */}
                <div>
                <p style={{ margin: '0 0 8px', fontSize: '0.67rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af' }}>
                    Phone
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                    <p style={{ margin: 0, fontSize: '0.72rem', color: '#9ca3af' }}>Number Sent</p>
                    <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: 700, color: '#374151', fontFamily: 'monospace' }}>
                        {payment.phone_number ?? '—'}
                    </p>
                    </div>
                    <div>
                    <p style={{ margin: 0, fontSize: '0.72rem', color: '#9ca3af' }}>Overridden</p>
                    <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: 700 }}>
                        {payment.phone_overridden ? (
                        <span style={{ color: '#f59e0b' }}>Yes</span>
                        ) : (
                        <span style={{ color: '#10b981' }}>No — customer phone used</span>
                        )}
                    </p>
                    </div>
                    {payment.phone_overridden && payment.phone_override_reason && (
                    <div style={{ gridColumn: 'span 2' }}>
                        <p style={{ margin: 0, fontSize: '0.72rem', color: '#9ca3af' }}>Override Reason</p>
                        <p style={{
                        margin: '4px 0 0', fontSize: '0.82rem', color: '#92400e',
                        background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
                        borderRadius: 7, padding: '6px 10px',
                        }}>
                        {payment.phone_override_reason}
                        </p>
                    </div>
                    )}
                </div>
                </div>

                {/* ── STK Push IDs ──────────────────────────────────────────────── */}
                <div>
                <p style={{ margin: '0 0 8px', fontSize: '0.67rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af' }}>
                    STK Push Reference
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                    <p style={{ margin: 0, fontSize: '0.72rem', color: '#9ca3af' }}>Merchant Request ID</p>
                    <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 600, color: '#374151', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                        {payment.merchant_request_id ?? '—'}
                    </p>
                    </div>
                    <div>
                    <p style={{ margin: 0, fontSize: '0.72rem', color: '#9ca3af' }}>Checkout Request ID</p>
                    <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 600, color: '#374151', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                        {payment.checkout_request_id ?? '—'}
                    </p>
                    </div>
                    {(payment.retry_count > 0 || payment.is_retry) && (
                    <div>
                        <p style={{ margin: 0, fontSize: '0.72rem', color: '#9ca3af' }}>Retry Count</p>
                        <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: 700, color: '#f59e0b' }}>
                        {payment.retry_count} attempt{payment.retry_count !== 1 ? 's' : ''}
                        </p>
                    </div>
                    )}
                </div>
                </div>

                {/* ── M-Pesa Confirmation ───────────────────────────────────────── */}
                {payment.mpesa_receipt_number && (
                <div>
                    <p style={{ margin: '0 0 8px', fontSize: '0.67rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af' }}>
                    M-Pesa Confirmation
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                        <p style={{ margin: 0, fontSize: '0.72rem', color: '#9ca3af' }}>Receipt Number</p>
                        <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: 700, color: '#10b981', fontFamily: 'monospace' }}>
                        {payment.mpesa_receipt_number}
                        </p>
                    </div>
                    <div>
                        <p style={{ margin: 0, fontSize: '0.72rem', color: '#9ca3af' }}>Amount Confirmed</p>
                        <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: 700, color: '#10b981', fontFamily: 'monospace' }}>
                        KES {Number(payment.mpesa_amount_confirmed ?? 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                        </p>
                    </div>
                    <div>
                        <p style={{ margin: 0, fontSize: '0.72rem', color: '#9ca3af' }}>Phone Confirmed</p>
                        <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: 600, color: '#374151', fontFamily: 'monospace' }}>
                        {payment.mpesa_phone_confirmed ?? '—'}
                        </p>
                    </div>
                    <div>
                        <p style={{ margin: 0, fontSize: '0.72rem', color: '#9ca3af' }}>Transaction Date</p>
                        <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 600, color: '#374151' }}>
                        {payment.mpesa_transaction_date
                            ? new Date(payment.mpesa_transaction_date).toLocaleString('en-KE', {
                                day: '2-digit', month: 'short', year: 'numeric',
                                hour: '2-digit', minute: '2-digit',
                            })
                            : '—'}
                        </p>
                    </div>
                    </div>
                </div>
                )}

                {/* ── Callback ──────────────────────────────────────────────────── */}
                {(payment.callback_received_at || payment.callback_result_code != null) && (
                <div>
                    <p style={{ margin: '0 0 8px', fontSize: '0.67rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af' }}>
                    Daraja Callback
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                        <p style={{ margin: 0, fontSize: '0.72rem', color: '#9ca3af' }}>Received At</p>
                        <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 600, color: '#374151' }}>
                        {payment.callback_received_at
                            ? new Date(payment.callback_received_at).toLocaleString('en-KE', {
                                day: '2-digit', month: 'short', year: 'numeric',
                                hour: '2-digit', minute: '2-digit', second: '2-digit',
                            })
                            : '—'}
                        </p>
                    </div>
                    <div>
                        <p style={{ margin: 0, fontSize: '0.72rem', color: '#9ca3af' }}>Result Code</p>
                        <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: 700, fontFamily: 'monospace' }}>
                        <span style={{
                            color: payment.callback_result_code === 0 ? '#10b981' : '#ef4444',
                        }}>
                            {payment.callback_result_code ?? '—'}
                        </span>
                        </p>
                    </div>
                    {payment.callback_result_desc && (
                        <div style={{ gridColumn: 'span 2' }}>
                        <p style={{ margin: 0, fontSize: '0.72rem', color: '#9ca3af' }}>Result Description</p>
                        <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: '#374151' }}>
                            {payment.callback_result_desc}
                        </p>
                        </div>
                    )}
                    </div>
                </div>
                )}

                {/* ── Failure ───────────────────────────────────────────────────── */}
                {payment.failure_reason && (
                <div>
                    <p style={{ margin: '0 0 6px', fontSize: '0.67rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af' }}>
                    Failure
                    </p>
                    <p style={{
                    margin: 0, fontSize: '0.82rem', color: '#991b1b',
                    background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.18)',
                    borderRadius: 7, padding: '8px 12px',
                    }}>
                    {payment.failure_reason}
                    </p>
                </div>
                )}

                {/* ── Raw Callback JSON ─────────────────────────────────────────── */}
                {payment.callback_raw && (
                <div>
                    <button
                    onClick={() => setShowRaw(v => !v)}
                    style={{
                        fontSize: '0.78rem', fontWeight: 700, color: '#a855f7',
                        background: 'none', border: 'none', cursor: 'pointer',
                        padding: 0, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6,
                    }}
                    >
                    <span style={{
                        display: 'inline-block', width: 14, height: 14, lineHeight: '14px',
                        textAlign: 'center', borderRadius: 3,
                        background: 'rgba(168,85,247,0.15)', fontSize: '0.7rem',
                    }}>
                        {showRaw ? '−' : '+'}
                    </span>
                    {showRaw ? 'Hide' : 'Show'} raw callback payload
                    </button>
                    {showRaw && (
                    <pre style={{
                        background: '#0d0d0d', color: '#00ff15',
                        padding: 14, borderRadius: 8, marginTop: 10,
                        fontSize: '0.73rem', overflow: 'auto', maxHeight: 320,
                        border: '1px solid rgba(0,255,21,0.15)',
                    }}>
                        {JSON.stringify(payment.callback_raw, null, 2)}
                    </pre>
                    )}
                </div>
                )}

            </div>
            </Panel>
          
          <Panel>
            <div style={{ padding: '18px 18px 14px', borderBottom: '1px solid #f3f4f6' }}>
                <SectionLabel>Order Snapshot</SectionLabel>
                {payment.currency !== 'KES' && (
                <div style={{
                    marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '3px 10px', borderRadius: 20,
                    background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)',
                }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#3b82f6' }}>
                    {payment.currency}
                    </span>
                    <span style={{ fontSize: '0.65rem', color: '#9ca3af' }}>→</span>
                    <span style={{ fontSize: '0.7rem', color: '#6b7280' }}>
                    1 {payment.currency} = KES {Number(payment.exchange_rate_to_kes).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                    </span>
                    <span style={{ fontSize: '0.65rem', color: '#9ca3af' }}>at initiation</span>
                </div>
                )}
            </div>

            <div style={{ padding: 16 }}>

                {/* Foreign currency original amounts — only shown when non-KES */}
                {payment.currency !== 'KES' && (
                <div style={{
                    marginBottom: 12, padding: '10px 12px', borderRadius: 8,
                    background: 'rgba(59,130,246,0.04)', border: '1px solid rgba(59,130,246,0.1)',
                }}>
                    <p style={{ margin: 0, fontSize: '0.67rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af', marginBottom: 6 }}>
                    Original ({payment.currency})
                    </p>
                    {[
                    { label: 'Subtotal',  kes: payment.snapshot_subtotal_kes },
                    { label: 'Tax',       kes: payment.snapshot_tax_kes },
                    { label: 'Discount',  kes: payment.snapshot_discount_kes },
                    { label: 'Shipping',  kes: payment.snapshot_shipping_kes },
                    { label: 'Total',     kes: payment.snapshot_total_kes },
                    ].map(({ label, kes }) => {
                    const rate = Number(payment.exchange_rate_to_kes) || 1;
                    const foreign = rate > 0 ? Number(kes) / rate : 0;
                    return (
                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <span style={{ fontSize: '0.73rem', color: '#9ca3af' }}>{label}</span>
                        <span style={{ fontSize: '0.73rem', color: '#6b7280', fontFamily: 'monospace' }}>
                            {payment.currency} {foreign.toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                        </span>
                        </div>
                    );
                    })}
                </div>
                )}

                {/* KES amounts — always shown */}
                <p style={{ margin: 0, fontSize: '0.67rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af', marginBottom: 8 }}>
                {payment.currency !== 'KES' ? 'Converted (KES)' : 'Amounts (KES)'}
                </p>

                {[
                { label: 'Subtotal',  val: payment.snapshot_subtotal_kes,  color: '#374151' },
                { label: 'Tax',       val: payment.snapshot_tax_kes,       color: '#9ca3af' },
                { label: 'Discount',  val: payment.snapshot_discount_kes,  color: '#9ca3af' },
                { label: 'Shipping',  val: payment.snapshot_shipping_kes,  color: '#9ca3af' },
                ].map(({ label, val, color }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{label}</span>
                    <span style={{ fontSize: '0.75rem', color, fontFamily: 'monospace' }}>
                    KES {Number(val ?? 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                    </span>
                </div>
                ))}

                <hr style={{ margin: '10px 0', border: 'none', borderTop: '1px solid #e5e7eb' }} />

                {/* Totals */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#374151' }}>Order Total</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#374151', fontFamily: 'monospace' }}>
                    KES {Number(payment.snapshot_total_kes ?? 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Previously Paid</span>
                <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontFamily: 'monospace' }}>
                    KES {Number(payment.snapshot_amount_previously_paid_kes ?? 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                </span>
                </div>

                <div style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '7px 10px', borderRadius: 7, marginTop: 4,
                background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
                }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#b45309' }}>Still Owed</span>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#b45309', fontFamily: 'monospace' }}>
                    KES {Number(payment.snapshot_amount_still_owed_kes ?? 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                </span>
                </div>

            </div>
          </Panel>
        </div>
        <div style={{ marginTop: 20 }}>
        <DisputePanel
          payment={payment}
          user={user}
          onUpdate={setPayment}
        />
      </div>
      </div>
    </AdminLayout>
  );
}