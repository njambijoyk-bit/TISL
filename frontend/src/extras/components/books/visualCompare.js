import { createContext, useContext } from 'react';

/** The name of the period being compared ("Oct 2026"), so a chart can say which one a dashed series or a lighter bar belongs to. */
export const CompareName = createContext('Compared period');
export const useCmp = () => useContext(CompareName);
