import { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../core/components/admin/ui/HubHeader';
import Modal from '../../../core/components/admin/ui/Modal';
import { CheckboxRow, Field, FormError, FormStack, ModalActions, NumberInput, SelectInput, TextInput } from '../../../core/components/admin/ui/Form';
import menusAPI from '../../../_shared/api/menus';
import useAuthStore from '../../../_shared/store/authStore';
import { canViewMenus, canManageMenus } from '../../../_shared/lib/roles';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../../_shared/theme/tokens';
import { Pill } from '../../components/FoodChips';

/**
 * Menus → Menus: the cards customers read (Breakfast, Lunch, Bar). Each has the days and hours it is served, headings (sections), and the dishes under each heading in the order shown.
 */

const small = { ...btnGhost, padding: '4px 10px', fontSize: '0.72rem', marginRight: 6 };
const iconBtn = { background: 'none', border: 'none', cursor: 'pointer', color: colors.textFaint, padding: 3 };
const swap = (xs, i, d) => { const ys = [...xs]; const j = i + d; if (j < 0 || j >= ys.length) return ys; [ys[i], ys[j]] = [ys[j], ys[i]]; return ys; };

function MenuModal({ menu, dishes, days, onClose, onDone }) {
  const [name, setName] = useState(menu?.name ?? '');
  const [description, setDescription] = useState(menu?.description ?? '');
  const [picked, setPicked] = useState(menu?.days ?? []);
  const [from, setFrom] = useState(menu?.starts_at ?? '');
  const [to, setTo] = useState(menu?.ends_at ?? '');
  const [sort, setSort] = useState(menu?.sort_order ?? 0);
  const [active, setActive] = useState(menu?.is_active ?? true);
  const [sections, setSections] = useState(menu?.sections ?? []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const nameOf = (id) => dishes.find((d) => d.id === id)?.name ?? `Dish ${id}`;
  const patch = (i, p) => setSections((xs) => xs.map((x, n) => (n === i ? { ...x, ...p } : x)));

  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const res = await menusAPI.saveMenu({
        name, description: description || null, days: picked, starts_at: from || null, ends_at: to || null, sort_order: Number(sort) || 0, is_active: active,
        sections: sections.map((s) => ({ name: s.name, description: s.description || null, dishes: s.dishes.map((d) => d.id) })),
      }, menu?.id);
      toast.success(res.message); onDone();
    } catch (x) { setErr(errMsg(x, 'Could not save the menu')); } finally { setBusy(false); }
  };

  return (
    <Modal title={menu ? 'Edit menu' : 'New menu'} onClose={onClose} width={720}>
      <form onSubmit={go}>
        <FormStack>
          <FormError message={err} />
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
            <Field label="Name" htmlFor="menu-name"><TextInput id="menu-name" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="Breakfast" /></Field>
            <Field label="Sort order" htmlFor="menu-sort" hint="Smaller numbers come first."><NumberInput id="menu-sort" min="0" value={sort} onChange={(e) => setSort(e.target.value)} /></Field>
          </div>
          <Field label="A line under the name (optional)" htmlFor="menu-desc"><TextInput id="menu-desc" maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
          <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
            <legend style={{ fontSize: '0.74rem', fontWeight: 700, color: colors.textMuted, marginBottom: 6 }}>Served on (none ticked = every day)</legend>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {Object.entries(days).map(([n, label]) => (
                <label key={n} style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: '0.8rem' }}>
                  <input type="checkbox" checked={picked.includes(Number(n))} onChange={(e) => setPicked((xs) => (e.target.checked ? [...xs, Number(n)] : xs.filter((x) => x !== Number(n))))} /> {label}
                </label>
              ))}
            </div>
          </fieldset>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="From (blank = all day)" htmlFor="menu-from"><TextInput id="menu-from" type="time" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="Until" htmlFor="menu-to" hint="An end before the start runs past midnight."><TextInput id="menu-to" type="time" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          </div>

          <div>
            <div style={{ fontSize: '0.74rem', fontWeight: 700, color: colors.textMuted, marginBottom: 6 }}>Sections and dishes</div>
            {sections.map((s, i) => (
              <div key={i} data-testid="menu-section" style={{ border: `1px solid ${colors.tint(0.14)}`, borderRadius: 10, padding: 10, marginBottom: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' }}>
                  <TextInput aria-label={`Section ${i + 1} name`} value={s.name} placeholder="Mains" maxLength={120} onChange={(e) => patch(i, { name: e.target.value })} />
                  <span style={{ whiteSpace: 'nowrap' }}>
                    <button type="button" aria-label="Move section up" style={iconBtn} onClick={() => setSections((xs) => swap(xs, i, -1))}><ArrowUp size={14} /></button>
                    <button type="button" aria-label="Move section down" style={iconBtn} onClick={() => setSections((xs) => swap(xs, i, 1))}><ArrowDown size={14} /></button>
                    <button type="button" aria-label="Remove section" style={iconBtn} onClick={() => setSections((xs) => xs.filter((_, n) => n !== i))}><Trash2 size={14} /></button>
                  </span>
                </div>
                {s.dishes.map((d, n) => (
                  <div key={d.id} data-testid="section-dish" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 4px', fontSize: '0.82rem' }}>
                    <span style={{ flex: 1 }}>{nameOf(d.id)}</span>
                    <button type="button" aria-label={`Move ${nameOf(d.id)} up`} style={iconBtn} onClick={() => patch(i, { dishes: swap(s.dishes, n, -1) })}><ArrowUp size={13} /></button>
                    <button type="button" aria-label={`Move ${nameOf(d.id)} down`} style={iconBtn} onClick={() => patch(i, { dishes: swap(s.dishes, n, 1) })}><ArrowDown size={13} /></button>
                    <button type="button" aria-label={`Take ${nameOf(d.id)} out`} style={iconBtn} onClick={() => patch(i, { dishes: s.dishes.filter((x) => x.id !== d.id) })}><Trash2 size={13} /></button>
                  </div>
                ))}
                <SelectInput aria-label={`Add a dish to ${s.name || 'the section'}`} value="" style={{ marginTop: 6 }} onChange={(e) => { const id = Number(e.target.value); if (id && !s.dishes.some((x) => x.id === id)) patch(i, { dishes: [...s.dishes, { id }] }); }}>
                  <option value="">Add a dish…</option>{dishes.filter((d) => !s.dishes.some((x) => x.id === d.id)).map((d) => <option key={d.id} value={d.id}>{d.name}{d.is_active ? '' : ' (off the menu)'}</option>)}
                </SelectInput>
              </div>
            ))}
            <button type="button" style={small} onClick={() => setSections((xs) => [...xs, { name: '', description: '', dishes: [] }])}>Add a section</button>
          </div>
          <CheckboxRow checked={active} onChange={setActive} label="Shown to customers" description="Switch off a menu you are not using. Its sections stay." />
          <ModalActions onCancel={onClose} submitLabel="Save menu" busy={busy} disabled={!name.trim() || sections.some((s) => !s.name.trim())} />
        </FormStack>
      </form>
    </Modal>
  );
}

