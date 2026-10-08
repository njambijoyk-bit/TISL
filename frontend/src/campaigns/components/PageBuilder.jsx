import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Plus, Trash2, Search, GripVertical } from 'lucide-react';
import toast from 'react-hot-toast';
import campaignsAPI from '../../_shared/api/campaigns';
import { errMsg } from '../../_shared/store/helpers/apiState';
import { storageUrl } from '../../_shared/lib/storageUrl';
import { btnPrimary, btnGhost, card, colors } from '../../_shared/theme/tokens';
import { Field, TextInput, TextArea, SelectInput } from '../../core/components/admin/ui/Form';
import CampaignView from './CampaignView';
import AudienceRule from './AudienceRule';
import ItemPicker from './ItemPicker';
import posterFrom from '../lib/videoPoster';

const TYPE_LABEL = { hero: 'Hero', story: 'Story', countdown: 'Countdown', video: 'Video', products: 'Products', cta: 'Call to action', pins: 'Pin grid', moodboard: 'Moodboard', gallery: 'Community gallery' };
const TYPE_ABOUT = { hero: 'Big cover with a headline and a button', story: 'A heading and some text', countdown: 'Counts down to the start, the end or a date', video: 'A YouTube, Vimeo, TikTok or Facebook link, or an uploaded video', products: 'Products, services, hampers or auctions', cta: 'A message and a button', pins: 'The pins of a board, or pins with a tag', moodboard: 'One of your approved moodboards', gallery: 'Pins customers shared with a tag' };
const lbl = { fontSize: '0.68rem', fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' };
const toLocal = (iso) => (iso ? String(iso).slice(0, 16) : '');
let counter = 0;
const keyOf = () => `n${++counter}`;

/** Turn what the server sends (sections, items) into the builder's rows: each section carries its own items. */
const rows = (sections, items) => sections.map((s) => ({
  key: `s${s.id}`, id: s.id, type: s.type, settings: s.settings ?? {}, show_from: toLocal(s.show_from), show_until: toLocal(s.show_until), audience_rule: s.audience_rule ?? null, open: false,
  items: items.filter((i) => i.section_id === s.id).map((i) => ({ item_type: i.item_type, item_id: i.item_id, available_from: toLocal(i.available_from), label_override: i.label_override ?? '' })),
}));

function SectionForm({ s, set, campaignId, maxVideoMb, ecommerce, itemTypes, resolved, setResolved, world }) {
  const st = s.settings;
  const put = (k) => (e) => set({ settings: { ...st, [k]: e?.target ? e.target.value : e } });
  const [uploading, setUploading] = useState(false);
  const upload = async (file, kind, field) => {
    if (!file) return;
    setUploading(true);
    try {
      const r = await campaignsAPI.uploadMedia(campaignId, file, kind);
      const next = { ...st, [field]: r.path };
      if (field === 'file') {   // a video file: take a poster frame in the browser too
        const frame = await posterFrom(file);
        if (frame) { try { next.poster = (await campaignsAPI.uploadMedia(campaignId, frame, 'image')).path; } catch { /* no poster is fine */ } }
      }
      set({ settings: next });
    } catch (e) { toast.error(errMsg(e, 'Could not upload that')); } finally { setUploading(false); }
  };
  const file = (field, kind, accept, text) => (
    <label style={{ ...btnGhost, display: 'inline-block', cursor: 'pointer', opacity: uploading ? 0.6 : 1 }}>
      {uploading ? 'Uploading…' : text}<input type="file" hidden accept={accept} disabled={uploading} onChange={(e) => { upload(e.target.files?.[0], kind, field); e.target.value = ''; }} />
    </label>
  );

  if (s.type === 'hero') return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Field label="Headline" hint="Empty = the campaign title."><TextInput value={st.headline ?? ''} onChange={put('headline')} /></Field>
      <Field label="Line under it"><TextInput value={st.subheadline ?? ''} onChange={put('subheadline')} /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
        <Field label="Button text"><TextInput value={st.button_label ?? ''} onChange={put('button_label')} placeholder="Shop the drop" /></Field>
        <Field label="Button link" hint="A path on this site (/products) or https://…"><TextInput value={st.button_link ?? ''} onChange={put('button_link')} placeholder="/products" /></Field>
        <Field label="Text alignment"><SelectInput value={st.align ?? 'center'} onChange={put('align')}><option value="center">Centre</option><option value="left">Left</option></SelectInput></Field>
      </div>
      <Field label="Picture" hint="Empty = the campaign cover."><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{st.image && <img src={storageUrl(st.image)} alt="" style={{ height: 48, borderRadius: 6 }} />}{file('image', 'image', 'image/png,image/jpeg,image/webp', st.image ? 'Change picture' : 'Add picture')}{st.image && <button type="button" style={btnGhost} onClick={() => set({ settings: { ...st, image: '' } })}>Remove</button>}</div></Field>
    </div>
  );
  if (s.type === 'story') return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Field label="Heading"><TextInput value={st.heading ?? ''} onChange={put('heading')} /></Field>
      <Field label="Text" hint="A blank line starts a new paragraph."><TextArea rows={7} value={st.body ?? ''} onChange={put('body')} /></Field>
    </div>
  );
  if (s.type === 'countdown') return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
      <Field label="Heading"><TextInput value={st.heading ?? ''} onChange={put('heading')} /></Field>
      <Field label="Counts down to"><SelectInput value={st.target ?? 'start'} onChange={put('target')}><option value="start">The campaign start</option><option value="end">The campaign end</option><option value="custom">A date I choose</option></SelectInput></Field>
      {st.target === 'custom' && <Field label="Date and time"><TextInput type="datetime-local" value={toLocal(st.custom_at)} onChange={put('custom_at')} /></Field>}
      <Field label="When it reaches zero"><TextInput value={st.done_text ?? ''} onChange={put('done_text')} placeholder="It is here" /></Field>
    </div>
  );
  if (s.type === 'video') return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Field label="Heading"><TextInput value={st.heading ?? ''} onChange={put('heading')} /></Field>
      <div style={{ display: 'flex', gap: 6 }}>
        {[['embed', 'A link (YouTube, Vimeo, TikTok, Facebook)'], ['upload', 'Upload a video']].map(([k, l]) => <button key={k} type="button" onClick={() => put('source')(k)} style={{ ...btnGhost, fontWeight: (st.source ?? 'embed') === k ? 800 : 500, borderColor: (st.source ?? 'embed') === k ? 'var(--color-primary-500)' : undefined }}>{l}</button>)}
      </div>
      {(st.source ?? 'embed') === 'embed'
        ? <Field label="Video link" hint="Paste the full link. For TikTok use the link that has /video/ and a number."><TextInput value={st.url ?? ''} onChange={put('url')} placeholder="https://www.youtube.com/watch?v=…" /></Field>
        : <Field label="Video file" hint={`MP4 or WebM, up to ${maxVideoMb} MB. A still picture is taken from it for the cover.`}><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{file('file', 'video', 'video/mp4,video/webm', st.file ? 'Replace video' : 'Choose video')}{st.file && <span style={{ fontSize: '0.74rem', color: colors.textFaint }}>{st.file.split('/').pop()}</span>}</div></Field>}
      <Field label="Cover picture" hint="Shown before the video plays. YouTube gives one by itself; for TikTok, Facebook, Vimeo and uploads add one (uploads get one automatically).">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{st.poster && <img src={storageUrl(st.poster)} alt="" style={{ height: 48, borderRadius: 6 }} />}{file('poster', 'image', 'image/png,image/jpeg,image/webp', st.poster ? 'Change picture' : 'Add picture')}{st.poster && <button type="button" style={btnGhost} onClick={() => set({ settings: { ...st, poster: '' } })}>Remove</button>}</div>
      </Field>
    </div>
  );
  if (s.type === 'cta') return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Field label="Heading"><TextInput value={st.heading ?? ''} onChange={put('heading')} /></Field>
      <Field label="Message"><TextArea rows={3} value={st.text ?? ''} onChange={put('text')} /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
        <Field label="Button text"><TextInput value={st.button_label ?? ''} onChange={put('button_label')} /></Field>
        <Field label="Button link" hint="A path on this site (/products) or https://…"><TextInput value={st.button_link ?? ''} onChange={put('button_link')} /></Field>
      </div>
    </div>
  );
  if (s.type === 'pins') return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
      <Field label="Heading"><TextInput value={st.heading ?? ''} onChange={put('heading')} /></Field>
      <Field label="Show"><SelectInput value={st.source ?? 'board'} onChange={put('source')}><option value="board">The pins of a board</option><option value="tag">Pins with a tag</option></SelectInput></Field>
      {(st.source ?? 'board') === 'board'
        ? <Field label="Board" hint="Only public, approved boards."><SelectInput value={st.board_id ?? ''} onChange={(e) => set({ settings: { ...st, board_id: e.target.value ? Number(e.target.value) : undefined } })}><option value="">Choose a board…</option>{world.boards.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}</SelectInput></Field>
        : <Field label="Tag" hint="One word, without the #."><TextInput value={st.tag ?? ''} onChange={put('tag')} placeholder="summerdrop" /></Field>}
      <Field label="How many"><TextInput type="number" min={1} max={24} value={st.count ?? 12} onChange={(e) => set({ settings: { ...st, count: Number(e.target.value) } })} /></Field>
    </div>
  );
  if (s.type === 'moodboard') return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
      <Field label="Heading"><TextInput value={st.heading ?? ''} onChange={put('heading')} /></Field>
      <Field label="Moodboard" hint="Only approved moodboards."><SelectInput value={st.moodboard_id ?? ''} onChange={(e) => set({ settings: { ...st, moodboard_id: e.target.value ? Number(e.target.value) : undefined } })}><option value="">Choose a moodboard…</option>{world.moodboards.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}</SelectInput></Field>
    </div>
  );
  if (s.type === 'gallery') return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
      <Field label="Heading"><TextInput value={st.heading ?? ''} onChange={put('heading')} placeholder="Shared by you" /></Field>
      <Field label="Tag" hint="Customers add this tag to a pin on a public board and it shows here."><TextInput value={st.tag ?? ''} onChange={put('tag')} placeholder="mylook" /></Field>
      <Field label="How many"><TextInput type="number" min={1} max={24} value={st.count ?? 12} onChange={(e) => set({ settings: { ...st, count: Number(e.target.value) } })} /></Field>
    </div>
  );
  // products
  const taken = new Set(s.items.map((i) => `${i.item_type}:${i.item_id}`));
  const setItems = (items) => set({ items });
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
        <Field label="Heading"><TextInput value={st.heading ?? ''} onChange={put('heading')} /></Field>
        <Field label="Layout"><SelectInput value={st.layout ?? 'grid'} onChange={put('layout')}><option value="grid">Grid</option><option value="list">List</option></SelectInput></Field>
      </div>
      {!ecommerce && <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--status-warning, #b45309)' }}>Featuring products and services needs E-commerce, which is switched off.</p>}
      {s.items.map((it, i) => {
        const r = resolved[`${it.item_type}:${it.item_id}`];
        return (
          <div key={`${it.item_type}:${it.item_id}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(140px,1.4fr) minmax(150px,1fr) minmax(120px,1fr) auto', gap: 8, alignItems: 'end', padding: 8, border: '1px solid var(--line)', borderRadius: 10 }}>
            <div><div style={{ fontWeight: 700, fontSize: '0.84rem' }}>{r?.name ?? 'No longer available'}</div><div style={{ fontSize: '0.68rem', color: colors.textFaint, textTransform: 'uppercase' }}>{it.item_type}{r?.sku ? ` · ${r.sku}` : ''}</div></div>
            <Field label="Coming soon until"><TextInput type="datetime-local" value={it.available_from} onChange={(e) => setItems(s.items.map((x, k) => (k === i ? { ...x, available_from: e.target.value } : x)))} /></Field>
            <Field label="Own label"><TextInput value={it.label_override} onChange={(e) => setItems(s.items.map((x, k) => (k === i ? { ...x, label_override: e.target.value } : x)))} placeholder="Optional" /></Field>
            <button type="button" aria-label="Remove" style={{ ...btnGhost, padding: 8 }} onClick={() => setItems(s.items.filter((_, k) => k !== i))}><Trash2 size={14} /></button>
          </div>
        );
      })}
      {ecommerce && <ItemPicker allowed={itemTypes} taken={taken} onAdd={(r) => { setResolved((m) => ({ ...m, [r.key]: r })); setItems([...s.items, { item_type: r.type, item_id: r.id, available_from: '', label_override: '' }]); }} />}
    </div>
  );
}

/** The page of a campaign: add, order, schedule and fill in its sections, with a live preview beside them. Saved in one go. */
export default function PageBuilder({ campaign, sections: initial, items: initialItems, resolved: initialResolved, ecommerce, itemTypes, maxVideoMb, canEdit, onSaved }) {
  const [list, setList] = useState(() => rows(initial, initialItems));
  const [resolved, setResolved] = useState(initialResolved);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [world, setWorld] = useState({ boards: [], moodboards: [] });
  useEffect(() => { campaignsAPI.worldOptions().then(setWorld).catch(() => {}); }, []);
  const dragFrom = useRef(null);
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } setList(rows(initial, initialItems)); setResolved(initialResolved); setDirty(false); }, [initial, initialItems, initialResolved]);

  const patch = useCallback((key, p) => { setList((l) => l.map((s) => (s.key === key ? { ...s, ...p } : s))); setDirty(true); }, []);
  const move = (from, to) => { if (to < 0 || to >= list.length || from === to) return; const l = [...list]; const [x] = l.splice(from, 1); l.splice(to, 0, x); setList(l); setDirty(true); };
  const add = (type) => { setList((l) => [...l, { key: keyOf(), id: null, type, settings: type === 'products' ? { heading: 'Shop', layout: 'grid' } : type === 'countdown' ? { target: 'start' } : type === 'pins' ? { heading: 'Inspiration', source: 'board', count: 12 } : type === 'gallery' ? { heading: 'Shared by you', count: 12 } : {}, show_from: '', show_until: '', open: true, items: [] }]); setDirty(true); setAdding(false); };

  const save = async () => {
    setBusy(true);
    try {
      const body = list.map((s) => ({ id: s.id, type: s.type, settings: s.settings, show_from: s.show_from || null, show_until: s.show_until || null, audience_rule: s.audience_rule ?? null, items: s.type === 'products' ? s.items.map((i) => ({ ...i, available_from: i.available_from || null, label_override: i.label_override || null })) : undefined }));
      const r = await campaignsAPI.savePage(campaign.id, body);
      toast.success(r.message);
      onSaved(r);
    } catch (e) { toast.error(errMsg(e, 'Could not save the page'), { duration: 7000 }); } finally { setBusy(false); }
  };

  const preview = useMemo(() => list.map((s) => ({ ...s, show_from: s.show_from || null, show_until: s.show_until || null })), [list]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 18, alignItems: 'start' }}>
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <p style={{ ...lbl, margin: 0, flex: 1 }}>Page sections {dirty && <span style={{ color: 'var(--status-warning, #b45309)', textTransform: 'none', letterSpacing: 0 }}>· unsaved changes</span>}</p>
          {canEdit && <button type="button" style={btnPrimary} disabled={busy || !dirty} onClick={save}>{busy ? 'Saving…' : 'Save page'}</button>}
        </div>
        {list.map((s, i) => (
          <div key={s.key} draggable={canEdit} onDragStart={() => { dragFrom.current = i; }} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (dragFrom.current !== null) move(dragFrom.current, i); dragFrom.current = null; }} style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px' }}>
              {canEdit && <GripVertical size={15} style={{ color: colors.textFaint, cursor: 'grab' }} />}
              <button type="button" onClick={() => patch(s.key, { open: !s.open })} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'none', color: 'inherit', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', padding: 0 }}>
                {s.open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}<strong style={{ fontSize: '0.86rem' }}>{TYPE_LABEL[s.type]}</strong>
                <span style={{ fontSize: '0.72rem', color: colors.textFaint }}>{s.settings.headline || s.settings.heading || ''}</span>
                {s.audience_rule && <span style={{ fontSize: '0.66rem', fontWeight: 700, color: '#0f766e' }}>some people</span>}
                {(s.show_from || s.show_until) && <span style={{ fontSize: '0.66rem', fontWeight: 700, color: '#7c3aed' }}>scheduled</span>}
              </button>
              {canEdit && <>
                <button type="button" aria-label="Move up" disabled={i === 0} style={{ ...btnGhost, padding: 5 }} onClick={() => move(i, i - 1)}><ArrowUp size={13} /></button>
                <button type="button" aria-label="Move down" disabled={i === list.length - 1} style={{ ...btnGhost, padding: 5 }} onClick={() => move(i, i + 1)}><ArrowDown size={13} /></button>
                <button type="button" aria-label="Remove section" style={{ ...btnGhost, padding: 5, color: colors.danger }} onClick={() => { setList(list.filter((x) => x.key !== s.key)); setDirty(true); }}><Trash2 size={13} /></button>
              </>}
            </div>
            {s.open && (
              <div style={{ padding: '4px 14px 14px', display: 'grid', gap: 14, borderTop: '1px solid var(--line)' }}>
                <fieldset disabled={!canEdit} style={{ border: 'none', padding: 0, margin: '12px 0 0', minWidth: 0 }}>
                  <SectionForm s={s} set={(p) => patch(s.key, p)} campaignId={campaign.id} maxVideoMb={maxVideoMb} ecommerce={ecommerce} itemTypes={itemTypes} resolved={resolved} setResolved={setResolved} world={world} />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12, marginTop: 14, paddingTop: 12, borderTop: '1px dashed var(--line)' }}>
                    <Field label="Show from" hint="Empty = from the start. A teaser can reveal a section a day."><TextInput type="datetime-local" value={s.show_from} onChange={(e) => patch(s.key, { show_from: e.target.value })} /></Field>
                    <Field label="Show until" hint="Empty = for as long as the campaign shows."><TextInput type="datetime-local" value={s.show_until} onChange={(e) => patch(s.key, { show_until: e.target.value })} /></Field>
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <Field label="Who sees this section" hint="Narrower than the campaign's own audience. Staff always see it."><AudienceRule value={s.audience_rule} noun="this section" onChange={(r) => patch(s.key, { audience_rule: r })} /></Field>
                  </div>
                </fieldset>
              </div>
            )}
          </div>
        ))}
        {canEdit && (adding ? (
          <div style={{ ...card, padding: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 8 }}>
            {Object.keys(TYPE_LABEL).map((t) => <button key={t} type="button" onClick={() => add(t)} style={{ textAlign: 'left', padding: '8px 10px', borderRadius: 10, border: '1px solid var(--line)', background: 'transparent', color: 'inherit', cursor: 'pointer', fontFamily: 'inherit' }}><div style={{ fontWeight: 700, fontSize: '0.82rem' }}>{TYPE_LABEL[t]}</div><div style={{ fontSize: '0.68rem', color: colors.textFaint }}>{TYPE_ABOUT[t]}</div></button>)}
          </div>
        ) : <button type="button" style={{ ...btnGhost, justifySelf: 'start' }} onClick={() => setAdding(true)}><Plus size={14} /> Add a section</button>)}
      </div>

      <div style={{ position: 'sticky', top: 12 }}>
        <p style={lbl}>Preview</p>
        <div style={{ ...card, padding: 16, maxHeight: '80vh', overflowY: 'auto' }}>
          <CampaignView campaign={campaign} sections={preview} resolved={resolved} preview />
        </div>
      </div>
    </div>
  );
}
