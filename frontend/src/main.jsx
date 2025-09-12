import "./shims/react-global.js";
import React from 'react'
import './sentry.js'; // side-effect import for Sentry (no-op if DSN missing)
import ReactDOM from 'react-dom/client'
import App, { AppWithToasterWrapper } from './App.jsx'
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import NotFound from '@/pages/NotFound.jsx';
import ErrorPage from '@/pages/Error.jsx';
import ABPreview from '@/pages/ABPreview.jsx';
import OnboardingDemo from '@/pages/OnboardingDemo.jsx';
import Onboarding from '@/pages/Onboarding.jsx';
import { AuthProvider } from './AuthContext.jsx';
import { BrandProvider } from './brand/BrandContext.jsx';
import './index.css' // <-- This line imports all the styles

// --- One-time hash fragment token capture (e.g. from Google OAuth redirect) ---
// Expected format: #access_token=...&token_type=bearer
try {
  // Stable tab id for cross-navigation (session only)
  if(!sessionStorage.getItem('ppp_tab_id')) {
    sessionStorage.setItem('ppp_tab_id', Math.random().toString(36).slice(2));
  }
  if (window.location.hash && window.location.hash.includes('access_token=')) {
    const params = new URLSearchParams(window.location.hash.substring(1));
    const accessToken = params.get('access_token');
    if (accessToken) {
      // Persist for subsequent tabs
      localStorage.setItem('authToken', accessToken);
      // Clean up visible hash (do not trigger a full reload)
      try { window.history.replaceState(null, '', window.location.pathname + window.location.search); } catch(_) {}
      // Dispatch a custom event so AuthProvider (already reading from localStorage) can optionally react.
      window.dispatchEvent(new CustomEvent('ppp-token-captured', { detail: { token: accessToken }}));
    }
  }
} catch(err) {
  // eslint-disable-next-line no-console
  console.warn('[auth] token capture failed', err);
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppWithToasterWrapper />,
    errorElement: <ErrorPage />,
  },
  { path: '/ab', element: <ABPreview /> },
  { path: '/onboarding-demo', element: <OnboardingDemo /> },
  { path: '/onboarding', element: <Onboarding /> },
  { path: '/error', element: <ErrorPage /> },
  // Fallback 404 for any unknown route
  { path: '*', element: <NotFound /> },
]);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <BrandProvider>
        <RouterProvider router={router} />
      </BrandProvider>
    </AuthProvider>
  </React.StrictMode>,
)
