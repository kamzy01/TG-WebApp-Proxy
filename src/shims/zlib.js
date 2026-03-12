/**
 * Browser shim for Node.js `zlib` module.
 * teleproto uses gzipSync/gunzipSync/unzipSync for GZIPPacked MTProto messages.
 * Uses DecompressionStream/CompressionStream APIs (available in modern browsers).
 * Falls back to a pure-JS inflate/deflate for synchronous operations.
 */

// ===== Synchronous inflate (decompress) — pure JS =====
// Telegram uses gzip for GZIPPacked TL objects. We need synchronous decompression.

/**
 * Minimal inflate (RFC 1951) implementation for browser.
 * Handles raw deflate streams as found inside gzip.
 */

// Fixed Huffman tables for deflate
const FIXED_LIT_LEN = new Uint16Array(288);
const FIXED_DIST = new Uint16Array(32);

// Build fixed literal/length table
for (let i = 0; i <= 143; i++) FIXED_LIT_LEN[i] = (0x30 + i) | (8 << 8);
for (let i = 144; i <= 255; i++) FIXED_LIT_LEN[i] = (0x190 + i - 144) | (9 << 8);
for (let i = 256; i <= 279; i++) FIXED_LIT_LEN[i] = (0x00 + i - 256) | (7 << 8);
for (let i = 280; i <= 287; i++) FIXED_LIT_LEN[i] = (0xC0 + i - 280) | (8 << 8);
for (let i = 0; i < 32; i++) FIXED_DIST[i] = i | (5 << 8);

const LEN_BASE = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
const LEN_EXTRA = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
const DIST_BASE = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
const DIST_EXTRA = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
const CL_ORDER = [16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];

class BitReader {
  constructor(data) {
    this.data = data;
    this.pos = 0;
    this.bitBuf = 0;
    this.bitCount = 0;
  }
  readBits(n) {
    while (this.bitCount < n) {
      if (this.pos >= this.data.length) throw new Error('Unexpected end of data');
      this.bitBuf |= this.data[this.pos++] << this.bitCount;
      this.bitCount += 8;
    }
    const val = this.bitBuf & ((1 << n) - 1);
    this.bitBuf >>= n;
    this.bitCount -= n;
    return val;
  }
  alignByte() {
    this.bitBuf = 0;
    this.bitCount = 0;
  }
  readByte() {
    this.alignByte();
    return this.data[this.pos++];
  }
  readUint16() {
    this.alignByte();
    const v = this.data[this.pos] | (this.data[this.pos + 1] << 8);
    this.pos += 2;
    return v;
  }
}

function buildHuffmanTable(lengths) {
  const maxLen = Math.max(...lengths);
  const counts = new Uint16Array(maxLen + 1);
  for (const l of lengths) if (l) counts[l]++;
  
  const nextCode = new Uint16Array(maxLen + 1);
  let code = 0;
  for (let i = 1; i <= maxLen; i++) {
    code = (code + counts[i - 1]) << 1;
    nextCode[i] = code;
  }
  
  // Build lookup: for each symbol, store (code, length)
  const table = new Map();
  for (let sym = 0; sym < lengths.length; sym++) {
    const len = lengths[sym];
    if (len > 0) {
      const c = nextCode[len]++;
      // Store by reversed bits for fast lookup
      let rev = 0;
      let tmp = c;
      for (let j = 0; j < len; j++) {
        rev = (rev << 1) | (tmp & 1);
        tmp >>= 1;
      }
      table.set(rev | (len << 16), sym);
    }
  }
  return { table, maxLen };
}

function decodeSymbol(reader, huffTable) {
  const { table, maxLen } = huffTable;
  let code = 0;
  for (let len = 1; len <= maxLen; len++) {
    code |= reader.readBits(1) << (len - 1);
    const key = code | (len << 16);
    if (table.has(key)) return table.get(key);
  }
  throw new Error('Invalid Huffman code');
}

