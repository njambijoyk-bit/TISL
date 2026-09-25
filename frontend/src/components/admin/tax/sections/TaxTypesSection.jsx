import { useState } from 'react';
import { Plus } from 'lucide-react';
import useTaxStore from '../../../../store/taxStore';
import SimpleTable from '../../ui/SimpleTable';
import { Toolbar } from '../../ui/HubHeader';
import StatusBadge from '../../../common/StatusBadge';
import TaxTypeForm from '../forms/TaxTypeForm';
import RowActions from './RowActions';
import useDeleteConfirm from './useDeleteConfirm';
import { btnPrimary, colors } from '../../../../theme/tokens';

export default function TaxTypesSection({ canWrite }) {
  const { types, rates, rules, loading, actionLoading, deleteType } = useTaxStore();
  const [editing, setEditing] = useState(null);
  const { ask, modal } = useDeleteConfirm(actionLoading);

  const columns = [
    { key: 'name', label: 'Name', render: (t) => <strong style={{ color: colors.text, fontWeight: 600 }}>{t.name}</strong> },
    { key: 'code', label: 'Code', render: (t) => <span style={{ fontFamily: 'monospace' }}>{t.code}</span> },
    { key: 'application_mode', label: 'Applied as', render: (t) => <StatusBadge status={t.application_mode} dot={false} /> },
    { key: 'rates', label: 'Rates', align: 'right', render: (t) => rates.filter((r) => r.tax_type_id === t.id).length },
    { key: 'rules', label: 'Rules', align: 'right', render: (t) => rules.filter((r) => r.tax_type_id === t.id).length },
    { key: 'is_active', label: 'Status', render: (t) => <StatusBadge status={t.is_active ? 'active' : 'inactive'} /> },
    ...(canWrite ? [{
      key: 'actions', label: '', align: 'right',
      render: (t) => (
        <RowActions label={t.name} onEdit={() => setEditing(t)} onDelete={() => ask({
          title: `Delete ${t.name}?`,
          message: 'Only possible while it has no rates or rules. Otherwise deactivate it instead.',
          run: () => deleteType(t.id), done: `${t.name} deleted`,
        })} />
      ),
    }] : []),
  ];

  return (
    <div>
      <Toolbar right={canWrite && <button type="button" onClick={() => setEditing('new')} style={btnPrimary}><Plus size={14} /> New tax type</button>}>
        <p style={{ margin: 0, fontSize: '0.78rem', color: colors.textMuted }}>Each type (VAT, excise, withholding…) has its own rates and rules.</p>
      </Toolbar>
      <SimpleTable columns={columns} rows={types} loading={loading.types}
        onRowClick={canWrite ? setEditing : undefined}
        empty="No tax types yet. Start with VAT." />
      {editing && <TaxTypeForm type={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {modal}
    </div>
  );
}
