// Browser shim for Node.js `os` module - used by GramJS
export function type() {
  return 'Browser';
}

export function hostname() {
  return globalThis.location?.hostname || 'browser';
}

export function release() {
  return navigator?.userAgent || 'unknown';
}

export function platform() {
  return 'browser';
}

export function arch() {
  return 'wasm';
}

export function tmpdir() {
  return '/tmp';
}

export default { type, hostname, release, platform, arch, tmpdir };
