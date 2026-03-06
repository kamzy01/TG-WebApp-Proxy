// Browser shim for Node.js `constants` module
export const O_RDONLY = 0;
export const O_WRONLY = 1;
export const O_RDWR = 2;
export const O_CREAT = 64;
export const O_EXCL = 128;
export const O_TRUNC = 512;
export const O_APPEND = 1024;
export const S_IFMT = 61440;
export const S_IFREG = 32768;
export const S_IFDIR = 16384;
export default { O_RDONLY, O_WRONLY, O_RDWR, O_CREAT, O_EXCL, O_TRUNC, O_APPEND, S_IFMT, S_IFREG, S_IFDIR };
