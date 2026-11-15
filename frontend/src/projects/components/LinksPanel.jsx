import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { message } from '../lib/format';
import { Btn, Field, Notice, Panel, PanelTitle, TextInput } from './ui';

/**
 * Records of other modules attached to a piece of work (docs/PROJECTS_STAGE1_SPEC.md, build 1.7): a quotation or invoice from the books, an event…
 * Each module says what of its own can be attached; one that is not licensed and on is not offered. An amount shown here is read from the
 * module that owns it every time: nothing about money is kept in Projects.
 */
const money = (amount, currency) => `${currency ? `${currency} ` : ''}${new Intl.NumberFormat('en-KE', { maximumFractionDigits: 2 }).format(amount)}`;

function Picker({ projectId, group, onPicked, onCancel }) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState(null);
  const [chosen, setChosen] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    const id = setTimeout(() => { projectsAPI.findLinkable(projectId, group.type, q).then((r) => { if (live) setFound(r); }).catch(() => { if (live) setFound([]); }); }, 250);
    return () => { live = false; clearTimeout(id); };
  }, [q, projectId, group.type]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    await onPicked(chosen.id, note);
    setBusy(false);
  };
  const one = group.label.toLowerCase();

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12, borderRadius: 10, background: 'var(--surface-input)', marginTop: 10 }}>
      {chosen ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 13.5 }}>
          <span><b>{chosen.title}</b>{chosen.detail ? <span style={{ color: 'var(--text-secondary)' }}> · {chosen.detail}</span> : null}</span>
          <Btn small variant="quiet" onClick={() => setChosen(null)}>Choose another</Btn>
        </div>
      ) : (
        <Field label={`Find the ${one}`} htmlFor={`link-find-${group.type}`}>
          <TextInput id={`link-find-${group.type}`} value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" autoFocus />
          <div role="listbox" aria-label={`${group.plural} found`} style={{ border: '1px solid var(--line)', borderRadius: 9, overflow: 'hidden', background: 'var(--surface-card)' }}>
            {found === null && <div style={{ padding: '8px 10px', fontSize: 13, color: 'var(--text-secondary)' }}>Looking…</div>}
            {found && found.length === 0 && <div style={{ padding: '8px 10px', fontSize: 13, color: 'var(--text-secondary)' }}>Nothing found.</div>}
            {found && found.map((f) => (
              <button key={f.id} type="button" role="option" aria-selected="false" onClick={() => setChosen(f)}
                style={{ display: 'flex', justifyContent: 'space-between', gap: 8, width: '100%', padding: '8px 10px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--line)', color: 'var(--text-primary)', fontSize: 13.5, fontFamily: 'var(--font-body)', textAlign: 'left', cursor: 'pointer' }}>
                <span>{f.title}</span><span style={{ color: 'var(--text-secondary)' }}>{f.detail}</span>
              </button>
            ))}
          </div>
        </Field>
      )}
      {chosen && <Field label="Why it is linked (optional)" htmlFor={`link-note-${group.type}`}><TextInput id={`link-note-${group.type}`} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} /></Field>}
      <div style={{ display: 'flex', gap: 8 }}>
        <Btn type="submit" variant="primary" small busy={busy} disabled={!chosen}>Link it</Btn>
        <Btn small onClick={onCancel}>Cancel</Btn>
      </div>
    </form>
  );
}

export default function LinksPanel({ projectId }) {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState('');
  const [picking, setPicking] = useState(null);
  const [removing, setRemoving] = useState(null);

  const load = useCallback(async () => {
    try { setData(await projectsAPI.links(projectId)); setFailed(''); } catch (e) { setFailed(message(e, 'The links could not be loaded. Try again.')); }
  }, [projectId]);
  useEffect(() => { load(); }, [load]);

  const run = async (call, done) => {
    try { setData(await call()); setPicking(null); setRemoving(null); toast.success(done); } catch (e) { toast.error(message(e, 'That could not be done. Try again.')); }
  };

  if (failed) return <Notice status="problem">{failed} <Btn small variant="quiet" onClick={load}>Try again</Btn></Notice>;
  if (!data) return <Panel><p style={{ margin: 0, color: 'var(--text-secondary)' }}>Loading the links…</p></Panel>;
  const can = data.can.links;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14, alignItems: 'start' }}>
        {data.groups.map((g) => (
          <Panel key={g.type} data-links={g.type}>
            <PanelTitle right={can && picking !== g.type ? <Btn small onClick={() => { setPicking(g.type); setRemoving(null); }} aria-label={`Link a ${g.label.toLowerCase()}`}>Link one</Btn> : null}>{g.plural}</PanelTitle>
            {g.items.length === 0 && picking !== g.type && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>None linked.</p>}
            {g.items.map((i) => (
              <div key={i.id} data-link={i.title} style={{ padding: '9px 0', borderBottom: '1px solid var(--line)', fontSize: 13.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                  <span style={{ minWidth: 0 }}>
                    {i.url && !i.gone ? <Link to={i.url} style={{ color: 'var(--color-primary-500)', fontWeight: 600, textDecoration: 'none' }}>{i.title}</Link> : <b style={{ color: i.gone ? 'var(--text-secondary)' : 'var(--text-primary)' }}>{i.title}</b>}
                  </span>
                  {i.amount !== null && i.amount !== undefined && <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, whiteSpace: 'nowrap' }}>{money(i.amount, i.currency)}</span>}
                </div>
                {i.detail && <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 2 }}>{i.detail}</div>}
                {i.note && <div style={{ fontSize: 12.5, marginTop: 2 }}>{i.note}</div>}
                {i.gone && <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 2 }}>It was removed from where it lived. The link can be taken off.</div>}
                {can && (removing === i.id ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12.5 }}>Take this link off? The record itself is not touched.</span>
                    <Btn small variant="danger" onClick={() => run(() => projectsAPI.removeLink(projectId, i.id), 'Link taken off')}>Yes, take it off</Btn>
                    <Btn small onClick={() => setRemoving(null)}>No</Btn>
                  </div>
                ) : <Btn small variant="quiet" style={{ paddingLeft: 0, marginTop: 2 }} aria-label={`Unlink ${i.title}`} onClick={() => { setRemoving(i.id); setPicking(null); }}>Unlink</Btn>)}
              </div>
            ))}
            {picking === g.type && <Picker projectId={projectId} group={g} onCancel={() => setPicking(null)} onPicked={(linkedId, note) => run(() => projectsAPI.addLink(projectId, { type: g.type, linked_id: linkedId, note: note || null }), 'Linked')} />}
            {g.type === 'books.voucher' && g.items.some((i) => i.amount !== null) && <p style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--text-secondary)' }}>Amounts are read from the books each time. Nothing about money is kept here.</p>}
          </Panel>
        ))}
      </div>
      {data.groups.length === 0 && <Notice status="info">Nothing from another module can be linked by you here. You may not hold the permission to see their records.</Notice>}
      {data.hidden > 0 && <Notice status="info">{data.hidden === 1 ? '1 more link is' : `${data.hidden} more links are`} here that you cannot see: {data.off.length ? 'the module is not switched on, or you' : 'you'} may not see those records.</Notice>}
      {data.off.length > 0 && <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>Not switched on, so not offered: {data.off.join(', ')}.</p>}
    </div>
  );
}
