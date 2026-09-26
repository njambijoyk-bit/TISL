import { create } from 'zustand';

/**
 * useAiPanelStore
 * Global state for the floating AI panel.
 * Lives outside the panel component so it persists across navigation.
 */
const useAiPanelStore = create((set, get) => ({
  // ── UI state ─────────────────────────────────────────────────
  open:      false,
  minimised: false, // collapsed to tab vs expanded panel

  // ── Current scan context (set from route detection) ──────────
  context: null,
  // shape: { moduleKey, entityType, entityId, label }
  // e.g.  { moduleKey: 'projects', entityType: 'project', entityId: 42, label: 'PRJ-2025-0001' }

  // ── Form state ───────────────────────────────────────────────
  mode:        'structured', // 'structured' | 'freeform'
  outputType:  'summary',    // 'summary' | 'insight' | 'risk' | 'recommendation'
  freePrompt:  '',

  // ── Async state ──────────────────────────────────────────────
  loading:  false,
  error:    null,

  // ── Persisted outputs for current context ────────────────────
  outputs:  [],        // AiAnalyticsOutput[]
  outputsLoading: false,

  // ── Actions ──────────────────────────────────────────────────
  toggleOpen:    () => set(s => ({ open: !s.open, minimised: false })),
  toggleMinimise: () => set(s => ({ minimised: !s.minimised })),
  close:         () => set({ open: false }),

  setContext: (context) => {
    const prev = get().context;
    // Only reset outputs if context actually changed
    const changed =
      prev?.moduleKey  !== context?.moduleKey  ||
      prev?.entityId   !== context?.entityId   ||
      prev?.entityType !== context?.entityType;

    set({ context, ...(changed ? { outputs: [], error: null } : {}) });
  },

  setMode:       (mode)       => set({ mode, error: null }),
  setOutputType: (outputType) => set({ outputType }),
  setFreePrompt: (freePrompt) => set({ freePrompt }),

  setLoading:  (loading)  => set({ loading }),
  setError:    (error)    => set({ error }),
  setOutputs:  (outputs)  => set({ outputs }),
  addOutput:   (output)   => set(s => ({ outputs: [output, ...s.outputs] })),
  dismissOutput: (id)     => set(s => ({ outputs: s.outputs.filter(o => o.id !== id) })),

  setOutputsLoading: (outputsLoading) => set({ outputsLoading }),

  reset: () => set({
    mode: 'structured', outputType: 'summary', freePrompt: '',
    error: null, loading: false,
  }),
}));

export default useAiPanelStore;