import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'static',
  // Keep every stylesheet a file: budgets and CSS tests read dist/_astro, not inlined <style> tags.
  build: { inlineStylesheets: 'never' },
  devToolbar: { enabled: false },
  vite: { plugins: [tailwindcss()] },
});
