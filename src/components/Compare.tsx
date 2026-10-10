import { useState } from 'react';
import { EMPTY_RESULT, amortize, sumResults } from '../lib/calc';
import type { EvaluatedMix } from '../lib/evaluate';
import { fmtMoney, fmtPct, uid, usePersistentState } from '../lib/storage';
import { LINKED_TRACKS, TRACK_LABELS, type CurrentTrack, type EconomicAssumptions, type TrackType } from '../lib/types';
import MoneyInput from './MoneyInput';

interface Props {
  current: CurrentTrack[];
  setCurrent: (c: CurrentTrack[] | ((p: CurrentTrack[]) => CurrentTrack[])) => void;
  /** Every mix from the builder, in tab order. */
  allEvaluated: EvaluatedMix[];
  /** The mix last edited in the builder; compared by default. */
  activeMix: number;
  assumptions: EconomicAssumptions;
  goToBuilder: (mix: number) => void;
  scaleMixTo: (principal: number, mix: number) => void;
}

const num = (v: string) => (v === '' ? 0 : Number(v));
const mixName = (i: number) => `תמהיל ${i + 1}`;

export default function Compare({ current, setCurrent, allEvaluated, activeMix, assumptions, goToBuilder, scaleMixTo }: Props) {
  const [costs, setCosts] = usePersistentState('refinanceCosts', { earlyRepaymentFee: 0, otherCosts: 0 });
  const [chosen, setChosen] = useState(activeMix);
  const which = allEvaluated[chosen] ? chosen : 0;
  const evaluated = allEvaluated[which];
  const update = (id: string, patch: Partial<CurrentTrack>) =>
    setCurrent((c) => c.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  // A track without a rate yet would otherwise be priced as an interest-free loan.
  const results = current.map((t) => (t.rate ? amortize(t.remainingBalance, t.rate, t.remainingMonths, t.type, assumptions.inflation) : { ...EMPTY_RESULT }));
  const currentTotals = sumResults(current.map((t, i) => ({ principal: t.remainingBalance, rate: t.rate, result: results[i] })));
  const proposed = evaluated.totals;
  const extraCosts = costs.earlyRepaymentFee + costs.otherCosts;
  const monthlySaving = currentTotals.firstPayment - proposed.firstPayment;
  const totalSaving = currentTotals.totalPaid - proposed.totalPaid - extraCosts;
  const principalGap = proposed.principal - currentTotals.principal;

  const rows: [string, number, number, (n: number) => string][] = [
    ['יתרת קרן', currentTotals.principal, proposed.principal, fmtMoney],
    ['ריבית משוקללת', currentTotals.weightedRate, proposed.weightedRate, (n) => fmtPct(n)],
    ['החזר חודשי', currentTotals.firstPayment, proposed.firstPayment, fmtMoney],
    ['החזר מקסימלי (צפוי)', currentTotals.maxPayment, proposed.maxPayment, fmtMoney],
    ['החזר ריבית', currentTotals.totalInterest, proposed.totalInterest, fmtMoney],
    ['החזר הצמדה למדד', currentTotals.totalIndexation, proposed.totalIndexation, fmtMoney],
    ['החזר בסוף תקופה', currentTotals.totalPaid, proposed.totalPaid, fmtMoney],
  ];

  return (
    <section>
      <h3 className="mix-summary-title">המשכנתא הנוכחית שלי</h3>
      <p className="muted center">הזן את המסלולים כפי שהם מופיעים בדוח היתרות מהבנק.</p>
      <div className="mix-panel mix-panel-current">
        <div className="mix-grid current-grid" role="table" aria-label="מסלולי המשכנתא הנוכחית">
          <div className="mix-row mix-head" role="row">
            <span role="columnheader" aria-label="מספר מסלול" />
            <span role="columnheader">יתרה לסילוק</span>
            <span role="columnheader">מסלול</span>
            <span role="columnheader">חודשים שנותרו</span>
            <span role="columnheader" title="ריבית כוללת נוכחית. בפריים: פריים + מרווח">
              ריבית כוללת ⓘ
            </span>
            <span role="columnheader" title="במסלולים צמודים החישוב משתמש באינפלציה מההגדרות המתקדמות במסך בניית התמהיל">
              מדד ⓘ
            </span>
            <span role="columnheader" className="res">
              החזר חודשי
            </span>
            <span role="columnheader" className="res">
              החזר כולל
            </span>
          </div>
          {current.map((t, i) => (
            <div className="mix-row" role="row" key={t.id}>
              <span role="cell" className="row-n">
                {i + 1}
              </span>
              <label role="cell" data-label="יתרה לסילוק">
                <MoneyInput
                  placeholder="הזן יתרה"
                  aria-label={`יתרה לסילוק במסלול ${i + 1}`}
                  value={t.remainingBalance}
                  onChange={(v) => update(t.id, { remainingBalance: v ?? 0 })}
                />
              </label>
              <label role="cell" data-label="מסלול">
                <select aria-label={`סוג מסלול ${i + 1}`} value={t.type} onChange={(e) => update(t.id, { type: e.target.value as TrackType })}>
                  {(Object.keys(TRACK_LABELS) as TrackType[]).map((k) => (
                    <option key={k} value={k}>
                      {TRACK_LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>
              <label role="cell" data-label="חודשים שנותרו">
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  placeholder="הזן"
                  aria-label={`חודשים שנותרו במסלול ${i + 1}`}
                  value={t.remainingMonths || ''}
                  onChange={(e) => update(t.id, { remainingMonths: num(e.target.value) })}
                />
              </label>
              <label role="cell" data-label="ריבית כוללת">
                <input
                  type="number"
                  step="0.01"
                  placeholder={t.type === 'prime' ? fmtPct(assumptions.primeRate - 0.5) : 'הזן'}
                  aria-label={`ריבית כוללת במסלול ${i + 1}`}
                  value={t.rate || ''}
                  onChange={(e) => update(t.id, { rate: num(e.target.value) })}
                />
              </label>
              <label role="cell" data-label="מדד">
                <input disabled value={LINKED_TRACKS.has(t.type) ? fmtPct(assumptions.inflation, 1) : '---'} aria-label="אינפלציה צפויה" />
              </label>
              <span role="cell" className="res" data-label="החזר חודשי">
                {results[i].firstPayment ? fmtMoney(results[i].firstPayment) : '—'}
              </span>
              <span role="cell" className="res" data-label="החזר כולל">
                {results[i].totalPaid ? fmtMoney(results[i].totalPaid) : '—'}
              </span>
            </div>
          ))}
          <div className="mix-row mix-foot" role="row">
            <span role="cell" className="foot-label">
              סה"כ {fmtMoney(currentTotals.principal)}
            </span>
            <span role="cell" className="res" data-label="החזר חודשי">
              {fmtMoney(currentTotals.firstPayment)}
            </span>
            <span role="cell" className="res" data-label="החזר כולל">
              {fmtMoney(currentTotals.totalPaid)}
            </span>
          </div>
        </div>
        <div className="track-actions">
          <button
            className="add-track"
            onClick={() => setCurrent((c) => [...c, { id: uid(), type: 'prime', remainingBalance: 0, remainingMonths: 240, rate: 0 }])}
          >
            לחץ כאן להוספת מסלול
          </button>
          <button className="remove-track" disabled={!current.length} onClick={() => setCurrent((c) => c.slice(0, -1))}>
            הסרת מסלול {current.length || ''}
          </button>
        </div>
        <div className="costs">
          <label>
            עמלת פירעון מוקדם
            <MoneyInput placeholder="לפי דוח היתרות" value={costs.earlyRepaymentFee} onChange={(v) => setCosts({ ...costs, earlyRepaymentFee: v ?? 0 })} />
          </label>
          <label>
            עלויות נוספות (שמאות, פתיחת תיק, יועץ)
            <MoneyInput placeholder="0" value={costs.otherCosts} onChange={(v) => setCosts({ ...costs, otherCosts: v ?? 0 })} />
          </label>
        </div>
      </div>

      <h3 className="mix-summary-title">השוואה לתמהיל שבנית</h3>
      <div className="mix-tabs compact center-tabs" role="tablist" aria-label="תמהיל להשוואה">
        {allEvaluated.map((e, i) => (
          <button
            key={i}
            role="tab"
            aria-selected={which === i}
            className={`mix-tab mix-tab-${i + 1}${which === i ? ' active' : ''}`}
            onClick={() => setChosen(i)}
            disabled={e.totals.principal === 0}
          >
            {mixName(i)}
          </button>
        ))}
      </div>
      <div className="mix-summary">
        {evaluated.missingRates > 0 && (
          <div className="notice warn">ב{mixName(which)} יש {evaluated.missingRates} מסלולים ללא ריבית. הם לא נכללים בהשוואה.</div>
        )}
        {current.length > 0 && Math.abs(principalGap) > 1000 && (
          <div className="notice">
            הקרן ב{mixName(which)} {principalGap > 0 ? 'גבוהה' : 'נמוכה'} ב־{fmtMoney(Math.abs(principalGap))} מהיתרה הנוכחית, ולכן ההשוואה לא מדויקת.{' '}
            <button className="link" onClick={() => scaleMixTo(currentTotals.principal, which)}>
              התאם את התמהיל ליתרה (שומר על היחסים)
            </button>
          </div>
        )}
        <div className="scroll">
          <table className="compare">
            <thead>
              <tr>
                <th />
                <th>נוכחית</th>
                <th>
                  <button className="link" onClick={() => goToBuilder(which)}>
                    {mixName(which)}
                  </button>
                </th>
                <th>הפרש</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, a, b, f]) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  <td className="num">{f(a)}</td>
                  <td className="num">{f(b)}</td>
                  <td className={`num ${b < a ? 'ok' : b > a ? 'bad' : ''}`}>{f(b - a)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
        <details className="basis">
          <summary>בסיס הריביות ב{mixName(which)}</summary>
          <ul className="basis-list">
            {evaluated.tracks.map((t) => (
              <li key={t.track.id}>
                {TRACK_LABELS[t.track.type]} {Math.round(t.track.termYears * 12)} חודשים ({fmtMoney(t.track.amount)}):{' '}
                {t.rateSource === 'records' && <>חציון של {t.stats!.count} רשומות, {fmtPct(t.totalRate!)}</>}
                {t.rateSource === 'manual' && <>ריבית ידנית {fmtPct(t.totalRate!)} (לא מבוססת על רשומות)</>}
                {t.rateSource === 'none' && <>אין ריבית</>}
              </li>
            ))}
          </ul>
        </details>
      </div>
    </section>
  );
}
