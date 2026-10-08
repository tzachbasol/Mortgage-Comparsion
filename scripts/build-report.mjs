// Builds the collection report page (HTML body for the Claude artifact) from
// collection/runs/*.json and public/data/records.json. Run logs from the same day
// (web routine + Facebook task) are merged into one daily run, and the whole
// database is listed, so the artifact grows with every merged run.
// Usage: node scripts/build-report.mjs > report.html
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE_URL = 'https://tzachbasol.github.io/Mortgage-Comparsion/';
const REPO_URL = 'https://github.com/tzachbasol/Mortgage-Comparsion';
const WINDOW_DAYS = 120;

const TRACK_LABELS = {
  prime: 'פריים',
  fixed_unlinked: 'קל"צ',
  fixed_linked: 'ק"צ',
  variable_unlinked: 'משתנה לא צמודה',
  variable_linked: 'משתנה צמודה',
};
const SOURCE_STATUS = { ok: ['תקין', 'ok'], blocked: ['חסום', 'bad'], error: ['שגיאה', 'bad'], partial: ['חלקי', 'warn'] };
const RUN_STATUS = { ok: ['הושלם', 'ok'], partial: ['הושלם חלקית', 'warn'], blocked: ['נחסם', 'bad'] };
const BUCKETS = [[1, 10], [11, 15], [16, 20], [21, 25], [26, 35]];

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const DAY = 86400000;
const addDays = (iso, d) => new Date(Date.parse(iso) + d * DAY).toISOString().slice(0, 10);
const fmtDate = (iso) => (iso ? iso.split('-').reverse().join('/') : '—');
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const trackValue = (t) => (t.type === 'prime' ? t.primeMargin : t.rate);
const fmtVal = (type, v) => (v === undefined || v === null ? '—' : type === 'prime' ? `P${v >= 0 ? '+' : ''}${v.toFixed(2)}%` : `${v.toFixed(2)}%`);

const SOURCE_KIND = { facebook_post: 'פייסבוק', forum_post: 'פורום' };
const STATUS_RANK = { ok: 0, partial: 1, blocked: 2 };

const records = JSON.parse(readFileSync(join(root, 'public/data/records.json'), 'utf8'));
const runsDir = join(root, 'collection/runs');
const runLogs = existsSync(runsDir)
  ? readdirSync(runsDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => JSON.parse(readFileSync(join(runsDir, f), 'utf8')))
  : [];

/**
 * One day can have several run logs (the web routine and the Facebook task each write one).
 * Merge them into a single daily run so the report shows everything collected that day.
 */
const isFacebookLog = (l) => /Chrome/.test(l.notes ?? '') || (l.added ?? []).some((id) => id.startsWith('fb-'));

function mergeDay(logs) {
  const hasFacebookRun = logs.some(isFacebookLog);
  const sources = logs.flatMap((l) => l.sources ?? []);
  return {
    runDate: logs[0].runDate,
    windowStart: logs.map((l) => l.windowStart).filter(Boolean).sort()[0],
    status: logs.map((l) => l.status).sort((a, b) => (STATUS_RANK[b] ?? 1) - (STATUS_RANK[a] ?? 1))[0],
    // The web routine lists Facebook as blocked (it can't log in); drop that row when the Facebook task ran.
    sources: hasFacebookRun ? sources.filter((s) => !(s.status === 'blocked' && /פייסבוק/.test(s.name) && !s.postsScanned)) : sources,
    added: logs.flatMap((l) => l.added ?? []),
    rejected: logs.flatMap((l) => l.rejected ?? []),
    prUrls: logs.map((l) => l.prUrl).filter(Boolean),
    notes: logs.filter((l) => l.notes).map((l) => `${isFacebookLog(l) ? 'פייסבוק' : 'פורומים'}: ${l.notes}`),
  };
}
const byDate = new Map();
for (const l of runLogs) byDate.set(l.runDate, [...(byDate.get(l.runDate) ?? []), l]);
const runs = [...byDate.values()].map(mergeDay).sort((a, b) => b.runDate.localeCompare(a.runDate));
const run = runs[0];
const prev = runs[1];

