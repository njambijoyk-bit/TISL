import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ThemeProvider } from './_shared/theme'
import toast from 'react-hot-toast'
import { takeIdentityNotice } from './_shared/api/sessionKit'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
)

// Refreshed because another account signed in from another window (see sessionKit): say why.
if (takeIdentityNotice()) setTimeout(() => toast('Another account was signed in from another window, so this page was refreshed to match it.', { duration: 8000 }), 1200)
