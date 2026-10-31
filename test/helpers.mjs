import fs from 'node:fs';

// Loads apps-script/Code.gs with stand-ins for the Google services it uses (an in-memory sheet).
export function loadAppsScript({ secret = 'test-secret' } = {}) {
  const src = fs.readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8')
    .replace("const SECRET = 'CHANGE-ME';", `const SECRET = ${JSON.stringify(secret)};`);
  const sheets = {};

  function mkSheet(name) {
    const g = [];
    let maxCols = 26;
    const sh = {
      g, name, protections: [],
      getLastRow: () => g.length,
      getLastColumn: () => Math.max(0, ...g.map((r) => r.length)),
      getMaxColumns: () => maxCols,
      getMaxRows: () => 1000,
      insertColumnsAfter: (_, n) => { maxCols += n },
      setFrozenRows() {}, setFrozenColumns() {}, setColumnWidths() {}, setRowHeight() {},
      getProtections: () => sh.protections,
      appendRow(v) { g.push(v.map(String)) },
      getRange(r, c, nr = 1, nc = 1) {
        const rng = {
          getRow: () => r,
          setValues(v) {
            for (let i = 0; i < nr; i++) {
              g[r - 1 + i] = g[r - 1 + i] || [];
              for (let j = 0; j < nc; j++) { let x = String(v[i][j]); if (x.startsWith("'")) x = x.slice(1); g[r - 1 + i][c - 1 + j] = x }
            }
            return rng;
          },
          clearContent() { for (let i = 0; i < nr; i++) if (g[r - 1 + i]) g[r - 1 + i] = []; return rng },
          getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => (g[r - 1 + i] || [])[c - 1 + j] ?? '')),
          createTextFinder: (t) => ({ matchEntireCell() { return this }, findNext() { for (let i = 0; i < nr; i++) if ((g[r - 1 + i] || [])[c - 1] === t) return { getRow: () => r + i }; return null } }),
          protect() { const p = { getRange: () => rng, remove() {}, setDescription() { return p }, setWarningOnly() { return p } }; sh.protections.push(p); return p },
        };
        for (const m of ['setFontWeight', 'setWrap', 'setNumberFormat', 'setBackground', 'setVerticalAlignment']) rng[m] = () => rng;
        rng.getDisplayValues = rng.getValues;
        return rng;
      },
    };
    return sh;
  }

  const ss = { getName: () => 'klinik bisnes sme', getSheetByName: (n) => sheets[n], insertSheet: (n) => (sheets[n] = mkSheet(n)) };
  const g = {
    SpreadsheetApp: { openById: () => ss, ProtectionType: { RANGE: 'RANGE' } },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: { formatDate: () => '2026-10-31 18:00:00' },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ text: t, setMimeType() { return this } }) },
    Logger: { log() {} },
  };
  const names = ['doPost', 'doGet', 'setup', 'PROFILE_HEADERS', 'FORM_KEYS', 'CARD_IDS', 'PROMPT_HEADERS', 'ANSWER_HEADERS'];
  const exported = new Function(...Object.keys(g), `${src}\nreturn { ${names.join(', ')} };`)(...Object.values(g));
  const call = (op, args = {}, s = secret) => JSON.parse(exported.doPost({ postData: { contents: JSON.stringify({ secret: s, op, ...args }) } }).text);
  return { ...exported, sheets, ss, call, mkSheet };
}

/** Field ids of the participant form in public/index.html (plus the generated checklist boxes). */
export function formFieldIds() {
  const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const main = html.slice(html.indexOf('<main>'), html.indexOf('</main>'));
  const ids = [...main.matchAll(/<(?:input|select|textarea)\b[^>]*\bid="([^"]+)"/g)].map((m) => m[1]).filter((id) => id !== 'aiOutput');
  return [...ids, ...Array.from({ length: 9 }, (_, i) => `qc${i}`)];
}
