import { useCallback, useEffect, useMemo, useState } from 'react';
import Builder from './components/Builder';
import Compare from './components/Compare';
import Records from './components/Records';
import Methodology from './components/Methodology';
import Admin from './components/Admin';
import CollectionReport from './components/CollectionReport';
import { evaluateMix } from './lib/evaluate';
import { usePersistentState } from './lib/storage';
import type { CurrentTrack, EconomicAssumptions, MatchSettings, MixTrack, OfferRecord } from './lib/types';

type Tab = 'builder' | 'compare' | 'admin' | 'records' | 'report' | 'methodology';

const TABS: { id: Tab; label: string }[] = [
  { id: 'builder', label: 'בניית תמהיל' },
  { id: 'compare', label: 'השוואה למשכנתא שלי' },
  { id: 'admin', label: '🔒 ביקורת מקורות (אדמין)' },
  { id: 'records', label: 'מאגר הרשומות' },
  { id: 'report', label: 'דוח איסוף' },
  { id: 'methodology', label: 'מקורות ומתודולוגיה' },
];

const DEFAULT_MIX: MixTrack[] = [
  { id: 'a', type: 'prime', termYears: 30, amount: 400000 },
  { id: 'b', type: 'fixed_unlinked', termYears: 20, amount: 400000 },
  { id: 'c', type: 'variable_linked', termYears: 25, amount: 400000, changeEveryYears: 5 },
];

/** Number of mixes the builder offers side by side (tabs "תמהיל 1–4"). */
const MIX_COUNT = 4;

const blankMix = (n: number): MixTrack[] => [
  { id: `m${n}a`, type: 'prime', termYears: 30, amount: 0 },
  { id: `m${n}b`, type: 'fixed_unlinked', termYears: 20, amount: 0 },
  { id: `m${n}c`, type: 'variable_unlinked', termYears: 25, amount: 0, changeEveryYears: 5 },
];

/** The first mix keeps whatever the single-mix version of the site stored. */
function initialMixes(): MixTrack[][] {
  let first = DEFAULT_MIX;
  try {
    const raw = localStorage.getItem('mix');
    if (raw) first = JSON.parse(raw) as MixTrack[];
  } catch {
    // storage unavailable – start from the default
  }
  return [first, ...Array.from({ length: MIX_COUNT - 1 }, (_, i) => blankMix(i + 2))];
}

const INITIAL_MIXES = initialMixes();

const DEFAULT_SETTINGS: MatchSettings = {
  termToleranceYears: 3,
  maxAgeMonths: 4,
  bank: '',
  stages: [],
  includeDemo: false,
};

const DEFAULT_ASSUMPTIONS: EconomicAssumptions = { primeRate: 5.25, inflation: 2.5 };

async function loadJson(path: string): Promise<OfferRecord[]> {
  try {
    // GitHub Pages caches for 10 minutes; revalidate so a fresh collection shows up right after deploy.
    const res = await fetch(path, { cache: 'no-cache' });
    if (!res.ok) return [];
    return (await res.json()) as OfferRecord[];
  } catch {
    return [];
  }
}

