import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  root: path.resolve('web'),
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:3001'
    }
  },
  build: {
    outDir: path.resolve('dist'),
    emptyOutDir: true
  },
  test: {
    environment: 'node',
    include: [
      path.resolve('tests/**/*.{test,spec}.?(c|m)[jt]s?(x)'),
      path.resolve('web/**/*.{test,spec}.?(c|m)[jt]s?(x)')
    ]
  }
})
