import { useEffect, useMemo, useState } from 'react';
import Builder from './components/Builder';
import Compare from './components/Compare';
import Records from './components/Records';
import Methodology from './components/Methodology';
import Admin from './components/Admin';
import { evaluateMix } from './lib/evaluate';
import { usePersistentState } from './lib/storage';
import type { CurrentTrack, EconomicAssumptions, MatchSettings, MixTrack, OfferRecord } from './lib/types';

type Tab = 'builder' | 'compare' | 'admin' | 'records' | 'methodology';

const TABS: { id: Tab; label: string }[] = [
  { id: 'builder', label: 'בניית תמהיל' },
  { id: 'compare', label: 'השוואה למשכנתא שלי' },
  { id: 'admin', label: '🔒 ביקורת מקורות (אדמין)' },
  { id: 'records', label: 'מאגר הרשומות' },
  { id: 'methodology', label: 'מקורות ומתודולוגיה' },
];

const DEFAULT_MIX: MixTrack[] = [
  { id: 'a', type: 'prime', termYears: 30, amount: 400000 },
  { id: 'b', type: 'fixed_unlinked', termYears: 20, amount: 400000 },
  { id: 'c', type: 'variable_linked', termYears: 25, amount: 400000, changeEveryYears: 5 },
];

const DEFAULT_SETTINGS: MatchSettings = {
  termToleranceYears: 3,
  maxAgeMonths: 6,
  bank: '',
  stages: [],
  includeDemo: false,
};

const DEFAULT_ASSUMPTIONS: EconomicAssumptions = { primeRate: 5.25, inflation: 2.5 };

async function loadJson(path: string): Promise<OfferRecord[]> {
  try {
    const res = await fetch(path);
    if (!res.ok) return [];
    return (await res.json()) as OfferRecord[];
  } catch {
    return [];
  }
}

export default function App() {
  const [tab, setTab] = usePersistentState<Tab>('tab', 'builder');
  const [repoRecords, setRepoRecords] = useState<OfferRecord[]>([]);
  const [demoRecords, setDemoRecords] = useState<OfferRecord[]>([]);
  const [localRecords, setLocalRecords] = usePersistentState<OfferRecord[]>('localRecords', []);
  const [mix, setMix] = usePersistentState<MixTrack[]>('mix', DEFAULT_MIX);
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
  const evaluated = useMemo(
    () => evaluateMix(mix, allRecords, settings, assumptions),
    [mix, allRecords, settings, assumptions],
  );

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
        {tab === 'admin' && <Admin records={allRecords} evaluated={evaluated} assumptions={assumptions} />}
        {tab === 'methodology' && <Methodology />}
      </main>
    </div>
  );
}
