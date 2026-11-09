// Global tokens + primitives load first so component styles (imported by App) win the cascade.
import './styles/tokens.css';
import './styles/base.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';

// Theme: ?theme=light|dark (also remembered), otherwise follow the OS. The Director passes its theme to the phones.
try {
  const q = new URLSearchParams(window.location.search).get('theme');
  if (q === 'light' || q === 'dark') localStorage.setItem('tachi.theme', q);
  const t = q ?? localStorage.getItem('tachi.theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch { /* storage unavailable: follow the OS */ }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
