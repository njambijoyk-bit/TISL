import React, { useState, useEffect } from 'react';
import { useVaultSettings } from '../../../hooks/vaultHooks';

// ─────────────────────────────────────────────────────────────────────────────
// Icons
// ─────────────────────────────────────────────────────────────────────────────
const Icons = {
  save: (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M2 7l3 3 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  spinner: (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="vault-settings__spin">
      <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="14 18" opacity=".7"/>
    </svg>
  ),
  plus: (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  trash: (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M1.5 3h9M4.5 3V2h3v1M5 5v4M7 5v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M2.5 3l.6 6.6a.7.7 0 00.7.7h4.4a.7.7 0 00.7-.7L9.5 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  shield: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 1L2 3.5V7c0 2.8 2.2 5 5 5.8 2.8-.8 5-3 5-5.8V3.5L7 1z" fill="currentColor" opacity=".15" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
    </svg>
  ),
  clock: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M7 4v3l2 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  ),
  eye: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M1.5 7S3.5 3 7 3s5.5 4 5.5 4S10.5 11 7 11 1.5 7 1.5 7z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
      <circle cx="7" cy="7" r="1.5" stroke="currentColor" strokeWidth="1.2"/>
    </svg>
  ),
  lock: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="2.5" y="6" width="9" height="6.5" rx="1.2" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M4.5 6V4.5a2.5 2.5 0 015 0V6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  ),
};

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };

