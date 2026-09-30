import { useState } from 'react';
import { uid } from '../lib/storage';
import {
  OFFER_STAGE_LABELS,
  SOURCE_KIND_LABELS,
  TRACK_LABELS,
  VARIABLE_TRACKS,
  type OfferRecord,
  type OfferStage,
  type RecordTrack,
  type SourceKind,
  type TrackType,
} from '../lib/types';
import { validateRecord } from '../lib/validate';

const today = () => new Date().toISOString().slice(0, 10);
const optNum = (v: string) => (v === '' ? undefined : Number(v));

export default function RecordForm({ onSave }: { onSave: (r: OfferRecord) => void }) {
  const [kind, setKind] = useState<SourceKind>('facebook_post');
  const [channel, setChannel] = useState('');
  const [url, setUrl] = useState('');
  const [postedAt, setPostedAt] = useState(today());
  // Empty = the post presents the offer as just received, so the offer date is the post date.
  const [statedOfferDate, setStatedOfferDate] = useState('');
  const [authorLabel, setAuthorLabel] = useState('');
  const [quote, setQuote] = useState('');
  const [screenshot, setScreenshot] = useState<string | undefined>();
  const [bank, setBank] = useState('');
  const [stage, setStage] = useState<OfferStage>('initial');
  const [loanAmount, setLoanAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [tracks, setTracks] = useState<RecordTrack[]>([{ type: 'prime', termYears: 30, primeMargin: -0.5 }]);
  const [error, setError] = useState('');

  const setTrack = (i: number, patch: Partial<RecordTrack>) => setTracks((ts) => ts.map((t, j) => (j === i ? { ...t, ...patch } : t)));

  const onFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setScreenshot(reader.result as string);
    reader.readAsDataURL(file);
  };

  const save = () => {
    const record: OfferRecord = {
      id: uid(),
      source: {
        kind,
        channel: channel.trim(),
        url: url.trim() || undefined,
        postedAt,
        authorLabel: authorLabel.trim() || undefined,
        quote: quote.trim() || undefined,
        screenshot,
        collectedAt: today(),
      },
      offerDate: statedOfferDate || postedAt,
      offerDateBasis: statedOfferDate ? 'stated' : 'post_date',
      bank: bank.trim() || undefined,
      stage,
      loanAmount: optNum(loanAmount),
      notes: notes.trim() || undefined,
      tracks,
    };
    const err = validateRecord(record);
    if (err) return setError(err);
    onSave(record);
  };

  return (
    <div className="record-form">
      <h4>מקור</h4>
      <div className="grid">
        <label>
          סוג מקור
          <select value={kind} onChange={(e) => setKind(e.target.value as SourceKind)}>
            {(Object.keys(SOURCE_KIND_LABELS) as SourceKind[])
              .filter((k) => k !== 'demo')
              .map((k) => (
                <option key={k} value={k}>
                  {SOURCE_KIND_LABELS[k]}
                </option>
              ))}
          </select>
        </label>
        <label>
          שם הקבוצה / הפורום *
          <input value={channel} onChange={(e) => setChannel(e.target.value)} />
        </label>
        <label>
          קישור לפוסט
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} />
        </label>
        <label>
          תאריך הפרסום *
          <input type="date" value={postedAt} onChange={(e) => setPostedAt(e.target.value)} />
        </label>
        <label>
          מתי ניתנה ההצעה
          <input type="date" value={statedOfferDate} onChange={(e) => setStatedOfferDate(e.target.value)} />
          <small>אם הפוסט מציין מתי ניתנה ההצעה. ריק = הוצגה כהצעה טרייה, ותאריך הפוסט ישמש כתאריך ההצעה.</small>
        </label>
        <label>
          כינוי המפרסם (בלי שם מלא)
          <input value={authorLabel} onChange={(e) => setAuthorLabel(e.target.value)} placeholder='למשל "חבר קבוצה, זוג צעיר"' />
        </label>
        <label>
          צילום מסך
          <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        </label>
        <label className="wide">
          ציטוט מהפוסט
          <textarea value={quote} onChange={(e) => setQuote(e.target.value)} rows={2} />
        </label>
      </div>
      {screenshot && <img className="thumb" src={screenshot} alt="תצוגה מקדימה" />}

      <h4>ההצעה</h4>
      <div className="grid">
        <label>
          בנק
          <input value={bank} onChange={(e) => setBank(e.target.value)} />
        </label>
        <label>
          שלב
          <select value={stage} onChange={(e) => setStage(e.target.value as OfferStage)}>
            {(Object.keys(OFFER_STAGE_LABELS) as OfferStage[]).map((s) => (
              <option key={s} value={s}>
                {OFFER_STAGE_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label>
          סכום הלוואה (₪)
          <input type="number" value={loanAmount} onChange={(e) => setLoanAmount(e.target.value)} />
        </label>
        <label className="wide">
          הערות (מטרת הלוואה, LTV, פרופיל לווה…)
          <input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>

      <h4>מסלולים</h4>
      {tracks.map((t, i) => (
        <div className="track-fields" key={i}>
          <label>
            סוג
            <select
              value={t.type}
              onChange={(e) => {
                const type = e.target.value as TrackType;
                setTrack(i, {
                  type,
                  rate: type === 'prime' ? undefined : t.rate,
                  primeMargin: type === 'prime' ? (t.primeMargin ?? 0) : undefined,
                  changeEveryYears: VARIABLE_TRACKS.has(type) ? (t.changeEveryYears ?? 5) : undefined,
                });
              }}
            >
              {(Object.keys(TRACK_LABELS) as TrackType[]).map((k) => (
                <option key={k} value={k}>
                  {TRACK_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <label>
            תקופה (שנים)
            <input type="number" value={t.termYears} onChange={(e) => setTrack(i, { termYears: Number(e.target.value) })} />
          </label>
          {VARIABLE_TRACKS.has(t.type) && (
            <label>
              משתנה כל
              <input type="number" value={t.changeEveryYears ?? ''} onChange={(e) => setTrack(i, { changeEveryYears: optNum(e.target.value) })} />
            </label>
          )}
          {t.type === 'prime' ? (
            <label>
              מרווח מהפריים (%)
              <input type="number" step="0.01" value={t.primeMargin ?? ''} onChange={(e) => setTrack(i, { primeMargin: optNum(e.target.value) })} />
            </label>
          ) : (
            <label>
              ריבית (%)
              <input type="number" step="0.01" value={t.rate ?? ''} onChange={(e) => setTrack(i, { rate: optNum(e.target.value) })} />
            </label>
          )}
          <label>
            סכום (₪)
            <input type="number" value={t.amount ?? ''} onChange={(e) => setTrack(i, { amount: optNum(e.target.value) })} />
          </label>
          <button className="remove" onClick={() => setTracks((ts) => ts.filter((_, j) => j !== i))} aria-label="הסר">
            ✕
          </button>
        </div>
      ))}
      <button className="add" onClick={() => setTracks((ts) => [...ts, { type: 'fixed_unlinked', termYears: 20 }])}>
        + מסלול
      </button>
      {error && <div className="notice warn">{error}</div>}
      <div className="toolbar">
        <button className="primary" onClick={save}>
          שמירת רשומה
        </button>
      </div>
    </div>
  );
}
