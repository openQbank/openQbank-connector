import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    emptyOutDir: false,
    outDir: 'dist',
    minify: 'terser',
    rollupOptions: {
      input: resolve(__dirname, 'src/background/index.ts'),
      output: {
        format: 'es',
        entryFileNames: 'background.js',
        inlineDynamicImports: true,
      },
    },
  },
})
