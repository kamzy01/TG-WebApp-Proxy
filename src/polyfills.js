/**
 * Browser polyfills required by GramJS (Telethon for JS).
 * Must be loaded BEFORE any GramJS imports.
 */
import { Buffer } from 'buffer';

// GramJS expects Node.js globals
globalThis.Buffer = Buffer;
window.Buffer = Buffer;

// Minimal process shim for GramJS
if (typeof globalThis.process === 'undefined') {
  globalThis.process = {
    env: {},
    version: 'v18.0.0',
    browser: true,
    nextTick: (fn, ...args) => setTimeout(() => fn(...args), 0),
  };
}
