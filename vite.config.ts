import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the build works both at a domain root and under the
  // GitHub Pages project subpath (/miner-mp/).
  base: './',
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'shared/**/*.test.{ts,tsx}']
  }
});
