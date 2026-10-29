import useCalculatorContext from '../../../../_shared/hooks/useCalculatorContext';
import { useSearchParams } from 'react-router-dom';
import { colors } from '../../../../_shared/theme/tokens';
import { filterStyle } from './booksFmt';
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

const REPORTS = [
  { id: 'engine-day-book', label: 'Day book', custom: true, engine: 'day-book' },
  { id: 'engine-ledger', label: 'Ledger statement', custom: true, engine: 'ledger-statement' },
  { id: 'engine-trial-balance', label: 'Trial balance', custom: true, engine: 'trial-balance' },
  { id: 'engine-profit-loss', label: 'Profit & loss', custom: true, engine: 'profit-loss' },
  { id: 'engine-balance-sheet', label: 'Balance sheet', custom: true, engine: 'balance-sheet' },
  { id: 'engine-changes-in-equity', label: 'Changes in equity', custom: true, engine: 'changes-in-equity' },
  { id: 'engine-adjusted-tb', label: 'Adjusted trial balance', custom: true, engine: 'adjusted-trial-balance' },
  { id: 'engine-pl-cost-centre', label: 'Profit & loss by cost centre', custom: true, engine: 'profit-loss-by-cost-centre' },
  { id: 'engine-receivables', label: 'Receivables ageing', custom: true, engine: 'receivables-ageing' },
  { id: 'engine-payables', label: 'Payables ageing', custom: true, engine: 'payables-ageing' },
  { id: 'engine-tax-return', label: 'Tax return', custom: true, engine: 'tax-return' },
  { id: 'engine-withholding', label: 'Withholding certificates', custom: true, engine: 'withholding' },
  { id: 'engine-ratio-analysis', label: 'Ratio analysis', custom: true, engine: 'ratio-analysis' },
  { id: 'engine-cash-flow', label: 'Cash flow statement', custom: true, engine: 'cash-flow' },
  { id: 'engine-money-flow', label: 'Money flow', custom: true, engine: 'money-flow' },
  { id: 'engine-stock-journal', label: 'Stock journal', custom: true, engine: 'stock-journal', permission: 'stock.view' },
  { id: 'engine-stock-summary', label: 'Stock summary', custom: true, engine: 'stock-summary', permission: 'stock.view' },
  { id: 'engine-stock-location', label: 'Location summary', custom: true, engine: 'stock-location-summary', permission: 'stock.view' },
  { id: 'engine-stock-query', label: 'Stock query', custom: true, engine: 'stock-query', permission: 'stock.view' },
  { id: 'engine-books-health', label: 'Books health', custom: true, engine: 'books-health' },
  { id: 'engine-control-accounts', label: 'Control-account checks', custom: true, engine: 'control-accounts' },
  { id: 'engine-trade', label: 'Trade by party and item', custom: true, engine: 'trade' },
];

const ENGINE_ALIAS = { 'day-book': 'engine-day-book', ledger: 'engine-ledger', receivables: 'engine-receivables', payables: 'engine-payables', 'tax-return': 'engine-tax-return', withholding: 'engine-withholding', 'ratio-analysis': 'engine-ratio-analysis', 'trial-balance': 'engine-trial-balance', 'profit-loss': 'engine-profit-loss', 'balance-sheet': 'engine-balance-sheet', trade: 'engine-trade', 'money-flow': 'engine-money-flow', 'cash-flow': 'engine-cash-flow', 'control-accounts': 'engine-control-accounts', 'books-health': 'engine-books-health', 'profit-loss-by-cost-centre': 'engine-pl-cost-centre', 'stock-journal': 'engine-stock-journal', 'changes-in-equity': 'engine-changes-in-equity', 'adjusted-trial-balance': 'engine-adjusted-tb', 'stock-summary': 'engine-stock-summary', 'stock-location-summary': 'engine-stock-location', 'stock-query': 'engine-stock-query' };

/** The screen of each report on the engine. */
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
  const visible = REPORTS.filter((r) => !r.permission || hasPermission(null, r.permission));
  const asked = ENGINE_ALIAS[params.get('report')] ?? params.get('report');   // links from elsewhere still say 'day-book', 'trial-balance'...
  const id = visible.some((r) => r.id === asked) ? asked : 'engine-day-book';
  const def = visible.find((r) => r.id === id);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {visible.map((r) => (
          <button key={r.id} type="button" onClick={() => { const p = new URLSearchParams(params); p.set('report', r.id); setParams(p, { replace: true }); }}
            style={{ ...filterStyle, cursor: 'pointer', fontWeight: r.id === id ? 700 : 500, background: r.id === id ? colors.tint(0.1) : 'var(--surface-card, #fff)', color: r.id === id ? colors.primaryDeep : colors.text }}>
            {r.label}
          </button>
        ))}
      </div>
      <ReportFrame key={def.engine + (params.get('ledger') ?? '')} reportKey={def.engine} initialOpts={def.engine === 'ledger-statement' && params.get('ledger') ? { ledger_id: params.get('ledger') } : {}}>
        {(r, api) => <EngineView engine={def.engine} result={r} drill={api?.drill} opts={api?.opts} />}
      </ReportFrame>
    </div>
  );
}
