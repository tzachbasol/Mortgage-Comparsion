// Moves records dropped into collection/inbox/*.json into public/data/records.json.
// Each inbox file is { "records": OfferRecord[], "run": RunLog } (see collection/chrome-task.md).
// Every record goes through the same validateRecord() the site and tests use; invalid or duplicate
// records are not imported and are listed in the run log's "rejected" instead.
// Usage: node --experimental-strip-types scripts/import-inbox.mjs
import { readFileSync, writeFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRecord } from '../src/lib/validate.ts';

/** The same post can be linked with or without a trailing slash or tracking query, so compare without them. */
export const normalizeUrl = (url) => (url ? url.split(/[?#]/)[0].replace(/\/+$/, '') : url);

/** Pure merge step, exported for tests. Never modifies or removes existing records. */
export function importPayload(existing, payload, today) {
  const ids = new Set(existing.map((r) => r.id));
  const urls = new Set(existing.map((r) => normalizeUrl(r.source?.url)).filter(Boolean));
  const added = [];
  const rejected = [...(payload.run?.rejected ?? [])];
  for (const raw of payload.records ?? []) {
    const rec = { ...raw, source: { collectedAt: today, ...raw.source } };
    const url = rec.source?.url;
    const key = normalizeUrl(url);
    let reason = validateRecord(rec);
    if (!reason && ids.has(rec.id)) reason = `מזהה כפול: ${rec.id}`;
    if (!reason && key && urls.has(key)) reason = 'הפוסט כבר קיים במאגר';
    if (reason) {
      rejected.push({ url: url ?? '', reason });
      continue;
    }
    added.push(rec);
    ids.add(rec.id);
    if (key) urls.add(key);
  }
  // A run that is imported late (e.g. pushed a few days after it ran) keeps its own date, never a future one.
  const stated = payload.run?.runDate;
  const runDate = typeof stated === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(stated) && stated <= today ? stated : today;
  const run = {
    runDate,
    windowStart: payload.run?.windowStart ?? '',
    status: payload.run?.status ?? 'ok',
    sources: payload.run?.sources ?? [],
    added: added.map((r) => r.id),
    rejected,
    notes: payload.run?.notes ?? '',
  };
  return { records: [...existing, ...added], added, run };
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const inbox = join(root, 'collection/inbox');
  const recordsPath = join(root, 'public/data/records.json');
  const today = new Date().toISOString().slice(0, 10);
  const files = existsSync(inbox) ? readdirSync(inbox).filter((f) => f.endsWith('.json')) : [];
  let records = JSON.parse(readFileSync(recordsPath, 'utf8'));
  for (const f of files) {
    const payload = JSON.parse(readFileSync(join(inbox, f), 'utf8'));
    const result = importPayload(records, payload, today);
    records = result.records;
    const runName = `${result.run.runDate}-${basename(f, '.json')}.json`;
    writeFileSync(join(root, 'collection/runs', runName), JSON.stringify(result.run, null, 2) + '\n');
    rmSync(join(inbox, f));
    console.log(`${f}: imported ${result.added.length}, rejected ${result.run.rejected.length}`);
  }
  if (!files.length) return console.log('inbox empty');
  writeFileSync(recordsPath, JSON.stringify(records, null, 2) + '\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
