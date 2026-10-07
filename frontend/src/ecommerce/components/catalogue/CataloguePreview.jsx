import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../../../core/components/admin/ui/Modal';
import { loadCompany } from '../../../_shared/lib/useCompany';
import { btnPrimary, colors } from '../../../_shared/theme/tokens';
import { cataloguePreview, downloadCataloguePdf } from '../../lib/catalogue/build';

/** The first pages of a brochure or catalogue, drawn as a customer would get them, with a button for the whole PDF and a progress line while it is made. */
export default function CataloguePreview({ title, loadSlice, onClose }) {
  const [state, setState] = useState({ pages: [], totalPages: 0, error: null, progress: null });
  const [saving, setSaving] = useState(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const company = await loadCompany();
        const r = await cataloguePreview({ loadSlice, company, maxPages: 6, onProgress: (p) => live && setState((s) => ({ ...s, progress: p })) });
        if (live) setState({ pages: r.pages, totalPages: r.totalPages, error: null, progress: null });
      } catch (e) { if (live) setState((s) => ({ ...s, progress: null, error: e?.message || 'Could not make the preview.' })); }
    })();

    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setSaving({ stage: 'Starting', done: 0, total: 0 });
    try { await downloadCataloguePdf({ loadSlice, company: await loadCompany(), onProgress: setSaving }); } catch (e) { toast.error(e?.message || 'Could not make the PDF.'); } finally { setSaving(null); }
  };
  const p = saving ?? state.progress;

  return (
    <Modal title={title} subtitle={state.totalPages ? `${state.totalPages} pages. The first ${state.pages.length} are shown.` : 'Drawing the first pages…'} onClose={onClose} width={900}
      footer={<div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'flex-end' }}>{p && <span style={{ fontSize: '0.78rem', color: colors.textFaint }}>{p.stage}{p.total ? ` ${p.done} of ${p.total}` : ''}…</span>}<button type="button" style={{ ...btnPrimary, display: 'inline-flex', gap: 6, alignItems: 'center', opacity: saving ? 0.6 : 1 }} disabled={Boolean(saving)} onClick={save}><Download size={14} /> Download PDF</button></div>}>
      {state.error && <p role="alert" style={{ color: colors.dangerText, fontSize: '0.86rem' }}>{state.error}</p>}
      {!state.error && state.pages.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: colors.textFaint }}>{p ? `${p.stage}${p.total ? ` ${p.done} of ${p.total}` : ''}…` : 'Drawing…'}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
        {state.pages.map((src, i) => <img key={i} src={src} alt={`Page ${i + 1}`} style={{ width: '100%', borderRadius: 6, boxShadow: '0 1px 6px rgba(0,0,0,0.25)', background: '#fff' }} />)}
      </div>
    </Modal>
  );
}
