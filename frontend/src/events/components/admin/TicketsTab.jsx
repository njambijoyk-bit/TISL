import { Plus, Trash2 } from 'lucide-react';
import { CheckboxRow, Field, FormGrid, NumberInput, TextArea, TextInput } from '../../../core/components/admin/ui/Form';
import CurrencySelect from '../../../_shared/components/common/currency/CurrencySelect';
import SalesAccountSelect from '../../../core/components/admin/tax/SalesAccountSelect';
import { btnGhost, card, colors } from '../../../_shared/theme/tokens';
import { blankType } from '../../lib/eventForm';
import { whenText } from '../../lib/eventFormat';

const pill = (text, tone = colors.neutralText, bg = colors.neutralBg) => <span style={{ padding: '2px 9px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 700, color: tone, background: bg }}>{text}</span>;

/** The ticket types: a price, how many there are, when they are on sale and which dates they admit to. Price 0 is a free ticket (an RSVP). */
export default function TicketsTab({ event, onEvent, types, onTypes, sessions, readOnly = false }) {
  const edit = (key, patch) => onTypes(types.map((t) => (t.key === key ? { ...t, ...patch } : t)));
  const paid = types.some((t) => Number(t.price) > 0);
  const several = sessions.length > 1;

  const toggleDate = (t, key) => edit(t.key, { session_keys: t.session_keys.includes(key) ? t.session_keys.filter((k) => k !== key) : [...t.session_keys, key] });

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textMuted }}>
        Each kind of ticket has its own price and number. Make one for General, one for VIP, one for Early bird. A price of 0 is a free ticket: people give their name and get a ticket without paying.
      </p>

      {paid && (
        <div style={{ ...card, padding: 14 }}>
          <FormGrid min={240}>
            <Field label="Sold in" htmlFor="ev-cur" hint="The currency the prices above are in.">
              <CurrencySelect id="ev-cur" value={event.currency_id} onChange={(v) => onEvent({ currency_id: v })} disabled={readOnly} />
            </Field>
            <SalesAccountSelect kind="sales" scope="service" label="Income account" value={event.sales_ledger_id} disabled={readOnly}
              onChange={(v) => onEvent({ sales_ledger_id: v })} hint="Leave empty to use the one in Events → Settings. The account decides the tax." />
          </FormGrid>
        </div>
      )}

      {types.length === 0 && <p style={{ ...card, padding: 16, margin: 0, fontSize: '0.82rem', color: colors.textMuted }}>No tickets yet. An event needs at least one to be put on sale.</p>}

      {types.map((t, i) => (
        <div key={t.key} style={{ ...card, padding: 14, display: 'grid', gap: 10, opacity: t.is_active ? 1 : 0.7 }}>
          <FormGrid min={150}>
            <Field label="Name" htmlFor={`t-na-${t.key}`}><TextInput id={`t-na-${t.key}`} value={t.name} maxLength={120} placeholder="General, VIP, Early bird…" disabled={readOnly} onChange={(e) => edit(t.key, { name: e.target.value })} /></Field>
            <Field label="Price" htmlFor={`t-pr-${t.key}`} hint="0 is free."><NumberInput id={`t-pr-${t.key}`} min={0} step="0.01" value={t.price} placeholder="0" disabled={readOnly} onChange={(e) => edit(t.key, { price: e.target.value })} /></Field>
            <Field label="How many" htmlFor={`t-ca-${t.key}`} hint="Empty is no limit."><NumberInput id={`t-ca-${t.key}`} min={1} value={t.capacity} placeholder="No limit" disabled={readOnly} onChange={(e) => edit(t.key, { capacity: e.target.value })} /></Field>
            <Field label="Least per order" htmlFor={`t-mi-${t.key}`}><NumberInput id={`t-mi-${t.key}`} min={1} value={t.min_per_order} disabled={readOnly} onChange={(e) => edit(t.key, { min_per_order: e.target.value })} /></Field>
            <Field label="Most per order" htmlFor={`t-mx-${t.key}`}><NumberInput id={`t-mx-${t.key}`} min={1} value={t.max_per_order} placeholder="Event's limit" disabled={readOnly} onChange={(e) => edit(t.key, { max_per_order: e.target.value })} /></Field>
          </FormGrid>
          <FormGrid min={200}>
            <Field label="On sale from" htmlFor={`t-sf-${t.key}`} hint="Empty is straight away."><TextInput id={`t-sf-${t.key}`} type="datetime-local" value={t.sale_starts_at} disabled={readOnly} onChange={(e) => edit(t.key, { sale_starts_at: e.target.value })} /></Field>
            <Field label="On sale until" htmlFor={`t-su-${t.key}`} hint="Empty is until the event is over."><TextInput id={`t-su-${t.key}`} type="datetime-local" value={t.sale_ends_at} disabled={readOnly} onChange={(e) => edit(t.key, { sale_ends_at: e.target.value })} /></Field>
          </FormGrid>
          <Field label="Description (optional)" htmlFor={`t-de-${t.key}`}><TextArea id={`t-de-${t.key}`} rows={2} maxLength={500} value={t.description} placeholder="What this ticket includes" disabled={readOnly} onChange={(e) => edit(t.key, { description: e.target.value })} /></Field>

          {several && (
            <Field label="Gets in on">
              <CheckboxRow checked={t.session_keys.length === 0} disabled={readOnly} onChange={(v) => v && edit(t.key, { session_keys: [] })} label="Every date" description="A full pass. Tick specific dates below for a day pass." />
              <div style={{ display: 'grid', gap: 6, marginTop: 8, paddingLeft: 4 }}>
                {sessions.map((s) => (
                  <CheckboxRow key={s.key} checked={t.session_keys.includes(s.key)} disabled={readOnly} onChange={() => toggleDate(t, s.key)} label={`${whenText(s.starts_at)}${s.label ? ` · ${s.label}` : ''}`} />
                ))}
              </div>
            </Field>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <CheckboxRow checked={t.is_active} disabled={readOnly} onChange={(v) => edit(t.key, { is_active: v })} label="On sale" description="Switch off to stop selling it without deleting it." />
              {t.id && (
                <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                  {pill(`${t.sold} sold`, colors.successText, colors.successBg)}
                  {t.taken > t.sold && pill(`${t.taken - t.sold} being bought`, colors.warningText, colors.warningBg)}
                  {t.remaining !== null && pill(t.remaining > 0 ? `${t.remaining} left` : 'Sold out', t.remaining > 0 ? colors.neutralText : colors.dangerText, t.remaining > 0 ? colors.neutralBg : colors.dangerBg)}
                </span>
              )}
            </div>
            {!readOnly && <button type="button" style={{ ...btnGhost, color: colors.danger, padding: '5px 10px', fontSize: '0.76rem' }} onClick={() => onTypes(types.filter((x) => x.key !== t.key))} aria-label={`Remove ticket ${i + 1}`}><Trash2 size={13} /> Remove</button>}
          </div>
        </div>
      ))}
      {!readOnly && <div><button type="button" style={btnGhost} onClick={() => onTypes([...types, blankType({ name: types.length ? '' : 'General' })])}><Plus size={14} /> Add a ticket</button></div>}
    </div>
  );
}
