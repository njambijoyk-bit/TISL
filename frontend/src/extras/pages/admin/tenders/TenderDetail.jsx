import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Send, X, Pencil, Upload, Trash2, Mail, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import { tendersAPI, vendorsAPI } from '../../../../_shared/api/index';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { btnPrimary, btnGhost, card, colors } from '../../../../_shared/theme/tokens';
import { Field, TextInput, SelectInput, CheckboxRow } from '../../../../core/components/admin/ui/Form';
import { AdminPage, Loading, Empty, Tabs, StatusBadge, NoticeDetails, AttachmentRow, GroupBadge, ErrorBanner } from '../../../components/procurement/ui';
import { mono, fmtDateTime, DOC_TYPE_LABELS, GROUP_LABELS, VISIBILITY_LABELS } from '../../../components/procurement/format';
import { goToFile } from '../../../components/procurement/openDocument';
import { AddendaPanel, AwardPanel } from './TenderAddendaAward';

const box = { ...card, padding: 18, display: 'grid', gap: 12 };

function Attachments({ tender, reload, onError }) {
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [type, setType] = useState('tender_document');
  const [name, setName] = useState('');
  const [notify, setNotify] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const published = tender.status === 'published';

  const open = async (d, inline) => {
    try { goToFile((await tendersAPI.documentLink(tender.id, d.id, inline)).url, inline); } catch (x) { onError(errMsg(x, 'Could not open the file')); }
  };
  const upload = async (e) => {
    e.preventDefault();
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file); fd.append('document_type', type);
    if (name.trim()) fd.append('name', name.trim());
    if (notify && published) { fd.append('notify', '1'); if (note.trim()) fd.append('note', note.trim()); }
    setBusy(true);
    try {
      const res = await tendersAPI.uploadDocument(tender.id, fd);
      toast.success(res.message);
      setFile(null); setName(''); setNote(''); setNotify(false);
      if (fileRef.current) fileRef.current.value = '';
      reload();
    } catch (x) { onError(errMsg(x, 'Upload failed')); } finally { setBusy(false); }
  };
  const retype = async (d, v) => { try { await tendersAPI.updateDocument(tender.id, d.id, { document_type: v }); reload(); } catch (x) { onError(errMsg(x, 'Could not change it')); } };
  const remove = async (d) => {
    if (!window.confirm(`Remove "${d.name}"? Vendors and the public will no longer see it.`)) return;
    try { await tendersAPI.deleteDocument(tender.id, d.id); toast.success('File removed'); reload(); } catch (x) { onError(errMsg(x, 'Could not remove it')); }
  };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <form onSubmit={upload} style={box}>
        <strong style={{ fontSize: '0.85rem' }}>Add a file</strong>
        <p style={{ margin: 0, fontSize: '0.75rem', color: colors.textMuted }}>PDF and HTML open in the browser (HTML runs in a sandbox with no scripts). Other types download. Up to 50 MB.</p>
        <input ref={fileRef} type="file" onChange={e => setFile(e.target.files?.[0] || null)} aria-label="File to upload" style={{ fontSize: '0.8rem', color: colors.text }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <Field label="Type"><SelectInput value={type} onChange={e => setType(e.target.value)}>{Object.entries(DOC_TYPE_LABELS).filter(([k]) => k !== 'addendum').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectInput></Field>
          <Field label="Name shown" hint="Blank = the file's name"><TextInput value={name} onChange={e => setName(e.target.value)} /></Field>
        </div>
        {published && (
          <>
            <CheckboxRow checked={notify} onChange={setNotify} label="Tell eligible vendors about this file" description="Sends a notification and email to the vendors who can see this tender" />
            {notify && <Field label="Note to add"><TextInput value={note} onChange={e => setNote(e.target.value)} maxLength={255} /></Field>}
          </>
        )}
        <div><button type="submit" disabled={!file || busy} style={{ ...btnPrimary, opacity: !file || busy ? 0.6 : 1 }}><Upload size={14} /> {busy ? 'Uploading…' : 'Upload'}</button></div>
      </form>

      {(tender.documents || []).length === 0 ? <Empty>No files yet. Upload the tender document first.</Empty> : (
        <div style={box}>
          {tender.documents.map(d => (
            <AttachmentRow key={d.id} doc={d} onOpen={open} extra={
              <>
                <select aria-label="Change type" value={d.document_type} onChange={e => retype(d, e.target.value)} style={{ fontSize: '0.74rem', color: colors.text, background: 'transparent', border: `1px solid ${colors.tint(0.2)}`, borderRadius: 6, padding: '2px 4px' }}>
                  {Object.entries(DOC_TYPE_LABELS).filter(([k]) => k !== 'addendum' || d.document_type === 'addendum').map(([k, v]) => <option key={k} value={k} disabled={k === 'addendum'}>{v}</option>)}
                </select>
                <button type="button" aria-label={`Remove ${d.name}`} onClick={() => remove(d)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.danger, padding: 0 }}><Trash2 size={14} /></button>
              </>
            } />
          ))}
        </div>
      )}
    </div>
  );
}

