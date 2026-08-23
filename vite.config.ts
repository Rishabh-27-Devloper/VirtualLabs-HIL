import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(process.cwd(), './src'),
    },
  },
  server: {
    port: 5173,
    watch: {
      ignored: [
        '**/backend/**',
        '**/*.db',
        '**/*.db-wal',
        '**/*.db-shm',
        '**/*.sqlite*',
        '**/__pycache__/**',
      ],
    },
    proxy: {
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
        rewriteWsOrigin: true,
      },
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
})
