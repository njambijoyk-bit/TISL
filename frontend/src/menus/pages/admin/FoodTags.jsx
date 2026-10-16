import { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../core/components/admin/ui/HubHeader';
import Modal from '../../../core/components/admin/ui/Modal';
import { Field, FormError, FormStack, ModalActions, TextInput } from '../../../core/components/admin/ui/Form';
import menusAPI from '../../../_shared/api/menus';
import useAuthStore from '../../../_shared/store/authStore';
import { canViewMenus, canManageMenus } from '../../../_shared/lib/roles';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnPrimary, card, colors } from '../../../_shared/theme/tokens';
import MenusNav from '../../components/MenusNav';
import { Pill } from '../../components/FoodChips';

/**
 * Menus → Allergens: the allergens an ingredient can contain and the "what it is" tags (meat, dairy, caffeine...), as the kitchen keeps them. Each says which diet badges it
 * rules out, so a dish is badged vegetarian, vegan, gluten free and so on only when nothing in it rules the badge out. Ingredients and dishes keep a tag's code, so a tag
 * in use cannot be removed (rename it instead), and renaming never loses it from an ingredient.
 */

const iconBtn = { background: 'none', border: 'none', cursor: 'pointer', color: colors.textFaint, padding: 4 };
const KIND_NOTE = {
  allergen: 'What an ingredient contains that someone may react to. Shown to customers on the menu.',
  tag: 'What an ingredient is. Used for diet badges (a dish with meat is not vegetarian), and on the dish pages.',
};

function TagModal({ kind, tag, diets, onClose, onDone }) {
  const [label, setLabel] = useState(tag?.label ?? '');
  const [rules, setRules] = useState(tag?.rules_out ?? []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { const res = await menusAPI.saveFoodTag(tag ? { label, rules_out: rules } : { kind, label, rules_out: rules }, tag?.id); toast.success(res.message); onDone(); } catch (x) { setErr(errMsg(x, 'Could not save it')); } finally { setBusy(false); }
  };

  return (
    <Modal title={`${tag ? 'Edit' : 'New'} ${kind === 'allergen' ? 'allergen' : 'tag'}`} onClose={onClose} width={520}>
      <form onSubmit={go}>
        <FormStack>
          <FormError message={err} />
          <Field label="Name" htmlFor="ft-label" hint={tag ? 'Renaming changes what people read. Ingredients keep it as they had it.' : kind === 'allergen' ? 'For example: Kiwi fruit, Mustard' : 'For example: Gelatine, Offal'}>
            <TextInput id="ft-label" required maxLength={60} value={label} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
            <legend style={{ fontSize: '0.74rem', fontWeight: 700, color: colors.textMuted, marginBottom: 6 }}>A dish with this in it is not…</legend>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
              {Object.entries(diets).map(([code, name]) => (
                <label key={code} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={rules.includes(code)} onChange={(e) => setRules(e.target.checked ? [...rules, code] : rules.filter((c) => c !== code))} /> {name}
                </label>
              ))}
            </div>
          </fieldset>
          <ModalActions onCancel={onClose} submitLabel="Save" busy={busy} disabled={!label.trim()} />
        </FormStack>
      </form>
    </Modal>
  );
}

