import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { CalendarClock, ChefHat, Plus, UserCheck } from 'lucide-react';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../core/components/admin/ui/HubHeader';
import Modal from '../../../core/components/admin/ui/Modal';
import { Field, FormStack, ModalActions, NumberInput, SelectInput, TextArea, TextInput } from '../../../core/components/admin/ui/Form';
import menusAPI from '../../../_shared/api/menus';
import useAuthStore from '../../../_shared/store/authStore';
import { canViewMenus, canManageMenus } from '../../../_shared/lib/roles';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../../_shared/theme/tokens';
import { Pill } from '../../components/FoodChips';
import MenusNav from '../../components/MenusNav';

const STANDING = { valid: ['ok', 'Valid'], expiring: ['warn', 'Runs out soon'], expired: ['danger', 'Has run out'], none: ['neutral', 'No end date'] };

function ChefForm({ chef, stations, canPay, onClose, onDone }) {
  const [f, setF] = useState({ user_id: chef?.user_id ?? '', display_name: chef?.display_name ?? '', title: chef?.title ?? '', bio: chef?.bio ?? '', photo: chef?.photo ?? '', station_ids: chef?.station_ids ?? [],
    is_instructor: chef?.is_instructor ?? false, is_public: chef?.is_public ?? false, is_active: chef?.is_active ?? true, sort_order: chef?.sort_order ?? 0,
    pay_mode: chef?.pay_mode ?? 'salary', shift_rate: chef?.shift_rate ?? '', hour_rate: chef?.hour_rate ?? '' });
  const [q, setQ] = useState('');
  const [found, setFound] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (chef || q.trim().length < 2) { setFound([]); return undefined; }
    const t = setTimeout(() => { menusAPI.chefCandidates(q).then((r) => setFound(r.users)).catch(() => setFound([])); }, 250);
    return () => clearTimeout(t);
  }, [q, chef]);
  const toggle = (id) => setF((x) => ({ ...x, station_ids: x.station_ids.includes(id) ? x.station_ids.filter((s) => s !== id) : [...x.station_ids, id] }));
  const save = async () => {
    setBusy(true);
    try {
      const pay = canPay ? { pay_mode: f.pay_mode, shift_rate: f.shift_rate === '' ? null : Number(f.shift_rate), hour_rate: f.hour_rate === '' ? null : Number(f.hour_rate) } : {};
      await menusAPI.saveChef({ ...f, ...(canPay ? {} : { pay_mode: undefined, shift_rate: undefined, hour_rate: undefined }), ...pay, user_id: f.user_id ? Number(f.user_id) : undefined, sort_order: Number(f.sort_order) || 0, display_name: f.display_name || undefined }, chef?.id);
      toast.success('Chef saved.'); onDone();
    } catch (e) { toast.error(errMsg(e, 'Could not save the chef'), { duration: 8000 }); } finally { setBusy(false); }
  };

  return (
    <Modal title={chef ? `Edit ${chef.display_name}` : 'Add a chef'} onClose={onClose} width={600} footer={<ModalActions onCancel={onClose} onSubmit={save} submitLabel="Save chef" busy={busy} disabled={!f.user_id} />}>
      <FormStack>
        {!chef && (
          <Field label="Member of staff" htmlFor="chef-find" hint={f.user_id ? 'Chosen.' : 'Type at least two letters of their name or email.'}>
            <TextInput id="chef-find" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search staff" />
            {found.length > 0 && <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0, display: 'grid', gap: 4 }}>{found.map((u) => <li key={u.id}><button type="button" onClick={() => { setF((x) => ({ ...x, user_id: u.id, display_name: x.display_name || u.name })); setQ(`${u.name} (${u.email ?? ''})`); setFound([]); }} style={{ ...btnGhost, width: '100%', textAlign: 'left' }}>{u.name} · {u.email}</button></li>)}</ul>}
          </Field>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Name shown to guests" htmlFor="chef-name"><TextInput id="chef-name" maxLength={80} value={f.display_name} onChange={(e) => setF({ ...f, display_name: e.target.value })} placeholder="Chef Wanjiru" /></Field>
          <Field label="Title" htmlFor="chef-title"><TextInput id="chef-title" maxLength={80} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Head chef" /></Field>
        </div>
        <Field label="A few words about them" htmlFor="chef-bio"><TextArea id="chef-bio" rows={3} maxLength={2000} value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} /></Field>
        <Field label="Photo address" htmlFor="chef-photo" hint="The web address of a picture."><TextInput id="chef-photo" maxLength={255} value={f.photo} onChange={(e) => setF({ ...f, photo: e.target.value })} /></Field>
        {stations.length > 0 && (
          <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: '0.86rem' }}>
            <legend style={{ fontSize: '0.72rem', fontWeight: 800, color: colors.textMuted, marginBottom: 4 }}>Stations they work</legend>
            {stations.map((s) => <label key={s.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={f.station_ids.includes(s.id)} onChange={() => toggle(s.id)} /> {s.name}</label>)}
          </fieldset>
        )}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '0.86rem' }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={f.is_public} onChange={(e) => setF({ ...f, is_public: e.target.checked })} /> Show on the chefs page</label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={f.is_instructor} onChange={(e) => setF({ ...f, is_instructor: e.target.checked })} /> Teaches (for Courses)</label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} /> Working here</label>
        </div>
        {canPay && (
          <fieldset style={{ border: `1px solid var(--line, #e5e7eb)`, borderRadius: 10, margin: 0, padding: 12, display: 'grid', gap: 10 }} data-testid="chef-pay">
            <legend style={{ fontSize: '0.72rem', fontWeight: 800, color: colors.textMuted, padding: '0 6px' }}>How this chef is paid</legend>
            <SelectInput aria-label="How this chef is paid" value={f.pay_mode} onChange={(e) => setF({ ...f, pay_mode: e.target.value })}>
              <option value="salary">Monthly salary (as set in Employees)</option><option value="per_shift">A fixed amount for each shift worked</option><option value="per_hour">An amount for each hour worked</option>
            </SelectInput>
            {f.pay_mode === 'per_shift' && <Field label="Pay for each shift worked" htmlFor="chef-shift-rate" hint="A rostered shift counts when most of it was signed in (Menus → Configuration). Verified days only. No overtime."><NumberInput id="chef-shift-rate" min={0} step="any" value={f.shift_rate} onChange={(e) => setF({ ...f, shift_rate: e.target.value })} /></Field>}
            {f.pay_mode === 'per_hour' && <Field label="Pay for each hour worked" htmlFor="chef-hour-rate" hint="Hours worked up to the hours rostered each day; overtime beyond that is paid at this rate times the overtime multiplier. Verified days only."><NumberInput id="chef-hour-rate" min={0} step="any" value={f.hour_rate} onChange={(e) => setF({ ...f, hour_rate: e.target.value })} /></Field>}
            {f.pay_mode !== 'salary' && <p style={{ margin: 0, fontSize: '0.78rem', color: colors.textMuted }}>The chef still needs an employee record for payroll to include them. Nothing is deducted for absence: a day not worked simply earns nothing.</p>}
          </fieldset>
        )}
        <Field label="Order on the page" htmlFor="chef-sort" hint="Smaller numbers come first."><NumberInput id="chef-sort" min={0} value={f.sort_order} onChange={(e) => setF({ ...f, sort_order: e.target.value })} /></Field>
      </FormStack>
    </Modal>
  );
}

