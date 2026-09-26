// ─────────────────────────────────────────────────────────────────────────────
// Vault Themes
// Each theme redefines the --D-* CSS variables used across all vault components.
// Applied as data-vault-theme on .vault-page — fully scoped, no global bleed.
// ─────────────────────────────────────────────────────────────────────────────

export const VAULT_THEMES = [
  // ── Classic ───────────────────────────────────────────────────────────────
  { id: 'light',          label: 'Light',          isDark: false },
  { id: 'dark-plus',      label: 'Dark+',          isDark: true  },
  { id: 'monokai',        label: 'Monokai',        isDark: true  },
  { id: 'dracula',        label: 'Dracula',        isDark: true  },
  { id: 'solarized-dark', label: 'Solarized Dark', isDark: true  },
  { id: 'tomorrow-night', label: 'Tomorrow Night', isDark: true  },
  // ── Exotic ────────────────────────────────────────────────────────────────
  { id: 'cyberpunk',      label: 'Cyberpunk Neon', isDark: true  },
  { id: 'aurora',         label: 'Aurora Borealis',isDark: true  },
  { id: 'midnight-forest',label: 'Midnight Forest',isDark: true  },
  { id: 'vaporwave',      label: 'Vaporwave',      isDark: true  },
  { id: 'tokyo-night',    label: 'Tokyo Night',    isDark: true  },
  { id: 'obsidian',       label: 'Obsidian',       isDark: true  },
  { id: 'rose-pine',      label: 'Rosé Pine',      isDark: true  },
  { id: 'gruvbox',        label: 'Gruvbox',        isDark: false },
  { id: 'nord',           label: 'Nord',           isDark: true  },
];

export const DEFAULT_THEME = 'light';

