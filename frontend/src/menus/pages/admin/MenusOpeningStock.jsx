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
import OpeningStockGrid from '../../components/OpeningStockGrid';
import { useMenusBranch } from '../../lib/menusBranch';

/**
 * Menus → Stock → Opening stock: the whole shelf as one sheet. Type what the kitchen starts with row by row; touched rows are counted on Save all and kept in this browser
 * until saved. Saving makes one opening receipt for the branch and the date, with one Journal (Dr Food Ingredients Inventory, Cr the opening balance account).
 */
export default function MenusOpeningStock() {
  const user = useAuthStore((s) => s.user);
  const canWrite = canManageMenus(user);
  const [data, setData] = useState(null);
  const [loc, setLoc] = useMenusBranch(data?.branches);
  const [date, setDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [note, setNote] = useState('');

  const load = useCallback((location) => menusAPI.stock(location ? { location_id: location } : undefined).then((s) => { setData(s); setLoc((l) => l || String(s.location_id)); }).catch((e) => toast.error(errMsg(e, 'Could not load the stock'))), [setLoc]);
  useEffect(() => { load(loc); }, [load, loc]);

  const save = async (lines) => {
    const res = await menusAPI.openingStock({ location_id: Number(loc), date, narration: note || 'Opening stock', lines });
    toast.success(`${res.message} ${lines.length} variant${lines.length === 1 ? ' is' : 's are'} on the shelf.`, { duration: 6000 });
    await load(loc);
  };

  if (!canViewMenus(user)) return <AdminLayout><div style={{ padding: 32 }}><NoAccess what="the kitchen stock" /></div></AdminLayout>;

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1300, margin: '0 auto' }} data-testid="opening-stock">
        <HubHeader title="Opening stock" description="What the kitchen starts with, as one sheet. Type a row and it counts toward Save all; nothing is booked until you save, and what you type is kept on this computer meanwhile. Each variant gets an Opening stock voucher of its own." />
        {data && !data.installed && <p role="status" style={{ ...card, padding: 14, fontSize: '0.82rem', marginBottom: 14 }}>Run database script 182_menus_ingredient_stock.sql first.</p>}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end', marginBottom: 12 }}>
          <Link to="/admin/menus/stock" style={{ ...btnGhost, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}><ArrowLeft size={14} /> Stock</Link>
          <Field label="Branch"><SelectInput aria-label="Branch" value={loc} onChange={(e) => setLoc(e.target.value)}>{(data?.branches ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</SelectInput></Field>
          <Field label="Stock as at" htmlFor="os-date"><TextInput id="os-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Note (optional)" htmlFor="os-note" style={{ flex: '1 1 220px', maxWidth: 340 }}><TextInput id="os-note" maxLength={255} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opening stock" /></Field>
        </div>
        {!data ? <p style={{ color: colors.textMuted }}>Loading…</p> : data.installed && loc && (
          <OpeningStockGrid ingredients={data.ingredients} locationId={loc} onSave={save} readOnly={!canWrite} />
        )}
        <p style={{ marginTop: 14, fontSize: '0.74rem', color: colors.textFaint }}>Each voucher is booked against the opening balance account (Books, Settings, Default ledgers) and is listed under Purchases, Opening stock. Prices are before tax.</p>
      </div>
    </AdminLayout>
  );
}
