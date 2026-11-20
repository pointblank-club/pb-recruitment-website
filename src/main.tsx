import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import ScrollToTop from './pages/components/ScrollToTop.tsx'
import { AuthProvider } from './lib/AuthContext.tsx'
import { ToastContainer } from 'react-toastify';
import * as Sentry from '@sentry/react';
import { redactSentryBreadcrumb, redactSentryEvent } from './lib/sentryRedaction';

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    // Keeps the Yandex callback's one-time code and state out of breadcrumbs and events.
    beforeBreadcrumb: redactSentryBreadcrumb,
    beforeSend: redactSentryEvent,
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
     <ScrollToTop />
      <AuthProvider>
        <App />
        <ToastContainer />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
