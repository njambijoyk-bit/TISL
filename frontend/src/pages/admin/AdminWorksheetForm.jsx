import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Save, Send, CheckCircle, XCircle, Download, ClipboardList } from 'lucide-react';
import AdminLayout from '../../components/layout/AdminLayout';
import WorksheetItemsTable from '../../components/admin/bookings/WorksheetItemsTable';
import { bookingsAPI } from '../../api/bookings';
import { productsAPI } from '../../api/products';
import toast from 'react-hot-toast';

const inputStyle = {
  width: '100%', padding: '9px 12px', borderRadius: 10, fontSize: '0.83rem',
  background: 'rgba(168,85,247,0.03)', border: '1.5px solid rgba(168,85,247,0.18)',
  color: '#111827', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  transition: 'border-color 150ms',
};
const labelStyle = {
  fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.08em', color: '#7c3aed', display: 'block', marginBottom: 5,
};
const focus = e => { e.currentTarget.style.borderColor = '#a855f7'; };
const blur  = e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.18)'; };

const STATUS_FLOW = { draft: 'Draft', submitted: 'Submitted', approved: 'Approved', rejected: 'Rejected' };
const STATUS_COLOR = { draft: '#9ca3af', submitted: '#2563eb', approved: '#16a34a', rejected: '#dc2626' };

