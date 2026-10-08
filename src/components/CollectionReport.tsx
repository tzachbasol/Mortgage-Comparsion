import { useEffect, useMemo, useState } from 'react';
import { fmtPct, fmtSigned } from '../lib/storage';
import { COLLECTOR_LABELS, buildAlerts, categoryMedians, groupRuns, type DayRun, type RunLog } from '../lib/report';
import { SOURCE_KIND_LABELS, TRACK_LABELS, offerDateOf, type OfferRecord, type RecordTrack, type TrackType } from '../lib/types';
import { OFFER_WINDOW_DAYS } from '../lib/validate';

interface Props {
  /** Records from the repo only: the report describes the shared database, not this browser's local records. */
  records: OfferRecord[];
  primeRate: number;
  goToRecords: () => void;
}

const RUN_STATUS: Record<string, [string, string]> = { ok: ['הושלם', 'ok'], partial: ['הושלם חלקית', 'warn'], blocked: ['נחסם', 'bad'] };
const SOURCE_STATUS: Record<string, [string, string]> = { ok: ['תקין', 'ok'], partial: ['חלקי', 'warn'], blocked: ['חסום', 'bad'], error: ['שגיאה', 'bad'] };

const fmtDate = (iso?: string) => (iso ? iso.split('-').reverse().join('/') : '—');
const todayIso = () => new Date().toISOString().slice(0, 10);
const fmtValue = (type: TrackType, v: number) => (type === 'prime' ? `P${fmtSigned(v)}` : fmtPct(v));
const trackText = (t: RecordTrack) =>
  `${TRACK_LABELS[t.type]}${t.changeEveryYears ? ` (כל ${t.changeEveryYears})` : ''} · ${t.termYears} שנים · ${
    t.type === 'prime' && t.primeMargin !== undefined ? `P${fmtSigned(t.primeMargin)}` : t.rate !== undefined ? fmtPct(t.rate) : '—'
  }`;

function Chip({ map, value }: { map: Record<string, [string, string]>; value: string }) {
  const [label, cls] = map[value] ?? [value, 'warn'];
  return <span className={`chip ${cls}`}>{label}</span>;
}

