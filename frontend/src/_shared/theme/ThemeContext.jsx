import { createContext, useContext } from 'react';

export const ThemeContext = createContext({
  // Active options from API
  colourings:      [],
  fonts:           [],
  iconStyles:      [],

  // User's current selections
  activeColouringId: null,
  mode:              'system',
  headingFontId:     null,
  bodyFontId:        null,
  iconStyleId:       null,

  // Setters
  setColouring:   () => {},
  setMode:        () => {},
  setHeadingFont: () => {},
  setBodyFont:    () => {},
  setIconStyle:   () => {},

  // Loading state
  loading: true,
});

export const useTheme = () => useContext(ThemeContext);
