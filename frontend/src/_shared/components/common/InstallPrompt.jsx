import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, X } from 'lucide-react';

export default function InstallPrompt() {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState(null);
  const [visible, setVisible] = useState(false);
  const [installed, setInstalled] = useState(false);

  // Fix 2 — remember dismissal across page refreshes
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem('pwa-dismissed') === 'true'
  );

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setPrompt(e);
      setVisible(true);
    };

    // Fix 1 — named reference so it can be cleaned up
    const onInstalled = () => {
      setVisible(false);
      setInstalled(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', onInstalled); // Fix 1 — cleaned up
    };
  }, []);

  const handleInstall = async () => {
    if (!prompt) return;
    prompt.prompt();
    await prompt.userChoice;
    setVisible(false);
    setPrompt(null);
    navigate('/portal');
  };

  // Fix 2 — also guard against dismissed
  if (!visible || installed || dismissed) return null;

  return (
    <div
      className="dark:bg-gray-800 dark:border-gray-700"
      style={{
        position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
        zIndex: 9999, borderRadius: 16, padding: '12px 16px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.14), 0 2px 8px rgba(168,85,247,0.15)',
        border: '1px solid #f3f4f6', width: 'min(360px, calc(100vw - 40px))',
        animation: 'slideUp 300ms cubic-bezier(0.34,1.56,0.64,1)',
        background: 'white',
      }}
    >
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateX(-50%) translateY(20px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>

      {/* Row 1: icon + text + dismiss */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12, flexShrink: 0,
          background: 'linear-gradient(135deg,#a855f7,#7c3aed)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: '1.1rem', fontWeight: 900, color: 'white', letterSpacing: '-0.03em' }}>T</span>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="dark:text-white" style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700, color: '#10131a' }}>
            Install PWA
          </p>
          <p style={{ margin: '1px 0 0', fontSize: '0.72rem', color: '#2a2a2b' }}>
            Add to your home screen for quick access
          </p>
        </div>

        {/* Dismiss stays top-right */}
        <button
          type="button"
          onClick={() => {
            localStorage.setItem('pwa-dismissed', 'true');
            setDismissed(true);
            setVisible(false);
          }}
          className="dark:bg-gray-700 dark:text-gray-400"
          style={{
            width: 28, height: 28, borderRadius: 8, border: 'none', cursor: 'pointer',
            background: '#f9fafb', color: '#9ca3af', display: 'flex',
            alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Row 2: install button — full width below */}
      <button
        type="button"
        onClick={handleInstall}
        style={{
          marginTop: 12, width: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          padding: '9px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
          background: 'linear-gradient(135deg,#a855f7,#7c3aed)',
          color: 'white', fontSize: '0.82rem', fontWeight: 700,
          boxShadow: '0 2px 8px rgba(168,85,247,0.35)',
        }}
      >
        <Download size={14} /> Install App
      </button>
    </div>
  );
}