/** Median per category over records collected by `asOf` whose offer was given in the window before it. */
function categoryMedians(asOf) {
  const from = addDays(asOf, -WINDOW_DAYS);
  const cats = new Map();
  for (const r of records) {
    if (r.excluded) continue;
    const offered = r.offerDate ?? r.source.postedAt;
    if (r.source.collectedAt > asOf || offered < from || offered > asOf) continue;
    for (const t of r.tracks) {
      const v = trackValue(t);
      if (v === undefined) continue;
      const b = BUCKETS.find(([lo, hi]) => t.termYears >= lo && t.termYears <= hi) ?? BUCKETS[4];
      const key = `${t.type}|${b[0]}–${b[1]}`;
      if (!cats.has(key)) cats.set(key, { type: t.type, bucket: `${b[0]}–${b[1]}`, values: [] });
      cats.get(key).values.push(v);
    }
  }
  return cats;
}

function tracksCell(r) {
  return r.tracks
    .map((t) => `<span class="trk">${esc(TRACK_LABELS[t.type])} ${t.termYears} שנה <b>${fmtVal(t.type, trackValue(t))}</b></span>`)
    .join('');
}

const offeredOn = (r) => r.offerDate ?? r.source.postedAt;
const sourceCell = (r) => `<span class="chip ${r.source.kind === 'facebook_post' ? 'fb' : 'web'}">${esc(SOURCE_KIND[r.source.kind] ?? r.source.kind)}</span> ${esc(r.source.channel)}`;

function recordsTable(rows) {
  return `<div class="scroll"><table><thead><tr><th>ההצעה ניתנה</th><th>מקור</th><th>בנק</th><th>מסלולים</th><th>קישור</th></tr></thead><tbody>${rows
    .map(
      (r) => `<tr><td class="num">${fmtDate(offeredOn(r))}</td><td>${sourceCell(r)}</td><td>${esc(r.bank ?? '—')}</td><td>${tracksCell(r)}</td><td>${
        r.source.url ? `<a href="${esc(r.source.url)}">לפוסט</a>` : '<span class="muted">אין קישור</span>'
      }</td></tr>`,
    )
    .join('')}</tbody></table></div>`;
}

/** The whole database, newest offer first. Grows with every merged run (web routine and Facebook task). */
function databaseSection() {
  const active = records.filter((r) => !r.excluded).sort((a, b) => offeredOn(b).localeCompare(offeredOn(a)));
  const excluded = records.length - active.length;
  const count = (kind) => active.filter((r) => r.source.kind === kind).length;
  const inWindow = run ? active.filter((r) => offeredOn(r) >= addDays(run.runDate, -WINDOW_DAYS)).length : active.length;
  return `
  <section>
    <h3>המאגר המלא</h3>
    <p class="muted">${active.length} רשומות פעילות: ${count('facebook_post')} מפייסבוק, ${count('forum_post')} מפורומים. ${inWindow} מהן מ־${WINDOW_DAYS} הימים האחרונים.${excluded ? ` ${excluded} רשומות הוחרגו ונשמרות לתיעוד בלבד.` : ''}</p>
    ${active.length ? recordsTable(active) : '<p class="muted">המאגר עדיין ריק.</p>'}
  </section>`;
}

