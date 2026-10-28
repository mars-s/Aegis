import { reportedSnapshot } from "@aegis/protocol/sandbox";

export type SnapshotResult =
  | { readonly kind: "accepted"; readonly state: string }
  | { readonly kind: "refused"; readonly reason: "not-ready" | "invalid-state" | "timeout" | "aborted" | "disposed" | "conflict" };

/** The owning view supplies a commit that rechecks its board, card and source version. */
export function createSandboxSnapshot(args: {
  readonly source: () => Window | null;
  readonly channel: () => string;
  readonly commit: (state: string) => boolean;
}) {
  let disposed = false;
  let pending: { readonly promise: Promise<SnapshotResult>; readonly stop: (result: SnapshotResult) => void } | null = null;
  function request(signal: AbortSignal): Promise<SnapshotResult> {
    if (disposed) return Promise.resolve({ kind: "refused", reason: "disposed" });
    if (signal.aborted) return Promise.resolve({ kind: "refused", reason: "aborted" });
    if (pending) return pending.promise;
    const source = args.source(), channel = args.channel();
    if (!source || !channel) return Promise.resolve({ kind: "refused", reason: "not-ready" });
    const requestId = crypto.randomUUID();
    let finish: (result: SnapshotResult) => void = () => {};
    const promise = new Promise<SnapshotResult>(resolve => {
      let settled = false;
      const timer = setTimeout(() => finish({ kind: "refused", reason: "timeout" }), 1500);
      const aborted = () => finish({ kind: "refused", reason: "aborted" });
      const receive = (event: MessageEvent<unknown>) => {
        const reply = reportedSnapshot(event, source, channel, requestId);
        if (!reply) return;
        if (source !== args.source() || channel !== args.channel()) { finish({ kind: "refused", reason: "aborted" }); return; }
        if (reply.kind === "refused") { finish({ kind: "refused", reason: reply.reason }); return; }
        let applied = false;
        try { applied = args.commit(reply.state); } catch { /* Commit refusal retains the live view. */ }
        finish(applied ? { kind: "accepted", state: reply.state } : { kind: "refused", reason: "conflict" });
      };
      finish = result => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener("abort", aborted);
        window.removeEventListener("message", receive);
        pending = null;
        resolve(result);
      };
      signal.addEventListener("abort", aborted, { once: true });
      window.addEventListener("message", receive);
    });
    pending = { promise, stop: finish };
    try { source.postMessage({ type: "aegis:html-snapshot", channel, requestId }, "*"); }
    catch { finish({ kind: "refused", reason: "not-ready" }); }
    return promise;
  }
  return {
    request,
    dispose() { disposed = true; pending?.stop({ kind: "refused", reason: "disposed" }); },
  };
}
