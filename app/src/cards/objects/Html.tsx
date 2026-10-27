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
    channel = useRef("");
  const { set } = useObjectEditing();
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
  function syncState() {
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
    const receive = (event: MessageEvent<unknown>) => {
      const node = frame.current;
      if (!node?.isConnected || !channel.current) return;
      const initial = reportedState(
        event,
        node.contentWindow,
        channel.current,
        "aegis:html-initial-state",
      );
      if (initial !== null && latest.current.state === undefined)
        workspace.submit([
          {
            op: "initialise_html",
            id: cardId,
            source: { html, css, js },
            state: initial,
          },
        ]);
      const state = reportedState(event, node.contentWindow, channel.current);
      if (state !== null && state !== latest.current.state)
        set(["state"], state);
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
        title={title}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        src={src || undefined}
        onLoad={() => {
          syncPreferences();
          syncState();
        }}
        style={{ height }}
      />
      {failure ? (
        <p role="status">Custom UI could not load: {failure}</p>
      ) : null}
    </>
  );
}