const AdminWorksheetForm = () => {
  const { id, wsId } = useParams();
  const navigate     = useNavigate();
  const isNew = wsId === 'new';

  const [booking,   setBooking]   = useState(null);
  const [worksheet, setWorksheet] = useState(null);
  const [currencies, setCurrencies] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [approving, setApproving]  = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showReject,   setShowReject]   = useState(false);
  const [rejecting,    setRejecting]    = useState(false);

  const [form, setForm] = useState({
    currency_code: 'KES',
    findings:      '',
    hours_worked:  '',
    labour_cost:   '',
    admin_notes:   '',
  });

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const [bRes, cRes] = await Promise.all([
          bookingsAPI.getAdminBooking(id),
          fetch('/api/admin/currencies', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }).then(r => r.json()),
        ]);
        setBooking(bRes.booking ?? bRes);
        setCurrencies(cRes.data ?? cRes ?? []);

        if (!isNew) {
          const ws = await bookingsAPI.getWorksheet(id, wsId);
          setWorksheet(ws.worksheet ?? ws);
          setForm({
            currency_code: ws.worksheet?.currency_code ?? 'KES',
            findings:      ws.worksheet?.findings ?? '',
            hours_worked:  ws.worksheet?.hours_worked ?? '',
            labour_cost:   ws.worksheet?.labour_cost ?? '',
            admin_notes:   ws.worksheet?.admin_notes ?? '',
          });
        }
      } catch { toast.error('Failed to load'); navigate(`/admin/bookings/${id}`); }
      finally { setLoading(false); }
    };
    init();
  }, [id, wsId]);

  const set = (key, val) => setForm(p => ({ ...p, [key]: val }));

  const handleSave = async () => {
    setSaving(true);
    try {
      if (isNew) {
        const res = await bookingsAPI.createWorksheet(id, form);
        toast.success('Worksheet created');
        navigate(`/admin/bookings/${id}/worksheets/${res.worksheet?.id}`, { replace: true });
        setWorksheet(res.worksheet);
      } else {
        const res = await bookingsAPI.updateWorksheet(id, wsId, form);
        setWorksheet(res.worksheet ?? worksheet);
        toast.success('Saved');
      }
    } catch (e) { toast.error(e?.response?.data?.message ?? 'Save failed'); }
    finally { setSaving(false); }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      if (isNew || !worksheet) { await handleSave(); }
      await bookingsAPI.submitWorksheet(id, worksheet?.id ?? wsId);
      toast.success('Worksheet submitted for approval');
      navigate(`/admin/bookings/${id}`);
    } catch (e) { toast.error(e?.response?.data?.message ?? 'Submit failed'); }
    finally { setSubmitting(false); }
  };

  const handleApprove = async () => {
    setApproving(true);
    try {
      await bookingsAPI.approveWorksheet(id, wsId);
      toast.success('Worksheet approved');
      navigate(`/admin/bookings/${id}`);
    } catch (e) { toast.error(e?.response?.data?.message ?? 'Failed'); }
    finally { setApproving(false); }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) { toast.error('Please provide a reason'); return; }
    setRejecting(true);
    try {
      await bookingsAPI.rejectWorksheet(id, wsId, { reason: rejectReason });
      toast.success('Worksheet returned to draft');
      navigate(`/admin/bookings/${id}`);
    } catch (e) { toast.error(e?.response?.data?.message ?? 'Failed'); }
    finally { setRejecting(false); }
  };

  const handleExport = () => window.open(`/api/admin/bookings/${id}/worksheets/${wsId}/export`, '_blank');

  const handleAddItem    = async (data)         => { const r = await bookingsAPI.addWorksheetItem(id, wsId, data); await refreshWorksheet(); return r; };
  const handleUpdateItem = async (itemId, data) => { const r = await bookingsAPI.updateWorksheetItem(id, wsId, itemId, data); await refreshWorksheet(); return r; };
  const handleRemoveItem = async (itemId)       => { await bookingsAPI.removeWorksheetItem(id, wsId, itemId); await refreshWorksheet(); };
  const handleReorder    = async (order)        => { await bookingsAPI.reorderWorksheetItems(id, wsId, order); await refreshWorksheet(); };
  const refreshWorksheet = async () => {
    const ws = await bookingsAPI.getWorksheet(id, wsId);
    setWorksheet(ws.worksheet ?? ws);
  };

  const isDraft    = !worksheet || worksheet.status === 'draft';
  const isSubmitted = worksheet?.status === 'submitted';
  const isReadOnly  = worksheet?.status === 'approved';

  const fmt = (n, code) => `${code ?? form.currency_code} ${parseFloat(n ?? 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;

  if (loading) return (
    <AdminLayout>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '120px 0', gap: 10, color: '#9ca3af' }}>
        <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', color: '#a855f7' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </AdminLayout>
  );

  return (
    <AdminLayout>
      <div style={{ maxWidth: 860, display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 40 }}>

        {/* Header */}
        <div>
          <button onClick={() => navigate(`/admin/bookings/${id}`)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 12px', fontFamily: 'inherit' }}
            onMouseEnter={e => e.currentTarget.style.color = '#a855f7'}
            onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}
          ><ArrowLeft size={14} /> Back to booking</button>

          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 11, background: 'linear-gradient(135deg,#a855f7,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ClipboardList size={18} color="white" />
              </div>
              <div>
                <h1 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#111827', margin: 0 }}>
                  {isNew ? 'New Worksheet' : `Worksheet #${wsId}`}
                </h1>
                <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: '2px 0 0' }}>
                  {booking?.booking_number} · {booking?.service?.name}
                  {worksheet && <span style={{ marginLeft: 8, fontWeight: 700, color: STATUS_COLOR[worksheet.status] ?? '#9ca3af' }}>● {STATUS_FLOW[worksheet.status]}</span>}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {!isNew && worksheet?.status === 'approved' && (
                <button onClick={handleExport} style={{ padding: '7px 14px', borderRadius: 9, border: '1.5px solid rgba(168,85,247,0.2)', background: 'none', color: '#7c3aed', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', fontWeight: 700 }}>
                  <Download size={13} /> Export CSV
                </button>
              )}
              {isSubmitted && (
                <>
                  <button onClick={() => setShowReject(p => !p)} style={{ padding: '7px 14px', borderRadius: 9, border: '1.5px solid rgba(220,38,38,0.25)', background: 'none', color: '#dc2626', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', fontWeight: 700 }}>
                    <XCircle size={13} /> Reject
                  </button>
                  <button onClick={handleApprove} disabled={approving} style={{ padding: '7px 14px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,#16a34a,#059669)', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', fontWeight: 700 }}>
                    {approving ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={13} />}
                    Approve
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Reject form */}
          {showReject && (
            <div style={{ marginTop: 12, padding: '12px 16px', borderRadius: 12, border: '1.5px solid rgba(220,38,38,0.2)', background: 'rgba(220,38,38,0.02)', display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label style={{ ...labelStyle, color: '#dc2626' }}>Rejection reason *</label>
                <input value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                  placeholder="What needs to be corrected?"
                  style={{ ...inputStyle, borderColor: 'rgba(220,38,38,0.3)' }}
                />
              </div>
              <button onClick={handleReject} disabled={rejecting} style={{ padding: '9px 16px', borderRadius: 9, border: 'none', background: '#dc2626', color: 'white', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                {rejecting ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : null} Reject
              </button>
              <button onClick={() => setShowReject(false)} style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid rgba(168,85,247,0.18)', background: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}>
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* Currency + summary header */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div style={{ background: 'white', borderRadius: 14, border: '1.5px solid rgba(168,85,247,0.1)', padding: '14px 18px' }}>
            <label style={labelStyle}>Currency</label>
            <select value={form.currency_code} onChange={e => set('currency_code', e.target.value)}
              disabled={isReadOnly}
              style={{ ...inputStyle, cursor: isReadOnly ? 'not-allowed' : 'pointer', background: isReadOnly ? 'rgba(168,85,247,0.02)' : undefined }}>
              {currencies.length
                ? currencies.map(c => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)
                : <option value="KES">KES — Kenyan Shilling</option>
              }
            </select>
            {worksheet?.exchange_rate_to_kes && form.currency_code !== 'KES' && (
              <p style={{ fontSize: '0.65rem', color: '#9ca3af', margin: '5px 0 0' }}>
                Rate snapshot: 1 {worksheet.currency_code} = {parseFloat(worksheet.exchange_rate_to_kes).toFixed(4)} KES
              </p>
            )}
          </div>

          {worksheet && (
            <>
              <div style={{ background: 'rgba(168,85,247,0.04)', borderRadius: 14, border: '1.5px solid rgba(168,85,247,0.12)', padding: '14px 18px' }}>
                <p style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', margin: '0 0 4px' }}>Materials total</p>
                <p style={{ fontSize: '1.1rem', fontWeight: 800, color: '#7c3aed', margin: 0 }}>{fmt(worksheet.total_materials)}</p>
                {form.currency_code !== 'KES' && <p style={{ fontSize: '0.65rem', color: '#9ca3af', margin: '2px 0 0' }}>≈ {fmt(worksheet.total_materials_kes, 'KES')}</p>}
              </div>
              <div style={{ background: 'rgba(168,85,247,0.04)', borderRadius: 14, border: '1.5px solid rgba(168,85,247,0.12)', padding: '14px 18px' }}>
                <p style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', margin: '0 0 4px' }}>Grand total</p>
                <p style={{ fontSize: '1.1rem', fontWeight: 800, color: '#a855f7', margin: 0 }}>{fmt(worksheet.grand_total)}</p>
                {form.currency_code !== 'KES' && <p style={{ fontSize: '0.65rem', color: '#9ca3af', margin: '2px 0 0' }}>≈ {fmt(worksheet.grand_total_kes, 'KES')}</p>}
              </div>
            </>
          )}
        </div>

        {/* Work summary */}
        <div style={{ background: 'white', borderRadius: 14, border: '1.5px solid rgba(168,85,247,0.1)', padding: '18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: '0.8rem', fontWeight: 700, color: '#111827', margin: 0 }}>Work Summary</p>
          <div>
            <label style={labelStyle}>Findings / Description</label>
            <textarea rows={3} value={form.findings} onChange={e => set('findings', e.target.value)}
              disabled={isReadOnly}
              placeholder="What was found, done, or observed…"
              style={{ ...inputStyle, resize: 'none' }} onFocus={focus} onBlur={blur}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Hours worked</label>
              <input type="number" value={form.hours_worked} onChange={e => set('hours_worked', e.target.value)}
                disabled={isReadOnly} placeholder="0.00" min="0" step="0.5"
                style={inputStyle} onFocus={focus} onBlur={blur}
              />
            </div>
            <div>
              <label style={labelStyle}>Labour cost ({form.currency_code})</label>
              <input type="number" value={form.labour_cost} onChange={e => set('labour_cost', e.target.value)}
                disabled={isReadOnly} placeholder="0.00" min="0" step="0.01"
                style={inputStyle} onFocus={focus} onBlur={blur}
              />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Admin notes <span style={{ color: '#d1d5db', fontWeight: 400, textTransform: 'none' }}>(not visible to customer)</span></label>
            <textarea rows={2} value={form.admin_notes} onChange={e => set('admin_notes', e.target.value)}
              disabled={isReadOnly}
              placeholder="Internal notes only…"
              style={{ ...inputStyle, resize: 'none' }} onFocus={focus} onBlur={blur}
            />
          </div>
        </div>

        {/* Items */}
        <div style={{ background: 'white', borderRadius: 14, border: '1.5px solid rgba(168,85,247,0.1)', padding: '18px' }}>
          <p style={{ fontSize: '0.8rem', fontWeight: 700, color: '#111827', margin: '0 0 14px' }}>Materials & Items Used</p>
          {worksheet ? (
            <WorksheetItemsTable
              items={worksheet.items ?? []}
              currencyCode={worksheet.currency_code}
              exchangeRate={worksheet.exchange_rate_to_kes}
              readOnly={isReadOnly}
              onAdd={handleAddItem}
              onUpdate={handleUpdateItem}
              onRemove={handleRemoveItem}
              onReorder={handleReorder}
              productsAPI={productsAPI}
            />
          ) : (
            <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: 0, textAlign: 'center', padding: '20px 0' }}>
              Save the worksheet first to start adding items.
            </p>
          )}
        </div>

        {/* Footer actions */}
        {!isReadOnly && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={() => navigate(`/admin/bookings/${id}`)} style={{ padding: '9px 18px', borderRadius: 10, fontSize: '0.82rem', fontWeight: 600, border: '1.5px solid rgba(168,85,247,0.2)', background: 'none', color: '#9ca3af', cursor: 'pointer' }}>
              Cancel
            </button>
            {isDraft && (
              <button onClick={handleSave} disabled={saving} style={{ padding: '9px 18px', borderRadius: 10, fontSize: '0.82rem', fontWeight: 700, border: '1.5px solid #a855f7', background: 'none', color: '#7c3aed', cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 7, opacity: saving ? 0.7 : 1 }}>
                {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />}
                {saving ? 'Saving…' : 'Save draft'}
              </button>
            )}
            {isDraft && !isNew && (
              <button onClick={handleSubmit} disabled={submitting} style={{ padding: '9px 22px', borderRadius: 10, fontSize: '0.82rem', fontWeight: 700, border: 'none', cursor: submitting ? 'not-allowed' : 'pointer', background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white', boxShadow: '0 2px 10px rgba(168,85,247,0.3)', opacity: submitting ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 7 }}>
                {submitting ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={14} />}
                {submitting ? 'Submitting…' : 'Submit for approval'}
              </button>
            )}
          </div>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </AdminLayout>
  );
};

export default AdminWorksheetForm;