import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import ScrollToTop from './pages/components/ScrollToTop.tsx'
import { AuthProvider } from './lib/AuthContext.tsx'
import { ToastContainer } from 'react-toastify';
import * as Sentry from '@sentry/react';

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: true,
      }),
    ],
    tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,
    tracePropagationTargets: [
      "localhost",
      import.meta.env.VITE_API_BASE_URL || "http://localhost:8080",
    ],
    replaysSessionSampleRate: 0.05,
    replaysOnErrorSampleRate: 1.0,
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
