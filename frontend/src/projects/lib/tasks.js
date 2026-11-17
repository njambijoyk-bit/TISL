/** Task statuses and how long things take, shared by the Work tab and the task panel (build 5.1). The words come from the server (per industry). */
export const STATUS_TONE = { todo: 'neutral', doing: 'info', waiting: 'warning', done: 'good', cancelled: 'neutral' };

/** 270 → "4h 30m"; 0 or nothing → "·" */
export const hm = (minutes) => {
  const m = Math.round(Number(minutes) || 0);
  if (!m) return '·';
  const h = Math.floor(m / 60);
  return h ? `${h}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`;
};
