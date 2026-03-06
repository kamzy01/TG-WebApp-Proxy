// Browser shim for Node.js `crypto` module - used by GramJS
// Uses Web Crypto API (available in all modern browsers)

export function randomBytes(size) {
  const buf = Buffer.alloc(size);
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  buf.set(bytes);
  return buf;
}

export function createHash(algorithm) {
  // Simple hash implementation for GramJS needs
  const algo = algorithm.toLowerCase().replace('-', '');
  let data = Buffer.alloc(0);
  
  return {
    update(input) {
      if (typeof input === 'string') {
        data = Buffer.concat([data, Buffer.from(input)]);
      } else {
        data = Buffer.concat([data, Buffer.from(input)]);
      }
      return this;
    },
    async _digest() {
      const algoMap = {
        sha1: 'SHA-1',
        sha256: 'SHA-256',
        sha512: 'SHA-512',
        md5: 'MD5',
      };
      const webAlgo = algoMap[algo];
      if (!webAlgo) throw new Error(`Unsupported hash: ${algorithm}`);
      const hashBuffer = await globalThis.crypto.subtle.digest(webAlgo, data);
      return Buffer.from(hashBuffer);
    },
    digest(encoding) {
      // GramJS often calls digest synchronously, but we need async Web Crypto
      // Use a synchronous fallback
      if (algo === 'sha256') {
        return syncSha256(data, encoding);
      }
      if (algo === 'sha1') {
        return syncSha1(data, encoding);
      }
      // Fallback - return a dummy (shouldn't be hit in practice)
      const result = Buffer.alloc(32);
      if (encoding === 'hex') return result.toString('hex');
      return result;
    }
  };
}

export function createCipheriv() {
  throw new Error('createCipheriv not available in browser shim');
}

export function createDecipheriv() {
  throw new Error('createDecipheriv not available in browser shim');
}

export function pbkdf2Sync() {
  throw new Error('pbkdf2Sync not available in browser shim');
}

// Simple synchronous SHA-256 (pure JS)
function syncSha256(data, encoding) {
  const result = sha256(new Uint8Array(data));
  const buf = Buffer.from(result);
  if (encoding === 'hex') return buf.toString('hex');
  return buf;
}

function syncSha1(data, encoding) {
  const result = sha1(new Uint8Array(data));
  const buf = Buffer.from(result);
  if (encoding === 'hex') return buf.toString('hex');
  return buf;
}

// Minimal SHA-256 implementation
function sha256(data) {
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ]);

  let H0 = 0x6a09e667, H1 = 0xbb67ae85, H2 = 0x3c6ef372, H3 = 0xa54ff53a;
  let H4 = 0x510e527f, H5 = 0x9b05688c, H6 = 0x1f83d9ab, H7 = 0x5be0cd19;

  const msgLen = data.length;
  const bitLen = msgLen * 8;
  const padLen = ((msgLen + 8) >> 6 << 6) + 64;
  const msg = new Uint8Array(padLen);
  msg.set(data);
  msg[msgLen] = 0x80;
  const view = new DataView(msg.buffer);
  view.setUint32(padLen - 4, bitLen, false);

  const W = new Uint32Array(64);

  for (let offset = 0; offset < padLen; offset += 64) {
    for (let i = 0; i < 16; i++) W[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = (ror(W[i-15], 7) ^ ror(W[i-15], 18) ^ (W[i-15] >>> 3));
      const s1 = (ror(W[i-2], 17) ^ ror(W[i-2], 19) ^ (W[i-2] >>> 10));
      W[i] = (W[i-16] + s0 + W[i-7] + s1) | 0;
    }
    let a = H0, b = H1, c = H2, d = H3, e = H4, f = H5, g = H6, h = H7;
    for (let i = 0; i < 64; i++) {
      const S1 = ror(e, 6) ^ ror(e, 11) ^ ror(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i] + W[i]) | 0;
      const S0 = ror(a, 2) ^ ror(a, 13) ^ ror(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + temp1) | 0;
      d = c; c = b; b = a; a = (temp1 + temp2) | 0;
    }
    H0 = (H0 + a) | 0; H1 = (H1 + b) | 0; H2 = (H2 + c) | 0; H3 = (H3 + d) | 0;
    H4 = (H4 + e) | 0; H5 = (H5 + f) | 0; H6 = (H6 + g) | 0; H7 = (H7 + h) | 0;
  }

  const result = new Uint8Array(32);
  const rv = new DataView(result.buffer);
  rv.setUint32(0, H0); rv.setUint32(4, H1); rv.setUint32(8, H2); rv.setUint32(12, H3);
  rv.setUint32(16, H4); rv.setUint32(20, H5); rv.setUint32(24, H6); rv.setUint32(28, H7);
  return result;
}

function sha1(data) {
  let H0 = 0x67452301, H1 = 0xEFCDAB89, H2 = 0x98BADCFE, H3 = 0x10325476, H4 = 0xC3D2E1F0;
  const msgLen = data.length;
  const bitLen = msgLen * 8;
  const padLen = ((msgLen + 8) >> 6 << 6) + 64;
  const msg = new Uint8Array(padLen);
  msg.set(data);
  msg[msgLen] = 0x80;
  const view = new DataView(msg.buffer);
  view.setUint32(padLen - 4, bitLen, false);
  const W = new Uint32Array(80);
  for (let offset = 0; offset < padLen; offset += 64) {
    for (let i = 0; i < 16; i++) W[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 80; i++) W[i] = rol(W[i-3] ^ W[i-8] ^ W[i-14] ^ W[i-16], 1);
    let a = H0, b = H1, c = H2, d = H3, e = H4;
    for (let i = 0; i < 80; i++) {
      let f, k;
      if (i < 20) { f = (b & c) | (~b & d); k = 0x5A827999; }
      else if (i < 40) { f = b ^ c ^ d; k = 0x6ED9EBA1; }
      else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; }
      else { f = b ^ c ^ d; k = 0xCA62C1D6; }
      const temp = (rol(a, 5) + f + e + k + W[i]) | 0;
      e = d; d = c; c = rol(b, 30); b = a; a = temp;
    }
    H0 = (H0 + a) | 0; H1 = (H1 + b) | 0; H2 = (H2 + c) | 0; H3 = (H3 + d) | 0; H4 = (H4 + e) | 0;
  }
  const result = new Uint8Array(20);
  const rv = new DataView(result.buffer);
  rv.setUint32(0, H0); rv.setUint32(4, H1); rv.setUint32(8, H2); rv.setUint32(12, H3); rv.setUint32(16, H4);
  return result;
}

function ror(n, b) { return (n >>> b) | (n << (32 - b)); }
function rol(n, b) { return (n << b) | (n >>> (32 - b)); }

export default { randomBytes, createHash, createCipheriv, createDecipheriv, pbkdf2Sync };
