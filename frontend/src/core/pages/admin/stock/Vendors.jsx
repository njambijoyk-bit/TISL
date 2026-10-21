import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Table2, LayoutGrid } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../components/admin/ui/HubHeader';
import { money } from '../../../components/admin/books/booksFmt';
import vendorsAPI from '../../../../_shared/api/vendors';
import useAuthStore from '../../../../_shared/store/authStore';
import { canReadFinance, canWriteFinance, hasPermission } from '../../../../_shared/lib/roles';
import { isModuleActive, MODULES } from '../../../../_shared/navigation/modules';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../../../_shared/theme/tokens';
import { VendorModal, PortalLoginModal } from './vendors/VendorModals';
import { Chip, StatusChip, FlagChip, GroupLine, RowMenu } from './vendors/vendorUi';
import { useNarrow, GROUP_LABELS } from './vendors/vendorHelpers';

/**
 * Vendors: everyone we buy from. Each is a Sundry Creditors ledger, so purchases, payments and what we owe them all follow.
 * Two ways to look: a table (best with many vendors) or cards (best on a phone, the default there). "View" opens the vendor's file.
 */

const th = { textAlign: 'left', padding: '12px 14px', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: colors.textFaint, fontWeight: 700 };
const td = { padding: '12px 14px', fontSize: '0.84rem', borderTop: `1px solid ${colors.tint(0.07)}`, verticalAlign: 'middle', color: colors.text };
const sub = { fontSize: '0.72rem', color: colors.textFaint, marginTop: 2 };
const pill = (on) => ({ fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 600, padding: '6px 13px', borderRadius: 999, cursor: 'pointer', color: on ? colors.textOnPrimary ?? '#fff' : colors.textMuted, background: on ? colors.primary : 'transparent', border: `1px solid ${on ? colors.primary : colors.tint(0.22)}` });

const readPref = (k) => { try { return window.localStorage.getItem(k); } catch { return null; } };
const savePref = (k, v) => { try { window.localStorage.setItem(k, v); } catch { /* not saved: fine */ } };

