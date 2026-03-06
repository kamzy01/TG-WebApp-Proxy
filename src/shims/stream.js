// Browser shim for Node.js `stream` module
export class Readable {
  constructor() {}
  on() { return this; }
  pipe() { return this; }
  read() { return null; }
  destroy() {}
}

export class Writable {
  constructor() {}
  on() { return this; }
  write() { return true; }
  end() {}
  destroy() {}
}

export class Transform extends Readable {
  constructor() { super(); }
}

export class PassThrough extends Transform {
  constructor() { super(); }
}

export default { Readable, Writable, Transform, PassThrough };
