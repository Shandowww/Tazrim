import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// Development serves the application at its router prefix; production assets
// keep their authenticated static prefix in Budgit's existing server.
export default defineConfig(({ command }) => ({
  base: command === 'serve' ? '/next/' : '/ui-assets/',
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src/tazrim', import.meta.url)) } },
  build: { outDir: 'dist', emptyOutDir: true, manifest: true },
}))
