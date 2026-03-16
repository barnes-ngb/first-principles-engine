// Stub for sharp — used by root vitest config to avoid native binary resolution
function sharp() {
  throw new Error("sharp stub: not available in test environment");
}
sharp.prototype = {};

export default sharp;
