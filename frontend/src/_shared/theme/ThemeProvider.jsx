import { useState, useEffect, useCallback, useMemo } from 'react';
import { ThemeContext } from './ThemeContext';
import { applyTheme, applyFonts, applyIconStyle } from './applyTheme';
import { useSystemDark } from './useSystemDark';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';
const STORAGE_KEY = 'tisl_appearance';

function loadFromStorage() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') ?? {};
  } catch {
    return {};
  }
}

function saveToStorage(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // storage might be blocked
  }
}

export function ThemeProvider({ children }) {
  const systemIsDark = useSystemDark();

  // Available options (from API)
  const [colourings,       setColourings]       = useState([]);
  const [fonts,            setFonts]            = useState([]);
  const [iconStyles,       setIconStyles]        = useState([]);
  const [componentLayouts, setComponentLayouts] = useState([]);
  const [loading,          setLoading]          = useState(true);

  // User's current selections (IDs)
  const [activeColouringId, setActiveColouringId] = useState(null);
  const [mode,              setModeState]          = useState('system');
  const [headingFontId,     setHeadingFontId]      = useState(null);
  const [bodyFontId,        setBodyFontId]          = useState(null);
  const [iconStyleId,       setIconStyleId]         = useState(null);

  // ── Bootstrap: fetch options then merge saved prefs ──────────────────────
  useEffect(() => {
    async function bootstrap() {
      try {
        const res  = await fetch(`${API_BASE}/appearance/options`);
        const data = await res.json();

        setColourings(data.colourings       ?? []);
        setFonts(data.fonts                 ?? []);
        setIconStyles(data.icon_styles      ?? []);
        setComponentLayouts(data.component_layouts ?? []);

        // Defaults from API
        const defaultColouring  = data.colourings?.find(c => c.is_default)   ?? data.colourings?.[0];
        const defaultHeadingFont = data.fonts?.find(f => f.is_default_heading) ?? data.fonts?.[0];
        const defaultBodyFont    = data.fonts?.find(f => f.is_default_body)    ?? data.fonts?.[0];
        const defaultIconStyle   = data.icon_styles?.find(s => s.is_default)  ?? data.icon_styles?.[0];

        // Merge: localStorage > API defaults
        const stored = loadFromStorage();

        const colouringId  = stored.colouring_id   ?? defaultColouring?.id   ?? null;
        const modeVal      = stored.mode_override   ?? 'system';
        const headingId    = stored.heading_font_id ?? defaultHeadingFont?.id ?? null;
        const bodyId       = stored.body_font_id    ?? defaultBodyFont?.id    ?? null;
        const iconId       = stored.icon_style_id   ?? defaultIconStyle?.id   ?? null;

        setActiveColouringId(colouringId);
        setModeState(modeVal);
        setHeadingFontId(headingId);
        setBodyFontId(bodyId);
        setIconStyleId(iconId);

        // If user is logged in, fetch their account prefs and override localStorage
        const token = localStorage.getItem('auth_token');
        if (token) {
          try {
            const prefRes = await fetch(`${API_BASE}/appearance/preferences`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (prefRes.ok) {
              const prefData = await prefRes.json();
              const p = prefData.preferences;
              if (p) {
                if (p.colouring_id)    setActiveColouringId(p.colouring_id);
                if (p.mode_override)   setModeState(p.mode_override);
                if (p.heading_font_id) setHeadingFontId(p.heading_font_id);
                if (p.body_font_id)    setBodyFontId(p.body_font_id);
                if (p.icon_style_id)   setIconStyleId(p.icon_style_id);
              }
            }
          } catch {
            // network error — fall back to localStorage values already set
          }
        }
      } catch (err) {
        console.error('[ThemeProvider] Failed to load appearance options:', err);
      } finally {
        setLoading(false);
      }
    }

    bootstrap();
  }, []);

  // ── Re-apply theme whenever selections or system preference changes ────────
  useEffect(() => {
    if (loading) return;

    const colouring = colourings.find(c => c.id === activeColouringId) ?? null;
    applyTheme(colouring, mode, systemIsDark);
  }, [activeColouringId, mode, systemIsDark, colourings, loading]);

  useEffect(() => {
    if (loading) return;
    const heading = fonts.find(f => f.id === headingFontId);
    const body    = fonts.find(f => f.id === bodyFontId);
    applyFonts(heading?.google_slug ?? null, body?.google_slug ?? null);
  }, [headingFontId, bodyFontId, fonts, loading]);

  useEffect(() => {
    if (loading) return;
    const icon = iconStyles.find(s => s.id === iconStyleId);
    applyIconStyle(icon?.slug ?? null);
  }, [iconStyleId, iconStyles, loading]);

  // ── Setters: update state + persist ──────────────────────────────────────
  const persistPref = useCallback(async (patch) => {
    const current = loadFromStorage();
    saveToStorage({ ...current, ...patch });

    const token = localStorage.getItem('auth_token');
    if (!token) return;

    try {
      await fetch(`${API_BASE}/appearance/preferences`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          Authorization:   `Bearer ${token}`,
        },
        body: JSON.stringify(patch),
      });
    } catch {
      // silent — localStorage is the source of truth for this session
    }
  }, []);

  const setColouring   = useCallback((id) => { setActiveColouringId(id); persistPref({ colouring_id:    id }); }, [persistPref]);
  const setMode        = useCallback((m)  => { setModeState(m);          persistPref({ mode_override:    m  }); }, [persistPref]);
  const setHeadingFont = useCallback((id) => { setHeadingFontId(id);     persistPref({ heading_font_id:  id }); }, [persistPref]);
  const setBodyFont    = useCallback((id) => { setBodyFontId(id);        persistPref({ body_font_id:     id }); }, [persistPref]);
  const setIconStyle   = useCallback((id) => { setIconStyleId(id);       persistPref({ icon_style_id:    id }); }, [persistPref]);

  const value = useMemo(() => ({
    colourings, fonts, iconStyles, componentLayouts,
    activeColouringId, mode, headingFontId, bodyFontId, iconStyleId,
    setColouring, setMode, setHeadingFont, setBodyFont, setIconStyle,
    loading,
  }), [
    colourings, fonts, iconStyles, componentLayouts,
    activeColouringId, mode, headingFontId, bodyFontId, iconStyleId,
    setColouring, setMode, setHeadingFont, setBodyFont, setIconStyle,
    loading,
  ]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}
