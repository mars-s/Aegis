import type { FrameServices } from "./Frame.js";
import { useEffect, useRef } from "react";
import type { ComponentType } from "react";
import type { CardBodyProps } from "../../composition.js";
import { useCard } from "../../workspace/index.js";
import { Editable } from "./Editable.js";
import { imageCrop, stringProp, textStyle } from "./presentation.js";
import "./basic.css";
export interface BasicServices extends FrameServices {
  readonly ImageActions?: ComponentType<CardBodyProps>;
  readonly VideoActions?: ComponentType<CardBodyProps>;
}
export function ImageBody({
  services,
  ...props
}: CardBodyProps & { readonly services: BasicServices }) {
  const card = useCard(props.workspace, props.cardId);
  if (!card) return null;
  const crop = imageCrop(card),
    caption = stringProp(card, "tagText") || stringProp(card, "tag"),
    Actions = services.ImageActions;
  return (
    <div className="basic-image">
      <div className="image-viewport">
        <img
          src={services.assetUrl(card.url ?? "")}
          alt={caption || card.text || "Image"}
          draggable={false}
          decoding="async"
          loading="lazy"
          style={
            crop
              ? {
                  position: "absolute",
                  width: `${100 / crop.w}%`,
                  height: `${100 / crop.h}%`,
                  maxWidth: "none",
                  left: `${(-100 * crop.x) / crop.w}%`,
                  top: `${(-100 * crop.y) / crop.h}%`,
                  objectFit: "fill",
                }
              : undefined
          }
        />
      </div>
      {caption ? <div className="image-caption">{caption}</div> : null}
      {Actions ? <Actions {...props} /> : null}
    </div>
  );
}
export function VideoBody({
  services,
  ...props
}: CardBodyProps & { readonly services: BasicServices }) {
  const card = useCard(props.workspace, props.cardId),
    playing = useRef(false),
    Actions = services.VideoActions;
  useEffect(() => () => {
    if (playing.current) props.engine.pin(props.cardId, "media", false);
  }, [props.cardId, props.engine]);
  if (!card) return null;
  return (
    <div className="basic-video">
      <div className="media-head">
        <span>{card.text || "Video"}</span>
      </div>
      <video
        controls
        preload="metadata"
        playsInline
        src={services.assetUrl(card.url ?? "")}
        poster={
          stringProp(card, "poster")
            ? services.assetUrl(stringProp(card, "poster"))
            : undefined
        }
        onPlay={() => {
          playing.current = true;
          props.engine.pin(props.cardId, "media", true);
        }}
        onPause={() => {
          playing.current = false;
          props.engine.pin(props.cardId, "media", false);
        }}
        onEnded={() => {
          playing.current = false;
          props.engine.pin(props.cardId, "media", false);
        }}
      />
      {Actions ? <Actions {...props} /> : null}
    </div>
  );
}
function safeLink(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ||
      url.protocol === "http:" ||
      url.protocol === "mailto:"
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}
export function LinkBody(props: CardBodyProps) {
  const card = useCard(props.workspace, props.cardId);
  if (!card) return null;
  if (!card.url)
    return (
      <input
        className="url-input"
        placeholder="Paste a link"
        aria-label="Link address"
        spellCheck={false}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape") event.currentTarget.blur();
          if (event.key === "Enter" && event.currentTarget.value.trim()) {
            const value = event.currentTarget.value.trim(),
              url = safeLink(
                /^[a-z]+:/i.test(value) ? value : "https://" + value,
              );
            if (url)
              props.workspace.submit([
                { op: "update", id: props.cardId, set: { url } },
              ]);
          }
        }}
      />
    );
  return (
    <div className="basic-link" style={textStyle(card)}>
      <Editable
        {...props}
        className="body"
        label="Link title"
        value={card.text || card.url}
        onChange={(text) => {
          props.workspace.submit([
            { op: "update", id: props.cardId, set: { text } },
          ]);
        }}
      />
      <a href={safeLink(card.url)} target="_blank" rel="noreferrer">
        {card.url}
      </a>
    </div>
  );
}
export function WebBody(props: CardBodyProps) {
  const card = useCard(props.workspace, props.cardId);
  if (!card) return null;
  return (
    <div className="basic-web" style={textStyle(card)}>
      <div className="web-head">
        <span className="url">{card.url}</span>
      </div>
      <div className="web-body">
        <Editable
          {...props}
          className="body"
          label="Web window text"
          value={card.text}
          onChange={(text) => {
            props.workspace.submit([
              { op: "update", id: props.cardId, set: { text } },
            ]);
          }}
        />
        <small>Live pages arrive in a later build.</small>
      </div>
    </div>
  );
}
