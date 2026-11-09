import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const target = `http://localhost:${process.env.PORT ?? 4100}`;

export default defineConfig({
  root: 'web',
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': target,
      '/uploads': target,
      '/demo-photos': target,
      '/socket.io': { target, ws: true },
    },
  },
  build: { outDir: '../dist', emptyOutDir: true },
});
