import React, { useState, useEffect, useCallback } from 'react';
import SettingsLayout from '../../../../_shared/components/layout/SettingsLayout';
import backupsAPI from '../../../../_shared/api/backups';
import AssignTablesModal from './AssignTablesModal';
import RestorePanel from './RestorePanel';
import { useAuthStore } from '../../../../_shared/store/index';
import {
  Database, Save, PlayCircle, RotateCcw, AlertTriangle, CheckCircle2,
  HardDrive, Server, Cloud, RefreshCw, Lock, Eye, EyeOff,
} from 'lucide-react';
import toast from 'react-hot-toast';

// ── Shared styles (match settings pages) ────────────────────────────────────
const card = {
  background: 'var(--surface-card)', borderRadius: 12,
  border: '1px solid color-mix(in srgb, var(--color-primary-500) 10%, transparent)',
  boxShadow: '0 2px 12px color-mix(in srgb, var(--color-primary-500) 6%, transparent)',
};
const input = {
  width: '100%', padding: '8px 11px', borderRadius: 8, fontSize: '0.82rem',
  background: 'color-mix(in srgb, var(--color-primary-500) 4%, transparent)',
  border: '1.5px solid color-mix(in srgb, var(--color-primary-500) 18%, transparent)',
  color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
};
const label = {
  fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.08em', color: 'var(--color-primary-600)', display: 'block', marginBottom: 5,
};
const btn = (bg, fg = 'white') => ({
  display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 15px',
  borderRadius: 9, border: 'none', background: bg, color: fg, cursor: 'pointer',
  fontSize: '0.82rem', fontWeight: 600, fontFamily: 'inherit',
});

const DRIVER_ICON = { local: HardDrive, ftp: Server, sftp: Server, s3: Cloud };

function Field({ label: l, children, hint }) {
  return (
    <div>
      <label style={label}>{l}</label>
      {children}
      {hint && <p style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', margin: '4px 0 0' }}>{hint}</p>}
    </div>
  );
}

// Destination-specific fields
function DestinationFields({ driver, cfg, set }) {
  const f = (k, ph) => (
    <input style={input} value={cfg[k] ?? ''} placeholder={ph} onChange={(e) => set(k, e.target.value)} />
  );
  const secret = (k, ph) => (
    <input type="password" style={input} value={cfg[k] ?? ''} placeholder={ph} onChange={(e) => set(k, e.target.value)} />
  );
  if (driver === 'local') {
    return (
      <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
        The backup is built on demand and <strong>downloaded to your computer</strong> as a <code>.wnkjba</code> file when you click <em>Back up &amp; download</em>. Nothing is stored on the server. (Automatic scheduled backups need FTP, SFTP or S3.)
      </p>
    );
  }
  if (driver === 'ftp' || driver === 'sftp') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <Field l="Host">{f('host', 'ftp.example.com')}</Field>
        <Field l="Port">{f('port', driver === 'sftp' ? '22' : '21')}</Field>
        <Field l="Username">{f('username', 'backupuser')}</Field>
        <Field l="Password" hint="Leave blank to keep the saved one">{secret('password', '••••••••')}</Field>
        <Field l="Remote path">{f('path', '/backups')}</Field>
      </div>
    );
  }
  // s3
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
      <Field l="Bucket">{f('bucket', 'tisl-backups')}</Field>
      <Field l="Region">{f('region', 'eu-west-1')}</Field>
      <Field l="Endpoint" hint="For S3-compatible (Spaces, MinIO…)">{f('endpoint', 'https://…')}</Field>
      <Field l="Path prefix">{f('path', 'backups/')}</Field>
      <Field l="Access key" hint="Leave blank to keep the saved one">{secret('access_key', '••••••••')}</Field>
      <Field l="Secret key" hint="Leave blank to keep the saved one">{secret('secret', '••••••••')}</Field>
    </div>
  );
}

