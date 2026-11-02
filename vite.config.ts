import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// BASE_PATH : « /hameau/ » sur GitHub Pages (servi sous le nom du dépôt), « / » ailleurs.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // React dans son propre fichier : il ne change presque jamais, et
        // reste ainsi en cache d'une version de l'app à l'autre au lieu
        // d'être retéléchargé avec chaque correction du code.
        manualChunks(id: string) {
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react';
          return undefined;
        },
      },
    },
  },
});
