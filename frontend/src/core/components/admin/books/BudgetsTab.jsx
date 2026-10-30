import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import booksAPI from '../../../../_shared/api/books';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { hasPermission } from '../../../../_shared/lib/roles';
import { colors } from '../../../../_shared/theme/tokens';
import BudgetBar from './BudgetBar';
import BudgetGrid from './BudgetGrid';
import BudgetInitiatives from './BudgetInitiatives';
import BudgetOverspends from './BudgetOverspends';
import BudgetsList from './BudgetsList';
import BudgetTemplates from './BudgetTemplates';
import BudgetTransfers from './BudgetTransfers';

/**
 * Books -> Budgets: making a budget and working on it. Current and past budgets in one list; the budget on screen with its version and where that stands (draft, waiting for approval,
 * approved, locked); its rows by month; moves between lines once approved; templates; the initiatives a budget can be for; and the overspends waiting for approval.
 * How vouchers over budget are treated, and the cash forecast's assumptions, are under Configuration -> Budget settings.
 */
export default function BudgetsTab() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [versionId, setVersionId] = useState(null);
  const [data, setData] = useState(null);
  const canPlan = hasPermission(null, 'books.planning');
  const load = useCallback((forVersion) => booksAPI.planning({ from: `${year}-01-01`, to: `${year}-12-31`, version_id: (typeof forVersion === 'number' ? forVersion : versionId) || undefined })
    .then((r) => { setData(r); if (!versionId && r.version_id) setVersionId(r.version_id); }).catch((e) => toast.error(errMsg(e, 'Could not load the budgets'))), [year, versionId]);
  useEffect(() => { load(); }, [load]);
  if (!data) return <p style={{ fontSize: '0.85rem', color: colors.textFaint }}>Loading…</p>;
  const version = data.budgets.flatMap((b) => b.versions).find((v) => v.id === versionId);
  const canEdit = canPlan && (!version || version.status === 'draft');   // an approved or locked version is the plan as agreed: it is changed by making a revision
  const openBudget = (b, v) => { setVersionId(v.id); setYear(Number(b.from_month.slice(0, 4))); };

  return (
    <div>
      {!canPlan && <p style={{ fontSize: '0.78rem', color: colors.textFaint }}>You can look at budgets; making and changing them needs the Planning permission.</p>}
      <BudgetsList budgets={data.budgets} openId={versionId} open={openBudget} />
      <BudgetBar data={data} versionId={versionId} setVersionId={setVersionId} setYear={setYear} reload={load} />
      <BudgetGrid data={data} year={year} setYear={setYear} reload={load} canEdit={canEdit} versionId={versionId} />
      <BudgetTransfers data={data} version={version} reload={load} />
      <BudgetOverspends data={data} reload={load} />
      <BudgetTemplates data={data} versionId={versionId} canEdit={canPlan} reload={load} onMade={(v, y) => { setVersionId(v); setYear(y); }} />
      <BudgetInitiatives initiatives={data.choices.initiatives} canEdit={canPlan} reload={load} />
    </div>
  );
}
