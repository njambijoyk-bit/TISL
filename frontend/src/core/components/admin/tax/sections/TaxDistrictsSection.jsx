import { useMemo, useState } from 'react';
import { Plus, CornerDownRight } from 'lucide-react';
import useTaxStore from '../../../../../_shared/store/taxStore';
import SimpleTable from '../../ui/SimpleTable';
import { Toolbar } from '../../ui/HubHeader';
import StatusBadge from '../../../../../_shared/components/common/StatusBadge';
import TaxDistrictForm from '../forms/TaxDistrictForm';
import RowActions from './RowActions';
import useDeleteConfirm from './useDeleteConfirm';
import { btnPrimary, colors } from '../../../../../_shared/theme/tokens';

export default function TaxDistrictsSection({ canWrite }) {
  const { districts, loading, actionLoading, deleteDistrict } = useTaxStore();
  const [editing, setEditing] = useState(null);
  const { ask, modal } = useDeleteConfirm(actionLoading);

  // Tree order: parents followed by their children, indented
  const rows = useMemo(() => {
    const kids = new Map();
    districts.forEach((d) => { const k = d.parent_id ?? null; kids.set(k, [...(kids.get(k) ?? []), d]); });
    const out = []; const seen = new Set();
    const walk = (pid, depth) => (kids.get(pid) ?? []).sort((a, b) => a.name.localeCompare(b.name)).forEach((d) => {
      if (seen.has(d.id)) return; seen.add(d.id); out.push({ ...d, depth }); walk(d.id, depth + 1);
    });
    walk(null, 0);
    districts.forEach((d) => { if (!seen.has(d.id)) out.push({ ...d, depth: 0 }); });
    return out;
  }, [districts]);

  const columns = [
    { key: 'name', label: 'District', render: (d) => (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, paddingLeft: d.depth * 18, color: colors.text, fontWeight: d.depth ? 500 : 600 }}>
        {d.depth > 0 && <CornerDownRight size={12} style={{ color: colors.textGhost }} />}{d.name}
      </span>
    ) },
    { key: 'level', label: 'Level', render: (d) => d.level.replace('_', ' ') },
    { key: 'code', label: 'Code', render: (d) => d.code ?? '—' },
    { key: 'locale', label: 'Country' },
    { key: 'status', label: 'Status', render: (d) => <StatusBadge status={d.is_active ? 'active' : 'inactive'} /> },
    ...(canWrite ? [{
      key: 'actions', label: '', align: 'right',
      render: (d) => (
        <RowActions label={d.name} onEdit={() => setEditing(d)} onDelete={() => ask({
          title: `Delete ${d.name}?`,
          message: 'Not possible while it has smaller districts inside it or is used by a tax rule.',
          run: () => deleteDistrict(d.id), done: `${d.name} deleted`,
        })} />
      ),
    }] : []),
  ];

  return (
    <div>
      <Toolbar right={canWrite && <button type="button" onClick={() => setEditing('new')} style={btnPrimary}><Plus size={14} /> New district</button>}>
        <p style={{ margin: 0, fontSize: '0.78rem', color: colors.textMuted }}>Places a rule can be limited to. A rule for a county also covers the towns inside it.</p>
      </Toolbar>
      <SimpleTable columns={columns} rows={rows} loading={loading.districts}
        onRowClick={canWrite ? setEditing : undefined}
        empty="No districts. Rules then apply everywhere, which is fine for most setups." />
      {editing && <TaxDistrictForm district={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {modal}
    </div>
  );
}
