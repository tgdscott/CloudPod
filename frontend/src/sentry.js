// Sentry frontend initialization (no-op if VITE_SENTRY_DSN absent)
import * as Sentry from '@sentry/react';

try {
  const env = import.meta.env || {};
  if (env.VITE_SENTRY_DSN) {
    Sentry.init({
      dsn: env.VITE_SENTRY_DSN,
      tracesSampleRate: Number(env.VITE_SENTRY_TRACES_SAMPLE_RATE || '0'),
      environment: env.VITE_APP_ENV || env.MODE || 'dev',
      beforeSend(event) {
        if ((env.DEV || env.MODE === 'development') && !env.VITE_SENTRY_ENABLE_DEV) {
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
