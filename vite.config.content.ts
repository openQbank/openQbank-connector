import { defineConfig } from 'vite'
import { existsSync } from 'fs'
import { resolve } from 'path'

const extractEntry = [
  resolve(__dirname, '../qbank-extract/src/index.ts'),
  resolve(__dirname, 'node_modules/@openqbank/extract/src/index.ts'),
  resolve(__dirname, 'src/extract/stub.ts'),
].find((p) => existsSync(p)) ?? resolve(__dirname, 'src/extract/stub.ts')

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@extract': extractEntry,
    },
  },
  build: {
    emptyOutDir: false,
    outDir: 'dist',
    minify: 'terser',
    rollupOptions: {
      input: resolve(__dirname, 'src/content/index.ts'),
      output: {
        format: 'iife',
        entryFileNames: 'content.js',
        extend: true,
      },
    },
  },
})
