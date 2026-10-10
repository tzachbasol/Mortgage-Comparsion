import { Fragment, useState } from 'react';
import type { EvaluatedMix, EvaluatedTrack } from '../lib/evaluate';
import { fmtMoney, fmtPct, fmtSigned, uid } from '../lib/storage';
import {
  LINKED_TRACKS,
  OFFER_STAGE_LABELS,
  REPAYMENT_LABELS,
  TRACK_LABELS,
  VARIABLE_TRACKS,
  type EconomicAssumptions,
  type MatchSettings,
  type MixTrack,
  type OfferRecord,
  type OfferStage,
  type RepaymentMethod,
  type TrackType,
} from '../lib/types';
import MoneyInput from './MoneyInput';
import RateStrip from './RateStrip';
import SourcesPanel from './SourcesPanel';

interface Props {
  mix: MixTrack[];
  setMix: (m: MixTrack[] | ((prev: MixTrack[]) => MixTrack[])) => void;
  evaluated: EvaluatedMix;
  /** Every mix, in tab order, for the tabs and the comparison view. */
  allEvaluated: EvaluatedMix[];
  /** Index of the mix being edited, or 'compare' for the side-by-side view. */
  mixView: number | 'compare';
  setMixView: (v: number | 'compare') => void;
  settings: MatchSettings;
  setSettings: (s: MatchSettings) => void;
  assumptions: EconomicAssumptions;
  setAssumptions: (a: EconomicAssumptions) => void;
  records: OfferRecord[];
  realCount: number;
}

const num = (v: string) => (v === '' ? 0 : Number(v));
const mixName = (i: number) => `תמהיל ${i + 1}`;

