import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import taxAPI from '../../../../_shared/api/tax';
import useAuthStore from '../../../../_shared/store/authStore';
import { canReadFinance, canWriteFinance } from '../../../../_shared/lib/roles';
import { colors, card, input, btnPrimary } from '../../../../_shared/theme/tokens';

/**
 * The taxes a product or service does not carry, e.g. bread on an account that carries excise.
 * Ticking a tax here makes the books skip it for this item (with a reason that stays on record).
 */
export default function TaxOptOutsPanel({ taxableType, taxableId, readOnly = false }) {
  const user = useAuthStore((s) => s.user);
  const canWrite = canWriteFinance(user) && !readOnly;
  const [types, setTypes] = useState([]);
  const [chosen, setChosen] = useState({});   // tax type id -> reason
  const [ready, setReady] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!canReadFinance(user) || !taxableId) return;
    Promise.all([taxAPI.getTypes({ active: true }), taxAPI.getOptOuts({ taxable_type: taxableType, taxable_id: taxableId })])
      .then(([t, o]) => {
        setTypes((t.tax_types ?? t.types ?? []).filter((x) => (x.application_method ?? 'added') !== 'withheld' && x.application_mode !== 'withheld'));
        setReady(o.ready !== false);
        setChosen(Object.fromEntries((o.opt_outs ?? []).map((r) => [r.tax_type_id, r.reason ?? ''])));
      })
      .catch(() => {});
  }, [taxableType, taxableId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!canReadFinance(user) || !ready || types.length === 0) return null;

  const save = async () => {
    setSaving(true);
    try {
      await taxAPI.syncOptOuts({ taxable_type: taxableType, taxable_id: taxableId, opt_outs: Object.entries(chosen).map(([id, reason]) => ({ tax_type_id: Number(id), reason: reason || null })) });
      toast.success('Saved');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ ...card, padding: 20, marginTop: 16 }}>
      <p style={{ margin: '0 0 4px', fontSize: '0.875rem', fontWeight: 700, color: colors.primaryDeep }}>Taxes this {taxableType} does not carry</p>
      <p style={{ margin: '0 0 12px', fontSize: '0.75rem', color: colors.textFaint, maxWidth: 520 }}>
        If its sales account carries a tax that does not apply to this {taxableType} (for example excise), tick it here. Give the reason; it stays on record.
      </p>
      <div style={{ display: 'grid', gap: 8 }}>
        {types.map((t) => {
          const on = t.id in chosen;
          return (
            <div key={t.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.82rem', color: colors.textBody, minWidth: 180 }}>
                <input type="checkbox" checked={on} disabled={!canWrite} style={{ accentColor: colors.primary }}
                  onChange={(e) => setChosen((c) => { const n = { ...c }; if (e.target.checked) n[t.id] = ''; else delete n[t.id]; return n; })} />
                {t.name} ({t.code})
              </label>
              {on && (
                <input aria-label={`Reason for ${t.name}`} style={{ ...input, flex: 1, minWidth: 200 }} maxLength={160} placeholder="Reason, e.g. not excisable" disabled={!canWrite}
                  value={chosen[t.id]} onChange={(e) => setChosen((c) => ({ ...c, [t.id]: e.target.value }))} />
              )}
            </div>
          );
        })}
      </div>
      {canWrite && <button type="button" onClick={save} disabled={saving} style={{ ...btnPrimary, marginTop: 14 }}>{saving ? 'Saving…' : 'Save'}</button>}
    </div>
  );
}