export default function Vendors() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const canWrite = canWriteFinance(user);
  const portalOn = isModuleActive(MODULES.EXTRAS);
  const canPortal = portalOn && hasPermission(user, 'vendors.portal');
  const canSeePq = portalOn && hasPermission(user, 'prequalification.view');
  const narrow = useNarrow();
  const prefKey = narrow ? 'vendors.view.phone' : 'vendors.view.desktop';

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [modal, setModal] = useState(null);
  const [chosen, setChosen] = useState(null);
  const view = chosen ?? readPref(prefKey) ?? (narrow ? 'cards' : 'table');
  const setView = (v) => { setChosen(v); savePref(prefKey, v); };

  const load = useCallback(() => {
    setLoading(true);
    vendorsAPI.list({ search: search || undefined })
      .then((d) => { setRows(d.rows); setError(null); })
      .catch((e) => { setRows([]); setError(errMsg(e, 'Could not load vendors')); })
      .finally(() => setLoading(false));
  }, [search]);
  useEffect(() => { const t = setTimeout(load, search ? 250 : 0); return () => clearTimeout(t); }, [load, search]);
  const done = () => { setModal(null); load(); };

  const filters = useMemo(() => {
    const list = [
      ['all', 'All', () => true],
      ['active', 'Active', (r) => r.status === 'active'],
      ['pending', 'Pending approval', (r) => r.status === 'pending_approval'],
      ['suspended', 'Suspended', (r) => r.status === 'suspended'],
      ['check', 'Needs a look', (r) => (r.flags || []).length > 0],
      ['owed', 'Owed money', (r) => Number(r.owed) > 0],
    ];
    if (portalOn) {
      list.push(['nologin', 'No portal login', (r) => !r.has_login]);
      Object.entries(GROUP_LABELS).forEach(([k, label]) => list.push([`g_${k}`, label, (r) => r.special_group === k]));
    }
    return list.map(([key, label, fn]) => ({ key, label, fn, count: rows.filter(fn).length }));
  }, [rows, portalOn]);
  const active = filters.find((f) => f.key === filter) ?? filters[0];
  const shown = rows.filter(active.fn);

  const toggle = async (r) => {
    try { const res = await vendorsAPI.update(r.id, { status: r.status === 'active' ? 'suspended' : 'active' }); toast.success(res.message); load(); } catch (x) { toast.error(errMsg(x, 'Could not update')); }
  };
  const confirmGroup = async (r) => {
    try { const res = await vendorsAPI.confirmPeopleCategory(r.id, r.special_group_status !== 'confirmed'); toast.success(res.message); load(); } catch (x) { toast.error(errMsg(x, 'Could not change it')); }
  };
  const edit = async (r) => { try { setModal({ kind: 'edit', vendor: await vendorsAPI.show(r.id) }); } catch (x) { toast.error(errMsg(x, 'Could not load')); } };
  const open = (r, tab) => navigate(`/admin/vendors/${r.id}${tab ? `?tab=${tab}` : ''}`);

  const menuFor = (r) => [
    canWrite && { label: 'Edit details', onClick: () => edit(r) },
    canSeePq && { label: 'Pre-qualification', onClick: () => open(r, 'pq') },
    canPortal && r.special_group && { label: r.special_group_status === 'confirmed' ? 'Take back people category' : 'Confirm people category', onClick: () => confirmGroup(r) },
    canPortal && { label: r.has_login ? 'Reset portal password' : 'Create portal login', onClick: () => setModal({ kind: 'portal', vendor: r }) },
    canWrite && 'divider',
    canWrite && { label: r.status === 'active' ? 'Suspend vendor' : 'Activate vendor', tone: r.status === 'active' ? 'danger' : 'success', onClick: () => toggle(r) },
  ];

  if (!canReadFinance(user)) return <AdminLayout><div style={{ padding: 32 }}><NoAccess what="vendors" /></div></AdminLayout>;

  const seg = (v, Icon, label) => (
    <button type="button" aria-pressed={view === v} aria-label={label} title={label} onClick={() => setView(v)}
      style={{ ...btnGhost, padding: '6px 10px', borderRadius: 0, border: 'none', background: view === v ? colors.tint(0.16) : 'transparent', color: view === v ? colors.primary : colors.textMuted }}><Icon size={16} /></button>
  );

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1280, margin: '0 auto' }}>
        <HubHeader title="Vendors" description="Everyone we buy from. Each is a Sundry Creditors ledger; enter what they invoice us as a Purchase." />

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', margin: '0 0 12px' }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search vendors" aria-label="Search vendors" style={{ padding: '8px 12px', borderRadius: 8, border: `1.5px solid ${colors.tint(0.18)}`, fontSize: '0.82rem', fontFamily: 'inherit', minWidth: 220, flex: '0 1 280px', background: 'transparent', color: colors.text }} />
          <span style={{ flex: 1 }} />
          <div role="group" aria-label="Layout" style={{ display: 'inline-flex', overflow: 'hidden', borderRadius: 8, border: `1px solid ${colors.tint(0.22)}` }}>{seg('table', Table2, 'Table')}{seg('cards', LayoutGrid, 'Cards')}</div>
          {canWrite && <button type="button" style={btnPrimary} onClick={() => setModal({ kind: 'add' })}><Plus size={14} /> Add a vendor</button>}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {filters.filter((f) => f.key === 'all' || f.key === filter || f.count > 0).map((f) => (
            <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)} style={pill(filter === f.key)}>{f.label} <b style={{ opacity: 0.75, marginLeft: 4 }}>{f.count}</b></button>
          ))}
        </div>

        {error && <p role="alert" style={{ margin: '0 0 14px', padding: '10px 14px', borderRadius: radiusSm, fontSize: '0.8rem', background: colors.dangerBg, color: colors.dangerText }}>{error}</p>}

        {loading && rows.length === 0 ? <p style={{ padding: 20, color: colors.textMuted }}>Loading…</p> : shown.length === 0 ? (
          <div style={{ ...card, padding: 28, textAlign: 'center', color: colors.textMuted, fontSize: '0.85rem' }}>{error ? '' : search || filter !== 'all' ? 'No vendors match.' : 'No vendors yet.'}</div>
        ) : view === 'cards' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 14, opacity: loading ? 0.6 : 1 }}>
            {shown.map((r) => (
              <div key={r.id} style={{ ...card, padding: 18, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: '0.95rem', overflowWrap: 'anywhere' }}>{r.company_name}</div><div style={sub}>{r.vendor_number}</div><GroupLine v={r} /></div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}><StatusChip status={r.status} /><FlagChip flags={r.flags} /></div>
                </div>
                <div style={{ fontSize: '0.8rem', color: colors.textMuted, lineHeight: 1.5, overflowWrap: 'anywhere' }}>{r.contact_name}<br />{[r.phone, r.email].filter(Boolean).join(' · ')}</div>
                {portalOn && <div><Chip tone={r.has_login ? 'success' : 'neutral'}>{r.has_login ? 'Portal login' : 'No portal login'}</Chip></div>}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', borderTop: `1px solid ${colors.tint(0.08)}`, paddingTop: 12 }}>
                  <div><div style={{ fontSize: '0.64rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: colors.textFaint, fontWeight: 700 }}>We owe</div><div style={{ fontWeight: 800, fontSize: '1.05rem', color: Number(r.owed) > 0 ? colors.warningText : colors.text }}>{money(r.owed)}</div></div>
                  <div style={{ display: 'flex', gap: 6 }}><button type="button" style={btnGhost} onClick={() => open(r)}>View</button><RowMenu items={menuFor(r)} /></div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ ...card, padding: 0, overflowX: 'auto', opacity: loading ? 0.6 : 1 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
              <thead><tr><th style={th}>Vendor</th><th style={th}>Contact</th><th style={th}>Status</th>{portalOn && <th style={th}>Portal</th>}<th style={{ ...th, textAlign: 'right' }}>We owe</th><th style={th} /></tr></thead>
              <tbody>{shown.map((r) => (
                <tr key={r.id}>
                  <td style={td}><strong>{r.company_name}</strong><div style={sub}>{r.vendor_number}</div><GroupLine v={r} /></td>
                  <td style={td}>{r.contact_name}<div style={sub}>{[r.phone, r.email].filter(Boolean).join(' · ')}</div></td>
                  <td style={td}><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><StatusChip status={r.status} /><FlagChip flags={r.flags} /></div></td>
                  {portalOn && <td style={td}><Chip tone={r.has_login ? 'success' : 'neutral'}>{r.has_login ? 'Has login' : 'No login'}</Chip></td>}
                  <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: Number(r.owed) > 0 ? 700 : 400 }}>{money(r.owed)}</td>
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}><button type="button" style={{ ...btnGhost, marginRight: 6 }} onClick={() => open(r)}>View</button><RowMenu items={menuFor(r)} /></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
      {modal?.kind === 'add' && <VendorModal groups={portalOn} onClose={() => setModal(null)} onDone={done} />}
      {modal?.kind === 'edit' && <VendorModal groups={portalOn} canConfirm={canPortal} vendor={modal.vendor} onClose={() => setModal(null)} onDone={done} />}
      {modal?.kind === 'portal' && <PortalLoginModal vendor={modal.vendor} onClose={() => setModal(null)} onDone={done} />}
    </AdminLayout>
  );
}

const radiusSm = 8;
