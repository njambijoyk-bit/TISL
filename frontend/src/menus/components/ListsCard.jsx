import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import menusAPI from '../../_shared/api/menus';
import { Field, NumberInput, SelectInput, TextInput } from '../../core/components/admin/ui/Form';
import { errMsg } from '../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../_shared/theme/tokens';

const LISTS = [
  { type: 'servings', title: 'Servings', word: 'serving', hint: 'The sizes a dish can be served in: Jumbo, Medium, Kids. A dish chooses which of these it is sold in.', placeholder: 'Jumbo' },
  { type: 'audiences', title: 'Audiences', word: 'audience', hint: 'Who a dish is meant for: Adults, Kids. Shown on the dish and the menu.', placeholder: 'Kids' },
  { type: 'policies', title: 'Removal and extra policies', word: 'policy', hint: 'How taking something off a dish, or adding something, is priced. A dish can follow the default or choose another. Exactly one is the default.', placeholder: 'Removal fee' },
];

function Row({ list, row, kinds, canEdit, onSaved, onMove }) {
  const isPolicy = list.type === 'policies';
  const key = `${list.type}-${row.id ?? 'new'}`;
  const [f, setF] = useState({ name: row.name ?? '', kind: row.kind ?? 'free', amount: row.amount ?? '', is_default: Boolean(row.is_default), is_active: row.is_active ?? true });
  const [busy, setBusy] = useState(false);
  const payload = () => ({ name: f.name, is_active: f.is_active, ...(isPolicy ? { kind: f.kind, amount: f.kind === 'free' ? 0 : Number(f.amount) || 0, ...(f.is_default ? { is_default: true } : {}) } : {}) });
  const save = async () => {
    setBusy(true);
    try { const r = await menusAPI.saveListRow(list.type, payload(), row.id); toast.success(r.message); onSaved(); } catch (e) { toast.error(errMsg(e, `Could not save the ${list.word}`), { duration: 8000 }); } finally { setBusy(false); }
  };
  const remove = async () => { try { const r = await menusAPI.removeListRow(list.type, row.id); toast.success(r.message); onSaved(); } catch (e) { toast.error(errMsg(e, `Could not remove the ${list.word}`), { duration: 8000 }); } };

  return (
    <div data-row={key} style={{ ...card, padding: 12, display: 'grid', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <Field label="Name" htmlFor={`${key}-name`}><TextInput id={`${key}-name`} maxLength={60} value={f.name} disabled={!canEdit} placeholder={list.placeholder} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} /></Field>
        {isPolicy && (
          <>
            <Field label="Priced as" htmlFor={`${key}-kind`}>
              <SelectInput id={`${key}-kind`} value={f.kind} disabled={!canEdit} onChange={(e) => setF((x) => ({ ...x, kind: e.target.value }))}>
                {Object.entries(kinds).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </SelectInput>
            </Field>
            {f.kind !== 'free' && <Field label={f.kind === 'percent' ? 'Percentage' : 'Fee'} htmlFor={`${key}-amount`}><NumberInput id={`${key}-amount`} min="0" max={f.kind === 'percent' ? 100 : undefined} step="any" value={f.amount} disabled={!canEdit} onChange={(e) => setF((x) => ({ ...x, amount: e.target.value }))} /></Field>}
          </>
        )}
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', fontSize: '0.86rem' }}>
        {isPolicy && <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={f.is_default} disabled={!canEdit || Boolean(row.is_default)} onChange={(e) => setF((x) => ({ ...x, is_default: e.target.checked }))} /> The default</label>}
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={f.is_active} disabled={!canEdit} onChange={(e) => setF((x) => ({ ...x, is_active: e.target.checked }))} /> On</label>
      </div>
      {canEdit && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={save}>{row.id ? 'Save' : `Add ${list.word}`}</button>
          {row.id && <button type="button" style={btnGhost} aria-label={`Move ${row.name} up`} onClick={() => onMove(-1)}>Up</button>}
          {row.id && <button type="button" style={btnGhost} aria-label={`Move ${row.name} down`} onClick={() => onMove(1)}>Down</button>}
          {row.id && <button type="button" style={{ ...btnGhost, color: colors.danger }} onClick={remove}>Remove</button>}
        </div>
      )}
    </div>
  );
}

/** Menus → Configuration: the small lists a dish draws on (servings, audiences) and the policies that price taking something off or adding something. */
export default function ListsCard({ canEdit }) {
  const [data, setData] = useState(null);
  const [nonce, setNonce] = useState(0);
  const load = () => menusAPI.lists().then((r) => { setData(r); setNonce((n) => n + 1); }).catch((e) => toast.error(errMsg(e, 'Could not load the lists')));
  useEffect(() => { load(); }, []);
  if (!data) return null;
  const move = async (type, i, dir) => {
    const ids = data[type].map((r) => r.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try { await menusAPI.orderList(type, ids); load(); } catch (e) { toast.error(errMsg(e, 'Could not change the order'), { duration: 8000 }); }
  };

  return (
    <div style={{ marginTop: 22, display: 'grid', gap: 22 }} data-testid="menus-lists">
      {!data.ready ? <p role="status" style={{ margin: 0, fontSize: '0.8rem', color: colors.textMuted }}>Run database script 193_menus_config_foundation.sql to switch on servings, audiences and removal policies.</p> : LISTS.map((list) => (
        <div key={list.type} style={{ display: 'grid', gap: 12 }} data-list={list.type}>
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>{list.title}</h2>
          <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textMuted }}>{list.hint}</p>
          {data[list.type].map((r, i) => <Row key={`${r.id}-${nonce}`} list={list} row={r} kinds={data.policy_kinds} canEdit={canEdit} onSaved={load} onMove={(d) => move(list.type, i, d)} />)}
          {canEdit && <Row key={`new-${list.type}-${nonce}`} list={list} row={{}} kinds={data.policy_kinds} canEdit onSaved={load} onMove={() => {}} />}
        </div>
      ))}
    </div>
  );
}
