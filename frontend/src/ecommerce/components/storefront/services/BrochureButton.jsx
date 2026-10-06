import { useState } from 'react';
import { FileDown } from 'lucide-react';
import toast from 'react-hot-toast';
import brochuresAPI from '../../../../_shared/api/brochures';
import useMoney from '../../../../_shared/hooks/useMoney';
import { loadCompany } from '../../../../_shared/lib/useCompany';
import { downloadBrochurePdf } from '../../../lib/brochure';

/**
 * "Download brochure": the brochure is drawn here from the service's current details and saved as a PDF. Shown only when the service's settings let customers download
 * it (the server says so with `brochure_available`, and refuses the data otherwise).
 */
export default function BrochureButton({ service, style }) {
  const money = useMoney();
  const [busy, setBusy] = useState(false);
  if (!service?.brochure_available) return null;

  const go = async () => {
    setBusy(true);
    try {
      const [{ data }, company] = await Promise.all([brochuresAPI.publicData(service.id), loadCompany()]);
      await downloadBrochurePdf(data, { money, company });
    } catch (e) { toast.error(e?.response?.status === 403 ? 'A brochure is not available for this service.' : 'Could not make the brochure. Please try again.'); } finally { setBusy(false); }
  };

  return (
    <button type="button" onClick={go} disabled={busy}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 10, fontSize: '0.84rem', fontWeight: 700, fontFamily: 'inherit', cursor: busy ? 'wait' : 'pointer', border: '1.5px solid var(--color-primary-500)', background: 'transparent', color: 'var(--color-primary-500)', opacity: busy ? 0.65 : 1, ...style }}>
      <FileDown size={16} /> {busy ? 'Making your brochure…' : 'Download brochure'}
    </button>
  );
}