function inflate(data) {
  const reader = new BitReader(data);
  const output = [];
  let bfinal;
  
  do {
    bfinal = reader.readBits(1);
    const btype = reader.readBits(2);
    
    if (btype === 0) {
      // Stored (no compression)
      reader.alignByte();
      const len = reader.readUint16();
      reader.readUint16(); // nlen (complement)
      for (let i = 0; i < len; i++) {
        output.push(reader.data[reader.pos++]);
      }
    } else {
      let litLenTable, distTable;
      
      if (btype === 1) {
        // Fixed Huffman
        const litLens = new Uint8Array(288);
        for (let i = 0; i <= 143; i++) litLens[i] = 8;
        for (let i = 144; i <= 255; i++) litLens[i] = 9;
        for (let i = 256; i <= 279; i++) litLens[i] = 7;
        for (let i = 280; i <= 287; i++) litLens[i] = 8;
        litLenTable = buildHuffmanTable(litLens);
        
        const distLens = new Uint8Array(32);
        for (let i = 0; i < 32; i++) distLens[i] = 5;
        distTable = buildHuffmanTable(distLens);
      } else {
        // Dynamic Huffman
        const hlit = reader.readBits(5) + 257;
        const hdist = reader.readBits(5) + 1;
        const hclen = reader.readBits(4) + 4;
        
        const clLengths = new Uint8Array(19);
        for (let i = 0; i < hclen; i++) {
          clLengths[CL_ORDER[i]] = reader.readBits(3);
        }
        const clTable = buildHuffmanTable(clLengths);
        
        const allLengths = new Uint8Array(hlit + hdist);
        let idx = 0;
        while (idx < hlit + hdist) {
          const sym = decodeSymbol(reader, clTable);
          if (sym < 16) {
            allLengths[idx++] = sym;
          } else if (sym === 16) {
            const repeat = reader.readBits(2) + 3;
            const val = allLengths[idx - 1];
            for (let j = 0; j < repeat; j++) allLengths[idx++] = val;
          } else if (sym === 17) {
            const repeat = reader.readBits(3) + 3;
            for (let j = 0; j < repeat; j++) allLengths[idx++] = 0;
          } else {
            const repeat = reader.readBits(7) + 11;
            for (let j = 0; j < repeat; j++) allLengths[idx++] = 0;
          }
        }
        
        litLenTable = buildHuffmanTable(allLengths.subarray(0, hlit));
        distTable = buildHuffmanTable(allLengths.subarray(hlit));
      }
      
      // Decode symbols
      while (true) {
        const sym = decodeSymbol(reader, litLenTable);
        if (sym === 256) break; // End of block
        if (sym < 256) {
          output.push(sym);
        } else {
          // Length-distance pair
          const lenIdx = sym - 257;
          const length = LEN_BASE[lenIdx] + (LEN_EXTRA[lenIdx] > 0 ? reader.readBits(LEN_EXTRA[lenIdx]) : 0);
          const distSym = decodeSymbol(reader, distTable);
          const distance = DIST_BASE[distSym] + (DIST_EXTRA[distSym] > 0 ? reader.readBits(DIST_EXTRA[distSym]) : 0);
          
          const start = output.length - distance;
          for (let i = 0; i < length; i++) {
            output.push(output[start + i]);
          }
        }
      }
    }
  } while (!bfinal);
  
  return new Uint8Array(output);
}

/**
 * gunzipSync — decompress a gzip buffer synchronously.
 * Strips the gzip header and calls inflate on the raw deflate stream.
 */
