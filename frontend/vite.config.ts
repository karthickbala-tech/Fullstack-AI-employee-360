import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',

  build: {
    outDir: 'app/dist',
    emptyOutDir: true,

    rollupOptions: {
      output: {
        entryFileNames: 'assets/index.js',
        chunkFileNames: 'assets/[name].js',

        assetFileNames: (assetInfo) => {
          const name = assetInfo.name ?? ''

          if (name.endsWith('.css')) {
            return 'assets/index.css'
          }

          return 'assets/[name][extname]'
        },
      },
    },
  },
})