export default function MenuCards() {
  const user = useAuthStore((s) => s.user);
  const canWrite = canManageMenus(user);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    menusAPI.menus().then(setData).catch((e) => toast.error(errMsg(e, 'Could not load the menus'))).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);
  const done = () => { setModal(null); load(); };
  const remove = async (m) => {
    if (!window.confirm(`Delete the ${m.name} menu? The dishes are not touched.`)) return;
    try { const res = await menusAPI.removeMenu(m.id); toast.success(res.message); load(); } catch (x) { toast.error(errMsg(x, 'Could not delete')); }
  };

  if (!canViewMenus(user)) return <AdminLayout><div style={{ padding: 32 }}><NoAccess what="menus" /></div></AdminLayout>;

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1000, margin: '0 auto' }} data-testid="menu-cards">
        <HubHeader title="Menus" description="The cards customers read. Each has the days and hours it is served and headings with dishes under them. The same dish can be on several." />
        <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '0 0 14px' }}>
          {canWrite && <button type="button" style={btnPrimary} onClick={() => setModal({ menu: null })}><Plus size={14} /> New menu</button>}
        </div>
        {loading && !data ? <p style={{ color: colors.textMuted }}>Loading…</p> : !(data?.menus?.length) ? (
          <p style={{ ...card, padding: 20, margin: 0, color: colors.textMuted, fontSize: '0.85rem' }}>No menus yet. Add your dishes first, then put them on a menu.</p>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {data.menus.map((m) => (
              <div key={m.id} data-menu={m.name} style={{ ...card, padding: 16, opacity: m.is_active ? 1 : 0.6 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: '1rem' }}>{m.name}</strong>
                  {m.serving_now && <Pill tone="ok">Serving now</Pill>}
                  {!m.is_active && <Pill>Not shown</Pill>}
                  <span style={{ fontSize: '0.76rem', color: colors.textFaint }}>{m.serves}</span>
                  <span style={{ marginLeft: 'auto' }}>
                    {canWrite && <button type="button" style={small} onClick={() => setModal({ menu: m })}>Edit</button>}
                    {canWrite && <button type="button" style={small} onClick={() => remove(m)}>Delete</button>}
                  </span>
                </div>
                {m.sections.length === 0 ? <p style={{ margin: '8px 0 0', fontSize: '0.78rem', color: colors.textFaint }}>No sections yet.</p> : (
                  <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
                    {m.sections.map((s) => <div key={s.name} style={{ fontSize: '0.8rem' }}><strong>{s.name}</strong> <span style={{ color: colors.textMuted }}>{s.dishes.map((d) => d.name).join(', ') || 'no dishes'}</span></div>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      {modal && data && <MenuModal menu={modal.menu} dishes={data.dishes} days={data.days} onClose={() => setModal(null)} onDone={done} />}
    </AdminLayout>
  );
}
