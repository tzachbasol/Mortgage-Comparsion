import { OFFER_STAGE_LABELS, SOURCE_KIND_LABELS, TRACK_LABELS } from './types';

const isDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Collection rule: only posts published within this many days of collection are collected. */
export const COLLECTION_WINDOW_DAYS = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days between two YYYY-MM-DD dates (to - from). */
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / DAY_MS);
}

/**
 * Checks the collection window: the post must have been published at most
 * COLLECTION_WINDOW_DAYS before it was collected. Older records already in the
 * database stay valid forever – the rule is checked against collectedAt, not today.
 */
export function collectionWindowError(postedAt: string, collectedAt: string): string | null {
  const age = daysBetween(postedAt, collectedAt);
  if (age < 0) return 'תאריך הפרסום מאוחר מתאריך ההזנה';
  if (age > COLLECTION_WINDOW_DAYS) {
    return `הפוסט פורסם ${age} ימים לפני ההזנה. אוספים רק פוסטים מ־${COLLECTION_WINDOW_DAYS} הימים האחרונים`;
  }
  return null;
}

/** Returns an error message (Hebrew) or null if the object is a valid OfferRecord. */
export function validateRecord(r: unknown): string | null {
  if (!r || typeof r !== 'object') return 'לא אובייקט';
  const rec = r as Record<string, any>;
  if (typeof rec.id !== 'string' || !rec.id) return 'חסר id';
  const s = rec.source;
  if (!s || typeof s !== 'object') return 'חסר מקור (source). כל רשומה חייבת מקור אנושי';
  if (!(s.kind in SOURCE_KIND_LABELS)) return `סוג מקור לא מוכר: ${s.kind}`;
  if (s.kind === 'demo') return 'לא ניתן לייבא רשומות דמו';
  if (typeof s.channel !== 'string' || !s.channel.trim()) return 'חסר שם קבוצה / פורום (source.channel)';
  if (!isDate(s.postedAt)) return 'תאריך פרסום (source.postedAt) חייב להיות בפורמט YYYY-MM-DD';
  if (!isDate(s.collectedAt)) return 'תאריך הזנה (source.collectedAt) חייב להיות בפורמט YYYY-MM-DD';
  const windowErr = collectionWindowError(s.postedAt, s.collectedAt);
  if (windowErr) return windowErr;
  if (!s.url && !s.screenshot && !s.quote) return 'חייב להיות לפחות אחד: קישור, צילום מסך או ציטוט מהפוסט';
  if (!(rec.stage in OFFER_STAGE_LABELS)) return `שלב הצעה לא מוכר: ${rec.stage}`;
  if (!Array.isArray(rec.tracks) || !rec.tracks.length) return 'אין מסלולים';
  for (const t of rec.tracks) {
    if (!(t.type in TRACK_LABELS)) return `סוג מסלול לא מוכר: ${t.type}`;
    if (typeof t.termYears !== 'number' || t.termYears <= 0 || t.termYears > 35) return 'תקופה לא תקינה';
    const hasRate = typeof t.rate === 'number';
    const hasMargin = typeof t.primeMargin === 'number';
    if (!hasRate && !hasMargin) return 'למסלול חסרה ריבית';
    if (hasRate && (t.rate < -2 || t.rate > 20)) return `ריבית לא סבירה: ${t.rate}`;
    if (hasMargin && (t.primeMargin < -3 || t.primeMargin > 3)) return `מרווח פריים לא סביר: ${t.primeMargin}`;
  }
  return null;
}
