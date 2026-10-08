import { useEffect, useState } from 'react';
import type { RunLog } from './report';

/** Loads data/runs.json (built from collection/runs). null while loading; [] if missing. */
export function useRunLogs(): RunLog[] | null {
  const [logs, setLogs] = useState<RunLog[] | null>(null);
  useEffect(() => {
    // GitHub Pages caches for 10 minutes; revalidate so a fresh run shows up right after deploy.
    fetch('data/runs.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : []))
      .then((x: RunLog[]) => setLogs(Array.isArray(x) ? x : []))
      .catch(() => setLogs([]));
  }, []);
  return logs;
}
