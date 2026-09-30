import { useState } from 'react';
import type { EvaluatedMix, EvaluatedTrack } from '../lib/evaluate';
import { fmtMoney, fmtPct, fmtSigned, uid } from '../lib/storage';
import {
  OFFER_STAGE_LABELS,
  TRACK_LABELS,
  VARIABLE_TRACKS,
  type EconomicAssumptions,
  type MatchSettings,
  type MixTrack,
  type OfferRecord,
  type OfferStage,
  type TrackType,
} from '../lib/types';
import SourcesPanel from './SourcesPanel';
import Totals from './Totals';

interface Props {
  mix: MixTrack[];
  setMix: (m: MixTrack[] | ((prev: MixTrack[]) => MixTrack[])) => void;
  evaluated: EvaluatedMix;
  settings: MatchSettings;
  setSettings: (s: MatchSettings) => void;
  assumptions: EconomicAssumptions;
  setAssumptions: (a: EconomicAssumptions) => void;
  records: OfferRecord[];
  realCount: number;
}

const num = (v: string) => (v === '' ? 0 : Number(v));

export default function Builder(props: Props) {
  const { mix, setMix, evaluated, settings, setSettings, assumptions, setAssumptions, records, realCount } = props;
  const [openSources, setOpenSources] = useState<string | null>(null);
  const banks = [...new Set(records.filter((r) => r.origin !== 'demo' || settings.includeDemo).map((r) => r.bank).filter(Boolean))] as string[];

  const update = (id: string, patch: Partial<MixTrack>) => setMix((m) => m.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const total = mix.reduce((s, t) => s + t.amount, 0);
  const fixedShare = total
    ? mix.filter((t) => t.type === 'fixed_unlinked' || t.type === 'fixed_linked').reduce((s, t) => s + t.amount, 0) / total
    : 0;
  const primeShare = total ? mix.filter((t) => t.type === 'prime').reduce((s, t) => s + t.amount, 0) / total : 0;

  return (
    <section>
      {realCount === 0 && (
        <div className="notice warn">
          המאגר עדיין ריק מרשומות אמיתיות, ולכן אין ריביות מוצעות. אפשר להוסיף רשומות בלשונית "מאגר הרשומות" או להפעיל
          נתוני דמו (מסומנים ולא אמיתיים) כדי לנסות את הממשק.
        </div>
      )}

      <details className="panel" open>
        <summary>הנחות וסינון רשומות</summary>
        <div className="grid">
          <label>
            ריבית פריים נוכחית (%)
            <input type="number" step="0.05" value={assumptions.primeRate} onChange={(e) => setAssumptions({ ...assumptions, primeRate: num(e.target.value) })} />
            <small>מוזן ידנית. יש לוודא מול אתר בנק ישראל.</small>
          </label>
          <label>
            אינפלציה שנתית צפויה (%)
            <input type="number" step="0.1" value={assumptions.inflation} onChange={(e) => setAssumptions({ ...assumptions, inflation: num(e.target.value) })} />
            <small>הנחה שלך, משמשת למסלולים צמודים</small>
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

      <div className="tracks">
        {evaluated.tracks.map((et) => (
          <TrackRow
            key={et.track.id}
            et={et}
            assumptions={assumptions}
            update={(p) => update(et.track.id, p)}
            remove={() => setMix((m) => m.filter((t) => t.id !== et.track.id))}
            sourcesOpen={openSources === et.track.id}
            toggleSources={() => setOpenSources(openSources === et.track.id ? null : et.track.id)}
          />
        ))}
      </div>
      <button className="add" onClick={() => setMix((m) => [...m, { id: uid(), type: 'fixed_unlinked', termYears: 20, amount: 300000 }])}>
        + הוסף מסלול
      </button>

      <div className="checks">
        <span className={fixedShare >= 1 / 3 - 1e-9 ? 'ok' : 'bad'}>ריבית קבועה: {fmtPct(fixedShare * 100, 0)} (דרישת בנק ישראל: לפחות שליש)</span>
        <span className={primeShare <= 2 / 3 + 1e-9 ? 'ok' : 'bad'}>פריים: {fmtPct(primeShare * 100, 0)} (מקסימום שני שלישים)</span>
      </div>

      <Totals title="סיכום התמהיל" evaluated={evaluated} />
    </section>
  );
}

function TrackRow({
  et,
  assumptions,
  update,
  remove,
  sourcesOpen,
  toggleSources,
}: {
  et: EvaluatedTrack;
  assumptions: EconomicAssumptions;
  update: (p: Partial<MixTrack>) => void;
  remove: () => void;
  sourcesOpen: boolean;
  toggleSources: () => void;
}) {
  const { track, stats: s, rateSource, totalRate, result } = et;
  const isPrime = track.type === 'prime';
  const fmtVal = (v: number) => (isPrime ? `P${fmtSigned(v)}` : fmtPct(v));
  return (
    <div className="track card">
      <div className="track-fields">
        <label>
          סוג מסלול
          <select
            value={track.type}
            onChange={(e) => {
              const type = e.target.value as TrackType;
              update({ type, manualRate: undefined, changeEveryYears: VARIABLE_TRACKS.has(type) ? (track.changeEveryYears ?? 5) : undefined });
            }}
          >
            {(Object.keys(TRACK_LABELS) as TrackType[]).map((t) => (
              <option key={t} value={t}>
                {TRACK_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label>
          תקופה (שנים)
          <input type="number" min={4} max={30} value={track.termYears} onChange={(e) => update({ termYears: Number(e.target.value) })} />
        </label>
        {VARIABLE_TRACKS.has(track.type) && (
          <label>
            משתנה כל (שנים)
            <input type="number" min={1} value={track.changeEveryYears ?? 5} onChange={(e) => update({ changeEveryYears: Number(e.target.value) })} />
          </label>
        )}
        <label>
          סכום (₪)
          <input type="number" step={10000} min={0} value={track.amount} onChange={(e) => update({ amount: Number(e.target.value) })} />
        </label>
        <label>
          {isPrime ? 'מרווח מהפריים (%)' : 'ריבית (%)'}
          <input
            type="number"
            step="0.01"
            placeholder={s ? s.median.toFixed(2) : 'אין נתונים'}
            value={track.manualRate ?? ''}
            onChange={(e) => update({ manualRate: e.target.value === '' ? undefined : Number(e.target.value) })}
          />
          <small>{track.manualRate !== undefined ? 'ערך ידני – השאר ריק כדי להשתמש בחציון הרשומות' : 'ריק = חציון הרשומות'}</small>
        </label>
        <button className="remove" onClick={remove} aria-label="הסר מסלול">
          ✕
        </button>
      </div>

      <div className="track-result">
        <div className={`rate-basis ${rateSource}`}>
          {rateSource === 'records' && s && (
            <>
              ריבית: <b>{fmtVal(s.median)}</b>
              {isPrime && <> ({fmtPct(totalRate!)})</>} · חציון של <b>{s.count}</b> רשומות · טווח {fmtVal(s.min)} עד {fmtVal(s.max)}
            </>
          )}
          {rateSource === 'manual' && (
            <>
              ריבית ידנית: <b>{fmtVal(track.manualRate!)}</b>
              {isPrime && <> ({fmtPct(assumptions.primeRate + track.manualRate!)})</>} · לא מבוססת על רשומות
              {s && <> (חציון הרשומות: {fmtVal(s.median)} מתוך {s.count})</>}
            </>
          )}
          {rateSource === 'none' && <>אין רשומות תואמות למסלול הזה. הרחב את הסינון, הוסף רשומות או הזן ריבית ידנית.</>}
        </div>
        {totalRate !== undefined && (
          <div className="payment">
            החזר חודשי ראשון: <b>{fmtMoney(result.firstPayment)}</b> · סה"כ תשלומים: {fmtMoney(result.totalPaid)}
          </div>
        )}
        <button className="link" onClick={toggleSources} disabled={!et.matches.length}>
          {sourcesOpen ? 'הסתר מקורות' : `על אילו שליפות זה מבוסס? (${et.matches.length})`}
        </button>
      </div>
      {sourcesOpen && <SourcesPanel matches={et.matches} isPrime={isPrime} />}
    </div>
  );
}