export function gunzipSync(buf) {
  buf = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  
  let pos = 0;
  // Check gzip magic number
  if (buf[0] !== 0x1f || buf[1] !== 0x8b) {
    throw new Error('Not a gzip file');
  }
  const method = buf[2]; // 8 = deflate
  if (method !== 8) throw new Error('Unsupported compression method');
  
  const flags = buf[3];
  pos = 10; // Skip header (ID1, ID2, CM, FLG, MTIME[4], XFL, OS)
  
  // Extra field
  if (flags & 0x04) {
    const xlen = buf[pos] | (buf[pos + 1] << 8);
    pos += 2 + xlen;
  }
  // Original file name
  if (flags & 0x08) {
    while (buf[pos++] !== 0);
  }
  // Comment
  if (flags & 0x10) {
    while (buf[pos++] !== 0);
  }
  // Header CRC
  if (flags & 0x02) {
    pos += 2;
  }
  
  // The rest (minus 8 bytes for CRC32 + ISIZE at end) is the deflate stream
  const deflateData = buf.subarray(pos, buf.length - 8);
  const result = inflate(deflateData);
  return Buffer.from(result);
}

/**
 * unzipSync — alias for gunzipSync (teleproto uses this)
 */
export function unzipSync(buf) {
  return gunzipSync(buf);
}

/**
 * gzipSync — compress a buffer to gzip format synchronously.
 * Uses a stored (no compression) deflate block wrapped in gzip framing.
 * This is simple but larger — fine for the small TL objects Telegram sends.
 */
export function gzipSync(buf) {
  buf = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  
  // gzip header
  const header = Buffer.from([
    0x1f, 0x8b,  // Magic
    0x08,         // Method: deflate
    0x00,         // Flags: none
    0x00, 0x00, 0x00, 0x00, // MTIME
    0x00,         // XFL
    0xff,         // OS: unknown
  ]);
  
  // Build stored deflate blocks (max 65535 bytes each)
  const blocks = [];
  let remaining = buf.length;
  let offset = 0;
  while (remaining > 0) {
    const blockSize = Math.min(remaining, 65535);
    const isLast = remaining <= 65535;
    const blockHeader = Buffer.alloc(5);
    blockHeader[0] = isLast ? 0x01 : 0x00; // BFINAL + BTYPE=00 (stored)
    blockHeader[1] = blockSize & 0xff;
    blockHeader[2] = (blockSize >> 8) & 0xff;
    blockHeader[3] = (~blockSize) & 0xff;
    blockHeader[4] = ((~blockSize) >> 8) & 0xff;
    blocks.push(blockHeader);
    blocks.push(buf.subarray(offset, offset + blockSize));
    offset += blockSize;
    remaining -= blockSize;
  }
  
  // CRC32
  const crc = crc32(buf);
  const footer = Buffer.alloc(8);
  footer.writeUInt32LE(crc, 0);
  footer.writeUInt32LE(buf.length, 4);
  
  return Buffer.concat([header, ...blocks, footer]);
}

// CRC32 lookup table
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[i] = c;
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * inflateSync — decompress raw deflate data
 */
export function inflateSync(buf) {
  buf = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  return Buffer.from(inflate(buf));
}

/**
 * deflateSync — compress to raw deflate (stored blocks, no real compression)
 */
export function deflateSync(buf) {
  buf = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  const blocks = [];
  let remaining = buf.length;
  let offset = 0;
  while (remaining > 0) {
    const blockSize = Math.min(remaining, 65535);
    const isLast = remaining <= 65535;
    const blockHeader = Buffer.alloc(5);
    blockHeader[0] = isLast ? 0x01 : 0x00;
    blockHeader[1] = blockSize & 0xff;
    blockHeader[2] = (blockSize >> 8) & 0xff;
    blockHeader[3] = (~blockSize) & 0xff;
    blockHeader[4] = ((~blockSize) >> 8) & 0xff;
    blocks.push(blockHeader);
    blocks.push(buf.subarray(offset, offset + blockSize));
    offset += blockSize;
    remaining -= blockSize;
  }
  return Buffer.concat(blocks);
}

export default { gzipSync, gunzipSync, unzipSync, inflateSync, deflateSync };
