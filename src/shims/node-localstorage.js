/**
 * Shim for node-localstorage.
 * teleproto's StoreSession uses this for Node.js file-based storage.
 * In the browser, we use our BrowserSession instead, so this is just a stub.
 */

export class LocalStorage {
  constructor() {
    // no-op — browser uses native localStorage via BrowserSession
  }
  getItem() { return null; }
  setItem() {}
  removeItem() {}
  clear() {}
  get length() { return 0; }
  key() { return null; }
}