let body;
if (!run) {
  body = `
  <section class="empty">
    <h2>עוד לא בוצעה ריצת איסוף</h2>
    <p>הריצה הראשונה תתעדכן כאן אוטומטית. בכל ריצה נאספות רק הצעות שניתנו ב־${WINDOW_DAYS} הימים האחרונים. רשומות שעוברות את כל הבדיקות נכנסות לאתר אוטומטית.</p>
  </section>`;
} else {
  const added = records.filter((r) => run.added.includes(r.id));
  const scanned = run.sources.reduce((s, x) => s + (x.postsScanned ?? 0), 0);
  const [runLabel, runCls] = RUN_STATUS[run.status] ?? [run.status, 'warn'];
  const now = categoryMedians(run.runDate);
  const before = prev ? categoryMedians(prev.runDate) : new Map();
  const catRows = [...now.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, c]) => {
      const m = median(c.values);
      const p = before.get(key);
      const pm = p ? median(p.values) : undefined;
      const delta = pm === undefined ? '<span class="muted">חדש</span>' : `<span class="${m < pm ? 'ok' : m > pm ? 'bad' : 'muted'}">${m - pm >= 0 ? '+' : ''}${(m - pm).toFixed(2)}</span>`;
      return `<tr><td>${esc(TRACK_LABELS[c.type])}</td><td class="num">${c.bucket}</td><td class="num ${c.values.length < 3 ? 'bad' : ''}">${c.values.length}</td><td class="num">${fmtVal(c.type, m)}</td><td class="num">${delta}</td></tr>`;
    })
    .join('');

  body = `
  <section class="summary">
    <div class="run-head">
      <div>
        <div class="eyebrow">ריצה אחרונה</div>
        <h2>${fmtDate(run.runDate)}</h2>
        <div class="muted">חלון איסוף: הצעות מ־${fmtDate(run.windowStart)} עד ${fmtDate(run.runDate)}</div>
      </div>
      <span class="chip ${runCls}">${runLabel}</span>
    </div>
    <dl class="stats">
      <div><dt>רשומות חדשות</dt><dd>${added.length}</dd></div>
      <div><dt>פוסטים שנסרקו</dt><dd>${scanned}</dd></div>
      <div><dt>נדחו</dt><dd>${run.rejected.length}</dd></div>
      <div><dt>סה"כ במאגר</dt><dd>${records.length}</dd></div>
    </dl>
    <div class="links">
      ${run.prUrls.map((u, i) => `<a class="btn${i ? '' : ' primary'}" href="${esc(u)}">לשינוי ב־GitHub${run.prUrls.length > 1 ? ` (${i + 1})` : ''}</a>`).join('')}
      <a class="btn" href="${SITE_URL}">לאתר</a>
      <a class="btn" href="${REPO_URL}">לריפו</a>
    </div>
    ${run.notes.map((n) => `<p class="note">${esc(n)}</p>`).join('')}
  </section>

  <section>
    <h3>ממצאים חדשים</h3>
    ${
      added.length
        ? recordsTable(added)
        : '<p class="muted">לא נמצאו הצעות חדשות בריצה הזו.</p>'
    }
  </section>

  <section>
    <h3>מקורות שנסרקו</h3>
    <div class="scroll"><table><thead><tr><th>מקור</th><th>מצב</th><th>פוסטים</th><th>הצעות</th><th>הערה</th></tr></thead><tbody>${run.sources
      .map((s) => {
        const [l, c] = SOURCE_STATUS[s.status] ?? [s.status, 'warn'];
        return `<tr><td>${s.url ? `<a href="${esc(s.url)}">${esc(s.name)}</a>` : esc(s.name)}</td><td><span class="chip ${c}">${l}</span></td><td class="num">${s.postsScanned ?? 0}</td><td class="num">${s.offersFound ?? 0}</td><td class="muted">${esc(s.note ?? '')}</td></tr>`;
      })
      .join('')}</tbody></table></div>
  </section>

  ${
    run.rejected.length
      ? `<section><h3>נדחו</h3><ul class="rejected">${run.rejected
          .map((x) => `<li>${x.url ? `<a href="${esc(x.url)}">${esc(x.url)}</a>` : ''} <span class="muted">${esc(x.reason)}</span></li>`)
          .join('')}</ul></section>`
      : ''
  }

  <section>
    <h3>חציון לפי קטגוריה, ${WINDOW_DAYS} הימים האחרונים</h3>
    ${
      catRows
        ? `<div class="scroll"><table><thead><tr><th>מסלול</th><th>תקופה (שנים)</th><th>רשומות</th><th>חציון</th><th>שינוי מהריצה הקודמת</th></tr></thead><tbody>${catRows}</tbody></table></div>
           <p class="muted small">פחות מ־3 רשומות מסומן באדום: החציון לא אמין. כולל רק רשומות שכבר אושרו ונכנסו למאגר.</p>`
        : `<p class="muted">אין רשומות מאושרות מ־${WINDOW_DAYS} הימים האחרונים.</p>`
    }
  </section>

  ${databaseSection()}

  ${
    runs.length > 1
      ? `<section><h3>ריצות קודמות</h3><div class="scroll"><table><thead><tr><th>תאריך</th><th>מצב</th><th>חדשות</th><th>נדחו</th><th>קישור</th></tr></thead><tbody>${runs
          .slice(1)
          .map((r) => {
            const [l, c] = RUN_STATUS[r.status] ?? [r.status, 'warn'];
            return `<tr><td class="num">${fmtDate(r.runDate)}</td><td><span class="chip ${c}">${l}</span></td><td class="num">${r.added.length}</td><td class="num">${r.rejected.length}</td><td>${r.prUrls.length ? r.prUrls.map((u) => `<a href="${esc(u)}">שינוי</a>`).join(' ') : '—'}</td></tr>`;
          })
          .join('')}</tbody></table></div></section>`
      : ''
  }`;
}

