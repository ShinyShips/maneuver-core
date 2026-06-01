import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { registerProductionServiceWorker } from '@/core/app/serviceWorker'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

registerProductionServiceWorker({
  mode: import.meta.env.PROD ? 'production' : 'development',
})
