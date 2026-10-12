import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { FileText, Plus, Trash2 } from 'lucide-react';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../core/components/admin/ui/HubHeader';
import Modal from '../../../core/components/admin/ui/Modal';
import { Field, FormStack, ModalActions, SelectInput, TextArea, TextInput } from '../../../core/components/admin/ui/Form';
import SalesAccountSelect from '../../../core/components/admin/tax/SalesAccountSelect';
import VariantPicker from '../../../core/components/admin/pickers/VariantPicker';
import coursesAPI from '../../../_shared/api/courses';
import useAuthStore from '../../../_shared/store/authStore';
import { hasAnyPermission } from '../../../_shared/lib/roles';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../../_shared/theme/tokens';
import CoursesNav from '../../components/CoursesNav';
import Pill from '../../components/Pill';
import UserPicker from '../../components/UserPicker';

const money = (n) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TONE = { pending: 'warn', paid: 'ok', fulfilled: 'ok', cancelled: 'neutral', refunded: 'neutral' };
const fmtBytes = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function BookForm({ meta, book, onClose, onDone }) {
  const [f, setF] = useState({ title: book?.title ?? '', authors: book?.authors ?? '', isbn: book?.isbn ?? '', description: book?.description ?? '', cover: book?.cover ?? '', format: book?.format ?? 'printed', price: book?.price ?? '',
    ledger_id: book?.ledger_id ?? '', stock_variant_id: book?.stock_variant_id ?? null, stock_item: book?.stock_item ?? '', download_limit: book?.download_limit ?? 5, is_active: book?.is_active ?? true });
  const [cur, setCur] = useState(book);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const body = () => ({ title: f.title, authors: f.authors, isbn: f.isbn, description: f.description, cover: f.cover, format: f.format, price: Number(f.price), ledger_id: Number(f.ledger_id), stock_variant_id: f.stock_variant_id, download_limit: Number(f.download_limit), is_active: f.is_active });
  const save = async () => {
    setBusy(true);
    try { const r = await coursesAPI.saveBook(body(), cur?.id); const wasNew = !cur; toast.success(wasNew && f.format !== 'printed' ? 'Book saved. Now add the file.' : 'Book saved.'); setCur(r.book); onDone(r.book, wasNew && f.format !== 'printed'); } catch (e) { toast.error(errMsg(e, 'Could not save the book'), { duration: 8000 }); } finally { setBusy(false); }
  };
  const upload = (which) => async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !cur) return;
    try { const r = await coursesAPI.uploadBookFile(cur.id, which, file); setCur(r.book); toast.success('File added.'); onDone(r.book, true); } catch (x) { toast.error(errMsg(x, 'Could not add the file'), { duration: 8000 }); }
  };
  const drop = (which) => async () => { try { const r = await coursesAPI.removeBookFile(cur.id, which); setCur(r.book); onDone(r.book, true); } catch (x) { toast.error(errMsg(x, 'Could not remove it')); } };
  const digital = f.format !== 'printed';
  const fileRow = (which, label, file) => (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: '0.86rem' }}>
      <strong style={{ minWidth: 120 }}>{label}</strong>
      {file ? <><FileText size={13} aria-hidden="true" /> {file.name} <span style={{ color: colors.textMuted }}>{fmtBytes(file.size_bytes)}</span><button type="button" aria-label={`Remove ${label}`} style={{ ...btnGhost, color: colors.danger }} onClick={drop(which)}><Trash2 size={13} aria-hidden="true" /></button></>
        : (cur ? <label style={{ ...btnGhost, cursor: 'pointer' }}>Add<input type="file" onChange={upload(which)} style={{ display: 'none' }} /></label> : <span style={{ color: colors.textMuted }}>Save the book first, then add it.</span>)}
    </div>
  );

  return (
    <Modal title={cur ? `Edit ${cur.title}` : 'Add a book'} onClose={onClose} width={640} footer={<ModalActions onCancel={onClose} onSubmit={save} submitLabel="Save book" busy={busy} disabled={!f.title.trim() || !f.price || !f.ledger_id} />}>
      <FormStack>
        <Field label="Title" htmlFor="bk-title"><TextInput id="bk-title" maxLength={190} value={f.title} onChange={set('title')} /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
          <Field label="Authors" htmlFor="bk-auth"><TextInput id="bk-auth" maxLength={200} value={f.authors} onChange={set('authors')} /></Field>
          <Field label="ISBN" htmlFor="bk-isbn"><TextInput id="bk-isbn" maxLength={30} value={f.isbn} onChange={set('isbn')} /></Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Format" htmlFor="bk-fmt"><SelectInput id="bk-fmt" value={f.format} onChange={set('format')}>{Object.entries(meta.formats).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectInput></Field>
          <Field label="Price (before tax)" htmlFor="bk-price"><TextInput id="bk-price" inputMode="decimal" value={f.price} onChange={set('price')} /></Field>
        </div>
        <SalesAccountSelect kind="sales" scope="product" label="Booked under (it decides the tax)" value={f.ledger_id} onChange={(v) => setF((x) => ({ ...x, ledger_id: v }))} required />
        {f.format !== 'digital' && (
          <Field label="Stock item (optional)" htmlFor="bk-stock" hint={f.stock_variant_id ? `Chosen: ${f.stock_item || `item ${f.stock_variant_id}`}. A printed copy leaves this stock when it is delivered.` : 'Choose the stock item so printed copies are counted.'}>
            <VariantPicker onPick={(r) => setF((x) => ({ ...x, stock_variant_id: r.variant_id, stock_item: r.product }))} placeholder="Search a stock item" />
            {f.stock_variant_id && <button type="button" style={{ ...btnGhost, marginTop: 4 }} onClick={() => setF((x) => ({ ...x, stock_variant_id: null, stock_item: '' }))}>Do not count stock</button>}
          </Field>
        )}
        {digital && <Field label="Downloads allowed per buyer" htmlFor="bk-dl" hint="0: no limit."><TextInput id="bk-dl" inputMode="numeric" value={f.download_limit} onChange={set('download_limit')} /></Field>}
        <Field label="About the book" htmlFor="bk-desc"><TextArea id="bk-desc" rows={4} maxLength={5000} value={f.description} onChange={set('description')} /></Field>
        <Field label="Cover picture address" htmlFor="bk-cover"><TextInput id="bk-cover" maxLength={255} value={f.cover} onChange={set('cover')} /></Field>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.86rem' }}><input type="checkbox" checked={f.is_active} onChange={set('is_active')} /> On sale</label>
        {digital && fileRow('file', 'The digital book', cur?.file)}
        {fileRow('sample', 'Free sample', cur?.sample)}
      </FormStack>
    </Modal>
  );
}

