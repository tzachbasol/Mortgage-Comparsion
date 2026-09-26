import { amortize, sumResults } from '../lib/calc';
import type { EvaluatedMix } from '../lib/evaluate';
import { fmtMoney, fmtPct, uid, usePersistentState } from '../lib/storage';
import { TRACK_LABELS, type CurrentTrack, type EconomicAssumptions, type TrackType } from '../lib/types';

interface Props {
  current: CurrentTrack[];
  setCurrent: (c: CurrentTrack[] | ((p: CurrentTrack[]) => CurrentTrack[])) => void;
  evaluated: EvaluatedMix;
  assumptions: EconomicAssumptions;
  goToBuilder: () => void;
  scaleMixTo: (principal: number) => void;
}

export default function Compare({ current, setCurrent, evaluated, assumptions, goToBuilder, scaleMixTo }: Props) {
  const [costs, setCosts] = usePersistentState('refinanceCosts', { earlyRepaymentFee: 0, otherCosts: 0 });
  const update = (id: string, patch: Partial<CurrentTrack>) =>
    setCurrent((c) => c.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const currentTotals = sumResults(
    current.map((t) => ({
      principal: t.remainingBalance,
      rate: t.rate,
      result: amortize(t.remainingBalance, t.rate, t.remainingMonths, t.type, assumptions.inflation),
    })),
  );
  const proposed = evaluated.totals;
  const extraCosts = costs.earlyRepaymentFee + costs.otherCosts;
  const monthlySaving = currentTotals.firstPayment - proposed.firstPayment;
  const totalSaving = currentTotals.totalPaid - proposed.totalPaid - extraCosts;
  const principalGap = proposed.principal - currentTotals.principal;

  const rows: [string, number, number, (n: number) => string][] = [
    ['יתרת קרן', currentTotals.principal, proposed.principal, fmtMoney],
    ['ריבית משוקללת', currentTotals.weightedRate, proposed.weightedRate, (n) => fmtPct(n)],
    ['החזר חודשי ראשון', currentTotals.firstPayment, proposed.firstPayment, fmtMoney],
    ['החזר חודשי מקסימלי (צפוי)', currentTotals.maxPayment, proposed.maxPayment, fmtMoney],
    ['סה"כ תשלומים עד הסוף', currentTotals.totalPaid, proposed.totalPaid, fmtMoney],
    ['ריבית + הצמדה', currentTotals.totalInterestAndIndexation, proposed.totalInterestAndIndexation, fmtMoney],
  ];

  return (
    <section>
      <div className="card">
        <h3>המשכנתא הנוכחית שלי</h3>
        <p className="muted">הזן את נתוני המסלולים כפי שהם מופיעים בדוח היתרות מהבנק.</p>
        {current.map((t) => (
          <div className="track-fields" key={t.id}>
            <label>
              סוג מסלול
              <select value={t.type} onChange={(e) => update(t.id, { type: e.target.value as TrackType })}>
                {(Object.keys(TRACK_LABELS) as TrackType[]).map((k) => (
                  <option key={k} value={k}>
                    {TRACK_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              יתרה לסילוק (₪)
              <input type="number" step={1000} value={t.remainingBalance} onChange={(e) => update(t.id, { remainingBalance: Number(e.target.value) })} />
            </label>
            <label>
              חודשים שנותרו
              <input type="number" value={t.remainingMonths} onChange={(e) => update(t.id, { remainingMonths: Number(e.target.value) })} />
            </label>
            <label>
              ריבית כוללת נוכחית (%)
              <input type="number" step="0.01" value={t.rate} onChange={(e) => update(t.id, { rate: Number(e.target.value) })} />
              {t.type === 'prime' && <small>פריים + מרווח, למשל {fmtPct(assumptions.primeRate - 0.5)}</small>}
            </label>
            <button className="remove" onClick={() => setCurrent((c) => c.filter((x) => x.id !== t.id))} aria-label="הסר">
              ✕
            </button>
          </div>
        ))}
        <button
          className="add"
          onClick={() => setCurrent((c) => [...c, { id: uid(), type: 'prime', remainingBalance: 300000, remainingMonths: 240, rate: assumptions.primeRate - 0.5 }])}
        >
          + הוסף מסלול קיים
        </button>

        <div className="grid">
          <label>
            עמלת פירעון מוקדם (₪)
            <input type="number" value={costs.earlyRepaymentFee} onChange={(e) => setCosts({ ...costs, earlyRepaymentFee: Number(e.target.value) })} />
            <small>לפי דוח היתרות / הבנק</small>
          </label>
          <label>
            עלויות נוספות (שמאות, פתיחת תיק, יועץ) (₪)
            <input type="number" value={costs.otherCosts} onChange={(e) => setCosts({ ...costs, otherCosts: Number(e.target.value) })} />
          </label>
        </div>
      </div>

      <div className="card">
        <h3>
          השוואה לתמהיל שבנית <button className="link" onClick={goToBuilder}>(עריכת התמהיל)</button>
        </h3>
        {evaluated.missingRates > 0 && (
          <div className="notice warn">בתמהיל המוצע יש {evaluated.missingRates} מסלולים ללא ריבית. הם לא נכללים בהשוואה.</div>
        )}
        {current.length > 0 && Math.abs(principalGap) > 1000 && (
          <div className="notice">
            הקרן בתמהיל המוצע {principalGap > 0 ? 'גבוהה' : 'נמוכה'} ב־{fmtMoney(Math.abs(principalGap))} מהיתרה הנוכחית, ולכן ההשוואה לא מדויקת.
            כדי להשוות מיחזור, התאם את הסכומים בתמהיל ליתרה.{' '}
            <button className="link" onClick={() => scaleMixTo(currentTotals.principal)}>
              התאם את התמהיל ליתרה (שומר על היחסים)
            </button>
          </div>
        )}
        <table className="compare">
          <thead>
            <tr>
              <th></th>
              <th>נוכחית</th>
              <th>מוצעת</th>
              <th>הפרש</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, a, b, f]) => (
              <tr key={label}>
                <td>{label}</td>
                <td>{f(a)}</td>
                <td>{f(b)}</td>
                <td className={b < a ? 'ok' : b > a ? 'bad' : ''}>{f(b - a)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {current.length > 0 && (
          <div className="verdict">
            <div>
              חיסכון חודשי: <b className={monthlySaving >= 0 ? 'ok' : 'bad'}>{fmtMoney(monthlySaving)}</b>
            </div>
            <div>
              חיסכון כולל אחרי עלויות מיחזור ({fmtMoney(extraCosts)}): <b className={totalSaving >= 0 ? 'ok' : 'bad'}>{fmtMoney(totalSaving)}</b>
            </div>
            {monthlySaving > 0 && extraCosts > 0 && <div>נקודת איזון: כ־{Math.ceil(extraCosts / monthlySaving)} חודשים</div>}
          </div>
        )}
        <h4>בסיס הריביות בתמהיל המוצע</h4>
        <ul className="basis-list">
          {evaluated.tracks.map((t) => (
            <li key={t.track.id}>
              {TRACK_LABELS[t.track.type]} {t.track.termYears} שנים ({fmtMoney(t.track.amount)}):{' '}
              {t.rateSource === 'records' && <>חציון של {t.stats!.count} רשומות, {fmtPct(t.totalRate!)}</>}
              {t.rateSource === 'manual' && <>ריבית ידנית {fmtPct(t.totalRate!)} (לא מבוססת על רשומות)</>}
              {t.rateSource === 'none' && <>אין ריבית</>}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
