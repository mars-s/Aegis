import { Effect, Exit, Fiber, Scope } from 'effect';

/** One host lifetime owns runs, connection loops and their cancellation signals. */
export function createLifetime() {
  const scope = Effect.runSync(Scope.make('sequential'));
  let closed: Promise<void> | undefined;
  return {
    add(cleanup: () => Promise<void> | void): void {
      Effect.runSync(Scope.addFinalizer(scope, Effect.promise(async () => { await cleanup(); })));
    },
    async run<A>(work: (signal: AbortSignal) => Promise<A>): Promise<A> {
      const operation = Effect.tryPromise({ try: work, catch: (error: unknown) => error });
      const fiber = Effect.runSync(Effect.forkIn(operation, scope));
      const result = await Effect.runPromise(Effect.match(Fiber.join(fiber), {
        onSuccess: value => ({ kind: 'ok', value } as const),
        onFailure: error => ({ kind: 'error', error } as const),
      }));
      if (result.kind === 'error') throw result.error;
      return result.value;
    },
    close(): Promise<void> {
      closed ??= Effect.runPromise(Scope.close(scope, Exit.void));
      return closed;
    },
  };
}
export type HostLifetime = ReturnType<typeof createLifetime>;
