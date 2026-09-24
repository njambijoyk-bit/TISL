import React, { useState, useEffect } from 'react';
import vaultAPI from '../../../../api/vault';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const TARGET_TYPES = [
  { value: 'folder',   label: 'Folder' },
  { value: 'document', label: 'Document' },
  { value: 'global',   label: 'Global (all items)' },
];

const EFFECTS = [
  { value: 'allow', label: 'Allow' },
  { value: 'deny',  label: 'Deny' },
];

const ATTRIBUTE_SOURCES = [
  { value: 'user',     label: 'User' },
  { value: 'document', label: 'Document' },
  { value: 'folder',   label: 'Folder' },
  { value: 'request',  label: 'Request' },
];

const OPERATORS = [
  { value: 'equals',          label: 'equals' },
  { value: 'not_equals',      label: 'not equals' },
  { value: 'contains',        label: 'contains' },
  { value: 'not_contains',    label: 'not contains' },
  { value: 'in',              label: 'in list' },
  { value: 'not_in',          label: 'not in list' },
  { value: 'greater_than',    label: 'greater than' },
  { value: 'less_than',       label: 'less than' },
];

const ATTRIBUTE_KEYS = {
  user:     ['role', 'department', 'id', 'email', 'is_active', '2fa_enabled'],
  document: ['sensitivity_level', 'document_type', 'is_locked', 'tags'],
  folder:   ['sensitivity_level', 'folder_type', 'is_locked'],
  request:  ['ip_address', 'time_of_day', 'day_of_week'],
};

