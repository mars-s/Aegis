// Reply adapted from Zephium at 0eaad6d, MPL-2.0. Changes: React and schema-derived props.
import type { ObjectData } from "./model.js";
import { Inline } from "./Inline.js";
export function Reply({ data }: { readonly data: ObjectData["reply"] }) {
  return (
    <article className="reply" aria-label={data.headline}>
      <h2>{data.headline}</h2>
      {data.text ? (
        <p className="text">
          <Inline text={data.text} />
        </p>
      ) : null}
      {data.figures?.length ? (
        <dl className="figures">
          {data.figures.map((figure, i) => (
            <div key={i}>
              <dt>{figure.label}</dt>
              <dd>
                <span className="value">{figure.value}</span>
                {figure.note ? (
                  <span className="note">{figure.note}</span>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {data.points?.length ? (
        <ul className="points">
          {data.points.map((point, i) => (
            <li key={i}>
              <Inline text={point} />
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