process.stdout.write(`<title>דוח איסוף משכנתאות</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Assistant:wght@400;600;700&family=Rubik:wght@500;700&display=swap">
<style>
:root {
  --bg: #f4f6f9; --surface: #ffffff; --text: #19202b; --muted: #5f6b7d; --line: #d9dee6;
  --accent: #1d5fd1; --accent-ink: #ffffff; --ok: #137a3d; --ok-bg: #e3f4ea; --bad: #b42318; --bad-bg: #fdeceb; --warn: #8a5a00; --warn-bg: #fff3d6;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #11151c; --surface: #1a2029; --text: #e6e9ef; --muted: #97a1b2; --line: #2d3542;
    --accent: #6ea2ff; --accent-ink: #0d1420; --ok: #58d68d; --ok-bg: #143322; --bad: #f28b82; --bad-bg: #3a1b1a; --warn: #f5c26b; --warn-bg: #3a2e13;
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --bg: #11151c; --surface: #1a2029; --text: #e6e9ef; --muted: #97a1b2; --line: #2d3542;
  --accent: #6ea2ff; --accent-ink: #0d1420; --ok: #58d68d; --ok-bg: #143322; --bad: #f28b82; --bad-bg: #3a1b1a; --warn: #f5c26b; --warn-bg: #3a2e13;
  color-scheme: dark;
}
body { background: var(--bg); color: var(--text); font: 16px/1.55 Assistant, 'Segoe UI', Arial, sans-serif; }
.page { max-width: 960px; margin: 0 auto; padding-inline: 16px; padding-block: 24px 48px; display: grid; gap: 28px; }
header h1 { font: 700 28px/1.2 Rubik, Assistant, sans-serif; margin: 0 0 6px; text-wrap: balance; }
h2 { font: 700 26px/1.2 Rubik, Assistant, sans-serif; margin: 2px 0; }
h3 { font: 500 18px/1.3 Rubik, Assistant, sans-serif; margin: 0 0 10px; }
.eyebrow { font-size: 12px; letter-spacing: .06em; color: var(--muted); font-weight: 600; }
.muted { color: var(--muted); }
.small { font-size: 13px; }
.summary { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 20px; display: grid; gap: 18px; }
.run-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
.stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: 0; }
.stats div { border-inline-start: 3px solid var(--line); padding-inline-start: 10px; }
.stats dt { color: var(--muted); font-size: 13px; }
.stats dd { margin: 0; font: 700 28px/1.1 Rubik, Assistant, sans-serif; font-variant-numeric: tabular-nums; }
@media (max-width: 560px) { .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.links { display: flex; flex-wrap: wrap; gap: 8px; }
.btn { display: inline-block; padding: 7px 14px; border-radius: 6px; border: 1px solid var(--line); color: var(--text); text-decoration: none; font-weight: 600; }
.btn.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
.btn:focus-visible, a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
a { color: var(--accent); }
.note { margin: 0; padding: 10px 12px; background: var(--warn-bg); color: var(--text); border-radius: 6px; }
.chip { display: inline-block; font-size: 13px; font-weight: 600; padding: 2px 10px; border-radius: 999px; white-space: nowrap; }
.chip.ok { color: var(--ok); background: var(--ok-bg); }
.chip.bad { color: var(--bad); background: var(--bad-bg); }
.chip.warn { color: var(--warn); background: var(--warn-bg); }
.chip.fb, .chip.web { font-size: 12px; padding: 1px 8px; color: var(--muted); background: var(--bg); border: 1px solid var(--line); }
.ok { color: var(--ok); } .bad { color: var(--bad); }
.scroll { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 15px; }
th { text-align: start; font-size: 13px; color: var(--muted); font-weight: 600; padding: 6px 8px; border-bottom: 1px solid var(--line); }
td { padding: 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
.num { font-variant-numeric: tabular-nums; white-space: nowrap; }
.trk { display: inline-block; margin-inline-end: 12px; white-space: nowrap; }
.rejected { margin: 0; padding-inline-start: 18px; display: grid; gap: 4px; word-break: break-all; }
.empty { background: var(--surface); border: 1px dashed var(--line); border-radius: 10px; padding: 24px; }
.empty p { max-width: 62ch; margin: 8px 0 0; }
</style>
<div class="page" dir="rtl" lang="he">
  <header>
    <h1>דוח איסוף הצעות משכנתא</h1>
    <div class="muted">נאסף כל יום מפורומים בעברית ומקבוצות פייסבוק. רשומות שעוברות את כל הבדיקות נכנסות למאגר ולאתר אוטומטית.</div>
  </header>
  ${body}
</div>
`);