export default function Builder(props: Props) {
  const { mix, setMix, evaluated, allEvaluated, mixView, setMixView, settings, setSettings, assumptions, setAssumptions, records, realCount } = props;
  const [openRow, setOpenRow] = useState<string | null>(null);
  const banks = [...new Set(records.filter((r) => r.origin !== 'demo' || settings.includeDemo).map((r) => r.bank).filter(Boolean))] as string[];

  const update = (id: string, patch: Partial<MixTrack>) => setMix((m) => m.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const total = mix.reduce((s, t) => s + t.amount, 0);
  const fixedShare = total
    ? mix.filter((t) => t.type === 'fixed_unlinked' || t.type === 'fixed_linked').reduce((s, t) => s + t.amount, 0) / total
    : 0;
  const primeShare = total ? mix.filter((t) => t.type === 'prime').reduce((s, t) => s + t.amount, 0) / total : 0;
  const index = mixView === 'compare' ? -1 : mixView;

  return (
    <section>
      {realCount === 0 && (
        <div className="notice warn">
          המאגר עדיין ריק מרשומות אמיתיות, ולכן אין ריביות מוצעות. אפשר להוסיף רשומות בלשונית "מאגר הרשומות" או להפעיל
          נתוני דמו (מסומנים ולא אמיתיים) כדי לנסות את הממשק.
        </div>
      )}

      <div className="mix-tabs" role="tablist" aria-label="תמהילים">
        {allEvaluated.map((e, i) => (
          <button
            key={i}
            role="tab"
            aria-selected={index === i}
            className={`mix-tab mix-tab-${i + 1}${index === i ? ' active' : ''}`}
            onClick={() => setMixView(i)}
          >
            {mixName(i)}
            {e.totals.principal > 0 && <small>{fmtMoney(e.totals.firstPayment)} לחודש</small>}
          </button>
        ))}
        <button role="tab" aria-selected={mixView === 'compare'} className={`mix-tab mix-tab-compare${mixView === 'compare' ? ' active' : ''}`} onClick={() => setMixView('compare')}>
          השוואת תמהילים
        </button>
      </div>

      {mixView === 'compare' ? (
        <MixComparison allEvaluated={allEvaluated} edit={setMixView} />
      ) : (
        <>
          <div className={`mix-panel mix-panel-${index + 1}`}>
            <div className="mix-grid" role="table" aria-label={`מסלולי ${mixName(index)}`}>
              <div className="mix-row mix-head" role="row">
                <span role="columnheader" aria-label="מספר מסלול" />
                <span role="columnheader">סכום</span>
                <span role="columnheader">מסלול</span>
                <span role="columnheader">שיטת החזר</span>
                <span role="columnheader">תקופה בחודשים</span>
                <span role="columnheader" title="קבועה ומשתנה: ריבית כוללת. פריים: המרווח מהפריים. ריק = חציון הרשומות במאגר">
                  ריבית ⓘ
                </span>
                <span role="columnheader" title="אינפלציה שנתית צפויה, רק במסלולים צמודים. ריק = ההנחה הכללית בהגדרות">
                  מדד ⓘ
                </span>
                <span role="columnheader" title="מקור הריבית, פיזור הרשומות והסרת המסלול">
                  מתקדם ⓘ
                </span>
                <span role="columnheader" className="res">
                  החזר חודשי
                </span>
                <span role="columnheader" className="res">
                  החזר כולל
                </span>
              </div>
              {evaluated.tracks.map((et, i) => (
                <TrackRow
                  key={et.track.id}
                  n={i + 1}
                  et={et}
                  inflation={assumptions.inflation}
                  update={(p) => update(et.track.id, p)}
                  remove={() => setMix((m) => m.filter((t) => t.id !== et.track.id))}
                  open={openRow === et.track.id}
                  toggle={() => setOpenRow(openRow === et.track.id ? null : et.track.id)}
                />
              ))}
              <div className="mix-row mix-foot" role="row">
                <span role="cell" className="foot-label">
                  סה"כ {fmtMoney(evaluated.totals.principal)}
                  {total !== evaluated.totals.principal && <span className="foot-of"> מתוך {fmtMoney(total)} (מסלול בלי ריבית לא נספר)</span>}
                </span>
                <span role="cell" className="res" data-label="החזר חודשי">
                  {fmtMoney(evaluated.totals.firstPayment)}
                </span>
                <span role="cell" className="res" data-label="החזר כולל">
                  {fmtMoney(evaluated.totals.totalPaid)}
                </span>
              </div>
            </div>
            <div className="track-actions">
              <button
                className="add-track"
                onClick={() => setMix((m) => [...m, { id: uid(), type: 'fixed_unlinked', termYears: 20, amount: 0 }])}
              >
                לחץ כאן להוספת מסלול
              </button>
              <button className="remove-track" disabled={!mix.length} onClick={() => setMix((m) => m.slice(0, -1))}>
                הסרת מסלול {mix.length || ''}
              </button>
            </div>
          </div>

          <h3 className="mix-summary-title">סיכום {mixName(index)}</h3>
          <MixSummary evaluated={evaluated} />

          <div className="checks">
            <span className={fixedShare >= 1 / 3 - 1e-9 ? 'ok' : 'bad'}>ריבית קבועה: {fmtPct(fixedShare * 100, 0)} (דרישת בנק ישראל: לפחות שליש)</span>
            <span className={primeShare <= 2 / 3 + 1e-9 ? 'ok' : 'bad'}>פריים: {fmtPct(primeShare * 100, 0)} (מקסימום שני שלישים)</span>
          </div>
        </>
      )}

      <details className="panel settings">
        <summary>
          הגדרות מתקדמות: פריים, אינפלציה וסינון רשומות
          <span className="muted">
            {' '}
            · פריים {fmtPct(assumptions.primeRate)} · אינפלציה {fmtPct(assumptions.inflation, 1)} · {settings.bank || 'כל הבנקים'}
            {settings.maxAgeMonths > 0 && <> · {settings.maxAgeMonths} חודשים אחרונים</>}
          </span>
        </summary>
        <div className="grid">
          <label>
            ריבית פריים נוכחית (%)
            <input type="number" step="0.05" value={assumptions.primeRate} onChange={(e) => setAssumptions({ ...assumptions, primeRate: num(e.target.value) })} />
            <small>מוזן ידנית. יש לוודא מול אתר בנק ישראל.</small>
          </label>
          <label>
            אינפלציה שנתית צפויה (%)
            <input type="number" step="0.1" value={assumptions.inflation} onChange={(e) => setAssumptions({ ...assumptions, inflation: num(e.target.value) })} />
            <small>הנחה שלך, משמשת למסלולים צמודים שלא הוזן להם מדד משלהם</small>
          </label>
          <label>
            טווח תקופה להתאמה (± שנים)
            <input type="number" min={0} value={settings.termToleranceYears} onChange={(e) => setSettings({ ...settings, termToleranceYears: num(e.target.value) })} />
          </label>
          <label>
            רק הצעות מ־X החודשים האחרונים (0 = הכול)
            <input type="number" min={0} value={settings.maxAgeMonths} onChange={(e) => setSettings({ ...settings, maxAgeMonths: num(e.target.value) })} />
          </label>
          <label>
            בנק
            <select value={settings.bank} onChange={(e) => setSettings({ ...settings, bank: e.target.value })}>
              <option value="">כל הבנקים</option>
              {banks.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend>שלב ההצעה (ריק = הכול)</legend>
            {(Object.keys(OFFER_STAGE_LABELS) as OfferStage[]).map((s) => (
              <label key={s} className="inline">
                <input
                  type="checkbox"
                  checked={settings.stages.includes(s)}
                  onChange={(e) =>
                    setSettings({ ...settings, stages: e.target.checked ? [...settings.stages, s] : settings.stages.filter((x) => x !== s) })
                  }
                />
                {OFFER_STAGE_LABELS[s]}
              </label>
            ))}
          </fieldset>
          <label className="inline">
            <input type="checkbox" checked={settings.includeDemo} onChange={(e) => setSettings({ ...settings, includeDemo: e.target.checked })} />
            כלול נתוני דמו (מומצאים, לבדיקת הממשק בלבד)
          </label>
        </div>
      </details>
    </section>
  );
}

function TrackRow({
  n,
  et,
  inflation,
  update,
  remove,
  open,
  toggle,
}: {
  n: number;
  et: EvaluatedTrack;
  inflation: number;
  update: (p: Partial<MixTrack>) => void;
  remove: () => void;
  open: boolean;
  toggle: () => void;
}) {
  const { track, stats: s, rateSource, totalRate, result } = et;
  const [showSources, setShowSources] = useState(false);
  const isPrime = track.type === 'prime';
  const linked = LINKED_TRACKS.has(track.type);
  const fmtVal = (v: number) => (isPrime ? `P${fmtSigned(v)}` : fmtPct(v));
  const months = Math.round(track.termYears * 12);
  const priced = totalRate !== undefined && track.amount > 0;
  return (
    <Fragment>
      <div className={`mix-row${open ? ' open' : ''}`} role="row">
        <span role="cell" className="row-n">
          {n}
        </span>
        <label role="cell" data-label="סכום">
          <MoneyInput placeholder="הזן סכום" aria-label={`סכום מסלול ${n}`} value={track.amount} onChange={(v) => update({ amount: v ?? 0 })} />
        </label>
        <label role="cell" data-label="מסלול" className="type-cell">
          <select
            aria-label={`סוג מסלול ${n}`}
            value={track.type}
            onChange={(e) => {
              const type = e.target.value as TrackType;
              update({
                type,
                manualRate: undefined,
                changeEveryYears: VARIABLE_TRACKS.has(type) ? (track.changeEveryYears ?? 5) : undefined,
                inflation: LINKED_TRACKS.has(type) ? track.inflation : undefined,
              });
            }}
          >
            {(Object.keys(TRACK_LABELS) as TrackType[]).map((t) => (
              <option key={t} value={t}>
                {TRACK_LABELS[t]}
              </option>
            ))}
          </select>
          {VARIABLE_TRACKS.has(track.type) && (
            <span className="every">
              כל
              <input
                type="number"
                min={0.5}
                step={0.5}
                aria-label={`תדירות שינוי ריבית במסלול ${n} (שנים)`}
                value={track.changeEveryYears ?? 5}
                onChange={(e) => update({ changeEveryYears: num(e.target.value) })}
              />
              שנים
            </span>
          )}
        </label>
        <label role="cell" data-label="שיטת החזר">
          <select
            aria-label={`שיטת החזר במסלול ${n}`}
            value={track.method ?? 'spitzer'}
            onChange={(e) => update({ method: e.target.value === 'spitzer' ? undefined : (e.target.value as RepaymentMethod) })}
          >
            {(Object.keys(REPAYMENT_LABELS) as RepaymentMethod[]).map((m) => (
              <option key={m} value={m}>
                {REPAYMENT_LABELS[m]}
              </option>
            ))}
          </select>
        </label>
        <label role="cell" data-label="תקופה בחודשים">
          <input
            type="number"
            inputMode="numeric"
            min={12}
            max={420}
            step={12}
            placeholder="הזן"
            aria-label={`תקופה במסלול ${n} בחודשים`}
            value={months || ''}
            onChange={(e) => update({ termYears: num(e.target.value) / 12 })}
          />
        </label>
        <label role="cell" data-label={isPrime ? 'מרווח מהפריים' : 'ריבית'}>
          <input
            type="number"
            step="0.01"
            className={rateSource === 'manual' ? 'manual' : rateSource === 'none' ? 'missing' : undefined}
            placeholder={s ? s.median.toFixed(2) : 'הזן ריבית'}
            aria-label={isPrime ? `מרווח מהפריים במסלול ${n}` : `ריבית במסלול ${n}`}
            value={track.manualRate ?? ''}
            onChange={(e) => update({ manualRate: e.target.value === '' ? undefined : Number(e.target.value) })}
          />
          {isPrime && totalRate !== undefined && <small>{fmtPct(totalRate)}</small>}
        </label>
        <label role="cell" data-label="מדד">
          {linked ? (
            <input
              type="number"
              step="0.1"
              placeholder={inflation.toFixed(1)}
              aria-label={`אינפלציה צפויה במסלול ${n}`}
              value={track.inflation ?? ''}
              onChange={(e) => update({ inflation: e.target.value === '' ? undefined : Number(e.target.value) })}
            />
          ) : (
            <input disabled value="---" aria-label="לא רלוונטי למסלול לא צמוד" />
          )}
        </label>
        <span role="cell" className="adv-cell" data-label="מתקדם">
          <button className="adv" aria-expanded={open} aria-label={`פרטים מתקדמים למסלול ${n}`} onClick={toggle}>
            {open ? '−' : '+'}
          </button>
        </span>
        <span role="cell" className="res" data-label="החזר חודשי">
          {priced ? fmtMoney(result.firstPayment) : '—'}
        </span>
        <span role="cell" className="res" data-label="החזר כולל">
          {priced ? fmtMoney(result.totalPaid) : '—'}
        </span>
      </div>
      {open && (
        <div className="mix-detail" role="row">
          <div role="cell" className="track-result">
            <div className={`stat rate-basis ${rateSource}`}>
              <span className="stat-label">{rateSource === 'manual' ? 'ריבית ידנית' : 'ריבית'}</span>
              {rateSource === 'none' ? (
                <span className="stat-sub">אין רשומות תואמות. הרחב את הסינון בהגדרות המתקדמות או הזן ריבית ידנית.</span>
              ) : (
                <>
                  <span className="stat-value">
                    {fmtVal(et.usedValue!)}
                    {isPrime && <span className="stat-aside"> ({fmtPct(totalRate!)})</span>}
                  </span>
                  <span className="stat-sub">
                    {rateSource === 'records' && s && (
                      <>
                        חציון של {s.count} רשומות · טווח {fmtVal(s.min)} עד {fmtVal(s.max)}
                      </>
                    )}
                    {rateSource === 'manual' && <>לא מבוססת על רשומות{s && <> · חציון הרשומות {fmtVal(s.median)}</>}</>}
                  </span>
                </>
              )}
            </div>
            {priced && (
              <div className="stat">
                <span className="stat-label">החזר מקסימלי (צפוי)</span>
                <span className="stat-value">{fmtMoney(result.maxPayment)}</span>
                <span className="stat-sub">
                  ריבית {fmtMoney(result.totalInterest)}
                  {linked && <> · הצמדה {fmtMoney(result.totalIndexation)}</>}
                </span>
              </div>
            )}
            {s && (
              <div className="stat dist">
                <span className="stat-label">פיזור הרשומות</span>
                <RateStrip
                  values={et.matches.map((m) => m.value)}
                  median={s.median}
                  used={rateSource === 'manual' ? track.manualRate : undefined}
                  format={fmtVal}
                />
              </div>
            )}
          </div>
          <div className="detail-actions">
            <button className="link" onClick={() => setShowSources(!showSources)} disabled={!et.matches.length}>
              {showSources ? 'הסתר מקורות' : `על אילו רשומות זה מבוסס? (${et.matches.length})`}
            </button>
            <button className="link danger" onClick={remove}>
              הסר את מסלול {n}
            </button>
          </div>
          {showSources && <SourcesPanel matches={et.matches} isPrime={isPrime} />}
        </div>
      )}
    </Fragment>
  );
}

const perShekel = (paid: number, principal: number) => (principal ? (paid / principal).toFixed(2) : '—');

function MixSummary({ evaluated }: { evaluated: EvaluatedMix }) {
  const t = evaluated.totals;
  const cells: [string, string][] = [
    ['סך הלוואה', fmtMoney(t.principal)],
    ['ריבית משוקללת', t.principal ? fmtPct(t.weightedRate) : '—'],
    ['החזר חודשי', fmtMoney(t.firstPayment)],
    ['החזר מקסימלי', fmtMoney(t.maxPayment)],
    ['החזר ריבית', fmtMoney(t.totalInterest)],
    ['החזר הצמדה למדד', fmtMoney(t.totalIndexation)],
    ['החזר בסוף תקופה', fmtMoney(t.totalPaid)],
    ['עבור כל שקל תשלם', perShekel(t.totalPaid, t.principal)],
  ];
  return (
    <div className="mix-summary">
      {evaluated.missingRates > 0 && (
        <div className="notice warn">{evaluated.missingRates} מסלולים ללא ריבית אינם נכללים בסיכום.</div>
      )}
      <div className="scroll">
        <table>
          <thead>
            <tr>
              {cells.map(([h]) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {cells.map(([h, v]) => (
                <td key={h} className="num">
                  {v}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="muted small">
        בהנחה שהריבית (כולל הפריים) נשארת קבועה לאורך כל התקופה, ושהאינפלציה במסלולים הצמודים כפי שהוזנה. ההחזר החודשי
        במסלולים צמודים גדל עם המדד.
      </p>
    </div>
  );
}

function MixComparison({ allEvaluated, edit }: { allEvaluated: EvaluatedMix[]; edit: (i: number) => void }) {
  const used = allEvaluated.map((e, i) => ({ e, i })).filter(({ e }) => e.totals.principal > 0);
  if (!used.length) {
    return <div className="notice info">עוד לא הוזנו סכומים באף תמהיל. בחר תמהיל והזן סכום לכל מסלול.</div>;
  }
  const rows: { label: string; value: (e: EvaluatedMix) => number; fmt: (n: number) => string; lowerIsBetter?: boolean }[] = [
    { label: 'סך הלוואה', value: (e) => e.totals.principal, fmt: fmtMoney },
    { label: 'ריבית משוקללת', value: (e) => e.totals.weightedRate, fmt: (n) => fmtPct(n), lowerIsBetter: true },
    { label: 'החזר חודשי', value: (e) => e.totals.firstPayment, fmt: fmtMoney, lowerIsBetter: true },
    { label: 'החזר מקסימלי', value: (e) => e.totals.maxPayment, fmt: fmtMoney, lowerIsBetter: true },
    { label: 'החזר ריבית', value: (e) => e.totals.totalInterest, fmt: fmtMoney, lowerIsBetter: true },
    { label: 'החזר הצמדה למדד', value: (e) => e.totals.totalIndexation, fmt: fmtMoney, lowerIsBetter: true },
    { label: 'החזר בסוף תקופה', value: (e) => e.totals.totalPaid, fmt: fmtMoney, lowerIsBetter: true },
    { label: 'עבור כל שקל תשלם', value: (e) => e.totals.totalPaid / e.totals.principal, fmt: (n) => n.toFixed(2), lowerIsBetter: true },
  ];
  return (
    <div className="card mix-compare">
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th />
              {used.map(({ i }) => (
                <th key={i}>
                  <button className={`link mix-name-${i + 1}`} onClick={() => edit(i)}>
                    {mixName(i)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const values = used.map(({ e }) => r.value(e));
              const best = r.lowerIsBetter && used.length > 1 ? Math.min(...values) : undefined;
              return (
                <tr key={r.label}>
                  <th scope="row">{r.label}</th>
                  {values.map((v, k) => (
                    <td key={used[k].i} className={`num${best !== undefined && v === best ? ' best' : ''}`}>
                      {r.fmt(v)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted small">הערך הנמוך בכל שורה מודגש. לחיצה על שם התמהיל פותחת אותו לעריכה.</p>
    </div>
  );
}
