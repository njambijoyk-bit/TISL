import { useState } from 'react';
import { ScanLine } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../../core/components/admin/ui/Modal';
import CodeScanner from '../../core/components/admin/codes/CodeScanner';
import menusAPI from '../../_shared/api/menus';
import { errMsg } from '../../_shared/store/helpers/apiState';
import { btnGhost, card, colors } from '../../_shared/theme/tokens';

/** The first time a supplier's barcode is seen: say which item it is, and it is kept for good. */
function Learn({ code, variants, onDone, onClose }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const needle = q.trim().toLowerCase();
  const rows = variants.filter((v) => !needle || `${v.ingredient} ${v.name}`.toLowerCase().includes(needle)).slice(0, 30);

  const give = async (v) => {
    setBusy(true);
    try { const r = await menusAPI.giveStockCode(v.id, code); toast.success(r.message); onDone(v); } catch (e) { toast.error(errMsg(e, 'Could not keep that code'), { duration: 8000 }); } finally { setBusy(false); }
  };

  return (
    <Modal title="A code we have not seen" subtitle={code} onClose={onClose} width={480}>
      <div data-testid="learn-code" style={{ display: 'grid', gap: 10 }}>
        <p style={{ margin: 0, fontSize: '0.85rem' }}>Nothing has this code yet. Which item is it? It is kept, so the next scan finds it.</p>
        <input aria-label="Find the item" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search an item…" style={{ padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--line, #d1d5db)', fontFamily: 'inherit' }} />
        <div style={{ ...card, padding: 4, maxHeight: 260, overflowY: 'auto' }}>
          {rows.length === 0 && <p style={{ margin: 8, fontSize: '0.8rem', color: colors.textMuted }}>Nothing matches.</p>}
          {rows.map((v) => <button key={v.id} type="button" disabled={busy} onClick={() => give(v)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 9px', background: 'none', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '0.82rem' }}>{v.ingredient} <span style={{ color: colors.textFaint }}>↳ {v.name}</span></button>)}
        </div>
        <div style={{ textAlign: 'right' }}><button type="button" style={btnGhost} onClick={onClose}>Not now</button></div>
      </div>
    </Modal>
  );
}

/**
 * A scanner for the stock screens (receive, count, what to buy): a handheld scanner, the camera or typing. A code finds its kitchen stock item (a crate's or bottle's own code, the label of a lot,
 * or a code the item used to have) and `onItem(variant, match)` is told. A code nothing has can be learnt (`variants` is the list to choose the item from); a dish's or a product's code is said to
 * be what it is. `variants` are { id, ingredient, name } of what this screen works with (null: any item, and nothing is learnt).
 */
export default function StockScanBar({ variants, onItem, canLearn = true, label = 'Scan an item' }) {
  const [unknown, setUnknown] = useState(null);

  const scanned = async (code) => {
    try {
      const r = await menusAPI.scanStock(code);
      if (r.found) {
        const m = r.matches.find((x) => !x.retired) ?? r.matches[0];
        const v = variants ? variants.find((x) => x.id === m.item_id) : { id: m.item_id, ingredient: m.ingredient, name: m.name };   // no list: any item will do (the order screen)
        if (!v) { toast.error(`${m.label} is not on this list.`); return; }
        if (m.retired) toast(`${code} is an old code of ${m.label}: counted as that item.`, { icon: '🏷️', duration: 5000 });
        onItem(v, m);

        return;
      }
      if (r.other.length) { toast.error(`${code} is ${r.other[0]}, which this screen does not use.`); return; }
      if (canLearn && variants?.length) setUnknown(code);
      else toast.error(`Nothing has the code ${code}.`);
    } catch (e) { toast.error(errMsg(e, 'Could not look that code up')); }
  };

  return (
    <div data-testid="stock-scan" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: '0.8rem', fontWeight: 700 }}><ScanLine size={15} aria-hidden="true" /> {label}</span>
      <div style={{ flex: '1 1 260px', maxWidth: 420 }}><CodeScanner onScan={scanned} autoFocus={false} placeholder="Scan a barcode or label, then Enter" /></div>
      {unknown && <Learn code={unknown} variants={variants} onClose={() => setUnknown(null)} onDone={(v) => { const code = unknown; setUnknown(null); onItem(v, { code, learnt: true }); }} />}
    </div>
  );
}
