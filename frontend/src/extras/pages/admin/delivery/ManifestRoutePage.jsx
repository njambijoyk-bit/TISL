// pages/admin/delivery/ManifestRoutePage.jsx
import { useParams, useNavigate } from 'react-router-dom';
import { useDeliveryAudio } from './useDeliveryAudio';
import RoutePlanner from './RoutePlanner';
import {
  D, DeliveryPageShell, DeliveryPageHeader, DeliveryBreadcrumb,
  DeliveryCard, DeliveryBtn,
} from './DeliveryShared';
import { Route, CheckCircle, ChevronLeft } from 'lucide-react';

export default function ManifestRoutePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const audio = useDeliveryAudio();
  const manifestId = parseInt(id, 10);

  const handleSave = () => {
    audio.playSuccess();
    // Navigate to manifest detail or back to list
    navigate(`/admin/delivery/manifests/${manifestId}`);
  };

  const handleBack = () => {
    audio.playHover();
    navigate(`/admin/delivery/manifests/${manifestId}`);
  };

  return (
    <DeliveryPageShell audio={audio}>
      <DeliveryBreadcrumb
        items={[
          { label: 'Delivery', onClick: () => navigate('/admin/delivery') },
          { label: 'Manifests', onClick: () => navigate('/admin/delivery/manifests') },
          { label: `Manifest #${manifestId}`, onClick: () => navigate(`/admin/delivery/manifests/${manifestId}`) },
          { label: 'Route Plan' },
        ]}
        onHover={audio.playHover}
      />
      <DeliveryPageHeader
        title="Route Planning"
        sub="Drag markers, reorder stops, and optimize the delivery route."
      />

      <div style={{ background: `${D.purple}10`, border: `1px solid ${D.purpleBorder}`, borderRadius: D.radiusSm, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Route size={14} color={D.purple} />
        <span style={{ fontSize: '0.8rem', color: D.textMid }}>
          <strong style={{ color: D.text }}>Tip:</strong> Drag markers on the map or enter coordinates. Drag stops to reorder. Click "Auto-optimize" to sort by shortest path.
        </span>
      </div>

      <RoutePlanner
        manifestId={manifestId}
        onSave={handleSave}
        onBack={handleBack}
        audio={audio}
      />
    </DeliveryPageShell>
  );
}