// ─────────────────────────────────────────────────────────────────────────────
// CSS — one block per theme, scoped to [data-vault-theme="id"]
// ─────────────────────────────────────────────────────────────────────────────
export const VAULT_THEME_CSS = `
  /* ════════════════════════════════════════════════════════════════════════ */
  /*  CLASSIC THEMES                                                          */
  /* ════════════════════════════════════════════════════════════════════════ */

  /* ── Light (default) ─────────────────────────────────────────────────── */
  [data-vault-theme="light"] {
    --D-bg:               #f8f9fa;
    --D-surface:          #ffffff;
    --D-surface-raised:   #ffffff;
    --D-border:           #e9ecef;
    --D-border-strong:    #dee2e6;
    --D-hover:            #f1f3f5;

    --D-text-primary:     #1a1a2e;
    --D-text-secondary:   #6c757d;
    --D-text-muted:       #adb5bd;

    --D-accent:           #2563eb;
    --D-accent-hover:     #1d4ed8;
    --D-accent-soft:      #e7f0ff;

    --D-danger:           #e03131;
    --D-danger-soft:      #fff5f5;
    --D-danger-border:    #ffc9c9;

    --D-success:          #2f9e44;
    --D-warning:          #e67700;

    --D-skeleton-base:    #e9ecef;
    --D-skeleton-shine:   #f1f3f5;

    --D-radius:           8px;
    --D-radius-sm:        6px;

    --D-scrollbar-thumb:  #dee2e6;
    --D-scrollbar-track:  transparent;

    color-scheme: light;
  }

  /* ── Dark+ (VS Code default dark) ────────────────────────────────────── */
  [data-vault-theme="dark-plus"] {
    --D-bg:               #1e1e1e;
    --D-surface:          #252526;
    --D-surface-raised:   #2d2d2d;
    --D-border:           #3c3c3c;
    --D-border-strong:    #505050;
    --D-hover:            #2a2d2e;

    --D-text-primary:     #d4d4d4;
    --D-text-secondary:   #9d9d9d;
    --D-text-muted:       #5a5a5a;

    --D-accent:           #4fc1ff;
    --D-accent-hover:     #29b6f6;
    --D-accent-soft:      #1a3a4a;

    --D-danger:           #f44747;
    --D-danger-soft:      #3a1a1a;
    --D-danger-border:    #6a2020;

    --D-success:          #4ec994;
    --D-warning:          #ce9178;

    --D-skeleton-base:    #2d2d2d;
    --D-skeleton-shine:   #333333;

    --D-radius:           8px;
    --D-radius-sm:        6px;

    --D-scrollbar-thumb:  #424242;
    --D-scrollbar-track:  transparent;

    color-scheme: dark;
  }

  /* ── Monokai ───────────────────────────────────────────────────────────── */
  [data-vault-theme="monokai"] {
    --D-bg:               #272822;
    --D-surface:          #2d2e27;
    --D-surface-raised:   #33342d;
    --D-border:           #3e3f38;
    --D-border-strong:    #55564e;
    --D-hover:            #35362f;

    --D-text-primary:     #f8f8f2;
    --D-text-secondary:   #a8a89a;
    --D-text-muted:       #5c5d56;

    --D-accent:           #a6e22e;
    --D-accent-hover:     #8fbf27;
    --D-accent-soft:      #2a3320;

    --D-danger:           #f92672;
    --D-danger-soft:      #3a1020;
    --D-danger-border:    #6a1040;

    --D-success:          #a6e22e;
    --D-warning:          #e6db74;

    --D-skeleton-base:    #33342d;
    --D-skeleton-shine:   #3a3b34;

    --D-radius:           8px;
    --D-radius-sm:        6px;

    --D-scrollbar-thumb:  #4a4b44;
    --D-scrollbar-track:  transparent;

    color-scheme: dark;
  }

  /* ── Dracula ───────────────────────────────────────────────────────────── */
  [data-vault-theme="dracula"] {
    --D-bg:               #191a21;
    --D-surface:          #21222c;
    --D-surface-raised:   #282a36;
    --D-border:           #3d3f4f;
    --D-border-strong:    #535576;
    --D-hover:            #2a2c3a;

    --D-text-primary:     #f8f8f2;
    --D-text-secondary:   #a0a2b3;
    --D-text-muted:       #535573;

    --D-accent:           #bd93f9;
    --D-accent-hover:     #a679f5;
    --D-accent-soft:      #2a2040;

    --D-danger:           #ff5555;
    --D-danger-soft:      #3a1515;
    --D-danger-border:    #6a2525;

    --D-success:          #50fa7b;
    --D-warning:          #ffb86c;

    --D-skeleton-base:    #282a36;
    --D-skeleton-shine:   #2f3140;

    --D-radius:           8px;
    --D-radius-sm:        6px;

    --D-scrollbar-thumb:  #44475a;
    --D-scrollbar-track:  transparent;

    color-scheme: dark;
  }

  /* ── Solarized Dark ────────────────────────────────────────────────────── */
  [data-vault-theme="solarized-dark"] {
    --D-bg:               #002b36;
    --D-surface:          #073642;
    --D-surface-raised:   #0a4050;
    --D-border:           #094f60;
    --D-border-strong:    #1a6070;
    --D-hover:            #0a3f4e;

    --D-text-primary:     #fdf6e3;
    --D-text-secondary:   #93a1a1;
    --D-text-muted:       #4a6470;

    --D-accent:           #268bd2;
    --D-accent-hover:     #1a7abf;
    --D-accent-soft:      #0a2a40;

    --D-danger:           #dc322f;
    --D-danger-soft:      #2a0a0a;
    --D-danger-border:    #5a1a1a;

    --D-success:          #859900;
    --D-warning:          #b58900;

    --D-skeleton-base:    #0a3f4e;
    --D-skeleton-shine:   #0d4a5a;

    --D-radius:           8px;
    --D-radius-sm:        6px;

    --D-scrollbar-thumb:  #1a5060;
    --D-scrollbar-track:  transparent;

    color-scheme: dark;
  }

  /* ── Tomorrow Night Blue ───────────────────────────────────────────────── */
  [data-vault-theme="tomorrow-night"] {
    --D-bg:               #002451;
    --D-surface:          #00346e;
    --D-surface-raised:   #003f82;
    --D-border:           #00419a;
    --D-border-strong:    #1a5aad;
    --D-hover:            #003a7a;

    --D-text-primary:     #ffffff;
    --D-text-secondary:   #7285b7;
    --D-text-muted:       #3d5480;

    --D-accent:           #ffc58f;
    --D-accent-hover:     #ffb066;
    --D-accent-soft:      #2a2010;

    --D-danger:           #ff9da1;
    --D-danger-soft:      #2a1015;
    --D-danger-border:    #5a2025;

    --D-success:          #d1f1a9;
    --D-warning:          #ffc58f;

    --D-skeleton-base:    #003a7a;
    --D-skeleton-shine:   #004490;

    --D-radius:           8px;
    --D-radius-sm:        6px;

    --D-scrollbar-thumb:  #1a4a8a;
    --D-scrollbar-track:  transparent;

    color-scheme: dark;
  }

  /* ════════════════════════════════════════════════════════════════════════ */
  /*  EXOTIC THEMES                                                           */
  /* ════════════════════════════════════════════════════════════════════════ */

  /* ── Cyberpunk Neon ────────────────────────────────────────────────────── */
  [data-vault-theme="cyberpunk"] {
    --D-bg:               #0a0a0f;
    --D-surface:          #12121a;
    --D-surface-raised:   #1a1a2e;
    --D-border:           #2a2a3e;
    --D-border-strong:    #3d3d5c;
    --D-hover:            #1e1e32;

    --D-text-primary:     #e0e0f0;
    --D-text-secondary:   #8a8ab0;
    --D-text-muted:       #4a4a6e;

    --D-accent:           #00f0ff;
    --D-accent-hover:     #00d4e0;
    --D-accent-soft:      #0a2a30;

    --D-danger:           #ff00a0;
    --D-danger-soft:      #2a0a20;
    --D-danger-border:    #5a0a40;

    --D-success:          #00ff41;
    --D-warning:          #ffea00;

    --D-skeleton-base:    #1a1a2e;
    --D-skeleton-shine:   #222240;

    --D-radius:           8px;
    --D-radius-sm:        6px;

    --D-scrollbar-thumb:  #2a2a3e;
    --D-scrollbar-track:  transparent;

    color-scheme: dark;
  }

  /* ── Aurora Borealis ───────────────────────────────────────────────────── */
  [data-vault-theme="aurora"] {
    --D-bg:               #050a12;
    --D-surface:          #0a1422;
    --D-surface-raised:   #0e1a2e;
    --D-border:           #1a3553;
    --D-border-strong:    #2a5580;
    --D-hover:            #121d30;

    --D-text-primary:     #e0f0ff;
    --D-text-secondary:   #74b9d8;
    --D-text-muted:       #3d5a70;

    --D-accent:           #2be6c8;
    --D-accent-hover:     #1dd0b0;
    --D-accent-soft:      #0a2a25;

    --D-danger:           #ff6b8a;
    --D-danger-soft:      #2a0a15;
    --D-danger-border:    #5a1a30;

    --D-success:          #55ff8a;
    --D-warning:          #ffd166;

    --D-skeleton-base:    #0e1a2e;
    --D-skeleton-shine:   #152238;

    --D-radius:           8px;
    --D-radius-sm:        6px;

    --D-scrollbar-thumb:  #1a3553;
    --D-scrollbar-track:  transparent;

    color-scheme: dark;
  }

  /* ── Midnight Forest ───────────────────────────────────────────────────── */
  [data-vault-theme="midnight-forest"] {
    --D-bg:               #0a1208;
    --D-surface:          #0f1f0e;
    --D-surface-raised:   #162a14;
    --D-border:           #1d3d1a;
    --D-border-strong:    #2a5a24;
    --D-hover:            #1a2e16;

    --D-text-primary:     #e0f0dd;
    --D-text-secondary:   #8ab888;
    --D-text-muted:       #4a6a40;

    --D-accent:           #7ee787;
    --D-accent-hover:     #6ad070;
    --D-accent-soft:      #1a3a1e;

    --D-danger:           #e85d75;
    --D-danger-soft:      #2a1015;
    --D-danger-border:    #5a1a25;

    --D-success:          #4ade80;
    --D-warning:          #f0e68c;

    --D-skeleton-base:    #162a14;
    --D-skeleton-shine:   #1e3a1c;

    --D-radius:           8px;
    --D-radius-sm:        6px;

    --D-scrollbar-thumb:  #1d3d1a;
    --D-scrollbar-track:  transparent;

    color-scheme: dark;
  }

  /* ── Vaporwave ──────────────────────────────────────────────────────────── */
  [data-vault-theme="vaporwave"] {
    --D-bg:               #0d0221;
    --D-surface:          #1a0b3c;
    --D-surface-raised:   #241050;
    --D-border:           #3d1a6e;
    --D-border-strong:    #5a2a9e;
    --D-hover:            #2a1458;

    --D-text-primary:     #f0e6ff;
    --D-text-secondary:   #c0a0e0;
    --D-text-muted:       #6a4a90;

    --D-accent:           #ff6ac1;
    --D-accent-hover:     #e055a8;
    --D-accent-soft:      #2a1030;

    --D-danger:           #ff5e5e;
    --D-danger-soft:      #2a0a10;
    --D-danger-border:    #5a1a20;

    --D-success:          #05ffa1;
    --D-warning:          #ff9f1c;

    --D-skeleton-base:    #241050;
    --D-skeleton-shine:   #2e1860;

    --D-radius:           8px;
    --D-radius-sm:        6px;

    --D-scrollbar-thumb:  #3d1a6e;
    --D-scrollbar-track:  transparent;

    color-scheme: dark;
  }

  /* ── Tokyo Night ───────────────────────────────────────────────────────── */
  [data-vault-theme="tokyo-night"] {
    --D-bg:               #0f0f1a;
    --D-surface:          #16162a;
    --D-surface-raised:   #1e1e3a;
    --D-border:           #2a2a4e;
    --D-border-strong:    #3d3d6e;
    --D-hover:            #242444;

    --D-text-primary:     #e0e0f0;
    --D-text-secondary:   #a0a0c8;
    --D-text-muted:       #5a5a80;

    --D-accent:           #7aa2f7;
    --D-accent-hover:     #6b8fd8;
    --D-accent-soft:      #1a2040;

    --D-danger:           #f7768e;
    --D-danger-soft:      #2a1020;
    --D-danger-border:    #5a1a30;

    --D-success:          #9ece6a;
    --D-warning:          #e0af68;

    --D-skeleton-base:    #1e1e3a;
    --D-skeleton-shine:   #262650;

    --D-radius:           8px;
    --D-radius-sm:        6px;

    --D-scrollbar-thumb:  #2a2a4e;
    --D-scrollbar-track:  transparent;

    color-scheme: dark;
  }

  /* ── Obsidian ───────────────────────────────────────────────────────────── */
  [data-vault-theme="obsidian"] {
    --D-bg:               #0a0a0a;
    --D-surface:          #111111;
    --D-surface-raised:   #181818;
    --D-border:           #252525;
    --D-border-strong:    #333333;
    --D-hover:            #1a1a1a;

    --D-text-primary:     #e8e8e8;
    --D-text-secondary:   #888888;
    --D-text-muted:       #444444;

    --D-accent:           #c0a062;
    --D-accent-hover:     #b08d4a;
    --D-accent-soft:      #2a2410;

    --D-danger:           #c75b5b;
    --D-danger-soft:      #2a1010;
    --D-danger-border:    #5a1a1a;

    --D-success:          #6b9e6b;
    --D-warning:          #c4a060;

    --D-skeleton-base:    #181818;
    --D-skeleton-shine:   #202020;

    --D-radius:           8px;
    --D-radius-sm:        6px;

    --D-scrollbar-thumb:  #252525;
    --D-scrollbar-track:  transparent;

    color-scheme: dark;
  }

  /* ── Rosé Pine ─────────────────────────────────────────────────────────── */
  [data-vault-theme="rose-pine"] {
    --D-bg:               #1a1218;
    --D-surface:          #231a22;
    --D-surface-raised:   #2a2028;
    --D-border:           #3d2f3a;
    --D-border-strong:    #4a3a46;
    --D-hover:            #2e2430;

    --D-text-primary:     #e0d0d8;
    --D-text-secondary:   #b0a0a8;
    --D-text-muted:       #6a5a62;

    --D-accent:           #ebbcba;
    --D-accent-hover:     #d8a8a6;
    --D-accent-soft:      #2a1e20;

    --D-danger:           #eb6f92;
    --D-danger-soft:      #2a1018;
    --D-danger-border:    #5a1a2a;

    --D-success:          #9ccfd8;
    --D-warning:          #f6c177;

    --D-skeleton-base:    #2a2028;
    --D-skeleton-shine:   #322830;

    --D-radius:           8px;
    --D-radius-sm:        6px;

    --D-scrollbar-thumb:  #3d2f3a;
    --D-scrollbar-track:  transparent;

    color-scheme: dark;
  }

  /* ── Gruvbox ────────────────────────────────────────────────────────────── */
  [data-vault-theme="gruvbox"] {
    --D-bg:               #fbf1c7;
    --D-surface:          #f2e5bc;
    --D-surface-raised:   #ebdbb2;
    --D-border:           #d5c4a1;
    --D-border-strong:    #bdae93;
    --D-hover:            #e8d5a0;

    --D-text-primary:     #3c3836;
    --D-text-secondary:   #7c6f64;
    --D-text-muted:       #a89984;

    --D-accent:           #458588;
    --D-accent-hover:     #3a7274;
    --D-accent-soft:      #d8e8e8;

    --D-danger:           #cc241d;
    --D-danger-soft:      #f5d0d0;
    --D-danger-border:    #e8a0a0;

    --D-success:          #98971a;
    --D-warning:          #d79921;

    --D-skeleton-base:    #ebdbb2;
    --D-skeleton-shine:   #f2e5bc;

    --D-radius:           8px;
    --D-radius-sm:        6px;

    --D-scrollbar-thumb:  #d5c4a1;
    --D-scrollbar-track:  transparent;

    color-scheme: light;
  }

  /* ── Nord ──────────────────────────────────────────────────────────────── */
  [data-vault-theme="nord"] {
    --D-bg:               #2e3440;
    --D-surface:          #3b4252;
    --D-surface-raised:   #434c5e;
    --D-border:           #4c566a;
    --D-border-strong:    #5a6578;
    --D-hover:            #3a4250;

    --D-text-primary:     #d8dee9;
    --D-text-secondary:   #81a1c1;
    --D-text-muted:       #4c566a;

    --D-accent:           #88c0d0;
    --D-accent-hover:     #76b0c0;
    --D-accent-soft:      #2a3a45;

    --D-danger:           #bf616a;
    --D-danger-soft:      #2a1518;
    --D-danger-border:    #5a252a;

    --D-success:          #a3be8c;
    --D-warning:          #ebcb8b;

    --D-skeleton-base:    #434c5e;
    --D-skeleton-shine:   #4c566a;

    --D-radius:           8px;
    --D-radius-sm:        6px;

    --D-scrollbar-thumb:  #4c566a;
    --D-scrollbar-track:  transparent;

    color-scheme: dark;
  }

  /* ── Scrollbar styling (webkit) — applied to all themes ───────────────── */
  [data-vault-theme] * {
    scrollbar-width: thin;
    scrollbar-color: var(--D-scrollbar-thumb) var(--D-scrollbar-track);
  }

  [data-vault-theme] *::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }

  [data-vault-theme] *::-webkit-scrollbar-thumb {
    background: var(--D-scrollbar-thumb);
    border-radius: 3px;
  }

  [data-vault-theme] *::-webkit-scrollbar-track {
    background: var(--D-scrollbar-track);
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// Swatch color per theme (shown in picker)
// ─────────────────────────────────────────────────────────────────────────────
export const THEME_SWATCH = {
  'light':          '#ffffff',
  'dark-plus':      '#252526',
  'monokai':        '#272822',
  'dracula':        '#282a36',
  'solarized-dark': '#073642',
  'tomorrow-night': '#00346e',
  'cyberpunk':      '#1a1a2e',
  'aurora':         '#0e1a2e',
  'midnight-forest':'#162a14',
  'vaporwave':      '#241050',
  'tokyo-night':    '#1e1e3a',
  'obsidian':       '#181818',
  'rose-pine':      '#2a2028',
  'gruvbox':        '#ebdbb2',
  'nord':           '#434c5e',
};