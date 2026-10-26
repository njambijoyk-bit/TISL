import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Modal from '../../core/components/admin/ui/Modal';
import { FormError, Field, TextInput } from '../../core/components/admin/ui/Form';
import menusAPI from '../../_shared/api/menus';
import { errMsg } from '../../_shared/store/helpers/apiState';
import { btnGhost, colors } from '../../_shared/theme/tokens';
import CountStockGrid from './CountStockGrid';
import ReceiveIngredients from './ReceiveIngredients';

const num = (n, dp = 3) => Number(n).toLocaleString('en-KE', { maximumFractionDigits: dp });

/** The count of the short ingredients: the same sheet as Count stock, with only those rows, for stock that is on the shelf but was never recorded. */
function CountShort({ data, short, locationId, onSwitch, onClose, onDone }) {
  const [date, setDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [note, setNote] = useState('Found while making a batch');
  const ids = short.map((s) => s.ingredient_id);
  const save = async (lines) => {
    const res = await menusAPI.countStock({ location_id: Number(locationId), date, note: note || null, lines });
    toast.success(res.message); onDone();
  };

  return (
    <Modal title="Count what is short" onClose={onClose} width={1040}>
      <div style={{ display: 'grid', gap: 12 }}>
        <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textMuted }}>
          For stock that is really on the shelf but the books say is missing. Type what is there for each row; it is saved as a stock count, at the last cost, and the difference goes to the stock adjustment.
          {' '}Did it just arrive or did you buy it? <button type="button" style={{ ...btnGhost, padding: '2px 8px', fontSize: '0.76rem' }} onClick={onSwitch}>Receive it as a purchase instead</button>
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Field label="Counted on" htmlFor="rs-date"><TextInput id="rs-date" type="date" max={new Date().toLocaleDateString('en-CA')} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Note" htmlFor="rs-note"><TextInput id="rs-note" maxLength={255} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>
        <CountStockGrid ingredients={data.ingredients.filter((i) => ids.includes(i.id))} kinds={data.kinds} locationId={String(locationId)} onSave={save} readOnly={false} />
      </div>
    </Modal>
  );
}

/**
 * Restock what a batch is short of. It opens on Receive stock (the delivery or purchase form with the short ingredients already on it, in packs where the variant has them); a link switches to a
 * count for stock that is on the shelf but not recorded. Opening stock is not offered: it is for the first day. `short` is [{ingredient_id, name, short, unit}] in each ingredient's base unit.
 */
export default function RestockShort({ short, locationId, onClose, onDone }) {
  const [data, setData] = useState(null);
  const [mode, setMode] = useState('receive');
  const [err, setErr] = useState(null);
  useEffect(() => { menusAPI.stock({ location_id: locationId }).then(setData).catch((e) => setErr(errMsg(e, 'Could not load the stock'))); }, [locationId]);

  if (!data) {
    return (
      <Modal title="Restock what is short" onClose={onClose} width={520}>
        <FormError message={err} />
        {!err && <p role="status" style={{ margin: 0 }}>Loading…</p>}
      </Modal>
    );
  }
  if (mode === 'count') return <CountShort data={data} short={short} locationId={locationId} onSwitch={() => setMode('receive')} onClose={onClose} onDone={onDone} />;

  return (
    <ReceiveIngredients data={data} locationId={locationId} onClose={onClose} onDone={onDone}
      initialLines={short.map((s) => ({ ingredient_id: s.ingredient_id, quantity: s.short }))}
      intro={`Short for the batch: ${short.map((s) => `${s.name} ${num(s.short)} ${s.unit}`).join(', ')}. The lines below are filled in for what is short, in packs where the variant has them; change anything you need.`}
      alt={{ label: 'It is already on the shelf: count it instead', onClick: () => setMode('count') }} />
  );
}
