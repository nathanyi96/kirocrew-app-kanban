import { defineConfig } from 'vite'

// KiroCrew supplies these modules through its import map. Keeping them
// external preserves the host's React instance, which is required for hooks.
export default defineConfig({
  build: {
    lib: {
      entry: 'src/App.tsx',
      formats: ['es'],
      fileName: () => 'index.mjs',
    },
    rollupOptions: {
      external: ['react', 'react/jsx-runtime', 'lucide-react', '@kirocrew/app-sdk', '@kirocrew/app-sdk/ui'],
    },
    outDir: 'dist',
    emptyOutDir: true,
    minify: false,
  },
})
