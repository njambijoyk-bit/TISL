// Fails when a file in src/projects writes a colour or a font itself instead of using the selected theme.
// Allowed: var(--token), color-mix(in srgb, var(--token) N%, transparent|var(--token)), transparent, currentColor, inherit.
// Run by `npm run lint`. See src/projects/README.md.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'src', 'projects');

const NAMED = ['white', 'black', 'red', 'green', 'blue', 'yellow', 'orange', 'purple', 'pink', 'gray', 'grey', 'silver', 'gold', 'teal', 'cyan', 'magenta', 'indigo', 'violet', 'brown', 'navy', 'maroon', 'olive', 'lime', 'aqua', 'crimson', 'coral', 'salmon', 'tomato', 'khaki', 'beige', 'ivory'];
const PALETTE = ['slate', 'gray', 'zinc', 'neutral', 'stone', 'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose', 'secondary', 'accent'];
const FONTS = ['inter', 'roboto', 'arial', 'helvetica', 'georgia', 'verdana', 'tahoma', 'times new roman', 'courier', 'segoe ui', 'system-ui', 'sans-serif', 'serif', 'monospace', 'jetbrains mono', 'fira code', 'poppins', 'montserrat', 'open sans', 'lato'];

const RULES = [
  [/#[0-9a-fA-F]{3,8}\b/, 'a colour code'],
  [/\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\s*\(/, 'a colour function'],
  [new RegExp(`(?:color|background|backgroundColor|borderColor|border|fill|stroke|outline|boxShadow|caretColor)\\w*\\s*[:=]\\s*['"\`][^'"\`]*\\b(?:${NAMED.join('|')})\\b`, 'i'), 'a named colour'],
  [new RegExp(`\\b(?:bg|text|border|ring|fill|stroke|from|via|to|divide|outline|decoration|shadow|placeholder|caret|accent)-(?:${PALETTE.join('|')})-\\d{2,3}\\b`), 'a Tailwind palette class'],
  [/\b(?:bg|text|border|ring|fill|stroke)-(?:white|black)\b/, 'a Tailwind black or white class'],
  [new RegExp(`fontFamily\\s*:\\s*['"\`](?![^'"\`]*var\\(--font-)[^'"\`]*`, 'i'), 'a font name'],
  [new RegExp(`font-family\\s*:\\s*(?!var\\(--font-)[^;]*\\b(?:${FONTS.join('|')})\\b`, 'i'), 'a font name'],
  [/\bfont-(?:sans|serif|mono)\b/, 'a Tailwind font class'],
];

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(jsx?|tsx?|css)$/.test(name) ? [path] : [];
  });
}

const problems = [];
for (const file of files(root)) {
  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    // an SVG gradient or mask id (url(#name)) is not a colour
    const text = line.replace(/url\(#[\w-]+\)/g, '').replace(/(?:href|id|htmlFor|to)=["'`]#[\w-]*["'`]/g, '');
    for (const [rule, what] of RULES) {
      if (rule.test(text)) {
        problems.push(`${relative(join(root, '..', '..'), file)}:${i + 1}  ${what}: ${line.trim().slice(0, 120)}`);
        break;
      }
    }
  });
}

if (problems.length) {
  console.error(`Projects screens must use the selected theme and fonts (src/projects/README.md). ${problems.length} problem(s):\n`);
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('Projects theme check: no colour or font is written in src/projects.');
