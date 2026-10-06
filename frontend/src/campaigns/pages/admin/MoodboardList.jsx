import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader, { Toolbar } from '../../../core/components/admin/ui/HubHeader';
import Modal from '../../../core/components/admin/ui/Modal';
import { Field, TextInput } from '../../../core/components/admin/ui/Form';
import moodboardsAPI from '../../../_shared/api/moodboards';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import useAuthStore from '../../../_shared/store/authStore';
import { btnPrimary, btnGhost, card, colors } from '../../../_shared/theme/tokens';
import { filterStyle } from '../../../core/components/admin/books/booksFmt';
import BoardChip from '../../components/BoardChip';
import Moodboard from '../../components/Moodboard';
import DownloadMoodboardButton from '../../components/DownloadMoodboardButton';
import { seedContents } from '../../lib/moodboardKit';

const FILTERS = [['', 'All'], ['pending', 'Waiting for approval'], ['approved', 'Approved'], ['draft', 'Drafts'], ['rejected', 'Not approved']];

function NewMoodboard({ onClose }) {
  const nav = useNavigate();
  const [src, setSrc] = useState(null);
  const [from, setFrom] = useState('preset:collage');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { moodboardsAPI.presets().then(setSrc).catch((e) => toast.error(errMsg(e, 'Could not load the layouts'))); }, []);
  const go = async () => {
    setBusy(true);
    try { const r = await moodboardsAPI.create(title, from); nav(`/admin/moodboards/${r.data.id}/edit`); } catch (e) { toast.error(errMsg(e, 'Could not start it')); setBusy(false); }
  };
  const pick = (key, label, layout, sub) => (
    <button key={key} type="button" onClick={() => setFrom(key)} style={{ padding: 8, textAlign: 'left', cursor: 'pointer', borderRadius: 12, background: 'var(--surface-card)', border: `2px solid ${from === key ? 'var(--color-primary-500)' : 'var(--line)'}`, fontFamily: 'inherit' }}>
      <Moodboard board={{ layout, contents: seedContents(layout) }} editing radius={6} />
      <div style={{ fontWeight: 700, fontSize: '0.8rem', color: colors.text, marginTop: 6 }}>{label}</div>
      {sub && <div style={{ fontSize: '0.68rem', color: colors.textFaint }}>{sub}</div>}
    </button>
  );

  return (
    <Modal title="New moodboard" subtitle="Name it and choose a layout to start from" onClose={onClose} width={820}
      footer={<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button type="button" style={btnGhost} onClick={onClose}>Cancel</button><button type="button" style={{ ...btnPrimary, opacity: title.trim() ? 1 : 0.5 }} disabled={!title.trim() || busy} onClick={go}>{busy ? 'Starting…' : 'Start'}</button></div>}>
      <Field label="Name"><TextInput value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} autoFocus /></Field>
      <p style={{ fontSize: '0.7rem', fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '16px 0 8px' }}>Layouts</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10 }}>{src?.presets.map((p) => pick(`preset:${p.key}`, p.label, p.layout, p.description))}</div>
      {src?.templates.length > 0 && (
        <>
          <p style={{ fontSize: '0.7rem', fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '16px 0 8px' }}>Your saved templates</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10 }}>{src.templates.map((t) => pick(`template:${t.id}`, t.title, t.layout))}</div>
        </>
      )}
    </Modal>
  );
}

