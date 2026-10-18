import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Modal from '../../core/components/admin/ui/Modal';
import { FormError, FormStack, ModalActions } from '../../core/components/admin/ui/Form';
import menusAPI from '../../_shared/api/menus';
import { errMsg } from '../../_shared/store/helpers/apiState';
import { btnPrimary, card, colors } from '../../_shared/theme/tokens';

const th = { textAlign: 'left', padding: '6px 8px', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.textFaint };
const td = { padding: '7px 8px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.06)}`, verticalAlign: 'top' };

function Plan({ onClose, onDone }) {
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => { menusAPI.dishMakeupBuild().then(setPlan).catch((e) => setErr(errMsg(e, 'Could not work out what to do'))); }, []);
  const go = async () => {
    setBusy(true); setErr(null);
    try { const res = await menusAPI.buildDishMakeups(); toast.success(res.message, { duration: 7000 }); onDone(); } catch (x) { setErr(errMsg(x, 'Could not build the make-ups')); } finally { setBusy(false); }
  };
  const nothing = plan && !plan.own.length && !plan.groups.length;

  return (
    <Modal title="Give dishes a make-up from their sides" onClose={onClose} width={760}>
      <FormStack>
        <FormError message={err} />
        <p style={{ margin: 0, fontSize: '0.82rem', color: colors.textMuted }}>
          Each dish below that has a side gets a slot holding it (so ordering it takes stock through the side), and each &quot;Choose a side&quot; set meal becomes a slot of those dishes&apos; sides with the same prices.
          Prices do not change. The old group of choices is kept and marked as replaced, so it is not offered twice.
        </p>
        {!plan ? <p style={{ color: colors.textMuted }}>Loading…</p> : (
          <>
            {plan.own.length > 0 && (
              <div data-testid="build-own">
                <strong style={{ fontSize: '0.8rem' }}>A slot of its own side</strong>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th style={th}>Dish</th><th style={th}>Side</th></tr></thead><tbody>{plan.own.map((o) => <tr key={o.dish_id}><td style={td}>{o.dish}</td><td style={td}>{o.side}</td></tr>)}</tbody></table>
              </div>
            )}
            {plan.groups.length > 0 && (
              <div data-testid="build-groups">
                <strong style={{ fontSize: '0.8rem' }}>Set meals that become slots</strong>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th style={th}>Dish</th><th style={th}>Group</th><th style={th}>Becomes</th><th style={th}>Sides</th></tr></thead>
                  <tbody>{plan.groups.map((g, i) => <tr key={`${g.dish_id}-${i}`}><td style={td}>{g.dish}</td><td style={td}>{g.group}</td><td style={td}>{g.kind === 'choose_one' ? 'Choose one' : 'Choose any'}</td><td style={td}>{g.sides.join(', ')}</td></tr>)}</tbody></table>
              </div>
            )}
            {plan.skipped.length > 0 && (
              <div data-testid="build-skipped">
                <strong style={{ fontSize: '0.8rem' }}>Left as they are</strong>
                {plan.skipped.map((s, i) => <div key={i} style={{ fontSize: '0.78rem', color: colors.textMuted }}>{s.dish}, {s.group}: {s.why}.</div>)}
              </div>
            )}
            {plan.warnings.map((w, i) => <p key={i} role="status" style={{ margin: 0, fontSize: '0.78rem', color: colors.warning }}>{w}</p>)}
            {nothing && <p style={{ margin: 0 }}>Nothing to do.</p>}
          </>
        )}
        <ModalActions onCancel={onClose} submitLabel="Build the make-ups" busy={busy} disabled={!plan || (!plan.own.length && !plan.groups.length)} onSubmit={go} />
      </FormStack>
    </Modal>
  );
}

/** Menus → Dishes: a banner offering to give dishes a make-up from the sides made from their recipes and from their set meals, with a preview first. */
export default function DishMakeupBuild({ onDone }) {
  const [plan, setPlan] = useState(null);
  const [open, setOpen] = useState(false);
  const load = useCallback(() => { menusAPI.dishMakeupBuild().then(setPlan).catch(() => setPlan(null)); }, []);
  useEffect(() => { load(); }, [load]);
  if (!plan?.ready || (!plan.own.length && !plan.groups.length)) return null;

  return (
    <>
      <div style={{ ...card, padding: 14, marginBottom: 14, display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }} data-testid="build-banner">
        <span style={{ fontSize: '0.84rem' }}>
          {plan.own.length > 0 && <><strong>{plan.own.length}</strong> dish{plan.own.length === 1 ? ' has' : 'es have'} a side but no make-up yet. </>}
          {plan.groups.length > 0 && <><strong>{plan.groups.length}</strong> set-meal group{plan.groups.length === 1 ? '' : 's'} can become slots. </>}
          Prices do not change.
        </span>
        <button type="button" style={btnPrimary} onClick={() => setOpen(true)}>Give dishes a make-up from their sides</button>
      </div>
      {open && <Plan onClose={() => setOpen(false)} onDone={() => { setOpen(false); load(); onDone?.(); }} />}
    </>
  );
}
