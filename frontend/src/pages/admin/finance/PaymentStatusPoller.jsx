import { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';
import paymentsAPI from '../../../api/payments';

export default function PaymentStatusPoller({ paymentId, onStatusChange }) {
  const [status, setStatus] = useState('pending');
  const [polling, setPolling] = useState(true);

  useEffect(() => {
    if (!polling || status !== 'pending') return;
    
    const interval = setInterval(async () => {
      try {
        const data = await paymentsAPI.getPaymentStatus(paymentId);
        setStatus(data.status);
        
        if (['confirmed', 'failed', 'cancelled'].includes(data.status)) {
          setPolling(false);
          onStatusChange?.(data);
        }
      } catch (e) {
        console.error('Payment poll failed:', e);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [paymentId, polling, status]);

  if (!polling) return null;

  return (
    <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:'0.75rem', color:'#f59e0b', fontWeight:700 }}>
      <Clock size={14} className="animate-spin" /> Waiting for customer...
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}