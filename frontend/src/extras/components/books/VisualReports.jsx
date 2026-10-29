import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Lock, Power } from 'lucide-react';
import toast from 'react-hot-toast';
import booksAPI from '../../../_shared/api/books';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import useAuthStore from '../../../_shared/store/authStore';
import { hasPermission } from '../../../_shared/lib/roles';
import { btnPrimary, card, colors } from '../../../_shared/theme/tokens';
import { Field, NumberInput, SelectInput, TextInput } from '../../../core/components/admin/ui/Form';
import VisualCard from './VisualCard';
import { DEFS, SOURCE } from './visualDefs';
import { COMPARES, PRESETS, compareFor, label, periodFor } from './visualPeriods';
import { SAMPLE } from './visualSample';

function Notice({ icon, title, children }) {
  return (
    <div style={{ ...card, padding: '28px 24px', textAlign: 'center', maxWidth: 640, margin: '0 auto' }}>
      {icon}
      <h2 style={{ margin: '10px 0 6px', fontSize: '1.05rem' }}>{title}</h2>
      <div style={{ fontSize: '0.84rem', color: colors.textMuted, lineHeight: 1.5 }}>{children}</div>
    </div>
  );
}

/**
 * Books -> Visual reports (the Extras module). Three states: not licensed (an invitation and a peek at made-up figures), licensed but switched off, and active: the
 * charts, for a period chosen above them and, when asked, set against a second one. Every chart fetches its own figures as it scrolls into view.
 */
export default function VisualReports() {
  const nav = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [state, setState] = useState(null);   // not_licensed | off | active
  const [catalog, setCatalog] = useState(null);
  const [preset, setPreset] = useState('this-year');
  const [n, setN] = useState(3);
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [mode, setMode] = useState('none');
  const [back, setBack] = useState(1);
  const [cmpCustom, setCmpCustom] = useState({ from: '', to: '' });

  useEffect(() => { booksAPI.visualsStatus().then((r) => setState(r.state)).catch((e) => { toast.error(errMsg(e, 'Could not check Extras')); setState('error'); }); }, []);
  useEffect(() => { if (state === 'active') booksAPI.visualsCatalog().then(setCatalog).catch((e) => toast.error(errMsg(e, 'Could not load the charts'))); }, [state]);

  const years = useMemo(() => catalog?.years ?? [], [catalog]);
  const period = useMemo(() => periodFor(preset, { years, n, custom }), [preset, years, n, custom]);
  const other = useMemo(() => compareFor(mode, period, { n: back, custom: cmpCustom, years }), [mode, period, back, cmpCustom, years]);
  const params = useMemo(() => ({ from: period.from, to: period.to, ...(other ? { compare_from: other.from, compare_to: other.to } : {}) }), [period, other]);
  const openLedger = (id) => nav(`/admin/books?tab=reports&report=ledger&ledger=${id}`);

  if (state === null) return <p style={{ fontSize: '0.85rem', color: colors.textFaint }}>Loading…</p>;
  if (state === 'error') return null;

  if (state === 'off') {
    const canSwitch = hasPermission(user, 'system.modules');
    return (
      <Notice icon={<Power size={30} style={{ color: colors.primary }} aria-hidden />} title="Extras is licensed, but switched off">
        <p style={{ margin: '0 0 14px' }}>The charts are all here, waiting. Nobody has flipped the switch yet, so they are sulking in the dark.</p>
        {canSwitch ? <button type="button" style={btnPrimary} onClick={() => nav('/admin/settings/modules')}>Open Module Center</button> : <span>Ask an administrator to switch Extras on in Module Center.</span>}
      </Notice>
    );
  }

  if (state === 'not_licensed') {
    const keys = ['cash', 'expense-donut', 'customers', 'waterfall', 'trend', 'ageing'];
    return (
      <div style={{ display: 'grid', gap: 16 }}>
        <Notice icon={<Lock size={30} style={{ color: colors.primary }} aria-hidden />} title="Visual reports come with Extras">
          Your books drawn as charts: cash flow, where the money goes, who owes you, how old the debts are, profit step by step and more, all from the same figures as your reports.
          Below is a peek with <b>made-up sample figures</b>; license Extras to see your own.
        </Notice>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', top: 8, right: 12, zIndex: 2, fontSize: '0.7rem', fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: colors.warningBg, color: colors.warningText }}>SAMPLE DATA</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, pointerEvents: 'none' }} aria-hidden>
            {keys.map((k) => <VisualCard key={k} def={{ ...DEFS[k], wide: false }} chartKey={k} params={{}} sample={SAMPLE[SOURCE[k]]} />)}
          </div>
        </div>
      </div>
    );
  }

  const keys = (catalog?.charts ?? []).map((c) => c.key).filter((k) => DEFS[k]);
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ ...card, padding: 14, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <BarChart3 size={18} style={{ color: colors.primary, marginBottom: 8 }} aria-hidden />
        <Field label="Period" htmlFor="vis-preset"><SelectInput id="vis-preset" value={preset} onChange={(e) => setPreset(e.target.value)}>{PRESETS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</SelectInput></Field>
        {preset === 'last-n' && <Field label="Months" htmlFor="vis-n"><NumberInput id="vis-n" min={1} max={60} value={n} onChange={(e) => setN(e.target.value)} style={{ width: 80 }} /></Field>}
        {preset === 'custom' && <>
          <Field label="From" htmlFor="vis-from"><TextInput id="vis-from" type="date" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} /></Field>
          <Field label="To" htmlFor="vis-to"><TextInput id="vis-to" type="date" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} /></Field>
        </>}
        <Field label="Compare with" htmlFor="vis-cmp"><SelectInput id="vis-cmp" value={mode} onChange={(e) => setMode(e.target.value)}>{COMPARES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</SelectInput></Field>
        {mode === 'previous' && <Field label="Periods back" htmlFor="vis-back"><NumberInput id="vis-back" min={1} max={60} value={back} onChange={(e) => setBack(e.target.value)} style={{ width: 80 }} /></Field>}
        {mode === 'custom' && <>
          <Field label="Other from" htmlFor="vis-cfrom"><TextInput id="vis-cfrom" type="date" value={cmpCustom.from} onChange={(e) => setCmpCustom((c) => ({ ...c, from: e.target.value }))} /></Field>
          <Field label="Other to" htmlFor="vis-cto"><TextInput id="vis-cto" type="date" value={cmpCustom.to} onChange={(e) => setCmpCustom((c) => ({ ...c, to: e.target.value }))} /></Field>
        </>}
        <div style={{ fontSize: '0.78rem', color: colors.textMuted, paddingBottom: 8 }}>
          <b style={{ color: colors.text }}>{label(period.from, period.to)}</b>{other ? <> against <b style={{ color: colors.text }}>{label(other.from, other.to)}</b></> : null}
        </div>
      </div>
      {!catalog ? <p style={{ fontSize: '0.85rem', color: colors.textFaint }}>Loading…</p> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
          {keys.map((k) => <VisualCard key={k} def={DEFS[k]} chartKey={k} params={params} openLedger={openLedger} />)}
        </div>
      )}
    </div>
  );
}
