import type { EvaluatedMix } from '../lib/evaluate';
import { fmtMoney, fmtPct } from '../lib/storage';

export default function Totals({ title, evaluated }: { title: string; evaluated: EvaluatedMix }) {
  const t = evaluated.totals;
  return (
    <div className="totals card">
      <h3>{title}</h3>
      {evaluated.missingRates > 0 && (
        <div className="notice warn">{evaluated.missingRates} מסלולים ללא ריבית אינם נכללים בסיכום.</div>
      )}
      <dl>
        <dt>סכום הלוואה</dt>
        <dd>{fmtMoney(t.principal)}</dd>
        <dt>ריבית משוקללת</dt>
        <dd>{fmtPct(t.weightedRate)}</dd>
        <dt>החזר חודשי ראשון</dt>
        <dd>{fmtMoney(t.firstPayment)}</dd>
        <dt>סה"כ תשלומים</dt>
        <dd>{fmtMoney(t.totalPaid)}</dd>
        <dt>ריבית + הצמדה</dt>
        <dd>{fmtMoney(t.totalInterestAndIndexation)}</dd>
        <dt>החזר לכל שקל</dt>
        <dd>{t.principal ? (t.totalPaid / t.principal).toFixed(2) : '—'}</dd>
      </dl>
      <p className="muted">
        בהנחה שהריבית (כולל הפריים) נשארת קבועה לאורך כל התקופה, ושהאינפלציה במסלולים הצמודים כפי שהוזנה. ההחזר החודשי
        במסלולים צמודים גדל עם המדד.
      </p>
    </div>
  );
}
