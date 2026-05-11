import { useState, useEffect } from 'react';
import { CreditCard, AlertCircle, CheckCircle, XCircle, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Panel, Btn, purple, purpleLt, purpleBd, Pill } from '../../../lib/finance-ui';
import InitiatePaymentModal from './InitiatePaymentModal';
import PaymentStatusPoller from './PaymentStatusPoller';
import paymentsAPI from '../../../api/payments';
import toast from 'react-hot-toast';

export default function OrderPaymentsPanel({ orderId, orderTotalKes }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showInitiate, setShowInitiate] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await paymentsAPI.getOrderPayments(orderId);
        setData(res);
      } catch (e) {
        toast.error(e.response?.data?.message || 'Failed to load payment history');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [orderId]);

  if (loading) return <p style={{ padding:20, color:'#9ca3af' }}>Loading payments...</p>;
  if (!data) return <p style={{ padding:20 }}>No payment data.</p>;

  const balance = data.balance_remaining;
  const pendingPayment = data.payments.find(p => p.status === 'pending');

  return (
    <Panel style={{ marginTop:16 }}>
      <div style={{ padding:'16px 20px', borderBottom:'1px solid #f3f4f6', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <h4 style={{ margin:0, fontWeight:800, color:'#374151', display:'flex', alignItems:'center', gap:8 }}>
          <CreditCard size={16} color={purple} /> Payment History
        </h4>
        {balance > 0 && !pendingPayment && (
          <Btn size="sm" variant="ghost" onClick={() => setShowInitiate(true)} icon={<CreditCard size={14}/>}>
            Request Payment
          </Btn>
        )}
      </div>
      <div style={{ padding:'12px 20px', display:'flex', justifyContent:'space-between', fontSize:'0.85rem', background:purpleLt, borderBottom:`1px solid ${purpleBd}` }}>
        <span>Order Total: <b>KES {data.order_total_kes.toLocaleString()}</b></span>
        <span>Paid: <b style={{color:'#10b981'}}>KES {data.total_confirmed_kes.toLocaleString()}</b></span>
        <span>Balance: <b style={{color: balance>0?'#ef4444':'#10b981'}}>KES {balance.toLocaleString()}</b></span>
      </div>
      <div style={{ padding:'0 20px 16px' }}>
        {data.payments.length === 0 ? (
          <p style={{ color:'#9ca3af', textAlign:'center', padding:20, fontSize:'0.85rem' }}>No payments requested yet.</p>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:8, marginTop:12 }}>
            {data.payments.map(p => (
              <div key={p.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px', borderRadius:10, border:'1px solid #e5e7eb', cursor:'pointer' }} onClick={() => navigate(`/admin/finance/payments/${p.id}`)}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  {p.status === 'confirmed' && <CheckCircle size={16} color="#10b981"/>}
                  {p.status === 'pending' && <Clock size={16} color="#f59e0b"/>}
                  {p.status === 'failed' && <XCircle size={16} color="#ef4444"/>}
                  {p.status === 'cancelled' && <AlertCircle size={16} color="#6b7280"/>}
                  <div>
                    <p style={{ margin:0, fontWeight:700, fontSize:'0.85rem' }}>{p.payment_number}</p>
                    <p style={{ margin:0, fontSize:'0.75rem', color:'#9ca3af' }}>{p.phone_number} • {new Date(p.initiated_at).toLocaleString()}</p>
                  </div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <Pill color={p.status==='confirmed'?'#10b981':p.status==='pending'?'#f59e0b':'#ef4444'}>{p.status}</Pill>
                  {p.status === 'pending' && <div style={{ fontSize:'0.7rem', color:'#f59e0b', marginTop:4 }}>Awaiting customer...</div>}
                </div>
                {p.status === 'pending' && <PaymentStatusPoller paymentId={p.id} onStatusChange={() => {}} />}
              </div>
            ))}
          </div>
        )}
      </div>
      {showInitiate && (
        <InitiatePaymentModal 
          orderId={orderId} 
          orderTotalKes={data.order_total_kes} 
          orderBalanceKes={balance} 
          onClose={(res)=>{ 
            setShowInitiate(false); 
            if(res?.payment_id) navigate(`/admin/finance/payments/${res.payment_id}`); 
          }} 
        />
      )}
    </Panel>
  );
}