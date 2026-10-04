import { Sparkles, Heart, MapPin } from 'lucide-react';
import '../../../styles/bug.css';

/** `version` adds an "App Version" line under the footer (shown on the dev portal). */
export default function MimiFooter({ version }) {
  return (
    <>
    <footer className="bug-footer">
      <Sparkles size={12} className="bug-text-blue" />
      <span>Powered by Mimi</span>
      <span className="bug-footer-sep">.</span>
      <Heart size={12} style={{ fill: 'var(--color-primary-600)', color: 'var(--color-primary-600)' }} />
      <span>Proudly made in Kenya</span>
    </footer>
    {version && <div style={{ textAlign: 'center', fontSize: '0.72rem', color: 'var(--text-tertiary)', padding: '0 0 14px', marginTop: -6 }}>App Version {version}</div>}
    </>
  );
}
