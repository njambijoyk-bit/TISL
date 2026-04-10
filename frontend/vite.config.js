import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icons/*.png'],

      devOptions: {
        enabled: true,
        type: 'module',
      },

      manifest: {
        name: 'BlueArc Store',
        short_name: 'BlueArc',
        description: 'Your one-stop shop for products and services',
        start_url: '/',
        id: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#a855f7',
        icons: [
          { src: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // ← fixes the "richer PWA UI" warnings - remove during development
    screenshots: [
      {
        src: '/screenshots/desktop.png',
        sizes: '767x433',//'1280x720',
        type: 'image/png',
        form_factor: 'wide',
      },
      {
        src: '/screenshots/mobile.png',
        sizes: '396x844',//390x844
        type: 'image/png',
        form_factor: 'narrow',
      },
    ],
      },
      // "just installable"  uncomment in deployment— minimal service worker, no caching strategies
     // workbox: {
      //  globPatterns: [],          // cache nothing
      //  runtimeCaching: [],        // no API caching
       // navigateFallback: null,    // no offline fallback
     // },
      selfDestroying: false,
      injectManifest: false,
    }),
  ],
});