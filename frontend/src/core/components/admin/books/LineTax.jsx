import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import booksAPI from '../../../../_shared/api/books';
import { loadTaxRates } from './taxRates';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import Modal from '../ui/Modal';
import { Field, SelectInput, FormStack, ModalActions, FormError } from '../ui/Form';
import { btnGhost, colors } from '../../../../_shared/theme/tokens';

const NATURE = { taxable: 'VAT-able', zero_rated: 'Zero-rated', exempt: 'Exempt', out_of_scope: 'Out of scope' };

/** Can this ledger's tax be set from here? Sales, purchase and charge accounts, the optional ones (expense, asset, income) and delivery ledgers can; the rest cannot carry a tax. */
const canSetTax = (l) => ['sales', 'purchase', 'charge', 'optional'].includes(l?.tax_behaviour) || l?.group?.behaviour === 'delivery';

/** What the ledger is set to, in words. */
function configured(l, rates) {
  if (l.group?.behaviour === 'delivery') {
    const r = rates.find((x) => String(x.id) === String(l.settings?.tax_rate_id));
    return r ? `${r.name} (${Number(r.rate_value)}%)` : 'No tax';
  }
  if (l.tax_nature === 'taxable' || l.tax_nature === 'zero_rated') return l.tax_rate_ledger ? `${l.tax_rate_ledger.name} (${Number(l.tax_rate_ledger.rate_value)}%)` : NATURE[l.tax_nature];
  return NATURE[l.tax_nature] ?? 'No tax set';
}

/** A short ledger edit that only has the tax in it. */
function TaxModal({ ledger, rates, onClose, onSaved }) {
  const delivery = ledger.group?.behaviour === 'delivery';
  const required = ['sales', 'purchase', 'charge'].includes(ledger.tax_behaviour);
  const current = delivery ? (ledger.settings?.tax_rate_id ? `rate:${ledger.settings.tax_rate_id}` : '')
    : (ledger.tax_nature === 'taxable' || ledger.tax_nature === 'zero_rated') && ledger.tax_rate_ledger_id ? `rate:${ledger.tax_rate_ledger_id}` : (ledger.tax_nature || '');
  const [choice, setChoice] = useState(current);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const groups = rates.reduce((m, r) => { const k = r.tax_type?.name || r.tax_type?.code || 'Tax rates'; (m[k] = m[k] || []).push(r); return m; }, {});

  const save = async (e) => {
    e.preventDefault();
    if (required && !choice) { setErr('Choose the tax for this account.'); return; }
    setBusy(true); setErr(null);
    try {
      let body;
      if (delivery) {
        body = { settings: { tax_rate_id: choice.startsWith('rate:') ? Number(choice.slice(5)) : null } };
      } else if (choice.startsWith('rate:')) {
        const r = rates.find((x) => String(x.id) === choice.slice(5));
        body = { tax_nature: Number(r?.rate_value) === 0 ? 'zero_rated' : 'taxable', tax_rate_ledger_id: Number(choice.slice(5)), taxes: [{ tax_type_id: r?.tax_type?.id ?? null, tax_rate_id: Number(choice.slice(5)), treatment: Number(r?.rate_value) === 0 ? 'zero_rated' : 'applies' }] };
      } else if (choice) {
        body = { tax_nature: choice, tax_rate_ledger_id: null, taxes: [{ tax_type_id: null, tax_rate_id: null, treatment: choice }] };
      } else {
        body = { tax_nature: null, tax_rate_ledger_id: null, taxes: [] };
      }
      await booksAPI.updateLedger(ledger.id, body);
      toast.success(`Tax on ${ledger.name} saved`);
      onSaved();
    } catch (x) { setErr(errMsg(x, 'Could not save the tax')); } finally { setBusy(false); }
  };

  return (
    <Modal title={`Tax on ${ledger.name}`} subtitle="Only the tax is changed here. It applies to every line posted to this ledger from now on." onClose={onClose}>
      <form onSubmit={save}>
        <FormStack>
          <FormError message={err} />
          <Field label={delivery ? 'Tax on delivery' : required ? 'Tax on this account *' : 'Tax on this account (optional)'}>
            <SelectInput value={choice} onChange={(e) => setChoice(e.target.value)}>
              <option value="">{required ? 'Choose the tax…' : 'No tax'}</option>
              {Object.entries(groups).map(([tt, rs]) => (
                <optgroup key={tt} label={tt}>{rs.map((r) => <option key={r.id} value={`rate:${r.id}`}>{r.name} ({Number(r.rate_value)}%)</option>)}</optgroup>
              ))}
              {!delivery && <optgroup label="No tax charged"><option value="exempt">Exempt</option><option value="out_of_scope">Out of scope</option></optgroup>}
            </SelectInput>
          </Field>
          <ModalActions onCancel={onClose} busy={busy} submitLabel="Save tax" />
        </FormStack>
      </form>
    </Modal>
  );
}

/**
 * Under a ledger line: the tax that applies to it (what the preview worked out, else what the ledger is set to) and a button to change the ledger's tax.
 * line: the previewed line (its taxes), or undefined before there is a preview. onSaved: the ledger was changed, so reload the ledgers and work the voucher out again.
 */
export default function LineTax({ ledger, line, onSaved }) {
  const [rates, setRates] = useState([]);
  const [open, setOpen] = useState(false);
  useEffect(() => { let live = true; loadTaxRates().then((r) => { if (live) setRates(r); }); return () => { live = false; }; }, []);
  if (!ledger) return null;
  const applied = line?.taxes?.length ? line.taxes.map((t) => `${t.label} ${Number(t.tax_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`).join(' · ') : null;
  const text = applied ?? (line ? 'No tax applied' : configured(ledger, rates));
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 4, fontSize: '0.72rem', color: colors.textMuted }}>
      <span>Tax: <strong style={{ color: colors.text, fontWeight: 600 }}>{text}</strong></span>
      {canSetTax(ledger) && <button type="button" onClick={() => setOpen(true)} style={{ ...btnGhost, padding: '2px 8px', fontSize: '0.7rem' }}>Change tax</button>}
      {open && <TaxModal ledger={ledger} rates={rates} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); onSaved?.(); }} />}
    </div>
  );
}
