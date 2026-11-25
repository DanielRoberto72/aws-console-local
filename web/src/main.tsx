import '@cloudscape-design/global-styles/index.css';
import { I18nProvider } from '@cloudscape-design/components/i18n';
import messages from '@cloudscape-design/components/i18n/messages/all.pt-BR';
import { applyMode, Mode } from '@cloudscape-design/global-styles';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import './styles.css';

// Acompanha o tema claro/escuro do sistema.
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
const syncMode = () => applyMode(darkQuery.matches ? Mode.Dark : Mode.Light);
syncMode();
darkQuery.addEventListener('change', syncMode);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider locale="pt-BR" messages={[messages]}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </I18nProvider>
  </StrictMode>,
);
