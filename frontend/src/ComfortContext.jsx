import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { useComfortPrefs as useComfortPrefsInternal } from '@/hooks/useComfortPrefs';

const ComfortContext = createContext(null);

export function ComfortProvider({ children }) {
  const prefs = useComfortPrefsInternal();
  const { largeText, setLargeText, highContrast, setHighContrast } = prefs;

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const body = document.body;
    if (!root || !body) return;

    root.classList.toggle('pref-large-text', largeText);
    body.classList.toggle('pref-large-text', largeText);
    root.classList.toggle('pref-high-contrast', highContrast);
    body.classList.toggle('pref-high-contrast', highContrast);

    return () => {
      root.classList.remove('pref-large-text');
      body.classList.remove('pref-large-text');
      root.classList.remove('pref-high-contrast');
      body.classList.remove('pref-high-contrast');
    };
  }, [largeText, highContrast]);

  const value = useMemo(() => ({
    largeText,
    setLargeText,
    highContrast,
    setHighContrast,
  }), [largeText, setLargeText, highContrast, setHighContrast]);

  return (
    <ComfortContext.Provider value={value}>
      {children}
    </ComfortContext.Provider>
  );
}

export function useComfort() {
  const ctx = useContext(ComfortContext);
  if (!ctx) {
    throw new Error('useComfort must be used within a ComfortProvider');
  }
  return ctx;
}

export default ComfortContext;
