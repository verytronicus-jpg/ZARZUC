/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  // Relatywne ścieżki – folder dist działa z dowolnego katalogu / serwera statycznego.
  base: './',
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
