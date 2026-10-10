import { useCallback, useEffect, useMemo, useState } from 'react';
import Builder from './components/Builder';
import Compare from './components/Compare';
import Records from './components/Records';
import Methodology from './components/Methodology';
import Admin, { AdminGate } from './components/Admin';
import CollectionReport from './components/CollectionReport';
import { isUsable } from './lib/coverage';
import { evaluateMix } from './lib/evaluate';
import { latestScan } from './lib/report';
import { usePersistentState } from './lib/storage';
import { useRunLogs } from './lib/useRuns';
import { OFFER_WINDOW_DAYS, daysBetween } from './lib/validate';
import { offerDateOf, type CurrentTrack, type EconomicAssumptions, type MatchSettings, type MixTrack, type OfferRecord } from './lib/types';

type Tab = 'builder' | 'compare' | 'panel';
type PanelTab = 'audit' | 'records' | 'report';

const TABS: { id: Tab; label: string }[] = [
  { id: 'builder', label: 'בניית תמהיל' },
  { id: 'compare', label: 'השוואה למשכנתא שלי' },
  { id: 'panel', label: '🔒 פאנל ניהול' },
];

const PANEL_TABS: { id: PanelTab; label: string }[] = [
  { id: 'audit', label: 'ביקורת מקורות' },
  { id: 'records', label: 'מאגר הרשומות' },
  { id: 'report', label: 'דוח איסוף' },
];

/** Where a link like …/#report lands; also maps tab ids stored by older versions of the site. */
function route(id: string): { tab: Tab; panel?: PanelTab } | 'methodology' | undefined {
  if (id === 'methodology') return 'methodology';
  if (id === 'builder' || id === 'compare' || id === 'panel') return { tab: id };
  if (id === 'admin' || id === 'audit') return { tab: 'panel', panel: 'audit' };
  if (id === 'records' || id === 'report') return { tab: 'panel', panel: id };
  return undefined;
}

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
  const [storedTab, setTab] = usePersistentState<string>('tab', 'builder');
  const [storedPanel, setPanel] = usePersistentState<PanelTab>('panelTab', 'report');
  const stored = route(storedTab);
  const tab: Tab = stored && stored !== 'methodology' ? stored.tab : 'builder';
  const panel: PanelTab = (stored && stored !== 'methodology' && stored.panel) || storedPanel;
  const [page, setPage] = useState<'main' | 'methodology'>('main');
  // Links like …/#report (used in the daily email) open a tab directly; #methodology opens its own page.
  useEffect(() => {
    const fromHash = () => {
      const r = route(window.location.hash.slice(1));
      if (r === 'methodology') {
        setPage('methodology');
        window.scrollTo(0, 0);
        return;
      }
      setPage('main');
      if (r) {
        setTab(r.tab);
        if (r.panel) setPanel(r.panel);
      }
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, [setTab, setPanel]);
  const openTab = (t: Tab, p?: PanelTab) => {
    setTab(t);
    if (p) setPanel(p);
    if (window.location.hash) history.replaceState(null, '', window.location.pathname + window.location.search);
  };
  const runLogs = useRunLogs();
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
  const today = new Date().toISOString().slice(0, 10);
  // "Live": real, reviewed offers from the last 120 days – the ones the calculator uses by default.
  const liveCount = [...repoRecords, ...localRecords].filter((r) => isUsable(r) && daysBetween(offerDateOf(r), today) <= OFFER_WINDOW_DAYS).length;
  const lastScan = runLogs ? latestScan(runLogs) : undefined;
  const scaleMix = (principal: number, index: number) =>
    setMixes((all) =>
      all.map((m, i) => {
        if (i !== index) return m;
        const total = m.reduce((s, t) => s + t.amount, 0);
        return total ? m.map((t) => ({ ...t, amount: Math.round((t.amount / total) * principal) })) : m;
      }),
    );
  const allEvaluated = useMemo(
    () => mixes.map((m) => evaluateMix(m, allRecords, settings, assumptions)),
    [mixes, allRecords, settings, assumptions],
  );
  const evaluated = allEvaluated[activeMix] ?? evaluateMix([], allRecords, settings, assumptions);
  const selectMixView = (v: number | 'compare') => {
    setMixView(v);
    if (v !== 'compare') setActiveMix(v);
  };

  const header = (
    <header>
      <h1>מתכנן תמהיל משכנתא</h1>
      <p className="subtitle">כל ריבית באתר מגיעה מהצעה אמיתית שאדם פרסם: פוסט, תגובה או צילום הצעה.</p>
      <div className="db-status">
        <span title="הצעות אמיתיות ומאושרות מ־120 הימים האחרונים, שהחישוב משתמש בהן">{liveCount} מקורות חיים באתר</span>
        {' · '}סריקה אחרונה: {lastScan ?? '—'}
        {settings.includeDemo && <span className="badge demo"> נתוני דמו מוצגים</span>}
      </div>
    </header>
  );

  const footer = (
    <footer className="site-footer">
      <p className="disclaimer">
        המידע באתר נועד להמחשה בלבד ואינו מהווה ייעוץ משכנתאות, ייעוץ פיננסי או המלצה לפעולה. הריביות מבוססות על הצעות שפורסמו
        ברשתות ובפורומים, לא אומתו מול הבנקים, ועשויות להשתנות בכל עת. לפני כל החלטה יש לבדוק את ההצעה מול הבנק או מול יועץ
        משכנתאות מוסמך.
      </p>
      {page !== 'methodology' && <a href="#methodology">מקורות ומתודולוגיה</a>}
    </footer>
  );

  if (page === 'methodology') {
    return (
      <div className="app">
        {header}
        <p>
          <a href="#">→ חזרה לאתר</a>
        </p>
        <main>
          <Methodology />
        </main>
        {footer}
      </div>
    );
  }

  return (
    <div className="app">
      {header}

      <nav className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'active' : ''} onClick={() => openTab(t.id)}>
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
          <Compare
            current={current}
            setCurrent={setCurrent}
            allEvaluated={allEvaluated}
            activeMix={activeMix}
            assumptions={assumptions}
            goToBuilder={(i) => {
              selectMixView(i);
              openTab('builder');
            }}
            scaleMixTo={scaleMix}
          />
        )}
        {tab === 'panel' && (
          <AdminGate>
            {(logout) => (
          <>
            <nav className="subtabs" role="tablist" aria-label="פאנל ניהול">
              {PANEL_TABS.map((t) => (
                <button key={t.id} role="tab" aria-selected={panel === t.id} className={panel === t.id ? 'active' : ''} onClick={() => openTab('panel', t.id)}>
                  {t.label}
                </button>
              ))}
              <button className="logout" onClick={logout}>
                יציאה
              </button>
            </nav>
            {panel === 'audit' && <Admin records={allRecords} evaluated={evaluated} assumptions={assumptions} />}
            {panel === 'records' && (
              <Records records={allRecords} localRecords={localRecords} setLocalRecords={setLocalRecords} includeDemo={settings.includeDemo} />
            )}
            {panel === 'report' && (
              <CollectionReport records={repoRecords} primeRate={assumptions.primeRate} goToRecords={() => openTab('panel', 'records')} />
            )}
          </>
            )}
          </AdminGate>
        )}
      </main>
      {footer}
    </div>
  );
}
