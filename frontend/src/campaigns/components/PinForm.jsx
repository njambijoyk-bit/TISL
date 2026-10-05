import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import Modal from '../../core/components/admin/ui/Modal';
import { Field, TextInput, TextArea, CheckboxRow } from '../../core/components/admin/ui/Form';
import pinsAPI from '../../_shared/api/pins';
import { errMsg } from '../../_shared/store/helpers/apiState';
import { storageUrl } from '../../_shared/lib/storageUrl';
import noSlash from '../../_shared/lib/noSlash';
import { btnPrimary, btnGhost, colors } from '../../_shared/theme/tokens';
import ItemPicker from './ItemPicker';
import posterFrom from '../lib/videoPoster';

const KINDS = [['image', 'Image'], ['video', 'Video'], ['item', 'Product or service'], ['link', 'Link'], ['note', 'Note']];
const chip = (on) => ({ padding: '6px 12px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: on ? 800 : 600, color: on ? 'var(--color-primary-500)' : 'var(--text-secondary)', border: `1.5px solid ${on ? 'var(--color-primary-500)' : 'var(--line)'}`, background: on ? 'color-mix(in srgb, var(--color-primary-500) 12%, transparent)' : 'transparent' });

/** Make a pin, or change one. The kind chooses which fields show; a picture, video or link can be swapped after it is made. */
export default function PinForm({ pin, limits, ecommerce, itemTypes = ['product', 'service', 'hamper', 'auction'], onClose, onSaved }) {
  const editing = Boolean(pin);
  const [kind, setKind] = useState(pin?.kind ?? 'image');
  const [f, setF] = useState({ title: pin?.title ?? '', caption: pin?.caption ?? '', credit: pin?.credit ?? '', tags: (pin?.tags ?? []).join(', '), allow_download: pin?.allow_download ?? true, link_url: pin?.link_url ?? '', video_url: pin?.video?.url ?? '' });
  const [files, setFiles] = useState({ image: null, video: null, poster: null });
  const [videoSource, setVideoSource] = useState(pin?.video?.source === 'upload' ? 'upload' : 'embed');
  const [item, setItem] = useState(pin?.kind === 'item' && pin.item ? pin.item : null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? v.target.value : v }));
  const preview = useMemo(() => (files.image ? URL.createObjectURL(files.image) : pin?.thumb_path || pin?.media_path ? storageUrl(pin.thumb_path || pin.media_path) : null), [files.image, pin]);
  const downloadable = kind === 'image' || (kind === 'video' && videoSource === 'upload');

  const pick = (key, accept, maxMb, what) => (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > maxMb * 1024 * 1024) { toast.error(`${what} can be up to ${maxMb} MB.`); return; }
    setFiles((x) => ({ ...x, [key]: file }));
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const text = { title: f.title, caption: f.caption, credit: f.credit, tags: f.tags };
      if (downloadable) text.allow_download = f.allow_download;
      let r;
      if (editing) {
        r = await pinsAPI.update(pin.id, { ...text, allow_download: downloadable ? f.allow_download : undefined, link_url: kind === 'link' ? f.link_url : undefined });
        if (files.image || files.video || files.poster || (kind === 'video' && videoSource === 'embed' && f.video_url && f.video_url !== pin.video?.url)) {
          const poster = files.poster ?? (files.video ? await posterFrom(files.video) : null);
          r = await pinsAPI.media(pin.id, { video_url: kind === 'video' && videoSource === 'embed' ? f.video_url : undefined }, { image: files.image, video: files.video, poster });
        }
      } else {
        const fields = { kind, ...text };
        const upload = {};
        if (kind === 'image') upload.image = files.image;
        if (kind === 'video') {
          if (videoSource === 'upload') { upload.video = files.video; upload.poster = files.poster ?? (files.video ? await posterFrom(files.video) : null); } else { fields.video_url = f.video_url; upload.poster = files.poster; }
        }
        if (kind === 'item') { fields.item_type = item?.type; fields.item_id = item?.id; }
        if (kind === 'link') { fields.link_url = f.link_url; upload.image = files.image; }
        r = await pinsAPI.create(fields, upload);
      }
      toast.success(r.message);
      onSaved(r.data);
    } catch (er) { setErr(errMsg(er, 'Could not save the pin')); } finally { setBusy(false); }
  };

  const fileButton = (key, accept, maxMb, what, label) => (
    <label style={{ ...btnGhost, display: 'inline-block', cursor: 'pointer' }}>{label}<input type="file" hidden accept={accept} onChange={pick(key, accept, maxMb, what)} /></label>
  );

  return (
    <Modal title={editing ? 'Change pin' : 'New pin'} subtitle={editing ? `A ${kind} pin` : 'Pick what it is, then fill it in'} onClose={onClose} width={620}
      footer={<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button type="button" style={btnGhost} onClick={onClose}>Cancel</button><button type="submit" form="pin-form" style={btnPrimary} disabled={busy}>{busy ? 'Saving…' : 'Save pin'}</button></div>}>
      <form id="pin-form" onSubmit={save} style={{ display: 'grid', gap: 14 }}>
        {err && <p role="alert" style={{ margin: 0, color: colors.dangerText, fontSize: '0.84rem' }}>{err}</p>}
        {!editing && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{KINDS.map(([k, l]) => <button key={k} type="button" style={chip(kind === k)} onClick={() => setKind(k)}>{l}</button>)}</div>}

        {kind === 'image' && (
          <Field label={editing ? 'Picture' : 'Picture *'} hint={`JPG, PNG or WebP, up to ${limits.image} MB.`}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>{preview && <img src={preview} alt="" style={{ height: 72, borderRadius: 8 }} />}{fileButton('image', 'image/png,image/jpeg,image/webp', limits.image, 'A picture', preview ? 'Change picture' : 'Choose picture')}</div>
          </Field>
        )}

        {kind === 'video' && (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', gap: 6 }}>{[['embed', 'A link'], ['upload', 'Upload a video']].map(([k, l]) => <button key={k} type="button" style={chip(videoSource === k)} onClick={() => setVideoSource(k)}>{l}</button>)}</div>
            {videoSource === 'embed'
              ? <Field label="Video link *" hint="YouTube, Vimeo, TikTok or Facebook. For TikTok use the full link with /video/ and a number."><TextInput value={f.video_url} onChange={set('video_url')} placeholder="https://www.youtube.com/watch?v=…" /></Field>
              : <Field label="Video file *" hint={`MP4 or WebM, up to ${limits.video} MB. A still picture is taken from it for the cover.`}><div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>{fileButton('video', 'video/mp4,video/webm', limits.video, 'A video', files.video || pin?.video?.file ? 'Change video' : 'Choose video')}<span style={{ fontSize: '0.74rem', color: colors.textFaint }}>{files.video?.name ?? pin?.video?.file?.split('/').pop() ?? ''}</span></div></Field>}
            <Field label="Cover picture" hint={videoSource === 'upload' ? 'Taken from the video if you leave it.' : 'YouTube gives one by itself; add one for TikTok, Facebook and Vimeo.'}>{fileButton('poster', 'image/png,image/jpeg,image/webp', 5, 'A picture', files.poster ? 'Change cover' : 'Choose cover')}</Field>
          </div>
        )}

        {kind === 'item' && (
          editing ? <p style={{ margin: 0, fontSize: '0.84rem' }}>Features <strong>{pin.item?.name ?? 'an item that is no longer available'}</strong> ({pin.item_type}). Its name, price and picture are always read live.</p>
            : !ecommerce ? <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--status-warning, #b45309)' }}>Featuring a product or service needs E-commerce, which is switched off.</p>
              : <div style={{ display: 'grid', gap: 8 }}>
                {item && <p style={{ margin: 0, fontSize: '0.84rem' }}>Chosen: <strong>{item.name}</strong> ({item.type}) <button type="button" style={{ ...btnGhost, padding: '2px 8px' }} onClick={() => setItem(null)}>Change</button></p>}
                {!item && <ItemPicker allowed={itemTypes} taken={new Set()} onAdd={(r) => { setItem(r); if (!f.title) set('title')(r.name); }} />}
              </div>
        )}

        {kind === 'link' && (
          <div style={{ display: 'grid', gap: 12 }}>
            <Field label="Link *"><TextInput value={f.link_url} onChange={set('link_url')} placeholder="https://…" /></Field>
            <Field label="Picture" hint="Optional: shown on the pin.">
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>{preview && <img src={preview} alt="" style={{ height: 56, borderRadius: 8 }} />}{fileButton('image', 'image/png,image/jpeg,image/webp', limits.image, 'A picture', preview ? 'Change picture' : 'Choose picture')}</div>
            </Field>
          </div>
        )}

        <Field label={kind === 'note' ? 'Title' : 'Title'}><TextInput value={f.title} onChange={set('title')} /></Field>
        <Field label={kind === 'note' ? 'The note *' : 'Caption'}><TextArea rows={kind === 'note' ? 5 : 3} value={f.caption} onChange={set('caption')} /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
          <Field label="Credit" hint="Who made it, if it is not ours."><TextInput value={f.credit} onChange={set('credit')} /></Field>
          <Field label="Tags" hint="Words people can find it by, separated by commas."><TextInput value={f.tags} onChange={(e) => set('tags')(noSlash(e.target.value, 'A tag'))} placeholder="satin, burgundy" /></Field>
        </div>
        {downloadable && <CheckboxRow checked={f.allow_download} onChange={set('allow_download')} label="People can download it" description="Off hides the download button and our download link. The picture can still be seen on screen." />}
      </form>
    </Modal>
  );
}
