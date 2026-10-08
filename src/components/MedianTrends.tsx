import type { MedianSeries } from '../lib/report';
import { fmtPct, fmtSigned } from '../lib/storage';
import { TRACK_LABELS } from '../lib/types';

const W = 240;
const H = 96;
const PAD_X = 10;
const PAD_Y = 14;
const fmtDate = (iso: string) => iso.slice(8, 10) + '/' + iso.slice(5, 7);

/** One small line chart per well-covered category: how its median moved from run to run. */
export default function MedianTrends({ series }: { series: MedianSeries[] }) {
  if (!series.length) return <p className="muted">עוד אין קטגוריה עם 3 רשומות לפחות.</p>;
  return (
    <div className="trends">
      {series.map((s) => {
        const isPrime = s.type === 'prime';
        const fmt = (v: number) => (isPrime ? `P${fmtSigned(v)}` : fmtPct(v));
        const pts = s.points.filter((p) => p.median !== undefined) as { date: string; median: number; count: number }[];
        const vals = pts.map((p) => p.median);
        let lo = Math.min(...vals);
        let hi = Math.max(...vals);
        if (hi - lo < 0.1) {
          lo -= 0.05;
          hi += 0.05;
        }
        const n = s.points.length;
        const x = (date: string) => {
          const i = s.points.findIndex((p) => p.date === date);
          return n === 1 ? W / 2 : PAD_X + (i / (n - 1)) * (W - 2 * PAD_X);
        };
        const y = (v: number) => PAD_Y + (1 - (v - lo) / (hi - lo)) * (H - 2 * PAD_Y);
        const last = pts[pts.length - 1];
        const first = pts[0];
        const delta = last && first && pts.length > 1 ? last.median - first.median : undefined;
        return (
          <figure key={s.key} className="trend card">
            <figcaption>
              <b>{TRACK_LABELS[s.type].split(' (')[0]}</b> {s.bucket} שנים
              <span className="trend-value">{last ? fmt(last.median) : '—'}</span>
              {delta !== undefined && (
                <span className={`trend-delta ${delta < 0 ? 'ok' : delta > 0 ? 'bad' : 'muted'}`}>{fmtSigned(delta)}</span>
              )}
            </figcaption>
            <svg viewBox={`0 0 ${W} ${H}`} style={{ direction: 'ltr' }} role="img" aria-label={`חציון ${TRACK_LABELS[s.type]} ${s.bucket} שנים לאורך ${pts.length} ריצות`}>
              {pts.length > 1 && (
                <polyline className="trend-line" points={pts.map((p) => `${x(p.date)},${y(p.median)}`).join(' ')} />
              )}
              {pts.map((p) => (
                <circle key={p.date} className="trend-dot" cx={x(p.date)} cy={y(p.median)} r={3.5}>
                  <title>{`${fmtDate(p.date)}: ${fmt(p.median)} (${p.count} רשומות)`}</title>
                </circle>
              ))}
              <text className="strip-label" x={PAD_X} y={H - 1} textAnchor="start">
                {fmtDate(s.points[0].date)}
              </text>
              <text className="strip-label" x={W - PAD_X} y={H - 1} textAnchor="end">
                {fmtDate(s.points[n - 1].date)}
              </text>
            </svg>
            <div className="muted small">{last?.count ?? 0} רשומות כרגע</div>
          </figure>
        );
      })}
    </div>
  );
}
