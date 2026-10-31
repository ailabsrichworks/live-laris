/**
 * LIVE LARIS AI BUILDER — bridge between the Railway server and the Google Sheet.
 *
 * Setup (once): script.google.com → your LIVE LARIS project → replace Code.gs with this file
 * (delete any Index/HTML file) → set SECRET below to the same value as APPS_SCRIPT_SECRET on
 * Railway → Save → run `setup` once → Deploy → Manage deployments → ✏️ → New version, or a new
 * "Web app" deployment (Execute as: Me, Who has access: Anyone) → copy the /exec URL into
 * APPS_SCRIPT_URL on Railway.
 *
 * Every request must carry SECRET; without it the script refuses.
 */

const SECRET = 'CHANGE-ME';
const SPREADSHEET_ID = '1pFane-L61EKY7L-ePNt7ry2ZlCjlzacVNqXSVnhZUZ4'; // "klinik bisnes sme"

const PROFILE_SHEET = 'LiveLaris Profiles';
const PROMPT_SHEET = 'LiveLaris Prompt Log';
const TIMEZONE = 'Asia/Kuala_Lumpur';
const MAX_LEN = 5000;
const MAX_APPROVAL = 45000; // a cell holds 50,000 characters

// Profile columns, laid out like "Peserta v4": header = "SECTION\nLabel", one colour per section.
// The script finds columns by this header text, so rename here (not in the Sheet).
// Form keys must match the field ids in public/index.html (test/columns.test.mjs checks this).
const SECTIONS = [
  ['REKOD', '#E8EAED', [
    ['participantId', 'ID peserta'], ['createdAt', 'Mula'], ['updatedAt', 'Dikemas kini']]],
  ['LANGKAH 1 · PROFIL BISNES', '#D9EAD3', [
    ['owner', 'Nama pemilik'], ['businessName', 'Nama bisnes / jenama'], ['years', 'Tempoh operasi'], ['model', 'Model bisnes'],
    ['industry', 'Industri'], ['team', 'Saiz team'], ['location', 'Lokasi operasi'], ['sales', 'Jualan bulanan'],
    ['customer', 'Pelanggan sasaran'], ['age', 'Umur pelanggan'], ['customerNeed', 'Situasi / masalah pelanggan'], ['businessDesc', 'Penerangan bisnes']]],
  ['LANGKAH 2 · LIVE REALITY CHECK', '#FFF2CC', [
    ['platform', 'Platform LIVE'], ['experience', 'Pengalaman LIVE'], ['liveCount30', 'LIVE dalam 30 hari'], ['liveDuration', 'Purata tempoh LIVE'],
    ['viewersEnter', 'Apa berlaku bila viewers masuk'], ['commonQuestions', 'Soalan paling kerap'], ['checkout', 'Cara pelanggan membeli'],
    ['leakAttention', 'Attention · keutamaan'], ['leakAttentionSign', 'Attention · tanda'],
    ['leakRetention', 'Retention · keutamaan'], ['leakRetentionSign', 'Retention · tanda'],
    ['leakInterest', 'Interest · keutamaan'], ['leakInterestSign', 'Interest · tanda'],
    ['leakConfidence', 'Confidence · keutamaan'], ['leakConfidenceSign', 'Confidence · tanda'],
    ['leakAction', 'Action · keutamaan'], ['leakActionSign', 'Action · tanda'],
    ['improveOne', 'Satu perkara untuk diperbaiki'],
    ['mAttention', 'Metrik · Attention'], ['mEngagement', 'Metrik · Engagement'], ['mIntent', 'Metrik · Intent'],
    ['mConversion', 'Metrik · Conversion'], ['mFollowup', 'Metrik · Follow-up'],
    ['goal', 'Matlamat LIVE'], ['liveExtra', 'Nota operasi LIVE']]],
  ['LANGKAH 3 · PRODUCT SELLING BLUEPRINT', '#FCE5CD', [
    ['productType', 'Jenis tawaran'], ['productName', 'Produk / servis fokus'], ['price', 'Harga jualan'], ['size', 'Saiz / variasi'],
    ['features', 'Ciri / bahan / spesifikasi'], ['benefits', 'Manfaat boleh disokong'], ['proof', 'Bukti / dokumen / sijil'],
    ['difference', 'Perbezaan / keunikan'], ['reviews', 'Review pelanggan'], ['stock', 'Stok / kapasiti'], ['offer', 'Tawaran / pakej'],
    ['demo', 'Demo produk'], ['objections', 'Objection pelanggan'], ['productExtra', 'Cara guna / amaran / polisi'], ['toVerify', 'PERLU SEMAK']]],
  ['LANGKAH 4 · KOMITMEN & SEMAKAN', '#CFE2F3', [
    ['qc0', 'QC · Fakta produk disahkan'], ['qc1', 'QC · Rundown bertujuan'], ['qc2', 'QC · Hooks sesuai'], ['qc3', 'QC · Skrip natural'],
    ['qc4', 'QC · Demo boleh dibuat'], ['qc5', 'QC · Objection tanpa dakwaan'], ['qc6', 'QC · CTA & checkout diuji'],
    ['qc7', 'QC · Follow-up sopan'], ['qc8', 'QC · Feedback diterima'],
    ['nextLiveAt', 'LIVE seterusnya'], ['nextProduct', 'Produk LIVE seterusnya'], ['nextChange', 'Perubahan untuk diuji'],
    ['nextMetric', 'Metrik direkod'], ['reviewDate', 'Tarikh semak hasil'], ['commitNotes', 'Nota susulan']]],
  ['OUTPUT AI DILULUSKAN', '#D9D2E9', [
    ['approved_reality', 'LIVE Reality Check'], ['approved_product', 'Product Intelligence'], ['approved_angles', 'Selling Angles'],
    ['approved_rundown', 'LIVE Rundown'], ['approved_dosdonts', "Do's & Don'ts Reviewer"], ['approved_script', 'Script Builder H.E.B.A.T'],
    ['approved_objection', 'Objection Coach'], ['approved_cta', 'CTA & Follow-up'], ['approved_rehearsal', 'Rehearsal Partner'],
    ['approved_playbook', 'Master Playbook']]],
  ['AI · AKTIVITI', '#EFEFEF', [
    ['lastModule', 'Kad terakhir dijana'], ['lastPromptAt', 'Masa terakhir dijana'], ['promptCount', 'Jumlah prompt dijana']]],
];
const PROFILE_COLUMNS = [];
SECTIONS.forEach(s => s[2].forEach(c => PROFILE_COLUMNS.push({ key: c[0], header: s[0] + '\n' + c[1], section: s[0], color: s[1] })));
const PROFILE_HEADERS = PROFILE_COLUMNS.map(c => c.header);
const KEY_BY_HEADER = {};
PROFILE_COLUMNS.forEach(c => { KEY_BY_HEADER[c.header] = c.key; });
const SYSTEM_KEYS = ['participantId', 'createdAt', 'updatedAt', 'lastModule', 'lastPromptAt', 'promptCount'];
const FORM_KEYS = PROFILE_COLUMNS.map(c => c.key).filter(k => SYSTEM_KEYS.indexOf(k) === -1 && k.indexOf('approved_') !== 0);
const CARD_IDS = PROFILE_COLUMNS.map(c => c.key).filter(k => k.indexOf('approved_') === 0).map(k => k.slice(9));

