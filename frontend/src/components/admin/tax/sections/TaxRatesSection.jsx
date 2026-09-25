import { useState } from 'react';
import { Plus, Lock } from 'lucide-react';
import useTaxStore from '../../../../store/taxStore';
import SimpleTable from '../../ui/SimpleTable';
import { Toolbar } from '../../ui/HubHeader';
import { SelectInput } from '../../ui/Form';
import StatusBadge from '../../../common/StatusBadge';
import TaxRateForm from '../forms/TaxRateForm';
import RowActions from './RowActions';
import useDeleteConfirm from './useDeleteConfirm';
import { formatMoney } from '../../../../lib/money';
import { btnPrimary, colors } from '../../../../theme/tokens';

const today = () => new Date().toISOString().slice(0, 10);

export const formatRate = (r) => r.rate_type === 'percentage'
  ? `${Number(r.rate_value)}%`
  : `${formatMoney(r.rate_value, r.currency ?? '')}${r.unit ? ` / ${r.unit.code}` : ''}`;

const periodStatus = (r) => {
  const t = today();
  if (!r.is_active) return ['inactive', undefined];
  if (r.valid_from?.slice(0, 10) > t) return ['pending', 'Scheduled'];
  if (r.valid_until && r.valid_until.slice(0, 10) < t) return ['expired', 'Ended'];
  return ['active', 'In effect'];
};

export default function TaxRatesSection({ canWrite }) {
  const { types, rates, loading, actionLoading, deleteRate } = useTaxStore();
  const [editing, setEditing] = useState(null);
  const [typeFilter, setTypeFilter] = useState('');
  const { ask, modal } = useDeleteConfirm(actionLoading);

  const rows = typeFilter ? rates.filter((r) => r.tax_type_id === Number(typeFilter)) : rates;

  const columns = [
    { key: 'type', label: 'Tax type', render: (r) => r.tax_type?.code ?? '—' },
    { key: 'classification', label: 'Classification', render: (r) => r.classification ?? 'standard' },
    { key: 'rate', label: 'Rate', render: (r) => (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700, color: colors.text }}>
        {formatRate(r)}
        {r.applications_count > 0 && <Lock size={11} aria-label="Charged on orders — amount locked" style={{ color: colors.textFaint }} />}
      </span>
    ) },
    { key: 'period', label: 'Applies', render: (r) => `${r.valid_from?.slice(0, 10)} → ${r.valid_until?.slice(0, 10) ?? 'open'}` },
    { key: 'status', label: 'Status', render: (r) => { const [s, l] = periodStatus(r); return <StatusBadge status={s} label={l} />; } },
    { key: 'cert', label: 'Certificate', render: (r) => (r.requires_certificate ? 'Required' : '—') },
    ...(canWrite ? [{
      key: 'actions', label: '', align: 'right',
      render: (r) => (
        <RowActions label="rate" onEdit={() => setEditing(r)}
          onDelete={r.applications_count > 0 ? undefined : () => ask({
            title: 'Delete this rate?', message: `${r.tax_type?.code ?? ''} ${formatRate(r)} will be removed.`,
            run: () => deleteRate(r.id), done: 'Rate deleted',
          })} />
      ),
    }] : []),
  ];

  return (
    <div>
      <Toolbar right={canWrite && (
        <button type="button" onClick={() => setEditing('new')} disabled={!types.length}
          title={!types.length ? 'Create a tax type first' : undefined}
          style={{ ...btnPrimary, opacity: types.length ? 1 : 0.5 }}>
          <Plus size={14} /> New rate
        </button>
      )}>
        <div style={{ minWidth: 200 }}>
          <SelectInput aria-label="Filter by tax type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">All tax types</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </SelectInput>
        </div>
      </Toolbar>
      <SimpleTable columns={columns} rows={rows} loading={loading.rates}
        onRowClick={canWrite ? setEditing : undefined}
        empty={types.length ? 'No rates yet. Add the standard rate for each tax type.' : 'Create a tax type first, then add its rates.'} />
      <p style={{ margin: '10px 2px 0', fontSize: '0.7rem', color: colors.textFaint, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Lock size={11} /> Rates already charged on orders keep their amount — add a new rate with a later start date instead.
      </p>
      {editing && (
        <TaxRateForm rate={editing === 'new' ? null : editing} defaultTypeId={typeFilter ? Number(typeFilter) : undefined} onClose={() => setEditing(null)} />
      )}
      {modal}
    </div>
  );
}
