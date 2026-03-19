import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { SnowAttributionMode } from '@/components/snowTimelinePeriods';

interface SnowAttributionContextValue {
  mode: SnowAttributionMode;
  setMode: (mode: SnowAttributionMode) => void;
}

const COOKIE_NAME = 'pow_snow_attribution';
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year in seconds

function readCookie(): SnowAttributionMode {
  try {
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const [rawName, ...rest] = cookie.split('=');
      const name = rawName?.trim();
      if (name === COOKIE_NAME) {
        const v = rest.join('=').trim();
        if (v === 'calendar' || v === 'ski') return v;
        break;
      }
    }
  } catch { /* ignore */ }
  return 'calendar';
}

function writeCookie(mode: SnowAttributionMode) {
  document.cookie = `${COOKIE_NAME}=${mode};max-age=${COOKIE_MAX_AGE};path=/;SameSite=Lax`;
}

const SnowAttributionContext = createContext<SnowAttributionContextValue>({
  mode: 'calendar',
  setMode: () => {},
});

export function SnowAttributionProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<SnowAttributionMode>(readCookie);

  const setMode = useCallback((next: SnowAttributionMode) => {
    writeCookie(next);
    setModeState(next);
  }, []);

  return (
    <SnowAttributionContext.Provider value={{ mode, setMode }}>
      {children}
    </SnowAttributionContext.Provider>
  );
}

export function useSnowAttribution() {
  return useContext(SnowAttributionContext);
}
