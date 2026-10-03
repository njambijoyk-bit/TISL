import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminLayout from '../../../../_shared/components/layout/AdminLayout';
import HubHeader from '../../../components/admin/ui/HubHeader';
import Modal from '../../../components/admin/ui/Modal';
import { Field, NumberInput, SelectInput, TextInput, FormStack, ModalActions, FormError } from '../../../components/admin/ui/Form';
import { money } from '../../../components/admin/books/booksFmt';
import booksAPI from '../../../../_shared/api/books';
import { bookingsAPI } from '../../../../_shared/api/bookings';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import useCalculatorStore from '../../../../_shared/store/calculatorStore';
import { btnGhost, btnPrimary, card, colors } from '../../../../_shared/theme/tokens';

/**
 * Bookings. A booking takes a person or room for a stretch of time. Money goes through Books: a Sales Order records it, the deposit and booking fee are
 * invoiced at booking, the service is invoiced when it is done, and a late cancellation or no-show is charged the fee set in Service settings.
 */

const small = { ...btnGhost, padding: '4px 10px', fontSize: '0.72rem', marginRight: 6 };
const TONE = { confirmed: '#1d4ed8', completed: '#15803d', cancelled: '#6b7280', no_show: '#b45309' };
const LABEL = { confirmed: 'Booked', completed: 'Done', cancelled: 'Cancelled', no_show: 'No-show' };
const th = { textAlign: 'left', padding: '8px 10px', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.textFaint };
const td = { padding: '9px 10px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.06)}`, verticalAlign: 'top' };
const when = (iso) => new Date(iso).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Tell the customer: e-mail now, or open WhatsApp with the message ready. */
function NoticeModal({ id, event, onClose }) {
  const [n, setN] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { bookingsAPI.notice(id, event).then(setN).catch(() => onClose()); }, [id, event, onClose]);
  const mail = async () => { setBusy(true); try { toast.success((await bookingsAPI.email(id, event)).message); } catch (e) { toast.error(errMsg(e, 'Could not e-mail')); } finally { setBusy(false); } };
  if (!n) return null;
  return (
    <Modal title="Tell the customer" onClose={onClose}>
      <p style={{ fontSize: '0.84rem', background: '#f9fafb', padding: 10, borderRadius: 8 }}>{n.message}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        <button type="button" style={btnPrimary} disabled={busy || !n.to_email} onClick={mail}>{n.to_email ? `E-mail ${n.to_email}` : 'No e-mail on file'}</button>
        <a href={n.whatsapp_url} target="_blank" rel="noreferrer" style={{ ...btnGhost, textDecoration: 'none', display: 'inline-block', opacity: n.whatsapp_to_number ? 1 : 0.5 }}>WhatsApp{n.to_phone ? ` ${n.to_phone}` : ' (no number)'}</a>
      </div>
      <p style={{ fontSize: '0.72rem', color: colors.textFaint }}>WhatsApp opens with the message ready — you press send. It is from your company phone (Books → Settings → Company).</p>
    </Modal>
  );
}

