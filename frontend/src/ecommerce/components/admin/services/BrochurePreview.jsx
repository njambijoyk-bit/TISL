import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../../../../core/components/admin/ui/Modal';
import brochuresAPI from '../../../../_shared/api/brochures';
import useMoney from '../../../../_shared/hooks/useMoney';
import { loadCompany } from '../../../../_shared/lib/useCompany';
import { btnPrimary, btnGhost, colors } from '../../../../_shared/theme/tokens';
import { brochurePages, downloadBrochurePdf } from '../../../lib/brochure';

/** A service's brochure exactly as a customer would get it (even when customer downloads are off), page by page, with a PDF button. */
export default function BrochurePreview({ service, onClose }) {
  const money = useMoney();
  const [state, setState] = useState({ loading: true, pages: [], data: null, company: null, error: null });
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [{ data }, company] = await Promise.all([brochuresAPI.preview(service.id), loadCompany()]);
        const pages = await brochurePages(data, { money, company }, { width: 900 });
        if (live) setState({ loading: false, pages: pages.map((c) => c.toDataURL('image/jpeg', 0.85)), data, company, error: null });
      } catch { if (live) setState((s) => ({ ...s, loading: false, error: 'Could not make the preview.' })); }
    })();

    return () => { live = false; };
  }, [service.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => { try { await downloadBrochurePdf(state.data, { money, company: state.company }); } catch { toast.error('Could not make the PDF.'); } };

  return (
    <Modal title={`${service.name}: brochure`} subtitle="As a customer would get it" onClose={onClose} width={1000}
      footer={<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button type="button" style={btnGhost} onClick={onClose}>Close</button><button type="button" style={btnPrimary} disabled={!state.data} onClick={save}><Download size={14} /> Download PDF</button></div>}>
      {state.loading && <p style={{ color: colors.textFaint }}>Drawing the brochure…</p>}
      {state.error && <p role="alert" style={{ color: colors.dangerText }}>{state.error}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        {state.pages.map((src, i) => <img key={i} src={src} alt={`Page ${i + 1}`} style={{ width: '100%', borderRadius: 6, boxShadow: '0 2px 10px rgba(0,0,0,0.25)' }} />)}
      </div>
    </Modal>
  );
}
