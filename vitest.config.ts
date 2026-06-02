import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // `server-only` é resolvido pelo Next no build (alias interno); no Vitest o
      // import bare não existe. Aponta p/ o módulo vazio (noop) que o Next usa na
      // condição `react-server`, para podermos unit-testar módulos server-only.
      'server-only': path.resolve(
        __dirname,
        'node_modules/next/dist/compiled/server-only/empty.js'
      ),
    },
  },
})
