import { OFFER_STAGE_LABELS, SOURCE_KIND_LABELS, TRACK_LABELS } from './types';

const isDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Collection rule: only offers given within this many days of collection are collected. */
export const OFFER_WINDOW_DAYS = 120;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days between two YYYY-MM-DD dates (to - from). */
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / DAY_MS);
}

/**
 * Checks the collection window. The offer itself (not just the post) must have been given at most
 * OFFER_WINDOW_DAYS before it was collected, so a fresh post describing an old mortgage is rejected.
 * The check is against collectedAt, not today, so records already stored stay valid as they age.
 */
export function collectionWindowError(offerDate: string, postedAt: string, collectedAt: string): string | null {
  if (daysBetween(postedAt, collectedAt) < 0) return 'תאריך הפרסום מאוחר מתאריך ההזנה';
  if (daysBetween(offerDate, postedAt) < 0) return 'תאריך ההצעה מאוחר מתאריך הפרסום';
  const age = daysBetween(offerDate, collectedAt);
  if (age > OFFER_WINDOW_DAYS) {
    return `ההצעה ניתנה ${age} ימים לפני ההזנה. אוספים רק הצעות שניתנו ב־${OFFER_WINDOW_DAYS} הימים האחרונים`;
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
  if (!isDate(rec.offerDate)) return 'חסר תאריך ההצעה (offerDate) בפורמט YYYY-MM-DD';
  if (rec.offerDateBasis !== 'stated' && rec.offerDateBasis !== 'post_date') {
    return 'חסר מקור לתאריך ההצעה (offerDateBasis): stated או post_date';
  }
  if (rec.offerDateBasis === 'post_date' && rec.offerDate !== s.postedAt) {
    return 'כשתאריך ההצעה נגזר מתאריך הפוסט (post_date), הוא חייב להיות זהה לו';
  }
  if (rec.excluded !== undefined) {
    if (typeof rec.excluded?.reason !== 'string' || !rec.excluded.reason.trim() || !isDate(rec.excluded?.since)) {
      return 'רשומה מוחרגת (excluded) חייבת סיבה ותאריך';
    }
  } else {
    const windowErr = collectionWindowError(rec.offerDate, s.postedAt, s.collectedAt);
    if (windowErr) return windowErr;
  }
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
