import { useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, X, Trash2 } from 'lucide-react';
import useProductVariantStore from '../../../store/productVariantStore';
import { TextInput } from '../ui/Form';
import useDeleteConfirm from '../tax/sections/useDeleteConfirm';
import { colors, radius, btnGhost, btnIcon } from '../../../theme/tokens';

/**
 * The product's options (Size, Colour…) and their values (Small, Red…).
 * Variants are built from one value per option.
 */
export default function OptionsEditor({ readOnly }) {
  const { options, actionLoading, createOption, updateOption, deleteOption, createOptionValue, deleteOptionValue } = useProductVariantStore();
  const [newOption, setNewOption] = useState('');
  const [newValues, setNewValues] = useState({});   // { [optionId]: text }
  const [renaming, setRenaming] = useState(null);   // { id, name }
  const { ask, modal } = useDeleteConfirm(actionLoading);

  const fail = (err, msg) => toast.error(err.response?.data?.message ?? msg);

  const addOption = async () => {
    const name = newOption.trim();
    if (!name) return;
    try { await createOption({ name, position: options.length }); setNewOption(''); }
    catch (err) { fail(err, 'Could not add the option'); }
  };

  const addValue = async (optionId) => {
    const value = (newValues[optionId] ?? '').trim();
    if (!value) return;
    const opt = options.find((o) => o.id === optionId);
    try {
      await createOptionValue(optionId, { value, position: opt?.values?.length ?? 0 });
      setNewValues((v) => ({ ...v, [optionId]: '' }));
    } catch (err) { fail(err, 'Could not add the value'); }
  };

  const saveRename = async () => {
    if (!renaming?.name.trim()) { setRenaming(null); return; }
    try { await updateOption(renaming.id, { name: renaming.name.trim() }); setRenaming(null); }
    catch (err) { fail(err, 'Could not rename the option'); }
  };

  const onEnter = (fn) => (e) => { if (e.key === 'Enter') { e.preventDefault(); fn(); } };

  return (
    <div>
      {options.length === 0 && (
        <p style={{ margin: '0 0 12px', fontSize: '0.8rem', color: colors.textMuted }}>
          No options. A product without options can still have one variant with its own units and prices.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {options.map((o) => (
          <div key={o.id} style={{ padding: 12, borderRadius: radius.lg, border: `1px solid ${colors.tint(0.12)}`, background: colors.tint(0.02) }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              {renaming?.id === o.id ? (
                <TextInput autoFocus value={renaming.name} style={{ maxWidth: 220, padding: '4px 8px' }}
                  onChange={(e) => setRenaming({ ...renaming, name: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Escape') setRenaming(null); else onEnter(saveRename)(e); }}
                  onBlur={saveRename} aria-label="Option name" />
              ) : (
                <button type="button" disabled={readOnly} onClick={() => setRenaming({ id: o.id, name: o.name })}
                  title={readOnly ? undefined : 'Rename'}
                  style={{ background: 'none', border: 'none', padding: 0, fontFamily: 'inherit', cursor: readOnly ? 'default' : 'text', fontSize: '0.85rem', fontWeight: 700, color: colors.text }}>
                  {o.name}
                </button>
              )}
              <span style={{ fontSize: '0.7rem', color: colors.textFaint }}>{o.values?.length ?? 0} value{o.values?.length === 1 ? '' : 's'}</span>
              {!readOnly && (
                <button type="button" aria-label={`Delete option ${o.name}`} style={{ ...btnIcon, marginLeft: 'auto' }}
                  onClick={() => ask({
                    title: `Delete ${o.name}?`, message: 'Its values go too. Variants using them may need their options set again.',
                    run: () => deleteOption(o.id), done: `${o.name} deleted`,
                  })}>
                  <Trash2 size={13} />
                </button>
              )}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              {(o.values ?? []).map((v) => (
                <span key={v.id} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 6px 4px 10px', borderRadius: radius.pill,
                  background: colors.surface, border: `1px solid ${colors.tint(0.18)}`, fontSize: '0.78rem', color: colors.textBody,
                }}>
                  {v.value}
                  {!readOnly && (
                    <button type="button" aria-label={`Remove ${v.value}`} onClick={() => deleteOptionValue(o.id, v.id).catch((err) => fail(err, 'Could not remove it'))}
                      style={{ display: 'inline-flex', background: 'none', border: 'none', cursor: 'pointer', color: colors.textFaint, padding: 2 }}>
                      <X size={11} />
                    </button>
                  )}
                </span>
              ))}
              {!readOnly && (
                <span style={{ display: 'inline-flex', gap: 4 }}>
                  <TextInput aria-label={`New ${o.name} value`} placeholder={`Add ${o.name.toLowerCase()}…`}
                    value={newValues[o.id] ?? ''} onChange={(e) => setNewValues((v) => ({ ...v, [o.id]: e.target.value }))}
                    onKeyDown={onEnter(() => addValue(o.id))} style={{ width: 150, padding: '4px 9px' }} />
                  <button type="button" aria-label="Add value" onClick={() => addValue(o.id)} style={{ ...btnIcon, background: colors.tint(0.07), color: colors.primary }}>
                    <Plus size={13} />
                  </button>
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {!readOnly && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <TextInput aria-label="New option name" placeholder="New option, e.g. Size" value={newOption}
            onChange={(e) => setNewOption(e.target.value)} onKeyDown={onEnter(addOption)} style={{ maxWidth: 260 }} />
          <button type="button" onClick={addOption} disabled={!newOption.trim() || actionLoading} style={{ ...btnGhost, opacity: newOption.trim() ? 1 : 0.5 }}>
            <Plus size={14} /> Add option
          </button>
        </div>
      )}
      {modal}
    </div>
  );
}
