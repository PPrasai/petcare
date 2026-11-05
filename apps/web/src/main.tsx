import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './app/App';
import { registerServiceWorker } from './app/pwa';
import { createRuntime } from './app/runtime';
import { startBrowserTelemetry } from './app/telemetry';
import { useSessionStore } from './state/session';

const container = document.getElementById('root');
if (!container) throw new Error('missing #root');

if (import.meta.env.VITE_OTEL_ENABLED !== 'false') {
  const ratio = Number(import.meta.env.VITE_OTEL_SAMPLE_RATIO ?? '1');
  startBrowserTelemetry({
    sampleRatio: Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 1,
    isDemo: () => useSessionStore.getState().demo,
  });
}

// Decide who is signed in before the first render so the router never flashes the wrong page.
const runtime = createRuntime();
await runtime.bootstrap();
createRoot(container).render(
  <StrictMode>
    <App runtime={runtime} />
  </StrictMode>,
);
registerServiceWorker();
