import { trackValue } from './match';
import { TERM_BUCKETS, isUsable } from './coverage';
import { offerDateOf, type OfferRecord, type TrackType } from './types';
import { OFFER_WINDOW_DAYS, daysBetween } from './validate';

/** One run log as written to collection/runs/*.json by the web routine or the Facebook import. */
export interface RunLog {
  runDate: string;
  windowStart?: string;
  status: 'ok' | 'partial' | 'blocked' | string;
  sources?: RunSource[];
  added?: string[];
  rejected?: { url?: string; reason: string }[];
  prUrl?: string;
  notes?: string;
  /** When the run landed in the repo (ISO timestamp); added by scripts/build-runs.mjs from git. */
  finishedAt?: string;
}

export interface RunSource {
  name: string;
  url?: string;
  status: 'ok' | 'blocked' | 'error' | 'partial' | string;
  postsScanned?: number;
  offersFound?: number;
  note?: string;
}

export type Collector = 'web' | 'facebook';

/** All run logs of one day, merged into the view the report shows. */
export interface DayRun {
  runDate: string;
  windowStart?: string;
  status: string;
  collectors: Collector[];
  sources: (RunSource & { collector: Collector })[];
  added: string[];
  rejected: { url?: string; reason: string; collector: Collector }[];
  links: string[];
  notes: { collector: Collector; text: string }[];
}

