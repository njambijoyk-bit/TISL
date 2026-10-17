import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../../core/components/admin/ui/Modal';
import { Field, FormError, FormStack, ModalActions, NumberInput, SelectInput, TextInput } from '../../core/components/admin/ui/Form';
import menusAPI from '../../_shared/api/menus';
import { errMsg } from '../../_shared/store/helpers/apiState';
import { btnGhost, colors } from '../../_shared/theme/tokens';
import IngredientVariantPicker from './IngredientVariantPicker';

/**
 * Menus → Stock actions on the kitchen's own shelf: send some to another branch, and make a batch of a dish that is made ahead.
 * The units offered for a variant are the ones that make sense for it: packs (when it has a pack size), the alternate unit, the base unit.
 */

const small = { ...btnGhost, padding: '4px 10px', fontSize: '0.72rem' };
const today = () => new Date().toLocaleDateString('en-CA');

const variantsOf = (data) => data.ingredients.flatMap((i) => i.variants.filter((v) => v.is_active).map((v) => ({
  id: v.id, name: v.name, ingredient: i.name, pack_size_base: v.pack_size_base, base_unit: i.base_unit, alt_unit: i.alt_unit, alt_factor: i.alt_factor ?? 1, on_hand: v.qty_base,
})));

const unitsFor = (v) => (v ? [...(v.pack_size_base ? [['pack', 'packs']] : []), ...(v.alt_unit ? [['alt', v.alt_unit]] : []), ['base', v.base_unit]] : [['base', '']]);
const defaultUnit = (v) => (v?.pack_size_base ? 'pack' : v?.alt_unit ? 'alt' : 'base');

/** One row: choose a variant, type a quantity, pick the unit. */
function QtyRow({ row, variants, onChange, onRemove, hint }) {
  const v = variants.find((x) => String(x.id) === String(row.item_id));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '2fr 0.8fr 0.9fr auto', gap: 8, alignItems: 'end' }}>
      <Field label="Ingredient variant">
        <IngredientVariantPicker variants={variants} value={row.item_id} onChange={(id) => onChange({ item_id: id, unit: defaultUnit(variants.find((x) => String(x.id) === id)) })} />
      </Field>
      <Field label="Quantity" hint={hint?.(v)}><NumberInput aria-label="Quantity" min="0" step="any" value={row.quantity} onChange={(e) => onChange({ quantity: e.target.value })} /></Field>
      <Field label="In"><SelectInput aria-label="Unit" value={row.unit} onChange={(e) => onChange({ unit: e.target.value })}>{unitsFor(v).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</SelectInput></Field>
      <button type="button" aria-label="Remove line" onClick={onRemove} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textFaint, padding: 6 }}><Trash2 size={15} /></button>
    </div>
  );
}

function useRows() {
  const blank = () => ({ key: Math.random().toString(36).slice(2), item_id: '', quantity: '', unit: 'base' });
  const [rows, setRows] = useState([blank()]);
  const patch = (key, p) => setRows((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));
  const remove = (key) => setRows((xs) => (xs.length > 1 ? xs.filter((y) => y.key !== key) : xs));
  const add = () => setRows((xs) => [...xs, blank()]);

  return { rows, patch, remove, add };
}

const payloadRows = (rows) => rows.map((l) => ({ item_id: Number(l.item_id), quantity: Number(l.quantity), unit: l.unit }));

export function TransferModal({ data, locationId, onClose, onDone }) {
  const variants = useMemo(() => variantsOf(data), [data]);
  const { rows, patch, remove, add } = useRows();
  const others = data.branches.filter((b) => String(b.id) !== String(locationId));
  const [to, setTo] = useState(others[0]?.id ?? '');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { const res = await menusAPI.transferStock({ from_location_id: Number(locationId), to_location_id: Number(to), date, note: note || null, lines: payloadRows(rows) }); toast.success(res.message); onDone(); } catch (x) { setErr(errMsg(x, 'Could not send the stock')); } finally { setBusy(false); }
  };
  const from = data.branches.find((b) => String(b.id) === String(locationId));

  return (
    <Modal title="Send stock to another branch" onClose={onClose} width={760}>
      <form onSubmit={go}>
        <FormStack>
          <FormError message={err} />
          {others.length === 0 ? <p style={{ margin: 0 }}>There is only one branch, so there is nowhere to send stock.</p> : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="From"><TextInput aria-label="From" value={from?.name ?? ''} readOnly /></Field>
                <Field label="To"><SelectInput aria-label="To branch" required value={to} onChange={(e) => setTo(e.target.value)}>{others.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</SelectInput></Field>
              </div>
              <Field label="Date"><TextInput type="date" aria-label="Date" required value={date} onChange={(e) => setDate(e.target.value)} /></Field>
              {rows.map((r) => <QtyRow key={r.key} row={r} variants={variants} onChange={(p) => patch(r.key, p)} onRemove={() => remove(r.key)} />)}
              <div><button type="button" style={small} onClick={add}><Plus size={12} /> Add a line</button></div>
              <p style={{ margin: 0, fontSize: '0.78rem', color: colors.textMuted }}>The lots that expire first go first and keep their cost, expiry and batch number. Expired and held stock is not sent.</p>
              <Field label="Note (optional)"><TextInput aria-label="Note" maxLength={255} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            </>
          )}
          <ModalActions onCancel={onClose} submitLabel="Send" busy={busy} disabled={others.length === 0 || rows.some((l) => !l.item_id || !(Number(l.quantity) > 0))} />
        </FormStack>
      </form>
    </Modal>
  );
}

export function BatchModal({ dishes, locationId, onClose, onDone }) {
  const [dish, setDish] = useState(dishes[0]?.id ?? '');
  const [portions, setPortions] = useState('');
  const [date, setDate] = useState(today());
  const [expiry, setExpiry] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { const res = await menusAPI.makeBatch({ dish_id: Number(dish), location_id: Number(locationId), portions: Number(portions), date, expiry_date: expiry || null, note: note || null }); toast.success(res.message, { duration: 6000 }); onDone(); } catch (x) { setErr(errMsg(x, 'Could not make the batch')); } finally { setBusy(false); }
  };

  return (
    <Modal title="Make a batch" onClose={onClose} width={560}>
      <form onSubmit={go}>
        <FormStack>
          <FormError message={err} />
          {dishes.length === 0 ? <p style={{ margin: 0 }}>No dish is set to be made ahead. On Recipes, untick “made to order” for a cake or anything cooked in a batch.</p> : (
            <>
              <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textMuted }}>The ingredients are used up now, at their cost, and the portions go on the dish's own shelf. Sales then take from that shelf.</p>
              <Field label="Dish"><SelectInput aria-label="Dish" required value={dish} onChange={(e) => setDish(e.target.value)}>{dishes.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</SelectInput></Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <Field label="Portions made"><NumberInput aria-label="Portions made" required min="0" step="any" value={portions} onChange={(e) => setPortions(e.target.value)} /></Field>
                <Field label="Made on"><TextInput type="date" aria-label="Made on" required value={date} onChange={(e) => setDate(e.target.value)} /></Field>
                <Field label="Best before (optional)"><TextInput type="date" aria-label="Best before" value={expiry} onChange={(e) => setExpiry(e.target.value)} /></Field>
              </div>
              <Field label="Note (optional)"><TextInput aria-label="Note" maxLength={255} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            </>
          )}
          <ModalActions onCancel={onClose} submitLabel="Make it" busy={busy} disabled={!dish || !(Number(portions) > 0)} />
        </FormStack>
      </form>
    </Modal>
  );
}
