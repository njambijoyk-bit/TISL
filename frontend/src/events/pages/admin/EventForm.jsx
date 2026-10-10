import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Eye, EyeOff, ImagePlus, Megaphone, Save, ScanLine, Trash2 } from 'lucide-react';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import Tabs from '../../../core/components/admin/ui/Tabs';
import Modal from '../../../core/components/admin/ui/Modal';
import { CheckboxRow, Field, FormGrid, FormStack, ModalActions, NumberInput, SelectInput, TextArea, TextInput } from '../../../core/components/admin/ui/Form';
import ServiceVideoField from '../../../ecommerce/components/admin/services/ServiceVideoField';
import eventsAPI from '../../../_shared/api/events';
import useAuthStore from '../../../_shared/store/authStore';
import { hasPermission } from '../../../_shared/lib/roles';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../../_shared/theme/tokens';
import StatusBadge from '../../components/admin/StatusBadge';
import DatesTab from '../../components/admin/DatesTab';
import TicketsTab from '../../components/admin/TicketsTab';
import { blankEvent, blankSession, blankType, fromServer, snapshot, toServer } from '../../lib/eventForm';
import { KINDS } from '../../lib/eventFormat';

const fresh = () => ({ event: blankEvent(), sessions: [blankSession()], types: [blankType({ name: 'General' })] });

