// Plan and List adapted from Zephium at 0eaad6d, MPL-2.0. Changes: React and typed commands.
import type { ObjectData } from "./model.js";
import { Inline } from "./Inline.js";
import { useObjectEditing } from "./context.js";
export function Plan({ data }: { readonly data: ObjectData["plan"] }) {
  const { set } = useObjectEditing();
  const glyph = {
    travel: "→",
    stay: "⌂",
    event: "◆",
    task: "○",
    milestone: "★",
    note: "·",
  };
  return (
    <>
      <ol className="plan">
        {data.steps.map((step, i) => (
          <li
            className={`step ${step.kind}${step.done ? " done" : ""}`}
            key={i}
          >
            <span className="when">{step.when ?? step.date ?? ""}</span>
            <span className="rail">
              <span className="dot">
                {data.checkable ? (
                  <input
                    type="checkbox"
                    checked={!!step.done}
                    aria-label={`Done: ${step.title}`}
                    onChange={(event) =>
                      set(["steps", i, "done"], event.currentTarget.checked)
                    }
                  />
                ) : (
                  glyph[step.kind]
                )}
              </span>
            </span>
            <div className="item">
              <div className="title">
                <Inline text={step.title} />
              </div>
              {step.detail ? (
                <p className="detail">
                  <Inline text={step.detail} />
                </p>
              ) : null}
              {step.place || step.cost ? (
                <p className="meta">
                  {[step.place, step.cost].filter(Boolean).join(" · ")}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
      {data.total ? (
        <p className="total">
          <span>{data.total.label}</span>
          <strong>{data.total.value}</strong>
        </p>
      ) : null}
    </>
  );
}
export function List({ data }: { readonly data: ObjectData["list"] }) {
  const { set } = useObjectEditing();
  return (
    <ul className={`list ${data.style}`}>
      {data.items.map((item, i) => (
        <li className={item.done ? "done" : undefined} key={i}>
          {data.style === "todo" ? (
            <input
              type="checkbox"
              checked={!!item.done}
              aria-label={`Done: ${item.title}`}
              onChange={(event) =>
                set(["items", i, "done"], event.currentTarget.checked)
              }
            />
          ) : (
            <span className="mark">
              {data.style === "questions" ? "Q" : "•"}
            </span>
          )}
          <div className="item">
            <div className="title">
              <Inline text={item.title} />
              {item.priority === "high" ? (
                <span className="high">High</span>
              ) : null}
            </div>
            {item.detail ? (
              <p className="detail">
                <Inline text={item.detail} />
              </p>
            ) : null}
          </div>
          {item.due ? <span className="due">{item.due}</span> : null}
        </li>
      ))}
    </ul>
  );
}
export function Code({ data }: { readonly data: ObjectData["code"] }) {
  return (
    <div className="code">
      <span className="lang">{data.language}</span>
      <pre>
        {data.text
          .replace(/\n$/, "")
          .split("\n")
          .map((line, i) => (
            <span key={i}>
              <span
                className={`line${data.notes?.some((note) => i + 1 >= note.from && i + 1 <= note.to) ? " marked" : ""}`}
              >
                <span className="no">{i + 1}</span>
                {line || " "}
              </span>
              {data.notes?.find((note) => note.to === i + 1) ? (
                <span className="note">
                  {data.notes.find((note) => note.to === i + 1)?.text}
                </span>
              ) : null}
            </span>
          ))}
      </pre>
    </div>
  );
}
