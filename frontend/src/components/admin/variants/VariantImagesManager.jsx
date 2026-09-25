import { useState } from 'react';
import toast from 'react-hot-toast';
import { Star, Trash2, Upload, Link2 } from 'lucide-react';
import useProductVariantStore from '../../../store/productVariantStore';
import Modal from '../ui/Modal';
import { Field, TextInput, SelectInput, CheckboxRow, FormStack, ModalActions, FormError } from '../ui/Form';
import useDeleteConfirm from '../tax/sections/useDeleteConfirm';
import { storageUrl } from '../../../lib/storageUrl';
import { colors, radius, btnGhost, btnIcon } from '../../../theme/tokens';

/**
 * Images for the structured variants: tie a photo to a whole option value
 * (every "Red" variant) or to one variant. These live alongside the product's
 * main gallery on the Images tab.
 */
function AddImageModal({ onClose }) {
  const { options, variants, createImage, actionLoading } = useProductVariantStore();
  const [mode, setMode] = useState('file');
  const [file, setFile] = useState(null);
  const [url, setUrl] = useState('');
  const [attach, setAttach] = useState('');          // '', 'v:12', 'o:5'
  const [alt, setAlt] = useState('');
  const [primary, setPrimary] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (mode === 'file' && !file) { setError('Choose an image.'); return; }
    if (mode === 'url' && !/^https?:\/\//.test(url.trim())) { setError('Enter a full image address starting with https://'); return; }
    const [kind, id] = attach ? attach.split(':') : [];
    try {
      await createImage({
        ...(mode === 'file' ? { image: file } : { image_url: url.trim() }),
        variant_id: kind === 'v' ? Number(id) : null,
        option_value_id: kind === 'o' ? Number(id) : null,
        alt_text: alt.trim() || null,
        is_primary: primary,
      });
      toast.success('Image added');
      onClose();
    } catch (err) {
      const errs = err.response?.data?.errors;
      setError(errs ? Object.values(errs)[0][0] : err.response?.data?.message ?? 'Could not add the image');
    }
  };

  return (
    <Modal title="Add an image" onClose={onClose} width={500}>
      <form onSubmit={submit}>
        <FormStack>
          <FormError message={error} />
          <div role="radiogroup" style={{ display: 'flex', gap: 6 }}>
            {[['file', 'Upload', Upload], ['url', 'From a link', Link2]].map(([id, label, Icon]) => (
              <button key={id} type="button" role="radio" aria-checked={mode === id} onClick={() => setMode(id)} style={{
                ...btnGhost, padding: '6px 12px', borderColor: mode === id ? colors.primary : colors.tint(0.18),
                color: mode === id ? colors.primaryDeep : colors.textMuted, background: mode === id ? colors.tint(0.06) : 'transparent',
              }}><Icon size={13} /> {label}</button>
            ))}
          </div>
          {mode === 'file' ? (
            <Field label="Image" hint="JPG, PNG or WebP, up to 5 MB">
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} style={{ fontSize: '0.8rem' }} />
            </Field>
          ) : (
            <Field label="Image address" htmlFor="img-url">
              <TextInput id="img-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
            </Field>
          )}
          <Field label="Shows for" htmlFor="img-attach" hint="Pick an option value to reuse one photo across every variant with it.">
            <SelectInput id="img-attach" value={attach} onChange={(e) => setAttach(e.target.value)}>
              <option value="">The whole product</option>
              {options.filter((o) => o.values?.length).map((o) => (
                <optgroup key={o.id} label={`Every variant with ${o.name}…`}>
                  {o.values.map((v) => <option key={v.id} value={`o:${v.id}`}>{o.name}: {v.value}</option>)}
                </optgroup>
              ))}
              {variants.length > 0 && (
                <optgroup label="One variant">
                  {variants.map((v) => <option key={v.id} value={`v:${v.id}`}>{v.name || v.sku || `Variant #${v.id}`}</option>)}
                </optgroup>
              )}
            </SelectInput>
          </Field>
          <Field label="Description for screen readers" htmlFor="img-alt">
            <TextInput id="img-alt" maxLength={255} value={alt} onChange={(e) => setAlt(e.target.value)} placeholder="Red 5 L paint tin, front" />
          </Field>
          <CheckboxRow checked={primary} onChange={setPrimary} label="Make it the primary image" />
          <ModalActions onCancel={onClose} submitLabel="Add image" busyLabel="Uploading…" busy={actionLoading} />
        </FormStack>
      </form>
    </Modal>
  );
}

export default function VariantImagesManager({ readOnly }) {
  const { images, options, variants, actionLoading, setPrimaryImage, deleteImage } = useProductVariantStore();
  const [adding, setAdding] = useState(false);
  const { ask, modal } = useDeleteConfirm(actionLoading);

  const valueLabel = Object.fromEntries(options.flatMap((o) => (o.values ?? []).map((v) => [v.id, `${o.name}: ${v.value}`])));
  const variantLabel = Object.fromEntries(variants.map((v) => [v.id, v.name || v.sku || `Variant #${v.id}`]));
  const tagFor = (img) => (img.variant_id ? variantLabel[img.variant_id] : img.option_value_id ? valueLabel[img.option_value_id] : 'Whole product');

  return (
    <div>
      {images.length === 0 ? (
        <p style={{ margin: '0 0 12px', fontSize: '0.8rem', color: colors.textMuted }}>No variant images yet.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginBottom: 12 }}>
          {images.map((img) => (
            <figure key={img.id} style={{ margin: 0, borderRadius: radius.lg, overflow: 'hidden', border: `1.5px solid ${img.is_primary ? colors.primary : colors.tint(0.12)}`, background: colors.surface }}>
              <div style={{ aspectRatio: '1 / 1', background: colors.tint(0.04) }}>
                <img src={storageUrl(img.path)} alt={img.alt_text || tagFor(img)} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </div>
              <figcaption style={{ padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ flex: 1, fontSize: '0.7rem', color: colors.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={tagFor(img)}>{tagFor(img)}</span>
                {!readOnly && (
                  <>
                    <button type="button" aria-label={img.is_primary ? 'Primary image' : 'Make primary'} disabled={img.is_primary}
                      onClick={() => setPrimaryImage(img.id).catch(() => toast.error('Could not change the primary image'))}
                      style={{ ...btnIcon, width: 24, height: 24, color: img.is_primary ? colors.warning : colors.textFaint }}>
                      <Star size={12} fill={img.is_primary ? colors.warning : 'none'} />
                    </button>
                    <button type="button" aria-label="Delete image" style={{ ...btnIcon, width: 24, height: 24 }}
                      onClick={() => ask({ title: 'Delete this image?', message: 'Uploaded files are removed from storage too.', run: () => deleteImage(img.id), done: 'Image deleted' })}>
                      <Trash2 size={12} />
                    </button>
                  </>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      {!readOnly && <button type="button" onClick={() => setAdding(true)} style={btnGhost}><Upload size={14} /> Add image</button>}
      {adding && <AddImageModal onClose={() => setAdding(false)} />}
      {modal}
    </div>
  );
}
