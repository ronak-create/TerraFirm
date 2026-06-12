import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 1600, // maplibre-gl + h3-js are large but loaded up-front by design
    rollupOptions: {
      output: {
        // Split the heavy, rarely-changing vendor libs into their own chunks so a
        // code change only invalidates the small app bundle in users' caches.
        manualChunks: {
          maplibre: ['maplibre-gl'],
          geo: ['h3-js', 'supercluster'],
        },
      },
    },
  },
});