function NewBooking({ onClose, onDone }) {
  const [opts, setOpts] = useState(null);
  const [q, setQ] = useState('');
  const [found, setFound] = useState([]);
  const [customer, setCustomer] = useState(null);
  const [f, setF] = useState({ service_id: '', service_variant_id: '', location_id: '', date: '', time: '', resource_id: '', people: 1, on_site: false, address: '', notes: '' });
  const [slots, setSlots] = useState(null);
  const [quote, setQuote] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  useEffect(() => { bookingsAPI.options().then(setOpts).catch((e) => setErr(errMsg(e, 'Could not load'))); }, []);
  useEffect(() => {
    if (q.length < 2) { setFound([]); return undefined; }
    const t = setTimeout(() => booksAPI.lookup('customer', q).then(setFound).catch(() => setFound([])), 250);
    return () => clearTimeout(t);
  }, [q]);
  const svc = opts?.services.find((s) => String(s.id) === String(f.service_id));
  const pkg = svc?.packages.find((p) => String(p.id) === String(f.service_variant_id));
  useEffect(() => {
    setSlots(null);
    if (f.service_id && f.service_variant_id && f.date && svc?.has_resources) bookingsAPI.slots({ service_id: f.service_id, service_variant_id: f.service_variant_id, date: f.date, location_id: f.on_site ? undefined : f.location_id || undefined }).then((r) => setSlots(r.slots)).catch(() => setSlots([]));
  }, [f.service_id, f.service_variant_id, f.date, f.location_id, f.on_site, svc?.has_resources]);
  const starts = f.date && f.time ? `${f.date} ${f.time}` : '';
  useEffect(() => {
    setQuote(null);
    if (f.service_id && f.service_variant_id && starts) bookingsAPI.quote({ service_id: f.service_id, service_variant_id: f.service_variant_id, starts_at: starts, people: f.people, on_site: f.on_site }).then(setQuote).catch(() => {});
  }, [f.service_id, f.service_variant_id, starts, f.people, f.on_site]);
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { onDone(await bookingsAPI.create({ customer_id: customer.customer_id, service_id: f.service_id, service_variant_id: f.service_variant_id, starts_at: starts, location_id: f.on_site ? undefined : f.location_id || undefined, resource_id: f.resource_id || undefined, people: Number(f.people) || 1, on_site: f.on_site, address: f.address || undefined, notes: f.notes || undefined })); }
    catch (x) { setErr(errMsg(x, 'Could not book')); } finally { setBusy(false); }
  };
  const who = slots?.find((s) => s.time === f.time)?.resources ?? [];
  return (
    <Modal title="New booking" onClose={onClose}>
      <form onSubmit={go}>
        <FormStack>
          <FormError message={err} />
          <Field label="Customer">
            {customer ? <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><strong>{customer.name}</strong><button type="button" style={small} onClick={() => setCustomer(null)}>Change</button></div> : (
              <div>
                <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a customer…" />
                {found.map((c) => <button key={c.customer_id} type="button" onClick={() => { setCustomer(c); setQ(''); setFound([]); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: 6, border: 'none', background: 'none', cursor: 'pointer' }}>{c.name} <span style={{ color: colors.textFaint }}>{c.email}</span></button>)}
              </div>
            )}
          </Field>
          <Field label="Service"><SelectInput required value={f.service_id} onChange={(e) => setF((x) => ({ ...x, service_id: e.target.value, service_variant_id: '', time: '' }))}><option value="">Choose…</option>{opts?.services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</SelectInput></Field>
          {svc && <Field label="Package"><SelectInput required value={f.service_variant_id} onChange={(e) => setF((x) => ({ ...x, service_variant_id: e.target.value, location_id: '', time: '' }))}><option value="">Choose…</option>{svc.packages.map((p) => <option key={p.id} value={p.id}>{p.name} — {money(p.price)}</option>)}</SelectInput></Field>}
          {pkg?.branches?.length > 1 && !f.on_site && <Field label="Branch"><SelectInput required value={f.location_id} onChange={(e) => setF((x) => ({ ...x, location_id: e.target.value, time: '' }))}><option value="">Choose…</option>{pkg.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</SelectInput></Field>}
          {pkg?.branches?.length === 1 && !f.on_site && <p style={{ margin: 0, fontSize: '0.76rem', color: colors.textMuted }}>At {pkg.branches[0].name}</p>}
          {svc && !svc.has_resources && <p style={{ margin: 0, fontSize: '0.76rem', color: '#92400e' }}>Nobody is set up for this service (Staff & resources), so no availability is checked.</p>}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 150 }}><Field label="Day"><TextInput type="date" required value={f.date} onChange={(e) => setF((x) => ({ ...x, date: e.target.value, time: '' }))} /></Field></div>
            <div style={{ flex: 1, minWidth: 150 }}>
              <Field label="Time">
                {svc?.has_resources
                  ? <SelectInput required value={f.time} onChange={(e) => set('time', e.target.value)}><option value="">{slots === null ? 'Pick a day first' : slots.length ? 'Choose…' : 'Nothing free'}</option>{(slots ?? []).map((s) => <option key={s.time} value={s.time}>{s.time}</option>)}</SelectInput>
                  : <TextInput type="time" required value={f.time} onChange={(e) => set('time', e.target.value)} />}
              </Field>
            </div>
          </div>
          {who.length > 1 && <Field label="With"><SelectInput value={f.resource_id} onChange={(e) => set('resource_id', e.target.value)}><option value="">Whoever is free</option>{who.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</SelectInput></Field>}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ width: 110 }}><Field label="People"><NumberInput min="1" value={f.people} onChange={(e) => set('people', e.target.value)} /></Field></div>
            <label style={{ fontSize: '0.82rem', paddingBottom: 10 }}><input type="checkbox" checked={f.on_site} onChange={(e) => set('on_site', e.target.checked)} /> At the customer's place</label>
          </div>
          {f.on_site && <Field label="Address"><TextInput value={f.address} onChange={(e) => set('address', e.target.value)} /></Field>}
          <Field label="Note (optional)"><TextInput value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
          {quote && (
            <div style={{ background: '#f9fafb', borderRadius: 8, padding: 10, fontSize: '0.8rem' }}>
              <div>{quote.minutes} minutes · price <strong>{money(quote.price)}</strong> (before tax)</div>
              {quote.fees.map((x) => <div key={x.ledger_id} style={{ color: colors.textMuted }}>{x.name}: {money(x.amount)} <span style={{ color: colors.textFaint }}>— {({ booking: 'at booking', completion: 'when done', late_cancel: 'if cancelled late', no_show: 'if no-show', reschedule: 'if moved late' })[x.timing]}</span></div>)}
              {quote.due_at_booking > 0 && <div style={{ marginTop: 4 }}>Invoiced now: <strong>{money(quote.due_at_booking)}</strong></div>}
            </div>
          )}
          <ModalActions onCancel={onClose} submitLabel="Book" busy={busy} disabled={!customer} />
        </FormStack>
      </form>
    </Modal>
  );
}