function SellForm({ books, meta, onClose, onDone }) {
  const [bookId, setBookId] = useState('');
  const [buyer, setBuyer] = useState(null);
  const [f, setF] = useState({ fulfil: '', quantity: 1, address: '', phone: '' });
  const [busy, setBusy] = useState(false);
  const book = books.find((b) => String(b.id) === String(bookId));
  const ways = book ? [book.format !== 'printed' && book.file ? 'digital' : null, book.format !== 'digital' ? 'delivery' : null, book.format !== 'digital' ? 'pickup' : null].filter(Boolean) : [];
  const save = async () => {
    setBusy(true);
    try { const r = await coursesAPI.sellBook(bookId, { buyer_user_id: buyer.id, fulfil: f.fulfil || ways[0], quantity: Number(f.quantity), address: f.address || undefined, phone: f.phone || undefined }); toast.success(r.message); onDone(); } catch (e) { toast.error(errMsg(e, 'Could not make the order'), { duration: 8000 }); } finally { setBusy(false); }
  };

  return (
    <Modal title="Sell a book" onClose={onClose} width={560} footer={<ModalActions onCancel={onClose} onSubmit={save} submitLabel="Make the order" busy={busy} disabled={!bookId || !buyer || ways.length === 0} />}>
      <FormStack>
        <Field label="Book" htmlFor="sl-book"><SelectInput id="sl-book" value={bookId} onChange={(e) => setBookId(e.target.value)}><option value="">Choose</option>{books.filter((b) => b.is_active).map((b) => <option key={b.id} value={b.id}>{b.title} · {money(b.price)}</option>)}</SelectInput></Field>
        <Field label="Buyer" htmlFor="sl-buyer" hint={buyer ? `Chosen: ${buyer.name}` : 'Search by name or email. They need a customer account.'}><UserPicker id="sl-buyer" onPick={setBuyer} /></Field>
        {book && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="How" htmlFor="sl-how"><SelectInput id="sl-how" value={f.fulfil || ways[0]} onChange={(e) => setF({ ...f, fulfil: e.target.value })}>{ways.map((w) => <option key={w} value={w}>{meta.fulfil[w]}</option>)}</SelectInput></Field>
            {(f.fulfil || ways[0]) !== 'digital' && <Field label="Copies" htmlFor="sl-q"><TextInput id="sl-q" inputMode="numeric" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} /></Field>}
          </div>
        )}
        {(f.fulfil || ways[0]) === 'delivery' && <Field label="Deliver to" htmlFor="sl-addr"><TextInput id="sl-addr" maxLength={500} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>}
      </FormStack>
    </Modal>
  );
}

