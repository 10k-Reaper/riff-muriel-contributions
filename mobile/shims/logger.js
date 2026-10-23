// Phones keep no log file: writing one on every failed download only costs storage and battery.
const noop = () => {};
module.exports = { log: noop, error: noop, warn: noop, info: noop, tail: () => [], LOG_DIR: '/data/logs' };