const ASSIGNEE_TYPES = [
  { value: 'everyone',   label: 'Everyone' },
  { value: 'role',       label: 'Role' },
  { value: 'department', label: 'Department' },
  { value: 'user',       label: 'Specific user' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Icons
// ─────────────────────────────────────────────────────────────────────────────
const Icons = {
  close: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  ),
  plus: (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  trash: (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M2 3.5h9M5 3.5V2h3v1.5M5.5 6v3.5M7.5 6v3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M3 3.5l.7 7.2a.8.8 0 00.8.8h5a.8.8 0 00.8-.8L11 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  shield: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 1.5L2 4V8.5C2 11.5 4.5 14 8 15c3.5-1 6-3.5 6-6.5V4L8 1.5z" fill="currentColor" opacity=".2" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      <path d="M5.5 8l2 2 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  check: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 7l4 4 6-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  spinner: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="vault-modal__spinner">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.8" strokeDasharray="16 24" opacity=".6"/>
    </svg>
  ),
  chevronRight: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function makeCondition() {
  return {
    _id: Math.random().toString(36).slice(2),
    attribute_source: 'user',
    attribute_key: 'role',
    operator: 'equals',
    attribute_value: [''],
  };
}

function makeAssignment() {
  return {
    _id: Math.random().toString(36).slice(2),
    assignee_type: 'everyone',
    assignee_value: '',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step indicator
// ─────────────────────────────────────────────────────────────────────────────
function StepIndicator({ step }) {
  const steps = ['Details', 'Conditions', 'Assignments'];
  return (
    <div className="vault-policy__steps">
      {steps.map((label, i) => {
        const num = i + 1;
        const done = step > num;
        const active = step === num;
        return (
          <React.Fragment key={label}>
            <div className={`vault-policy__step ${active ? 'vault-policy__step--active' : ''} ${done ? 'vault-policy__step--done' : ''}`}>
              <span className="vault-policy__step-num">
                {done ? Icons.check : num}
              </span>
              <span className="vault-policy__step-label">{label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={`vault-policy__step-line ${done ? 'vault-policy__step-line--done' : ''}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 — Details
// ─────────────────────────────────────────────────────────────────────────────
function StepDetails({ form, setForm }) {
  return (
    <div className="vault-policy__step-body">
      <div className="vault-modal__field">
        <label className="vault-modal__label">Policy name <span className="vault-modal__required">*</span></label>
        <input
          type="text"
          className="vault-modal__input"
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          placeholder="e.g. Restrict confidential to Finance"
          autoFocus
          maxLength={255}
        />
      </div>

      <div className="vault-modal__field">
        <label className="vault-modal__label">Description</label>
        <textarea
          className="vault-modal__textarea"
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          placeholder="What does this policy do?"
          rows={2}
        />
      </div>

      <div className="vault-modal__row">
        <div className="vault-modal__field vault-modal__field--half">
          <label className="vault-modal__label">Target type <span className="vault-modal__required">*</span></label>
          <select
            className="vault-modal__select"
            value={form.target_type}
            onChange={e => setForm(f => ({ ...f, target_type: e.target.value }))}
          >
            {TARGET_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <div className="vault-modal__field vault-modal__field--half">
          <label className="vault-modal__label">Effect <span className="vault-modal__required">*</span></label>
          <select
            className="vault-modal__select"
            value={form.effect}
            onChange={e => setForm(f => ({ ...f, effect: e.target.value }))}
          >
            {EFFECTS.map(e => (
              <option key={e.value} value={e.value}>{e.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="vault-modal__row">
        <div className="vault-modal__field vault-modal__field--half">
          <label className="vault-modal__label">Priority</label>
          <input
            type="number"
            className="vault-modal__input"
            value={form.priority}
            onChange={e => setForm(f => ({ ...f, priority: Number(e.target.value) }))}
            min={0}
            max={999}
            placeholder="0"
          />
          <span className="vault-modal__hint-text">Higher = evaluated first</span>
        </div>

        <div className="vault-modal__field vault-modal__field--half">
          <label className="vault-modal__label">Status</label>
          <label className="vault-modal__checkbox" style={{ marginTop: 6 }}>
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
            />
            <span>Active immediately</span>
          </label>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 — Conditions
// ─────────────────────────────────────────────────────────────────────────────
function ConditionRow({ condition, onChange, onRemove, index }) {
  const keys = ATTRIBUTE_KEYS[condition.attribute_source] ?? [];

  const handleSourceChange = (source) => {
    const newKeys = ATTRIBUTE_KEYS[source] ?? [];
    onChange({ ...condition, attribute_source: source, attribute_key: newKeys[0] ?? '' });
  };

  const handleValueChange = (idx, val) => {
    const next = [...condition.attribute_value];
    next[idx] = val;
    onChange({ ...condition, attribute_value: next });
  };

  const addValue = () => onChange({ ...condition, attribute_value: [...condition.attribute_value, ''] });
  const removeValue = (idx) => onChange({ ...condition, attribute_value: condition.attribute_value.filter((_, i) => i !== idx) });

  return (
    <div className="vault-policy__condition">
      <div className="vault-policy__condition-header">
        <span className="vault-policy__condition-num">#{index + 1}</span>
        <button
          type="button"
          className="vault-policy__remove-btn"
          onClick={onRemove}
          aria-label="Remove condition"
        >
          {Icons.trash}
        </button>
      </div>

      <div className="vault-policy__condition-row">
        <select
          className="vault-modal__select vault-policy__select--sm"
          value={condition.attribute_source}
          onChange={e => handleSourceChange(e.target.value)}
        >
          {ATTRIBUTE_SOURCES.map(s => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        <select
          className="vault-modal__select vault-policy__select--sm"
          value={condition.attribute_key}
          onChange={e => onChange({ ...condition, attribute_key: e.target.value })}
        >
          {keys.map(k => (
            <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>
          ))}
        </select>

        <select
          className="vault-modal__select vault-policy__select--sm"
          value={condition.operator}
          onChange={e => onChange({ ...condition, operator: e.target.value })}
        >
          {OPERATORS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Values */}
      <div className="vault-policy__values">
        {condition.attribute_value.map((val, idx) => (
          <div key={idx} className="vault-policy__value-row">
            <input
              type="text"
              className="vault-modal__input vault-policy__value-input"
              value={val}
              onChange={e => handleValueChange(idx, e.target.value)}
              placeholder="value"
            />
            {condition.attribute_value.length > 1 && (
              <button
                type="button"
                className="vault-policy__remove-btn vault-policy__remove-btn--sm"
                onClick={() => removeValue(idx)}
                aria-label="Remove value"
              >
                {Icons.trash}
              </button>
            )}
          </div>
        ))}
        {['in', 'not_in'].includes(condition.operator) && (
          <button type="button" className="vault-policy__add-value-btn" onClick={addValue}>
            {Icons.plus} Add value
          </button>
        )}
      </div>
    </div>
  );
}

function StepConditions({ conditions, setConditions }) {
  const add = () => setConditions(c => [...c, makeCondition()]);
  const update = (id, updated) => setConditions(c => c.map(x => x._id === id ? updated : x));
  const remove = (id) => setConditions(c => c.filter(x => x._id !== id));

  return (
    <div className="vault-policy__step-body">
      <p className="vault-policy__step-desc">
        Define when this policy applies. All conditions must match (AND logic).
        Leave empty to apply unconditionally.
      </p>

      {conditions.map((cond, i) => (
        <ConditionRow
          key={cond._id}
          condition={cond}
          index={i}
          onChange={updated => update(cond._id, updated)}
          onRemove={() => remove(cond._id)}
        />
      ))}

      <button type="button" className="vault-policy__add-btn" onClick={add}>
        {Icons.plus}
        Add condition
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 — Assignments
// ─────────────────────────────────────────────────────────────────────────────
function AssignmentRow({ assignment, onChange, onRemove, index }) {
  const needsValue = assignment.assignee_type !== 'everyone';

  return (
    <div className="vault-policy__condition">
      <div className="vault-policy__condition-header">
        <span className="vault-policy__condition-num">#{index + 1}</span>
        <button
          type="button"
          className="vault-policy__remove-btn"
          onClick={onRemove}
          aria-label="Remove assignment"
        >
          {Icons.trash}
        </button>
      </div>

      <div className="vault-policy__condition-row">
        <select
          className="vault-modal__select vault-policy__select--sm"
          value={assignment.assignee_type}
          onChange={e => onChange({ ...assignment, assignee_type: e.target.value, assignee_value: '' })}
        >
          {ASSIGNEE_TYPES.map(a => (
            <option key={a.value} value={a.value}>{a.label}</option>
          ))}
        </select>

        {needsValue && (
          <input
            type="text"
            className="vault-modal__input vault-policy__select--sm"
            value={assignment.assignee_value}
            onChange={e => onChange({ ...assignment, assignee_value: e.target.value })}
            placeholder={
              assignment.assignee_type === 'role'       ? 'e.g. admin, finance' :
              assignment.assignee_type === 'department' ? 'e.g. HR, Legal' :
              'User ID or email'
            }
          />
        )}
      </div>
    </div>
  );
}

function StepAssignments({ assignments, setAssignments }) {
  const add = () => setAssignments(a => [...a, makeAssignment()]);
  const update = (id, updated) => setAssignments(a => a.map(x => x._id === id ? updated : x));
  const remove = (id) => setAssignments(a => a.filter(x => x._id !== id));

  return (
    <div className="vault-policy__step-body">
      <p className="vault-policy__step-desc">
        Who does this policy apply to? Add at least one assignment.
      </p>

      {assignments.map((a, i) => (
        <AssignmentRow
          key={a._id}
          assignment={a}
          index={i}
          onChange={updated => update(a._id, updated)}
          onRemove={() => remove(a._id)}
        />
      ))}

      <button type="button" className="vault-policy__add-btn" onClick={add}>
        {Icons.plus}
        Add assignment
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PolicyBuilderModal
// ─────────────────────────────────────────────────────────────────────────────
export default function PolicyBuilderModal({ policy = null, onClose, onSave }) {
  const isEdit = !!policy;

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [form, setForm] = useState({
    name:        policy?.name        ?? '',
    description: policy?.description ?? '',
    target_type: policy?.target_type ?? 'folder',
    effect:      policy?.effect      ?? 'allow',
    priority:    policy?.priority    ?? 0,
    is_active:   policy?.is_active   ?? true,
  });

  const [conditions, setConditions] = useState(
    policy?.conditions?.map(c => ({ ...c, _id: Math.random().toString(36).slice(2) })) ?? []
  );

  const [assignments, setAssignments] = useState(
    policy?.assignments?.map(a => ({ ...a, _id: Math.random().toString(36).slice(2) })) ?? [makeAssignment()]
  );

  // Close on Escape
  useEffect(() => {
    function handleKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const canNext = () => {
    if (step === 1) return form.name.trim().length > 0;
    if (step === 2) return true; // conditions optional
    if (step === 3) return assignments.length > 0;
    return false;
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);

    try {
      const payload = {
        ...form,
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        conditions: conditions.map(({ _id, ...c }) => ({
          ...c,
          attribute_value: c.attribute_value.filter(Boolean),
        })),
        assignments: assignments.map(({ _id, ...a }) => ({
          ...a,
          assignee_value: a.assignee_value || undefined,
        })),
      };

      if (isEdit) {
        await vaultAPI.updatePolicy(policy.id, payload);
      } else {
        await vaultAPI.createPolicy(payload);
      }

      onSave();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save policy.');
      setLoading(false);
    }
  };

  const stepTitles = ['Policy details', 'Conditions', 'Assignments'];

  return (
    <div className="vault-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Policy builder">
      <div className="vault-modal vault-modal--policy" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="vault-modal__header">
          <div className="vault-modal__header-left">
            <span className="vault-modal__header-icon">{Icons.shield}</span>
            <h3 className="vault-modal__title">
              {isEdit ? 'Edit policy' : 'New policy'} — {stepTitles[step - 1]}
            </h3>
          </div>
          <button className="vault-modal__close" onClick={onClose} aria-label="Close">
            {Icons.close}
          </button>
        </div>

        {/* Step indicator */}
        <div className="vault-policy__steps-wrap">
          <StepIndicator step={step} />
        </div>

        {/* Body */}
        <div className="vault-modal__body vault-modal__body--policy">
          {step === 1 && <StepDetails form={form} setForm={setForm} />}
          {step === 2 && <StepConditions conditions={conditions} setConditions={setConditions} />}
          {step === 3 && <StepAssignments assignments={assignments} setAssignments={setAssignments} />}

          {error && <div className="vault-modal__error" style={{ marginTop: 8 }}>{error}</div>}
        </div>

        {/* Footer */}
        <div className="vault-modal__footer">
          {step > 1 && (
            <button
              type="button"
              className="vault-modal__btn vault-modal__btn--ghost"
              onClick={() => setStep(s => s - 1)}
              disabled={loading}
            >
              Back
            </button>
          )}
          <button
            type="button"
            className="vault-modal__btn vault-modal__btn--ghost"
            onClick={onClose}
            disabled={loading}
            style={{ marginRight: 'auto' }}
          >
            Cancel
          </button>

          {step < 3 ? (
            <button
              type="button"
              className="vault-modal__btn vault-modal__btn--primary"
              onClick={() => setStep(s => s + 1)}
              disabled={!canNext()}
            >
              Next
              {Icons.chevronRight}
            </button>
          ) : (
            <button
              type="button"
              className="vault-modal__btn vault-modal__btn--primary"
              onClick={handleSubmit}
              disabled={loading || !canNext()}
            >
              {loading ? (
                <>{Icons.spinner} Saving…</>
              ) : (
                <>{Icons.check} {isEdit ? 'Save changes' : 'Create policy'}</>
              )}
            </button>
          )}
        </div>
      </div>

      <style>{styles}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
const styles = `
  .vault-modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: rgba(0,0,0,0.35);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    animation: vault-modal-fade-in 120ms ease;
  }

  @keyframes vault-modal-fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  .vault-modal {
    background: var(--D-surface, #ffffff);
    border-radius: var(--D-radius, 8px);
    border: 1px solid var(--D-border, #e9ecef);
    box-shadow: 0 12px 40px rgba(0,0,0,0.15);
    width: 100%;
    max-width: 420px;
    max-height: 90vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    animation: vault-modal-slide-in 180ms ease;
  }

  .vault-modal--policy {
    max-width: 500px;
  }

  @keyframes vault-modal-slide-in {
    from { opacity: 0; transform: translateY(-8px) scale(0.98); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }

  .vault-modal__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid var(--D-border, #e9ecef);
    flex-shrink: 0;
  }

  .vault-modal__header-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .vault-modal__header-icon {
    display: flex;
    align-items: center;
    color: var(--D-accent, #2563eb);
  }

  .vault-modal__title {
    font-size: 14px;
    font-weight: 600;
    color: var(--D-text-primary, #1a1a2e);
    margin: 0;
  }

  .vault-modal__close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    background: transparent;
    border-radius: 5px;
    color: var(--D-text-secondary, #6c757d);
    cursor: pointer;
    transition: background 100ms, color 100ms;
  }

  .vault-modal__close:hover {
    background: var(--D-hover, #f1f3f5);
    color: var(--D-text-primary, #1a1a2e);
  }

  /* ── Step indicator ─────────────────────────────────────────────────────── */
  .vault-policy__steps-wrap {
    padding: 12px 16px;
    border-bottom: 1px solid var(--D-border, #e9ecef);
    flex-shrink: 0;
  }

  .vault-policy__steps {
    display: flex;
    align-items: center;
    gap: 0;
  }

  .vault-policy__step {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .vault-policy__step-num {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    font-size: 11px;
    font-weight: 700;
    background: var(--D-hover, #f1f3f5);
    color: var(--D-text-muted, #adb5bd);
    border: 1.5px solid var(--D-border, #e9ecef);
    transition: all 150ms;
  }

  .vault-policy__step--active .vault-policy__step-num {
    background: var(--D-accent, #2563eb);
    color: #fff;
    border-color: var(--D-accent, #2563eb);
  }

  .vault-policy__step--done .vault-policy__step-num {
    background: var(--D-accent-soft, #e7f0ff);
    color: var(--D-accent, #2563eb);
    border-color: var(--D-accent, #2563eb);
  }

  .vault-policy__step-label {
    font-size: 12px;
    font-weight: 500;
    color: var(--D-text-muted, #adb5bd);
  }

  .vault-policy__step--active .vault-policy__step-label {
    color: var(--D-text-primary, #1a1a2e);
    font-weight: 600;
  }

  .vault-policy__step--done .vault-policy__step-label {
    color: var(--D-accent, #2563eb);
  }

  .vault-policy__step-line {
    flex: 1;
    height: 1.5px;
    background: var(--D-border, #e9ecef);
    margin: 0 8px;
    transition: background 150ms;
  }

  .vault-policy__step-line--done {
    background: var(--D-accent, #2563eb);
  }

  /* ── Body ───────────────────────────────────────────────────────────────── */
  .vault-modal__body {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow-y: auto;
    flex: 1;
  }

  .vault-modal__body--policy {
    padding: 12px 16px;
  }

  .vault-policy__step-body {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .vault-policy__step-desc {
    font-size: 12.5px;
    color: var(--D-text-secondary, #6c757d);
    margin: 0;
    padding: 0 0 4px;
  }

  /* ── Form fields (shared) ───────────────────────────────────────────────── */
  .vault-modal__field {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .vault-modal__row {
    display: flex;
    gap: 10px;
  }

  .vault-modal__field--half {
    flex: 1;
  }

  .vault-modal__label {
    font-size: 12px;
    font-weight: 600;
    color: var(--D-text-secondary, #6c757d);
  }

  .vault-modal__required {
    color: var(--D-danger, #e03131);
  }

  .vault-modal__hint-text {
    font-size: 11px;
    color: var(--D-text-muted, #adb5bd);
  }

  .vault-modal__input,
  .vault-modal__select,
  .vault-modal__textarea {
    padding: 8px 10px;
    border-radius: var(--D-radius-sm, 6px);
    border: 1px solid var(--D-border, #e9ecef);
    background: var(--D-surface, #ffffff);
    color: var(--D-text-primary, #1a1a2e);
    font-size: 13px;
    font-family: inherit;
    outline: none;
    transition: border-color 120ms, box-shadow 120ms;
    resize: vertical;
  }

  .vault-modal__input:focus,
  .vault-modal__select:focus,
  .vault-modal__textarea:focus {
    border-color: var(--D-accent, #2563eb);
    box-shadow: 0 0 0 3px var(--D-accent-soft, #e7f0ff);
  }

  .vault-modal__select { cursor: pointer; }

  .vault-modal__checkbox {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--D-text-primary, #1a1a2e);
    cursor: pointer;
    padding: 4px 0;
  }

  .vault-modal__checkbox input {
    width: 16px;
    height: 16px;
    accent-color: var(--D-accent, #2563eb);
    cursor: pointer;
  }

  /* ── Condition / Assignment rows ────────────────────────────────────────── */
  .vault-policy__condition {
    border: 1px solid var(--D-border, #e9ecef);
    border-radius: var(--D-radius-sm, 6px);
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: var(--D-bg, #f8f9fa);
  }

  .vault-policy__condition-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .vault-policy__condition-num {
    font-size: 11px;
    font-weight: 600;
    color: var(--D-text-muted, #adb5bd);
    letter-spacing: 0.04em;
  }

  .vault-policy__condition-row {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .vault-policy__select--sm {
    flex: 1;
    min-width: 100px;
    font-size: 12px;
    padding: 6px 8px;
  }

  .vault-policy__values {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .vault-policy__value-row {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .vault-policy__value-input {
    flex: 1;
    font-size: 12px;
    padding: 6px 8px;
  }

  .vault-policy__remove-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border: none;
    background: transparent;
    border-radius: 4px;
    color: var(--D-text-muted, #adb5bd);
    cursor: pointer;
    transition: background 100ms, color 100ms;
    flex-shrink: 0;
  }

  .vault-policy__remove-btn:hover {
    background: var(--D-danger-soft, #fff5f5);
    color: var(--D-danger, #e03131);
  }

  .vault-policy__remove-btn--sm {
    width: 22px;
    height: 22px;
  }

  .vault-policy__add-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 10px;
    border: 1px dashed var(--D-border, #e9ecef);
    border-radius: var(--D-radius-sm, 6px);
    background: transparent;
    color: var(--D-text-secondary, #6c757d);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: border-color 120ms, color 120ms, background 120ms;
    width: 100%;
    justify-content: center;
  }

  .vault-policy__add-btn:hover {
    border-color: var(--D-accent, #2563eb);
    color: var(--D-accent, #2563eb);
    background: var(--D-accent-soft, #e7f0ff);
  }

  .vault-policy__add-value-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 11.5px;
    color: var(--D-accent, #2563eb);
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 2px 0;
    font-weight: 500;
  }

  /* ── Error ──────────────────────────────────────────────────────────────── */
  .vault-modal__error {
    padding: 10px 12px;
    background: var(--D-danger-soft, #fff5f5);
    border: 1px solid var(--D-danger-border, #ffc9c9);
    border-radius: var(--D-radius-sm, 6px);
    color: var(--D-danger, #e03131);
    font-size: 12.5px;
  }

  /* ── Footer ─────────────────────────────────────────────────────────────── */
  .vault-modal__footer {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--D-border, #e9ecef);
    flex-shrink: 0;
  }

  .vault-modal__btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px;
    border-radius: var(--D-radius-sm, 6px);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid transparent;
    transition: background 120ms, border-color 120ms, opacity 120ms;
    height: 34px;
  }

  .vault-modal__btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .vault-modal__btn--ghost {
    background: transparent;
    border-color: var(--D-border, #e9ecef);
    color: var(--D-text-primary, #1a1a2e);
  }

  .vault-modal__btn--ghost:hover:not(:disabled) {
    background: var(--D-hover, #f1f3f5);
  }

  .vault-modal__btn--primary {
    background: var(--D-accent, #2563eb);
    border-color: var(--D-accent, #2563eb);
    color: #ffffff;
  }

  .vault-modal__btn--primary:hover:not(:disabled) {
    background: var(--D-accent-hover, #1d4ed8);
    border-color: var(--D-accent-hover, #1d4ed8);
  }

  .vault-modal__spinner {
    animation: vault-spin 700ms linear infinite;
  }

  @keyframes vault-spin {
    to { transform: rotate(360deg); }
  }
`;