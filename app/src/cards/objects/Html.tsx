import { useCallback, useEffect, useRef, useState } from "react";
import font from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?inline";
import {
  reportedEscape,
  reportedHeight,
  reportedState,
  THEME_KEYS,
} from "@aegis/protocol/sandbox";
import type { CardBodyProps } from "../../composition.js";
import type { ObjectData } from "./model.js";
import type { ObjectServices } from "./services.js";
import { useSource } from "../../workspace/index.js";
import { retainObjectPreparation } from "../../editors/object/session.js";
import { pinObjectDraft } from "./dirty-pins.js";
import { createSandboxSnapshot } from "./snapshot.js";
import { useObjectEditing } from "./context.js";

export function Html({
  data,
  title,
  cardId,
  workspace,
  engine,
  services,
  expanded,
}: CardBodyProps & {
  readonly data: ObjectData["html"];
  readonly title: string;
  readonly services: ObjectServices;
  readonly expanded: boolean;
}) {
  const frame = useRef<HTMLIFrameElement>(null),
    latest = useRef(data),
    channel = useRef(""),
    capturing = useRef(false),
    loaded = useRef(false),
    loadWaiters = useRef(new Set<() => void>()),
    viewState = useRef<string | undefined>(undefined),
    measuredHeight = useRef(data.height ?? 240);
  const { set } = useObjectEditing();
  const boardId = workspace.metadata.getSnapshot().id;
  const opened = useSource(workspace.ui).editor;
  const authoritative = expanded === (opened?.id === cardId);
  const active = () => expanded === (workspace.ui.getSnapshot().editor?.id === cardId);

  const [src, setSrc] = useState(""),
    [failure, setFailure] = useState(""),
    [height, setHeight] = useState(data.height ?? 240);
  const html = data.html,
    css = data.css,
    js = data.js;
  const measure = useCallback(() => {
    for (const lease of engine.leases.getSnapshot())
      if (lease.cardId === cardId) engine.requestMeasurement(lease.key, lease.generation);
  }, [engine, cardId]);
  useEffect(() => {
    if (authoritative && height !== measuredHeight.current) {
      setHeight(measuredHeight.current);
      measure();
    }
  }, [authoritative, height, measure]);
  useEffect(() => {
    latest.current = data;
  }, [data]);
  function waitForLoad(signal: AbortSignal): Promise<boolean> {
    if (signal.aborted) return Promise.resolve(false);
    if (loaded.current) return Promise.resolve(true);
    return new Promise(resolve => {
      const finish = (ready: boolean) => { clearTimeout(timer); loadWaiters.current.delete(readyNow); signal.removeEventListener("abort", aborted); resolve(ready); };
      const readyNow = () => finish(true), aborted = () => finish(false);
      const timer = setTimeout(() => finish(false), 1500);
      loadWaiters.current.add(readyNow); signal.addEventListener("abort", aborted, { once: true });
    });
  }
  function preferences() {
    const styles = getComputedStyle(frame.current ?? document.documentElement);
    return {
      theme: Object.fromEntries(
        THEME_KEYS.map((key) => [key, styles.getPropertyValue(key)]),
      ),
      motionOff: document.body.classList.contains("motion-off"),
      scheme:
        document.documentElement.dataset.theme === "light" ? "light" : "dark",
    };
  }
  function syncPreferences() {
    frame.current?.contentWindow?.postMessage(
      {
        type: "aegis:html-preferences",
        channel: channel.current,
        ...preferences(),
      },
      "*",
    );
  }
  function syncState(force = false) {
    if (!frame.current?.contentWindow) return;
    if (!force && active() && (capturing.current || viewState.current !== undefined && latest.current.state === viewState.current)) return;
    frame.current?.contentWindow?.postMessage(
      {
        type: "aegis:html-restore",
        channel: channel.current,
        state: latest.current.state ?? null,
      },
      "*",
    );
    viewState.current = latest.current.state;
  }
  useEffect(() => {
    const lifetime = new AbortController(),
      ownChannel = crypto.randomUUID();
    channel.current = ownChannel;
    loaded.current = false;
    viewState.current = undefined;
    const { theme, motionOff, scheme } = preferences(),
      state = latest.current.state;
    const request = {
      html,
      css,
      js,
      ...(state === undefined ? {} : { state }),
      parentOrigin: location.origin,
      channel: ownChannel,
      font,
      theme:
        `color-scheme:${scheme};` +
        THEME_KEYS.map((key) => `${key}:${theme[key]};`).join(""),
      motionOff,
      acknowledgeSnapshots: true,
    };
    setFailure("");
    void services.registerSandbox(request, lifetime.signal).then(
      (result) => {
        if (!lifetime.signal.aborted) setSrc(result.url);
      },
      (cause) => {
        if (!lifetime.signal.aborted)
          setFailure(
            cause instanceof Error ? cause.message : "Could not load custom UI",
          );
      },
    );
    return () => {
      lifetime.abort();
      if (channel.current === ownChannel) channel.current = "";
    };
  }, [html, css, js, services]);
  useEffect(() => {
    syncState();
  }, [data.state]);
  useEffect(() => {
    const lifetime = new AbortController(), token = Symbol("sandbox-snapshot");
    let baseline: string | undefined, pending: Promise<boolean> | null = null;
    const restoreCurrent = () => {
      const card = workspace.record(cardId).getSnapshot();
      if (workspace.metadata.getSnapshot().id !== boardId || !active() || card?.type !== "object" || card.kind !== "html" || card.data.html !== html || card.data.css !== css || card.data.js !== js) return;
      latest.current = card.data;
      syncState(true);
    };
    const snapshot = createSandboxSnapshot({
      source: () => frame.current?.isConnected ? frame.current.contentWindow : null,
      channel: () => channel.current,
      commit: state => {
        const card = workspace.record(cardId).getSnapshot();
        if (workspace.metadata.getSnapshot().id !== boardId || !active() || card?.type !== "object" || card.kind !== "html" || card.data.html !== html || card.data.css !== css || card.data.js !== js) return false;
        if (card.data.state !== baseline && card.data.state !== state) return false;
        viewState.current = state;
        return card.data.state === state || set(["state"], state);
      },
    });
    const release = retainObjectPreparation(workspace, cardId, signal => {
      if (!active()) return Promise.resolve(true);
      if (pending) return pending;
      const captureSignal = AbortSignal.any([signal, lifetime.signal]);
      capturing.current = true; pinObjectDraft(engine, cardId, token, true); setFailure("");
      pending = (async () => {
        if (!await waitForLoad(captureSignal)) {
          if (!captureSignal.aborted) setFailure("Could not capture custom UI (timeout). Try the action again.");
          return false;
        }
        const card = workspace.record(cardId).getSnapshot();
        if (!active() || card?.type !== "object" || card.kind !== "html") return false;
        baseline = card.data.state;
        if (baseline !== viewState.current) {
          restoreCurrent();
          setFailure("Could not capture custom UI (conflict). Newer saved state was restored. Try the action again.");
          return false;
        }
        const result = await snapshot.request(captureSignal);
        if (result.kind === "refused" && result.reason === "conflict") restoreCurrent();
        if (result.kind === "refused" && !lifetime.signal.aborted && result.reason !== "aborted") setFailure(`Could not capture custom UI (${result.reason}). Try the action again.`);
        return result.kind === "accepted";
      })().finally(() => { pending = null; capturing.current = false; pinObjectDraft(engine, cardId, token, false); });
      return pending;
    });
    return () => { lifetime.abort(); snapshot.dispose(); release(); pinObjectDraft(engine, cardId, token, false); };
  }, [workspace, cardId, boardId, html, css, js, expanded, engine, set]);
  useEffect(() => {
    const receive = (event: MessageEvent<unknown>) => {
      const node = frame.current;
      if (!node?.isConnected || !channel.current) return;
      const next = reportedHeight(event, node.contentWindow, channel.current);
      if (next !== null) {
        measuredHeight.current = next;
        if (active()) { setHeight(next); measure(); }
      }
      if (!active()) return;
      const initial = reportedState(
        event,
        node.contentWindow,
        channel.current,
        "aegis:html-initial-state",
      );
      if (initial !== null && latest.current.state === undefined) {
        viewState.current = initial;
        workspace.submit([
          {
            op: "initialise_html",
            id: cardId,
            source: { html, css, js },
            state: initial,
          },
        ]);
      }
      const state = reportedState(event, node.contentWindow, channel.current);
      if (!capturing.current && state !== null && state !== latest.current.state) {
        viewState.current = state;
        set(["state"], state);
      }
      if (
        reportedEscape(event, node.contentWindow, channel.current) &&
        expanded
      ) {
        node.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Escape",
            bubbles: true,
            cancelable: true,
          }),
        );
      }
    };
    window.addEventListener("message", receive);
    const observer = new MutationObserver(syncPreferences);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "style"],
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => {
      window.removeEventListener("message", receive);
      observer.disconnect();
    };
  }, [cardId, workspace, engine, html, css, js, set, expanded, measure]);
  return (
    <>
      <iframe
        ref={frame}
        inert={!authoritative}
        title={title}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        src={src || undefined}
        onLoad={() => {
          if (!src || frame.current?.getAttribute("src") !== src) return;
          syncPreferences(); syncState(true); loaded.current = true;
          for (const ready of [...loadWaiters.current]) ready();
        }}
        style={{ height }}
      />
      {failure ? (
        <p role="status">Custom UI could not load: {failure}</p>
      ) : null}
    </>
  );
}
