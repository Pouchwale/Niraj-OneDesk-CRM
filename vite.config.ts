import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { apiPlugin } from './server/api-plugin'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // The same Express API production runs, mounted into the dev server so the
    // two never drift. Keys and file paths stay on this side of the wire.
    apiPlugin(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // The browser/server contract. Both sides import it, so a route that
      // changes shape breaks the build on both ends rather than at runtime.
      '@shared': path.resolve(__dirname, './shared'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // Big enough to notice a bundle that has quietly doubled.
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Splitting the heavy, rarely-changing libraries out means a code
        // change ships a small chunk instead of the whole vendor bundle again.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          sheets: ['xlsx'],
          pdf: ['jspdf', 'jspdf-autotable'],
          motion: ['motion'],
          data: ['@tanstack/react-query', '@tanstack/react-table'],
          icons: ['lucide-react'],
        },
      },
    },
  },
})
