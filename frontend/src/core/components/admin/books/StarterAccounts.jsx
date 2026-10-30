import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import booksAPI from '../../../../_shared/api/books';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, colors } from '../../../../_shared/theme/tokens';
import Modal from '../ui/Modal';

const BADGE = {
  new: ['New', colors.successText], exists: ['Already there', colors.textFaint], move: ['Moves', colors.primaryDeep],
  elsewhere: ['Left as it is', colors.warningText], missing: ['Skipped', colors.warningText],
};

/**
 * Add starter accounts: ready-made groups and ledgers, ticked pack by pack. The preview is what will happen to your chart: what is new, what is already there and left alone, and the few
 * ledgers that move. Nothing is added until you press Add, and nothing you have already posted changes.
 */
export default function StarterAccounts({ onClose, onDone }) {
  const [packs, setPacks] = useState(null);
  const [ticked, setTicked] = useState([]);
  const [preview, setPreview] = useState(null);
  const [open, setOpen] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { booksAPI.chartStarters().then((r) => setPacks(r.packs)).catch((e) => { toast.error(errMsg(e, 'Could not load the starter accounts')); onClose(); }); }, [onClose]);
  useEffect(() => {
    if (!ticked.length) { setPreview(null); return undefined; }
    let live = true;
    booksAPI.previewChartStarters(ticked).then((r) => { if (live) setPreview(r); }).catch((e) => toast.error(errMsg(e, 'Could not make the preview')));
    return () => { live = false; };
  }, [ticked]);

  const toggle = (k) => setTicked((t) => (t.includes(k) ? t.filter((x) => x !== k) : [...t, k]));
  const apply = async () => {
    setBusy(true);
    try {
      const r = await booksAPI.applyChartStarters(ticked);
      toast.success(`Added ${r.totals.new_groups} group${r.totals.new_groups === 1 ? '' : 's'} and ${r.totals.new_ledgers} ledger${r.totals.new_ledgers === 1 ? '' : 's'}${r.totals.moves ? `, moved ${r.totals.moves}` : ''}${r.asset_types?.length ? `; ${r.asset_types.length} asset type${r.asset_types.length === 1 ? '' : 's'} added in Assets` : ''}`);
      onDone();
      onClose();
    } catch (e) { toast.error(errMsg(e, 'Could not add the accounts')); } finally { setBusy(false); }
  };
  const t = preview?.totals;
  const nothing = t && !t.new_groups && !t.new_ledgers && !t.moves;
  const pack = (k) => preview?.packs.find((p) => p.key === k);

  return (
    <Modal title="Add starter accounts" subtitle="Tick the packs you want. See exactly what will happen first; nothing is added until you press Add." onClose={onClose} width={760}
      footer={(
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {t && <span style={{ flex: 1, fontSize: '0.78rem', color: colors.textMuted }}>{nothing ? 'Everything in these packs is already in your chart.' : `Will add ${t.new_groups} group${t.new_groups === 1 ? '' : 's'} and ${t.new_ledgers} ledger${t.new_ledgers === 1 ? '' : 's'}${t.moves ? `, and move ${t.moves}` : ''}${t.skipped ? ` (${t.skipped} left as they are)` : ''}.`}</span>}
          <button type="button" style={btnGhost} onClick={onClose}>Cancel</button>
          <button type="button" style={{ ...btnPrimary, opacity: busy || !t || nothing ? 0.6 : 1 }} disabled={busy || !t || nothing} onClick={apply}>{busy ? 'Adding…' : 'Add to my chart'}</button>
        </div>
      )}>
      {!packs ? <p style={{ fontSize: '0.85rem', color: colors.textFaint }}>Loading…</p> : (
        <div style={{ display: 'grid', gap: 8 }}>
          {packs.map((p) => {
            const pv = pack(p.key);
            const on = ticked.includes(p.key);
            return (
              <div key={p.key} style={{ border: `1px solid ${on ? colors.primary : colors.tint(0.12)}`, borderRadius: 10, padding: '10px 12px', background: on ? colors.tint(0.04) : undefined }}>
                <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
                  <input type="checkbox" checked={on} onChange={() => toggle(p.key)} style={{ marginTop: 3 }} aria-label={p.title} />
                  <span style={{ flex: 1 }}>
                    <b style={{ fontSize: '0.86rem' }}>{p.title}</b>
                    <span style={{ display: 'block', fontSize: '0.74rem', color: colors.textMuted }}>{p.blurb}</span>
                  </span>
                  {pv && <span style={{ fontSize: '0.72rem', color: colors.textMuted, whiteSpace: 'nowrap' }}>{pv.counts.new_ledgers} new ledger{pv.counts.new_ledgers === 1 ? '' : 's'}{pv.counts.moves ? `, ${pv.counts.moves} moves` : ''}</span>}
                </label>
                {pv && (
                  <div style={{ marginTop: 6, paddingLeft: 26 }}>
                    <button type="button" onClick={() => setOpen((o) => ({ ...o, [p.key]: !o[p.key] }))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.primary, fontFamily: 'inherit', fontSize: '0.72rem', padding: 0 }}>{open[p.key] ? 'Hide the list' : 'Show exactly what it does'}</button>
                    {open[p.key] && (
                      <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0, display: 'grid', gap: 2, maxHeight: 260, overflowY: 'auto' }}>
                        {pv.items.map((i, n) => {
                          const [label, tone] = BADGE[i.status] ?? [i.status, colors.textMuted];
                          return (
                            <li key={n} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: '0.76rem', paddingLeft: i.type === 'group' ? 0 : 14 }}>
                              <span style={{ minWidth: 76, fontSize: '0.66rem', fontWeight: 700, color: tone }}>{label}</span>
                              <span style={{ fontWeight: i.type === 'group' ? 700 : 400 }}>{i.name}</span>
                              <span style={{ color: colors.textFaint }}>{i.type === 'move' ? `→ ${i.under}` : i.under ? `under ${i.under}` : ''}</span>
                              {i.note && <span style={{ color: colors.textMuted, fontSize: '0.7rem' }}>{i.note}</span>}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