const PROMPT_HEADERS = ['timestamp', 'participantId', 'businessName', 'productName', 'module', 'source', 'model', 'inputTokens', 'outputTokens', 'note'];

function doPost(e) {
  let out;
  try {
    const req = JSON.parse(e.postData.contents);
    if (SECRET === 'CHANGE-ME' || req.secret !== SECRET) return reply_({ ok: false, code: 401, error: 'Secret salah atau belum ditetapkan dalam Code.gs.' });
    out = { ok: true, result: handle_(req) };
  } catch (err) {
    const m = String((err && err.message) || err);
    const code = /too many times|rate limit|quota/i.test(m) ? 429 : /lock|timed out|maximum execution|try again/i.test(m) ? 503 : 400;
    out = { ok: false, code: code, error: m };
  }
  return reply_(out);
}

// Open the Web app URL in a browser to check the deployment works.
function doGet() {
  return reply_({ ok: true, app: 'live-laris', secretSet: SECRET !== 'CHANGE-ME' });
}

/** Run once from the editor: creates or upgrades the tabs and styles the headers. */
function setup() {
  profileSheet_();
  promptSheet_();
  Logger.log('✓ Tabs ready in "%s"', spreadsheet_().getName());
}

function reply_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function handle_(req) {
  switch (req.op) {
    case 'ping': profileSheet_(); return { ok: true };
    case 'saveProfile': return saveProfile_(req.data);
    case 'loadProfile': return loadProfile_(req.participantId);
    case 'saveApproval': return saveApproval_(req.participantId, req.cardId, req.text);
    case 'logPrompt': return logPrompt_(req.entry);
  }
  throw new Error('Unknown op: ' + req.op);
}

