import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../core/components/admin/ui/HubHeader';
import { Field, SelectInput, TextInput } from '../../../core/components/admin/ui/Form';
import menusAPI from '../../../_shared/api/menus';
import useAuthStore from '../../../_shared/store/authStore';
import { canViewMenus, canManageMenus } from '../../../_shared/lib/roles';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnGhost, card, colors } from '../../../_shared/theme/tokens';
import CountStockGrid from '../../components/CountStockGrid';
import { useMenusBranch } from '../../lib/menusBranch';

/**
 * Menus → Stock → Count stock: the whole shelf as one sheet. Type what is really there row by row (in packs, the bigger unit or the base unit); the difference shows at once, counted rows are
 * kept in this browser until saved, and Save count makes one stock count (listed under Purchases, Stock counts) with a Journal for the difference: Dr Food Waste Expense, Cr Food Ingredients
 * Inventory for a loss, the other way round for stock found.
 */
export default function MenusCountStock() {
  const user = useAuthStore((s) => s.user);
  const canWrite = canManageMenus(user);
  const [data, setData] = useState(null);
  const [loc, setLoc] = useMenusBranch(data?.branches);
  const [date, setDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [note, setNote] = useState('');

  const load = useCallback((location) => menusAPI.stock(location ? { location_id: location } : undefined).then((s) => { setData(s); setLoc((l) => l || String(s.location_id)); }).catch((e) => toast.error(errMsg(e, 'Could not load the stock'))), [setLoc]);
  useEffect(() => { load(loc); }, [load, loc]);

  const save = async (lines) => {
    const res = await menusAPI.countStock({ location_id: Number(loc), date, note: note || null, lines });
    toast.success(`${res.message} ${lines.length} variant${lines.length === 1 ? ' was' : 's were'} counted${res.value_change ? `; the difference is worth ${Number(res.value_change).toLocaleString('en-KE')}` : ': everything agreed'}.`, { duration: 7000 });
    await load(loc);
  };

  if (!canViewMenus(user)) return <AdminLayout><div style={{ padding: 32 }}><NoAccess what="the kitchen stock" /></div></AdminLayout>;

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1300, margin: '0 auto' }} data-testid="count-stock">
        <HubHeader title="Count stock" description="Count the shelf as one sheet. Type what is really there; the difference shows at once, and nothing changes until you save. What you type is kept on this computer meanwhile." />
        {data && !data.installed && <p role="status" style={{ ...card, padding: 14, fontSize: '0.82rem', marginBottom: 14 }}>Run database script 182_menus_ingredient_stock.sql first.</p>}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end', marginBottom: 12 }}>
          <Link to="/admin/menus/stock" style={{ ...btnGhost, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}><ArrowLeft size={14} /> Stock</Link>
          <Field label="Branch"><SelectInput aria-label="Branch" value={loc} onChange={(e) => setLoc(e.target.value)}>{(data?.branches ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</SelectInput></Field>
          <Field label="Counted on" htmlFor="cs-date"><TextInput id="cs-date" type="date" max={new Date().toLocaleDateString('en-CA')} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Note (optional)" htmlFor="cs-note" style={{ flex: '1 1 220px', maxWidth: 340 }}><TextInput id="cs-note" maxLength={255} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Monthly count" /></Field>
        </div>
        {!data ? <p style={{ color: colors.textMuted }}>Loading…</p> : data.installed && loc && (
          <CountStockGrid ingredients={data.ingredients} kinds={data.kinds} locationId={loc} onSave={save} readOnly={!canWrite} />
        )}
        <p style={{ marginTop: 14, fontSize: '0.74rem', color: colors.textFaint }}>The books say includes stock on hold. Counts are listed under Purchases, Stock counts, with the Journal they made.</p>
      </div>
    </AdminLayout>
  );
}
