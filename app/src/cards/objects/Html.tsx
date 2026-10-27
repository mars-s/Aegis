import { useEffect, useRef, useState } from "react";
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
    reported = useRef<string | undefined>(undefined);
  const { set } = useObjectEditing();
  const boardId = workspace.metadata.getSnapshot().id;
  const opened = useSource(workspace.ui).editor;
  const active = () => expanded === (workspace.ui.getSnapshot().editor?.id === cardId);

  const [src, setSrc] = useState(""),
    [failure, setFailure] = useState(""),
    [height, setHeight] = useState(data.height ?? 240);
  const html = data.html,
    css = data.css,
    js = data.js;
  useEffect(() => {
    latest.current = data;
  }, [data]);
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
    if (!force && active() && (capturing.current || reported.current !== undefined && latest.current.state === reported.current)) return;
    frame.current?.contentWindow?.postMessage(
      {
        type: "aegis:html-restore",
        channel: channel.current,
        state: latest.current.state ?? null,
      },
      "*",
    );
  }
  useEffect(() => {
    const lifetime = new AbortController(),
      ownChannel = crypto.randomUUID();
    channel.current = ownChannel;
    reported.current = undefined;
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
    const snapshot = createSandboxSnapshot({
      source: () => frame.current?.isConnected ? frame.current.contentWindow : null,
      channel: () => channel.current,
      commit: state => {
        const card = workspace.record(cardId).getSnapshot();
        if (workspace.metadata.getSnapshot().id !== boardId || !active() || card?.type !== "object" || card.kind !== "html" || card.data.html !== html || card.data.css !== css || card.data.js !== js) return false;
        if (card.data.state !== baseline && card.data.state !== state) return false;
        reported.current = state;
        return card.data.state === state || set(["state"], state);
      },
    });
    const release = retainObjectPreparation(workspace, cardId, signal => {
      if (!active()) return Promise.resolve(true);
      if (pending) return pending;
      const card = workspace.record(cardId).getSnapshot();
      if (card?.type !== "object" || card.kind !== "html") return Promise.resolve(false);
      baseline = card.data.state;
      capturing.current = true;
      pinObjectDraft(engine, cardId, token, true);
      setFailure("");
      pending = snapshot.request(AbortSignal.any([signal, lifetime.signal])).then(result => {
        if (result.kind === "refused" && !lifetime.signal.aborted && result.reason !== "aborted") setFailure(`Could not capture custom UI (${result.reason}). Try the action again.`);
        return result.kind === "accepted";
      }).finally(() => { pending = null; capturing.current = false; pinObjectDraft(engine, cardId, token, false); });
      return pending;
    });
    return () => { lifetime.abort(); snapshot.dispose(); release(); pinObjectDraft(engine, cardId, token, false); };
  }, [workspace, cardId, boardId, html, css, js, expanded, engine, set]);
  useEffect(() => {
    const receive = (event: MessageEvent<unknown>) => {
      const node = frame.current;
      if (!node?.isConnected || !channel.current || !active()) return;
      const initial = reportedState(
        event,
        node.contentWindow,
        channel.current,
        "aegis:html-initial-state",
      );
      if (initial !== null && latest.current.state === undefined) {
        reported.current = initial;
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
        reported.current = state;
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
      const next = reportedHeight(event, node.contentWindow, channel.current);
      if (next === null) return;
      setHeight(next);
      for (const lease of engine.leases.getSnapshot())
        if (lease.cardId === cardId)
          engine.requestMeasurement(lease.key, lease.generation);
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
  }, [cardId, workspace, engine, html, css, js, set, expanded]);
  return (
    <>
      <iframe
        ref={frame}
        inert={expanded !== (opened?.id === cardId)}
        title={title}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        src={src || undefined}
        onLoad={() => {
          syncPreferences();
          syncState(true);
        }}
        style={{ height }}
      />
      {failure ? (
        <p role="status">Custom UI could not load: {failure}</p>
      ) : null}
    </>
  );
}
