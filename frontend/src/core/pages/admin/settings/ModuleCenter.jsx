import React, { useState, useEffect, useCallback } from 'react';
import SettingsLayout from '../../../../_shared/components/layout/SettingsLayout';
import modulesAPI from '../../../../_shared/api/modules';
import { useModuleStore } from '../../../../_shared/store/index';
import {
  ShieldCheck, ShieldAlert, KeyRound, Power, PowerOff, Lock,
  RefreshCw, CheckCircle2, Building2, History, ChevronDown, ChevronUp,
} from 'lucide-react';
import toast from 'react-hot-toast';

// ── Shared styles (match settings pages) ────────────────────────────────────
const card = {
  background: 'white', borderRadius: 12,
  border: '1px solid color-mix(in srgb, var(--color-primary-500) 10%, transparent)',
  boxShadow: '0 2px 12px color-mix(in srgb, var(--color-primary-500) 6%, transparent)',
};
const inputStyle = {
  width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: '0.82rem',
  background: 'color-mix(in srgb, var(--color-primary-500) 4%, transparent)',
  border: '1.5px solid color-mix(in srgb, var(--color-primary-500) 18%, transparent)',
  color: '#111827', outline: 'none', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  boxSizing: 'border-box', letterSpacing: '0.03em',
};
const btn = (bg, fg = 'white') => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
  borderRadius: 8, border: 'none', background: bg, color: fg, cursor: 'pointer',
  fontSize: '0.78rem', fontWeight: 600, fontFamily: 'inherit',
});
const label = {
  fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.08em', color: 'var(--color-primary-600)', display: 'block', marginBottom: 5,
};

const STATUS = {
  active:       { text: 'Active',           color: '#059669', bg: 'rgba(5,150,105,0.10)',  Icon: CheckCircle2 },
  licensed_off: { text: 'Licensed — off',   color: '#d97706', bg: 'rgba(217,119,6,0.10)',  Icon: PowerOff },
  unlicensed:   { text: 'Not licensed',     color: '#6b7280', bg: 'rgba(107,114,128,0.10)', Icon: Lock },
};

const RESULT_LABEL = {
  accepted: 'Activated', already_active: 'Already active', typo: 'Mistyped',
  fake: 'Invalid key', other_client: "Another client's key", locked_out: 'Locked out',
  ownership_accepted: 'Ownership verified', ownership_rejected: 'Ownership rejected',
  switched_on: 'Switched on', switched_off: 'Switched off',
};
const RESULT_COLOR = {
  accepted: '#059669', already_active: '#059669', ownership_accepted: '#059669', switched_on: '#059669',
  typo: '#d97706', switched_off: '#6b7280',
  fake: '#dc2626', other_client: '#dc2626', locked_out: '#dc2626', ownership_rejected: '#dc2626',
};

