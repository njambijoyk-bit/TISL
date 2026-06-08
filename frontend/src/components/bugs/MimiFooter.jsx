import { Sparkles, Heart, MapPin } from 'lucide-react';
import '../../styles/bug.css';

export default function MimiFooter() {
  return (
    <footer className="bug-footer">
      <Sparkles size={12} className="bug-text-blue" />
      <span>Powered by Mimi</span>
      <span className="bug-footer-sep">.</span>
      <Heart size={12} style={{ fill: '#f87171', color: '#f87171' }} />
      <span>Proudly made in Kenya</span>
      <MapPin size={12} className="bug-text-muted" />
    </footer>
  );
}
