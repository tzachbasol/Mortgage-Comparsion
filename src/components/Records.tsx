import { Fragment, useMemo, useState } from 'react';
import { downloadJson, fmtPct, fmtSigned } from '../lib/storage';
import { OFFER_STAGE_LABELS, SOURCE_KIND_LABELS, TRACK_LABELS, offerDateOf, type OfferRecord, type RecordTrack, type SourceKind, type TrackType } from '../lib/types';
import { validateRecord } from '../lib/validate';
import RecordForm from './RecordForm';

interface Props {
  records: OfferRecord[];
  localRecords: OfferRecord[];
  setLocalRecords: (r: OfferRecord[] | ((p: OfferRecord[]) => OfferRecord[])) => void;
  includeDemo: boolean;
}

export default function Records({ records, localRecords, setLocalRecords, includeDemo }: Props) {
  const [adding, setAdding] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const visible = records.filter((r) => r.origin !== 'demo' || includeDemo);

  const onImport = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      const list: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
      const ok: OfferRecord[] = [];
      const errors: string[] = [];
      list.forEach((r, i) => {
        const err = validateRecord(r);
        if (err) errors.push(`רשומה ${i + 1}: ${err}`);
        else ok.push({ ...(r as OfferRecord), origin: 'local' });
      });
      setLocalRecords((prev) => [...prev.filter((p) => !ok.some((o) => o.id === p.id)), ...ok]);
      setImportMsg(`יובאו ${ok.length} רשומות.${errors.length ? ' שגיאות: ' + errors.join('; ') : ''}`);
    } catch (e) {
      setImportMsg(`קובץ לא תקין: ${(e as Error).message}`);
    }
  };

  const exportable = (rs: OfferRecord[]) => rs.map(({ origin: _origin, ...r }) => r);

  return (
    <section>
      <div className="card">
        <h3>ניהול המאגר</h3>
        <p className="muted">
          רשומות שמוסיפים כאן נשמרות רק בדפדפן הזה. כדי שיופיעו לכולם, ייצאו אותן והוסיפו את הקובץ ל־
          <code>public/data/records.json</code> בריפו (ראו README).
        </p>
        <div className="toolbar">
          <button onClick={() => setAdding(!adding)}>{adding ? 'סגור טופס' : '+ הוספת רשומה מפוסט / צילום'}</button>
          <button onClick={() => downloadJson('local-records.json', exportable(localRecords))} disabled={!localRecords.length}>
            ייצוא רשומות מקומיות ({localRecords.length})
          </button>
          <button onClick={() => downloadJson('records.json', exportable(records.filter((r) => r.origin !== 'demo')))}>ייצוא כל הרשומות האמיתיות</button>
          <label className="file">
            ייבוא JSON
            <input type="file" accept="application/json" onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
          </label>
        </div>
        {importMsg && <div className="notice">{importMsg}</div>}
        {adding && (
          <RecordForm
            onSave={(r) => {
              setLocalRecords((prev) => [...prev, r]);
              setAdding(false);
            }}
          />
        )}
      </div>

      {visible.length === 0 ? (
        <div className="notice warn">אין עדיין רשומות במאגר.</div>
      ) : (
        <RecordsTable records={visible} onDeleteLocal={(id) => setLocalRecords((p) => p.filter((x) => x.id !== id))} />
      )}
    </section>
  );
}

type StatusFilter = 'all' | 'active' | 'review' | 'excluded' | 'local';
const STATUS_FILTERS: Record<StatusFilter, string> = {
  all: 'הכול',
  active: 'פעילות',
  review: 'ממתינות לבדיקה',
  excluded: 'מוחרגות',
  local: 'מקומיות (הדפדפן הזה)',
};

const trackValueText = (t: RecordTrack) =>
  t.type === 'prime' && t.primeMargin !== undefined ? `P${fmtSigned(t.primeMargin)}` : t.rate !== undefined ? fmtPct(t.rate) : '—';

const matchesStatus = (r: OfferRecord, status: StatusFilter) => {
  switch (status) {
    case 'active':
      return !r.excluded && !r.needsReview;
    case 'review':
      return !!r.needsReview;
    case 'excluded':
      return !!r.excluded;
    case 'local':
      return r.origin === 'local';
    default:
      return true;
  }
};

