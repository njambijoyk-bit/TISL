import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import GeneralLayout from '../../../../components/layout/GeneralLayout';
import flowchartHtml from './flowchart.html?url';

export default function FlowchartPage() {
  const navigate = useNavigate();
  const [showNav, setShowNav] = useState(false);

  useEffect(() => {
    document.title = 'TISL Order Flowchart — System Overview';
  }, []);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (e.clientX <= 8) setShowNav(true);
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  useEffect(() => {
    let touchStartX = null;
    const handleTouchStart = (e) => { touchStartX = e.touches[0].clientX; };
    const handleTouchMove = (e) => {
      if (touchStartX !== null && touchStartX <= 24 && e.touches[0].clientX - touchStartX > 40)
        setShowNav(true);
    };
    const handleTouchEnd = () => { touchStartX = null; };
    window.addEventListener('touchstart', handleTouchStart);
    window.addEventListener('touchmove', handleTouchMove);
    window.addEventListener('touchend', handleTouchEnd);
    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}>

      {/* Floating breadcrumb */}
      <div style={{
        position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
        zIndex: 20, display: 'flex', alignItems: 'center', gap: 6,
        background: 'rgba(13,17,23,0.85)', backdropFilter: 'blur(10px)',
        border: '1px solid rgba(139,92,246,0.2)', borderRadius: 10,
        padding: '6px 14px', fontSize: '0.78rem', fontWeight: 600,
        color: '#8a9ab0', whiteSpace: 'nowrap',
        boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
      }}>
        <Home size={12} style={{ color: '#8b5cf6', flexShrink: 0 }} />
        <button
          onClick={() => navigate('/admin/settings/general')}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#8b5cf6', fontWeight: 700, fontSize: '0.78rem',
            fontFamily: 'inherit', padding: 0,
          }}
        >
          Settings
        </button>
        <ChevronRight size={11} style={{ color: '#566375' }} />
        <span style={{ color: '#cdd6e0' }}>Order Flowchart</span>
      </div>

      {/* Left edge trigger strip */}
      <div
        style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: 6,
          zIndex: 30, cursor: 'pointer',
          background: showNav ? 'transparent' : 'linear-gradient(to right, rgba(139,92,246,0.2), transparent)',
        }}
        onClick={() => setShowNav(true)}
      />

      {/* Nav overlay */}
      {showNav && (
        <>
          {/* backdrop — sits above iframe, below sidebar */}
          <div
            onClick={() => setShowNav(false)}
            style={{
              position: 'absolute', inset: 0, zIndex: 40,
              background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)',
              cursor: 'pointer',
            }}
          />
          {/* actual sidebar wrapper */}
          <div
            style={{
              position: 'absolute', left: 0, top: 0, bottom: 0,
              zIndex: 50, width: 260,
              boxShadow: '4px 0 32px rgba(0,0,0,0.5)',
              // stop clicks inside sidebar from bubbling to backdrop
              onClick: (e) => e.stopPropagation(),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <GeneralLayout sidebarOnly />
          </div>
        </>
      )}

      {/* iframe — pointer-events blocked when nav is open so backdrop clicks register */}
      <iframe
        src={flowchartHtml}
        style={{
          width: '100%', height: '100%', border: 'none', display: 'block',
          pointerEvents: showNav ? 'none' : 'auto',
        }}
        title="TISL Order Flowchart"
      />

    </div>
  );
}