/** Admin → Events → one event: the details, dates, tickets and refund rules, with the bar that puts it on sale. */
export default function EventForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const canEdit = hasPermission(user, 'events.edit');
  const [state, setState] = useState(fresh);
  const [meta, setMeta] = useState({ status: 'draft', problems: [], image_url: null, video: null, slug: null });
  const [tab, setTab] = useState('details');
  const [loading, setLoading] = useState(Boolean(id));
  const [busy, setBusy] = useState(false);
  const [tell, setTell] = useState(null);   // the message to all ticket holders, while it is being written
  const saved = useRef(snapshot(fresh()));
  const { event, sessions, types } = state;

  const apply = useCallback((e) => {
    const s = fromServer(e);
    setState(s);
    saved.current = snapshot(s);
    setMeta({ status: e.status, problems: e.problems ?? [], image_url: e.image_url, video: e.video ?? null, slug: e.slug });
  }, []);

  useEffect(() => {
    if (!id) { const f = fresh(); setState(f); saved.current = snapshot(f); setLoading(false); return undefined; }
    let live = true;
    setLoading(true);
    eventsAPI.show(id).then((e) => { if (live) apply(e); }).catch((e) => { toast.error(errMsg(e, 'Could not open the event')); navigate('/admin/events', { replace: true }); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [id, apply, navigate]);

  const dirty = useMemo(() => snapshot(state) !== saved.current, [state]);
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const setEvent = (patch) => setState((s) => ({ ...s, event: { ...s.event, ...patch } }));
  const field = (k) => (e) => setEvent({ [k]: e.target.value });
  // removing a date also takes it off the ticket types that named it
  const setSessions = (next) => setState((s) => {
    const keys = new Set(next.map((x) => x.key));
    return { ...s, sessions: next, types: s.types.map((t) => ({ ...t, session_keys: t.session_keys.filter((k) => keys.has(k)) })) };
  });
  const setTypes = (next) => setState((s) => ({ ...s, types: next }));

  const save = async () => {
    if (!event.title.trim()) { setTab('details'); toast.error('Give the event a title.'); return; }
    setBusy(true);
    try {
      const body = toServer(state);
      const r = id ? await eventsAPI.update(id, body) : await eventsAPI.create(body);
      toast.success(id ? 'Saved' : 'Event made. Add a picture and video, then put it on sale.');
      if (id) apply(r); else navigate(`/admin/events/${r.id}`, { replace: true });
    } catch (e) { toast.error(errMsg(e, 'Could not save the event'), { duration: 9000 }); } finally { setBusy(false); }
  };

  const publish = async (on) => {
    setBusy(true);
    try { const r = await (on ? eventsAPI.publish(id) : eventsAPI.unpublish(id)); toast.success(r.message); apply(r); }
    catch (e) { toast.error(errMsg(e, 'That did not work'), { duration: 9000 }); } finally { setBusy(false); }
  };

  const sendNews = async () => {
    setBusy(true);
    try { const r = await eventsAPI.notifyHolders(id, tell); toast.success(r.message); setTell(null); } catch (e) { toast.error(errMsg(e, 'Could not send it'), { duration: 8000 }); } finally { setBusy(false); }
  };

  const pickImage = async (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('A picture can be up to 5 MB.'); return; }
    try { const r = await eventsAPI.uploadImage(id, file); setMeta((m) => ({ ...m, image_url: r.image_url })); toast.success(r.message); } catch (err) { toast.error(errMsg(err, 'Could not upload the picture')); }
  };
  const dropImage = async () => {
    try { await eventsAPI.removeImage(id); setMeta((m) => ({ ...m, image_url: null })); toast.success('Picture removed'); } catch (err) { toast.error(errMsg(err, 'Could not remove it')); }
  };

  if (loading) return <AdminLayout><div style={{ padding: 32, color: colors.textMuted, fontSize: '0.85rem' }}>Loading…</div></AdminLayout>;

  const online = event.kind === 'online' || event.kind === 'hybrid';
  const inPerson = event.kind === 'in_person' || event.kind === 'hybrid';
  const hasSales = types.some((t) => t.sold > 0 || t.taken > 0);
  const status = meta.status;
  const TABS = [{ id: 'details', label: 'Details' }, { id: 'dates', label: 'Dates', count: sessions.length }, { id: 'tickets', label: 'Tickets', count: types.length }, { id: 'refunds', label: 'Refunds and more' }];
  const readOnly = !canEdit || status === 'cancelled';

  return (
    <AdminLayout>
      <div style={{ padding: '24px 24px 48px', maxWidth: 980, margin: '0 auto' }}>
        <Link to="/admin/events" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: colors.textMuted, textDecoration: 'none', marginBottom: 12 }}><ArrowLeft size={14} /> Events</Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <h1 style={{ margin: '0 0 6px', fontSize: '1.5rem', fontWeight: 800, color: colors.primary, letterSpacing: '-0.02em' }}>{id ? (event.title || 'Event') : 'New event'}</h1>
            {id && <StatusBadge status={status} />}
          </div>
          {id && status !== 'draft' && <Link to={`/admin/events/${id}/door`} style={{ ...btnGhost, textDecoration: 'none' }}><ScanLine size={14} /> Door</Link>}
          {canEdit && !readOnly && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {id && (status === 'published' || status === 'postponed') && <button type="button" style={btnGhost} onClick={() => setTell('')}><Megaphone size={14} /> Tell ticket holders</button>}
              {id && (status === 'draft' || status === 'postponed') && <button type="button" style={{ ...btnGhost, opacity: dirty || busy ? 0.55 : 1 }} disabled={dirty || busy || meta.problems.length > 0} title={dirty ? 'Save your changes first' : undefined} onClick={() => publish(true)}><Eye size={14} /> {status === 'postponed' ? 'Put on sale again' : 'Put on sale'}</button>}
              {id && status === 'published' && <button type="button" style={btnGhost} disabled={busy} onClick={() => publish(false)}><EyeOff size={14} /> Take down</button>}
              <button type="button" style={{ ...btnPrimary, opacity: busy || (id && !dirty) ? 0.6 : 1 }} disabled={busy || Boolean(id && !dirty)} onClick={save}><Save size={14} /> {busy ? 'Saving…' : id ? 'Save changes' : 'Make the event'}</button>
            </div>
          )}
        </div>

        {status === 'cancelled' && <p role="status" style={{ ...card, padding: 12, margin: '0 0 16px', fontSize: '0.82rem', color: colors.dangerText, background: colors.dangerBg }}>This event is cancelled. It is kept for the records and can not be changed.</p>}
        {id && (status === 'draft' || status === 'postponed') && meta.problems.length > 0 && (
          <div role="status" style={{ ...card, padding: 12, margin: '0 0 16px', fontSize: '0.82rem' }}>
            <strong style={{ display: 'block', marginBottom: 4 }}>{status === 'postponed' ? 'This event is postponed. To put it on sale again with its new date:' : 'Before it can go on sale:'}</strong>
            <ul style={{ margin: 0, paddingLeft: 18, color: colors.textBody }}>{meta.problems.map((p) => <li key={p}>{p}</li>)}</ul>
          </div>
        )}
        {id && (status === 'draft' || status === 'postponed') && meta.problems.length === 0 && !dirty && <p role="status" style={{ ...card, padding: 12, margin: '0 0 16px', fontSize: '0.82rem', color: colors.successText, background: colors.successBg }}>Everything needed is filled in: you can put it on sale.</p>}
        {dirty && id && <p role="status" style={{ margin: '0 0 12px', fontSize: '0.78rem', color: colors.warningText }}>You have changes that are not saved yet.</p>}

        <Tabs tabs={TABS} active={tab} onChange={setTab} />

        {tab === 'details' && (
          <div style={{ ...card, padding: 20 }}>
            <FormStack gap={16}>
              <Field label="Title" htmlFor="ev-title"><TextInput id="ev-title" value={event.title} maxLength={200} disabled={readOnly} onChange={field('title')} placeholder="Nairobi Jazz Night" /></Field>
              <Field label="One-line summary" htmlFor="ev-sum" hint="Shown on the events list under the title."><TextInput id="ev-sum" value={event.summary} maxLength={300} disabled={readOnly} onChange={field('summary')} /></Field>
              <FormGrid min={220}>
                <Field label="It is" htmlFor="ev-kind"><SelectInput id="ev-kind" value={event.kind} disabled={readOnly} onChange={field('kind')}>{KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</SelectInput></Field>
                <Field label="Organiser" htmlFor="ev-org" hint="Who is putting it on."><TextInput id="ev-org" value={event.organiser} maxLength={160} disabled={readOnly} onChange={field('organiser')} /></Field>
              </FormGrid>
              {inPerson && (
                <FormGrid min={220}>
                  <Field label="Venue" htmlFor="ev-venue"><TextInput id="ev-venue" value={event.venue_name} maxLength={200} disabled={readOnly} onChange={field('venue_name')} placeholder="Alliance Française" /></Field>
                  <Field label="Address" htmlFor="ev-addr"><TextInput id="ev-addr" value={event.venue_address} maxLength={300} disabled={readOnly} onChange={field('venue_address')} /></Field>
                  <Field label="Map link" htmlFor="ev-map" hint="A Google Maps link, for example."><TextInput id="ev-map" type="url" value={event.map_url} maxLength={500} disabled={readOnly} onChange={field('map_url')} placeholder="https://" /></Field>
                </FormGrid>
              )}
              {online && <Field label="Join link" htmlFor="ev-online" hint="Shown only to people who hold a ticket, never on the public page."><TextInput id="ev-online" type="url" value={event.online_url} maxLength={500} disabled={readOnly} onChange={field('online_url')} placeholder="https://" /></Field>}
              <Field label="About the event" htmlFor="ev-desc"><TextArea id="ev-desc" rows={8} value={event.description} maxLength={20000} disabled={readOnly} onChange={field('description')} /></Field>
              <CheckboxRow checked={event.is_listed} disabled={readOnly} onChange={(v) => setEvent({ is_listed: v })} label="Show it in the events list" description="Switch off for a private event: only people with its link can see and buy." />

              <div style={{ borderTop: `1px solid ${colors.tint(0.1)}`, paddingTop: 16 }}>
                <p style={{ margin: '0 0 8px', fontSize: '0.8rem', fontWeight: 700 }}>Picture</p>
                {!id ? <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textFaint }}>Make the event first, then come back to add a picture and a video.</p> : (
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    {meta.image_url && <img src={meta.image_url} alt="" style={{ width: 160, height: 90, objectFit: 'cover', borderRadius: 8 }} />}
                    {!readOnly && (
                      <>
                        <label style={{ ...btnGhost, cursor: 'pointer' }}><ImagePlus size={14} /> {meta.image_url ? 'Replace' : 'Upload a picture'}<input type="file" accept="image/*" onChange={pickImage} style={{ display: 'none' }} /></label>
                        {meta.image_url && <button type="button" style={{ ...btnGhost, color: colors.danger }} onClick={dropImage}><Trash2 size={14} /> Remove</button>}
                      </>
                    )}
                    <span style={{ fontSize: '0.72rem', color: colors.textFaint }}>JPG or PNG, up to 5 MB. Wide pictures look best.</span>
                  </div>
                )}
              </div>
              <div>
                <p style={{ margin: '0 0 8px', fontSize: '0.8rem', fontWeight: 700 }}>Video</p>
                <ServiceVideoField eventId={id ? Number(id) : null} video={meta.video} readOnly={readOnly} onChange={(v) => setMeta((m) => ({ ...m, video: v }))} />
              </div>
            </FormStack>
          </div>
        )}

        {tab === 'dates' && <DatesTab sessions={sessions} onChange={setSessions} locked={hasSales} readOnly={readOnly} />}
        {tab === 'tickets' && <TicketsTab event={event} onEvent={setEvent} types={types} onTypes={setTypes} sessions={sessions} readOnly={readOnly} />}

        {tab === 'refunds' && (
          <div style={{ ...card, padding: 20 }}>
            <FormStack gap={16}>
              <FormGrid min={240}>
                <Field label="Refunds can be asked for until" htmlFor="ev-ru" hint="After this a buyer can no longer ask for a refund. Leave empty for no cut-off. Staff approve every refund.">
                  <TextInput id="ev-ru" type="datetime-local" value={event.refund_until} disabled={readOnly} onChange={field('refund_until')} />
                </Field>
                <Field label="Most tickets in one order" htmlFor="ev-max" hint="1 to 100. A ticket can set its own lower limit.">
                  <NumberInput id="ev-max" min={1} max={100} value={event.max_per_order} disabled={readOnly} onChange={field('max_per_order')} />
                </Field>
              </FormGrid>
              <Field label="Refund policy" htmlFor="ev-pol" hint="Shown to buyers before they pay and when they ask for a refund."><TextArea id="ev-pol" rows={5} value={event.refund_policy} maxLength={5000} disabled={readOnly} onChange={field('refund_policy')} placeholder="Refunds are given up to 7 days before the event…" /></Field>
              <CheckboxRow checked={event.allow_name_change} disabled={readOnly} onChange={(v) => setEvent({ allow_name_change: v })} label="Buyers can change the name on a ticket" description="Until the event, so a ticket can be passed on to a friend." />
            </FormStack>
          </div>
        )}
      </div>
      {tell !== null && (
        <Modal title="Tell ticket holders" subtitle="Everyone who holds a valid ticket gets this, once." width={480} onClose={() => setTell(null)}
          footer={<ModalActions onCancel={() => setTell(null)} onSubmit={sendNews} busy={busy} disabled={tell.trim().length < 3} submitLabel="Send" busyLabel="Sending…" />}>
          <Field label="Your message" htmlFor="ev-tell" hint="For example: Doors now open at 5.30pm. Bring a photo ID."><TextArea id="ev-tell" rows={5} maxLength={1000} value={tell} onChange={(e) => setTell(e.target.value)} /></Field>
        </Modal>
      )}
    </AdminLayout>
  );
}