export default function BackupSettings() {
  const { user } = useAuthStore();
  const isSuper = user?.role === 'super_admin';

  const [form, setForm] = useState(null);
  const [cfg, setCfg] = useState({});
  const [passphrase, setPassphrase] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [hasPass, setHasPass] = useState(false);
  const [plan, setPlan] = useState(null);
  const [runs, setRuns] = useState([]);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, p, r] = await Promise.all([
        backupsAPI.getSettings(),
        backupsAPI.getPlan().catch(() => null),
        backupsAPI.getRuns().catch(() => ({ runs: [] })),
      ]);
      setRuns(r.runs || []);
      setForm({
        enabled: s.enabled, frequency: s.frequency, run_time: s.run_time || '',
        run_day: s.run_day ?? '', retention_count: s.retention_count ?? 7,
        destination_driver: s.destination_driver || 'local',
      });
      setCfg(s.destination || {});
      setHasPass(!!s.has_passphrase);
      setPlan(p);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Could not load backup settings.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setCfgK = (k, v) => setCfg((c) => ({ ...c, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        run_time: form.run_time || null,
        run_day: form.run_day === '' ? null : Number(form.run_day),
        retention_count: Number(form.retention_count),
        destination: cfg,
      };
      if (passphrase) payload.passphrase = passphrase;
      const res = await backupsAPI.saveSettings(payload);
      toast.success(res.message || 'Saved.');
      setPassphrase('');
      await load();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Could not save.');
    } finally { setSaving(false); }
  };

  const readErr = async (e) => {
    const d = e.response?.data;
    if (d instanceof Blob) {
      try { return JSON.parse(await d.text()).message || 'Backup failed.'; } catch { return 'Backup failed.'; }
    }
    return d?.message || 'Backup failed.';
  };

  const isLocal = form?.destination_driver === 'local';

  const runNow = async () => {
    setRunning(true);
    const t = toast.loading(isLocal ? 'Preparing download…' : 'Running backup…');
    try {
      if (isLocal) {
        await backupsAPI.downloadNow();
        toast.dismiss(t);
        toast.success('Backup downloaded to your computer.');
      } else {
        const res = await backupsAPI.runNow();
        toast.dismiss(t);
        res.ok ? toast.success(res.message) : toast.error(res.message || 'Backup failed.');
      }
    } catch (e) {
      toast.dismiss(t);
      toast.error(await readErr(e));
    } finally {
      setRunning(false);
      await load();
    }
  };

  const fmtSize = (b) => {
    if (!b && b !== 0) return '—';
    if (b < 1024) return `${b} B`;
    if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1048576).toFixed(1)} MB`;
  };

  if (loading || !form) {
    return <SettingsLayout><div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}><RefreshCw size={18} /> Loading…</div></SettingsLayout>;
  }

  const DriverIcon = DRIVER_ICON[form.destination_driver] || HardDrive;
  const includedTables = (plan?.included || []).reduce((n, m) => n + (m.tables?.length || 0), 0);

  return (
    <SettingsLayout>
      <div style={{ padding: '20px 4px', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <Database size={22} color="var(--color-primary-600)" />
          <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>Backups</h1>
        </div>
        <p style={{ margin: '0 0 20px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          Exports your data (never the modules or licensing) to a secure location on a schedule, encrypted with a passphrase only you hold.
        </p>

        {/* SCHEDULE + DESTINATION */}
        <div style={{ ...card, padding: 20, display: 'grid', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'grid', gap: 4 }}>
              <span style={label}>Automatic backups</span>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} />
                {form.enabled ? 'On' : 'Off'}
              </label>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            <Field l="Frequency">
              <select style={input} value={form.frequency} onChange={(e) => set('frequency', e.target.value)}>
                <option value="never">Never</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </Field>
            {form.frequency !== 'never' && (
              <Field l="Time of day">
                <input type="time" style={input} value={form.run_time} onChange={(e) => set('run_time', e.target.value)} />
              </Field>
            )}
            {form.frequency === 'weekly' && (
              <Field l="Day of week">
                <select style={input} value={form.run_day} onChange={(e) => set('run_day', e.target.value)}>
                  {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) => (
                    <option key={i} value={i}>{d}</option>
                  ))}
                </select>
              </Field>
            )}
            {form.frequency === 'monthly' && (
              <Field l="Day of month" hint="1–28"><input type="number" min="1" max="28" style={input} value={form.run_day} onChange={(e) => set('run_day', e.target.value)} /></Field>
            )}
            <Field l="Keep last" hint="backups"><input type="number" min="1" max="365" style={input} value={form.retention_count} onChange={(e) => set('retention_count', e.target.value)} /></Field>
          </div>

          <Field l="Destination">
            <select style={{ ...input, maxWidth: 240 }} value={form.destination_driver} onChange={(e) => set('destination_driver', e.target.value)}>
              <option value="local">Download to this computer</option>
              <option value="ftp">FTP</option>
              <option value="sftp">SFTP</option>
              <option value="s3">S3-compatible (online)</option>
            </select>
          </Field>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <DriverIcon size={16} color="var(--color-primary-500)" style={{ marginTop: 26, flexShrink: 0 }} />
            <div style={{ flex: 1 }}><DestinationFields driver={form.destination_driver} cfg={cfg} set={setCfgK} /></div>
          </div>

          <Field l="Backup passphrase" hint={hasPass ? 'A passphrase is set. Type a new one to change it; leave blank to keep it.' : 'Set a passphrase — it encrypts every backup and is required to restore or view one. Store it safely; it is never recoverable from here.'}>
            <div style={{ position: 'relative', maxWidth: 360 }}>
              <input
                type={showPass ? 'text' : 'password'}
                style={{ ...input, paddingRight: 38 }}
                value={passphrase}
                placeholder={hasPass ? '•••••••• (set)' : 'Choose a passphrase'}
                onChange={(e) => setPassphrase(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                aria-label={showPass ? 'Hide passphrase' : 'Show passphrase'}
                title={showPass ? 'Hide' : 'Show'}
                style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary-500)', display: 'flex', padding: 4 }}
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </Field>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={save} disabled={saving} style={{ ...btn('var(--color-primary-600)'), opacity: saving ? 0.6 : 1 }}>
              <Save size={15} /> {saving ? 'Saving…' : 'Save settings'}
            </button>
            <button onClick={runNow} disabled={running} style={{ ...btn('rgba(16,185,129,0.12)', '#047857'), opacity: running ? 0.6 : 1 }}>
              <PlayCircle size={16} /> {running ? 'Working…' : (isLocal ? 'Back up & download' : 'Back up now')}
            </button>
          </div>
        </div>

        {/* WHAT GETS BACKED UP + BANNERS */}
        <div style={{ ...card, padding: 20, marginTop: 18 }}>
          <h2 style={{ margin: '0 0 4px', fontSize: '1rem', fontWeight: 700 }}>What gets backed up</h2>
          <p style={{ margin: '0 0 14px', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
            {plan ? <>{plan.included.length} active module group{plan.included.length === 1 ? '' : 's'} · {includedTables} table{includedTables === 1 ? '' : 's'}.</> : 'Plan unavailable.'}
          </p>

          {(plan?.disabled || []).map((m) => (
            <div key={m.module} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.30)', borderRadius: 9, padding: '10px 13px', marginBottom: 8 }}>
              <AlertTriangle size={16} color="#d97706" style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: '0.82rem', color: '#92400e' }}>
                <strong>{m.name}</strong> is switched off — its data won't be included in backups. This doesn't stop the backup; the module's tables are simply skipped until you switch it back on in the Module Center.
              </span>
            </div>
          ))}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, marginTop: 6 }}>
            {(plan?.included || []).map((m) => (
              <div key={m.module} style={{ border: '1px solid var(--line)', borderRadius: 9, padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: '0.86rem' }}>
                  <CheckCircle2 size={14} color="#059669" /> {m.name}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: 2 }}>{m.tables.length} table{m.tables.length === 1 ? '' : 's'}</div>
              </div>
            ))}
          </div>

          {plan?.unlicensed?.length > 0 && (
            <p style={{ marginTop: 14, fontSize: '0.76rem', color: 'var(--text-tertiary)' }}>
              Not licensed on this installation (not backed up): {plan.unlicensed.map((m) => m.name).join(', ')}.
            </p>
          )}

          {plan?.unassigned?.length > 0 && (
            <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: 'rgba(180,83,9,0.06)', border: '1px solid rgba(180,83,9,0.25)', borderRadius: 9, padding: '10px 13px' }}>
              <span style={{ fontSize: '0.8rem', color: '#b45309', flex: 1 }}>
                <strong>{plan.unassigned.length}</strong> table{plan.unassigned.length === 1 ? '' : 's'} not yet assigned to a module — they won't be backed up until you place them.
              </span>
              <button onClick={() => setAssignOpen(true)} style={{ ...btn('var(--color-primary-600)'), whiteSpace: 'nowrap' }}>Assign tables</button>
            </div>
          )}
        </div>

        {/* RECENT RUNS */}
        <div style={{ ...card, padding: 20, marginTop: 18 }}>
          <h2 style={{ margin: '0 0 12px', fontSize: '1rem', fontWeight: 700 }}>Recent backups</h2>
          {runs.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--text-tertiary)', fontSize: '0.82rem' }}>No backups yet — hit "Back up now" to create the first one.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--text-tertiary)' }}>
                    <th style={{ padding: '6px 8px' }}>When</th>
                    <th style={{ padding: '6px 8px' }}>Status</th>
                    <th style={{ padding: '6px 8px' }}>Trigger</th>
                    <th style={{ padding: '6px 8px' }}>Tables</th>
                    <th style={{ padding: '6px 8px' }}>Rows</th>
                    <th style={{ padding: '6px 8px' }}>Size</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id} style={{ borderTop: '1px solid var(--line)' }}>
                      <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{r.started_at ? new Date(r.started_at).toLocaleString() : '—'}</td>
                      <td style={{ padding: '6px 8px', fontWeight: 600, color: r.status === 'ok' ? '#059669' : r.status === 'running' ? '#d97706' : '#dc2626' }}>
                        {r.status}{r.error ? ` · ${r.error}` : ''}
                      </td>
                      <td style={{ padding: '6px 8px' }}>{r.trigger}</td>
                      <td style={{ padding: '6px 8px', fontVariantNumeric: 'tabular-nums' }}>{r.table_count ?? '—'}</td>
                      <td style={{ padding: '6px 8px', fontVariantNumeric: 'tabular-nums' }}>{r.row_count != null ? r.row_count.toLocaleString() : '—'}</td>
                      <td style={{ padding: '6px 8px', fontVariantNumeric: 'tabular-nums' }}>{fmtSize(r.size_bytes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* RESTORE — super_admin only */}
        <div style={{ ...card, padding: 20, marginTop: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <RotateCcw size={17} color="var(--color-primary-600)" />
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Restore</h2>
            <span style={{ fontFamily: 'monospace', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '2px 8px', borderRadius: 999, background: 'color-mix(in srgb, var(--color-primary-500) 12%, transparent)', color: 'var(--color-primary-700)' }}>super admin</span>
          </div>
          {isSuper ? (
            <RestorePanel destinationDriver={form.destination_driver} />
          ) : (
            <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 7, color: 'var(--text-tertiary)', fontSize: '0.82rem' }}>
              <Lock size={14} /> Only a super admin can restore backups.
            </p>
          )}
        </div>
      </div>

      {assignOpen && (
        <AssignTablesModal onClose={() => setAssignOpen(false)} onSaved={load} />
      )}
    </SettingsLayout>
  );
}
