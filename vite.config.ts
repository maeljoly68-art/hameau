import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// BASE_PATH : « /hameau/ » sur GitHub Pages (servi sous le nom du dépôt), « / » ailleurs.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
});
