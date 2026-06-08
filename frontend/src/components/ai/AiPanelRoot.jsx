/**
 * AiPanelRoot
 * Drop this inside <Router> in App.jsx (needs access to useLocation).
 * It mounts the context detector hook and renders the floating panel.
 *
 * Usage in App.jsx:
 *   import AiPanelRoot from './components/ai/AiPanelRoot';
 *   // inside <Router>, alongside <Mimi />, <FloatingJournalModal /> etc:
 *   <AiPanelRoot />
 */
import useAiContextDetector from '../../hooks/useAiContextDetector';
import AiPanel from './AiPanel';

export default function AiPanelRoot() {
  useAiContextDetector(); // runs the route-watcher effect
  return <AiPanel />;
}