function Section({ kind, title, rows, diets, canWrite, onAdd, onEdit, onRemove, onMove }) {
  return (
    <section style={{ ...card, padding: 16 }} aria-label={title} data-testid={`tags-${kind}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>{title}</h2>
          <p style={{ margin: '3px 0 0', fontSize: '0.78rem', color: colors.textMuted }}>{KIND_NOTE[kind]}</p>
        </div>
        {canWrite && <button type="button" style={btnPrimary} onClick={onAdd}><Plus size={14} /> {kind === 'allergen' ? 'New allergen' : 'New tag'}</button>}
      </div>
      {rows.length === 0 ? <p style={{ margin: 0, color: colors.textMuted, fontSize: '0.84rem' }}>None yet.</p> : rows.map((t, i) => {
        const used = t.used.ingredients + t.used.dishes;

        return (
          <div key={t.id} data-tag={t.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: `1px solid ${colors.tint(0.07)}`, flexWrap: 'wrap' }}>
            <strong style={{ minWidth: 140, fontSize: '0.86rem' }}>{t.label}</strong>
            <span style={{ flex: 1, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {t.rules_out.length === 0 ? <span style={{ fontSize: '0.76rem', color: colors.textFaint }}>rules out no diet</span> : t.rules_out.map((d) => <Pill key={d}>not {String(diets[d] ?? d).toLowerCase()}</Pill>)}
            </span>
            <span style={{ fontSize: '0.74rem', color: colors.textMuted, minWidth: 90, textAlign: 'right' }}>{used ? `${t.used.ingredients} ingredient${t.used.ingredients === 1 ? '' : 's'}${t.used.dishes ? `, ${t.used.dishes} dish${t.used.dishes === 1 ? '' : 'es'}` : ''}` : 'not used yet'}</span>
            {canWrite && (
              <span style={{ whiteSpace: 'nowrap' }}>
                <button type="button" aria-label={`Move ${t.label} up`} style={iconBtn} disabled={i === 0} onClick={() => onMove(i, -1)}><ArrowUp size={14} /></button>
                <button type="button" aria-label={`Move ${t.label} down`} style={iconBtn} disabled={i === rows.length - 1} onClick={() => onMove(i, 1)}><ArrowDown size={14} /></button>
                <button type="button" aria-label={`Edit ${t.label}`} style={iconBtn} onClick={() => onEdit(t)}><Pencil size={14} /></button>
                <button type="button" aria-label={`Remove ${t.label}`} style={iconBtn} title={used ? 'In use: take it off first' : 'Remove'} onClick={() => onRemove(t)}><Trash2 size={14} /></button>
              </span>
            )}
          </div>
        );
      })}
    </section>
  );
}

export default function FoodTags() {
  const user = useAuthStore((s) => s.user);
  const canWrite = canManageMenus(user);
  const [data, setData] = useState(null);
  const [modal, setModal] = useState(null);
  const load = useCallback(() => menusAPI.foodTags().then(setData).catch((e) => toast.error(errMsg(e, 'Could not load the allergens'))), []);
  useEffect(() => { load(); }, [load]);
  const done = () => { setModal(null); load(); };
  const remove = async (t) => {
    if (!window.confirm(`Remove ${t.label}?`)) return;
    try { const res = await menusAPI.removeFoodTag(t.id); toast.success(res.message); load(); } catch (x) { toast.error(errMsg(x, 'Could not remove it'), { duration: 8000 }); }
  };
  const move = async (kind, rows, i, d) => {
    const ids = rows.map((r) => r.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    try { await menusAPI.orderFoodTags(kind, ids); load(); } catch (x) { toast.error(errMsg(x, 'Could not change the order')); }
  };

  if (!canViewMenus(user)) return <AdminLayout><div style={{ padding: 32 }}><NoAccess what="the allergens" /></div></AdminLayout>;

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1000, margin: '0 auto' }} data-testid="food-tags">
        <MenusNav />
        <HubHeader title="Allergens" description="The allergens and the “what it is” tags that ingredients carry, and which diet badges each one rules out." />
        {data && !data.ready && <p role="status" style={{ ...card, padding: 14, fontSize: '0.82rem', marginBottom: 14 }}>Run database script 186_menus_food_tags.sql first. Until then Menus uses its built-in lists, which can be read but not changed here.</p>}
        {!data ? <p style={{ color: colors.textMuted }}>Loading…</p> : data.ready && (
          <div style={{ display: 'grid', gap: 16 }}>
            <Section kind="allergen" title="Allergens" rows={data.allergens} diets={data.diets} canWrite={canWrite} onAdd={() => setModal({ kind: 'allergen' })} onEdit={(t) => setModal({ kind: 'allergen', tag: t })} onRemove={remove} onMove={(i, d) => move('allergen', data.allergens, i, d)} />
            <Section kind="tag" title="What it is" rows={data.tags} diets={data.diets} canWrite={canWrite} onAdd={() => setModal({ kind: 'tag' })} onEdit={(t) => setModal({ kind: 'tag', tag: t })} onRemove={remove} onMove={(i, d) => move('tag', data.tags, i, d)} />
          </div>
        )}
      </div>
      {modal && data && <TagModal kind={modal.kind} tag={modal.tag} diets={data.diets} onClose={() => setModal(null)} onDone={done} />}
    </AdminLayout>
  );
}