function CompleteModal({ b, onClose, onDone }) {
  const [extra, setExtra] = useState([]);
  const [ledgers, setLedgers] = useState([]);
  const [pv, setPv] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => { booksAPI.ledgers({ all: 1, active_only: 1 }).then((r) => setLedgers((Array.isArray(r) ? r : r.data ?? []).filter((l) => !['Sundry Debtors', 'Sundry Creditors', 'Cash-in-hand', 'Bank Accounts'].includes(l.group?.name)))).catch(() => {}); }, []);
  const rows = useMemo(() => extra.filter((x) => Number(x.amount) > 0), [extra]);
  useEffect(() => { setPv(null); setErr(null); bookingsAPI.complete(b.id, rows, true).then((r) => setPv(r.preview)).catch((e) => setErr(errMsg(e, 'Could not work out the invoice'))); }, [b.id, rows]);
  const setX = (i, k, v) => setExtra((xs) => xs.map((x, n) => (n === i ? { ...x, [k]: v } : x)));
  const go = async () => { setBusy(true); setErr(null); try { onDone(await bookingsAPI.complete(b.id, rows)); } catch (e) { setErr(errMsg(e, 'Could not complete')); } finally { setBusy(false); } };
  return (
    <Modal title={`Done — invoice ${b.number}`} onClose={onClose}>
      <FormStack>
        <FormError message={err} />
        <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textMuted }}>The service, its materials (taken from stock) and the fees due when it is done are invoiced. {b.deposit_amount > 0 && 'A paid deposit moves to the customer\'s account.'} Add anything extra, like overtime.</p>
        {extra.map((x, i) => (
          <div key={i} style={{ display: 'flex', gap: 6 }}>
            <div style={{ flex: 2 }}><TextInput value={x.description} onChange={(e) => setX(i, 'description', e.target.value)} placeholder="What for" /></div>
            <div style={{ width: 100 }}><NumberInput min="0" value={x.amount} onChange={(e) => setX(i, 'amount', e.target.value)} placeholder="Amount" /></div>
            <div style={{ flex: 2 }}><SelectInput value={x.ledger_id} onChange={(e) => setX(i, 'ledger_id', e.target.value)}><option value="">Account…</option>{ledgers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</SelectInput></div>
            <button type="button" style={small} onClick={() => setExtra((xs) => xs.filter((_, n) => n !== i))}>×</button>
          </div>
        ))}
        <div><button type="button" style={small} onClick={() => setExtra((xs) => [...xs, { description: '', amount: '', ledger_id: '' }])}>+ Add a charge</button></div>
        {pv && <p style={{ margin: 0, fontSize: '0.84rem' }}>Invoice total: <strong>{money(pv.total ?? 0)}</strong> <span style={{ color: colors.textFaint }}>(tax included)</span></p>}
        <ModalActions onCancel={onClose} submitLabel="Complete and invoice" busy={busy} onSubmit={go} />
      </FormStack>
    </Modal>
  );
}

