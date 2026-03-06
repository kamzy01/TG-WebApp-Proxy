// Browser shim for Node.js `assert` module
export default function assert(value, message) {
  if (!value) throw new Error(message || 'Assertion failed');
}
export { assert };
assert.ok = assert;
assert.equal = (a, b, msg) => { if (a != b) throw new Error(msg || `${a} != ${b}`); };
assert.strictEqual = (a, b, msg) => { if (a !== b) throw new Error(msg || `${a} !== ${b}`); };
assert.notEqual = (a, b, msg) => { if (a == b) throw new Error(msg || `${a} == ${b}`); };
assert.deepEqual = () => {};
assert.throws = () => {};
