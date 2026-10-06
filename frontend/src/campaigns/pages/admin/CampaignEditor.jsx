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
import PageBuilder from '../../components/PageBuilder';
import CampaignNumbers from '../../components/CampaignNumbers';

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
  const [pg, setPg] = useState(null);               // its page: sections, items, live item details, and what the server says is allowed
  const [perm, setPerm] = useState({ can_edit: true, can_publish: false, can_decide: false, can_submit: false, can_withdraw: false });
  const [rejecting, setRejecting] = useState(null);   // the note being written when an approver says no
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => { campaignsAPI.types().then((r) => { setTypes(r.types); setPerm((p) => ({ ...p, can_publish: r.can_publish })); }).catch((e) => setErr(errMsg(e, 'Could not load the campaign types'))); }, []);
  useEffect(() => {
    if (!id) return;
    campaignsAPI.get(id).then((r) => {
      const d = r.data;
      setC(d); setPerm({ can_edit: r.can_edit, can_publish: r.can_publish, can_decide: r.can_decide, can_submit: r.can_submit, can_withdraw: r.can_withdraw });
      setPg({ sections: d.sections, items: d.items, resolved: r.resolved, ecommerce: r.ecommerce, itemTypes: r.item_types, maxVideoMb: r.max_video_mb });
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
    try {
      const r = await fn(c.id);
      toast.success(r.message ?? ok);
      const g = await campaignsAPI.get(c.id);   // the buttons depend on the new state, so read it again
      setC(g.data); setPerm({ can_edit: g.can_edit, can_publish: g.can_publish, can_decide: g.can_decide, can_submit: g.can_submit, can_withdraw: g.can_withdraw }); setRejecting(null);
    } catch (er) { toast.error(errMsg(er, 'That did not work'), { duration: 6000 }); }
  };
  const remove = async () => {
    if (!window.confirm(`Move "${c.title}" to the recycle bin? It can be restored from there.`)) return;
    try { await campaignsAPI.remove(c.id); toast.success('Campaign deleted'); nav('/admin/campaigns', { replace: true }); } catch (er) { toast.error(errMsg(er, 'Could not delete it')); }
  };
  const upload = async (file) => {
    if (!file) return;
    try { const r = await campaignsAPI.uploadCover(c.id, file); setC(r.data); toast.success(r.message); } catch (er) { toast.error(errMsg(er, 'Could not upload the cover')); }
  };

  const grouped = types.reduce((m, t) => { (m[t.family] ??= []).push(t); return m; }, {});

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1240, margin: '0 auto' }}>
        <HubHeader title={id ? 'Campaign' : 'New campaign'} description="Choose what kind of campaign it is, name it and set when it runs. After you save, build its page below." />
        {c && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', margin: '0 0 14px' }}>
            <StatusChip status={c.status} approval={c.approval_status} />
            <span style={{ fontFamily: 'monospace', fontSize: '0.74rem', color: colors.textFaint }}>/campaigns/{c.slug}</span>
            {perm.can_submit && ['draft', 'rejected'].includes(c.approval_status) && !c.is_published && <button type="button" style={{ ...btnPrimary, marginLeft: 'auto' }} onClick={() => act(campaignsAPI.submit)}>Send for approval</button>}
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
        {c?.approval_status === 'pending' && (
          <div style={{ ...card, padding: 12, margin: '0 0 14px', display: 'grid', gap: 8, borderColor: 'var(--status-warning, #b45309)' }}>
            <div style={{ fontSize: '0.84rem', fontWeight: 600 }}>{perm.can_decide ? 'This campaign is waiting for your decision.' : perm.can_withdraw ? 'Sent for approval. You will see the answer on your calendar.' : 'Waiting for approval.'}</div>
            {perm.can_decide && (rejecting === null
              ? <div style={{ display: 'flex', gap: 8 }}><button type="button" style={btnPrimary} onClick={() => act(campaignsAPI.approve)}>Approve and publish</button><button type="button" style={btnGhost} onClick={() => setRejecting('')}>Not approved…</button></div>
              : <div style={{ display: 'grid', gap: 8 }}>
                <TextInput value={rejecting} onChange={(e) => setRejecting(e.target.value)} placeholder="Say what needs to change (the author will see this)" />
                <div style={{ display: 'flex', gap: 8 }}><button type="button" style={{ ...btnPrimary, opacity: rejecting.trim() ? 1 : 0.5 }} disabled={!rejecting.trim()} onClick={() => act((i) => campaignsAPI.reject(i, rejecting))}>Send back to the author</button><button type="button" style={btnGhost} onClick={() => setRejecting(null)}>Cancel</button></div>
              </div>)}
            {perm.can_withdraw && <div><button type="button" style={btnGhost} onClick={() => act(campaignsAPI.withdraw)}>Take it back</button></div>}
          </div>
        )}
        {c?.approval_status === 'rejected' && !c.is_published && (
          <div style={{ ...card, padding: 12, margin: '0 0 14px', borderColor: 'var(--status-error, #b91c1c)' }}>
            <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--status-error, #b91c1c)' }}>Not approved</div>
            {c.rejected_note && <div style={{ fontSize: '0.82rem', marginTop: 4 }}>{c.rejected_note}</div>}
            {perm.can_submit && <div style={{ fontSize: '0.74rem', color: colors.textFaint, marginTop: 6 }}>Change what was asked, then send it for approval again.</div>}
          </div>
        )}
        {readOnly && <p style={{ ...card, padding: 12, fontSize: '0.8rem', color: colors.textMuted }}>You can look at this campaign, but not change it. A draft you made yourself can be changed until it is sent for approval.</p>}
        <form onSubmit={save} style={{ display: 'grid', gap: 18, maxWidth: 940 }}>
          {err && <p role="alert" style={{ color: colors.dangerText, margin: 0, fontSize: '0.84rem' }}>{err}</p>}

          <section style={{ ...card, padding: 18, display: 'grid', gap: 8 }}>
            <p style={label}>What kind of campaign</p>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <SelectInput value={f.type} disabled={readOnly || Boolean(id)} onChange={(e) => pickType(types.find((t) => t.key === e.target.value))} style={{ maxWidth: 280 }} aria-label="Campaign type">
                {Object.entries(grouped).map(([family, list]) => {
                  const ready = list.filter((t) => t.status === 'available');

                  return ready.length ? <optgroup key={family} label={family}>{ready.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</optgroup> : null;
                })}
              </SelectInput>
              <span style={{ fontSize: '0.78rem', color: colors.textMuted, flex: 1, minWidth: 220 }}>{type?.about}</span>
            </div>
            <p style={{ margin: 0, fontSize: '0.72rem', color: colors.textFaint }}>
              {id ? 'The type is fixed once a campaign is saved.' : `${types.filter((t) => t.status !== 'available').length} more types are planned and will appear here when they are ready.`}
            </p>
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
            {!readOnly && <button type="submit" style={btnPrimary} disabled={busy}>{busy ? 'Saving…' : id ? 'Save details' : 'Save as draft'}</button>}
          </div>
        </form>

        {c && (
          <div style={{ marginTop: 30 }}>
            <h2 style={{ margin: '0 0 4px', fontSize: '1.15rem', fontWeight: 800, color: colors.primary }}>The numbers</h2>
            <p style={{ margin: '0 0 14px', fontSize: '0.8rem', color: colors.textMuted }}>How it is doing so far.</p>
            <CampaignNumbers id={c.id} />
          </div>
        )}

        {c && pg && (
          <div style={{ marginTop: 30 }}>
            <h2 style={{ margin: '0 0 4px', fontSize: '1.15rem', fontWeight: 800, color: colors.primary }}>The page</h2>
            <p style={{ margin: '0 0 14px', fontSize: '0.8rem', color: colors.textMuted }}>Build what people see: add sections, drag them into order, and give any of them its own dates. Details above and the page below are saved separately.</p>
            <PageBuilder campaign={c} sections={pg.sections} items={pg.items} resolved={pg.resolved} ecommerce={pg.ecommerce} itemTypes={pg.itemTypes} maxVideoMb={pg.maxVideoMb} canEdit={perm.can_edit}
              onSaved={(r) => setPg((p) => ({ ...p, sections: r.data.sections, items: r.data.items, resolved: r.resolved }))} />
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