function Detail({ b, reload, tell }) {
  const [moving, setMoving] = useState(false);
  const [mv, setMv] = useState({ date: '', time: '' });
  const [done, setDone] = useState(false);
  const act = async (fn, ev) => { try { const r = await fn(); toast.success(r.message); reload(); if (ev) tell(b.id, ev); } catch (e) { toast.error(errMsg(e, 'Could not do that')); } };
  const link = (v) => v && <span style={{ marginRight: 10 }}>{v.type} <strong>{v.number}</strong> ({v.status})</span>;
  return (
    <div style={{ padding: '4px 10px 12px', fontSize: '0.8rem' }}>
      <div style={{ color: colors.textMuted }}>{b.customer?.name} · {b.customer?.phone ?? 'no phone'} · {b.people} {b.people === 1 ? 'person' : 'people'}{b.on_site ? ` · at their place${b.address ? `: ${b.address}` : ''}` : ''}{b.notes ? ` · ${b.notes}` : ''}</div>
      <div style={{ margin: '6px 0' }}>{link(b.order)}{link(b.upfront)}{link(b.invoice)}{link(b.fee_invoice)}</div>
      {b.deposit_amount > 0 && <div>Deposit {money(b.deposit_amount)}: {b.deposit_status === 'released' ? 'on the customer\'s account' : b.deposit_paid ? 'paid, held' : 'not paid yet'}</div>}
      {b.fees.length > 0 && <div style={{ color: colors.textFaint }}>{b.fees.map((x) => `${x.name} ${money(x.amount)}`).join(' · ')}</div>}
      {b.status === 'cancelled' && <div style={{ color: '#6b7280' }}>Cancelled{b.cancelled_late ? ' late' : ''}{b.cancel_reason ? ` — ${b.cancel_reason}` : ''}</div>}
      <div style={{ marginTop: 8 }}>
        <button type="button" style={small} title="What this booking earned (Calculator)" onClick={() => { const st = useCalculatorStore.getState(); st.publish('booking-row', { type: 'booking', id: b.id }); st.setOpen(true); }}>What it earned</button>{' '}
        {b.can_change && (
          <>
            <button type="button" style={btnPrimary} onClick={() => setDone(true)}>Done — invoice</button>{' '}
            <button type="button" style={small} onClick={() => setMoving((m) => !m)}>Move</button>
            <button type="button" style={small} onClick={() => { if (window.confirm(b.is_late ? 'This is inside the cancellation window: the cancellation fee will be charged. Cancel?' : 'Cancel this booking?')) act(() => bookingsAPI.cancel(b.id, window.prompt('Reason (optional)') || undefined), 'cancelled'); }}>Cancel{b.is_late ? ' (late)' : ''}</button>
            <button type="button" style={small} onClick={() => { if (window.confirm('Mark as no-show? The no-show fee will be charged.')) act(() => bookingsAPI.noShow(b.id), 'no_show'); }}>No-show</button>
          </>
        )}
        <button type="button" style={small} onClick={() => tell(b.id, b.status === 'cancelled' ? 'cancelled' : b.status === 'completed' ? 'done' : 'booked')}>Tell customer</button>
      </div>
      {moving && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          <input type="date" value={mv.date} onChange={(e) => setMv({ ...mv, date: e.target.value })} />
          <input type="time" value={mv.time} onChange={(e) => setMv({ ...mv, time: e.target.value })} />
          <button type="button" style={btnPrimary} disabled={!mv.date || !mv.time} onClick={() => act(() => bookingsAPI.reschedule(b.id, { starts_at: `${mv.date} ${mv.time}` }), 'moved')}>Move it</button>
          {b.is_late && <span style={{ color: '#92400e' }}>Inside the move window — a fee may apply.</span>}
        </div>
      )}
      {done && <CompleteModal b={b} onClose={() => setDone(false)} onDone={(r) => { setDone(false); toast.success(r.message); reload(); tell(b.id, 'done'); }} />}
    </div>
  );
}

