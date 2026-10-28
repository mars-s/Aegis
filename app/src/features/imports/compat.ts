// Promise.withResolvers is newer than the Safari 16 target. Promise executors run synchronously.
if (!('withResolvers' in Promise) || typeof Promise.withResolvers !== 'function') {
  Object.defineProperty(Promise, 'withResolvers', {
    configurable: true, writable: true,
    value<T>() {
      let resolve: (value: T | PromiseLike<T>) => void = () => { throw new Error('The Promise executor did not run synchronously'); };
      let reject: (reason?: unknown) => void = () => { throw new Error('The Promise executor did not run synchronously'); };
      const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
      return { promise, resolve, reject };
    },
  });
}
