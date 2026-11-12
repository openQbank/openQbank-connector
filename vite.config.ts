import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const packageJson = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')) as { version: string }

const extractEntry = [
  resolve(__dirname, '../qbank-extract/src/index.ts'),
  resolve(__dirname, 'node_modules/@openqbank/extract/src/index.ts'),
  resolve(__dirname, 'src/extract/stub.ts'),
].find((p) => existsSync(p)) ?? resolve(__dirname, 'src/extract/stub.ts')

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(packageJson.version),
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@extract': extractEntry,
    },
  },
  build: {
    minify: 'terser',
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'index.html'),
        background: resolve(__dirname, 'src/background/index.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
      },
    },
  },
})
