import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import codesAPI from '../../../../_shared/api/codes';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { Field, TextInput, SelectInput, CheckboxRow, FormGrid } from '../ui/Form';
import { SIZES } from '../../../lib/codes/labelSheet';
import { btnPrimary, card, colors } from '../../../../_shared/theme/tokens';

const TYPES = { variant: 'Products', pack: 'Packs and cartons', asset: 'Assets', batch: 'Stock batches' };

/** Settings → Codes, on the Codes page: what internal codes look like and the label defaults. */
export default function CodesSettingsTab({ kinds, can }) {
  const [s, setS] = useState(null);
  const [ready, setReady] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => { codesAPI.settings().then((r) => { setS(r.settings); setReady(r.ready); }).catch((e) => toast.error(errMsg(e, 'Could not load the settings'))); }, []);
  if (!s) return <p style={{ color: colors.textMuted }}>Loading…</p>;

  const save = async () => {
    setBusy(true);
    try { const r = await codesAPI.saveSettings({ internal_prefix: s.internal_prefix, kinds: s.kinds, label: s.label }); setS(r.settings); toast.success('Saved'); }
    catch (e) { toast.error(errMsg(e, 'Could not save')); } finally { setBusy(false); }
  };
  const lab = (k) => (v) => setS((x) => ({ ...x, label: { ...x.label, [k]: v } }));

  return (
    <div style={{ display: 'grid', gap: 14, maxWidth: 760 }}>
      {!ready && <p role="status" style={{ color: colors.textMuted, fontSize: '0.82rem', margin: 0 }}>Run database script 119_codes.sql, then reload: until then these can be seen but not saved, and internal codes can not be made.</p>}
      <div style={{ ...card, padding: 20, display: 'grid', gap: 14 }}>
        <Field label="Internal code prefix" hint="Codes we make for products without a manufacturer barcode are EAN-13s that start with these two digits (20 to 29 are kept for a shop's own use, so they never clash with a real product's code).">
          <TextInput aria-label="Internal code prefix" value={s.internal_prefix} maxLength={2} inputMode="numeric" onChange={(e) => setS((x) => ({ ...x, internal_prefix: e.target.value }))} style={{ maxWidth: 100 }} />
        </Field>
        <FormGrid min={220}>
          {Object.entries(TYPES).map(([t, name]) => (
            <Field key={t} label={`Kind of code for ${name.toLowerCase()}`}>
              <SelectInput aria-label={`Kind of code for ${name}`} value={s.kinds[t]} onChange={(e) => setS((x) => ({ ...x, kinds: { ...x.kinds, [t]: e.target.value } }))}>
                <option value="auto">Automatic (a real barcode keeps its retail code)</option>
                {kinds.filter((k) => k.for_labels !== false).map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
              </SelectInput>
            </Field>
          ))}
        </FormGrid>
      </div>
      <div style={{ ...card, padding: 20, display: 'grid', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>Label defaults</h2>
        <FormGrid min={200}>
          <CheckboxRow checked={s.label.name} onChange={lab('name')} label="Product name" />
          <CheckboxRow checked={s.label.sku} onChange={lab('sku')} label="SKU" />
          <CheckboxRow checked={s.label.price} onChange={lab('price')} label="Price" />
          <CheckboxRow checked={s.label.batch} onChange={lab('batch')} label="Batch and expiry" />
          <CheckboxRow checked={s.label.code_text} onChange={lab('code_text')} label="Digits under the code" />
        </FormGrid>
        <Field label="Usual sheet or roll">
          <SelectInput aria-label="Usual sheet or roll" value={s.label.size} onChange={(e) => lab('size')(e.target.value)}>
            {Object.entries(SIZES).map(([k, z]) => <option key={k} value={k}>{z.name}</option>)}
          </SelectInput>
        </Field>
      </div>
      {can.manage && <div><button type="button" style={btnPrimary} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button></div>}
    </div>
  );
}
