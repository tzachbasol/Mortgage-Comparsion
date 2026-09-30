import { useState } from 'react';
import { downloadJson, fmtPct, fmtSigned } from '../lib/storage';
import { OFFER_STAGE_LABELS, SOURCE_KIND_LABELS, TRACK_LABELS, offerDateOf, type OfferRecord } from '../lib/types';
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

      {visible.length === 0 && <div className="notice warn">אין עדיין רשומות במאגר.</div>}
      {visible.map((r) => (
        <article key={`${r.origin}-${r.id}`} className={`card record ${r.origin === 'demo' ? 'demo-row' : ''}`}>
          <header>
            <b>{r.bank ?? 'בנק לא ידוע'}</b> · {OFFER_STAGE_LABELS[r.stage]} · הצעה מ־{offerDateOf(r)} · פורסם {r.source.postedAt}
            {r.origin === 'local' && <span className="badge">מקומי</span>}
            {r.origin === 'demo' && <span className="badge demo">דמו – לא אמיתי</span>}
            {r.excluded && <span className="badge demo">מוחרגת: {r.excluded.reason}</span>}
            {r.origin === 'local' && (
              <button className="link danger" onClick={() => setLocalRecords((p) => p.filter((x) => x.id !== r.id))}>
                מחק
              </button>
            )}
          </header>
          <div className="muted">
            {SOURCE_KIND_LABELS[r.source.kind]} ·{' '}
            {r.source.url ? (
              <a href={r.source.url} target="_blank" rel="noreferrer">
                {r.source.channel}
              </a>
            ) : (
              r.source.channel
            )}
            {r.source.authorLabel && <> · {r.source.authorLabel}</>} · הוזן {r.source.collectedAt}
            {r.source.collectedBy && <> ע"י {r.source.collectedBy}</>}
          </div>
          <ul>
            {r.tracks.map((t, i) => (
              <li key={i}>
                {TRACK_LABELS[t.type]}
                {t.changeEveryYears && <> (כל {t.changeEveryYears})</>} · {t.termYears} שנים ·{' '}
                {t.type === 'prime' && t.primeMargin !== undefined ? `P${fmtSigned(t.primeMargin)}` : t.rate !== undefined ? fmtPct(t.rate) : '—'}
                {t.amount ? <> · ₪{t.amount.toLocaleString('he-IL')}</> : null}
              </li>
            ))}
          </ul>
          {r.source.quote && <q>{r.source.quote}</q>}
          {r.notes && <p className="muted">{r.notes}</p>}
          {r.source.screenshot && (
            <a href={r.source.screenshot} target="_blank" rel="noreferrer">
              <img className="thumb" src={r.source.screenshot} alt="צילום ההצעה" />
            </a>
          )}
        </article>
      ))}
    </section>
  );
}
