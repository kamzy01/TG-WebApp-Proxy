import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      buffer: 'buffer/',
      util: 'util/',
      events: 'events/',
      os: resolve('src/shims/os.js'),
      'node:os': resolve('src/shims/os.js'),
      net: resolve('src/shims/net.js'),
      'node:net': resolve('src/shims/net.js'),
      path: resolve('src/shims/path.js'),
      'node:path': resolve('src/shims/path.js'),
      crypto: resolve('src/shims/crypto.js'),
      'node:crypto': resolve('src/shims/crypto.js'),
      fs: resolve('src/shims/fs.js'),
      'node:fs': resolve('src/shims/fs.js'),
      constants: resolve('src/shims/constants.js'),
      stream: resolve('src/shims/stream.js'),
      'node:stream': resolve('src/shims/stream.js'),
      assert: resolve('src/shims/assert.js'),
      'node:assert': resolve('src/shims/assert.js'),
      // teleproto uses zlib for GZIPPacked messages
      zlib: resolve('src/shims/zlib.js'),
      'node:zlib': resolve('src/shims/zlib.js'),
      // teleproto uses node-localstorage (Node.js only) — we don't need it in browser
      'node-localstorage': resolve('src/shims/node-localstorage.js'),
      // teleproto uses socks for proxy — not needed in browser
      'socks': resolve('src/shims/socks.js'),
      // teleproto uses store2 — provide it or shim it
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
          teleproto: ['teleproto'],
        },
      },
    },
  },
  optimizeDeps: {
    include: ['buffer', 'teleproto', 'util', 'events', 'big-integer'],
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