/** The moodboards: collages made from a layout. Sales and finance moodboards wait here for approval. Saved templates have their own tab. */
export default function MoodboardList() {
  const nav = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState(false);
  const [approval, setApproval] = useState('');
  const [q, setQ] = useState('');
  const [making, setMaking] = useState(false);
  const isSuper = useAuthStore((st) => st.user?.role) === 'super_admin';
  const [bin, setBin] = useState(false);
  const [priv, setPriv] = useState(false);   // customers' private moodboards (admin and super admin only; each look is logged)
  const canSeePrivate = ['admin', 'super_admin'].includes(useAuthStore((st) => st.user?.role));   // the recycle bin: moodboards that were deleted

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows((await moodboardsAPI.list({ trashed: bin ? 1 : undefined, private_customers: priv && !bin ? 1 : undefined, templates: templates ? 1 : 0, approval: !templates && approval ? approval : undefined, q: q || undefined })).data); }
    catch (e) { toast.error(errMsg(e, 'Could not load the moodboards')); } finally { setLoading(false); }
  }, [templates, approval, q, bin, priv]);
  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (fn, id) => { try { const r = await fn(id); toast.success(r.message); load(); } catch (e) { toast.error(errMsg(e, 'That did not work')); } };
  const purge = (m) => { if (window.confirm(`Delete "${m.title}" for good? Its comments and likes go too (the pins stay). This cannot be undone.`)) act(moodboardsAPI.purge, m.id); };
  const chip = (on) => ({ ...filterStyle, cursor: 'pointer', fontWeight: on ? 700 : 500, background: on ? 'color-mix(in srgb, var(--color-primary-500) 14%, var(--surface-card))' : 'var(--surface-card)' });

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1300, margin: '0 auto' }}>
        <HubHeader title="Moodboards" description="Collages of pictures, colours, words and stickers, made from a layout. Approved ones show on the website." />
        <Toolbar right={<div style={{ display: 'flex', gap: 8 }}>
          <button type="button" style={btnGhost} onClick={() => setBin(!bin)}>{bin ? '‹ Back to moodboards' : <><Trash2 size={14} /> Recycle bin</>}</button>
          {!bin && <button type="button" style={btnPrimary} onClick={() => setMaking(true)}><Plus size={14} /> New moodboard</button>}
        </div>}>
          <div style={{ display: bin ? 'none' : 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" style={chip(!templates && !approval && !priv)} onClick={() => { setTemplates(false); setApproval(''); setPriv(false); }}>All</button>
            {FILTERS.slice(1).map(([k, l]) => <button key={k} type="button" style={chip(!templates && approval === k && !priv)} onClick={() => { setTemplates(false); setApproval(k); setPriv(false); }}>{l}</button>)}
            <button type="button" style={chip(templates)} onClick={() => { setTemplates(true); setPriv(false); }}>Templates</button>
            {canSeePrivate && <button type="button" style={chip(priv)} onClick={() => { setTemplates(false); setApproval(''); setPriv(true); }}>Customers' private</button>}
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name…" style={{ ...filterStyle, minWidth: 220 }} />
        </Toolbar>
        {loading && rows.length === 0 && <p style={{ color: colors.textFaint }}>Loading…</p>}
        {!loading && rows.length === 0 && <p style={{ ...card, padding: 18, color: colors.textMuted, fontSize: '0.86rem' }}>{bin ? 'The recycle bin is empty.' : priv ? 'No private customer moodboards.' : templates ? 'No templates yet. Open a moodboard and choose Save as template.' : 'No moodboards yet. Start one with New moodboard.'}</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
          {rows.map((m) => (
            <div key={m.id} role={bin ? undefined : 'button'} tabIndex={bin ? undefined : 0} onClick={bin ? undefined : () => nav(`/admin/moodboards/${m.id}/edit`)} style={{ ...card, position: 'relative', padding: 10, textAlign: 'left', cursor: bin ? 'default' : 'pointer', fontFamily: 'inherit', opacity: m.status === 'hidden' ? 0.6 : 1 }}>
              <Moodboard board={m} radius={8} />
              {!bin && !m.is_template && <DownloadMoodboardButton board={m} icon style={{ top: 18, right: 18 }} />}
              <div style={{ marginTop: 8, fontWeight: 700, color: colors.text, fontSize: '0.88rem' }}>{m.title}</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
                {!m.is_template && <BoardChip board={{ approval_status: m.approval_status, status: m.status, visibility: 'public' }} />}
                <span style={{ fontSize: '0.7rem', color: colors.textFaint }}>{m.owner_name ?? ''} · {m.filled}/{m.slots} filled</span>
              </div>
              {bin && (
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  <button type="button" style={{ ...btnGhost, padding: '4px 9px', fontSize: '0.72rem' }} onClick={() => act(moodboardsAPI.restore, m.id)}><RotateCcw size={12} /> Restore</button>
                  {isSuper && <button type="button" style={{ ...btnGhost, padding: '4px 9px', fontSize: '0.72rem', color: colors.danger }} onClick={() => purge(m)}><Trash2 size={12} /> Delete for good</button>}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      {making && <NewMoodboard onClose={() => setMaking(false)} />}
    </AdminLayout>
  );
}
