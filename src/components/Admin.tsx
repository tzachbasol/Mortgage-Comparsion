import { useMemo, useState } from 'react';
import { ADMIN_HASH, checkPassword } from '../lib/admin';
import { buildCategories, describeTrack, isReal, summarize, type CoverageEntry } from '../lib/coverage';
import type { EvaluatedMix } from '../lib/evaluate';
import { stats } from '../lib/match';
import { fmtPct, fmtSigned } from '../lib/storage';
import { SOURCE_KIND_LABELS, TRACK_LABELS, offerDateOf, type EconomicAssumptions, type OfferRecord, type SourceKind } from '../lib/types';

interface Props {
  records: OfferRecord[];
  evaluated: EvaluatedMix;
  assumptions: EconomicAssumptions;
}

const SESSION_KEY = 'adminUnlocked';

function readUnlocked(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === ADMIN_HASH && !!ADMIN_HASH;
  } catch {
    return false;
  }
}

export default function Admin(props: Props) {
  const [unlocked, setUnlocked] = useState(readUnlocked);
  if (!ADMIN_HASH) return <SetupNotice />;
  if (!unlocked) return <Login onUnlock={() => setUnlocked(true)} />;
  return (
    <AdminView
      {...props}
      onLogout={() => {
        try {
          sessionStorage.removeItem(SESSION_KEY);
        } catch {
          // ignore
        }
        setUnlocked(false);
      }}
    />
  );
}

function SetupNotice() {
  return (
    <section className="card prose">
      <h3>אזור אדמין לא הוגדר</h3>
      <p>כדי להפעיל את האזור צריך להגדיר סיסמה:</p>
      <ol>
        <li>
          מריצים <code>npm run admin-hash -- "הסיסמה שלך"</code> ומעתיקים את המחרוזת שמתקבלת.
        </li>
        <li>
          בגיטהאב: Settings ← Secrets and variables ← Actions ← Variables, ויוצרים משתנה בשם <code>ADMIN_PASSWORD_HASH</code> עם
          המחרוזת.
        </li>
        <li>
          לפיתוח מקומי: יוצרים קובץ <code>.env.local</code> עם <code>VITE_ADMIN_PASSWORD_HASH=…</code>.
        </li>
      </ol>
    </section>
  );
}

function Login({ onUnlock }: { onUnlock: () => void }) {
  const [pw, setPw] = useState('');
  const [error, setError] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await checkPassword(pw)) {
      try {
        sessionStorage.setItem(SESSION_KEY, ADMIN_HASH);
      } catch {
        // ignore
      }
      onUnlock();
    } else {
      setError(true);
    }
  };
  return (
    <section className="card login">
      <h3>כניסת אדמין</h3>
      <form onSubmit={submit}>
        <label>
          סיסמה
          <input type="password" value={pw} onChange={(e) => (setPw(e.target.value), setError(false))} autoFocus />
        </label>
        <button className="primary" type="submit">
          כניסה
        </button>
        {error && <div className="notice warn">סיסמה שגויה</div>}
      </form>
    </section>
  );
}

function fmtValue(isPrime: boolean, v: number) {
  return isPrime ? `P${fmtSigned(v)}` : fmtPct(v);
}

function SourceLink({ record }: { record: OfferRecord }) {
  const s = record.source;
  return s.url ? (
    <a href={s.url} target="_blank" rel="noreferrer" className="src-link">
      {s.url}
    </a>
  ) : (
    <span className="bad">אין קישור{s.screenshot ? ' (יש צילום)' : s.quote ? ' (יש ציטוט)' : ''}</span>
  );
}

