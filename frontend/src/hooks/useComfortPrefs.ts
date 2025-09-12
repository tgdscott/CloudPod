import { useCallback, useEffect, useState } from "react";

const LS_LARGE = "ppp.largeText";
const LS_CONTRAST = "ppp.highContrast";

export function useComfortPrefs() {
  const [largeText, setLargeTextState] = useState<boolean>(() => {
    try { return localStorage.getItem(LS_LARGE) === "true"; } catch { return false; }
  });
  const [highContrast, setHighContrastState] = useState<boolean>(() => {
    try { return localStorage.getItem(LS_CONTRAST) === "true"; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem(LS_LARGE, String(largeText)); } catch {}
  }, [largeText]);
  useEffect(() => {
    try { localStorage.setItem(LS_CONTRAST, String(highContrast)); } catch {}
  }, [highContrast]);

  const setLargeText = useCallback((v: boolean) => setLargeTextState(v), []);
  const setHighContrast = useCallback((v: boolean) => setHighContrastState(v), []);

  return { largeText, setLargeText, highContrast, setHighContrast } as const;
}

// Back-compat: allow both named and default import styles
export default useComfortPrefs;