function Audience({ tender, reload, onError }) {
  const [eligible, setEligible] = useState(null);
  const [note, setNote] = useState('');
  const [kind, setKind] = useState('notice');
  const [busy, setBusy] = useState(false);
  const [vendors, setVendors] = useState([]);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState([]);
  const [group, setGroup] = useState('');

  const loadEligible = useCallback(() => tendersAPI.eligible(tender.id).then(setEligible).catch(() => setEligible({ count: 0, vendors: [] })), [tender.id]);
  useEffect(() => { loadEligible(); }, [loadEligible, tender.visibility, tender.invitations?.length]);
  useEffect(() => {
    if (tender.visibility !== 'invited') return undefined;
    const t = setTimeout(() => vendorsAPI.list({ search: search || undefined, status: 'active' }).then(r => setVendors(r.rows || [])).catch(() => setVendors([])), 250);
    return () => clearTimeout(t);
  }, [search, tender.visibility]);

  const invite = async () => {
    try { const res = await tendersAPI.invite(tender.id, { vendor_ids: picked, group: group || undefined }); toast.success(res.message); setPicked([]); setGroup(''); reload(); }
    catch (x) { onError(errMsg(x, 'Could not invite')); }
  };
  const uninvite = async (vid) => { try { await tendersAPI.uninvite(tender.id, vid); reload(); } catch (x) { onError(errMsg(x, 'Could not remove')); } };
  const send = async () => {
    setBusy(true);
    try { const res = await tendersAPI.email(tender.id, { note: note || undefined, kind }); toast.success(res.message); setNote(''); reload(); }
    catch (x) { onError(errMsg(x, 'Could not send')); } finally { setBusy(false); }
  };

  const draft = tender.status === 'draft';
  const toggle = (id) => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {tender.visibility === 'invited' && (
        <div style={box}>
          <strong style={{ fontSize: '0.85rem' }}>Invited vendors ({(tender.invitations || []).length})</strong>
          {(tender.invitations || []).length === 0 && <p style={{ margin: 0, fontSize: '0.78rem', color: colors.textMuted }}>No one is invited yet, so no vendor can see this tender.</p>}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(tender.invitations || []).map(i => (
              <span key={i.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${colors.tint(0.2)}`, borderRadius: 999, padding: '3px 10px', fontSize: '0.76rem', color: colors.text }}>
                {i.vendor?.company_name}{i.vendor?.special_group && <GroupBadge group={i.vendor.special_group} />}
                <button type="button" aria-label={`Remove ${i.vendor?.company_name}`} onClick={() => uninvite(i.vendor_id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: colors.textMuted }}><X size={12} /></button>
              </span>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <Field label="Find vendors"><TextInput value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name" /></Field>
            <Field label="Or invite a whole group" hint="Every active vendor in that people category">
              <SelectInput value={group} onChange={e => setGroup(e.target.value)}><option value="">No group</option>{Object.entries(GROUP_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectInput>
            </Field>
          </div>
          <div style={{ maxHeight: 200, overflowY: 'auto', display: 'grid', gap: 2 }}>
            {vendors.map(v => <CheckboxRow key={v.id} checked={picked.includes(v.id)} onChange={() => toggle(v.id)} label={v.company_name} description={v.vendor_number} />)}
          </div>
          <div><button type="button" style={btnPrimary} disabled={picked.length === 0 && !group} onClick={invite}>Invite{picked.length ? ` ${picked.length}` : ''}{group ? ` + ${GROUP_LABELS[group]}` : ''}</button></div>
        </div>
      )}

      <div style={box}>
        <strong style={{ fontSize: '0.85rem' }}>Email vendors</strong>
        <p style={{ margin: 0, fontSize: '0.78rem', color: colors.textMuted }}>
          {eligible === null ? 'Counting…' : <>This reaches <strong>{eligible.count}</strong> vendor{eligible.count === 1 ? '' : 's'} who can see this tender{(tender.reservation_groups || []).length ? ' and are in one of the reserved groups' : ''}. Each gets a notification, and an email where they have turned email on.</>}
        </p>
        {eligible?.vendors?.length > 0 && <p style={{ margin: 0, fontSize: '0.72rem', color: colors.textFaint, overflowWrap: 'anywhere' }}>{eligible.vendors.slice(0, 12).map(v => v.company_name).join(', ')}{eligible.count > 12 ? ` and ${eligible.count - 12} more` : ''}</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 1fr) minmax(200px, 2fr)', gap: 12 }}>
          <Field label="Message is about"><SelectInput value={kind} onChange={e => setKind(e.target.value)}><option value="notice">A new tender</option><option value="addendum">An addendum</option></SelectInput></Field>
          <Field label="Note to add"><TextInput value={note} onChange={e => setNote(e.target.value)} maxLength={255} /></Field>
        </div>
        <div>
          <button type="button" style={{ ...btnPrimary, opacity: draft || busy || !eligible?.count ? 0.6 : 1 }} disabled={draft || busy || !eligible?.count} onClick={send}><Mail size={14} /> {busy ? 'Sending…' : 'Email eligible vendors'}</button>
          {draft && <span style={{ fontSize: '0.74rem', color: colors.textMuted, marginLeft: 10 }}>Publish first.</span>}
        </div>
      </div>

      {(tender.mailings || []).length > 0 && (
        <div style={box}>
          <strong style={{ fontSize: '0.85rem' }}>Sent so far</strong>
          {tender.mailings.map(m => (
            <div key={m.id} style={{ fontSize: '0.78rem', color: colors.textBody, overflowWrap: 'anywhere' }}>
              {fmtDateTime(m.created_at)}: {m.kind === 'addendum' ? 'addendum' : 'new tender'} to {m.recipient_count} vendor{m.recipient_count === 1 ? '' : 's'} by {m.sender?.name || 'staff'}{m.note ? ` ("${m.note}")` : ''}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TenderDetail() {
  const { id } = useParams();
  const [tender, setTender] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [tab, setTab] = useState('details');
  const [publishing, setPublishing] = useState(false);
  const [notifyOnPublish, setNotifyOnPublish] = useState(true);
  const [reopening, setReopening] = useState(false);
  const [newClose, setNewClose] = useState('');

  const load = useCallback(async () => {
    try { setTender(await tendersAPI.show(id)); setLoadError(null); } catch (e) { setLoadError(errMsg(e, 'Failed to load tender')); } finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const act = (fn, ok) => async () => {
    try { setActionError(null); const r = await fn(); toast.success(r?.message || ok); load(); } catch (e) { setActionError(errMsg(e, 'Could not do that')); }
  };
  const open = async (d, inline) => {
    try { goToFile((await tendersAPI.documentLink(id, d.id, inline)).url, inline); } catch (x) { setActionError(errMsg(x, 'Could not open the file')); }
  };

  if (loading) return <AdminPage><Loading /></AdminPage>;
  if (!tender) return <AdminPage><ErrorBanner message={loadError} /><Empty>Tender not found</Empty></AdminPage>;

  const st0 = tender.status;
  const shown = { ...tender, published_at: tender.published_at, awards: st0 === 'awarded' ? (tender.awards || []).map(w => ({ lot_code: w.lot_code, lot_title: (tender.lots || []).find(l => l.code === w.lot_code)?.title, winner: w.winner_name, amount: w.amount, currency: w.currency, awarded_on: w.awarded_on })) : [], documents: (tender.documents || []).map(d => ({ ...d, type: d.document_type, uploaded_at: d.created_at, size: d.file_size, filename: d.original_filename })) };
  const st = tender.status;
  const lbl = { fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: colors.primaryDeep, marginBottom: 3 };

  return (
    <AdminPage width={1000}>
      <Link to="/admin/tenders" style={{ ...btnGhost, textDecoration: 'none', marginBottom: 16, padding: '5px 12px', fontSize: '0.75rem' }}><ArrowLeft size={13} /> Tenders</Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={{ minWidth: 0, flex: '1 1 340px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: colors.primary, margin: 0, overflowWrap: 'anywhere' }}>{tender.title}</h1>
            <StatusBadge status={tender.display_status || st} />
          </div>
          <p style={{ ...mono, color: colors.textMuted, margin: '4px 0 0' }}>{tender.tender_number}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to={`/admin/tenders/${id}/edit`} style={{ ...btnGhost, textDecoration: 'none' }}><Pencil size={14} /> Edit</Link>
          {st === 'draft' && <button type="button" style={btnPrimary} onClick={() => setPublishing(p => !p)}><Send size={14} /> Publish</button>}
          {st === 'published' && <button type="button" style={btnGhost} onClick={act(() => tendersAPI.close(id), 'Tender closed')}>Close now</button>}
          {['closed', 'cancelled'].includes(st) && <button type="button" style={btnGhost} onClick={() => setReopening(r => !r)}><RotateCcw size={14} /> Reopen</button>}
          {['draft', 'published', 'closed'].includes(st) && <button type="button" style={{ ...btnGhost, color: colors.danger }} onClick={() => { if (window.confirm('Terminate this tender? It stays visible as Terminated.')) act(() => tendersAPI.cancel(id), 'Tender terminated')(); }}><X size={14} /> Terminate</button>}
        </div>
      </div>

      {publishing && (
        <div style={{ ...box, marginBottom: 16 }}>
          <strong style={{ fontSize: '0.85rem' }}>Publish this tender</strong>
          <p style={{ margin: 0, fontSize: '0.78rem', color: colors.textMuted }}>Who can see it: {VISIBILITY_LABELS[tender.visibility]}. Make sure the tender document is uploaded.</p>
          <CheckboxRow checked={notifyOnPublish} onChange={setNotifyOnPublish} label="Tell eligible vendors now" description="Sends a notification and email to vendors who can see it" />
          <div><button type="button" style={btnPrimary} onClick={async () => { await act(() => tendersAPI.publish(id, { notify: notifyOnPublish }), 'Tender published')(); setPublishing(false); }}>Publish</button></div>
        </div>
      )}
      {reopening && (
        <div style={{ ...box, marginBottom: 16 }}>
          <Field label="New close date and time"><TextInput type="datetime-local" value={newClose} onChange={e => setNewClose(e.target.value)} /></Field>
          <div><button type="button" style={btnPrimary} disabled={!newClose} onClick={async () => { await act(() => tendersAPI.reopen(id, { submission_deadline: newClose }), 'Reopened')(); setReopening(false); }}>Reopen</button></div>
        </div>
      )}

      <ErrorBanner message={actionError} />
      <Tabs value={tab} onChange={setTab} tabs={[['details', 'Details'], ['files', `Files (${(tender.documents || []).length})`], ['addenda', `Addenda (${(tender.addenda || []).length})`], ['award', 'Award'], ['vendors', 'Vendors and email']]} />

      {tab === 'details' && (
        <div style={{ display: 'grid', gap: 14 }}>
          <NoticeDetails tender={shown} onOpen={open} extra={[['Who can see it', VISIBILITY_LABELS[tender.visibility]]]} />
          {tender.description && <div style={{ ...card, padding: 22 }}><div style={lbl}>Description</div><p style={{ fontSize: '0.85rem', lineHeight: 1.6, whiteSpace: 'pre-wrap', color: colors.textBody, margin: 0 }}>{tender.description}</p></div>}
        </div>
      )}
      {tab === 'files' && <Attachments tender={tender} reload={load} onError={setActionError} />}
      {tab === 'addenda' && <AddendaPanel tender={tender} reload={load} onError={setActionError} />}
      {tab === 'award' && <AwardPanel key={st} tender={tender} reload={load} onError={setActionError} />}
      {tab === 'vendors' && <Audience tender={tender} reload={load} onError={setActionError} />}
    </AdminPage>
  );
}
