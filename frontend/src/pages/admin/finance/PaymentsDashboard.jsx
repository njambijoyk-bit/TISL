import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard, Filter, Search, BarChart2 } from 'lucide-react';
import { Panel, Btn, purple, purpleLt, purpleBd, Pill } from '../../../lib/finance-ui';
import AdminLayout from '../../../components/layout/AdminLayout';
import PaymentReportsModal from './components/PaymentReportsModal';
import paymentsAPI from '../../../api/payments';
import toast from 'react-hot-toast';

export default function PaymentsDashboard() {
  const navigate = useNavigate();
  const [payments, setPayments] = useState([]);
  const [meta, setMeta] = useState({});
  const [filters, setFilters] = useState({ status: '', order_id: '', from_date: '', to_date: '', dispute_status: '' });
  const [loading, setLoading] = useState(false);
  const [showReports, setShowReports] = useState(false);
  const [summary, setSummary] = useState(null);

  const fetchPayments = async () => {
    setLoading(true);
    try {
      // Remove empty strings so axios doesn't send ?status=&
      const cleanFilters = Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v !== '')
      );
      const res = await paymentsAPI.getPayments(cleanFilters);
      setPayments(res.data || []);
      setMeta(res.meta || {});
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to load payments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPayments(); }, [filters]);
  useEffect(() => {
    paymentsAPI.getSummary().then(setSummary).catch(() => {});
  }, []);

  return (
    <AdminLayout>
      <div style={{ padding:20 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
          <h1 style={{ margin:0, fontSize:'1.5rem', fontWeight:900, color:purple }}>Finance • Payments</h1>
          <Btn variant="primary" icon={<BarChart2 size={16}/>} onClick={() => setShowReports(true)}>Reports</Btn>
        </div>

        {/* ── Summary Bar ─────────────────────────────────────────────────── */}
        {summary && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 12, marginBottom: 20,
          }}>
            {[
              {
                label: "Today's Collections",
                value: `KES ${Number(summary.today_collected).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`,
                color: '#10b981', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.2)',
              },
              {
                label: 'This Month',
                value: `KES ${Number(summary.month_collected).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`,
                color: '#a855f7', bg: purpleLt, border: purpleBd,
              },
              {
                label: 'Pending',
                value: summary.pending_count,
                color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)',
                onClick: () => setFilters(f => ({ ...f, status: 'pending' })),
              },
              {
                label: 'Failed',
                value: summary.failed_count,
                color: '#ef4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)',
                onClick: () => setFilters(f => ({ ...f, status: 'failed' })),
              },
              {
                label: 'Open Disputes',
                value: summary.open_disputes,
                color: '#f97316', bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.2)',
                onClick: () => setFilters(f => ({ ...f, dispute_status: 'raised' })),
              },
              {
                label: "Today's Requests",
                value: summary.today_count,
                color: '#3b82f6', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.2)',
              },
            ].map(({ label, value, color, bg, border, onClick }) => (
              <div
                key={label}
                onClick={onClick}
                style={{
                  padding: '14px 16px', borderRadius: 10,
                  background: bg, border: `1px solid ${border}`,
                  cursor: onClick ? 'pointer' : 'default',
                  transition: 'opacity 150ms',
                }}
                onMouseEnter={e => { if (onClick) e.currentTarget.style.opacity = '0.8'; }}
                onMouseLeave={e => { if (onClick) e.currentTarget.style.opacity = '1'; }}
              >
                <p style={{ margin: 0, fontSize: '0.67rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af' }}>
                  {label}
                </p>
                <p style={{ margin: '4px 0 0', fontSize: '1.15rem', fontWeight: 900, color }}>
                  {value}
                </p>
              </div>
            ))}
          </div>
        )}

        <Panel style={{ marginBottom:20, padding:16 }}>
          <div style={{ display:'flex', gap:12, flexWrap:'wrap', alignItems:'flex-end' }}>
            <div style={{ flex:1, minWidth:140 }}>
              <label style={{ fontSize:'0.72rem', fontWeight:700, color:'#9ca3af' }}>Status</label>
              <select value={filters.status} onChange={e=>setFilters({...filters, status:e.target.value})} style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1.5px solid #e5e7eb' }}>
                <option value="">All</option>
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="failed">Failed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div style={{ flex:1, minWidth:140 }}>
              <label style={{ fontSize:'0.72rem', fontWeight:700, color:'#9ca3af' }}>Order ID</label>
              <input type="text" placeholder="e.g. 42" value={filters.order_id} onChange={e=>setFilters({...filters, order_id:e.target.value})} style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1.5px solid #e5e7eb' }} />
            </div>
            <div style={{ flex:1, minWidth:140 }}>
              <label style={{ fontSize:'0.72rem', fontWeight:700, color:'#9ca3af' }}>From Date</label>
              <input type="date" value={filters.from_date} onChange={e=>setFilters({...filters, from_date:e.target.value})} style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1.5px solid #e5e7eb' }} />
            </div>
            <div style={{ flex:1, minWidth:140 }}>
              <label style={{ fontSize:'0.72rem', fontWeight:700, color:'#9ca3af' }}>To Date</label>
              <input type="date" value={filters.to_date} onChange={e=>setFilters({...filters, to_date:e.target.value})} style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1.5px solid #e5e7eb' }} />
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#9ca3af' }}>Dispute</label>
              <select
                value={filters.dispute_status}
                onChange={e => setFilters({ ...filters, dispute_status: e.target.value })}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #e5e7eb' }}
              >
                <option value="">All</option>
                <option value="raised">Disputed</option>
                <option value="investigating">Investigating</option>
                <option value="resolved">Resolved</option>
                <option value="rejected">Rejected</option>
                <option value="none">No Dispute</option>
              </select>
            </div>
            <Btn size="sm" variant="outline" icon={<Filter size={14}/>} onClick={() => setFilters({status:'',order_id:'',from_date:'',to_date:'',dispute_status:''})}>Reset</Btn>
          </div>
        </Panel>

        <Panel>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:purpleLt, borderBottom:`1px solid ${purpleBd}` }}>
                <th style={{ padding:'12px 16px', textAlign:'left', fontSize:'0.75rem', fontWeight:800, textTransform:'uppercase', letterSpacing:'0.05em', color:purple }}>Payment #</th>
                <th style={{ padding:'12px 16px', textAlign:'left', fontSize:'0.75rem', fontWeight:800, textTransform:'uppercase', letterSpacing:'0.05em', color:purple }}>Customer</th> 
                <th style={{ padding:'12px 16px', textAlign:'left', fontSize:'0.75rem', fontWeight:800, textTransform:'uppercase', letterSpacing:'0.05em', color:purple }}>Order</th>
                <th style={{ padding:'12px 16px', textAlign:'left', fontSize:'0.75rem', fontWeight:800, textTransform:'uppercase', letterSpacing:'0.05em', color:purple }}>Amount</th>
                <th style={{ padding:'12px 16px', textAlign:'left', fontSize:'0.75rem', fontWeight:800, textTransform:'uppercase', letterSpacing:'0.05em', color:purple }}>Status</th>
                <th style={{ padding:'12px 16px', textAlign:'left', fontSize:'0.75rem', fontWeight:800, textTransform:'uppercase', letterSpacing:'0.05em', color:purple }}>Initiated</th>
                <th style={{ padding:'12px 16px', textAlign:'left', fontSize:'0.75rem', fontWeight:800, textTransform:'uppercase', letterSpacing:'0.05em', color:purple }}>Actions</th>
              </tr>
            </thead>
            <tbody>
            {loading ? (
                <tr><td colSpan={7} style={{ textAlign:'center', padding:40 }}>Loading...</td></tr>
            ) : payments.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign:'center', padding:40, color:'#9ca3af' }}>
                No payments found. Try adjusting your filters.
                </td></tr>
            ) : (
              payments.map(p => (
                <tr key={p.id} style={{ borderBottom:'1px solid #f3f4f6', cursor:'pointer' }} onClick={() => navigate(`/admin/finance/payments/${p.id}`)}>
                  <td style={{ padding:'12px 16px', fontWeight:700, color:'#a855f7' }}>{p.payment_number}</td>
                  <td style={{ padding:'12px 16px' }}>
                    {p.customer ? (
                        <button 
                        onClick={(e) => {
                            e.stopPropagation(); // Prevent row click
                            navigate(`/admin/customers/${p.customer.id}`);
                        }}
                        style={{ 
                            background:'none', border:'none', padding:0, cursor:'pointer',
                            fontWeight:600, color:'#a855f7', textAlign:'left',
                            textDecoration:'none', fontSize:'inherit'
                        }}
                        onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                        onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
                        >
                        <span>
                            {`${p.customer.first_name || ''} ${p.customer.last_name || ''}`.trim() || '—'}
                        </span>
                        </button>
                    ) : (
                        <span style={{ color:'#9ca3af' }}>—</span>
                    )}
                    {p.customer?.email && (
                        <p style={{ margin:0, fontSize:'0.7rem', color:'#9ca3af' }}>{p.customer.email}</p>
                    )}
                  </td>
                  <td style={{ padding:'12px 16px', color:'#9ca3af' }}>#{p.order?.order_number || p.order_id}</td>
                  <td style={{ padding:'12px 16px', fontWeight:600,color:'#3b82f6' }}>KES {Number(p.amount_expected).toLocaleString()}</td>
                  <td style={{ padding:'12px 16px' }}>
                    <Pill color={p.status==='confirmed'?'#10b981':p.status==='pending'?'#f59e0b':'#ef4444'}>{p.status}</Pill>
                  </td>
                  <td style={{ padding:'12px 16px', fontSize:'0.8rem', color:'#6b7280' }}>{new Date(p.initiated_at).toLocaleString()}</td>
                  <td style={{ padding:'12px 16px' }}>
                    <Btn size="sm" variant="ghost" icon={<Search size={14}/>} onClick={(e)=>{e.stopPropagation(); navigate(`/admin/finance/payments/${p.id}`)}}>View</Btn>
                  </td>
                </tr>
              ))
            )}
            </tbody>
          </table>
          </div>
          {meta.last_page > 1 && (
            <div style={{ padding:'12px 16px', display:'flex', justifyContent:'center', gap:8, borderTop:'1px solid #f3f4f6' }}>
              {Array.from({length: meta.last_page}, (_,i)=>i+1).map(pg => (
                <button key={pg} onClick={()=>setFilters({...filters, page:pg})} style={{ padding:'6px 10px', borderRadius:6, border:`1px solid ${pg===meta.current_page?purple:'#e5e7eb'}`, background:pg===meta.current_page?purpleLt:'transparent', cursor:'pointer', fontWeight:700, color:purple }}>{pg}</button>
              ))}
            </div>
          )}
        </Panel>
        {showReports && (
          <PaymentReportsModal onClose={() => setShowReports(false)} />
        )}
      </div>
    </AdminLayout>
  );
}