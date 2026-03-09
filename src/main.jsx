import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { migrateData } from './utils/migration'
import App from './App'

// Run data migration before React mounts
migrateData()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