function RecordsTable({ records, onDeleteLocal }: { records: OfferRecord[]; onDeleteLocal: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [bank, setBank] = useState('');
  const [track, setTrack] = useState<TrackType | ''>('');
  const [kind, setKind] = useState<SourceKind | ''>('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [open, setOpen] = useState<string | null>(null);

  const banks = useMemo(() => [...new Set(records.map((r) => r.bank).filter((b): b is string => !!b))].sort(), [records]);
  const kinds = useMemo(() => [...new Set(records.map((r) => r.source.kind))], [records]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return records
      .filter((r) => !bank || r.bank === bank)
      .filter((r) => !track || r.tracks.some((t) => t.type === track))
      .filter((r) => !kind || r.source.kind === kind)
      .filter((r) => matchesStatus(r, status))
      .filter((r) => !q || [r.id, r.bank, r.source.channel, r.source.quote, r.notes].some((s) => s?.toLowerCase().includes(q)))
      .sort((a, b) => offerDateOf(b).localeCompare(offerDateOf(a)));
  }, [records, query, bank, track, kind, status]);
  const key = (r: OfferRecord) => `${r.origin}-${r.id}`;

  return (
    <div className="card">
      <div className="filters">
        <label>
          חיפוש
          <input type="search" value={query} placeholder="בנק, קבוצה, ציטוט…" onChange={(e) => setQuery(e.target.value)} />
        </label>
        <label>
          בנק
          <select value={bank} onChange={(e) => setBank(e.target.value)}>
            <option value="">כל הבנקים</option>
            {banks.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </label>
        <label>
          מסלול
          <select value={track} onChange={(e) => setTrack(e.target.value as TrackType | '')}>
            <option value="">כל המסלולים</option>
            {(Object.keys(TRACK_LABELS) as TrackType[]).map((t) => (
              <option key={t} value={t}>
                {TRACK_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label>
          מקור
          <select value={kind} onChange={(e) => setKind(e.target.value as SourceKind | '')}>
            <option value="">כל המקורות</option>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {SOURCE_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <label>
          מצב
          <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
            {(Object.keys(STATUS_FILTERS) as StatusFilter[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_FILTERS[s]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted">
        {rows.length} מתוך {records.length} רשומות. לחיצה על שורה פותחת את הפרטים.
      </p>
      <div className="scroll">
        <table className="records-table">
          <thead>
            <tr>
              <th>ההצעה ניתנה</th>
              <th>בנק</th>
              <th>שלב</th>
              <th>מסלולים</th>
              <th>מקור</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isOpen = open === key(r);
              return (
                <Fragment key={key(r)}>
                  <tr
                    className={`row-toggle${r.origin === 'demo' ? ' demo-row' : ''}${r.excluded ? ' excluded-row' : ''}`}
                    onClick={() => setOpen(isOpen ? null : key(r))}
                    aria-expanded={isOpen}
                  >
                    <td className="num">{offerDateOf(r)}</td>
                    <td>
                      {r.bank ?? 'בנק לא ידוע'}
                      {r.origin === 'local' && <span className="badge">מקומי</span>}
                      {r.origin === 'demo' && <span className="badge demo">דמו</span>}
                      {r.excluded && <span className="badge demo">מוחרגת</span>}
                      {r.needsReview && <span className="badge review">לבדיקה</span>}
                    </td>
                    <td>{OFFER_STAGE_LABELS[r.stage]}</td>
                    <td>
                      {r.tracks.map((t, i) => (
                        <span key={i} className="track-pill">
                          {TRACK_LABELS[t.type].split(' (')[0]} {t.termYears} · <b>{trackValueText(t)}</b>
                        </span>
                      ))}
                    </td>
                    <td className="muted">{r.source.channel}</td>
                  </tr>
                  {isOpen && (
                    <tr className="row-detail">
                      <td colSpan={5}>
                        <RecordDetail record={r} onDeleteLocal={onDeleteLocal} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RecordDetail({ record: r, onDeleteLocal }: { record: OfferRecord; onDeleteLocal: (id: string) => void }) {
  return (
    <div className="record">
      <div className="muted">
        {SOURCE_KIND_LABELS[r.source.kind]} ·{' '}
        {r.source.url ? (
          <a href={r.source.url} target="_blank" rel="noreferrer">
            {r.source.channel}
          </a>
        ) : (
          r.source.channel
        )}
        {r.source.authorLabel && <> · {r.source.authorLabel}</>} · פורסם {r.source.postedAt} · הוזן {r.source.collectedAt}
        {r.source.collectedBy && <> ע"י {r.source.collectedBy}</>} · <code>{r.id}</code>
      </div>
      {r.excluded && <div className="notice">מוחרגת: {r.excluded.reason}</div>}
      {r.needsReview && <div className="notice">ממתינה לבדיקה: {r.needsReview.reason}</div>}
      <ul>
        {r.tracks.map((t, i) => (
          <li key={i}>
            {TRACK_LABELS[t.type]}
            {t.changeEveryYears && <> (כל {t.changeEveryYears})</>} · {t.termYears} שנים · {trackValueText(t)}
            {t.amount ? <> · ₪{t.amount.toLocaleString('he-IL')}</> : null}
          </li>
        ))}
      </ul>
      {r.loanAmount ? <div>סכום הלוואה: ₪{r.loanAmount.toLocaleString('he-IL')}</div> : null}
      {r.source.quote && <q>{r.source.quote}</q>}
      {r.notes && <p className="muted">{r.notes}</p>}
      {r.source.screenshot && (
        <a href={r.source.screenshot} target="_blank" rel="noreferrer">
          <img className="thumb" src={r.source.screenshot} alt="צילום ההצעה" />
        </a>
      )}
      {r.origin === 'local' && (
        <button className="link danger" onClick={() => onDeleteLocal(r.id)}>
          מחק רשומה מקומית
        </button>
      )}
    </div>
  );
}
