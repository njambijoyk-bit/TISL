import { useEffect, useRef, useState } from 'react';
import menusAPI from '../../_shared/api/menus';
import { errMsg } from '../../_shared/store/helpers/apiState';

/** The make-up of a dish as it is being edited: the sizes and prices, who it is for, and the slots. Shared by the make-up screen and the guided dish screen. */
export default function useMakeup(dish) {
  const [data, setData] = useState(null);
  const [prices, setPrices] = useState({});
  const [audiences, setAudiences] = useState([]);
  const [slots, setSlots] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const n = useRef(0);
  const key = () => `k${++n.current}`;

  useEffect(() => {
    menusAPI.dishMakeup(dish.id).then((d) => {
      setData(d);
      setPrices(Object.fromEntries(d.servings.map((s) => [s.serving_id, s.price])));
      setAudiences(d.audience_ids);
      setSlots(d.slots.map((s) => ({ key: key(), name: s.name, kind: s.kind, min: s.min, max: s.max ?? '', choices: s.choices.map((c) => ({ key: key(), side_id: c.side_id, upcharge: c.upcharge || '', is_default: c.is_default })) })));
    }).catch((e) => setErr(errMsg(e, 'Could not load the make-up')));
  }, [dish.id]);

  const patchSlot = (k, p) => setSlots((xs) => xs.map((x) => (x.key === k ? { ...x, ...p } : x)));
  const patchChoice = (sk, ck, p) => setSlots((xs) => xs.map((x) => (x.key === sk ? { ...x, choices: x.choices.map((c) => (c.key === ck ? { ...c, ...p } : c)) } : x)));
  const move = (i, d) => setSlots((xs) => { const ys = [...xs]; const j = i + d; if (j < 0 || j >= ys.length) return xs; [ys[i], ys[j]] = [ys[j], ys[i]]; return ys; });
  const setDefault = (s, c, on) => patchSlot(s.key, { choices: s.choices.map((x) => (x.key === c.key ? { ...x, is_default: on } : (s.kind === 'choose_one' && on ? { ...x, is_default: false } : x))) });
  /** A side made on the spot is offered in every slot's list from then on. */
  const addSide = (side) => setData((d) => ({ ...d, sides: [...d.sides, { id: side.id, name: side.name }] }));

  /** Save everything; resolves with the server's answer, or null when it failed (the reason is in `err`). */
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      return await menusAPI.saveDishMakeup(dish.id, {
        servings: data.serving_list.map((s) => ({ serving_id: s.id, price: prices[s.id] === undefined || prices[s.id] === '' ? '' : Number(prices[s.id]) })),
        audience_ids: audiences,
        slots: slots.map((s) => ({
          name: s.name, kind: s.kind, min: s.kind === 'choose_any' ? Number(s.min) || 0 : undefined, max: ['choose_any', 'free_extra', 'paid_extra'].includes(s.kind) && s.max !== '' ? Number(s.max) : undefined,
          choices: s.choices.map((c) => ({ side_id: Number(c.side_id) || 0, upcharge: c.upcharge === '' ? 0 : Number(c.upcharge), is_default: Boolean(c.is_default) })),
        })),
      });
    } catch (x) { setErr(errMsg(x, 'Could not save')); return null; } finally { setBusy(false); }
  };

  return { data, prices, setPrices, audiences, setAudiences, slots, setSlots, busy, err, setErr, key, patchSlot, patchChoice, move, setDefault, addSide, save };
}
