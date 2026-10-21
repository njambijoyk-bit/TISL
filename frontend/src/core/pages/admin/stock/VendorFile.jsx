import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminLayout from '../../../../_shared/components/layout/AdminLayout';
import { NoAccess } from '../../../components/admin/ui/HubHeader';
import { money } from '../../../components/admin/books/booksFmt';
import vendorsAPI from '../../../../_shared/api/vendors';
import vendorPrequalificationsAPI from '../../../../_shared/api/vendorPrequalifications';
import useAuthStore from '../../../../_shared/store/authStore';
import { canReadFinance, canWriteFinance, hasPermission } from '../../../../_shared/lib/roles';
import { isModuleActive, MODULES } from '../../../../_shared/navigation/modules';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../../../_shared/theme/tokens';
import { VendorPqPanel } from '../../../../extras/components/procurement/VendorPqModal';
import { VendorModal, PortalLoginModal } from './vendors/VendorModals';
import { Chip, StatusChip, GroupLine } from './vendors/vendorUi';
import { useNarrow, GROUP_LABELS } from './vendors/vendorHelpers';

/**
 * One vendor's file: a short list to move between vendors, and everything about the selected one in tabs
 * (what needs a look, pre-qualification, people category, purchases, details).
 */

const th = { textAlign: 'left', padding: '8px 10px', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.textFaint };
const td = { padding: '9px 10px', fontSize: '0.82rem', borderTop: `1px solid ${colors.tint(0.06)}`, verticalAlign: 'top', color: colors.text };
const label = { fontSize: '0.66rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: colors.textFaint, fontWeight: 700 };
const box = { ...card, padding: '16px 18px', minWidth: 0 };
const kv = (k, v) => v ? <div key={k} style={{ minWidth: 0 }}><div style={label}>{k}</div><div style={{ fontSize: '0.88rem', marginTop: 3, overflowWrap: 'anywhere', color: colors.text }}>{v}</div></div> : null;

export default function VendorFile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const narrow = useNarrow(900);
  const user = useAuthStore((s) => s.user);
  const canWrite = canWriteFinance(user);
  const portalOn = isModuleActive(MODULES.EXTRAS);
  const canPortal = portalOn && hasPermission(user, 'vendors.portal');
  const canSeePq = portalOn && hasPermission(user, 'prequalification.view');
  const canVerify = hasPermission(user, 'vendors.approve');
  const canManagePq = portalOn && hasPermission(user, 'prequalification.manage');

  const [v, setV] = useState(null);
  const [error, setError] = useState(null);
  const [list, setList] = useState([]);
  const [search, setSearch] = useState('');
  const [pqs, setPqs] = useState([]);
  const [modal, setModal] = useState(null);

  const tabs = [['look', 'Needs a look'], canSeePq && ['pq', 'Pre-qualification'], portalOn && ['group', 'People category'], ['purchases', 'Purchases'], ['details', 'Details']].filter(Boolean);
  const tab = tabs.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'look';
  const setTab = (k) => setParams({ tab: k }, { replace: true });

  const load = useCallback(() => {
    vendorsAPI.show(id).then((d) => { setV(d); setError(null); }).catch((e) => { setV(null); setError(errMsg(e, 'Could not load the vendor')); });
    if (canSeePq) vendorPrequalificationsAPI.forVendor(id).then((r) => setPqs(r.rows || [])).catch(() => setPqs([]));
  }, [id, canSeePq]);
  useEffect(() => { setV(null); load(); }, [load]);
  useEffect(() => {
    const t = setTimeout(() => vendorsAPI.list({ search: search || undefined }).then((d) => setList(d.rows)).catch(() => setList([])), search ? 250 : 0);
    return () => clearTimeout(t);
  }, [search]);

  const act = async (fn, ok) => { try { const r = await fn(); toast.success(r?.message || ok); load(); } catch (x) { toast.error(errMsg(x, 'Could not do that')); } };

  if (!canReadFinance(user)) return <AdminLayout><div style={{ padding: 32 }}><NoAccess what="vendors" /></div></AdminLayout>;

  const flags = v?.flags || [];
  const currentPqs = pqs.filter((p) => p.current);
  const fine = [];
  if (v) {
    if (v.is_verified) fine.push('Verified by staff');
    if (v.tax_id) fine.push('Tax PIN is on file');
    if (v.registration_number) fine.push('Company registration number is on file');
    if (v.special_group && v.special_group_status === 'confirmed') fine.push('People category confirmed by staff');
    if (v.special_group && (v.scan_urls || []).length) fine.push('Certificate scan uploaded');
  }

  const header = v && (
    <div style={{ ...box, display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><span style={{ fontSize: '1.4rem', fontWeight: 800, color: colors.text, overflowWrap: 'anywhere' }}>{v.company_name}</span><StatusChip status={v.status} />{v.is_verified && <Chip tone="success">Verified</Chip>}</div>
        <div style={{ fontSize: '0.8rem', color: colors.textMuted, marginTop: 6, overflowWrap: 'anywhere' }}>{[v.vendor_number, v.contact_name, v.phone, v.email].filter(Boolean).join(' · ')}</div>
        <GroupLine v={v} />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {canWrite && <button type="button" style={v.status === 'active' ? { ...btnGhost, color: colors.dangerText } : btnPrimary} onClick={() => act(() => vendorsAPI.update(v.id, { status: v.status === 'active' ? 'suspended' : 'active' }))}>{v.status === 'active' ? 'Suspend' : 'Activate'}</button>}
        {canVerify && <button type="button" style={v.is_verified ? btnGhost : btnPrimary} onClick={() => act(() => vendorsAPI.verify(v.id, !v.is_verified))}>{v.is_verified ? 'Take back verification' : 'Mark as verified'}</button>}
        {canWrite && <button type="button" style={btnGhost} onClick={() => setModal('edit')}>Edit</button>}
        {canPortal && <button type="button" style={btnGhost} onClick={() => setModal('portal')}>{v.has_login ? 'Reset password' : 'Create login'}</button>}
      </div>
    </div>
  );

  return (
    <AdminLayout>
      <div style={{ padding: '28px 24px', maxWidth: 1280, margin: '0 auto' }}>
        <nav aria-label="Breadcrumb" style={{ fontSize: '0.78rem', marginBottom: 16, color: colors.textMuted }}>
          <Link to="/admin/vendors" style={{ color: colors.primary, fontWeight: 600, textDecoration: 'none' }}>Vendors</Link> <span aria-hidden="true">/</span> <span style={{ color: colors.text, fontWeight: 600 }}>{v?.company_name ?? '…'}</span>
        </nav>

        <div style={{ display: 'flex', gap: 22, alignItems: 'flex-start', flexDirection: narrow ? 'column' : 'row' }}>
          {!narrow && (
            <aside style={{ width: 290, flex: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search vendors" aria-label="Search vendors" style={{ padding: '8px 12px', borderRadius: 8, border: `1.5px solid ${colors.tint(0.18)}`, fontSize: '0.8rem', fontFamily: 'inherit', background: 'transparent', color: colors.text }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: '70vh', overflowY: 'auto' }}>
                {list.map((r) => (
                  <button key={r.id} type="button" onClick={() => navigate(`/admin/vendors/${r.id}?tab=${tab}`)} aria-current={String(r.id) === String(id) ? 'true' : undefined}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', width: '100%', padding: '10px 12px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', color: colors.text, background: String(r.id) === String(id) ? colors.tint(0.12) : 'transparent', border: `1px solid ${String(r.id) === String(id) ? colors.tint(0.3) : 'transparent'}` }}>
                    <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', flex: 'none', background: r.status === 'active' ? colors.successText : r.status === 'suspended' ? colors.dangerText : colors.warningText }} />
                    <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: 'block', fontWeight: 600, fontSize: '0.84rem', overflowWrap: 'anywhere' }}>{r.company_name}</span><span style={{ display: 'block', fontSize: '0.7rem', color: colors.textFaint }}>{r.vendor_number}</span></span>
                    {(r.flags || []).length > 0 && <Chip tone="warning">{r.flags.length}</Chip>}
                  </button>
                ))}
              </div>
            </aside>
          )}

          <div style={{ flex: 1, minWidth: 0, width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {error && <p role="alert" style={{ margin: 0, padding: '10px 14px', borderRadius: 8, fontSize: '0.8rem', background: colors.dangerBg, color: colors.dangerText }}>{error}</p>}
            {!v && !error && <p style={{ color: colors.textMuted }}>Loading…</p>}
            {v && (
              <>
                {header}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
                  <div style={box}><div style={label}>We owe</div><div style={{ fontSize: '1.3rem', fontWeight: 800, marginTop: 6, color: Number(v.owed) > 0 ? colors.warningText : colors.text }}>{money(v.owed)}</div></div>
                  {portalOn && <div style={box}><div style={label}>Portal</div><div style={{ marginTop: 8 }}><Chip tone={v.has_login ? 'success' : 'neutral'}>{v.has_login ? 'Has login' : 'No login'}</Chip></div></div>}
                  {canSeePq && <div style={box}><div style={label}>Pre-qualified</div><div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>{currentPqs.length ? currentPqs.map((p) => <Chip key={p.id} tone="success">{p.category}{p.valid_until ? ` to ${p.valid_until}` : ''}</Chip>) : <Chip>None</Chip>}</div></div>}
                  {portalOn && <div style={box}><div style={label}>People category</div><div style={{ marginTop: 8 }}>{v.special_group ? <Chip tone={v.special_group_status === 'confirmed' ? 'success' : 'warning'}>{GROUP_LABELS[v.special_group]}, {v.special_group_status === 'confirmed' ? 'confirmed' : 'to confirm'}</Chip> : <Chip>None</Chip>}</div></div>}
                </div>

                <div role="tablist" style={{ display: 'flex', gap: 2, overflowX: 'auto', borderBottom: `1.5px solid ${colors.tint(0.16)}` }}>
                  {tabs.map(([k, l]) => (
                    <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                      style={{ padding: '10px 14px', background: 'none', border: 'none', fontFamily: 'inherit', fontSize: '0.82rem', cursor: 'pointer', whiteSpace: 'nowrap', marginBottom: -1.5, fontWeight: tab === k ? 700 : 500, color: tab === k ? colors.primary : colors.textMuted, borderBottom: `2px solid ${tab === k ? colors.primary : 'transparent'}` }}>
                      {l}{k === 'look' && flags.length > 0 ? ` (${flags.length})` : ''}
                    </button>
                  ))}
                </div>

                {tab === 'look' && (
                  <div style={{ ...box, display: 'grid', gap: 12 }}>
                    {flags.length === 0 && fine.length === 0 && <p style={{ margin: 0, color: colors.textMuted, fontSize: '0.85rem' }}>Nothing to check.</p>}
                    {flags.map((f) => <div key={f.code} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}><Chip tone="warning">Check</Chip><span style={{ fontSize: '0.86rem', color: colors.text }}>{f.text}</span></div>)}
                    {fine.map((t) => <div key={t} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}><Chip tone="success">Fine</Chip><span style={{ fontSize: '0.86rem', color: colors.textBody }}>{t}</span></div>)}
                    <p style={{ margin: 0, fontSize: '0.74rem', color: colors.textFaint }}>The system only reports what it can see in the data. You decide what to do, and a pre-qualification decision always needs a written reason.</p>
                  </div>
                )}

                {tab === 'pq' && canSeePq && <div style={box}><VendorPqPanel vendor={v} canManage={canManagePq} onClose={load} /></div>}

                {tab === 'group' && (
                  <div style={{ ...box, display: 'grid', gap: 14 }}>
                    {!v.special_group ? <p style={{ margin: 0, color: colors.textMuted, fontSize: '0.85rem' }}>This vendor has no people category. Set one under Edit, or the vendor can set it on their own profile.</p> : (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
                          {kv('Category', GROUP_LABELS[v.special_group])}
                          {kv('Certificate number', v.special_group_certificate || 'Not given')}
                          {kv('Valid until', v.special_group_valid_until || 'Not given')}
                          {kv('Status', v.special_group_status === 'confirmed' ? 'Confirmed by staff' : 'Waiting for staff to confirm')}
                        </div>
                        <div>
                          <div style={label}>Certificate scan</div>
                          {(v.scan_urls || []).length === 0 ? <p style={{ margin: '6px 0 0', fontSize: '0.84rem', color: colors.textMuted }}>No certificate uploaded.</p> : (
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
                              {v.scan_urls.map((u, i) => <a key={u} href={u} target="_blank" rel="noopener noreferrer" aria-label={`Open page ${i + 1}`}><img src={u} alt={`Certificate page ${i + 1}`} style={{ width: 110, height: 140, objectFit: 'cover', objectPosition: 'top', borderRadius: 8, border: `1px solid ${colors.tint(0.2)}` }} /></a>)}
                            </div>
                          )}
                        </div>
                        {canPortal && <div><button type="button" style={v.special_group_status === 'confirmed' ? btnGhost : btnPrimary} onClick={() => act(() => vendorsAPI.confirmPeopleCategory(v.id, v.special_group_status !== 'confirmed'))}>{v.special_group_status === 'confirmed' ? 'Take back confirmation' : 'Confirm people category'}</button></div>}
                      </>
                    )}
                  </div>
                )}

                {tab === 'purchases' && (
                  <div style={{ ...box, padding: 0, overflowX: 'auto' }}>
                    {v.purchases.length === 0 ? <p style={{ margin: 0, padding: 18, color: colors.textMuted, fontSize: '0.85rem' }}>Nothing bought from this vendor yet.</p> : (
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
                        <thead><tr><th style={th}>Voucher</th><th style={th}>Date</th><th style={th}>Invoice no.</th><th style={th}>Ref</th><th style={{ ...th, textAlign: 'right' }}>Total</th></tr></thead>
                        <tbody>{v.purchases.map((p) => (
                          <tr key={p.id}><td style={td}><Link to={`/admin/books/vouchers/${p.id}`} style={{ color: colors.primary }}>{p.voucher_number}</Link><div style={{ fontSize: '0.7rem', color: colors.textFaint }}>{p.type}</div></td><td style={td}>{String(p.date).slice(0, 10)}</td><td style={td}>{p.supplier_invoice_no ?? '—'}</td><td style={td}>{p.reference_no ?? '—'}</td><td style={{ ...td, textAlign: 'right' }}>{money(p.total)}</td></tr>
                        ))}</tbody>
                      </table>
                    )}
                  </div>
                )}

                {tab === 'details' && (
                  <div style={{ ...box, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                    {kv('Contact person', v.contact_name)}{kv('Phone', v.phone)}{kv('Email', v.email)}
                    {kv('Tax PIN', v.tax_id)}{kv('Company registration number', v.registration_number)}
                    {kv('Payment terms', v.payment_terms_days != null ? `${v.payment_terms_days} days` : null)}
                    {kv('Address', v.address)}{kv('Notes', v.notes)}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      {modal === 'edit' && v && <VendorModal groups={portalOn} canConfirm={canPortal} vendor={v} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />}
      {modal === 'portal' && v && <PortalLoginModal vendor={v} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />}
    </AdminLayout>
  );
}
