import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, ArrowRightLeft } from 'lucide-react';
import SettingsLayout from '../../../../_shared/components/layout/SettingsLayout';
import HubHeader, { Toolbar } from '../../../components/admin/ui/HubHeader';
import Tabs from '../../../components/admin/ui/Tabs';
import SimpleTable from '../../../components/admin/ui/SimpleTable';
import { SelectInput, NumberInput } from '../../../components/admin/ui/Form';
import StatusBadge from '../../../../_shared/components/common/StatusBadge';
import UnitSelect from '../../../../_shared/components/common/UnitSelect';
import UnitForm from '../../../components/admin/uom/UnitForm';
import LocaleDefaultForm from '../../../components/admin/uom/LocaleDefaultForm';
import RowActions from '../../../components/admin/tax/sections/RowActions';
import useDeleteConfirm from '../../../components/admin/tax/sections/useDeleteConfirm';
import useUomStore from '../../../../_shared/store/uomStore';
import { colors, card, btnPrimary, radius } from '../../../../_shared/theme/tokens';

const TABS = [{ id: 'units', label: 'Units' }, { id: 'defaults', label: 'Country defaults' }];
const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString(undefined, { maximumFractionDigits: 10 }));

function Converter() {
  const { units, convertLocal, unitById } = useUomStore();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [qty, setQty] = useState('1');
  const fromUnit = unitById(from);
  const result = from && to && qty !== '' ? convertLocal(from, to, qty) : null;
  const mismatch = from && to && result === null;

  return (
    <div style={{ ...card, padding: 18, marginBottom: 20 }}>
      <p style={{ margin: '0 0 12px', fontSize: '0.82rem', fontWeight: 700, color: colors.primaryDeep, display: 'flex', alignItems: 'center', gap: 6 }}>
        <ArrowRightLeft size={14} /> Quick convert
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(90px,120px) minmax(160px,1fr) minmax(160px,1fr)', gap: 10, alignItems: 'center' }}>
        <NumberInput aria-label="Quantity" value={qty} step="any" onChange={(e) => setQty(e.target.value)} />
        <UnitSelect aria-label="From unit" value={from} onChange={(v) => { setFrom(v); setTo(''); }} emptyLabel="From…" />
        <UnitSelect aria-label="To unit" value={to} onChange={setTo} dimension={fromUnit?.dimension} emptyLabel="To…" disabled={!from} />
      </div>
      <p aria-live="polite" style={{ margin: '12px 0 0', fontSize: '0.9rem', color: mismatch ? colors.danger : colors.text }}>
        {mismatch ? 'Those units measure different things.'
          : result != null ? <><strong>{fmt(qty)} {fromUnit?.code}</strong> = <strong>{fmt(result)} {unitById(to)?.code}</strong></>
          : units.length ? <span style={{ color: colors.textFaint }}>Pick two units of the same kind.</span> : null}
      </p>
    </div>
  );
}