function saveProfile_(data) {
  if (!data || typeof data !== 'object') throw new Error('Data tidak sah.');
  return withProfileRow_(data.participantId, true, (get, set, id, now) => {
    set('participantId', id);
    if (!get('createdAt')) set('createdAt', now);
    set('updatedAt', now);
    FORM_KEYS.forEach(k => { if (k in data) set(k, data[k]); });
    return { participantId: id, updatedAt: now };
  });
}

function loadProfile_(participantId) {
  const id = normaliseId_(participantId);
  if (!id) return null;
  const sh = profileSheet_();
  const rowIndex = findRow_(sh, id);
  if (rowIndex === -1) return null;
  const keys = headers_(sh).map(h => KEY_BY_HEADER[h]);
  const values = sh.getRange(rowIndex, 1, 1, keys.length).getDisplayValues()[0];
  const data = {}, approvals = {};
  let updatedAt = '';
  keys.forEach((k, i) => {
    if (!k) return;
    if (FORM_KEYS.indexOf(k) !== -1) data[k] = values[i];
    else if (k.indexOf('approved_') === 0 && values[i]) approvals[k.slice(9)] = { text: values[i] };
    else if (k === 'updatedAt') updatedAt = values[i];
  });
  return { participantId: id, updatedAt: updatedAt, data: data, approvals: approvals };
}

function saveApproval_(participantId, cardId, text) {
  if (CARD_IDS.indexOf(cardId) === -1) throw new Error('Kad tidak sah: ' + cardId);
  const out = withProfileRow_(participantId, false, (get, set, id, now) => {
    set('approved_' + cardId, String(text || '').slice(0, MAX_APPROVAL));
    set('updatedAt', now);
    return { at: now };
  });
  if (!out) throw new Error('Profil tidak dijumpai');
  return out;
}

function logPrompt_(entry) {
  entry = entry || {};
  const id = normaliseId_(entry.participantId);
  const now = stamp_();
  promptSheet_().appendRow(PROMPT_HEADERS.map(h => h === 'timestamp' ? now : h === 'participantId' ? id : clean_(entry[h])));
  if (id) {
    withProfileRow_(id, false, (get, set) => {
      set('lastModule', entry.module);
      set('lastPromptAt', now);
      set('promptCount', (parseInt(get('promptCount'), 10) || 0) + 1);
    });
  }
  return true;
}

// ---------- helpers ----------

/**
 * Locks, finds (or creates) the participant's row, lets fn read/write cells by key, then writes it back.
 * When create is false and the row doesn't exist, nothing is written.
 */
function withProfileRow_(participantId, create, fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = profileSheet_();
    const keys = headers_(sh).map(h => KEY_BY_HEADER[h]);
    let id = normaliseId_(participantId);
    let rowIndex = id ? findRow_(sh, id) : -1;
    if (rowIndex === -1 && !create) return null;
    if (!id) id = newId_(sh);

    const row = rowIndex > 0
      ? sh.getRange(rowIndex, 1, 1, keys.length).getValues()[0].map(v => clean_(v, MAX_APPROVAL))
      : keys.map(() => '');
    const get = k => { const i = keys.indexOf(k); return i === -1 ? '' : row[i]; };
    const set = (k, v) => { const i = keys.indexOf(k); if (i !== -1) row[i] = clean_(v, k.indexOf('approved_') === 0 ? MAX_APPROVAL : MAX_LEN); };
    const result = fn(get, set, id, stamp_());

    if (rowIndex === -1) rowIndex = sh.getLastRow() + 1;
    sh.getRange(rowIndex, 1, 1, keys.length).setNumberFormat('@').setValues([row]);
    return result;
  } finally {
    lock.releaseLock();
  }
}

