/**
 * Typing shortcuts in a message (docs/PROJECTS_STAGE6_SPEC.md, build 6.2): what is being typed at the cursor (@someone, #tag), and the slash
 * commands at the start of a message (/task, /time 1h30, /meet).
 */

/** The word being typed at the cursor, when it starts with @ or #. @return {{sign: string, word: string, start: number}|null} */
export const typing = (text, cursor) => {
  const before = text.slice(0, cursor);
  const m = before.match(/(^|\s)([@#])([\p{L}0-9_-]*)$/u);
  return m ? { sign: m[2], word: m[3], start: cursor - m[3].length - 1 } : null;
};

/** Put a chosen name or tag in place of what is being typed. */
export const complete = (text, at, insert) => {
  const end = at.start + 1 + at.word.length;
  return `${text.slice(0, at.start)}${at.sign}${insert} ${text.slice(end)}`;
};

/** "1h30", "1h 30m", "90m", "1.5h", "2" (hours) → minutes; null when it is not a length of time. */
export const minutesOf = (s) => {
  const t = String(s).trim().toLowerCase();
  let m;
  if ((m = t.match(/^(\d+(?:\.\d+)?)\s*h(?:ours?)?\s*(?:(\d+)\s*m(?:in(?:utes?)?)?)?$/)) || (m = t.match(/^(\d+)h(\d+)$/))) return Math.round(Number(m[1]) * 60 + Number(m[2] ?? 0));
  if ((m = t.match(/^(\d+)\s*m(?:in(?:utes?)?)?$/))) return Number(m[1]);
  if ((m = t.match(/^(\d+(?:\.\d+)?)$/))) return Math.round(Number(m[1]) * 60);
  return null;
};

/** A slash command at the start of a message. @return {{cmd: 'task'|'time'|'meet', rest: string, minutes?: number, note?: string}|null} */
export const command = (text) => {
  const m = String(text).trim().match(/^\/(task|time|meet)\b\s*([\s\S]*)$/i);
  if (!m) return null;
  const cmd = m[1].toLowerCase();
  const rest = m[2].trim();
  if (cmd !== 'time') return { cmd, rest };
  const [len, ...note] = rest.split(/\s+/);
  const two = rest.match(/^(\d+(?:\.\d+)?\s*h\s*\d+\s*m?)\s*(.*)$/i);   // "1h 30m note"
  const minutes = two ? minutesOf(two[1]) : minutesOf(len);
  return { cmd, rest, minutes, note: two ? two[2] : note.join(' ') };
};
