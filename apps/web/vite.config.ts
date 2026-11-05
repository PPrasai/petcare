import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig, loadEnv } from 'vite';

// The API serves /api (and /cal). In development and preview they are proxied to API_TARGET.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const target = env.API_TARGET ?? 'http://localhost:3000';
  const proxy = { '/api': target, '/cal': target };
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: false,
        manifest: {
          name: 'PetCare',
          short_name: 'PetCare',
          description: 'Care for your pets together, online or offline.',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          background_color: '#f7faf9',
          theme_color: '#0d7c76',
          icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
            {
              src: '/icon-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//, /^\/cal\//, /^\/e\//],
          globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
        },
      }),
    ],
    server: { port: 5173, proxy },
    preview: { port: 4173, proxy },
    build: { sourcemap: false },
  };
});
