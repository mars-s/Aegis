// Promise.withResolvers is newer than Aegis's Safari 16 build target.
// Promise executors run synchronously, so both callbacks exist before returning.
if (typeof Promise.withResolvers !== 'function') {
  Object.defineProperty(Promise, 'withResolvers', {
    configurable: true, writable: true,
    value() {
      let resolve, reject;
      const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      return { promise, resolve, reject };
    },
  });
}
