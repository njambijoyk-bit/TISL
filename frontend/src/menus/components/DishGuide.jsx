import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../../core/components/admin/ui/Modal';
import { Field, FormError, FormStack, NumberInput, SelectInput, TextArea, TextInput } from '../../core/components/admin/ui/Form';
import SalesAccountSelect from '../../core/components/admin/tax/SalesAccountSelect';
import menusAPI from '../../_shared/api/menus';
import { errMsg } from '../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, colors } from '../../_shared/theme/tokens';
import useMakeup from '../lib/useMakeup';
import { ModifiersSection } from './DishModifiers';
import { AudienceSection, SizesSection, SlotsSection } from './DishMakeupModal';

const small = { ...btnGhost, padding: '4px 10px', fontSize: '0.72rem' };
const STEPS = ['The dish', 'Sizes', 'What is in it', 'What comes with it', 'Modifiers', 'Packaging'];
const INCLUDED = 'Included';

/** Make a side, with its recipe, while setting up a dish: a name, how it is made, and the amount of each ingredient for one serving. */
function NewSide({ onMade, onCancel }) {
  const [name, setName] = useState('');
  const [order, setOrder] = useState(true);
  const [lines, setLines] = useState([{ ingredient_id: '', quantity: '' }]);
  const [options, setOptions] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => {
    menusAPI.stockRecipes().then((d) => setOptions(d.ingredients ?? [])).catch((e) => { setOptions([]); setErr(errMsg(e, 'Could not load the ingredients')); });
  }, []);
  const patch = (i, p) => setLines((xs) => xs.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const go = async () => {
    setBusy(true); setErr(null);
    try {
      const res = await menusAPI.quickSide({ name, made_to_order: order, lines: lines.filter((l) => l.ingredient_id).map((l) => ({ ingredient_id: Number(l.ingredient_id), quantity: Number(l.quantity) || 0, unit: 'base' })) });
      toast.success(res.message); onMade(res.side);
    } catch (x) { setErr(errMsg(x, 'Could not make the side')); } finally { setBusy(false); }
  };

  return (
    <div data-testid="new-side" style={{ border: `1px dashed ${colors.tint(0.25)}`, borderRadius: 10, padding: 12, display: 'grid', gap: 8 }}>
      <FormError message={err} />
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr', gap: 8 }}>
        <Field label="Name of the side"><TextInput aria-label="Name of the side" maxLength={80} value={name} placeholder="Wet fry, Kale, Chips" onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="How it is made"><SelectInput aria-label="How the side is made" value={order ? 'order' : 'ahead'} onChange={(e) => setOrder(e.target.value === 'order')}><option value="order">Made to order</option><option value="ahead">Made ahead in batches</option></SelectInput></Field>
      </div>
      <div style={{ fontSize: '0.74rem', fontWeight: 700, color: colors.textMuted }}>What goes in one serving</div>
      {lines.map((l, i) => {
        const ing = (options ?? []).find((x) => String(x.id) === String(l.ingredient_id));

        return (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto auto', gap: 8, alignItems: 'center' }}>
            <SelectInput aria-label={`Side ingredient ${i + 1}`} value={l.ingredient_id} onChange={(e) => patch(i, { ingredient_id: e.target.value })}><option value="">Choose an ingredient…</option>{(options ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</SelectInput>
            <NumberInput aria-label={`Side ingredient ${i + 1} amount`} min="0" step="any" placeholder="amount" value={l.quantity} onChange={(e) => patch(i, { quantity: e.target.value })} />
            <span style={{ fontSize: '0.74rem', color: colors.textFaint }}>{ing?.base_unit ?? ''}</span>
            <button type="button" aria-label="Remove ingredient" style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textFaint }} onClick={() => setLines((xs) => (xs.length > 1 ? xs.filter((_, j) => j !== i) : xs))}><Trash2 size={14} /></button>
          </div>
        );
      })}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" style={small} onClick={() => setLines((xs) => [...xs, { ingredient_id: '', quantity: '' }])}><Plus size={12} /> Add an ingredient</button>
        <span style={{ flex: 1 }} />
        <button type="button" style={small} onClick={onCancel}>Cancel</button>
        <button type="button" style={{ ...btnPrimary, padding: '4px 12px', fontSize: '0.74rem' }} disabled={busy || !name.trim() || !lines.some((l) => l.ingredient_id && Number(l.quantity) > 0)} onClick={go}>{busy ? 'Making…' : 'Make the side'}</button>
      </div>
    </div>
  );
}

