// Browser shim for Node.js `net` module - GramJS uses WebSocket in browser instead
export class Socket {
  constructor() {}
  connect() { return this; }
  on() { return this; }
  write() {}
  end() {}
  destroy() {}
  setTimeout() {}
  setNoDelay() {}
  setKeepAlive() {}
}

export function createConnection() {
  return new Socket();
}

export function connect() {
  return new Socket();
}

export default { Socket, createConnection, connect };
