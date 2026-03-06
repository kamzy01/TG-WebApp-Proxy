// Browser shim for Node.js `fs` module - not actually used in browser
// But some packages statically import it
export function readFileSync() { return ''; }
export function writeFileSync() {}
export function existsSync() { return false; }
export function mkdirSync() {}
export function readdirSync() { return []; }
export function unlinkSync() {}
export function statSync() { return { size: 0 }; }
export function createReadStream() { return null; }
export function createWriteStream() { return null; }
export function access() {}
export function accessSync() {}
export function open() {}
export function openSync() { return 0; }
export function close() {}
export function closeSync() {}
export function read() {}
export function readSync() {}
export function write() {}
export function writeSync() {}
export function rename() {}
export function renameSync() {}
export function chmod() {}
export function chmodSync() {}

export default {
  readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync,
  unlinkSync, statSync, createReadStream, createWriteStream,
  access, accessSync, open, openSync, close, closeSync,
  read, readSync, write, writeSync, rename, renameSync, chmod, chmodSync,
};
