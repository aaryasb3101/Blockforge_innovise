import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'trustmesh.svg'],
      manifest: {
        name: 'TrustMesh Decentralized Verifier',
        short_name: 'TrustMesh',
        description: 'Decentralized institutional trust registry & cryptographic verifier',
        theme_color: '#0f172a',
        background_color: '#0b0f19',
        display: 'standalone',
        icons: [
          {
            src: '/trustmesh.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@core': path.resolve(__dirname, '../core/src'),
      '@shared': path.resolve(__dirname, '../shared'),
    },
    dedupe: ['ethers'],
  },
  server: {
    port: 5173,
    fs: {
      allow: ['..'],
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
} as any);
