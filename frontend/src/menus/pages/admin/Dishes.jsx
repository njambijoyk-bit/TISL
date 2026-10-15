import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../core/components/admin/ui/HubHeader';
import Modal from '../../../core/components/admin/ui/Modal';
import { CheckboxRow, Field, FormError, FormStack, ModalActions, NumberInput, SelectInput, TextArea, TextInput } from '../../../core/components/admin/ui/Form';
import SalesAccountSelect from '../../../core/components/admin/tax/SalesAccountSelect';
import menusAPI from '../../../_shared/api/menus';
import useAuthStore from '../../../_shared/store/authStore';
import { canViewMenus, canManageMenus } from '../../../_shared/lib/roles';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../../_shared/theme/tokens';
import MenusNav from '../../components/MenusNav';
import DishOptionsModal from '../../components/DishOptionsModal';
import { AllergenChips, DietChips, Pill } from '../../components/FoodChips';

/**
 * Menus → Dishes: what a customer sees. Behind each dish is one hidden stock item, so sales, batches, cost of sales and recipes work as for any item.
 * Allergens and diet badges come from the ingredients; a dish can instead declare its own.
 */

const th = { textAlign: 'left', padding: '8px 10px', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.textFaint };
const td = { padding: '9px 10px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.06)}`, verticalAlign: 'top' };
const small = { ...btnGhost, padding: '4px 10px', fontSize: '0.72rem', marginRight: 6 };
const money = (n) => (n == null ? '—' : Number(n).toLocaleString('en-KE', { maximumFractionDigits: 2 }));

function Declare({ title, options, inherited, value, onChange }) {
  const declared = value !== null;

  return (
    <fieldset style={{ border: `1px solid ${colors.tint(0.12)}`, borderRadius: 10, padding: 12, margin: 0 }}>
      <legend style={{ fontSize: '0.74rem', fontWeight: 700, color: colors.textMuted, padding: '0 6px' }}>{title}</legend>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.8rem', marginBottom: 4 }}>
        <input type="radio" name={title} checked={!declared} onChange={() => onChange(null)} /> From the ingredients{!declared && inherited.length > 0 && <span style={{ color: colors.textFaint }}> ({inherited.map((c) => options[c] ?? c).join(', ')})</span>}
      </label>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.8rem', marginBottom: declared ? 8 : 0 }}>
        <input type="radio" name={title} checked={declared} onChange={() => onChange(inherited)} /> I will say exactly which
      </label>
      {declared && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
          {Object.entries(options).map(([code, name]) => (
            <label key={code} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem' }}>
              <input type="checkbox" checked={value.includes(code)} onChange={(e) => onChange(e.target.checked ? [...value, code] : value.filter((c) => c !== code))} /> {name}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}

function DishModal({ dish, data, onClose, onDone }) {
  const [name, setName] = useState(dish?.name ?? '');
  const [price, setPrice] = useState(dish?.price ?? '');
  const [description, setDescription] = useState(dish?.description ?? '');
  const [prep, setPrep] = useState(dish?.prep_minutes ?? '');
  const [lead, setLead] = useState(dish?.lead_hours ?? '');
  const [sort, setSort] = useState(dish?.sort_order ?? 0);
  const [active, setActive] = useState(dish?.is_active ?? true);
  const [station, setStation] = useState(dish?.station_id ?? '');
  const [chef, setChef] = useState(dish?.chef_id ?? '');
  const [ledger, setLedger] = useState(null);
  const [allergens, setAllergens] = useState(dish?.allergens_declared ? dish.allergens : null);
  const [tags, setTags] = useState(dish?.tags_declared ? dish.tags : null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const needsLedger = !dish && !data.settings.sales_ledger_id;

  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const res = await menusAPI.saveDish({
        name, price: Number(price), description: description || null, prep_minutes: prep === '' ? null : Number(prep), lead_hours: lead === '' ? null : Number(lead), sort_order: Number(sort) || 0, is_active: active,
        ...(needsLedger ? { sales_ledger_id: ledger } : {}), ...(data.stations ? { station_id: station === '' ? null : Number(station) } : {}), ...(data.chefs ? { chef_id: chef === '' ? null : Number(chef) } : {}), allergens, tags,
      }, dish?.id);
      toast.success(res.message); onDone();
    } catch (x) { setErr(errMsg(x, 'Could not save the dish')); } finally { setBusy(false); }
  };

  return (
    <Modal title={dish ? 'Edit dish' : 'New dish'} onClose={onClose} width={640}>
      <form onSubmit={go}>
        <FormStack>
          <FormError message={err} />
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
            <Field label="Name" htmlFor="dish-name"><TextInput id="dish-name" required maxLength={150} value={name} onChange={(e) => setName(e.target.value)} placeholder="Beef stew" /></Field>
            <Field label="Price (before tax)" htmlFor="dish-price"><NumberInput id="dish-price" required min="0" step="any" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
          </div>
          {needsLedger && <SalesAccountSelect kind="sales" scope="product" required label="Sales account (it decides the tax)" value={ledger} onChange={setLedger} hint="Set it once for every dish under Menus → Settings." />}
          <Field label="Description" htmlFor="dish-desc"><TextArea id="dish-desc" rows={3} maxLength={3000} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Takes about (minutes)" htmlFor="dish-prep"><NumberInput id="dish-prep" min="0" max="6000" value={prep} onChange={(e) => setPrep(e.target.value)} /></Field>
            {data.stations && data.stations.length > 0 && (
              <Field label="Made at" htmlFor="dish-station" hint="The kitchen screen that gets this dish. Empty: the station that takes everything else."><SelectInput id="dish-station" value={station} onChange={(e) => setStation(e.target.value)}><option value="">The default station</option>{data.stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</SelectInput></Field>
            )}
            {data.chefs && data.chefs.length > 0 && (
              <Field label="A dish by" htmlFor="dish-chef" hint="The chef is named on the menu if they are shown on the chefs page."><SelectInput id="dish-chef" value={chef} onChange={(e) => setChef(e.target.value)}><option value="">No one in particular</option>{data.chefs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectInput></Field>
            )}
            <Field label="Made to order: notice needed (hours)" htmlFor="dish-lead" hint="For a cake or anything customers ask for ahead. Empty: an ordinary dish. Dishes with a notice appear under Cakes &amp; catering."><NumberInput id="dish-lead" min="0" max="2000" value={lead} onChange={(e) => setLead(e.target.value)} /></Field>
            <Field label="Order on the menu" htmlFor="dish-sort" hint="Smaller numbers come first."><NumberInput id="dish-sort" min="0" value={sort} onChange={(e) => setSort(e.target.value)} /></Field>
          </div>
          <Declare title="Allergens" options={data.allergens} inherited={dish?.allergens ?? []} value={allergens} onChange={setAllergens} />
          <Declare title="What it contains (for diet badges)" options={data.tags} inherited={dish?.tags ?? []} value={tags} onChange={setTags} />
          <CheckboxRow checked={active} onChange={setActive} label="On the menu" description="Switch off a dish that is not served any more. Its sales history stays." />
          <ModalActions onCancel={onClose} submitLabel="Save dish" busy={busy} disabled={!name.trim() || price === '' || (needsLedger && !ledger)} />
        </FormStack>
      </form>
    </Modal>
  );
}

export default function Dishes() {
  const user = useAuthStore((s) => s.user);
  const canWrite = canManageMenus(user);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [loc, setLoc] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    menusAPI.dishes(loc ? { location_id: loc } : undefined).then(setData).catch((e) => toast.error(errMsg(e, 'Could not load the dishes'))).finally(() => setLoading(false));
  }, [loc]);
  useEffect(() => { load(); }, [load]);
  const done = () => { setModal(null); load(); };

  const toggleSoldOut = async (d) => {
    try { const res = await menusAPI.soldOut(d.id, !d.sold_out_today); toast.success(res.message); load(); } catch (x) { toast.error(errMsg(x, 'Could not change it')); }
  };
  const remove = async (d) => {
    if (!window.confirm(`Delete ${d.name}?`)) return;
    try { const res = await menusAPI.removeDish(d.id); toast.success(res.message); load(); } catch (x) { toast.error(errMsg(x, 'Could not delete'), { duration: 8000 }); }
  };

  if (!canViewMenus(user)) return <AdminLayout><div style={{ padding: 32 }}><NoAccess what="dishes" /></div></AdminLayout>;

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1200, margin: '0 auto' }} data-testid="dishes">
        <MenusNav />
        <HubHeader title="Dishes" description="What customers can order. Each dish has a price, a recipe that says what it uses, and allergens that follow from its ingredients." />
        {data && !data.settings_ready && <p role="status" style={{ ...card, padding: 14, fontSize: '0.82rem', marginBottom: 14 }}>Dishes are not set up yet: run database script 134_menus_dishes.sql in Workbench.</p>}
        {data?.settings_ready && !data.settings.sales_ledger_id && <p role="status" style={{ ...card, padding: 14, fontSize: '0.82rem', marginBottom: 14 }}>Choose the sales account dishes are booked under in <Link to="/admin/menus/settings">Menus → Settings</Link>, so every dish has the right tax.</p>}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, margin: '0 0 14px', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 200 }}>
            <SelectInput aria-label="Branch" value={loc || data?.location_id || ''} onChange={(e) => setLoc(e.target.value)}>
              {(data?.branches ?? []).map((b) => <option key={b.id} value={b.id}>Available at {b.name}</option>)}
            </SelectInput>
          </div>
          {canWrite && <button type="button" style={btnPrimary} onClick={() => setModal({ dish: null })} disabled={!data?.settings_ready}><Plus size={14} /> New dish</button>}
        </div>

        <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
          {loading && !data ? <p style={{ padding: 20, color: colors.textMuted }}>Loading…</p> : !(data?.dishes?.length) ? (
            <p style={{ padding: 20, margin: 0, color: colors.textMuted, fontSize: '0.85rem' }}>No dishes yet. Add your first, then give it a recipe.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Dish</th><th style={{ ...th, textAlign: 'right' }}>Price</th><th style={{ ...th, textAlign: 'right' }}>Cost · margin</th><th style={{ ...th, textAlign: 'right' }}>Can serve</th><th style={th}>Allergens and diets</th><th style={th} /></tr></thead>
              <tbody>{data.dishes.map((d) => (
                <tr key={d.id} data-dish={d.name} style={d.is_active ? undefined : { opacity: 0.55 }}>
                  <td style={td}>
                    <strong>{d.name}</strong>
                    <div style={{ marginTop: 3 }}>
                      {!d.is_active && <Pill>Off the menu</Pill>}
                      {d.sold_out_today && <Pill tone="danger">Sold out today</Pill>}
                      {!d.has_recipe && <Pill tone="warn">No recipe yet</Pill>}
                      {d.made_to_order && <Pill>Made to order</Pill>}
                    </div>
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>{money(d.price)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{d.cost == null ? <span style={{ color: colors.textFaint }}>—</span> : <>{money(d.cost)}<div style={{ fontSize: '0.7rem', color: colors.textFaint }}>{money(d.margin)} · {d.food_cost_pct}% food cost{d.complete ? '' : ' (some costs unknown)'}</div></>}</td>
                  <td style={{ ...td, textAlign: 'right' }} data-testid="available">{d.available == null ? '—' : d.available}</td>
                  <td style={td}>
                    <AllergenChips codes={d.allergens} names={data.allergens} empty={d.info_complete ? <span style={{ color: colors.textFaint }}>none declared</span> : <Pill tone="warn">Not all ingredients are classified</Pill>} />
                    <DietChips codes={d.diets} names={data.diets} />
                  </td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    {canWrite && <button type="button" style={small} onClick={() => setModal({ dish: d })}>Edit</button>}
                    {canWrite && <button type="button" style={small} onClick={() => setModal({ options: d })}>Choices</button>}
                    <Link to="/admin/menus/recipes" style={{ ...small, display: 'inline-block', textDecoration: 'none' }}>Recipe</Link>
                    {canWrite && <button type="button" style={small} onClick={() => toggleSoldOut(d)}>{d.sold_out_today ? 'Available again' : 'Sold out today'}</button>}
                    {canWrite && <button type="button" style={small} onClick={() => remove(d)}>Delete</button>}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
        {data?.settings?.allergen_note && <p style={{ fontSize: '0.74rem', color: colors.textFaint, marginTop: 12 }}>{data.settings.allergen_note}</p>}
      </div>
      {modal?.options && <DishOptionsModal dish={modal.options} onClose={() => setModal(null)} onDone={done} />}
      {modal && !modal.options && data && <DishModal dish={modal.dish} data={data} onClose={() => setModal(null)} onDone={done} />}
    </AdminLayout>
  );
}
