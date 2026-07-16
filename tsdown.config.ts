import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  deps: {
    alwaysBundle: ['@casbin/expression-eval'],
    onlyBundle: ['@casbin/expression-eval', 'jsep'],
  },
})
