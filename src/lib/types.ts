export type TrackType =
  | 'prime'
  | 'fixed_unlinked'
  | 'fixed_linked'
  | 'variable_unlinked'
  | 'variable_linked';

export const TRACK_LABELS: Record<TrackType, string> = {
  prime: 'פריים',
  fixed_unlinked: 'קבועה לא צמודה (קל"צ)',
  fixed_linked: 'קבועה צמודה (ק"צ)',
  variable_unlinked: 'משתנה לא צמודה (מ"צ)',
  variable_linked: 'משתנה צמודה',
};

export type RepaymentMethod = 'spitzer' | 'equal_principal';

export const REPAYMENT_LABELS: Record<RepaymentMethod, string> = {
  spitzer: 'שפיצר',
  equal_principal: 'קרן שווה',
};

export const LINKED_TRACKS: ReadonlySet<TrackType> = new Set(['fixed_linked', 'variable_linked']);
export const VARIABLE_TRACKS: ReadonlySet<TrackType> = new Set(['variable_unlinked', 'variable_linked']);

export type SourceKind =
  | 'facebook_post'
  | 'facebook_comment'
  | 'forum_post'
  | 'whatsapp'
  | 'personal_offer'
  | 'other'
  | 'demo';

export const SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  facebook_post: 'פוסט בפייסבוק',
  facebook_comment: 'תגובה בפייסבוק',
  forum_post: 'פוסט בפורום',
  whatsapp: 'הודעה בקבוצת וואטסאפ',
  personal_offer: 'הצעה אישית (שלי / של מכר)',
  other: 'אחר',
  demo: 'דמו – לא אמיתי',
};

export type OfferStage = 'initial' | 'negotiated' | 'approved' | 'signed' | 'unknown';

/** The date used for freshness: offer date when known, otherwise the post date. */
export const offerDateOf = (r: { offerDate?: string; source: { postedAt: string } }) => r.offerDate ?? r.source.postedAt;

export const OFFER_STAGE_LABELS: Record<OfferStage, string> = {
  initial: 'הצעה ראשונית',
  negotiated: 'אחרי מו"מ',
  approved: 'אישור עקרוני',
  signed: 'נחתם',
  unknown: 'לא ידוע',
};

/** One track as it appeared in a published offer. */
export interface RecordTrack {
  type: TrackType;
  termYears: number;
  /** Total annual rate in percent. For prime tracks prefer primeMargin. */
  rate?: number;
  /** Prime tracks: margin relative to prime, in percent (e.g. -0.6). */
  primeMargin?: number;
  /** Variable tracks: how often the rate resets, in years. */
  changeEveryYears?: number;
  amount?: number;
  /** Hidden tag: a government eligibility loan (הלוואת זכאות), typed by the track it was given as. Not shown on the site yet. */
  eligibility?: boolean;
  /** Hidden tag: a balloon / bullet track (בלון / בולט). Kept out of medians and matches until the calculator models it. */
  balloon?: boolean;
}

/** Where a record came from. Every number on the site must trace back to one of these. */
export interface RecordSource {
  kind: SourceKind;
  /** Facebook group / forum / chat name. */
  channel: string;
  url?: string;
  /** Date the human published the information (YYYY-MM-DD). */
  postedAt: string;
  /** Anonymised label of the person who posted (never store full names). */
  authorLabel?: string;
  /** Path relative to the site root (screenshots/…) or a data: URL for locally added records. */
  screenshot?: string;
  /** Short quote / transcription of the relevant part of the post. */
  quote?: string;
  /** Date the record was entered into the database (YYYY-MM-DD). */
  collectedAt: string;
  collectedBy?: string;
}

export type OfferDateBasis = 'stated' | 'post_date';

export interface OfferRecord {
  id: string;
  source: RecordSource;
  /**
   * When the bank gave the offer (YYYY-MM-DD). Rates are only comparable if the offer itself is
   * recent, so this – not the post date – is what the 120-day rule and the site filters use.
   */
  offerDate?: string;
  /** 'stated': the post says when the offer was given. 'post_date': the post presents it as just received. */
  offerDateBasis?: OfferDateBasis;
  /**
   * Set on records that stay in the database for the audit trail but no longer meet the collection
   * rules. Excluded records are never used in rates, medians or coverage.
   */
  excluded?: { reason: string; since: string };
  /**
   * Set by the collector on borderline records (e.g. the post doesn't say the offer came from a bank).
   * They are shown on the site but left out of rates and medians until the owner approves them by
   * removing this field.
   */
  needsReview?: { reason: string; since: string };
  bank?: string;
  stage: OfferStage;
  loanAmount?: number;
  propertyValue?: number;
  notes?: string;
  tracks: RecordTrack[];
  /** Where this record is stored: the committed repo file, the user's browser, or demo data. */
  origin?: 'repo' | 'local' | 'demo';
}

/** A track in the mix the user is building. */
export interface MixTrack {
  id: string;
  type: TrackType;
  termYears: number;
  amount: number;
  changeEveryYears?: number;
  /** If set, overrides the rate derived from records. Prime: margin; others: total rate. */
  manualRate?: number;
  /** Repayment schedule; שפיצר when unset. */
  method?: RepaymentMethod;
  /** Linked tracks: expected annual CPI for this track, overriding the global assumption. */
  inflation?: number;
}

/** A track of the user's existing mortgage. */
export interface CurrentTrack {
  id: string;
  type: TrackType;
  remainingBalance: number;
  remainingMonths: number;
  /** Current total annual rate in percent (for prime: the full rate, prime + margin). */
  rate: number;
}

export interface MatchSettings {
  /** Allowed distance in years between requested term and record term. */
  termToleranceYears: number;
  /** Only use records posted in the last N months (0 = no limit). */
  maxAgeMonths: number;
  bank: string; // '' = any
  stages: OfferStage[]; // empty = any
  includeDemo: boolean;
}

export interface EconomicAssumptions {
  /** Current prime rate in percent – entered manually by the user. */
  primeRate: number;
  /** Expected annual CPI inflation in percent, for linked tracks. */
  inflation: number;
}
