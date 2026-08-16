import { defineConfig } from 'vitest/config';
import { viteSingleFile as singlefile } from 'vite-plugin-singlefile';

export default defineConfig({
  base: './',
  plugins: [singlefile()],
  build: {
    target: 'es2022',
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
  },
});
