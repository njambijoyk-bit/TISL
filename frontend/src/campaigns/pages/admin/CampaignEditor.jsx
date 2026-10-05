import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader from '../../../core/components/admin/ui/HubHeader';
import { Field, TextInput, SelectInput, CheckboxRow } from '../../../core/components/admin/ui/Form';
import campaignsAPI from '../../../_shared/api/campaigns';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { storageUrl } from '../../../_shared/lib/storageUrl';
import noSlash from '../../../_shared/lib/noSlash';
import { btnPrimary, btnGhost, card, colors } from '../../../_shared/theme/tokens';
import StatusChip from '../../components/StatusChip';

const GOAL_LABEL = { reach: 'Reach (people seeing it)', sales: 'Sales' };
const label = { fontSize: '0.68rem', fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' };
// a datetime-local box wants "2026-10-18T09:00"; the server sends "2026-10-18T09:00:00.000000Z" in the server's time, so cut it down
const toLocal = (iso) => (iso ? iso.slice(0, 16) : '');
const EMPTY = { title: '', subtitle: '', slug: '', type: 'brand', goal: 'reach', accent_color: '', teaser_at: '', starts_at: '', ends_at: '', early_access_at: '', feature_on_home: false };

/** Create or change a campaign: its type, name, address, dates and look. Its sections and featured items come next. */
export default function CampaignEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const fileRef = useRef(null);
  const [types, setTypes] = useState([]);
  const [f, setF] = useState(EMPTY);
  const [c, setC] = useState(null);                 // the saved campaign, once there is one
  const [perm, setPerm] = useState({ can_edit: true, can_publish: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => { campaignsAPI.types().then((r) => { setTypes(r.types); setPerm((p) => ({ ...p, can_publish: r.can_publish })); }).catch((e) => setErr(errMsg(e, 'Could not load the campaign types'))); }, []);
  useEffect(() => {
    if (!id) return;
    campaignsAPI.get(id).then((r) => {
      const d = r.data;
      setC(d); setPerm({ can_edit: r.can_edit, can_publish: r.can_publish });
      setF({ title: d.title, subtitle: d.subtitle ?? '', slug: d.slug, type: d.type, goal: d.goal, accent_color: d.accent_color ?? '', teaser_at: toLocal(d.teaser_at), starts_at: toLocal(d.starts_at), ends_at: toLocal(d.ends_at), early_access_at: toLocal(d.early_access_at), feature_on_home: d.feature_on_home });
    }).catch((e) => setErr(errMsg(e, 'Could not load the campaign')));
  }, [id]);

  const type = types.find((t) => t.key === f.type);
  const pickType = (t) => { if (t.status !== 'available') return; setF((x) => ({ ...x, type: t.key, goal: t.goals.includes(x.goal) ? x.goal : t.goals[0] })); };
  const readOnly = Boolean(id) && !perm.can_edit;

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    const body = { ...f };
    ['subtitle', 'slug', 'accent_color', 'teaser_at', 'starts_at', 'ends_at', 'early_access_at'].forEach((k) => { if (body[k] === '') body[k] = null; });
    try {
      const r = id ? await campaignsAPI.update(id, body) : await campaignsAPI.create(body);
      toast.success(r.message);
      if (!id) nav(`/admin/campaigns/${r.data.id}/edit`, { replace: true }); else setC(r.data);
    } catch (er) { setErr(errMsg(er, 'Could not save the campaign')); }
    finally { setBusy(false); }
  };

  const act = async (fn, ok) => {
    try { const r = await fn(c.id); setC(r.data ?? c); toast.success(r.message ?? ok); } catch (er) { toast.error(errMsg(er, 'That did not work')); }
  };
  const remove = async () => {
    if (!window.confirm(`Delete "${c.title}"?`)) return;
    try { await campaignsAPI.remove(c.id); toast.success('Campaign deleted'); nav('/admin/campaigns', { replace: true }); } catch (er) { toast.error(errMsg(er, 'Could not delete it')); }
  };
  const upload = async (file) => {
    if (!file) return;
    try { const r = await campaignsAPI.uploadCover(c.id, file); setC(r.data); toast.success(r.message); } catch (er) { toast.error(errMsg(er, 'Could not upload the cover')); }
  };

  const grouped = types.reduce((m, t) => { (m[t.family] ??= []).push(t); return m; }, {});

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 940, margin: '0 auto' }}>
        <HubHeader title={id ? 'Campaign' : 'New campaign'} description="Choose what kind of campaign it is, name it, and set when it runs. Sections and featured items come after you save." />
        {c && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', margin: '0 0 14px' }}>
            <StatusChip status={c.status} approval={c.approval_status} />
            <span style={{ fontFamily: 'monospace', fontSize: '0.74rem', color: colors.textFaint }}>/campaigns/{c.slug}</span>
            {perm.can_publish && (
              <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                {c.is_published
                  ? <button type="button" style={btnGhost} onClick={() => act(campaignsAPI.unpublish)}>Unpublish</button>
                  : <button type="button" style={btnPrimary} onClick={() => act(campaignsAPI.publish)}>Publish</button>}
                {c.is_published && <button type="button" style={btnGhost} onClick={() => act(campaignsAPI.pause)}>{c.is_paused ? 'Resume' : 'Pause'}</button>}
                <button type="button" style={btnGhost} onClick={() => act(campaignsAPI.archive)}>{c.archived_at ? 'Restore' : 'Archive'}</button>
                <button type="button" style={{ ...btnGhost, color: colors.danger }} onClick={remove}>Delete</button>
              </span>
            )}
          </div>
        )}
        {readOnly && <p style={{ ...card, padding: 12, fontSize: '0.8rem', color: colors.textMuted }}>You can look at this campaign, but not change it. A draft you made yourself can be changed until it is sent for approval.</p>}
        <form onSubmit={save} style={{ display: 'grid', gap: 18 }}>
          {err && <p role="alert" style={{ color: colors.dangerText, margin: 0, fontSize: '0.84rem' }}>{err}</p>}

          <section style={{ ...card, padding: 18 }}>
            <p style={label}>What kind of campaign</p>
            {Object.entries(grouped).map(([family, list]) => (
              <div key={family} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: '0.72rem', color: colors.textFaint, margin: '0 0 6px' }}>{family}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))', gap: 8 }}>
                  {list.map((t) => {
                    const on = f.type === t.key; const locked = t.status !== 'available';
                    return (
                      <button key={t.key} type="button" disabled={locked || readOnly || Boolean(id)} onClick={() => pickType(t)} title={locked ? 'Coming soon' : t.about}
                        style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 10, cursor: locked ? 'not-allowed' : id ? 'default' : 'pointer', fontFamily: 'inherit', color: 'inherit', opacity: locked ? 0.5 : 1,
                          border: `1.5px solid ${on ? 'var(--color-primary-500)' : 'var(--line)'}`, background: on ? 'color-mix(in srgb, var(--color-primary-500) 12%, transparent)' : 'transparent' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.84rem', display: 'flex', gap: 6, alignItems: 'center' }}>{t.label}{locked && <Lock size={11} />}</div>
                        <div style={{ fontSize: '0.7rem', color: colors.textFaint, marginTop: 2 }}>{locked ? 'Coming soon' : t.about}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {id && <p style={{ margin: 0, fontSize: '0.72rem', color: colors.textFaint }}>The type is fixed once a campaign is saved.</p>}
          </section>

          <section style={{ ...card, padding: 18, display: 'grid', gap: 14 }}>
            <p style={label}>Details</p>
            <Field label="Title *"><TextInput required value={f.title} disabled={readOnly} onChange={(e) => set('title')(e.target.value)} placeholder="e.g. Drop 07: After Dark" /></Field>
            <Field label="Subtitle"><TextInput value={f.subtitle} disabled={readOnly} onChange={(e) => set('subtitle')(e.target.value)} placeholder="One line under the title" /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 14 }}>
              <Field label="Web address" hint={`/campaigns/${f.slug || 'made-from-the-title'}. Letters, digits and dashes.`}>
                <TextInput value={f.slug} disabled={readOnly} onChange={(e) => set('slug')(noSlash(e.target.value, 'The address').toLowerCase().replace(/[^a-z0-9-]/g, '-'))} placeholder="Made from the title if left empty" style={{ fontFamily: 'monospace' }} />
              </Field>
              <Field label="Goal" hint="What this campaign is measured by.">
                <SelectInput value={f.goal} disabled={readOnly} onChange={(e) => set('goal')(e.target.value)}>
                  {(type?.goals ?? ['reach']).map((g) => <option key={g} value={g}>{GOAL_LABEL[g] ?? g}</option>)}
                </SelectInput>
              </Field>
            </div>
          </section>

          <section style={{ ...card, padding: 18, display: 'grid', gap: 14 }}>
            <p style={label}>When it runs</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14 }}>
              <Field label="Teaser starts" hint="Optional: people see the teaser sections from here."><TextInput type="datetime-local" value={f.teaser_at} disabled={readOnly} onChange={(e) => set('teaser_at')(e.target.value)} /></Field>
              <Field label="Starts" hint="Empty = live as soon as it is published."><TextInput type="datetime-local" value={f.starts_at} disabled={readOnly} onChange={(e) => set('starts_at')(e.target.value)} /></Field>
              <Field label="Ends" hint="Empty = runs until archived."><TextInput type="datetime-local" value={f.ends_at} disabled={readOnly} onChange={(e) => set('ends_at')(e.target.value)} /></Field>
              <Field label="Early access from" hint="Optional: chosen customers get in from here (set who in a later step)."><TextInput type="datetime-local" value={f.early_access_at} disabled={readOnly} onChange={(e) => set('early_access_at')(e.target.value)} /></Field>
            </div>
          </section>

          <section style={{ ...card, padding: 18, display: 'grid', gap: 14 }}>
            <p style={label}>Look</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 14, alignItems: 'start' }}>
              <Field label="Accent colour" hint="Empty = the site colour.">
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="color" value={f.accent_color || '#6366f1'} disabled={readOnly} onChange={(e) => set('accent_color')(e.target.value)} style={{ width: 42, height: 34, border: 'none', background: 'none', padding: 0 }} />
                  <TextInput value={f.accent_color} disabled={readOnly} onChange={(e) => set('accent_color')(e.target.value)} placeholder="#6366f1" style={{ fontFamily: 'monospace' }} />
                  {f.accent_color && !readOnly && <button type="button" style={btnGhost} onClick={() => set('accent_color')('')}>Clear</button>}
                </div>
              </Field>
              <Field label="Cover image" hint={c ? 'JPG, PNG or WebP, up to 5 MB.' : 'Save the campaign first, then add a cover.'}>
                {c?.cover_media && <img src={storageUrl(c.cover_media)} alt="" style={{ width: '100%', maxHeight: 150, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--line)', marginBottom: 8 }} />}
                {c && !readOnly && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} />
                    <button type="button" style={btnGhost} onClick={() => fileRef.current?.click()}>{c.cover_media ? 'Change cover' : 'Add cover'}</button>
                    {c.cover_media && <button type="button" style={btnGhost} onClick={async () => { try { const r = await campaignsAPI.removeCover(c.id); setC(r.data); } catch (er) { toast.error(errMsg(er, 'Could not remove it')); } }}>Remove</button>}
                  </div>
                )}
              </Field>
            </div>
            <CheckboxRow checked={f.feature_on_home} disabled={readOnly} onChange={set('feature_on_home')} label="Feature on the homepage" description="Shows this campaign in the homepage's current-campaign block while it is live." />
          </section>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Link to="/admin/campaigns" style={{ ...btnGhost, textDecoration: 'none' }}>Back to campaigns</Link>
            {!readOnly && <button type="submit" style={btnPrimary} disabled={busy}>{busy ? 'Saving…' : id ? 'Save changes' : 'Save as draft'}</button>}
          </div>
        </form>
      </div>
    </AdminLayout>
  );
}