/** The steps that need the dish to exist already: sizes, what is in it, what comes with it, choices, packaging. */
function Steps({ dish, step, setStep, onClose, onDone, onChoices }) {
  const m = useMakeup(dish);
  const { data, slots, setSlots, key, busy, err } = m;
  const [making, setMaking] = useState(false);
  const included = slots.find((s) => s.kind === 'fixed' && s.name === INCLUDED);
  const isIncluded = (id) => Boolean(included?.choices.some((c) => Number(c.side_id) === Number(id)));
  const include = (id, on) => setSlots((xs) => {
    const has = xs.find((s) => s.kind === 'fixed' && s.name === INCLUDED);
    if (on) {
      const choice = { key: key(), side_id: id, upcharge: '', is_default: false };

      return has ? xs.map((s) => (s === has ? { ...s, choices: [...s.choices, choice] } : s)) : [{ key: key(), name: INCLUDED, kind: 'fixed', min: 0, max: '', choices: [choice] }, ...xs];
    }

    return xs.map((s) => (s === has ? { ...s, choices: s.choices.filter((c) => Number(c.side_id) !== Number(id)) } : s)).filter((s) => s.choices.length > 0 || s.name !== INCLUDED);
  });
  const saveThenNext = async () => {   // the modifiers come from the sides it is made of, so they are saved before that step
    const res = await m.save();
    if (res) setStep(4);
  };
  const finish = async () => {
    const res = await m.save();
    if (res) { toast.success(res.message); onDone(); }
  };

  if (!data) return <p role="status" style={{ margin: 0 }}>Loading…</p>;
  if (!data.ready) return <p role="status" style={{ margin: 0, fontSize: '0.82rem', color: colors.textMuted }}>Run database script 202_menus_dish_makeup.sql first (with 193 and 200 before it): until then the make-up can not be saved.</p>;

  return (
    <FormStack>
      <FormError message={err} />
      {step === 1 && <><SizesSection m={m} /><AudienceSection m={m} /></>}
      {step === 2 && (
        <div data-testid="guide-included" style={{ display: 'grid', gap: 10 }}>
          <div style={{ fontSize: '0.78rem', color: colors.textMuted }}>Tick the sides that always come with {dish.name}, or make a new side here, with its recipe. The guest does not choose these.</div>
          {data.sides.length === 0 && <p style={{ margin: 0, fontSize: '0.78rem', color: colors.textFaint }}>No sides yet: make the first one below.</p>}
          <div style={{ display: 'flex', gap: '6px 16px', flexWrap: 'wrap', fontSize: '0.86rem' }}>
            {data.sides.map((s) => <label key={s.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={isIncluded(s.id)} onChange={(e) => include(s.id, e.target.checked)} /> {s.name}</label>)}
          </div>
          {making ? <NewSide onCancel={() => setMaking(false)} onMade={(side) => { m.addSide(side); include(side.id, true); setMaking(false); }} /> : <div><button type="button" style={small} onClick={() => setMaking(true)}><Plus size={12} /> Make a new side</button></div>}
        </div>
      )}
      {step === 3 && <SlotsSection m={m} />}
      {step === 4 && (
        <div data-testid="guide-choices" style={{ display: 'grid', gap: 14, fontSize: '0.84rem' }}>
          <div>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Leaving out and extra</div>
            <ModifiersSection dish={dish} />
          </div>
          <div>Choices are the older way to let a guest leave something out or add something (no onions, extra cheese), with a price for it. They sit beside the sides above.</div>
          <div><button type="button" style={small} onClick={async () => { const res = await m.save(); if (res) onChoices(dish); }}>Set up choices for {dish.name}</button></div>
          <div style={{ color: colors.textFaint, fontSize: '0.76rem' }}>This saves what you have done so far and opens the choices.</div>
        </div>
      )}
      {step === 5 && <p data-testid="guide-packaging" style={{ margin: 0, fontSize: '0.84rem', color: colors.textMuted }}>Packaging for take out and delivery is set up in a later step. Nothing to do here yet.</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
        <button type="button" style={small} onClick={onClose}>Cancel</button>
        {step > 1 && <button type="button" style={small} onClick={() => setStep(step - 1)}>Back</button>}
        {step < STEPS.length - 1 && <button type="button" style={{ ...btnPrimary, padding: '6px 16px' }} disabled={busy} onClick={step === 3 ? saveThenNext : () => setStep(step + 1)}>Next</button>}
        {step === STEPS.length - 1 && <button type="button" style={{ ...btnPrimary, padding: '6px 16px' }} disabled={busy} onClick={finish}>{busy ? 'Saving…' : 'Finish'}</button>}
      </div>
    </FormStack>
  );
}

/**
 * Menus → Dishes → Guided set-up: one screen that walks through a dish from its name to what comes with it. The dish itself is saved on the first step; the sizes, sides and slots are saved
 * together at the end (a side made on the way is made at once, with its recipe). Choices open the choices screen; packaging comes later.
 */
export default function DishGuide({ dish: given, data, onClose, onDone, onChoices }) {
  const [dish, setDish] = useState(given?.id ? given : null);
  const [step, setStep] = useState(0);
  const [name, setName] = useState(given?.name ?? '');
  const [price, setPrice] = useState(given?.price ?? '');
  const [description, setDescription] = useState(given?.description ?? '');
  const [ledger, setLedger] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const needsLedger = !given?.id && !data.settings.sales_ledger_id;

  const saveBasics = async () => {
    setBusy(true); setErr(null);
    try {
      const res = await menusAPI.saveDish({ name, price: Number(price), description: description || null, ...(needsLedger ? { sales_ledger_id: ledger } : {}), ...(given?.id ? { sort_order: given.sort_order, is_active: given.is_active } : {}) }, dish?.id ?? given?.id);
      setDish(res.dish); setStep(1);
    } catch (x) { setErr(errMsg(x, 'Could not save the dish')); } finally { setBusy(false); }
  };

  return (
    <Modal title={dish ? `Set up ${dish.name}` : 'Guided set-up: new dish'} onClose={onClose} width={860}>
      <ol data-testid="guide-steps" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', listStyle: 'none', margin: '0 0 12px', padding: 0, fontSize: '0.74rem' }}>
        {STEPS.map((s, i) => <li key={s} aria-current={i === step ? 'step' : undefined} style={{ padding: '3px 10px', borderRadius: 999, border: `1px solid ${colors.tint(i === step ? 0.5 : 0.15)}`, fontWeight: i === step ? 800 : 500 }}>{i + 1}. {s}</li>)}
      </ol>
      {step === 0 ? (
        <FormStack>
          <FormError message={err} />
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
            <Field label="Name" htmlFor="guide-name"><TextInput id="guide-name" maxLength={150} value={name} onChange={(e) => setName(e.target.value)} placeholder="Steak sandwich" /></Field>
            <Field label="Price (before tax)" htmlFor="guide-price" hint="With sizes, each size has its own price on the next step."><NumberInput id="guide-price" min="0" step="any" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
          </div>
          {needsLedger && <SalesAccountSelect kind="sales" scope="product" required label="Sales account (it decides the tax)" value={ledger} onChange={setLedger} hint="Set it once for every dish under Menus → Configuration." />}
          <Field label="Description" htmlFor="guide-desc"><TextArea id="guide-desc" rows={3} maxLength={3000} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" style={small} onClick={onClose}>Cancel</button>
            <button type="button" style={{ ...btnPrimary, padding: '6px 16px' }} disabled={busy || !name.trim() || price === '' || (needsLedger && !ledger)} onClick={saveBasics}>{busy ? 'Saving…' : 'Next'}</button>
          </div>
        </FormStack>
      ) : <Steps dish={dish} step={step} setStep={setStep} onClose={onClose} onDone={onDone} onChoices={onChoices} />}
    </Modal>
  );
}
