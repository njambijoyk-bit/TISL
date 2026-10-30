/** Where the picture exports stand, so a bar can show them: each job has a name, a percentage and a state (working, done, failed). Several can run at once. */
let jobs = [];
const listeners = new Set();
const emit = () => listeners.forEach((f) => f(jobs));
let seq = 0;

export const subscribe = (f) => { listeners.add(f); f(jobs); return () => listeners.delete(f); };

/** Start a job; the returned object moves it along and finishes it (a finished job leaves the list after a moment). */
export function startJob(name, queued = false) {
  const id = ++seq;
  const set = (patch) => { jobs = jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)); emit(); };
  const leave = (ms) => setTimeout(() => { jobs = jobs.filter((j) => j.id !== id); emit(); }, ms);
  jobs = [...jobs, { id, name, pct: 0, step: queued ? 'Waiting for the one before' : 'Starting', state: queued ? 'queued' : 'working' }];
  emit();
  return {
    step: (pct, step) => set({ pct, step, state: 'working' }),
    done: () => { set({ pct: 100, step: 'Saved', state: 'done' }); leave(1800); },
    fail: (message) => { set({ state: 'failed', step: message }); leave(6000); },
  };
}
