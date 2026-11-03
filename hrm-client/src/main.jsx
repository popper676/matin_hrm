import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/uyf-theme.css'
import './styles/experience.css'
import './styles/launcher.css'
import './styles/recruitment.css'
import './styles/completion.css'
import App from './App.jsx'
import {BrandProvider} from './context/BrandContext.jsx'
import { LanguageProvider } from './context/LanguageContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrandProvider><LanguageProvider>
      <App />
    </LanguageProvider></BrandProvider>
  </StrictMode>,
)