function CertForm({ chef, cert, kinds, onClose, onDone }) {
  const [f, setF] = useState({ kind: cert?.kind ?? 'food_handler', name: cert?.name ?? '', number: cert?.number ?? '', issued_on: cert?.issued_on ?? '', expires_on: cert?.expires_on ?? '' });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await menusAPI.saveCert(chef.id, { ...f, issued_on: f.issued_on || null, expires_on: f.expires_on || null }, cert?.id); toast.success('Certificate saved.'); onDone(); } catch (e) { toast.error(errMsg(e, 'Could not save the certificate'), { duration: 8000 }); } finally { setBusy(false); }
  };

  return (
    <Modal title={cert ? 'Edit certificate' : `New certificate for ${chef.display_name}`} onClose={onClose} width={480} footer={<ModalActions onCancel={onClose} onSubmit={save} submitLabel="Save certificate" busy={busy} />}>
      <FormStack>
        <Field label="Kind" htmlFor="cert-kind"><SelectInput id="cert-kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{Object.entries(kinds).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</SelectInput></Field>
        <Field label="Name" htmlFor="cert-name" hint="Left empty, the kind is used."><TextInput id="cert-name" maxLength={120} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Number" htmlFor="cert-number"><TextInput id="cert-number" maxLength={60} value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Issued on" htmlFor="cert-issued"><TextInput id="cert-issued" type="date" value={f.issued_on} onChange={(e) => setF({ ...f, issued_on: e.target.value })} /></Field>
          <Field label="Runs out on" htmlFor="cert-expires" hint="Empty: never. We warn a month before."><TextInput id="cert-expires" type="date" value={f.expires_on} onChange={(e) => setF({ ...f, expires_on: e.target.value })} /></Field>
        </div>
      </FormStack>
    </Modal>
  );
}

