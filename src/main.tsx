import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { SPACE } from './api';
import './styles.css';

document.title = SPACE === 'structure' ? 'Ollisanté · Espace Structure' : 'Ollisanté · Administration';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
