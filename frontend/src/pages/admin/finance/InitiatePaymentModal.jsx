import { useState } from 'react';
import { X, Zap, CreditCard } from 'lucide-react';
import { Panel, Btn, purple, purpleLt, purpleBd } from '../../../lib/finance-ui';
import paymentsAPI from '../../../api/payments';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../../store'; // ← Add this import

export default function InitiatePaymentModal({ orderId, orderTotalKes, orderBalanceKes, onClose }) {
  const { user } = useAuthStore(); // ← Get user for role check
  const [form, setForm] = useState({
    order_id: orderId,
    is_partial: false,
    partial_amount: '',
    phone_override: '',
    phone_override_reason: '',
    force_override: false, // ✅ Fixed: default to false
    notes: ''
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        order_id: form.order_id,
        is_partial: form.is_partial,
        notes: form.notes || undefined,
        force_override: form.force_override || undefined, // ✅ Fixed: include in payload
      };
      
      if (form.is_partial && form.partial_amount) {
        payload.partial_amount = Number(form.partial_amount);
      }
      if (form.phone_override) {
        payload.phone_override = form.phone_override;
        payload.phone_override_reason = form.phone_override_reason || '';
      }

      const data = await paymentsAPI.initiatePayment(payload);
      toast.success(`STK Push sent to ${data.phone || 'customer'}`);
      onClose(data);
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to initiate payment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', backdropFilter:'blur(6px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50, padding:16 }}>
      <Panel style={{ maxWidth:520, width:'100%' }}>
        <div style={{ padding:'22px 26px 18px', borderBottom:'1px solid #f3f4f6' }}>
          <h3 style={{ fontSize:'1.15rem', fontWeight:800, margin:0, color:'#111827', display:'flex', alignItems:'center', gap:8 }}>
            <Zap size={18} color={purple} /> Request Payment
          </h3>
          <p style={{ fontSize:'0.8rem', color:'#9ca3af', marginTop:4 }}>Order #{orderId} • Balance: KES {orderBalanceKes?.toLocaleString()}</p>
          <button onClick={onClose} style={{ position:'absolute', top:20, right:20, background:'none', border:'none', cursor:'pointer', color:'#9ca3af' }}><X size={20}/></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding:'22px 26px 26px', display:'flex', flexDirection:'column', gap:16 }}>
          <div style={{ padding:12, borderRadius:10, background:purpleLt, border:`1px solid ${purpleBd}` }}>
            <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:'0.85rem', fontWeight:600, color: purple }}>
              <input type="checkbox" checked={form.is_partial} onChange={e=>setForm({...form, is_partial:e.target.checked})} />
              Partial Payment
            </label>
            {form.is_partial && (
              <input type="number" value={form.partial_amount} onChange={e=>setForm({...form, partial_amount:e.target.value})} placeholder={`Max: ${orderBalanceKes}`} min="10" max={orderBalanceKes} required style={{ width:'100%', marginTop:8, padding:'8px 10px', borderRadius:8, border:'1.5px solid #e5e7eb' }} />
            )}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div>
              <label style={{ fontSize:'0.75rem', fontWeight:700, color:'#6b7280' }}>Phone Override (Optional)</label>
              <input type="text" value={form.phone_override} onChange={e=>setForm({...form, phone_override:e.target.value})} placeholder="254712345678" style={{ width:'100%', marginTop:4, padding:'8px 10px', borderRadius:8, border:'1.5px solid #e5e7eb' }} />
            </div>
            <div>
              <label style={{ fontSize:'0.75rem', fontWeight:700, color:'#6b7280' }}>Reason (if overridden)</label>
              <input type="text" value={form.phone_override_reason} onChange={e=>setForm({...form, phone_override_reason:e.target.value})} placeholder="Required if phone changed" disabled={!form.phone_override} required={!!form.phone_override} style={{ width:'100%', marginTop:4, padding:'8px 10px', borderRadius:8, border:'1.5px solid #e5e7eb' }} />
            </div>
          </div>
          <textarea value={form.notes} onChange={e=>setForm({...form, notes:e.target.value})} placeholder="Admin notes..." rows={2} style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1.5px solid #e5e7eb' }} />
          
          {/* Force override — super_admin only */}
          {user?.role === 'super_admin' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: '0.8rem', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={form.force_override} 
                onChange={e => setForm({...form, force_override: e.target.checked})} 
              />
              <span style={{ color: '#6b7280' }}>Force override (bypass balance/status checks)</span>
            </label>
          )}
          
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:8 }}>
            <Btn variant="outline" onClick={onClose} type="button">Cancel</Btn>
            <Btn variant="primary" icon={<CreditCard size={15}/>} disabled={loading}>{loading ? 'Sending STK Push...' : 'Send STK Push'}</Btn>
          </div>
        </form>
      </Panel>
    </div>
  );
}