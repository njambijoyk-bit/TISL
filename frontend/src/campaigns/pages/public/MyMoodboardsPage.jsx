import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import Modal from '../../../core/components/admin/ui/Modal';
import myMoodboardsAPI from '../../../_shared/api/myMoodboards';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import Moodboard from '../../components/Moodboard';
import { seedContents } from '../../lib/moodboardKit';
import WorldTabs from '../../components/WorldTabs';
import DownloadMoodboardButton from '../../components/DownloadMoodboardButton';
import { stateLabel } from '../../components/moodboardState';

const btn = (primary) => ({ padding: '9px 18px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.84rem', display: 'inline-flex', alignItems: 'center', gap: 6, border: primary ? 0 : '1.5px solid var(--line)', color: primary ? '#fff' : 'var(--text-primary)', background: primary ? 'var(--color-primary-500)' : 'transparent' });

function NewMoodboard({ onClose }) {
  const nav = useNavigate();
  const [src, setSrc] = useState(null);
  const [preset, setPreset] = useState('collage');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { myMoodboardsAPI.presets().then(setSrc).catch((e) => toast.error(errMsg(e, 'Could not load the layouts'))); }, []);
  const go = async () => {
    setBusy(true);
    try { const r = await myMoodboardsAPI.create(title.trim(), preset); nav(`/my/moodboards/${r.data.id}`); } catch (e) { toast.error(errMsg(e, 'Could not start it')); setBusy(false); }
  };

  return (
    <Modal title="New moodboard" subtitle="Name it and choose a layout. It stays private until you publish it." onClose={onClose} width={760}
      footer={<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button type="button" style={btn(false)} onClick={onClose}>Cancel</button><button type="button" style={{ ...btn(true), opacity: title.trim() ? 1 : 0.5 }} disabled={!title.trim() || busy} onClick={go}>{busy ? 'Starting…' : 'Start'}</button></div>}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} autoFocus placeholder="Name your moodboard" aria-label="Moodboard name" style={{ width: '100%', boxSizing: 'border-box', padding: '10px 14px', borderRadius: 999, border: '1.5px solid var(--line)', background: 'var(--surface-card)', color: 'var(--text-primary)', fontFamily: 'inherit', marginBottom: 14 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
        {src?.presets.map((p) => (
          <button key={p.key} type="button" onClick={() => setPreset(p.key)} style={{ padding: 8, textAlign: 'left', cursor: 'pointer', borderRadius: 12, background: 'var(--surface-card)', border: `2px solid ${preset === p.key ? 'var(--color-primary-500)' : 'var(--line)'}`, fontFamily: 'inherit' }}>
            <Moodboard board={{ layout: p.layout, contents: seedContents(p.layout) }} editing radius={6} />
            <div style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--text-primary)', marginTop: 6 }}>{p.label}</div>
          </button>
        ))}
      </div>
    </Modal>
  );
}

/** My moodboards: collages I made from a layout. Private until I publish one; staff approve public ones. */
export default function MyMoodboardsPage() {
  const [rows, setRows] = useState(null);
  const [max, setMax] = useState(20);
  const [making, setMaking] = useState(false);
  useEffect(() => { myMoodboardsAPI.list().then((r) => { setRows(r.data); setMax(r.max); }).catch((e) => { toast.error(errMsg(e, 'Could not load your moodboards')); setRows([]); }); }, []);

  return (
    <div className="min-h-screen">
      <Helmet><title>My moodboards | TISL</title></Helmet>
      <Header />
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '36px 24px 64px' }}>
        <WorldTabs active="mymood" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', margin: '0 0 6px' }}>
          <h1 style={{ margin: 0, fontSize: 'clamp(1.7rem, 4vw, 2.3rem)', fontWeight: 900, color: 'var(--color-primary-500)' }}>My moodboards</h1>
          <button type="button" style={{ ...btn(true), marginLeft: 'auto', opacity: rows && rows.length >= max ? 0.5 : 1 }} disabled={rows && rows.length >= max} onClick={() => setMaking(true)}><Plus size={14} /> New moodboard</button>
        </div>
        <p style={{ margin: '0 0 22px', color: 'var(--text-secondary)' }}>Put pictures from your boards, colours, words and stickers together. They are private until you publish one; we check public ones first.</p>
        {rows?.length === 0 && <p style={{ color: 'var(--text-tertiary)' }}>You have no moodboards yet. Start one with New moodboard.</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 18 }}>
          {rows?.map((m) => {
            const [label, color] = stateLabel(m);
            return (
              <div key={m.id} style={{ position: 'relative' }}>
              <Link to={`/my/moodboards/${m.id}`} style={{ display: 'block', textDecoration: 'none', color: 'inherit', padding: 10, borderRadius: 16, background: 'var(--surface-card)', border: '1px solid var(--line)' }}>
                <Moodboard board={m} radius={10} />
                <div style={{ marginTop: 8, fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9rem' }}>{m.title}</div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color }}>{label}</div>
              </Link>
              <DownloadMoodboardButton board={m} icon style={{ top: 18, right: 18 }} />
              </div>
            );
          })}
        </div>
      </main>
      <Footer />
      {making && <NewMoodboard onClose={() => setMaking(false)} />}
    </div>
  );
}
