import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, ShieldCheck, ShieldOff, Pin, X } from 'lucide-react';
import toast from 'react-hot-toast';
import useTaxStore from '../../../store/taxStore';
import useTaxCertificateStore from '../../../store/taxCertificateStore';
import useAuthStore from '../../../store/authStore';
import { canReadFinance, canWriteFinance } from '../../../lib/roles';
import { fieldErrors } from '../../../store/helpers/apiState';
import StatusBadge from '../../common/StatusBadge';
import {
  colors, card, input, focusRing, label as labelStyle, hint as hintStyle,
  btnPrimary, btnGhost, btnIcon, radius,
} from '../../../theme/tokens';

/**
 * Entity-level tax overrides for a product, service or customer.
 *
 * Three kinds of override (mirrors TaxService's reading of tax_applicability):
 *   - exempt_all  → no additive tax at all        (tax_rule_id = null, is_exempt = true)
 *   - exempt_rule → skip one rule                 (tax_rule_id = X,    is_exempt = true)
 *   - force_rule  → always apply one rule         (tax_rule_id = X,    is_exempt = false)
 *
 * Certificates can only be attached for customers (certificates belong to customers).
 *
 * @param {'product'|'service'|'customer'} taxableType
 * @param {number}  taxableId
 * @param {boolean} readOnly   force read-only (e.g. product "view" mode)
 */
const KINDS = [
  { id: 'exempt_all',  label: 'Exempt from all taxes',  icon: ShieldOff,  help: 'No additive tax (e.g. VAT) is charged on this.' },
  { id: 'exempt_rule', label: 'Exempt from one rule',   icon: ShieldCheck, help: 'Skip a single tax rule; other rules still apply.' },
  { id: 'force_rule',  label: 'Always apply a rule',    icon: Pin,         help: 'Apply this rule even if its module or region would not match.' },
];

const kindOf = (o) => (o.tax_rule_id == null ? 'exempt_all' : o.is_exempt ? 'exempt_rule' : 'force_rule');

