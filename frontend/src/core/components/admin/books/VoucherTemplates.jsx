import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import booksAPI from '../../../../_shared/api/books';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import Modal from '../ui/Modal';
import { Field, TextInput, SelectInput, FormStack, FormError } from '../ui/Form';
import { openOnForm } from './voucherDrafts';
import { btnGhost, btnPrimary, colors } from '../../../../_shared/theme/tokens';

const REPEAT = { none: 'Does not repeat', weekly: 'Every week', monthly: 'Every month', quarterly: 'Every quarter', yearly: 'Every year' };
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const repeatText = (t) => (t.repeat_every === 'none' ? 'One-off' : `${REPEAT[t.repeat_every]}${t.repeat_day ? (t.repeat_every === 'weekly' ? `, ${DAYS[t.repeat_day - 1]}` : `, day ${t.repeat_day}`) : ''}${t.next_due_on ? ` · next ${t.next_due_on}` : ''}`);

/**
 * Voucher templates. On a form (form + typeId + getState + onUse given) it lists the templates for that form, puts one on it, and saves what is typed as a new one. From the Vouchers tab (no form)
 * it lists them all: open one on its form, make a draft now, delete, add the starter set.
 */
export default function VoucherTemplates({ form, typeId, getState, onUse, onClose, canWrite }) {
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [save, setSave] = useState({ name: '', category: '', repeat_every: 'none', repeat_day: '' });
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => booksAPI.voucherTemplates().then(setData).catch((e) => setErr(errMsg(e, 'Could not load the templates'))), []);
  useEffect(() => { load(); }, [load]);

  const here = (t) => !form || (t.form === form && (form !== 'voucher' || String(t.voucher_type_id) === String(typeId)));
  const list = (data?.templates ?? []).filter(here);

  const use = (t) => { if (form && onUse) { onUse(t.form_state ?? {}); onClose(); } else openOnForm(t, nav); };
  const run = async (fn, ok) => { setBusy(true); setErr(null); try { await fn(); if (ok) toast.success(ok); await load(); } catch (e) { setErr(errMsg(e, 'Could not do that')); } finally { setBusy(false); } };

  const saveCurrent = (e) => {
    e.preventDefault();
    if (!save.name.trim()) { setErr('Give the template a name.'); return; }
    run(() => booksAPI.saveVoucherTemplate({ name: save.name.trim(), category: save.category || null, form, voucher_type_id: form === 'voucher' ? Number(typeId) : null,
      form_state: getState(), repeat_every: save.repeat_every, repeat_day: save.repeat_every === 'none' ? null : Number(save.repeat_day) || null }), 'Template saved').then(() => setSave({ name: '', category: '', repeat_every: 'none', repeat_day: '' }));
  };

  return (
    <Modal title="Voucher templates" subtitle="A saved voucher you can use any time, or have repeat. A repeating one never posts: it leaves a draft in the inbox on the Vouchers tab for you to check and post." onClose={onClose}>
      <FormStack>
        <FormError message={err ?? (data && data.ready === false ? data.message : null)} />
        {data?.ready !== false && (
          <>
            {list.length === 0 && <p style={{ margin: 0, fontSize: '0.82rem', color: colors.textMuted }}>No templates{form ? ' for this voucher' : ''} yet.</p>}
            <div style={{ display: 'grid', gap: 6 }}>
              {list.map((t) => (
                <div key={t.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', border: `1px solid ${colors.tint(0.15)}`, borderRadius: 8, flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{t.name}{t.category && <span style={{ marginLeft: 8, fontSize: '0.68rem', color: colors.textFaint }}>{t.category}</span>}</div>
                    <div style={{ fontSize: '0.72rem', color: colors.textMuted }}>{repeatText(t)}</div>
                  </div>
                  <button type="button" style={{ ...btnPrimary, padding: '4px 12px', fontSize: '0.75rem' }} onClick={() => use(t)}>{form ? 'Use' : 'Open'}</button>
                  {!form && canWrite && t.repeat_every !== 'none' && <button type="button" style={{ ...btnGhost, padding: '4px 10px', fontSize: '0.72rem' }} disabled={busy} onClick={() => run(() => booksAPI.templateDraftNow(t.id), 'A draft is in the inbox')}>Draft now</button>}
                  {canWrite && <button type="button" style={{ ...btnGhost, padding: '4px 10px', fontSize: '0.72rem', color: colors.danger }} disabled={busy} onClick={() => confirm(`Delete the template “${t.name}”?`) && run(() => booksAPI.deleteVoucherTemplate(t.id), 'Template deleted')}>Delete</button>}
                </div>
              ))}
            </div>
            {canWrite && (!form || form === 'voucher') && !(data?.templates ?? []).some((t) => t.is_starter) && (
              <button type="button" style={{ ...btnGhost, alignSelf: 'flex-start' }} disabled={busy} onClick={() => run(() => booksAPI.addTemplateStarters(), 'Starter templates added')}>Add the starter templates (rent, electricity, water, deposits…)</button>
            )}
            {form && canWrite && getState && (
              <form onSubmit={saveCurrent} style={{ borderTop: `1px solid ${colors.tint(0.12)}`, paddingTop: 12, display: 'grid', gap: 8 }}>
                <strong style={{ fontSize: '0.82rem' }}>Save what is on the form as a template</strong>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 8 }}>
                  <Field label="Name"><TextInput value={save.name} onChange={(e) => setSave((s) => ({ ...s, name: e.target.value }))} /></Field>
                  <Field label="Group (optional)"><TextInput value={save.category} onChange={(e) => setSave((s) => ({ ...s, category: e.target.value }))} placeholder="Premises, Staff…" /></Field>
                  <Field label="Repeat">
                    <SelectInput value={save.repeat_every} onChange={(e) => setSave((s) => ({ ...s, repeat_every: e.target.value, repeat_day: '' }))}>
                      {Object.entries(REPEAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </SelectInput>
                  </Field>
                  {save.repeat_every !== 'none' && (
                    <Field label={save.repeat_every === 'weekly' ? 'On' : 'On day of the month'}>
                      {save.repeat_every === 'weekly'
                        ? <SelectInput value={save.repeat_day} onChange={(e) => setSave((s) => ({ ...s, repeat_day: e.target.value }))}><option value="">Monday</option>{DAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</SelectInput>
                        : <TextInput type="number" min="1" max="31" value={save.repeat_day} onChange={(e) => setSave((s) => ({ ...s, repeat_day: e.target.value }))} placeholder="1 to 31" />}
                    </Field>
                  )}
                </div>
                <button type="submit" style={{ ...btnPrimary, alignSelf: 'flex-start' }} disabled={busy}>Save template</button>
              </form>
            )}
          </>
        )}
      </FormStack>
    </Modal>
  );
}
