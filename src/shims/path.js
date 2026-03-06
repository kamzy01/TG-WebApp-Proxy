// Browser shim for Node.js `path` module
export function join(...parts) {
  return parts.join('/');
}

export function resolve(...parts) {
  return parts.join('/');
}

export function basename(p) {
  return p.split('/').pop() || p;
}

export function dirname(p) {
  const parts = p.split('/');
  parts.pop();
  return parts.join('/') || '/';
}

export function extname(p) {
  const base = basename(p);
  const idx = base.lastIndexOf('.');
  return idx > 0 ? base.slice(idx) : '';
}

export const sep = '/';
export const delimiter = ':';

export default { join, resolve, basename, dirname, extname, sep, delimiter };
