import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        // Include font files in precache
        includeAssets: ['fonts/InterVariable.woff2', 'fonts/InterVariable-Italic.woff2', 'favicon.png'],
        manifest: {
          name: 'Caja Chica',
          short_name: 'Caja Chica',
          description: 'Registro de movimientos financieros en lenguaje natural',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          lang: 'es',
          orientation: 'portrait',
          // theme_color: strong-surface oklch(23% 0.014 165) ≈ #171f1b
          // background_color: canvas oklch(95.5% 0.008 155) ≈ #ecf2ee
          theme_color: '#171f1b',
          background_color: '#ecf2ee',
          icons: [
            {
              src: '/icon-192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: '/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: '/icon-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          // Precache the app shell: JS chunks, CSS, and static assets
          globPatterns: ['**/*.{js,css,html,woff2,svg,png}'],
          // SPA navigation fallback
          navigateFallback: '/index.html',
          // CRITICAL: Never cache API responses — financial data must be fresh.
          // The API lives on a cross-origin Cloud Run URL (no /api/* on this origin),
          // so by default Workbox won't touch it. This runtime config makes the
          // intent explicit and handles any same-origin API calls defensively.
          runtimeCaching: [
            {
              // Block any /api/* from being cached (NetworkOnly = always live)
              urlPattern: /\/api\//,
              handler: 'NetworkOnly',
            },
            {
              // Supabase REST/realtime traffic — never cache
              urlPattern: /supabase\.co/,
              handler: 'NetworkOnly',
            },
            {
              // Cloud Run backend — never cache
              urlPattern: /run\.app/,
              handler: 'NetworkOnly',
            },
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
              return 'react-vendor';
            }
            if (id.includes('node_modules/@supabase')) {
              return 'supabase';
            }
            if (id.includes('node_modules/lucide-react')) {
              return 'lucide';
            }
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
