import { useEffect, useId, useRef, useState } from "react";
import type { ObjectData } from "./model.js";
import { Text } from "./Text.js";
import { useDraftFlush, useObjectEditing } from "./context.js";

type Field = ObjectData["form"]["fields"][number];
function FieldInput({
  field,
  index,
  hint,
  saved,
}: {
  readonly field: Field;
  readonly index: number;
  readonly hint: string | undefined;
  readonly saved: () => void;
}) {
  const { set } = useObjectEditing();
  const control = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const changed = useRef(false),
    composing = useRef(false),
    base = useRef(field.value);
  const [error, setError] = useState(""),
    [dirty, setDirty] = useState(false);
  const text =
    typeof field.value === "string" || typeof field.value === "number"
      ? String(field.value)
      : "";
  useEffect(() => {
    if (!changed.current && control.current) {
      control.current.value = text;
      base.current = field.value;
    }
  }, [text, field.value]);
  function commit() {
    if (!changed.current) return true;
    const input = control.current;
    if (!input || composing.current || !input.reportValidity()) return false;
    const next =
      field.kind === "number" && input instanceof HTMLInputElement
        ? input.value === ""
          ? null
          : input.valueAsNumber
        : input.value;
    if (typeof next === "number" && !Number.isFinite(next)) return false;
    if (
      field.value !== base.current &&
      next !== field.value &&
      next !== base.current
    ) {
      setError(
        "This field changed while you were editing. Copy your value before closing.",
      );
      return false;
    }
    if (next !== base.current && !set(["fields", index, "value"], next))
      return false;
    changed.current = false;
    setDirty(false);
    base.current = next;
    saved();
    setError("");
    return true;
  }
  useDraftFlush(commit, dirty);
  const title = `${field.label}${field.required ? " (required)" : ""}`;
  const props = {
    defaultValue: text,
    required: field.required,
    "aria-describedby": hint,
    maxLength: 2000,
    onInput: () => {
      changed.current = true;
      setDirty(true);
    },
    onBlur: () => {
      commit();
    },
    onCompositionStart: () => {
      composing.current = true;
    },
    onCompositionEnd: () => {
      composing.current = false;
    },
  };
  return (
    <>
      <label>
        <span>{title}</span>
        {field.kind === "textarea" ? (
          <textarea
            {...props}
            ref={(node) => {
              control.current = node;
            }}
          />
        ) : (
          <input
            {...props}
            type={field.kind === "number" ? "number" : "text"}
            step="any"
            ref={(node) => {
              control.current = node;
            }}
          />
        )}
      </label>
      {error ? <p role="alert">{error}</p> : null}
    </>
  );
}
export function Form({ data }: { readonly data: ObjectData["form"] }) {
  const instance = useId(),
    [committed, setCommitted] = useState(false),
    { set } = useObjectEditing();
  function save(index: number, value: string | boolean) {
    if (set(["fields", index, "value"], value)) setCommitted(true);
  }
  return (
    <form className="fields" onSubmit={(event) => event.preventDefault()}>
      {data.description ? (
        <p className="description">
          <Text
            value={data.description}
            label="Form description"
            path={["description"]}
            multiline
            maxLength={400}
          />
        </p>
      ) : null}
      {data.fields.map((field, i) => {
        const textField =
          field.kind === "text" ||
          field.kind === "textarea" ||
          field.kind === "number";
        const hint =
          [
            field.hint ? `${instance}-hint-${i}` : "",
            !committed && textField ? `${instance}-commit-${i}` : "",
          ]
            .filter(Boolean)
            .join(" ") || undefined;
        const title = `${field.label}${field.required ? " (required)" : ""}`;
        return (
          <div className="field" data-field-index={i} key={field.id}>
            {field.kind === "checkbox" ? (
              <label className="check">
                <input
                  type="checkbox"
                  checked={field.value === true}
                  required={field.required}
                  aria-describedby={hint}
                  onChange={(event) => save(i, event.currentTarget.checked)}
                />
                <span>{title}</span>
              </label>
            ) : field.kind === "choice" ? (
              <fieldset aria-describedby={hint}>
                <legend>{title}</legend>
                <div className="choices">
                  {field.options?.map((option) => (
                    <label className="choice" key={option}>
                      <input
                        type="radio"
                        name={`${instance}-${field.id}`}
                        value={option}
                        checked={field.value === option}
                        required={field.required}
                        onChange={() => save(i, option)}
                      />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : (
              <FieldInput
                field={field}
                index={i}
                hint={hint}
                saved={() => setCommitted(true)}
              />
            )}
            {field.hint ? (
              <p className="hint" id={`${instance}-hint-${i}`}>
                {field.hint}
              </p>
            ) : null}
            {textField ? (
              <span
                className={`commit-hint${!committed ? " visible" : ""}`}
                id={`${instance}-commit-${i}`}
                aria-hidden={committed}
              >
                Saves when you leave the field
              </span>
            ) : null}
          </div>
        );
      })}
      <p className="save-state">
        Changes save to this board when you leave a field.
      </p>
    </form>
  );
}