export default function Bookings() {
  const [params] = useSearchParams();
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(params.get('id') ? Number(params.get('id')) : null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => bookingsAPI.list({ status: status || undefined, search: search || undefined }).then(setData).catch((e) => setError(errMsg(e, 'Could not load the bookings'))), [status, search]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1100, margin: '0 auto' }}>
        <HubHeader title="Bookings" description="Services booked for a time, with a person or room. Deposits and fees go through Books." action={<button type="button" style={btnPrimary} onClick={() => setCreating(true)}>New booking</button>} />
        {error && <p role="alert" style={{ padding: '8px 12px', borderRadius: 8, background: '#fef2f2', color: '#991b1b', fontSize: '0.82rem' }}>{error}</p>}
        {data && !data.table_ready && <p style={{ padding: '8px 12px', borderRadius: 8, background: '#fffbeb', color: '#92400e', fontSize: '0.8rem' }}>Run script 61_bookings.sql to start taking bookings.</p>}
        <div style={{ display: 'flex', gap: 8, margin: '8px 0 12px', flexWrap: 'wrap' }}>
          {['', 'confirmed', 'completed', 'cancelled', 'no_show'].map((s) => (
            <button key={s} type="button" onClick={() => setStatus(s)} style={{ ...small, fontWeight: status === s ? 700 : 500, background: status === s ? 'color-mix(in srgb, var(--color-primary-500) 14%, var(--surface-card, #fff))' : 'var(--surface-card, #fff)', color: status === s ? 'var(--color-primary-500)' : 'var(--text-primary)', border: `1.5px solid ${status === s ? 'var(--color-primary-500)' : 'var(--line)'}` }}>{s ? `${LABEL[s]}${data?.counts?.[s] ? ` (${data.counts[s]})` : ''}` : 'All'}</button>
          ))}
          <input placeholder="Search number or customer" value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginLeft: 'auto', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface-card, #fff)', color: 'var(--text-primary)', fontSize: '0.8rem', minWidth: 220 }} />
        </div>
        {!data && !error && <p style={{ color: colors.textMuted }}>Loading…</p>}
        {data?.table_ready && (
          <section style={{ ...card, padding: 4, overflowX: 'auto' }}>
            {!data.rows.length ? <p style={{ padding: 16, color: colors.textMuted, fontSize: '0.84rem' }}>No bookings yet.</p> : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>When</th><th style={th}>Booking</th><th style={th}>Customer</th><th style={th}>With</th><th style={{ ...th, textAlign: 'right' }}>Price</th><th style={th}>Status</th></tr></thead>
                <tbody>
                  {data.rows.map((b) => (
                    <Fragment key={b.id}>
                      <tr onClick={() => setOpen(open === b.id ? null : b.id)} style={{ cursor: 'pointer', background: open === b.id ? '#f9fafb' : undefined }}>
                        <td style={td}>{when(b.starts_at)}</td>
                        <td style={td}><strong>{b.number}</strong><br /><span style={{ color: colors.textFaint }}>{b.service}{b.package && b.package !== 'Standard' ? ` — ${b.package}` : ''}</span></td>
                        <td style={td}>{b.customer?.name}</td>
                        <td style={td}>{b.resource?.name ?? '—'}{b.branch ? <><br /><span style={{ color: colors.textFaint }}>{b.branch}</span></> : null}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{money(b.price)}</td>
                        <td style={td}><span style={{ color: TONE[b.status], fontWeight: 700 }}>{LABEL[b.status]}</span></td>
                      </tr>
                      {open === b.id && <tr><td colSpan={6} style={{ background: '#f9fafb' }}><Detail b={b} reload={load} tell={(id, ev) => setNotice({ id, event: ev })} /></td></tr>}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}
        {creating && <NewBooking onClose={() => setCreating(false)} onDone={(r) => { setCreating(false); toast.success(r.message); load(); setOpen(r.booking.id); setNotice({ id: r.booking.id, event: 'booked' }); }} />}
        {notice && <NoticeModal id={notice.id} event={notice.event} onClose={() => setNotice(null)} />}
      </div>
    </AdminLayout>
  );
}
