import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Fingerprint, X } from 'lucide-react';
import { useAuthStore } from '../../../_shared/store/index';

const QUIET = ['/login', '/register', '/force-change-password', '/secure-account', '/forgot-password', '/reset-password', '/oauth', '/careers'];
const key = (user) => `passkey-reminder:${user.id}`;
const today = () => new Date().toISOString().slice(0, 10);
const dismissedToday = (user) => { try { return localStorage.getItem(key(user)) === today(); } catch { return false; } };

/**
 * A quiet card in the corner while the passkey rule is still in its grace period for this person: what is coming, when, and where to add one. It goes for the day when closed and comes back tomorrow.
 * (When the date has passed, SecurityGate takes over.)
 */
export default function PasskeyReminder() {
  const { pathname } = useLocation();
  const user = useAuthStore((s) => s.user);
  const security = useAuthStore((s) => s.security);
  const account = useAuthStore((s) => s.access?.account);
  const authed = useAuthStore((s) => s.isAuthenticated);
  const [, bump] = useState(0);

  if (!authed || !user || !security?.applies || security.phase !== 'grace' || security.gate) return null;
  if (QUIET.some((p) => pathname === p || pathname.startsWith(`${p}/`)) || dismissedToday(user)) return null;

  const close = () => { try { localStorage.setItem(key(user), today()); } catch { /* it will simply come back */ } bump((n) => n + 1); };
  const left = security.days_left;
  const when = security.enforce_from ? new Date(security.enforce_from).toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' }) : null;
  const mine = account === 'customer' ? '/profile' : '/admin/profile';

  return (
    <div role="status" data-testid="passkey-reminder"
      style={{ position: 'fixed', left: 16, bottom: 16, zIndex: 8000, maxWidth: 340, display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 14px', borderRadius: 14, background: 'var(--surface-card, #fff)', color: 'var(--text-primary)', border: '1.5px solid var(--color-primary-500)', boxShadow: '0 12px 32px rgba(0,0,0,0.16)' }}>
      <Fingerprint size={20} style={{ color: 'var(--color-primary-600)', flexShrink: 0, marginTop: 2 }} />
      <div style={{ fontSize: '0.8rem', lineHeight: 1.45 }}>
        <div style={{ fontWeight: 800, marginBottom: 2 }}>Your role will need {security.needs === 2 ? 'two passkeys' : 'a passkey'}{when ? ` from ${when}` : ' soon'}</div>
        <div style={{ color: 'var(--text-secondary)' }}>
          {left != null && left >= 0 ? `${left} ${left === 1 ? 'day' : 'days'} left. ` : ''}You have {security.passkeys} so far. Adding one takes ten seconds. <Link to={mine} style={{ color: 'var(--color-primary-600)', fontWeight: 700 }}>Add it now</Link>
        </div>
      </div>
      <button type="button" onClick={close} aria-label="Remind me tomorrow" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 0 }}><X size={16} /></button>
    </div>
  );
}