/** Settings → Units of measure: the unit catalogue, per-country defaults and a converter. */
export default function UnitsOfMeasure() {
  const {
    units, localeDefaults, loading, actionLoading,
    fetchUnits, fetchLocaleDefaults, deleteUnit, deleteLocaleDefault, dimensions,
  } = useUomStore();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'defaults' ? 'defaults' : 'units';
  const [dimFilter, setDimFilter] = useState('');
  const [editing, setEditing] = useState(null);
  const [addingDefault, setAddingDefault] = useState(false);
  const { ask, modal } = useDeleteConfirm(actionLoading);

  useEffect(() => {
    fetchUnits({ force: true }).catch(() => {});
    fetchLocaleDefaults().catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    const list = dimFilter ? units.filter((u) => u.dimension === dimFilter) : units;
    return [...list].sort((a, b) => a.dimension.localeCompare(b.dimension) || Number(a.to_base_factor) - Number(b.to_base_factor));
  }, [units, dimFilter]);

  const unitColumns = [
    { key: 'name', label: 'Unit', render: (u) => (
      <span style={{ color: colors.text, fontWeight: 600 }}>
        {u.name} <span style={{ fontWeight: 500, color: colors.textFaint }}>({u.code})</span>
      </span>
    ) },
    { key: 'dimension', label: 'Measures', render: (u) => u.dimension.replace(/_/g, ' ') },
    { key: 'factor', label: 'Factor', render: (u) => (Number(u.to_base_factor) === 1
      ? <StatusBadge status="base" label="Base unit" tone="brand" dot={false} />
      : <span style={{ fontFamily: 'monospace' }}>× {fmt(u.to_base_factor)}</span>) },
    { key: 'unit_system', label: 'System', render: (u) => u.unit_system ?? '—' },
    { key: 'status', label: 'Status', render: (u) => <StatusBadge status={u.is_active ? 'active' : 'inactive'} /> },
    { key: 'actions', label: '', align: 'right', render: (u) => (
      <RowActions label={u.name} onEdit={() => setEditing(u)} onDelete={() => ask({
        title: `Delete ${u.name}?`, message: 'Not possible while products, variants, tax rates or defaults use it. Deactivate it instead.',
        run: () => deleteUnit(u.id), done: `${u.name} deleted`,
      })} />
    ) },
  ];

  const defaultColumns = [
    { key: 'locale', label: 'Country' },
    { key: 'dimension', label: 'Measures', render: (d) => d.dimension.replace(/_/g, ' ') },
    { key: 'unit', label: 'Default unit', render: (d) => (d.unit ? `${d.unit.name} (${d.unit.code})` : '—') },
    { key: 'actions', label: '', align: 'right', render: (d) => (
      <RowActions label="default" onDelete={() => ask({
        title: 'Remove this default?', message: `${d.locale} ${d.dimension} will no longer pre-select a unit.`,
        run: () => deleteLocaleDefault(d.id), done: 'Default removed',
      })} />
    ) },
  ];

  return (
    <SettingsLayout>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
        <HubHeader title="Units of measure" description="How products are measured, sold and taxed — litres, kilos, cartons of 12 — and how units convert." />
        <Converter />
        <Tabs tabs={TABS.map((t) => ({ ...t, count: t.id === 'units' ? units.length : localeDefaults.length }))}
          active={tab} onChange={(id) => setParams({ tab: id }, { replace: true })} />

        {tab === 'units' && (
          <>
            <Toolbar right={<button type="button" onClick={() => setEditing('new')} style={btnPrimary}><Plus size={14} /> New unit</button>}>
              <div style={{ minWidth: 180 }}>
                <SelectInput aria-label="Filter by what it measures" value={dimFilter} onChange={(e) => setDimFilter(e.target.value)}>
                  <option value="">All kinds</option>
                  {dimensions().map((d) => <option key={d} value={d}>{d.replace(/_/g, ' ')}</option>)}
                </SelectInput>
              </div>
            </Toolbar>
            <SimpleTable columns={unitColumns} rows={rows} loading={loading.units} onRowClick={setEditing}
              empty="No units yet. Add a base unit for each kind of measure first — e.g. Litre (factor 1) for volume." />
          </>
        )}

        {tab === 'defaults' && (
          <>
            <Toolbar right={<button type="button" onClick={() => setAddingDefault(true)} disabled={!units.length} style={{ ...btnPrimary, opacity: units.length ? 1 : 0.5 }}><Plus size={14} /> Set a default</button>}>
              <p style={{ margin: 0, fontSize: '0.78rem', color: colors.textMuted }}>One default unit per country and kind of measure.</p>
            </Toolbar>
            <SimpleTable columns={defaultColumns} rows={localeDefaults} loading={loading.localeDefaults}
              empty="No defaults. Forms will ask for a unit every time." />
          </>
        )}

        <p style={{ margin: '14px 2px 0', fontSize: '0.7rem', color: colors.textFaint, padding: '8px 10px', background: colors.tint(0.03), borderRadius: radius.md }}>
          Each kind of measure needs one base unit with factor 1. Every other unit's factor says how many base units it holds.
        </p>

        {editing && <UnitForm unit={editing === 'new' ? null : editing} defaultDimension={dimFilter || undefined} onClose={() => setEditing(null)} />}
        {addingDefault && <LocaleDefaultForm onClose={() => setAddingDefault(false)} />}
        {modal}
      </div>
    </SettingsLayout>
  );
}