function EntriesTable({ entries, isPrime }: { entries: CoverageEntry[]; isPrime: boolean }) {
  return (
    <div className="sources">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>קישור למקור</th>
            <th>ערוץ</th>
            <th>סוג</th>
            <th>ההצעה ניתנה</th>
            <th>פורסם</th>
            <th>בנק</th>
            <th>תקופה</th>
            <th>{isPrime ? 'מרווח' : 'ריבית'}</th>
            <th>מזהה רשומה</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr key={`${e.record.id}-${i}`} className={e.record.origin === 'demo' ? 'demo-row' : ''}>
              <td>{i + 1}</td>
              <td>
                <SourceLink record={e.record} />
              </td>
              <td>{e.record.source.channel}</td>
              <td>{SOURCE_KIND_LABELS[e.record.source.kind]}</td>
              <td>
                {offerDateOf(e.record)}
                {e.record.offerDateBasis === 'post_date' && <div className="muted">לפי תאריך הפוסט</div>}
              </td>
              <td>{e.record.source.postedAt}</td>
              <td>{e.record.bank ?? '—'}</td>
              <td>{e.track.termYears}</td>
              <td>{fmtValue(isPrime, e.value)}</td>
              <td>
                <code>{e.record.id}</code>
                {e.record.origin === 'local' && <span className="badge">מקומי</span>}
                {e.record.origin === 'demo' && <span className="badge demo">דמו</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AdminView({ records, evaluated, assumptions, onLogout }: Props & { onLogout: () => void }) {
  const summary = useMemo(() => summarize(records), [records]);
  const categories = useMemo(() => buildCategories(records, assumptions.primeRate), [records, assumptions.primeRate]);
  const [open, setOpen] = useState<string | null>(null);

  return (
    <section>
      <div className="card">
        <div className="admin-head">
          <h3>ביקורת מקורות (אדמין)</h3>
          <button onClick={onLogout}>יציאה</button>
        </div>
        <div className="tiles">
          <Tile label="רשומות אמיתיות" value={summary.realRecords} />
          <Tile label="מסלולים ברשומות" value={summary.realTracks} />
          <Tile label="עם קישור למקור" value={summary.withUrl} />
          <Tile label="עם צילום מסך" value={summary.withScreenshot} />
          <Tile label="ערוצים שונים" value={summary.byChannel.length} />
          <Tile label="קטגוריות מכוסות" value={categories.length} />
        </div>
        <p className="muted">נתוני דמו לא נספרים כאן בשום מקרה.</p>
        {summary.realRecords > 0 && (
          <div className="grid">
            <div>
              <h4>לפי סוג מקור</h4>
              <ul>
                {(Object.entries(summary.byKind) as [SourceKind, number][]).map(([k, n]) => (
                  <li key={k}>
                    {SOURCE_KIND_LABELS[k]}: {n}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4>לפי ערוץ</h4>
              <ul>
                {summary.byChannel.map((c) => (
                  <li key={c.channel}>
                    {c.channel}: {c.count}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h3>על מה מבוסס התמהיל הנוכחי</h3>
        <p className="muted">לכל מסלול בתמהיל שבלשונית "בניית תמהיל": כל הרשומות שנכנסו לחישוב, עם קישור מדויק.</p>
        {evaluated.tracks.map((t) => {
          const isPrime = t.track.type === 'prime';
          const real = t.matches.filter((m) => isReal(m.record));
          const demo = t.matches.length - real.length;
          return (
            <div key={t.track.id} className="audit-track">
              <h4>
                {TRACK_LABELS[t.track.type]}, {describeTrack(t.track)}
              </h4>
              <div>
                {t.rateSource === 'records' && (
                  <>
                    ריבית בשימוש: <b>{fmtValue(isPrime, t.usedValue!)}</b>, חציון של {t.matches.length} רשומות ({real.length} אמיתיות
                    {demo > 0 && <span className="bad">, {demo} דמו</span>})
                  </>
                )}
                {t.rateSource === 'manual' && <span className="bad">ריבית ידנית {fmtValue(isPrime, t.usedValue!)}, לא מבוססת על רשומות</span>}
                {t.rateSource === 'none' && <span className="bad">אין רשומות תואמות</span>}
              </div>
              {t.matches.length > 0 && (
                <EntriesTable entries={t.matches.map((m) => ({ record: m.record, track: m.track, value: m.value }))} isPrime={isPrime} />
              )}
            </div>
          );
        })}
      </div>

      <div className="card">
        <h3>כל הקטגוריות במאגר</h3>
        <p className="muted">קטגוריה = סוג מסלול × טווח תקופה (× תדירות שינוי במסלול משתנה). רק רשומות אמיתיות.</p>
        {categories.length === 0 ? (
          <div className="notice warn">אין עדיין רשומות אמיתיות במאגר.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>מסלול</th>
                <th>תקופה</th>
                <th>רשומות</th>
                <th>ערוצים</th>
                <th>חציון</th>
                <th>טווח</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => {
                const isPrime = c.type === 'prime';
                const s = stats(c.entries.map((e) => e.value))!;
                const channels = new Set(c.entries.map((e) => e.record.source.channel)).size;
                return [
                  <tr key={c.key}>
                    <td>
                      {TRACK_LABELS[c.type]}
                      {c.changeEveryYears && <> (כל {c.changeEveryYears})</>}
                    </td>
                    <td>
                      {c.bucket[0]}–{c.bucket[1]}
                    </td>
                    <td className={s.count < 3 ? 'bad' : ''}>{s.count}</td>
                    <td>{channels}</td>
                    <td>{fmtValue(isPrime, s.median)}</td>
                    <td>
                      {fmtValue(isPrime, s.min)} – {fmtValue(isPrime, s.max)}
                    </td>
                    <td>
                      <button className="link" onClick={() => setOpen(open === c.key ? null : c.key)}>
                        {open === c.key ? 'הסתר' : 'קישורים'}
                      </button>
                    </td>
                  </tr>,
                  open === c.key && (
                    <tr key={`${c.key}-open`}>
                      <td colSpan={7}>
                        <EntriesTable entries={c.entries} isPrime={isPrime} />
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        )}
        <p className="muted">קטגוריה עם פחות מ־3 רשומות מסומנת באדום: החציון שלה לא אמין.</p>
      </div>

      {(summary.withoutUrl.length > 0 || summary.duplicateUrls.length > 0 || summary.excluded.length > 0) && (
        <div className="card">
          <h3>בעיות איכות</h3>
          {summary.withoutUrl.length > 0 && (
            <>
              <h4>רשומות בלי קישור ({summary.withoutUrl.length})</h4>
              <ul>
                {summary.withoutUrl.map((r) => (
                  <li key={r.id}>
                    <code>{r.id}</code>: {r.source.channel}, {r.source.postedAt}
                    {r.source.screenshot ? ', יש צילום' : r.source.quote ? ', יש ציטוט בלבד' : ''}
                  </li>
                ))}
              </ul>
            </>
          )}
          {summary.excluded.length > 0 && (
            <>
              <h4>רשומות מוחרגות ({summary.excluded.length})</h4>
              <p className="muted">נשמרות לתיעוד ולא נכנסות לשום חישוב.</p>
              <ul>
                {summary.excluded.map((r) => (
                  <li key={r.id}>
                    <SourceLink record={r} /> · <code>{r.id}</code>: {r.excluded!.reason}
                  </li>
                ))}
              </ul>
            </>
          )}
          {summary.duplicateUrls.length > 0 && (
            <>
              <h4>קישורים שמופיעים ביותר מרשומה אחת (חשד לכפילות)</h4>
              <ul>
                {summary.duplicateUrls.map((u) => (
                  <li key={u}>
                    <a href={u} target="_blank" rel="noreferrer">
                      {u}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="tile">
      <div className="tile-value">{value}</div>
      <div className="tile-label">{label}</div>
    </div>
  );
}