const SCAN_TIME = new Intl.DateTimeFormat('he-IL', {
  timeZone: 'Asia/Jerusalem',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** The newest run as "dd.mm.yyyy, hh:mm" (Israel time), or just the date for logs without a timestamp. */
export function latestScan(logs: RunLog[]): string | undefined {
  const when = (l: RunLog) => new Date(l.finishedAt ?? `${l.runDate}T00:00:00+03:00`).getTime();
  const valid = logs.filter((l) => !Number.isNaN(when(l)));
  if (!valid.length) return undefined;
  const newest = valid.reduce((a, b) => (when(b) > when(a) ? b : a));
  return newest.finishedAt ? SCAN_TIME.format(new Date(newest.finishedAt)) : newest.runDate.split('-').reverse().join('.');
}

export const COLLECTOR_LABELS: Record<Collector, string> = { web: 'פורומים', facebook: 'פייסבוק' };

/** Facebook logs come from the Chrome task (via the inbox import); everything else is the web routine. */
export const collectorOf = (l: RunLog): Collector =>
  /Chrome/i.test(l.notes ?? '') || (l.added ?? []).some((id) => id.startsWith('fb-')) ? 'facebook' : 'web';

const STATUS_RANK: Record<string, number> = { ok: 0, partial: 1, blocked: 2 };

/** The web routine can't log in to Facebook and lists it as blocked; that row is noise once the Facebook task ran. */
const isFacebookPlaceholder = (s: RunSource) => s.status === 'blocked' && /פייסבוק|facebook/i.test(s.name) && !s.postsScanned;

export function mergeDay(logs: RunLog[]): DayRun {
  const collectors = [...new Set(logs.map(collectorOf))];
  const facebookRan = collectors.includes('facebook');
  return {
    runDate: logs[0].runDate,
    windowStart: logs.map((l) => l.windowStart).filter(Boolean).sort()[0],
    status: logs.map((l) => l.status).sort((a, b) => (STATUS_RANK[b] ?? 1) - (STATUS_RANK[a] ?? 1))[0],
    collectors,
    sources: logs.flatMap((l) =>
      (l.sources ?? [])
        .filter((s) => !(facebookRan && collectorOf(l) === 'web' && isFacebookPlaceholder(s)))
        .map((s) => ({ ...s, collector: collectorOf(l) })),
    ),
    added: logs.flatMap((l) => l.added ?? []),
    rejected: logs.flatMap((l) => (l.rejected ?? []).map((r) => ({ ...r, collector: collectorOf(l) }))),
    links: logs.map((l) => l.prUrl).filter((u): u is string => !!u),
    notes: logs.filter((l) => l.notes).map((l) => ({ collector: collectorOf(l), text: l.notes! })),
  };
}

/** Groups run logs by day, newest day first. */
export function groupRuns(logs: RunLog[]): DayRun[] {
  const byDate = new Map<string, RunLog[]>();
  for (const l of logs) byDate.set(l.runDate, [...(byDate.get(l.runDate) ?? []), l]);
  return [...byDate.values()].map(mergeDay).sort((a, b) => b.runDate.localeCompare(a.runDate));
}

export interface CategoryMedian {
  key: string;
  type: TrackType;
  bucket: string;
  count: number;
  median: number;
  /** Median of the same category as of the previous run day, if it had records. */
  previous?: number;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Values per (track type × term bucket) for usable records known by `asOf` whose offer falls in the window before it. */
function categoryValues(records: OfferRecord[], asOf: string, primeRate: number) {
  const cats = new Map<string, { type: TrackType; bucket: string; values: number[] }>();
  for (const r of records.filter(isUsable)) {
    const offered = offerDateOf(r);
    if (r.source.collectedAt > asOf || offered > asOf || daysBetween(offered, asOf) > OFFER_WINDOW_DAYS) continue;
    for (const t of r.tracks) {
      if (t.balloon) continue;
      const v = trackValue(t, primeRate);
      if (v === undefined || Number.isNaN(v)) continue;
      const b = TERM_BUCKETS.find(([lo, hi]) => t.termYears >= lo && t.termYears <= hi) ?? TERM_BUCKETS[TERM_BUCKETS.length - 1];
      const bucket = `${b[0]}–${b[1]}`;
      const key = `${t.type}|${bucket}`;
      if (!cats.has(key)) cats.set(key, { type: t.type, bucket, values: [] });
      cats.get(key)!.values.push(v);
    }
  }
  return cats;
}

const TYPE_ORDER: TrackType[] = ['prime', 'fixed_unlinked', 'fixed_linked', 'variable_unlinked', 'variable_linked'];

/** Median per category as of `asOf`, with the change from `previousAsOf`. */
export function categoryMedians(records: OfferRecord[], asOf: string, previousAsOf: string | undefined, primeRate: number): CategoryMedian[] {
  const now = categoryValues(records, asOf, primeRate);
  const before = previousAsOf ? categoryValues(records, previousAsOf, primeRate) : new Map();
  return [...now.entries()]
    .map(([key, c]) => {
      const p = before.get(key);
      return { key, type: c.type, bucket: c.bucket, count: c.values.length, median: median(c.values), previous: p ? median(p.values) : undefined };
    })
    .sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || a.bucket.localeCompare(b.bucket));
}

export interface Alert {
  level: 'warn' | 'info';
  text: string;
}

/** Days with no run before a missing-run alert. The routine runs daily, so two days means at least one run was missed. */
export const MAX_DAYS_WITHOUT_RUN = 2;
/** Consecutive run days in which a source must fail before it's flagged. */
export const BLOCKED_STREAK = 3;
/** A Facebook group scanned with fewer posts than this was not really covered (feed didn't load, run cut short). */
export const LOW_COVERAGE_POSTS = 20;

/**
 * Things that went wrong silently: no recent run (e.g. the routine lost push access), no recent
 * Facebook run (computer off, Chrome logged out), sources that keep failing, and records awaiting review.
 */
export function buildAlerts(days: DayRun[], records: OfferRecord[], today: string): Alert[] {
  const alerts: Alert[] = [];
  const fmt = (iso: string) => iso.split('-').reverse().join('/');
  const latest = days[0];
  if (!latest) {
    alerts.push({ level: 'warn', text: 'עוד לא נשמר אף יומן ריצה בריפו.' });
  } else {
    const gap = daysBetween(latest.runDate, today);
    if (gap >= MAX_DAYS_WITHOUT_RUN) {
      alerts.push({ level: 'warn', text: `אין ריצת איסוף ${gap} ימים (האחרונה ב־${fmt(latest.runDate)}). כדאי לבדוק את הרוטינה ואת הרשאת ה־push שלה.` });
    }
    if (latest.status === 'blocked') {
      const why = latest.notes.map((n) => n.text).join(' ');
      alerts.push({ level: 'warn', text: `הריצה האחרונה נחסמה או נכשלה${why ? `: ${why}` : '.'}` });
    }
  }
  const lastFacebook = days.find((d) => d.collectors.includes('facebook'));
  if (!lastFacebook) {
    alerts.push({ level: 'warn', text: 'האיסוף מפייסבוק עוד לא רץ אף פעם.' });
  } else {
    const gap = daysBetween(lastFacebook.runDate, today);
    if (gap >= MAX_DAYS_WITHOUT_RUN) {
      alerts.push({ level: 'warn', text: `האיסוף מפייסבוק לא רץ ${gap} ימים (האחרון ב־${fmt(lastFacebook.runDate)}). המשימה רצה רק כשהמחשב דלוק, האפליקציה פתוחה ו־Chrome מחובר לפייסבוק.` });
    }
  }
  if (lastFacebook && lastFacebook === latest) {
    const groups = lastFacebook.sources.filter((s) => s.collector === 'facebook');
    const thin = groups.filter((s) => s.status !== 'blocked' && s.status !== 'error' && (s.postsScanned ?? 0) < LOW_COVERAGE_POSTS);
    if (thin.length) {
      const total = groups.reduce((n, s) => n + (s.postsScanned ?? 0), 0);
      alerts.push({
        level: 'warn',
        text: `כיסוי נמוך בפייסבוק: ב־${thin.length} מתוך ${groups.length} קבוצות נסרקו פחות מ־${LOW_COVERAGE_POSTS} פוסטים (סה"כ ${total} פוסטים). יום כזה לא אומר שלא היו הצעות.`,
      });
    }
  }
  // Newest day first: count each source's failures until its first success.
  const failing = new Map<string, number>();
  const streakEnded = new Set<string>();
  for (const d of days) {
    for (const s of d.sources) {
      // Facebook has its own staleness alert; the web routine's placeholder row says nothing new.
      if (streakEnded.has(s.name) || (s.collector === 'web' && isFacebookPlaceholder(s))) continue;
      if (s.status === 'blocked' || s.status === 'error') failing.set(s.name, (failing.get(s.name) ?? 0) + 1);
      else streakEnded.add(s.name);
    }
  }
  for (const [name, n] of failing) {
    if (n >= BLOCKED_STREAK) {
      alerts.push({ level: 'warn', text: `המקור "${name}" חסום או שגוי ב־${n} הריצות האחרונות. כדאי לתקן את הכתובת ב־collection/sources.json או להחליף אותו.` });
    }
  }
  const pending = records.filter((r) => r.needsReview && !r.excluded).length;
  if (pending) alerts.push({ level: 'info', text: `${pending} רשומות ממתינות לבדיקה שלך ולא נכנסות לחישובים (פירוט בלשונית האדמין).` });
  return alerts;
}

export interface MedianSeries {
  key: string;
  type: TrackType;
  bucket: string;
  points: { date: string; median?: number; count: number }[];
}

/**
 * The median of each well-covered category as of every run day, oldest first, for the trend chart.
 * Only categories with at least `minCount` records on the latest day are included.
 */
export function medianHistory(records: OfferRecord[], dates: string[], primeRate: number, minCount = 3): MedianSeries[] {
  const asc = [...new Set(dates)].sort();
  if (!asc.length) return [];
  const byDate = asc.map((d) => categoryValues(records, d, primeRate));
  const latest = byDate[byDate.length - 1];
  return [...latest.entries()]
    .filter(([, c]) => c.values.length >= minCount)
    .map(([key, c]) => ({
      key,
      type: c.type,
      bucket: c.bucket,
      points: asc.map((date, i) => {
        const v = byDate[i].get(key)?.values ?? [];
        return { date, median: v.length ? median(v) : undefined, count: v.length };
      }),
    }))
    .sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || a.bucket.localeCompare(b.bucket));
}
