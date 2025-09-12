// Sentry frontend initialization (no-op if VITE_SENTRY_DSN absent)
// Standard import so types are available; tree-shaking keeps code small if env var undefined.
import * as Sentry from '@sentry/react';

declare global {
  interface ImportMetaEnv {
    VITE_SENTRY_DSN?: string;
    VITE_SENTRY_TRACES_SAMPLE_RATE?: string;
    VITE_SENTRY_ENABLE_DEV?: string;
    VITE_APP_ENV?: string;
    MODE?: string;
    DEV?: boolean;
  }
  interface ImportMeta {
    env: ImportMetaEnv;
  }
}

try {
  if (import.meta.env?.VITE_SENTRY_DSN) {
    Sentry.init({
      dsn: import.meta.env.VITE_SENTRY_DSN,
      tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE || '0'),
      environment: import.meta.env.VITE_APP_ENV || import.meta.env.MODE || 'dev',
      beforeSend(event) {
        if ((import.meta.env.DEV || import.meta.env.MODE === 'development') && !import.meta.env.VITE_SENTRY_ENABLE_DEV) {
          return null;
        }
        return event;
      },
    });
    // eslint-disable-next-line no-console
    console.log('[sentry] initialized');
  } else {
    // eslint-disable-next-line no-console
    console.log('[sentry] disabled (no DSN)');
  }
} catch (e) {
  // eslint-disable-next-line no-console
  console.warn('[sentry] init failed', e);
}
