import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ListTree, Star } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BarChart3, Lock, Power } from 'lucide-react';
import toast from 'react-hot-toast';
import booksAPI from '../../../_shared/api/books';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import useAuthStore from '../../../_shared/store/authStore';
import { hasPermission } from '../../../_shared/lib/roles';
import { btnPrimary, card, colors } from '../../../_shared/theme/tokens';
import { Field, NumberInput, SelectInput, TextInput } from '../../../core/components/admin/ui/Form';
import ExportProgress from './ExportProgress';
import VisualCard from './VisualCard';
import { DEFS, SOURCE } from './visualDefs';
import VisualNav from './VisualNav';
import useVisualFavourites from './useVisualFavourites';
import useVisualKeys from './useVisualKeys';
import { CHARTS, QUESTIONS } from './visualCatalog';
import { PRESETS, compareChoices, compareFor, compareWarning, label, periodFor, stepMonths } from './visualPeriods';
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
  const [wanted, setWanted] = useState('none');
  const [back, setBack] = useState(1);
  const [cmpCustom, setCmpCustom] = useState({ from: '', to: '' });
  const [query, setQuery] = useSearchParams();
  const [goHint, setGoHint] = useState(false);
  const fav = useVisualFavourites(user?.id);

  useEffect(() => { booksAPI.visualsStatus().then((r) => setState(r.state)).catch((e) => { toast.error(errMsg(e, 'Could not check Extras')); setState('error'); }); }, []);
  useEffect(() => { if (state === 'active') booksAPI.visualsCatalog().then(setCatalog).catch((e) => toast.error(errMsg(e, 'Could not load the charts'))); }, [state]);

  const years = useMemo(() => catalog?.years ?? [], [catalog]);
  const period = useMemo(() => periodFor(preset, { years, n, custom }), [preset, years, n, custom]);
  const choices = useMemo(() => compareChoices(preset, period, { n, years }), [preset, period, n, years]);
  const mode = choices.some(([k]) => k === wanted) ? wanted : 'none';   // a choice the new period does not offer falls back to none
  const other = useMemo(() => compareFor(mode, period, { n: back, custom: cmpCustom, years, unit: stepMonths(preset, n) }), [mode, period, back, cmpCustom, years, preset, n]);
  const warning = useMemo(() => compareWarning(period, other), [period, other]);
  const params = useMemo(() => ({ from: period.from, to: period.to, ...(other ? { compare_from: other.from, compare_to: other.to } : {}) }), [period, other]);
  const openLedger = (id) => nav(`/admin/books?tab=reports&report=ledger&ledger=${id}`);
  const openPlanning = () => nav('/admin/books?tab=settings&sub=planning');

  const available = useMemo(() => { const have = new Set((catalog?.charts ?? []).map((c) => c.key)); return CHARTS.filter((c) => DEFS[c.key] && (!catalog || have.has(c.key))); }, [catalog]);
  const chartKey = query.get('chart');
  const boardId = query.get('board');
  const current = available.find((c) => c.key === chartKey) ?? null;
  const go = (patch) => { const p = new URLSearchParams(query); p.delete('chart'); p.delete('board'); Object.entries(patch).forEach(([k, v]) => p.set(k, v)); setQuery(p); };
  useVisualKeys({
    charts: state === 'active' ? available : [], current, open: (c) => go({ chart: c.key }), home: () => go({}),
    star: (c) => { if (!fav.toggle(c.key)) toast.error('Favourites hold nine charts. Unstar one first.'); }, favourites: fav.keys, onGo: setGoHint,
  });

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

  const question = QUESTIONS.find((q) => q.id === boardId) ?? null;
  const card1 = (k, wide) => <VisualCard key={k} def={wide === undefined ? DEFS[k] : { ...DEFS[k], wide }} chartKey={k} params={params} openLedger={openLedger} openPlanning={openPlanning} />;
  const link = { background: 'none', border: 'none', cursor: 'pointer', color: colors.primary, fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 600, padding: 0, display: 'inline-flex', alignItems: 'center', gap: 5 };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <ExportProgress />
      <div style={{ ...card, padding: 14, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <BarChart3 size={18} style={{ color: colors.primary, marginBottom: 8 }} aria-hidden />
        <Field label="Period" htmlFor="vis-preset"><SelectInput id="vis-preset" value={preset} onChange={(e) => setPreset(e.target.value)}>{PRESETS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</SelectInput></Field>
        {preset === 'last-n' && <Field label="Months" htmlFor="vis-n"><NumberInput id="vis-n" min={1} max={60} value={n} onChange={(e) => setN(e.target.value)} style={{ width: 80 }} /></Field>}
        {preset === 'custom' && <>
          <Field label="From" htmlFor="vis-from"><TextInput id="vis-from" type="date" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} /></Field>
          <Field label="To" htmlFor="vis-to"><TextInput id="vis-to" type="date" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} /></Field>
        </>}
        <Field label="Compare with" htmlFor="vis-cmp"><SelectInput id="vis-cmp" value={mode} onChange={(e) => setWanted(e.target.value)}>{choices.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</SelectInput></Field>
        {mode === 'previous' && <Field label="Periods back" htmlFor="vis-back"><NumberInput id="vis-back" min={1} max={60} value={back} onChange={(e) => setBack(e.target.value)} style={{ width: 80 }} /></Field>}
        {mode === 'custom' && <>
          <Field label="Other from" htmlFor="vis-cfrom"><TextInput id="vis-cfrom" type="date" value={cmpCustom.from} onChange={(e) => setCmpCustom((c) => ({ ...c, from: e.target.value }))} /></Field>
          <Field label="Other to" htmlFor="vis-cto"><TextInput id="vis-cto" type="date" value={cmpCustom.to} onChange={(e) => setCmpCustom((c) => ({ ...c, to: e.target.value }))} /></Field>
        </>}
        <div style={{ fontSize: '0.78rem', color: colors.textMuted, paddingBottom: 8 }}>
          <b style={{ color: colors.text }}>{label(period.from, period.to)}</b>{other ? <> against <b style={{ color: colors.text }}>{label(other.from, other.to)}</b></> : null}
        </div>
      </div>

      {warning && <div role="status" style={{ padding: '8px 12px', borderRadius: 8, background: colors.warningBg, color: colors.warningText, fontSize: '0.78rem' }}>{warning}</div>}

      {!catalog ? <p style={{ fontSize: '0.85rem', color: colors.textFaint }}>Loading…</p> : current ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(190px, 240px) minmax(0, 1fr)', gap: 18, alignItems: 'start' }} className="vis-layout">
          <VisualNav charts={available} current={current} open={(c) => go({ chart: c.key })} favourites={fav.keys} onStar={(c) => { if (!fav.toggle(c.key)) toast.error('Favourites hold nine charts. Unstar one first.'); }} goHint={goHint} />
          <div style={{ minWidth: 0, display: 'grid', gap: 10 }}>
            <button type="button" style={link} onClick={() => go({})}><ArrowLeft size={14} /> Questions</button>
            {card1(current.key, false)}
          </div>
          <style>{'@media (max-width: 800px) { .vis-layout { grid-template-columns: minmax(0, 1fr) !important; } }'}</style>
        </div>
      ) : question ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" style={link} onClick={() => go({})}><ArrowLeft size={14} /> Questions</button>
            <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: colors.primary }}>{question.title}</h2>
            <span style={{ flex: 1 }} />
            <button type="button" style={link} onClick={() => go({ chart: question.charts[0] })}><ListTree size={14} /> See all charts</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>{question.charts.filter((k) => available.some((c) => c.key === k)).map((k) => card1(k))}</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: colors.primary }}>What do you want to know?</h2>
            <span style={{ flex: 1 }} />
            <button type="button" style={{ ...btnPrimary, display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => go({ chart: available[0]?.key })}><ListTree size={14} /> See all charts</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
            {QUESTIONS.map((q) => {
              const n = q.charts.filter((k) => available.some((c) => c.key === k)).length;
              return (
                <button key={q.id} type="button" onClick={() => go({ board: q.id })} style={{ ...card, textAlign: 'left', padding: '14px 16px', cursor: 'pointer', display: 'grid', gap: 4, fontFamily: 'inherit', color: colors.text }}>
                  <b style={{ fontSize: '0.92rem' }}>{q.title}</b>
                  <span style={{ fontSize: '0.74rem', color: colors.textMuted }}>{q.blurb}</span>
                  <span style={{ fontSize: '0.68rem', fontFamily: 'ui-monospace, monospace', color: colors.primaryDeep }}>{n} chart{n === 1 ? '' : 's'}</span>
                </button>
              );
            })}
          </div>
          {fav.keys.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.textFaint, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Star size={12} /> Favourites</span>
              {fav.keys.filter((k) => DEFS[k]).map((k, i) => (
                <button key={k} type="button" onClick={() => go({ chart: k })} style={{ ...card, padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem', color: colors.text }}><b style={{ color: colors.warningText, marginRight: 6 }}>{i + 1}</b>{DEFS[k].title}</button>
              ))}
            </div>
          )}
          <p style={{ margin: 0, fontSize: '0.74rem', color: colors.textFaint }}>Keys: press <b>G</b> then a chart's key to go to it (it is shown in the list), <b>G 0</b> to come back here, <b>1–9</b> for your favourites.</p>
        </div>
      )}
      {goHint && !current && <div role="status" style={{ position: 'fixed', left: 16, bottom: 16, zIndex: 20, padding: '8px 12px', borderRadius: 8, background: colors.warningBg, color: colors.warningText, fontSize: '0.78rem', boxShadow: '0 4px 14px rgba(0,0,0,0.12)' }}>Go to a chart: press its key (0 for the questions)</div>}
    </div>
  );
}
