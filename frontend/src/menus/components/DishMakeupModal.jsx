import { Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../../core/components/admin/ui/Modal';
import { Field, FormError, FormStack, ModalActions, NumberInput, SelectInput, TextInput } from '../../core/components/admin/ui/Form';
import useMakeup from '../lib/useMakeup';
import { btnGhost, colors } from '../../_shared/theme/tokens';

const small = { ...btnGhost, padding: '4px 10px', fontSize: '0.72rem' };
const iconBtn = { background: 'none', border: 'none', cursor: 'pointer', color: colors.textFaint, padding: 3 };
const HINTS = {
  fixed: 'Part of the dish, in its price: the bread under the steak.',
  choose_one: 'The guest picks exactly one: choma or wet fry. A side can add to the price.',
  choose_any: 'The guest picks some or all: kale, cabbage or both. Say the fewest and the most.',
  free_extra: 'Given with the dish at no charge, up to a number: sauces.',
  paid_extra: 'Extras the guest pays for, each with its own price: another egg.',
};

export function SizesSection({ m }) {
  const { data, prices, setPrices } = m;

  return (
    <div data-testid="makeup-sizes">
      <div style={{ fontSize: '0.74rem', fontWeight: 700, color: colors.textMuted, marginBottom: 4 }}>Sizes and their prices</div>
      <div style={{ fontSize: '0.72rem', color: colors.textFaint, marginBottom: 6 }}>The price is for the whole dish in that size, not the sum of its parts. Leave a size empty if the dish is not sold in it. With no sizes the dish is sold at its own price ({Number(data.price).toLocaleString('en-KE')}) in one size.</div>
      {data.serving_list.length === 0 ? <p style={{ margin: 0, fontSize: '0.78rem', color: colors.textMuted }}>No serving sizes yet: add Jumbo, Medium, Kids under Menus, Configuration.</p> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          {data.serving_list.map((s) => <Field key={s.id} label={s.name} htmlFor={`mk-s-${s.id}`}><NumberInput id={`mk-s-${s.id}`} min="0" step="any" placeholder="not sold" value={prices[s.id] ?? ''} onChange={(e) => setPrices((p) => ({ ...p, [s.id]: e.target.value }))} /></Field>)}
        </div>
      )}
    </div>
  );
}