const SENSITIVITY_OPTIONS = [
  { value: 'confidential', label: 'Confidential' },
  { value: 'restricted',   label: 'Restricted' },
  { value: 'top_secret',   label: 'Top Secret' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function SectionHeader({ icon, title, description }) {
  return (
    <div className="vault-settings__section-head">
      <span className="vault-settings__section-icon">{icon}</span>
      <div>
        <h3 className="vault-settings__section-title">{title}</h3>
        {description && <p className="vault-settings__section-desc">{description}</p>}
      </div>
    </div>
  );
}

function Toggle({ checked, onChange, label, description }) {
  return (
    <label className="vault-settings__toggle-row">
      <div className="vault-settings__toggle-text">
        <span className="vault-settings__toggle-label">{label}</span>
        {description && <span className="vault-settings__toggle-desc">{description}</span>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`vault-settings__toggle ${checked ? 'vault-settings__toggle--on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="vault-settings__toggle-thumb" />
      </button>
    </label>
  );
}

function IpRangeEditor({ ranges, onChange }) {
  const [inputVal, setInputVal] = useState('');
  const [inputError, setInputError] = useState('');

  const validateCidr = (val) => {
    // basic CIDR / IP validation
    return /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(val.trim());
  };

  const handleAdd = () => {
    const val = inputVal.trim();
    if (!val) return;
    if (!validateCidr(val)) {
      setInputError('Enter a valid IP or CIDR (e.g. 192.168.1.0/24)');
      return;
    }
    if (ranges.includes(val)) {
      setInputError('Already in the list');
      return;
    }
    onChange([...ranges, val]);
    setInputVal('');
    setInputError('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleAdd(); }
  };

  const handleRemove = (ip) => onChange(ranges.filter(r => r !== ip));

  return (
    <div className="vault-settings__ip-editor">
      <div className="vault-settings__ip-input-row">
        <input
          type="text"
          className={`vault-settings__input ${inputError ? 'vault-settings__input--error' : ''}`}
          value={inputVal}
          onChange={e => { setInputVal(e.target.value); setInputError(''); }}
          onKeyDown={handleKeyDown}
          placeholder="192.168.1.0/24"
        />
        <button type="button" className="vault-settings__ip-add-btn" onClick={handleAdd}>
          {Icons.plus}
          Add
        </button>
      </div>
      {inputError && <p className="vault-settings__input-error">{inputError}</p>}
      {ranges.length > 0 && (
        <div className="vault-settings__ip-chips">
          {ranges.map(ip => (
            <span key={ip} className="vault-settings__ip-chip">
              <span className="vault-settings__ip-chip-text">{ip}</span>
              <button
                type="button"
                className="vault-settings__ip-chip-remove"
                onClick={() => handleRemove(ip)}
                aria-label={`Remove ${ip}`}
              >
                {Icons.trash}
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function DayPicker({ selected, onChange }) {
  const toggle = (day) => {
    const next = selected.includes(day)
      ? selected.filter(d => d !== day)
      : [...selected, day];
    onChange(next);
  };

  return (
    <div className="vault-settings__day-picker">
      {DAYS.map(day => (
        <button
          key={day}
          type="button"
          className={`vault-settings__day-btn ${selected.includes(day) ? 'vault-settings__day-btn--active' : ''}`}
          onClick={() => toggle(day)}
          aria-pressed={selected.includes(day)}
        >
          {DAY_LABELS[day]}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VaultSettingsView
// ─────────────────────────────────────────────────────────────────────────────
export default function VaultSettingsView() {
  const { settings, loading, saving, error, save } = useVaultSettings();

  const [form, setForm] = useState(null);
  const [saveError,   setSaveError]   = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Populate form once settings load
  useEffect(() => {
    if (settings && !form) {
      setForm({
        allowed_ip_ranges:          settings.allowed_ip_ranges          ?? [],
        allowed_time_start:         settings.allowed_time_start          ?? '',
        allowed_time_end:           settings.allowed_time_end            ?? '',
        allowed_days:               settings.allowed_days                ?? [],
        max_failed_unlock_attempts: settings.max_failed_unlock_attempts  ?? 5,
        unlock_session_ttl_minutes: settings.unlock_session_ttl_minutes  ?? 60,
        require_2fa_for_sensitive:  settings.require_2fa_for_sensitive   ?? false,
        sensitive_threshold:        settings.sensitive_threshold          ?? 'confidential',
        watermark_downloads:        settings.watermark_downloads          ?? false,
        log_preview_actions:        settings.log_preview_actions          ?? true,
        enforce_ip_globally:        settings.enforce_ip_globally          ?? false,
      });
    }
  }, [settings, form]);

  const patch = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setDirty(true);
    setSaveSuccess(false);
  };

  const handleSave = async () => {
    setSaveError(null);
    setSaveSuccess(false);
    try {
      await save(form);
      setDirty(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(err?.response?.data?.message ?? 'Failed to save settings.');
    }
  };

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (loading && !form) {
    return (
      <div className="vault-settings">
        <div className="vault-settings__skeleton-wrap">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="vault-settings__skeleton" style={{ animationDelay: `${i * 70}ms` }} />
          ))}
        </div>
        <style>{styles}</style>
      </div>
    );
  }

  // ── Load error ─────────────────────────────────────────────────────────────
  if (error && !form) {
    return (
      <div className="vault-settings">
        <div className="vault-settings__load-error">
          Failed to load vault settings.
        </div>
        <style>{styles}</style>
      </div>
    );
  }

  if (!form) return null;

  return (
    <div className="vault-settings">

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="vault-settings__header">
        <div>
          <h2 className="vault-settings__title">Vault settings</h2>
          <p className="vault-settings__sub">Global access controls, session behaviour, and audit preferences.</p>
        </div>
        <button
          className={`vault-settings__save-btn ${saveSuccess ? 'vault-settings__save-btn--success' : ''}`}
          onClick={handleSave}
          disabled={saving || !dirty}
        >
          {saving ? Icons.spinner : Icons.save}
          {saving ? 'Saving…' : saveSuccess ? 'Saved' : 'Save changes'}
        </button>
      </div>

      {saveError && (
        <div className="vault-settings__save-error">{saveError}</div>
      )}

      <div className="vault-settings__body">

        {/* ── IP Restrictions ─────────────────────────────────────────────── */}
        <div className="vault-settings__section">
          <SectionHeader
            icon={Icons.shield}
            title="IP restrictions"
            description="Restrict vault access to specific IP addresses or CIDR ranges."
          />
          <div className="vault-settings__fields">
            <div className="vault-settings__field">
              <label className="vault-settings__label">Allowed IP ranges</label>
              <IpRangeEditor
                ranges={form.allowed_ip_ranges}
                onChange={(val) => patch('allowed_ip_ranges', val)}
              />
              {form.allowed_ip_ranges.length === 0 && (
                <p className="vault-settings__hint">No restrictions — all IPs are permitted.</p>
              )}
            </div>
            <Toggle
              checked={form.enforce_ip_globally}
              onChange={(val) => patch('enforce_ip_globally', val)}
              label="Enforce IP restrictions globally"
              description="Apply IP rules to all vault operations, not just sensitive ones."
            />
          </div>
        </div>

        <div className="vault-settings__divider" />

        {/* ── Time window ─────────────────────────────────────────────────── */}
        <div className="vault-settings__section">
          <SectionHeader
            icon={Icons.clock}
            title="Access time window"
            description="Limit vault access to specific hours and days."
          />
          <div className="vault-settings__fields">
            <div className="vault-settings__field">
              <label className="vault-settings__label">Allowed hours</label>
              <div className="vault-settings__time-row">
                <input
                  type="time"
                  className="vault-settings__input vault-settings__input--time"
                  value={form.allowed_time_start}
                  onChange={e => patch('allowed_time_start', e.target.value)}
                  aria-label="Start time"
                />
                <span className="vault-settings__time-sep">to</span>
                <input
                  type="time"
                  className="vault-settings__input vault-settings__input--time"
                  value={form.allowed_time_end}
                  onChange={e => patch('allowed_time_end', e.target.value)}
                  aria-label="End time"
                />
              </div>
              {(!form.allowed_time_start && !form.allowed_time_end) && (
                <p className="vault-settings__hint">No time restriction — vault is accessible at any hour.</p>
              )}
            </div>
            <div className="vault-settings__field">
              <label className="vault-settings__label">Allowed days</label>
              <DayPicker
                selected={form.allowed_days}
                onChange={(val) => patch('allowed_days', val)}
              />
              {form.allowed_days.length === 0 && (
                <p className="vault-settings__hint">No day restriction — vault is accessible any day.</p>
              )}
            </div>
          </div>
        </div>

        <div className="vault-settings__divider" />

        {/* ── Session & unlock ────────────────────────────────────────────── */}
        <div className="vault-settings__section">
          <SectionHeader
            icon={Icons.lock}
            title="Session & unlock"
            description="Controls for password-protected folders and documents."
          />
          <div className="vault-settings__fields">
            <div className="vault-settings__field">
              <label className="vault-settings__label" htmlFor="max-attempts">
                Max failed unlock attempts
              </label>
              <div className="vault-settings__number-row">
                <input
                  id="max-attempts"
                  type="number"
                  className="vault-settings__input vault-settings__input--number"
                  value={form.max_failed_unlock_attempts}
                  min={1}
                  max={20}
                  onChange={e => patch('max_failed_unlock_attempts', Number(e.target.value))}
                />
                <span className="vault-settings__unit">attempts (1–20)</span>
              </div>
            </div>
            <div className="vault-settings__field">
              <label className="vault-settings__label" htmlFor="session-ttl">
                Unlock session duration
              </label>
              <div className="vault-settings__number-row">
                <input
                  id="session-ttl"
                  type="number"
                  className="vault-settings__input vault-settings__input--number"
                  value={form.unlock_session_ttl_minutes}
                  min={5}
                  max={1440}
                  onChange={e => patch('unlock_session_ttl_minutes', Number(e.target.value))}
                />
                <span className="vault-settings__unit">minutes (5–1440)</span>
              </div>
            </div>
          </div>
        </div>

        <div className="vault-settings__divider" />

        {/* ── Security ────────────────────────────────────────────────────── */}
        <div className="vault-settings__section">
          <SectionHeader
            icon={Icons.shield}
            title="Security"
            description="Authentication and sensitivity enforcement settings."
          />
          <div className="vault-settings__fields">
            <Toggle
              checked={form.require_2fa_for_sensitive}
              onChange={(val) => patch('require_2fa_for_sensitive', val)}
              label="Require 2FA for sensitive content"
              description="Users must verify with a second factor before accessing sensitive documents or folders."
            />
            <div className="vault-settings__field">
              <label className="vault-settings__label" htmlFor="sensitivity-threshold">
                Sensitivity threshold
              </label>
              <p className="vault-settings__hint" style={{ marginTop: 0, marginBottom: 6 }}>
                Documents at or above this level trigger the 2FA requirement.
              </p>
              <select
                id="sensitivity-threshold"
                className="vault-settings__select"
                value={form.sensitive_threshold}
                onChange={e => patch('sensitive_threshold', e.target.value)}
                disabled={!form.require_2fa_for_sensitive}
              >
                {SENSITIVITY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="vault-settings__divider" />

        {/* ── Audit & downloads ───────────────────────────────────────────── */}
        <div className="vault-settings__section">
          <SectionHeader
            icon={Icons.eye}
            title="Audit & downloads"
            description="Control logging granularity and download behaviour."
          />
          <div className="vault-settings__fields">
            <Toggle
              checked={form.log_preview_actions}
              onChange={(val) => patch('log_preview_actions', val)}
              label="Log preview actions"
              description="Record an access log entry every time a document is previewed, not just downloaded."
            />
            <Toggle
              checked={form.watermark_downloads}
              onChange={(val) => patch('watermark_downloads', val)}
              label="Watermark downloads"
              description="Stamp downloaded documents with the user name, timestamp, and IP address."
            />
          </div>
        </div>

      </div>

      {/* ── Sticky save footer (shows when dirty) ───────────────────────────── */}
      {dirty && (
        <div className="vault-settings__footer">
          <span className="vault-settings__footer-msg">You have unsaved changes.</span>
          <button
            className={`vault-settings__save-btn ${saveSuccess ? 'vault-settings__save-btn--success' : ''}`}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? Icons.spinner : Icons.save}
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      )}

      <style>{styles}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
const styles = `
  .vault-settings {
    display: flex;
    flex-direction: column;
    gap: 0;
    height: 100%;
    overflow-y: auto;
    padding: 24px;
    box-sizing: border-box;
  }

  /* Header */
  .vault-settings__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 24px;
  }

  .vault-settings__title {
    font-size: 15px;
    font-weight: 700;
    color: var(--D-text-primary, #1a1a2e);
    margin: 0 0 2px;
  }

  .vault-settings__sub {
    font-size: 12.5px;
    color: var(--D-text-secondary, #6c757d);
    margin: 0;
  }

  .vault-settings__save-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 16px;
    border-radius: var(--D-radius-sm, 6px);
    border: none;
    background: var(--D-accent, #2563eb);
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    transition: background 120ms, opacity 120ms;
    height: 34px;
  }

  .vault-settings__save-btn:hover:not(:disabled) { background: var(--D-accent-hover, #1d4ed8); }
  .vault-settings__save-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .vault-settings__save-btn--success { background: #16a34a !important; }

  .vault-settings__save-error {
    padding: 10px 14px;
    background: var(--D-danger-soft, #fff5f5);
    border: 1px solid var(--D-danger-border, #ffc9c9);
    border-radius: var(--D-radius, 8px);
    color: var(--D-danger, #e03131);
    font-size: 13px;
    margin-bottom: 16px;
  }

  .vault-settings__load-error {
    padding: 14px 16px;
    background: var(--D-danger-soft, #fff5f5);
    border: 1px solid var(--D-danger-border, #ffc9c9);
    border-radius: var(--D-radius, 8px);
    color: var(--D-danger, #e03131);
    font-size: 13px;
  }

  /* Body */
  .vault-settings__body {
    display: flex;
    flex-direction: column;
    gap: 0;
    background: var(--D-surface, #ffffff);
    border: 1px solid var(--D-border, #e9ecef);
    border-radius: var(--D-radius, 8px);
    overflow: hidden;
  }

  .vault-settings__divider {
    height: 1px;
    background: var(--D-border, #e9ecef);
  }

  /* Section */
  .vault-settings__section {
    padding: 20px 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .vault-settings__section-head {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }

  .vault-settings__section-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 6px;
    background: var(--D-hover, #f1f3f5);
    color: var(--D-text-secondary, #6c757d);
    flex-shrink: 0;
    margin-top: 1px;
  }

  .vault-settings__section-title {
    font-size: 13.5px;
    font-weight: 700;
    color: var(--D-text-primary, #1a1a2e);
    margin: 0 0 2px;
  }

  .vault-settings__section-desc {
    font-size: 12px;
    color: var(--D-text-muted, #adb5bd);
    margin: 0;
  }

  .vault-settings__fields {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding-left: 38px;
  }

  /* Field */
  .vault-settings__field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .vault-settings__label {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--D-text-primary, #1a1a2e);
  }

  .vault-settings__hint {
    font-size: 11.5px;
    color: var(--D-text-muted, #adb5bd);
    margin: 0;
  }

  /* Inputs */
  .vault-settings__input {
    padding: 6px 10px;
    border-radius: var(--D-radius-sm, 6px);
    border: 1px solid var(--D-border, #e9ecef);
    background: var(--D-surface, #ffffff);
    color: var(--D-text-primary, #1a1a2e);
    font-size: 13px;
    outline: none;
    font-family: inherit;
    transition: border-color 120ms, box-shadow 120ms;
    height: 32px;
    box-sizing: border-box;
  }

  .vault-settings__input:focus {
    border-color: var(--D-accent, #2563eb);
    box-shadow: 0 0 0 2px var(--D-accent-soft, #e7f0ff);
  }

  .vault-settings__input--error {
    border-color: var(--D-danger, #e03131);
  }

  .vault-settings__input--time   { width: 120px; }
  .vault-settings__input--number { width: 80px; text-align: center; }

  .vault-settings__input-error {
    font-size: 11.5px;
    color: var(--D-danger, #e03131);
    margin: 0;
  }

  .vault-settings__select {
    padding: 6px 10px;
    border-radius: var(--D-radius-sm, 6px);
    border: 1px solid var(--D-border, #e9ecef);
    background: var(--D-surface, #ffffff);
    color: var(--D-text-primary, #1a1a2e);
    font-size: 13px;
    outline: none;
    font-family: inherit;
    height: 32px;
    cursor: pointer;
    transition: border-color 120ms;
    max-width: 200px;
  }

  .vault-settings__select:focus {
    border-color: var(--D-accent, #2563eb);
    box-shadow: 0 0 0 2px var(--D-accent-soft, #e7f0ff);
  }

  .vault-settings__select:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  /* Time row */
  .vault-settings__time-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .vault-settings__time-sep {
    font-size: 12.5px;
    color: var(--D-text-muted, #adb5bd);
  }

  /* Number row */
  .vault-settings__number-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .vault-settings__unit {
    font-size: 12px;
    color: var(--D-text-muted, #adb5bd);
  }

  /* Toggle */
  .vault-settings__toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    cursor: pointer;
    padding: 10px 14px;
    border-radius: var(--D-radius, 8px);
    border: 1px solid var(--D-border, #e9ecef);
    background: var(--D-bg, #f8f9fa);
    transition: background 100ms;
    user-select: none;
  }

  .vault-settings__toggle-row:hover { background: var(--D-hover, #f1f3f5); }

  .vault-settings__toggle-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .vault-settings__toggle-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--D-text-primary, #1a1a2e);
  }

  .vault-settings__toggle-desc {
    font-size: 11.5px;
    color: var(--D-text-muted, #adb5bd);
  }

  .vault-settings__toggle {
    position: relative;
    width: 36px;
    height: 20px;
    border-radius: 10px;
    border: none;
    background: var(--D-border, #dee2e6);
    cursor: pointer;
    flex-shrink: 0;
    transition: background 160ms;
    padding: 0;
  }

  .vault-settings__toggle--on { background: var(--D-accent, #2563eb); }

  .vault-settings__toggle-thumb {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #fff;
    transition: transform 160ms;
    box-shadow: 0 1px 3px rgba(0,0,0,.2);
  }

  .vault-settings__toggle--on .vault-settings__toggle-thumb {
    transform: translateX(16px);
  }

  /* IP editor */
  .vault-settings__ip-editor {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .vault-settings__ip-input-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .vault-settings__ip-input-row .vault-settings__input {
    flex: 1;
    max-width: 260px;
    font-family: monospace;
    font-size: 12.5px;
  }

  .vault-settings__ip-add-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 0 12px;
    height: 32px;
    border-radius: var(--D-radius-sm, 6px);
    border: 1px solid var(--D-border, #e9ecef);
    background: var(--D-surface, #ffffff);
    color: var(--D-text-secondary, #6c757d);
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    transition: background 100ms, color 100ms;
    white-space: nowrap;
    font-family: inherit;
  }

  .vault-settings__ip-add-btn:hover {
    background: var(--D-hover, #f1f3f5);
    color: var(--D-text-primary, #1a1a2e);
  }

  .vault-settings__ip-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .vault-settings__ip-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px 3px 10px;
    border-radius: 20px;
    background: var(--D-accent-soft, #e7f0ff);
    border: 1px solid var(--D-accent, #2563eb);
    color: var(--D-accent, #2563eb);
  }

  .vault-settings__ip-chip-text {
    font-family: monospace;
    font-size: 12px;
    font-weight: 500;
  }

  .vault-settings__ip-chip-remove {
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    color: var(--D-accent, #2563eb);
    opacity: 0.6;
    transition: opacity 100ms;
    line-height: 1;
  }

  .vault-settings__ip-chip-remove:hover { opacity: 1; }

  /* Day picker */
  .vault-settings__day-picker {
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
  }

  .vault-settings__day-btn {
    padding: 5px 10px;
    border-radius: var(--D-radius-sm, 6px);
    border: 1px solid var(--D-border, #e9ecef);
    background: var(--D-surface, #ffffff);
    color: var(--D-text-secondary, #6c757d);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: background 100ms, color 100ms, border-color 100ms;
    font-family: inherit;
  }

  .vault-settings__day-btn:hover {
    background: var(--D-hover, #f1f3f5);
    color: var(--D-text-primary, #1a1a2e);
  }

  .vault-settings__day-btn--active {
    background: var(--D-accent-soft, #e7f0ff);
    border-color: var(--D-accent, #2563eb);
    color: var(--D-accent, #2563eb);
  }

  /* Sticky footer */
  .vault-settings__footer {
    position: sticky;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 24px;
    background: var(--D-surface, #ffffff);
    border-top: 1px solid var(--D-border, #e9ecef);
    margin-top: 20px;
    margin-left: -24px;
    margin-right: -24px;
    margin-bottom: -24px;
  }

  .vault-settings__footer-msg {
    font-size: 12.5px;
    color: var(--D-text-secondary, #6c757d);
  }

  /* Skeleton */
  .vault-settings__skeleton-wrap {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .vault-settings__skeleton {
    border-radius: var(--D-radius, 8px);
    background: linear-gradient(90deg, var(--D-skeleton-base, #e9ecef) 25%, var(--D-skeleton-shine, #f1f3f5) 50%, var(--D-skeleton-base, #e9ecef) 75%);
    background-size: 200% 100%;
    animation: vault-shimmer 1.4s ease-in-out infinite;
  }

  .vault-settings__skeleton:nth-child(1) { height: 60px; }
  .vault-settings__skeleton:nth-child(2) { height: 100px; }
  .vault-settings__skeleton:nth-child(3) { height: 80px; }
  .vault-settings__skeleton:nth-child(4) { height: 120px; }
  .vault-settings__skeleton:nth-child(5) { height: 80px; }

  /* Spinner */
  .vault-settings__spin {
    animation: vault-spin 800ms linear infinite;
  }

  @keyframes vault-spin    { to { transform: rotate(360deg); } }
  @keyframes vault-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
`;