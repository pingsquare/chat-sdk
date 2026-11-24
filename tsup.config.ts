import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    target: 'es2020',
  },
  {
    entry: { embed: 'src/embed.ts' },
    format: ['iife'],
    minify: true,
    target: 'es2020',
    outExtension: () => ({ js: '.js' }),
  },
])
