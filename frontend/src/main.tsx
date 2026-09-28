import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import './i18n'
import App from './App.tsx'

// Offline app shell (PWA) for the website only; the phone app bundles its own files.
if (!Capacitor.isNativePlatform() && import.meta.env.PROD) {
  import('virtual:pwa-register')
    .then(({ registerSW }) => registerSW({ immediate: true }))
    .catch((e) => console.warn('Service worker not registered', e))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
