export function Trend({
  values,
  label,
}: {
  readonly values: readonly number[];
  readonly label: string;
}) {
  const scale = Math.max(1, ...values.map(Math.abs)),
    normalised = values.map((value) => value / scale);
  const low = Math.min(...normalised),
    span = Math.max(...normalised) - low;
  const points = normalised
    .map(
      (value, i) =>
        `${values.length === 1 ? 60 : 2 + (i * 116) / (values.length - 1)},${span ? 30 - ((value - low) * 26) / span : 17}`,
    )
    .join(" ");
  return (
    <svg
      className="trend"
      viewBox="0 0 120 34"
      role="img"
      aria-label={`${label}: ${values.join(", ")}`}
    >
      {values.length === 1 ? (
        <circle cx="60" cy="17" r="2" />
      ) : (
        <polyline points={points} />
      )}
    </svg>
  );
}