export default function App() {
  const [tab, setTab] = usePersistentState<Tab>('tab', 'builder');
  // Links like …/#report (used in the daily email) open a tab directly.
  useEffect(() => {
    const fromHash = () => {
      const id = window.location.hash.slice(1);
      if (TABS.some((t) => t.id === id)) setTab(id as Tab);
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, [setTab]);
  const [repoRecords, setRepoRecords] = useState<OfferRecord[]>([]);
  const [demoRecords, setDemoRecords] = useState<OfferRecord[]>([]);
  const [localRecords, setLocalRecords] = usePersistentState<OfferRecord[]>('localRecords', []);
  const [mixes, setMixes] = usePersistentState<MixTrack[][]>('mixes', INITIAL_MIXES);
  /** 0–3: the mix being edited; 'compare': the side-by-side view. */
  const [mixView, setMixView] = usePersistentState<number | 'compare'>('mixView', 0);
  const [activeMix, setActiveMix] = usePersistentState<number>('activeMix', 0);
  const mix = mixes[activeMix] ?? [];
  const setMix = useCallback(
    (m: MixTrack[] | ((prev: MixTrack[]) => MixTrack[])) =>
      setMixes((all) => all.map((x, i) => (i === activeMix ? (typeof m === 'function' ? m(x) : m) : x))),
    [activeMix, setMixes],
  );
  const [current, setCurrent] = usePersistentState<CurrentTrack[]>('currentMortgage', []);
  const [settings, setSettings] = usePersistentState<MatchSettings>('matchSettings', DEFAULT_SETTINGS);
  const [assumptions, setAssumptions] = usePersistentState<EconomicAssumptions>('assumptions', DEFAULT_ASSUMPTIONS);

  useEffect(() => {
    loadJson('data/records.json').then((r) => setRepoRecords(r.map((x) => ({ ...x, origin: 'repo' }))));
    loadJson('data/demo-records.json').then((r) => setDemoRecords(r.map((x) => ({ ...x, origin: 'demo' }))));
  }, []);

  const allRecords = useMemo(
    () => [...repoRecords, ...localRecords.map((r) => ({ ...r, origin: 'local' as const })), ...demoRecords],
    [repoRecords, localRecords, demoRecords],
  );
  const realCount = repoRecords.length + localRecords.length;
  const allEvaluated = useMemo(
    () => mixes.map((m) => evaluateMix(m, allRecords, settings, assumptions)),
    [mixes, allRecords, settings, assumptions],
  );
  const evaluated = allEvaluated[activeMix] ?? evaluateMix([], allRecords, settings, assumptions);
  const selectMixView = (v: number | 'compare') => {
    setMixView(v);
    if (v !== 'compare') setActiveMix(v);
  };

  return (
    <div className="app">
      <header>
        <h1>מתכנן תמהיל משכנתא</h1>
        <p className="subtitle">
          כל ריבית באתר מגיעה מרשומה שמקורה בפרסום של אדם אמיתי: פוסט, תגובה או צילום הצעה. בכל מסלול אפשר לראות על
          אילו רשומות החישוב מבוסס.
        </p>
        <div className="db-status">
          {realCount} רשומות אמיתיות במאגר ({repoRecords.length} מהריפו, {localRecords.length} מקומיות)
          {settings.includeDemo && <span className="badge demo"> נתוני דמו מוצגים</span>}
        </div>
      </header>

      <nav className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      <main>
        {tab === 'builder' && (
          <Builder
            mix={mix}
            setMix={setMix}
            evaluated={evaluated}
            allEvaluated={allEvaluated}
            mixView={mixView}
            setMixView={selectMixView}
            settings={settings}
            setSettings={setSettings}
            assumptions={assumptions}
            setAssumptions={setAssumptions}
            records={allRecords}
            realCount={realCount}
          />
        )}
        {tab === 'compare' && (
          <Compare current={current} setCurrent={setCurrent} evaluated={evaluated} assumptions={assumptions} goToBuilder={() => setTab('builder')}
            scaleMixTo={(principal) =>
              setMix((m) => {
                const total = m.reduce((s, t) => s + t.amount, 0);
                return total ? m.map((t) => ({ ...t, amount: Math.round((t.amount / total) * principal) })) : m;
              })
            }
          />
        )}
        {tab === 'records' && (
          <Records records={allRecords} localRecords={localRecords} setLocalRecords={setLocalRecords} includeDemo={settings.includeDemo} />
        )}
        {tab === 'report' && (
          <CollectionReport records={repoRecords} primeRate={assumptions.primeRate} goToRecords={() => setTab('records')} />
        )}
        {tab === 'admin' && <Admin records={allRecords} evaluated={evaluated} assumptions={assumptions} />}
        {tab === 'methodology' && <Methodology />}
      </main>
    </div>
  );
}