export function AudienceSection({ m }) {
  const { data, audiences, setAudiences } = m;

  return (
    <div data-testid="makeup-audience">
      <div style={{ fontSize: '0.74rem', fontWeight: 700, color: colors.textMuted, marginBottom: 6 }}>Who it is for</div>
      {data.audience_list.length === 0 ? <p style={{ margin: 0, fontSize: '0.78rem', color: colors.textMuted }}>No audiences yet: add Adults, Kids under Menus, Configuration. With none chosen the dish is for everyone.</p> : (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: '0.86rem' }}>
          {data.audience_list.map((a) => (
            <label key={a.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={audiences.includes(a.id)} onChange={(e) => setAudiences((xs) => (e.target.checked ? [...xs, a.id] : xs.filter((x) => x !== a.id)))} /> {a.name}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export function SlotsSection({ m }) {
  const { data, slots, setSlots, key, patchSlot, patchChoice, move, setDefault } = m;

  return (
    <div data-testid="makeup-slots">
      <div style={{ fontSize: '0.74rem', fontWeight: 700, color: colors.textMuted, marginBottom: 6 }}>What it is made of (slots filled with sides)</div>
      <div style={{ display: 'grid', gap: 12 }}>
        {slots.map((s, i) => (
          <div key={s.key} data-testid="makeup-slot" style={{ border: `1px solid ${colors.tint(0.12)}`, borderRadius: 10, padding: 12, display: 'grid', gap: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.4fr auto', gap: 8, alignItems: 'end' }}>
              <Field label="Slot name"><TextInput aria-label={`Slot ${i + 1} name`} maxLength={60} value={s.name} placeholder="Bread, Choose a protein, Sauces" onChange={(e) => patchSlot(s.key, { name: e.target.value })} /></Field>
              <Field label="Filled how"><SelectInput aria-label={`Slot ${i + 1} kind`} value={s.kind} onChange={(e) => patchSlot(s.key, { kind: e.target.value })}>{Object.entries(data.kinds).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectInput></Field>
              <div style={{ display: 'flex', gap: 2 }}>
                <button type="button" aria-label="Move slot up" style={iconBtn} onClick={() => move(i, -1)}><ArrowUp size={15} /></button>
                <button type="button" aria-label="Move slot down" style={iconBtn} onClick={() => move(i, 1)}><ArrowDown size={15} /></button>
                <button type="button" aria-label="Remove slot" style={iconBtn} onClick={() => setSlots((xs) => xs.filter((x) => x.key !== s.key))}><Trash2 size={15} /></button>
              </div>
            </div>
            <div style={{ fontSize: '0.72rem', color: colors.textFaint }}>{HINTS[s.kind]}</div>
            {['choose_any', 'free_extra', 'paid_extra'].includes(s.kind) && (
              <div style={{ display: 'grid', gridTemplateColumns: s.kind === 'choose_any' ? '1fr 1fr' : '1fr', gap: 8, maxWidth: 360 }}>
                {s.kind === 'choose_any' && <Field label="Fewest"><NumberInput aria-label={`Slot ${i + 1} fewest`} min="0" value={s.min} onChange={(e) => patchSlot(s.key, { min: e.target.value })} /></Field>}
                <Field label="Most" hint="Empty: no limit."><NumberInput aria-label={`Slot ${i + 1} most`} min="1" value={s.max} onChange={(e) => patchSlot(s.key, { max: e.target.value })} /></Field>
              </div>
            )}
            <div style={{ display: 'grid', gap: 6 }}>
              {s.choices.map((c, j) => (
                <div key={c.key} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto auto', gap: 8, alignItems: 'center' }}>
                  <SelectInput aria-label={`Slot ${i + 1} side ${j + 1}`} value={c.side_id} onChange={(e) => patchChoice(s.key, c.key, { side_id: e.target.value })}>
                    <option value="">Choose a side…</option>{data.sides.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </SelectInput>
                  {['fixed', 'free_extra'].includes(s.kind) ? <span style={{ fontSize: '0.74rem', color: colors.textFaint }}>no extra charge</span>
                    : <NumberInput aria-label={`Slot ${i + 1} side ${j + 1} price`} min="0" step="any" placeholder={s.kind === 'paid_extra' ? 'price' : 'adds'} value={c.upcharge} onChange={(e) => patchChoice(s.key, c.key, { upcharge: e.target.value })} />}
                  {['choose_one', 'choose_any'].includes(s.kind) ? <label style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: '0.74rem' }}><input type="checkbox" aria-label={`Slot ${i + 1} side ${j + 1} chosen to begin with`} checked={Boolean(c.is_default)} onChange={(e) => setDefault(s, c, e.target.checked)} /> to begin with</label> : <span />}
                  <button type="button" aria-label="Remove side" style={iconBtn} onClick={() => patchSlot(s.key, { choices: s.choices.filter((x) => x.key !== c.key) })}><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
            <div><button type="button" style={small} onClick={() => patchSlot(s.key, { choices: [...s.choices, { key: key(), side_id: '', upcharge: '', is_default: false }] })}><Plus size={12} /> Add a side</button></div>
          </div>
        ))}
      </div>
      <button type="button" style={{ ...small, marginTop: 10 }} onClick={() => setSlots((xs) => [...xs, { key: key(), name: '', kind: 'fixed', min: 0, max: '', choices: [{ key: key(), side_id: '', upcharge: '', is_default: false }] }])}><Plus size={12} /> Add a slot</button>
    </div>
  );
}

/** Menus → Dishes → Make-up: the sizes a dish is sold in and what each costs, who it is for, and the slots (bread, choose a protein, sauces, extras) filled with sides. */
export default function DishMakeupModal({ dish, onClose, onDone }) {
  const m = useMakeup(dish);
  const { data, busy, err } = m;
  const go = async (e) => {
    e.preventDefault();
    const res = await m.save();
    if (res) { toast.success(res.message); onDone(); }
  };

  return (
    <Modal title={`Make-up: ${dish.name}`} onClose={onClose} width={860}>
      <form onSubmit={go}>
        <FormStack>
          <FormError message={err} />
          {data && !data.ready && <p role="status" style={{ margin: 0, fontSize: '0.82rem', color: colors.textMuted }}>Run database script 202_menus_dish_makeup.sql first (with 193 and 200 before it): until then the make-up can not be saved.</p>}
          {data?.ready && (
            <>
              <SizesSection m={m} />
              <AudienceSection m={m} />
              <SlotsSection m={m} />
            </>
          )}
          <ModalActions onCancel={onClose} submitLabel="Save make-up" busy={busy} disabled={!data?.ready} />
        </FormStack>
      </form>
    </Modal>
  );
}