export default function TaxOverridesPanel({ taxableType, taxableId, readOnly = false }) {
  const user = useAuthStore((s) => s.user);
  const canRead = canReadFinance(user);
  const canWrite = canWriteFinance(user) && !readOnly;

  const {
    rules, applicability, loading, actionLoading,
    fetchRules, fetchApplicability, createApplicability, deleteApplicability,
  } = useTaxStore();
  const { certificates, fetchForHolder } = useTaxCertificateStore();

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ kind: 'exempt_all', tax_rule_id: '', tax_legitimacy_certificate_id: '' });
  const [errors, setErrors] = useState({});

  const isCustomer = taxableType === 'customer';

  useEffect(() => {
    if (!canRead || !taxableId) return;
    fetchApplicability(taxableType, taxableId).catch(() => {});
    if (!rules.length) fetchRules({ active: true }).catch(() => {});
    if (isCustomer) fetchForHolder('customer', taxableId).catch(() => {});
  }, [taxableType, taxableId, canRead]); // eslint-disable-line react-hooks/exhaustive-deps

  const ruleName = useMemo(() => Object.fromEntries(rules.map((r) => [r.id, r.name])), [rules]);
  const exemptionCerts = certificates.filter((c) => c.certificate_type === 'exemption' && c.status === 'verified');

  const hasBlanket = applicability.some((o) => kindOf(o) === 'exempt_all');
  const usedRuleIds = new Set(applicability.filter((o) => o.tax_rule_id != null).map((o) => o.tax_rule_id));
  const selectableRules = rules.filter((r) => !usedRuleIds.has(r.id));

  if (!canRead) {
    return (
      <div style={{ ...card, padding: 20 }}>
        <p style={{ margin: 0, fontSize: '0.82rem', color: colors.textMuted }}>
          Tax overrides are managed by finance. Ask a finance, admin or super admin user to change them.
        </p>
      </div>
    );
  }

  const resetForm = () => {
    setForm({ kind: hasBlanket ? 'exempt_rule' : 'exempt_all', tax_rule_id: '', tax_legitimacy_certificate_id: '' });
    setErrors({});
  };

  const submit = async (e) => {
    e?.preventDefault();
    const needsRule = form.kind !== 'exempt_all';
    if (needsRule && !form.tax_rule_id) { setErrors({ tax_rule_id: 'Choose a tax rule.' }); return; }

    try {
      await createApplicability({
        taxable_type: taxableType,
        taxable_id: taxableId,
        tax_rule_id: needsRule ? Number(form.tax_rule_id) : null,
        is_exempt: form.kind !== 'force_rule',
        tax_legitimacy_certificate_id: isCustomer && form.tax_legitimacy_certificate_id
          ? Number(form.tax_legitimacy_certificate_id) : null,
      });
      // reload so the rule + certificate relations come back populated
      fetchApplicability(taxableType, taxableId).catch(() => {});
      toast.success('Tax override added');
      setAdding(false);
      resetForm();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(err.response?.data?.message || 'Could not add the override');
    }
  };

  const remove = async (o) => {
    if (!window.confirm('Remove this tax override? Normal tax rules will apply again.')) return;
    try {
      await deleteApplicability(o.id);
      toast.success('Tax override removed');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not remove the override');
    }
  };

  return (
    <div style={{ ...card, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <div>
          <p style={{ margin: '0 0 4px', fontSize: '0.875rem', fontWeight: 700, color: colors.primaryDeep }}>Tax overrides</p>
          <p style={{ margin: 0, fontSize: '0.75rem', color: colors.textFaint, maxWidth: 520 }}>
            By default, tax rules decide what is charged. Add an override only when this {taxableType} needs different treatment.
          </p>
        </div>
        {canWrite && !adding && (
          <button type="button" onClick={() => { resetForm(); setAdding(true); }} style={btnPrimary}>
            <Plus size={14} /> Add override
          </button>
        )}
      </div>

      {/* ── Existing overrides ── */}
      {loading.applicability ? (
        <div style={{ height: 56, borderRadius: radius.lg, background: colors.tint(0.06) }} />
      ) : applicability.length === 0 ? (
        <p style={{
          margin: 0, padding: '18px 16px', borderRadius: radius.lg, fontSize: '0.8rem',
          color: colors.textMuted, border: `1.5px dashed ${colors.tint(0.2)}`,
        }}>
          No overrides. Standard tax rules apply.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {applicability.map((o) => {
            const kind = KINDS.find((k) => k.id === kindOf(o));
            const Icon = kind.icon;
            const cert = o.certificate;
            return (
              <div key={o.id} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                borderRadius: radius.lg, border: `1px solid ${colors.tint(0.1)}`, background: colors.tint(0.02),
              }}>
                <Icon size={16} style={{ color: colors.primary, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 600, color: colors.text }}>
                    {kind.label}
                    {o.tax_rule_id != null && (
                      <span style={{ fontWeight: 500, color: colors.textBody }}>
                        : {o.tax_rule?.name ?? ruleName[o.tax_rule_id] ?? `Rule #${o.tax_rule_id}`}
                      </span>
                    )}
                  </p>
                  {cert && (
                    <p style={{ margin: '3px 0 0', fontSize: '0.72rem', color: colors.textMuted, display: 'flex', alignItems: 'center', gap: 6 }}>
                      Certificate {cert.certificate_number} <StatusBadge status={cert.status} />
                    </p>
                  )}
                </div>
                {canWrite && (
                  <button
                    type="button"
                    onClick={() => remove(o)}
                    disabled={actionLoading}
                    aria-label="Remove override"
                    style={btnIcon}
                    onMouseEnter={(e) => { e.currentTarget.style.background = colors.dangerBg; e.currentTarget.style.color = colors.danger; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = colors.textFaint; }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Add form ──
          A <div>, not a <form>: this panel is rendered inside ProductForm /
          ServiceForm, and nested <form>s are invalid (the inner submit would
          submit the product). */}
      {adding && (
        <div role="group" aria-label="New tax override" style={{
          marginTop: 16, padding: 16, borderRadius: radius.lg,
          border: `1.5px solid ${colors.tint(0.18)}`, background: colors.tint(0.02),
          display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700, color: colors.text }}>New override</p>
            <button type="button" onClick={() => setAdding(false)} aria-label="Cancel" style={btnIcon}><X size={14} /></button>
          </div>

          <div role="radiogroup" aria-label="Override type" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 }}>
            {KINDS.map((k) => {
              const disabled = k.id === 'exempt_all' && hasBlanket;
              const selected = form.kind === k.id;
              return (
                <button
                  key={k.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={disabled}
                  onClick={() => setForm((f) => ({ ...f, kind: k.id, tax_rule_id: '' }))}
                  style={{
                    textAlign: 'left', padding: '10px 12px', borderRadius: radius.lg, fontFamily: 'inherit',
                    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1,
                    border: `1.5px solid ${selected ? colors.primary : colors.tint(0.15)}`,
                    background: selected ? colors.tint(0.07) : colors.surface,
                  }}
                >
                  <span style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: selected ? colors.primaryDeep : colors.textBody }}>{k.label}</span>
                  <span style={{ display: 'block', marginTop: 3, fontSize: '0.7rem', color: colors.textFaint, lineHeight: 1.45 }}>
                    {disabled ? 'Already exempt from all taxes.' : k.help}
                  </span>
                </button>
              );
            })}
          </div>

          {form.kind !== 'exempt_all' && (
            <div>
              <label htmlFor="override-rule" style={labelStyle}>Tax rule</label>
              <select
                id="override-rule"
                value={form.tax_rule_id}
                onChange={(e) => setForm((f) => ({ ...f, tax_rule_id: e.target.value }))}
                style={{ ...input, cursor: 'pointer' }}
                {...focusRing}
              >
                <option value="">{loading.rules ? 'Loading rules…' : 'Choose a rule'}</option>
                {selectableRules.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}{r.tax_type?.code ? ` (${r.tax_type.code})` : ''}</option>
                ))}
              </select>
              {errors.tax_rule_id && <p style={{ ...hintStyle, color: colors.danger }}>{errors.tax_rule_id}</p>}
              {!loading.rules && !selectableRules.length && (
                <p style={hintStyle}>Every active rule already has an override here.</p>
              )}
            </div>
          )}

          {isCustomer && form.kind !== 'force_rule' && (
            <div>
              <label htmlFor="override-cert" style={labelStyle}>Supporting exemption certificate</label>
              <select
                id="override-cert"
                value={form.tax_legitimacy_certificate_id}
                onChange={(e) => setForm((f) => ({ ...f, tax_legitimacy_certificate_id: e.target.value }))}
                style={{ ...input, cursor: 'pointer' }}
                {...focusRing}
              >
                <option value="">No certificate (admin override)</option>
                {exemptionCerts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.certificate_number}{c.valid_until ? ` — valid until ${c.valid_until.slice(0, 10)}` : ''}
                  </option>
                ))}
              </select>
              <p style={hintStyle}>
                With a certificate attached, the exemption stops automatically when the certificate expires or is revoked.
              </p>
              {errors.tax_legitimacy_certificate_id && (
                <p style={{ ...hintStyle, color: colors.danger }}>{errors.tax_legitimacy_certificate_id}</p>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => setAdding(false)} style={btnGhost}>Cancel</button>
            <button type="button" onClick={submit} disabled={actionLoading} style={{ ...btnPrimary, opacity: actionLoading ? 0.6 : 1 }}>
              {actionLoading ? 'Adding…' : 'Add override'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
