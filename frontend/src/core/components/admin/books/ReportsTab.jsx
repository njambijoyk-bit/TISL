import useCalculatorContext from '../../../../_shared/hooks/useCalculatorContext';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { colors } from '../../../../_shared/theme/tokens';
import useAuthStore from '../../../../_shared/store/authStore';
import ReportsNav from './ReportsNav';
import ReportGuide from './ReportGuide';
import DevGuide from './DevGuide';
import useDevChord from './useDevChord';
import useReportFavourites from './useReportFavourites';
import useReportKeys from './useReportKeys';
import { ALIASES, REPORTS } from './reportCatalog';
import ReportFrame from '../reports/ReportFrame';
import TrialBalanceView from '../reports/TrialBalanceView';
import StatementView from '../reports/StatementView';
import DayBookView from '../reports/DayBookView';
import LedgerStatementView from '../reports/LedgerStatementView';
import AgeingView from '../reports/AgeingView';
import TaxReturnView from '../reports/TaxReturnView';
import WithholdingView from '../reports/WithholdingView';
import RatioView from '../reports/RatioView';
import TradeView from '../reports/TradeView';
import CashFlowView from '../reports/CashFlowView';
import ControlAccountsView from '../reports/ControlAccountsView';
import BooksHealthView from '../reports/BooksHealthView';
import { ChangesInEquityView, AdjustedTrialBalanceView } from '../reports/EquityViews';
import StockJournalView from '../reports/StockJournalView';
import { StockSummaryView, StockQueryView } from '../reports/StockReportViews';
import { MoneyFlowBody } from './MoneyFlow';
import { hasPermission } from '../../../../_shared/lib/roles';
import ProfitLossByCostCentreView from '../reports/ProfitLossByCostCentreView';

/** Alt+C: what the profit and loss, balance sheet or trial balance says, on the dates shown. */
function CalcContext({ report, from, to }) {
  useCalculatorContext({ type: 'report', report, from, to });
  return null;
}

function EngineView({ engine, result, drill, opts }) {
  if (['profit-loss', 'balance-sheet', 'trial-balance'].includes(engine)) return (<><CalcContext report={engine} from={result.from} to={result.to} />{engine === 'trial-balance' ? <TrialBalanceView result={result} /> : <StatementView result={result} />}</>);
  if (engine === 'profit-loss-by-cost-centre') return <ProfitLossByCostCentreView result={result} />;
  if (engine === 'trial-balance') return <TrialBalanceView result={result} />;
  if (engine === 'day-book') return <DayBookView result={result} />;
  if (engine === 'ledger-statement') return <LedgerStatementView result={result} />;
  if (engine === 'tax-return') return <TaxReturnView result={result} />;
  if (engine === 'withholding') return <WithholdingView result={result} />;
  if (engine === 'ratio-analysis') return <RatioView result={result} />;
  if (engine === 'stock-summary' || engine === 'stock-location-summary') return <StockSummaryView result={result} opts={opts} />;
  if (engine === 'stock-query') return <StockQueryView result={result} drill={drill} />;
  if (engine === 'changes-in-equity') return <ChangesInEquityView result={result} />;
  if (engine === 'adjusted-trial-balance') return <AdjustedTrialBalanceView result={result} />;
  if (engine === 'stock-journal') return <StockJournalView result={result} />;
  if (engine === 'trade') return <TradeView result={result} drill={drill} />;
  if (engine === 'books-health') return <BooksHealthView result={result} />;
  if (engine === 'control-accounts') return <ControlAccountsView result={result} drill={drill} />;
  if (engine === 'cash-flow') return <CashFlowView result={result} />;
  if (engine === 'money-flow') return <MoneyFlowBody data={result.data} />;
  if (engine === 'receivables-ageing' || engine === 'payables-ageing') return <AgeingView result={result} />;
  return <StatementView result={result} />;
}

export default function ReportsTab() {
  const [params, setParams] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const visible = REPORTS.filter((r) => !r.permission || hasPermission(null, r.permission));
  const asked = ALIASES[params.get('report')] ?? params.get('report');   // links from elsewhere still say 'day-book', 'trial-balance'...
  const def = visible.find((r) => r.id === asked) ?? visible.find((r) => r.id === 'engine-day-book') ?? visible[0];
  const fav = useReportFavourites(user?.id);
  const searchRef = useRef(null);
  const [goHint, setGoHint] = useState(false);
  const [dev, setDev] = useState(() => { try { return localStorage.getItem('report-dev') === '1'; } catch { return false; } });
  const flipDev = () => setDev((v) => { try { localStorage.setItem('report-dev', v ? '0' : '1'); } catch { /* kept for this visit only */ } return !v; });
  useDevChord(flipDev);

  const open = (r) => { const p = new URLSearchParams(params); p.set('report', r.id); p.delete('ledger'); setParams(p, { replace: true }); };
  const star = (r) => { if (!fav.toggle(r.engine)) toast.error('Favourites hold nine reports. Unstar one first.'); };
  useReportKeys({ visible, current: def, open, star, favourites: fav.keys, onGo: setGoHint });
  useEffect(() => { document.title = `${def.label} · Books`; }, [def.label]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(190px, 230px) minmax(0, 1fr)', gap: 18, alignItems: 'start' }} className="reports-layout">
      <ReportsNav visible={visible} current={def} open={open} favourites={fav.keys} onStar={star} searchRef={searchRef} goHint={goHint} />
      <div style={{ minWidth: 0 }}>
        <header style={{ marginBottom: 12 }}>
          <div style={{ fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.textFaint }}>{def.group}</div>
          <h2 style={{ margin: '2px 0 0', fontSize: '1.3rem', fontWeight: 800, letterSpacing: '-0.01em', color: colors.primary }}>{def.label}</h2>
        </header>
        <ReportFrame key={def.engine + (params.get('ledger') ?? '')} reportKey={def.engine} initialOpts={def.engine === 'ledger-statement' && params.get('ledger') ? { ledger_id: params.get('ledger') } : {}}>
          {(r, api) => <EngineView engine={def.engine} result={r} drill={api?.drill} opts={api?.opts} />}
        </ReportFrame>
        <ReportGuide report={def} reports={visible} open={open} />
        {!dev && (
          <div style={{ textAlign: 'right', marginTop: 8 }}>
            <button type="button" onClick={flipDev} title="Developer guide (Shift + D + E + V together)"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', fontFamily: 'ui-monospace, monospace', fontSize: '0.7rem', color: colors.textFaint }}>//dev</button>
          </div>
        )}
        {dev && <DevGuide report={def} onClose={flipDev} />}
      </div>
      <style>{`@media (max-width: 800px) { .reports-layout { grid-template-columns: minmax(0, 1fr) !important; } }`}</style>
    </div>
  );
}
