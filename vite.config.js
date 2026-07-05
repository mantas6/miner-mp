import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  test: {
    include: ['test/**/*.test.{js,jsx}']
  }
});
