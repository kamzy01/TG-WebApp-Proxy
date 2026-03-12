/**
 * Browser localStorage-based session for teleproto.
 * 
 * teleproto's StoreSession uses node-localstorage (file-based).
 * This provides a browser-compatible version that persists to window.localStorage
 * using the same store2 library that teleproto uses internally.
 * 
 * Extends MemorySession to add persistence.
 */

import { sessions } from 'teleproto';
const { MemorySession } = sessions;

// We need access to AuthKey from teleproto's crypto module
// Import it dynamically since it's not a top-level export

/**
 * A session that stores data in browser localStorage.
 * Works identically to teleproto's StoreSession but uses native browser localStorage
 * instead of node-localstorage.
 */
export class BrowserSession extends MemorySession {
  constructor(sessionName, divider = ':') {
    super();
    if (sessionName === 'session') {
      throw new Error("Session name can't be 'session'. Please use a different name.");
    }
    this.sessionName = sessionName + divider;
  }

  _getKey(suffix) {
    return this.sessionName + suffix;
  }

  _getItem(key) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return undefined;
      return JSON.parse(raw);
    } catch {
      return localStorage.getItem(key);
    }
  }

  _setItem(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  async load() {
    const authKeyData = this._getItem(this._getKey('authKey'));
    if (authKeyData) {
      // Dynamically import AuthKey
      const { AuthKey } = await import('teleproto/crypto/AuthKey');
      this._authKey = new AuthKey();
      let keyBuf;
      if (authKeyData && typeof authKeyData === 'object' && 'data' in authKeyData) {
        keyBuf = Buffer.from(authKeyData.data);
      } else if (typeof authKeyData === 'string') {
        // Stored as base64
        keyBuf = Buffer.from(authKeyData, 'base64');
      } else if (Array.isArray(authKeyData)) {
        keyBuf = Buffer.from(authKeyData);
      } else {
        keyBuf = authKeyData;
      }
      await this._authKey.setKey(keyBuf);
    }

    const dcId = this._getItem(this._getKey('dcId'));
    if (dcId) this._dcId = dcId;

    const port = this._getItem(this._getKey('port'));
    if (port) this._port = port;

    const serverAddress = this._getItem(this._getKey('serverAddress'));
    if (serverAddress) this._serverAddress = serverAddress;
  }

  setDC(dcId, serverAddress, port) {
    this._setItem(this._getKey('dcId'), dcId);
    this._setItem(this._getKey('port'), port);
    this._setItem(this._getKey('serverAddress'), serverAddress);
    super.setDC(dcId, serverAddress, port);
  }

  set authKey(value) {
    this._authKey = value;
    if (value && value.getKey) {
      const key = value.getKey();
      if (key) {
        // Store as array of numbers for JSON serialization
        this._setItem(this._getKey('authKey'), { data: Array.from(key) });
      }
    } else {
      localStorage.removeItem(this._getKey('authKey'));
    }
  }

  get authKey() {
    return this._authKey;
  }

  save() {
    // Everything is saved incrementally in setDC/authKey setters
  }

  processEntities(tlo) {
    const rows = this._entitiesToRows(tlo);
    if (!rows) return;
    for (const row of rows) {
      row.push(new Date().getTime().toString());
      this._setItem(this._getKey(row[0]), row);
    }
  }

  getEntityRowsById(id, exact = true) {
    return this._getItem(this._getKey(id.toString()));
  }

  /**
   * Clear all session data for this session name.
   */
  clear() {
    const prefix = this.sessionName;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        localStorage.removeItem(key);
      }
    }
  }
}
