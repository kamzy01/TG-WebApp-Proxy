/**
 * Shim for socks module.
 * teleproto uses this for SOCKS proxy support (Node.js only).
 * Not needed in browser — WebSocket connections handle proxying differently.
 */

export const SocksClient = {
  createConnection: () => {
    throw new Error('SOCKS proxy is not supported in the browser.');
  },
};
