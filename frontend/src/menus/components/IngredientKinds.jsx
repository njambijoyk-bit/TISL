import { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../../core/components/admin/ui/Modal';
import { Field, FormError, FormStack, ModalActions, TextInput } from '../../core/components/admin/ui/Form';
import menusAPI from '../../_shared/api/menus';
import { errMsg } from '../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, colors } from '../../_shared/theme/tokens';
import LedgerSelect from './LedgerSelect';
import { Pill } from './FoodChips';

/**
 * Menus → Ingredients → Kinds. A kind says what the ingredients of that kind may be used for: recipes, sold as they are, a free extra with a dish, or packaging.
 * Cooking ingredient is the kind a new ingredient gets, so it stays; a kind that ingredients have cannot be removed.
 */

const th = { textAlign: 'left', padding: '8px 10px', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.textFaint };
const td = { padding: '9px 10px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.07)}`, verticalAlign: 'middle' };
const iconBtn = { background: 'none', border: 'none', cursor: 'pointer', color: colors.textFaint, padding: 4 };
const USE_HINT = {
  in_recipes: 'A recipe can list it (flour, beef, oil, salt).',
  sold_as_is: 'It can be sold as it is with no recipe (a bottle of soda).',
  free_extra: 'It can be given with a dish at no charge (a ketchup sachet).',
  packaging: 'A takeaway order can use it up (boxes, bags).',
  used_up: 'The kitchen uses it up, and it is not food (gloves, cleaning, foil, napkins).',
};

function KindForm({ kind, uses, ledgers, onClose, onDone }) {
  const [name, setName] = useState(kind?.name ?? '');
  const [on, setOn] = useState(() => Object.fromEntries(Object.keys(uses).map((u) => [u, !!kind?.[u]])));
  const [ledger, setLedger] = useState(kind?.expense_ledger_id ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { const res = await menusAPI.saveIngredientKind({ name, ...on, ...(ledgers ? { expense_ledger_id: ledger } : {}) }, kind?.id); toast.success(res.message); onDone(); } catch (x) { setErr(errMsg(x, 'Could not save the kind')); } finally { setBusy(false); }
  };

  return (
    <Modal title={kind ? 'Edit kind' : 'New kind'} onClose={onClose} width={480}>
      <form onSubmit={go}>
        <FormStack>
          <FormError message={err} />
          <Field label="Name" htmlFor="kind-name" hint="For example: Bar drinks, Spices"><TextInput id="kind-name" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
            <legend style={{ fontSize: '0.74rem', fontWeight: 700, color: colors.textMuted, marginBottom: 6 }}>Ingredients of this kind may be…</legend>
            <div style={{ display: 'grid', gap: 6 }}>
              {Object.entries(uses).map(([code, label]) => (
                <label key={code} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '0.84rem', cursor: 'pointer' }}>
                  <input type="checkbox" style={{ marginTop: 3 }} checked={on[code]} onChange={(e) => setOn({ ...on, [code]: e.target.checked })} />
                  <span><strong>{label}</strong><span style={{ display: 'block', fontSize: '0.74rem', color: colors.textMuted }}>{USE_HINT[code]}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
          {ledgers && (
            <LedgerSelect id="kind-ledger" label="Its cost is charged to, when it is used" value={ledger} onChange={setLedger}
              hint="Food Cost of Sales for food. Kitchen Supplies Used for gloves, cleaning and the like. Throwing it away is waste and is booked to Food Waste Expense, whatever the kind." />
          )}
          <ModalActions onCancel={onClose} submitLabel="Save kind" busy={busy} disabled={!name.trim() || !Object.values(on).some(Boolean) || (ledgers && !ledger)} />
        </FormStack>
      </form>
    </Modal>
  );
}

export default function IngredientKindsModal({ canWrite, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const load = useCallback(() => menusAPI.ingredientKinds().then(setData).catch((e) => toast.error(errMsg(e, 'Could not load the kinds'))), []);
  useEffect(() => { load(); }, [load]);
  const changed = () => { setForm(null); load(); onChanged?.(); };
  const remove = async (k) => {
    if (!window.confirm(`Remove ${k.name}?`)) return;
    try { const res = await menusAPI.removeIngredientKind(k.id); toast.success(res.message); changed(); } catch (x) { toast.error(errMsg(x, 'Could not remove it'), { duration: 8000 }); }
  };
  const move = async (i, d) => {
    const ids = data.kinds.map((k) => k.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    try { await menusAPI.orderIngredientKinds(ids); changed(); } catch (x) { toast.error(errMsg(x, 'Could not change the order')); }
  };

  return (
    <Modal title="Kinds of ingredient" onClose={onClose} width={860}>
      <p style={{ margin: '0 0 10px', fontSize: '0.8rem', color: colors.textMuted }}>A kind says what its ingredients may be used for. Recipes list only the kinds used in recipes.</p>
      {data && !data.ready && <p role="status" style={{ fontSize: '0.82rem' }}>Run database script 190_menus_ingredient_kinds.sql first. Until then every ingredient is treated as a cooking ingredient.</p>}
      {data?.ready && !data.ledgers_ready && <p role="status" style={{ fontSize: '0.82rem' }}>Run database script 191_menus_kind_ledgers.sql to add the Supplies kind and the account each kind is charged to.</p>}
      {!data ? <p style={{ color: colors.textMuted }}>Loading…</p> : data.ready && (
        <div data-testid="ingredient-kinds">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Kind</th>
                <th style={th}>Used for</th>
                {data.ledgers_ready && <th style={th}>Ledger</th>}
                <th style={{ ...th, textAlign: 'right' }}>Ingredients</th>
                {canWrite && <th style={{ ...th, textAlign: 'right' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {data.kinds.map((k, i) => (
                <tr key={k.id} data-kind={k.name}>
                  <td style={{ ...td, fontWeight: 700, fontSize: '0.86rem' }}>{k.name}</td>
                  <td style={td}><span style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>{Object.entries(data.uses).filter(([u]) => k[u]).map(([u, label]) => <Pill key={u}>{label.toLowerCase()}</Pill>)}</span></td>
                  {data.ledgers_ready && <td style={td}>{k.expense_ledger ?? <span style={{ color: colors.textFaint }}>none</span>}</td>}
                  <td style={{ ...td, textAlign: 'right', color: colors.textMuted }}>{k.ingredients ? `${k.ingredients} ingredient${k.ingredients === 1 ? '' : 's'}` : 'none yet'}</td>
                  {canWrite && (
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button type="button" aria-label={`Move ${k.name} up`} style={iconBtn} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={14} /></button>
                      <button type="button" aria-label={`Move ${k.name} down`} style={iconBtn} disabled={i === data.kinds.length - 1} onClick={() => move(i, 1)}><ArrowDown size={14} /></button>
                      <button type="button" aria-label={`Edit ${k.name}`} style={iconBtn} onClick={() => setForm({ kind: k })}><Pencil size={14} /></button>
                      <button type="button" aria-label={`Remove ${k.name}`} style={iconBtn} title={k.ingredients ? 'In use: give its ingredients another kind first' : 'Remove'} onClick={() => remove(k)}><Trash2 size={14} /></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
            {canWrite ? <button type="button" style={btnPrimary} onClick={() => setForm({ kind: null })}><Plus size={14} /> New kind</button> : <span />}
            <button type="button" style={btnGhost} onClick={onClose}>Close</button>
          </div>
        </div>
      )}
      {form && data && <KindForm kind={form.kind} uses={data.uses} ledgers={data.ledgers_ready} onClose={() => setForm(null)} onDone={changed} />}
    </Modal>
  );
}
