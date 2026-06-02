import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'spa-base-redirect',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url && /^\/dashboard(\?|$)/.test(req.url)) {
            req.url = '/dashboard/' + req.url.slice('/dashboard'.length);
          }
          next();
        });
      },
    },
  ],
  base: '/dashboard/',
  build: {
    outDir: 'dist',
  },
  server: {
    proxy: {
      '/api/config.js': 'http://localhost:7700',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/tests/setup.ts'],
  },
});
