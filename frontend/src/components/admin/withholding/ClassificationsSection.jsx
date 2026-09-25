import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import useWithholdingStore from '../../../store/withholdingStore';
import SimpleTable from '../ui/SimpleTable';
import { Toolbar } from '../ui/HubHeader';
import StatusBadge from '../../common/StatusBadge';
import ClassificationForm from './ClassificationForm';
import RowActions from '../tax/sections/RowActions';
import useDeleteConfirm from '../tax/sections/useDeleteConfirm';
import { btnPrimary, colors } from '../../../theme/tokens';

export default function ClassificationsSection({ canWrite }) {
  const { classifications, loading, actionLoading, fetchClassifications, deleteClassification } = useWithholdingStore();
  const [editing, setEditing] = useState(null);
  const { ask, modal } = useDeleteConfirm(actionLoading);

  useEffect(() => { fetchClassifications().catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const columns = [
    { key: 'label', label: 'Classification', render: (c) => <strong style={{ color: colors.text, fontWeight: 600 }}>{c.label}</strong> },
    { key: 'code', label: 'Code', render: (c) => <span style={{ fontFamily: 'monospace' }}>{c.code}</span> },
    { key: 'rate', label: 'Rate withheld', render: (c) => (c.default_tax_rate
      ? (c.default_tax_rate.rate_type === 'percentage' ? `${Number(c.default_tax_rate.rate_value)}%` : Number(c.default_tax_rate.rate_value))
      : <span style={{ color: colors.warningText }}>No rate set</span>) },
    { key: 'status', label: 'Status', render: (c) => <StatusBadge status={c.is_active ? 'active' : 'inactive'} /> },
    ...(canWrite ? [{
      key: 'actions', label: '', align: 'right',
      render: (c) => (
        <RowActions label={c.label} onEdit={() => setEditing(c)} onDelete={() => ask({
          title: `Delete ${c.label}?`, message: 'Not possible while customers are assigned to it. Deactivate it instead.',
          run: () => deleteClassification(c.id), done: `${c.label} deleted`,
        })} />
      ),
    }] : []),
  ];

  return (
    <div>
      <Toolbar right={canWrite && <button type="button" onClick={() => setEditing('new')} style={btnPrimary}><Plus size={14} /> New classification</button>}>
        <p style={{ margin: 0, fontSize: '0.78rem', color: colors.textMuted }}>Assign one to each withholding-agent customer on their Tax tab.</p>
      </Toolbar>
      <SimpleTable columns={columns} rows={classifications} loading={loading.classifications}
        onRowClick={canWrite ? setEditing : undefined}
        empty="No classifications yet. Create one per withholding rate you deal with." />
      {editing && <ClassificationForm classification={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {modal}
    </div>
  );
}