function spreadsheet_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

/**
 * The profile tab with the current header. A tab with only a header row (no participants yet) is
 * given the new layout in full; a tab with data only gets missing columns added on the right.
 */
function profileSheet_() {
  const ss = spreadsheet_();
  const sh = ss.getSheetByName(PROFILE_SHEET) || ss.insertSheet(PROFILE_SHEET);
  const current = sh.getLastColumn() ? headers_(sh) : [];
  const same = current.length === PROFILE_HEADERS.length && current.every((h, i) => h === PROFILE_HEADERS[i]);
  if (same) return sh;
  if (sh.getLastRow() <= 1) {
    sh.getRange(1, 1, 1, Math.max(sh.getMaxColumns(), 1)).clearContent();
    if (sh.getMaxColumns() < PROFILE_HEADERS.length) sh.insertColumnsAfter(sh.getMaxColumns(), PROFILE_HEADERS.length - sh.getMaxColumns());
    sh.getRange(1, 1, 1, PROFILE_HEADERS.length).setValues([PROFILE_HEADERS]);
    styleProfileHeader_(sh);
  } else {
    const missing = PROFILE_HEADERS.filter(h => current.indexOf(h) === -1);
    if (missing.length) sh.getRange(1, current.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold').setWrap(true);
  }
  return sh;
}

function styleProfileHeader_(sh) {
  const n = PROFILE_HEADERS.length;
  PROFILE_COLUMNS.forEach((c, i) => sh.getRange(1, i + 1).setBackground(c.color));
  sh.getRange(1, 1, 1, n).setFontWeight('bold').setWrap(true).setVerticalAlignment('top');
  sh.getRange(2, 1, sh.getMaxRows() - 1, n).setNumberFormat('@').setWrap(true).setVerticalAlignment('top');
  sh.setColumnWidths(1, n, 190);
  sh.setRowHeight(1, 54);
  sh.setFrozenRows(1);
  sh.setFrozenColumns(1);
  sh.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(p => { if (p.getRange().getRow() === 1) p.remove(); });
  sh.getRange(1, 1, 1, n).protect().setDescription('Header — app bergantung pada nama lajur ini').setWarningOnly(true);
}

function promptSheet_() {
  const ss = spreadsheet_();
  const sh = ss.getSheetByName(PROMPT_SHEET) || ss.insertSheet(PROMPT_SHEET);
  const current = sh.getLastColumn() ? headers_(sh) : [];
  const missing = PROMPT_HEADERS.filter(h => current.indexOf(h) === -1);
  if (missing.length) {
    sh.getRange(1, current.length + 1, 1, missing.length).setValues([missing])
      .setFontWeight('bold').setBackground('#E8EAED').setVerticalAlignment('top');
    sh.setFrozenRows(1);
  }
  return sh;
}

function headers_(sh) {
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
}

function findRow_(sh, id) {
  if (sh.getLastRow() < 2) return -1;
  const hit = sh.getRange(2, 1, sh.getLastRow() - 1, 1).createTextFinder(id).matchEntireCell(true).findNext();
  return hit ? hit.getRow() : -1;
}

function newId_(sh) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id;
  do {
    id = 'LL-';
    for (let i = 0; i < 8; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));
  } while (findRow_(sh, id) !== -1);
  return id;
}

function normaliseId_(v) {
  const id = String(v || '').trim().toUpperCase();
  return /^LL-[A-Z0-9]{8}$/.test(id) ? id : '';
}

/** Trims length and neutralises values that Sheets would treat as formulas. */
function clean_(v, max) {
  let s = String(v == null ? '' : v).slice(0, max || MAX_LEN);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function stamp_() {
  return Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
}
