import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  base: '/ui-assets/',
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src/tazrim', import.meta.url)) } },
  build: { outDir: 'dist', emptyOutDir: true, manifest: true },
})
