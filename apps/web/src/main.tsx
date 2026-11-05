import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './app/App';
import { registerServiceWorker } from './app/pwa';
import { createRuntime } from './app/runtime';

const container = document.getElementById('root');
if (!container) throw new Error('missing #root');

// Decide who is signed in before the first render so the router never flashes the wrong page.
const runtime = createRuntime();
await runtime.bootstrap();
createRoot(container).render(
  <StrictMode>
    <App runtime={runtime} />
  </StrictMode>,
);
registerServiceWorker();
