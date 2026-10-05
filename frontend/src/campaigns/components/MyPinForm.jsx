import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import Modal from '../../core/components/admin/ui/Modal';
import { Field, TextInput, TextArea, CheckboxRow } from '../../core/components/admin/ui/Form';
import myBoardsAPI from '../../_shared/api/myBoards';
import { errMsg } from '../../_shared/store/helpers/apiState';
import { btnPrimary, btnGhost } from '../../_shared/theme/tokens';

const KINDS = [['image', 'Picture'], ['link', 'Link'], ['video', 'Video link'], ['note', 'Note']];
const chip = (on) => ({ padding: '6px 12px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: on ? 800 : 600, color: on ? 'var(--color-primary-500)' : 'var(--text-secondary)', border: `1.5px solid ${on ? 'var(--color-primary-500)' : 'var(--line)'}`, background: on ? 'color-mix(in srgb, var(--color-primary-500) 12%, transparent)' : 'transparent' });

/** Add my own pin to a board: a picture, a link, a video link (YouTube, Vimeo, TikTok, Facebook) or a note. Video files are not accepted. */
export default function MyPinForm({ boardId, onClose, onSaved }) {
  const [kind, setKind] = useState('image');
  const [f, setF] = useState({ title: '', caption: '', tags: '', link_url: '', video_url: '', allow_download: true });
  const [image, setImage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState({});
  const preview = useMemo(() => (image ? URL.createObjectURL(image) : null), [image]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e }));

  const pick = (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error('A picture can be up to 10 MB.'); return; }
    setImage(file);
  };
  const save = async (e) => {
    e.preventDefault(); setBusy(true); setErr({});
    try {
      const r = await myBoardsAPI.uploadPin({ kind, board_id: boardId, title: f.title, caption: f.caption, tags: f.tags, link_url: kind === 'link' ? f.link_url : undefined, video_url: kind === 'video' ? f.video_url : undefined, allow_download: kind === 'image' ? f.allow_download : undefined }, kind === 'image' || kind === 'link' ? image : null);
      toast.success(r.message); onSaved();
    } catch (er) { const v = er?.response?.data?.errors; if (v) setErr(Object.fromEntries(Object.entries(v).map(([k, m]) => [k, m[0]]))); else toast.error(errMsg(er, 'Could not add the pin')); }
    finally { setBusy(false); }
  };
  const first = Object.values(err)[0];

  return (
    <Modal title="Add a pin" subtitle="Put something of yours on this board" onClose={onClose} width={520}
      footer={<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button type="button" style={btnGhost} onClick={onClose}>Cancel</button><button type="submit" form="my-pin-form" style={btnPrimary} disabled={busy}>{busy ? 'Adding…' : 'Add pin'}</button></div>}>
      <form id="my-pin-form" onSubmit={save} style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{KINDS.map(([k, l]) => <button key={k} type="button" style={chip(kind === k)} onClick={() => setKind(k)}>{l}</button>)}</div>
        {(kind === 'image' || kind === 'link') && (
          <Field label={kind === 'image' ? 'Picture' : 'Picture (optional)'} error={err.image} hint="PNG, JPG or WebP, up to 10 MB.">
            {preview && <img src={preview} alt="" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 10, display: 'block', marginBottom: 8 }} />}
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={pick} />
          </Field>
        )}
        {kind === 'link' && <Field label="Link" error={err.link_url}><TextInput value={f.link_url} onChange={set('link_url')} placeholder="https://" maxLength={500} /></Field>}
        {kind === 'video' && <Field label="Video link" error={err.video_url ?? err.video} hint="Paste a YouTube, Vimeo, TikTok or Facebook link."><TextInput value={f.video_url} onChange={set('video_url')} placeholder="https://" maxLength={500} /></Field>}
        <Field label={kind === 'note' ? 'Title (optional)' : 'Title'} error={err.title}><TextInput value={f.title} onChange={set('title')} maxLength={160} /></Field>
        <Field label={kind === 'note' ? 'Your note' : 'About (optional)'} error={err.caption}><TextArea value={f.caption} onChange={set('caption')} rows={3} maxLength={2000} /></Field>
        <Field label="Tags (optional)" hint="Separate with commas."><TextInput value={f.tags} onChange={set('tags')} placeholder="red, kitchen" /></Field>
        {kind === 'image' && <CheckboxRow checked={f.allow_download} onChange={set('allow_download')} label="Let people download this picture" />}
        {first && !err.image && !err.link_url && !err.video_url && !err.title && !err.caption && <p role="alert" style={{ margin: 0, color: 'var(--status-error, #b91c1c)', fontSize: '0.84rem' }}>{first}</p>}
      </form>
    </Modal>
  );
}