function PayForm({ order, methods, onClose, onDone }) {
  const [amount, setAmount] = useState(String(order.balance));
  const [method, setMethod] = useState(methods[0]?.id ?? '');
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { const r = await coursesAPI.bookPayment(order.id, [{ payment_method_id: Number(method), amount: Number(amount), reference: ref || undefined }]); toast.success(r.message); onDone(); } catch (e) { toast.error(errMsg(e, 'Could not record the payment'), { duration: 8000 }); } finally { setBusy(false); }
  };

  return (
    <Modal title={`Take payment for ${order.number}`} subtitle={`${order.buyer} · ${money(order.balance)} to pay`} onClose={onClose} footer={<ModalActions onCancel={onClose} onSubmit={save} submitLabel="Record payment" busy={busy} disabled={!method || !(Number(amount) > 0)} />}>
      <FormStack>
        <Field label="Amount" htmlFor="bp-amt"><TextInput id="bp-amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Paid by" htmlFor="bp-m"><SelectInput id="bp-m" value={method} onChange={(e) => setMethod(e.target.value)}>{methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</SelectInput></Field>
        <Field label="Reference" htmlFor="bp-r"><TextInput id="bp-r" maxLength={80} value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
      </FormStack>
    </Modal>
  );
}

export default function CoursesBooks() {
  const user = useAuthStore((s) => s.user);
  const [meta, setMeta] = useState(null);
  const [data, setData] = useState(null);
  const [orders, setOrders] = useState(null);
  const [tab, setTab] = useState('library');
  const [form, setForm] = useState(null);
  const [sell, setSell] = useState(false);
  const [pay, setPay] = useState(null);
  const [status, setStatus] = useState('');

  const load = useCallback(() => coursesAPI.books().then(setData).catch((e) => toast.error(errMsg(e, 'Could not load the books'))), []);
  const loadOrders = useCallback(() => coursesAPI.bookOrders({ status }).then(setOrders).catch((e) => toast.error(errMsg(e, 'Could not load the orders'))), [status]);
  useEffect(() => { coursesAPI.booksMeta().then(setMeta).catch(() => {}); load(); }, [load]);
  useEffect(() => { if (tab === 'orders') loadOrders(); }, [tab, loadOrders]);

  if (!hasAnyPermission(user, ['courses.manage', 'courses.enrol'])) return <AdminLayout><div style={{ padding: 32 }}><NoAccess what="the books" /></div></AdminLayout>;
  const run = async (fn, ok) => { try { await fn(); toast.success(ok); await loadOrders(); } catch (e) { toast.error(errMsg(e, 'That did not work'), { duration: 8000 }); } };

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1100, margin: '0 auto' }} data-testid="courses-books">
        <CoursesNav />
        <HubHeader title="Books" description="Your own library of books, sold by invoice in the books. Printed copies leave stock when delivered; digital books are downloaded by the buyer after paying." />
        {data && !data.ready && <p role="status" style={{ color: colors.textMuted }}>Run database script 156_courses_books.sql to switch books on.</p>}
        {data?.ready && meta && (
          <>
            <div role="tablist" style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {[['library', 'Library'], ['orders', 'Orders']].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} style={{ ...btnGhost, fontWeight: tab === k ? 800 : 600, borderColor: tab === k ? colors.primary : undefined }}>{l}</button>)}
            </div>
            {tab === 'library' && (
              <div style={{ display: 'grid', gap: 10 }}>
                {meta.can_manage && <div><button type="button" style={btnPrimary} onClick={() => setForm({})}><Plus size={14} aria-hidden="true" /> Add a book</button></div>}
                {data.books.length === 0 && <p style={{ color: colors.textMuted }}>No books yet.</p>}
                {data.books.map((b) => (
                  <article key={b.id} data-book={b.title} style={{ ...card, padding: 14, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', opacity: b.is_active ? 1 : 0.6 }}>
                    {b.cover && <img src={b.cover} alt="" style={{ width: 44, height: 60, objectFit: 'cover', borderRadius: 4 }} />}
                    <div style={{ flex: 1, minWidth: 200 }}><strong>{b.title}</strong><div style={{ fontSize: '0.78rem', color: colors.textMuted }}>{b.authors}{b.isbn ? ` · ISBN ${b.isbn}` : ''}</div></div>
                    <Pill>{b.format_label}</Pill>
                    {b.stock_item && <Pill>Stock: {b.stock_item}</Pill>}
                    {b.file && <Pill tone="ok">File added</Pill>}
                    {!b.is_active && <Pill tone="danger">Off</Pill>}
                    <Pill>{b.sold} sold</Pill>
                    <strong>{money(b.price)}</strong>
                    {meta.can_manage && <><button type="button" style={btnGhost} onClick={() => setForm(b)}>Edit</button>
                      <button type="button" aria-label={`Remove ${b.title}`} style={{ ...btnGhost, color: colors.danger }} onClick={() => window.confirm('Remove this book?') && coursesAPI.removeBook(b.id).then(load).catch((e) => toast.error(errMsg(e, 'Could not remove it'), { duration: 8000 }))}><Trash2 size={13} aria-hidden="true" /></button></>}
                  </article>
                ))}
              </div>
            )}
            {tab === 'orders' && (
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {meta.can_enrol && <button type="button" style={btnPrimary} onClick={() => setSell(true)}><Plus size={14} aria-hidden="true" /> Sell a book</button>}
                  <SelectInput aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} style={{ maxWidth: 190 }}><option value="">Any status</option>{Object.entries(meta.statuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectInput>
                </div>
                {orders && orders.orders.length === 0 && <p style={{ color: colors.textMuted }}>No orders yet.</p>}
                {orders?.orders.map((o) => (
                  <article key={o.id} data-order={o.number} style={{ ...card, padding: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 220 }}><strong>{o.book}</strong> × {o.quantity}<div style={{ fontSize: '0.78rem', color: colors.textMuted }}>{o.number} · {o.buyer} · {o.fulfil_label}{o.address ? ` · ${o.address}` : ''}</div></div>
                    <Pill tone={TONE[o.status]}>{o.status_label}</Pill>
                    <span style={{ fontSize: '0.84rem' }}>{money(o.paid_total)} of {money(o.total)}</span>
                    {o.fulfil === 'digital' && o.downloads > 0 && <Pill>{o.downloads} download{o.downloads === 1 ? '' : 's'}</Pill>}
                    {o.stock_note && <Pill tone="warn">{o.stock_note}</Pill>}
                    {meta.can_enrol && o.status === 'pending' && <button type="button" style={btnPrimary} onClick={() => setPay(o)}>Take payment</button>}
                    {meta.can_enrol && o.status === 'paid' && o.fulfil !== 'digital' && <button type="button" style={btnPrimary} onClick={() => run(() => coursesAPI.deliverBook(o.id), 'Marked as delivered.')}>Delivered</button>}
                    {meta.can_enrol && o.status === 'pending' && o.paid_total <= 0 && <button type="button" style={btnGhost} onClick={() => { const r = window.prompt('Why is it cancelled? (optional)'); if (r !== null) run(() => coursesAPI.cancelBook(o.id, r), 'Order cancelled.'); }}>Cancel</button>}
                    {meta.can_refund && ['paid', 'fulfilled'].includes(o.status) && <button type="button" style={{ ...btnGhost, color: colors.danger }} onClick={() => { if (window.confirm(`Refund ${o.number}? A credit note is made for the whole sale.`)) run(() => coursesAPI.refundBook(o.id, window.prompt('Why? (optional)') ?? ''), 'Refunded: the credit note is in the books.'); }}>Refund</button>}
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      {form && meta && <BookForm meta={meta} book={form.id ? form : null} onClose={() => { setForm(null); load(); }} onDone={(b, stay) => { if (!stay) setForm(null); load(); }} />}
      {sell && data && meta && <SellForm books={data.books} meta={meta} onClose={() => setSell(false)} onDone={() => { setSell(false); loadOrders(); }} />}
      {pay && meta && <PayForm order={pay} methods={meta.payment_methods} onClose={() => setPay(null)} onDone={() => { setPay(null); loadOrders(); }} />}
    </AdminLayout>
  );
}