/** Menus → Chefs: the kitchen's people. Who is on duty now, their stations, the certificates they hold (with a warning before one runs out) and what guests see of them. */
export default function MenusChefs() {
  const user = useAuthStore((s) => s.user);
  const canEdit = canManageMenus(user);
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [certForm, setCertForm] = useState(null);

  const load = useCallback(() => menusAPI.chefs().then(setData).catch((e) => toast.error(errMsg(e, 'Could not load the chefs'))), []);
  useEffect(() => { load(); }, [load]);
  const remove = async (c) => { if (!window.confirm(`Remove ${c.display_name} from the chefs? Their certificates are deleted too.`)) return; try { await menusAPI.removeChef(c.id); await load(); } catch (e) { toast.error(errMsg(e, 'Could not remove the chef'), { duration: 8000 }); } };
  const removeCert = async (c, x) => { try { await menusAPI.removeCert(c.id, x.id); await load(); } catch (e) { toast.error(errMsg(e, 'Could not remove the certificate'), { duration: 8000 }); } };

  if (!canViewMenus(user)) return <AdminLayout><div style={{ padding: 32 }}><NoAccess what="the chefs" /></div></AdminLayout>;
  const attention = data?.chefs.reduce((n, c) => n + c.attention, 0) ?? 0;

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1100, margin: '0 auto' }} data-testid="menus-chefs">
        <MenusNav />
        <HubHeader title="Chefs" description="The people in your kitchen: who is on now, the certificates they must hold, and what guests see of them." />
        {data && !data.ready && <p role="status" style={{ color: colors.textMuted }}>Run database script 141_menus_chefs.sql to switch chefs on.</p>}
        {data?.ready && (
          <>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
              {canEdit && <button type="button" style={btnPrimary} onClick={() => setForm({})}><Plus size={14} aria-hidden="true" /> Add a chef</button>}
              {attention > 0 && <Pill tone="warn">{attention} certificate{attention === 1 ? '' : 's'} need{attention === 1 ? 's' : ''} attention</Pill>}
            </div>
            {data.chefs.length === 0 && <p style={{ color: colors.textMuted }}>No chefs yet. Add a member of staff as a chef to give them a kitchen profile.</p>}
            <div style={{ display: 'grid', gap: 14 }}>
              {data.chefs.map((c) => (
                <article key={c.id} data-chef={c.display_name} style={{ ...card, padding: 16, display: 'grid', gap: 10, opacity: c.is_active ? 1 : 0.6 }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    {c.photo ? <img src={c.photo} alt="" style={{ width: 52, height: 52, borderRadius: 999, objectFit: 'cover' }} /> : <span style={{ width: 52, height: 52, borderRadius: 999, display: 'grid', placeItems: 'center', background: 'color-mix(in srgb, #0ea5e9 14%, transparent)' }}><ChefHat size={24} aria-hidden="true" /></span>}
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <strong style={{ fontSize: '1.05rem' }}>{c.display_name}</strong> <span style={{ color: colors.textMuted, fontSize: '0.82rem' }}>{c.title ?? ''}</span>
                      <div style={{ fontSize: '0.78rem', color: colors.textMuted }}>{c.user} · {c.email}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {c.on_duty && <Pill tone="ok"><UserCheck size={11} aria-hidden="true" /> On duty</Pill>}
                      {c.rostered_today && <Pill tone="neutral">Rota today {c.rostered_today}</Pill>}
                      {c.is_public ? <Pill tone="ok">Shown to guests</Pill> : <Pill>Not shown</Pill>}
                      {c.is_instructor && <Pill>Teaches</Pill>}
                      {!c.is_active && <Pill tone="danger">Not working here</Pill>}
                      {c.stations.map((s) => <Pill key={s}>{s}</Pill>)}
                      {c.dishes > 0 && <Pill>{c.dishes} dish{c.dishes === 1 ? '' : 'es'}</Pill>}
                    </div>
                    {canEdit && <div style={{ display: 'flex', gap: 6 }}><button type="button" style={btnGhost} onClick={() => setForm(c)}>Edit</button><button type="button" style={{ ...btnGhost, color: colors.danger }} onClick={() => remove(c)}>Remove</button></div>}
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><strong style={{ fontSize: '0.84rem' }}><CalendarClock size={13} aria-hidden="true" /> Certificates</strong>{canEdit && <button type="button" style={btnGhost} onClick={() => setCertForm({ chef: c })}>Add certificate</button>}</div>
                    {c.certs.length === 0 && <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: colors.textFaint }}>None recorded.</p>}
                    <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0, display: 'grid', gap: 4 }}>
                      {c.certs.map((x) => {
                        const [tone, label] = STANDING[x.standing];

                        return (
                          <li key={x.id} data-cert={x.name} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: '0.86rem' }}>
                            <span style={{ flex: 1, minWidth: 160 }}><strong>{x.name}</strong>{x.number ? ` · ${x.number}` : ''}</span>
                            <span style={{ color: colors.textMuted }}>{x.expires_on ? `until ${x.expires_on}${x.days_left != null && x.days_left >= 0 ? ` (${x.days_left} days)` : ''}` : 'no end date'}</span>
                            <Pill tone={tone}>{label}</Pill>
                            {canEdit && <><button type="button" style={btnGhost} onClick={() => setCertForm({ chef: c, cert: x })}>Edit</button><button type="button" style={{ ...btnGhost, color: colors.danger }} onClick={() => removeCert(c, x)}>Remove</button></>}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </div>
      {form && data && <ChefForm chef={form.id ? form : null} stations={data.stations} canPay={Boolean(data.can_pay)} onClose={() => setForm(null)} onDone={() => { setForm(null); load(); }} />}
      {certForm && data && <CertForm chef={certForm.chef} cert={certForm.cert} kinds={data.kinds} onClose={() => setCertForm(null)} onDone={() => { setCertForm(null); load(); }} />}
    </AdminLayout>
  );
}
