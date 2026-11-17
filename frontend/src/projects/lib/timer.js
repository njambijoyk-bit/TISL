/**
 * The timer (build 5.6) is shared by every Projects page: the timer bar listens for these events. A page starts a timer by sending
 * `startTimer({ project_id, task_id })`; the bar tells pages when the timer changed so they can read their time again.
 */
export const TIMER_START = 'tisl:projects-timer-start';
export const TIMER_CHANGED = 'tisl:projects-timer-changed';

export const startTimer = (detail) => window.dispatchEvent(new CustomEvent(TIMER_START, { detail }));
export const timerChanged = () => window.dispatchEvent(new CustomEvent(TIMER_CHANGED));

/** 2460 → "0:41:00" */
export const clock = (s) => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
