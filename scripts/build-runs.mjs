// Bundles collection/runs/*.json into public/data/runs.json so the site's collection report can
// show every run. Runs automatically before `npm run dev` and `npm run build`; the output is
// generated, not committed.
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const runsDir = join(root, 'collection/runs');
const runs = existsSync(runsDir)
  ? readdirSync(runsDir)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map((f) => JSON.parse(readFileSync(join(runsDir, f), 'utf8')))
  : [];
mkdirSync(join(root, 'public/data'), { recursive: true });
writeFileSync(join(root, 'public/data/runs.json'), JSON.stringify(runs) + '\n');
console.log(`runs.json: ${runs.length} run logs`);
