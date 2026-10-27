// Frame surfaces adapted from Mochiboard (MIT, copyright 2026 Jessa Wolfe).
// See LICENSE.mochiboard. Wireframe tools remain in the creative slice.
import { useEffect, useState } from "react";
import type { CardId } from "@aegis/domain";
import type { CardBodyProps } from "../../composition.js";
import { useCard } from "../../workspace/index.js";
import { Editable } from "./Editable.js";
import { numberProp, stringProp } from "./presentation.js";
import "./basic.css";
export interface FrameServices {
  readonly assetUrl: (url: string) => string;
  readonly requestFrameImage?: (id: CardId) => void;
}
export function FrameBody({
  services,
  ...props
}: CardBodyProps & { readonly services: FrameServices }) {
  const card = useCard(props.workspace, props.cardId);
  const [notice, setNotice] = useState(false);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(false), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  if (!card || card.type !== "frame") return null;
  const dash = card.props?.sdash;
  const width =
    dash === "none" ? 0 : Math.max(0, Math.min(100, numberProp(card, "sw", 0)));
  const gap = Math.max(1, numberProp(card, "dg", 5));
  const radius = Math.max(0, Math.min(4000, numberProp(card, "radius", 0)));
  const src = stringProp(card, "src"),
    label = stringProp(card, "img");
  const visualW = card.props?.visualW,
    visualH = card.props?.visualH;
  return (
    <div className="basic-frame">
      <div
        className="wf-visual"
        style={{
          width:
            typeof visualW === "number"
              ? Math.max(0, Math.min(4000, visualW))
              : "100%",
          height:
            typeof visualH === "number"
              ? Math.max(0, Math.min(4000, visualH))
              : "100%",
          borderRadius: radius,
          opacity: Math.max(0, Math.min(1, numberProp(card, "opacity", 1))),
        }}
      >
        <svg
          className="wf-surface"
          width="100%"
          height="100%"
          style={{
            left: width / 2,
            top: width / 2,
            width: `calc(100% - ${width}px)`,
            height: `calc(100% - ${width}px)`,
          }}
          aria-hidden="true"
        >
          <rect
            width="100%"
            height="100%"
            rx={radius}
            fill={stringProp(card, "fill") || "#ffffff"}
            stroke={stringProp(card, "stroke") || "#a1a1aa"}
            strokeWidth={width}
            strokeDasharray={
              dash === "dot"
                ? `0 ${gap + width}`
                : dash === "dash" || dash === true
                  ? `${Math.max(1, numberProp(card, "dl", 8))} ${gap}`
                  : undefined
            }
            strokeLinecap={dash === "dot" ? "round" : undefined}
          />
        </svg>
        {src ? (
          <img src={services.assetUrl(src)} alt={label} draggable={false} />
        ) : label ? (
          <div
            className={`wf-placeholder${card.props?.placeholder ? " wf-placeholder-pattern" : ""}`}
            style={{ inset: width }}
          >
            <span>{label}</span>
            {card.props?.placeholder ? (
              <small>Placeholder, not AI-generated</small>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (services.requestFrameImage)
                    services.requestFrameImage(props.cardId);
                  else {
                    props.workspace.submit([
                      {
                        op: "update",
                        id: props.cardId,
                        set: { props: { placeholder: true, src: null } },
                      },
                    ]);
                    setNotice(true);
                  }
                }}
              >
                Fill image
              </button>
            )}
          </div>
        ) : null}
      </div>
      <Editable
        {...props}
        className="wf-frame-name body"
        label="Screen name"
        value={card.text || "Screen"}
        multiline={false}
        onChange={(text) => {
          props.workspace.submit([
            { op: "update", id: props.cardId, set: { text } },
          ]);
        }}
      />
      {notice ? (
        <span className="wf-image-notice" role="status">
          Filled with a local placeholder pattern. No AI image was generated.
        </span>
      ) : null}
    </div>
  );
}
