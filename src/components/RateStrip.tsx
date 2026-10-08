interface Props {
  /** One value per matching record track (prime: margin, others: rate). */
  values: number[];
  median?: number;
  /** The value the mix actually uses, when it differs from the median (a manual rate). */
  used?: number;
  format: (v: number) => string;
}

const W = 320;
const H = 46;
const PAD = 14;

/** A dot per record on a low-to-high axis, with the median and the rate in use marked. */
export default function RateStrip({ values, median, used, format }: Props) {
  if (!values.length) return null;
  const all = [...values, ...(used !== undefined ? [used] : [])];
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  if (hi - lo < 0.2) {
    const mid = (hi + lo) / 2;
    lo = mid - 0.1;
    hi = mid + 0.1;
  }
  const x = (v: number) => PAD + ((v - lo) / (hi - lo)) * (W - 2 * PAD);
  const axisY = 24;
  return (
    <svg
      className="rate-strip"
      viewBox={`0 0 ${W} ${H}`}
      style={{ direction: 'ltr' }}
      role="img"
      aria-label={`פיזור ${values.length} רשומות: מ־${format(Math.min(...values))} עד ${format(Math.max(...values))}${median !== undefined ? `, חציון ${format(median)}` : ''}`}
    >
      <line x1={PAD} x2={W - PAD} y1={axisY} y2={axisY} className="strip-axis" />
      {values.map((v, i) => (
        <circle key={i} cx={x(v)} cy={axisY} r={4.5} className="strip-dot" />
      ))}
      {median !== undefined && <line x1={x(median)} x2={x(median)} y1={axisY - 11} y2={axisY + 11} className="strip-median" />}
      {used !== undefined && (
        <path d={`M ${x(used)} ${axisY - 9} l 6 -7 h -12 z`} className="strip-used">
          <title>{`הריבית בשימוש: ${format(used)}`}</title>
        </path>
      )}
      <text x={PAD} y={H - 2} className="strip-label" textAnchor="start">
        {format(lo)}
      </text>
      <text x={W - PAD} y={H - 2} className="strip-label" textAnchor="end">
        {format(hi)}
      </text>
    </svg>
  );
}