function RecordsTable({ records }: { records: OfferRecord[] }) {
  return (
    <div className="scroll">
      <table>
        <thead>
          <tr>
            <th>ההצעה ניתנה</th>
            <th>מקור</th>
            <th>בנק</th>
            <th>מסלולים</th>
            <th>קישור</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={r.id}>
              <td className="num">{fmtDate(offerDateOf(r))}</td>
              <td>
                <span className="badge">{SOURCE_KIND_LABELS[r.source.kind]}</span> {r.source.channel}
                {r.needsReview && <span className="badge review">ממתינה לבדיקה</span>}
              </td>
              <td>{r.bank ?? '—'}</td>
              <td>
                {r.tracks.map((t, i) => (
                  <div key={i} className="nowrap">
                    {trackText(t)}
                  </div>
                ))}
              </td>
              <td>
                {r.source.url ? (
                  <a href={r.source.url} target="_blank" rel="noreferrer">
                    לפוסט
                  </a>
                ) : (
                  <span className="muted">אין קישור</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LatestRun({ day, records }: { day: DayRun; records: OfferRecord[] }) {
  const added = records.filter((r) => day.added.includes(r.id));
  const scanned = day.sources.reduce((s, x) => s + (x.postsScanned ?? 0), 0);
  return (
    <>
      <div className="card">
        <div className="run-head">
          <div>
            <small>ריצה אחרונה</small>
            <h3>{fmtDate(day.runDate)}</h3>
            <div className="muted">
              {day.collectors.map((c) => COLLECTOR_LABELS[c]).join(' + ')}
              {day.windowStart && <> · חלון איסוף: הצעות מ־{fmtDate(day.windowStart)}</>}
            </div>
          </div>
          <Chip map={RUN_STATUS} value={day.status} />
        </div>
        <dl className="stats">
          <div>
            <dt>רשומות חדשות</dt>
            <dd>{added.length}</dd>
          </div>
          <div>
            <dt>פוסטים שנסרקו</dt>
            <dd>{scanned}</dd>
          </div>
          <div>
            <dt>נדחו</dt>
            <dd>{day.rejected.length}</dd>
          </div>
          <div>
            <dt>סה"כ במאגר</dt>
            <dd>{records.length}</dd>
          </div>
        </dl>
        {day.notes.map((n, i) => (
          <div key={i} className="notice">
            <b>{COLLECTOR_LABELS[n.collector]}:</b> {n.text}
          </div>
        ))}
        {day.links.length > 0 && (
          <div className="toolbar">
            {day.links.map((u) => (
              <a key={u} href={u} target="_blank" rel="noreferrer">
                לענף ב־GitHub
              </a>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h3>ממצאים חדשים</h3>
        {added.length ? <RecordsTable records={added} /> : <p className="muted">לא נוספו רשומות בריצה הזו.</p>}
      </div>

      <div className="card">
        <h3>מקורות שנסרקו</h3>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>מקור</th>
                <th>איסוף</th>
                <th>מצב</th>
                <th>פוסטים</th>
                <th>הצעות</th>
                <th>הערה</th>
              </tr>
            </thead>
            <tbody>
              {day.sources.map((s, i) => (
                <tr key={i}>
                  <td>
                    {s.url ? (
                      <a href={s.url} target="_blank" rel="noreferrer">
                        {s.name}
                      </a>
                    ) : (
                      s.name
                    )}
                  </td>
                  <td>{COLLECTOR_LABELS[s.collector]}</td>
                  <td>
                    <Chip map={SOURCE_STATUS} value={s.status} />
                  </td>
                  <td className="num">{s.postsScanned ?? 0}</td>
                  <td className="num">{s.offersFound ?? 0}</td>
                  <td className="muted">{s.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {day.rejected.length > 0 && (
        <div className="card">
          <h3>נדחו ({day.rejected.length})</h3>
          <ul className="rejected">
            {day.rejected.map((x, i) => (
              <li key={i}>
                {x.url && (
                  <a href={x.url} target="_blank" rel="noreferrer">
                    {x.url}
                  </a>
                )}{' '}
                <span className="muted">
                  ({COLLECTOR_LABELS[x.collector]}) {x.reason}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

export default function CollectionReport({ records, primeRate, goToRecords }: Props) {
  const [logs, setLogs] = useState<RunLog[] | null>(null);
  useEffect(() => {
    fetch('data/runs.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : []))
      .then((x: RunLog[]) => setLogs(Array.isArray(x) ? x : []))
      .catch(() => setLogs([]));
  }, []);

  const days = useMemo(() => groupRuns(logs ?? []), [logs]);
  const latest = days[0];
  const alerts = useMemo(() => (logs ? buildAlerts(days, records, todayIso()) : []), [logs, days, records]);
  const medians = useMemo(
    () => (latest ? categoryMedians(records, latest.runDate, days[1]?.runDate, primeRate) : []),
    [records, latest, days, primeRate],
  );
  const active = records.filter((r) => !r.excluded);
  const byKind = (kind: OfferRecord['source']['kind']) => active.filter((r) => r.source.kind === kind).length;

  if (logs === null) return <p className="muted">טוען את יומני הריצה…</p>;

  return (
    <section className="report">
      <div className="card">
        <h3>דוח איסוף</h3>
        <p className="muted">
          כל יום ב־17:00 משימה במחשב אוספת הצעות מקבוצות פייסבוק, וב־18:30 רוטינה בענן סורקת פורומים. כל ריצה נשמרת ביומן בריפו, וכל רשומה עוברת בדיקה
          אוטומטית לפני שהיא נכנסת למאגר. הדף מתעדכן לבד אחרי כל מיזוג.
        </p>
        <p>
          במאגר {active.length} רשומות פעילות: {byKind('facebook_post')} מפייסבוק, {byKind('forum_post')} מפורומים.{' '}
          <button className="link" onClick={goToRecords}>
            לכל הרשומות
          </button>
        </p>
      </div>

      {alerts.length > 0 && (
        <div className="card">
          <h3>דורש תשומת לב</h3>
          {alerts.map((a, i) => (
            <div key={i} className={`notice ${a.level === 'info' ? 'info' : ''}`}>
              {a.text}
            </div>
          ))}
        </div>
      )}

      {latest ? <LatestRun day={latest} records={records} /> : <div className="notice warn">עוד לא נשמר אף יומן ריצה.</div>}

      <div className="card">
        <h3>חציון לפי קטגוריה, {OFFER_WINDOW_DAYS} הימים האחרונים</h3>
        {medians.length ? (
          <>
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th>מסלול</th>
                    <th>תקופה (שנים)</th>
                    <th>רשומות</th>
                    <th>חציון</th>
                    <th>שינוי מהריצה הקודמת</th>
                  </tr>
                </thead>
                <tbody>
                  {medians.map((m) => {
                    const delta = m.previous === undefined ? undefined : m.median - m.previous;
                    return (
                      <tr key={m.key}>
                        <td>{TRACK_LABELS[m.type]}</td>
                        <td className="num">{m.bucket}</td>
                        <td className={`num ${m.count < 3 ? 'bad' : ''}`}>{m.count}</td>
                        <td className="num">{fmtValue(m.type, m.median)}</td>
                        <td className="num">
                          {delta === undefined ? (
                            <span className="muted">חדש</span>
                          ) : (
                            <span className={delta < 0 ? 'ok' : delta > 0 ? 'bad' : 'muted'}>{fmtSigned(delta)}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="muted">
              פחות מ־3 רשומות מסומן באדום: החציון לא אמין. כולל רק רשומות מאושרות, בלי רשומות מוחרגות או ממתינות לבדיקה.
            </p>
          </>
        ) : (
          <p className="muted">אין רשומות מאושרות מ־{OFFER_WINDOW_DAYS} הימים האחרונים.</p>
        )}
      </div>

      {days.length > 1 && (
        <div className="card">
          <h3>ריצות קודמות</h3>
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>תאריך</th>
                  <th>איסוף</th>
                  <th>מצב</th>
                  <th>חדשות</th>
                  <th>נדחו</th>
                  <th>קישור</th>
                </tr>
              </thead>
              <tbody>
                {days.slice(1).map((d) => (
                  <tr key={d.runDate}>
                    <td className="num">{fmtDate(d.runDate)}</td>
                    <td>{d.collectors.map((c) => COLLECTOR_LABELS[c]).join(' + ')}</td>
                    <td>
                      <Chip map={RUN_STATUS} value={d.status} />
                    </td>
                    <td className="num">{d.added.length}</td>
                    <td className="num">{d.rejected.length}</td>
                    <td>
                      {d.links.length
                        ? d.links.map((u) => (
                            <a key={u} href={u} target="_blank" rel="noreferrer">
                              ענף{' '}
                            </a>
                          ))
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
