/**
 * Browser polyfills required by teleproto (MTProto client for JS).
 * Must be loaded BEFORE any teleproto imports.
 */
import { Buffer } from 'buffer';

// teleproto expects Node.js globals
globalThis.Buffer = Buffer;
window.Buffer = Buffer;

// Minimal process shim for teleproto
if (typeof globalThis.process === 'undefined') {
  globalThis.process = {
    env: {},
    version: 'v18.0.0',
    browser: true,
    nextTick: (fn, ...args) => setTimeout(() => fn(...args), 0),
  };
}
