import { useState } from 'react';
import { Plus } from 'lucide-react';
import useTaxStore from '../../../../../_shared/store/taxStore';
import SimpleTable from '../../ui/SimpleTable';
import { Toolbar } from '../../ui/HubHeader';
import StatusBadge from '../../../../../_shared/components/common/StatusBadge';
import TaxRuleForm, { TAX_MODULES } from '../forms/TaxRuleForm';
import RowActions from './RowActions';
import useDeleteConfirm from './useDeleteConfirm';
import { btnPrimary, colors } from '../../../../../_shared/theme/tokens';

const moduleLabel = (m) => TAX_MODULES.find((x) => x.id === (m ?? ''))?.label ?? m;

export default function TaxRulesSection({ canWrite }) {
  const { types, rules, loading, actionLoading, deleteRule } = useTaxStore();
  const [editing, setEditing] = useState(null);
  const { ask, modal } = useDeleteConfirm(actionLoading);

  const columns = [
    { key: 'name', label: 'Rule', render: (r) => <strong style={{ color: colors.text, fontWeight: 600 }}>{r.name}</strong> },
    { key: 'type', label: 'Tax', render: (r) => `${r.tax_type?.code ?? '—'}${r.classification ? ` · ${r.classification}` : ''}` },
    { key: 'module', label: 'Applies to', render: (r) => moduleLabel(r.applicable_module) },
    { key: 'customers', label: 'Customers', render: (r) => (r.applicable_customer_types?.length ? r.applicable_customer_types.join(', ') : 'All') },
    { key: 'where', label: 'Where', render: (r) => (r.districts?.length ? r.districts.map((d) => d.name).join(', ') : 'Everywhere') },
    { key: 'priority', label: 'Priority', align: 'right' },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.is_active ? 'active' : 'inactive'} /> },
    ...(canWrite ? [{
      key: 'actions', label: '', align: 'right',
      render: (r) => (
        <RowActions label={r.name} onEdit={() => setEditing(r)} onDelete={() => ask({
          title: `Delete ${r.name}?`,
          message: 'Not possible if a product, service or customer has an override using it, or it has been charged on orders. Deactivate it in those cases.',
          run: () => deleteRule(r.id), done: `${r.name} deleted`,
        })} />
      ),
    }] : []),
  ];

  const additive = types.filter((t) => t.application_mode === 'additive');

  return (
    <div>
      <Toolbar right={canWrite && (
        <button type="button" onClick={() => setEditing('new')} disabled={!additive.length}
          title={!additive.length ? 'Create an additive tax type first' : undefined}
          style={{ ...btnPrimary, opacity: additive.length ? 1 : 0.5 }}>
          <Plus size={14} /> New rule
        </button>
      )}>
        <p style={{ margin: 0, fontSize: '0.78rem', color: colors.textMuted }}>Rules decide when a tax is charged. Higher priority rules are checked first.</p>
      </Toolbar>
      <SimpleTable columns={columns} rows={rules} loading={loading.rules}
        onRowClick={canWrite ? setEditing : undefined}
        empty="No rules yet, so no tax is charged. Add one for each tax you collect." />
      {editing && <TaxRuleForm rule={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {modal}
    </div>
  );
}
