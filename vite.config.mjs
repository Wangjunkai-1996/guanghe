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
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (
            id.includes('/react-dom/')
            || id.includes('/react/')
            || id.includes('/scheduler/')
          ) {
            return 'react-vendor'
          }
          if (id.includes('/motion/')) return 'motion-vendor'
          if (id.includes('/lucide-react/')) return 'icon-vendor'
          return undefined
        }
      }
    }
  },
  test: {
    environment: 'node',
    include: [
      path.resolve('tests/**/*.{test,spec}.?(c|m)[jt]s?(x)'),
      path.resolve('web/**/*.{test,spec}.?(c|m)[jt]s?(x)')
    ]
  }
})
