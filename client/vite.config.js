import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // match the dev port you're running (5174) and proxy API/uploads to local backend on 4002
    port: 5174,
    proxy: {
      '/api': 'http://localhost:4003',
      '/uploads': 'http://localhost:4003',
    },
  },
});
