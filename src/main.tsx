import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { followSystemBars } from './lib/systemBars'

// Before the first render, so the first frame already clears Android's bars (#198).
followSystemBars(window)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