// ── Ownership banner (inline, never blocks the page) ─────────────────────────
function OwnershipBanner({ verified, businessName, onVerified }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!code.trim()) return;
    setBusy(true);
    try {
      const res = await modulesAPI.setupOwnership(code.trim());
      if (res.ok) { toast.success(res.message || 'Installation verified.'); setCode(''); setOpen(false); onVerified(); }
      else toast.error(res.message || 'That ownership code is not valid.');
    } catch (e) {
      toast.error(e.response?.data?.message || 'Could not verify the ownership code.');
    } finally { setBusy(false); }
  };

  if (verified) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#059669', fontSize: '0.82rem', fontWeight: 600 }}>
        <Building2 size={15} /> Licensed to {businessName}
      </div>
    );
  }

  return (
    <div style={{ ...card, borderColor: 'rgba(217,119,6,0.35)', background: 'rgba(217,119,6,0.05)', padding: 16, marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <ShieldAlert size={20} color="#d97706" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Installation not verified</div>
            <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#6b7280', lineHeight: 1.5 }}>
              Paste the <strong>ownership code</strong> for this business to unlock module keys.
              You can browse and switch modules below meanwhile, but keys are accepted only after this step.
            </p>
          </div>
        </div>
        <button onClick={() => setOpen((o) => !o)} style={btn('var(--color-primary-600)')}>
          <KeyRound size={14} /> {open ? 'Cancel' : 'Enter ownership code'}
        </button>
      </div>
      {open && (
        <div style={{ marginTop: 12 }}>
          <label style={label}>Ownership code</label>
          <textarea rows={3} value={code} onChange={(e) => setCode(e.target.value)}
            placeholder="WNKJ-XXXXX-XXXXX-…" style={{ ...inputStyle, resize: 'vertical' }} />
          <div style={{ marginTop: 10 }}>
            <button onClick={submit} disabled={busy} style={{ ...btn('#059669'), opacity: busy ? 0.6 : 1 }}>
              <ShieldCheck size={15} /> {busy ? 'Verifying…' : 'Verify installation'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Module card ─────────────────────────────────────────────────────────────
function ModuleCard({ mod, onActivate, onToggle, busy, canActivate }) {
  const [key, setKey] = useState('');
  const s = STATUS[mod.status] || STATUS.unlicensed;

  return (
    <div style={{ ...card, padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div>
          <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>{mod.name}</div>
          <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>Module {mod.number}</div>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px', borderRadius: 999, background: s.bg, color: s.color, fontSize: '0.68rem', fontWeight: 700 }}>
          <s.Icon size={13} /> {s.text}
        </span>
      </div>

      <p style={{ margin: 0, fontSize: '0.78rem', color: '#6b7280', lineHeight: 1.45, minHeight: 34 }}>
        {mod.description}
      </p>

      {mod.licensed ? (
        <button
          onClick={() => onToggle(mod.key, !mod.enabled)} disabled={busy}
          style={{ ...btn(mod.enabled ? 'rgba(217,119,6,0.12)' : 'rgba(5,150,105,0.12)', mod.enabled ? '#b45309' : '#047857'), justifyContent: 'center' }}
        >
          {mod.enabled ? <><PowerOff size={14} /> Switch off</> : <><Power size={14} /> Switch on</>}
        </button>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={key} onChange={(e) => setKey(e.target.value)}
            placeholder={canActivate ? 'Paste module key' : 'Verify ownership first'}
            disabled={!canActivate}
            style={{ ...inputStyle, fontSize: '0.72rem', padding: '8px 10px', opacity: canActivate ? 1 : 0.6 }}
          />
          <button
            onClick={() => onActivate(mod.key, key, () => setKey(''))}
            disabled={busy || !key.trim() || !canActivate}
            style={{ ...btn('var(--color-primary-600)'), whiteSpace: 'nowrap', opacity: (busy || !key.trim() || !canActivate) ? 0.6 : 1 }}
          >
            <KeyRound size={14} /> Activate
          </button>
        </div>
      )}
    </div>
  );
}

// ── Attempts log ────────────────────────────────────────────────────────────
function AttemptsLog({ rows }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ ...card, padding: 18, marginTop: 24 }}>
      <button onClick={() => setOpen((o) => !o)}
        style={{ ...btn('transparent', '#374151'), padding: 0, width: '100%', justifyContent: 'space-between' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '0.95rem' }}>
          <History size={16} color="var(--color-primary-600)" /> Activity log
        </span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && (
        <div style={{ overflowX: 'auto', marginTop: 12 }}>
          {!rows.length ? (
            <p style={{ color: '#9ca3af', fontSize: '0.8rem' }}>No activity yet.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#9ca3af' }}>
                  <th style={{ padding: '6px 8px' }}>When</th>
                  <th style={{ padding: '6px 8px' }}>Result</th>
                  <th style={{ padding: '6px 8px' }}>Module</th>
                  <th style={{ padding: '6px 8px' }}>Key&apos;s client</th>
                  <th style={{ padding: '6px 8px' }}>IP</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} style={{ borderTop: '1px solid #f1f1f4' }}>
                    <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{new Date(r.created_at).toLocaleString()}</td>
                    <td style={{ padding: '6px 8px', fontWeight: 600, color: RESULT_COLOR[r.result] || '#374151' }}>
                      {RESULT_LABEL[r.result] || r.result}
                    </td>
                    <td style={{ padding: '6px 8px' }}>{r.module_key || '—'}</td>
                    <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: '0.7rem' }}>{r.key_client_uuid || '—'}</td>
                    <td style={{ padding: '6px 8px' }}>{r.ip_address || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ n, label: lbl, color }) {
  return (
    <div style={{ ...card, padding: '12px 16px', minWidth: 120 }}>
      <div style={{ fontSize: '1.4rem', fontWeight: 800, color }}>{n}</div>
      <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', fontWeight: 700 }}>{lbl}</div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function ModuleCenter() {
  const [status, setStatus] = useState(null);
  const [data, setData] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const refreshModules = useModuleStore((s) => s.refresh);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // All three work regardless of licence/installation state.
      const [st, center, log] = await Promise.all([
        modulesAPI.getSetupStatus().catch(() => ({ verified: false })),
        modulesAPI.index().catch(() => ({ modules: [], business_name: null })),
        modulesAPI.attempts().catch(() => ({ attempts: [] })),
      ]);
      setStatus(st);
      setData(center);
      setAttempts(log.attempts || []);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Could not load the Module Center.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onActivate = async (moduleKey, key, clear) => {
    setBusy(true);
    try {
      const res = await modulesAPI.activate(key);
      if (res.ok) { toast.success(res.message || 'Module activated.'); clear(); }
      else toast.error(res.message || 'That key was not accepted.');
    } catch (e) {
      toast.error(e.response?.data?.message || 'Could not activate the module.');
    } finally { setBusy(false); await load(); refreshModules(); }
  };

  const onToggle = async (moduleKey, enabled) => {
    setBusy(true);
    try {
      const res = await modulesAPI.toggle(moduleKey, enabled);
      if (res.ok) toast.success(res.message);
      else toast.error(res.message || 'Could not change the switch.');
    } catch (e) {
      toast.error(e.response?.data?.message || 'Could not change the switch.');
    } finally { setBusy(false); await load(); refreshModules(); }
  };

  if (loading) {
    return (
      <SettingsLayout>
        <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>
          <RefreshCw size={18} /> Loading Module Center…
        </div>
      </SettingsLayout>
    );
  }

  const modules = data?.modules || [];
  const verified = !!status?.verified;
  const licensedCount = modules.filter((m) => m.licensed).length;
  const activeCount = modules.filter((m) => m.status === 'active').length;

  return (
    <SettingsLayout>
      <div style={{ padding: '20px 4px', maxWidth: 1100, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>Module Center</h1>
            <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: '0.82rem' }}>
              Core runs free, always. The 11 paid modules each unlock with their own key.
            </p>
          </div>
          <button onClick={load} style={btn('rgba(107,114,128,0.12)', '#374151')}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        {/* Summary */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <Stat n={activeCount} label="Active" color="#059669" />
          <Stat n={licensedCount} label="Licensed" color="var(--color-primary-600)" />
          <Stat n={11 - licensedCount} label="Not licensed" color="#6b7280" />
        </div>

        {/* Ownership */}
        <OwnershipBanner verified={verified} businessName={data?.business_name} onVerified={load} />

        {/* Module grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {modules.map((mod) => (
            <ModuleCard key={mod.key} mod={mod} onActivate={onActivate} onToggle={onToggle} busy={busy} canActivate={verified} />
          ))}
        </div>

        {/* Attempts log */}
        <AttemptsLog rows={attempts} />
      </div>
    </SettingsLayout>
  );
}
