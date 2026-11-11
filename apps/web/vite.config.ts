import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({ plugins: [react(), tailwindcss()], server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } }, build: { chunkSizeWarningLimit: 1500, rollupOptions: { input: { main: resolve('index.html'), preview: resolve('preview.html') } } } });
