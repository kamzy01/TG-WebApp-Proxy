import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      buffer: 'buffer/',
      util: 'util/',
      events: 'events/',
      os: resolve('src/shims/os.js'),
      net: resolve('src/shims/net.js'),
      path: resolve('src/shims/path.js'),
      crypto: resolve('src/shims/crypto.js'),
      fs: resolve('src/shims/fs.js'),
      constants: resolve('src/shims/constants.js'),
      stream: resolve('src/shims/stream.js'),
      assert: resolve('src/shims/assert.js'),
    },
  },
  define: {
    'global': 'globalThis',
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          gramjs: ['telegram'],
        },
      },
    },
  },
  optimizeDeps: {
    include: ['buffer', 'telegram', 'util', 'events'],
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
  },
  server: {
    port: 3000,
  },
});
