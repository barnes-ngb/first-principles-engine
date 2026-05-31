import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App.tsx'
import { installGlobalErrorHandlers } from './core/observability'

// ARCH-11: capture uncaught errors + unhandled promise rejections globally.
installGlobalErrorHandlers()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
