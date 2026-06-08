import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, Loader2, AlertCircle, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import '../../styles/bug.css';
import Header from '../../components/layout/Header';
import { devAuth, saveDevToken } from '../../api/bugReportsAPI';
import MimiFooter from '../../components/bugs/MimiFooter';

/**
 * DevAuthPage — /dev/auth
 * Dev submits their one-time key to get a session token.
 * On success: token saved to sessionStorage, redirect to /dev/portal.
 */
export default function DevAuthPage() {
  const navigate = useNavigate();

  const [key, setKey] = useState('');
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [keyReset, setKeyReset] = useState(false);

  const handleSubmit = async () => {
    if (!key.trim()) { setError('Please enter your access key.'); return; }
    setError(null);
    setKeyReset(false);
    setLoading(true);
    try {
      const res = await devAuth(key.trim());
      saveDevToken(res.dev_token);
      navigate('/dev/portal');
    } catch (err) {
      const data = err?.response?.data;
      setError(data?.message ?? 'Authentication failed. Please try again.');
      if (data?.key_reset) setKeyReset(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bug-page">
      <Header />
      <main className="bug-main-center">
        <div className="bug-container-sm">

          {/* header */}
          <div className="bug-flex-col bug-items-center bug-gap-3 bug-text-center">
            <div className="bug-icon-box bug-icon-box-lg bug-icon-box-indigo">
              <KeyRound size={22} />
            </div>
            <div>
              <h1 className="bug-text-2xl bug-font-bold bug-text">Dev Portal</h1>
              <p className="bug-text-sm bug-text-muted" style={{ marginTop: 4 }}>
                Enter your one-time access key to continue.
              </p>
            </div>
          </div>

          {/* form card */}
          <div className="bug-card-2xl bug-flex-col bug-gap-4">
            <div className="bug-field">
              <label className="bug-label">
                Access Key
              </label>
              <div className="bug-input-wrap">
                <input
                  type={visible ? 'text' : 'password'}
                  value={key}
                  onChange={e => setKey(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
                  placeholder="Paste your key here..."
                  className="bug-input bug-key-text"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setVisible(v => !v)}
                  className="bug-input-eye"
                  tabIndex={-1}
                >
                  {visible ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* error */}
            {error && (
              <div className="bug-alert bug-alert-red">
                <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  {error}
                  {keyReset && (
                    <p className="bug-text-xs bug-text-red" style={{ marginTop: 4, opacity: 0.8 }}>
                      The key has been reset. Please contact your admin for a new key.
                    </p>
                  )}
                </div>
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={loading || !key.trim()}
              className="bug-btn bug-btn-indigo"
              style={{ width: '100%', padding: '10px 16px' }}
            >
              {loading
                ? <><Loader2 size={15} className="bug-animate-spin" /> Authenticating...</>
                : <><ShieldCheck size={15} /> Authenticate</>
              }
            </button>
          </div>

          {/* hint */}
          <p className="bug-text-center bug-text-xs bug-text-muted">
            Keys are one-time use and auto-expire after 8 hours. Contact your admin if you need a new key.
          </p>
        </div>
      </main>

      <MimiFooter />
    </div>
  );
}
