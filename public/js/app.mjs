import { CARDS, QC_ITEMS, profileText } from './cards.mjs';
import { parseBlocks } from './richtext.mjs';

const $ = (id) => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(k) } catch { return null } },
  set(k, v) { try { localStorage.setItem(k, v) } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k) } catch { /* private mode */ } },
};
const CACHE_KEY = 'liveLarisProfileV2', PID_KEY = 'liveLarisPidV2', APPROVE_KEY = 'liveLarisApprovedV2';
let participantId = store.get(PID_KEY) || '', saving = null, autoTimer = null, currentCard = null, generating = false;

// Icons from the SVG sprite in index.html (same set as Business Quick Fix); decorative, the text carries the meaning.
const use = (id) => `<svg aria-hidden="true"><use href="#${id}"/></svg>`;
const ICON = { check: use('i-check'), sparkle: use('i-sparkle'), info: use('i-info'), arrow: use('i-arrow') };
let approvals = {};
try { approvals = JSON.parse(store.get(APPROVE_KEY) || '{}') } catch { /* corrupt cache */ }

async function api(path, body) {
  const res = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(out.error || `HTTP ${res.status}`), { status: res.status });
  return out;
}

// ---- Form state ----
function fields() { return document.querySelectorAll('main section input,main section select,main section textarea:not(#aiOutput)') }
function collect() { const d = {}; fields().forEach((e) => { if (e.id) d[e.id] = e.type === 'checkbox' ? (e.checked ? '✓' : '') : e.value }); return d }
function fill(d) { Object.entries(d || {}).forEach(([k, v]) => { const e = $(k); if (!e || !e.closest('main section')) return; if (e.type === 'checkbox') e.checked = !!v; else e.value = v }) }
function setStatus(msg, kind) { document.querySelectorAll('.status.sync').forEach((s) => { s.textContent = msg; s.className = 'status sync' + (kind ? ' ' + kind : '') }) }
// The participant id stays internal: it keeps this browser's saves on the same Sheet row.
function setPid(id) { participantId = id || ''; if (id) store.set(PID_KEY, id); else store.del(PID_KEY) }
function saveApprovals() { store.set(APPROVE_KEY, JSON.stringify(approvals)) }

function saveProfile(silent) {
  clearTimeout(autoTimer);
  const data = collect();
  store.set(CACHE_KEY, JSON.stringify(data));
  if (saving) return saving.then(() => saveProfile(silent));
  document.querySelectorAll('.btn.save').forEach((b) => (b.disabled = true));
  setStatus(''); // saving is silent; only a failure is shown
  saving = api('/api/profile', { participantId, data })
    .then((r) => setPid(r.participantId))
    .catch((err) => { setStatus('✗ Gagal simpan (' + err.message + '). Data masih ada dalam browser ini — cuba lagi.', 'err'); if (silent !== true) alert('Gagal menyimpan. Sila semak sambungan internet dan cuba lagi.') })
    .finally(() => { saving = null; document.querySelectorAll('.btn.save').forEach((b) => (b.disabled = false)) });
  return saving;
}
// ---- Step 1 is mandatory (except the AI-written summary) ----
const REQUIRED = [...document.querySelectorAll('#business [data-required]')].map((e) => e.id);
const missingProfile = () => REQUIRED.filter((id) => !$(id).value.trim());
function markField(id, bad) {
  const el = $(id), errId = 'err-' + id;
  let msg = $(errId);
  el.setAttribute('aria-invalid', bad ? 'true' : 'false');
  const described = (el.getAttribute('aria-describedby') || '').split(' ').filter((x) => x && x !== errId);
  if (bad && !msg) {
    msg = document.createElement('p'); msg.className = 'field-error'; msg.id = errId; msg.textContent = 'Wajib diisi.';
    el.closest('.field').appendChild(msg);
  }
  if (!bad && msg) msg.remove();
  el.setAttribute('aria-describedby', (bad ? [...described, errId] : described).join(' '));
  if (!el.getAttribute('aria-describedby')) el.removeAttribute('aria-describedby');
}
/** True when step 1 is complete; otherwise flags the missing fields and focuses the first one. */
function checkProfile() {
  const missing = missingProfile();
  REQUIRED.forEach((id) => markField(id, missing.includes(id)));
  if (missing.length) {
    setStatus(`Sila lengkapkan ${missing.length} ruangan wajib (*) sebelum ke langkah seterusnya.`, 'err');
    $(missing[0]).focus({ preventScroll: true });
    $(missing[0]).scrollIntoView({ block: 'center' });
    return false;
  }
  return true;
}
function saveBusiness() {
  saveProfile(false);
  if (checkProfile()) ensureSummary(false);
}
function nextFromBusiness() {
  if (!checkProfile()) return;
  ensureSummary(false);
  next('reality');
}

// ---- "Bisnes anda secara ringkas": written by the AI from the step 1 answers ----
let summarising = false;
async function ensureSummary(force) {
  if (summarising || (!force && $('businessDesc').value.trim())) return;
  if (missingProfile().length) { if (force) checkProfile(); return }
  summarising = true; $('summaryBtn').disabled = true;
  $('summaryStatus').textContent = 'AI sedang menulis ringkasan bisnes anda…';
  try {
    const r = await api('/api/summary', { participantId, data: collect() });
    $('businessDesc').value = r.text;
    $('businessDesc').dispatchEvent(new Event('change')); // autosave + progress
    $('summaryStatus').textContent = r.source === 'ai' ? 'Ringkasan ditulis oleh AI. Anda boleh ubah jika perlu.' : 'Ringkasan asas digunakan' + (r.reason ? ' (' + r.reason + ')' : '') + '. Anda boleh ubah jika perlu.';
  } catch (err) {
    $('summaryStatus').textContent = 'Gagal menulis ringkasan: ' + err.message + '. Cuba klik “Tulis semula dengan AI”.';
  } finally { summarising = false; $('summaryBtn').disabled = false }
}

// Boxes with a long example (textarea.grow) are as tall as their text, or the example while empty, so nothing is cut off.
function grow(el) {
  if (!el.offsetParent) return; // hidden step: sized when it opens
  el.style.height = 'auto';
  let h = el.scrollHeight;
  if (!el.value && el.placeholder) { el.value = el.placeholder; h = el.scrollHeight; el.value = '' }
  el.style.height = h + 2 + 'px'; // + border
}
const growAll = () => document.querySelectorAll('textarea.grow').forEach(grow);
document.querySelectorAll('textarea.grow').forEach((el) => el.addEventListener('input', () => grow(el)));
window.addEventListener('resize', growAll);
document.fonts?.ready.then(growAll); // web fonts change line widths

// Platform LIVE: several tick boxes, saved together as one comma-separated value in #platform.
const platformBoxes = () => document.querySelectorAll('input[name="platformOpt"]');
function platformToValue() {
  $('platform').value = [...platformBoxes()].filter((b) => b.checked).map((b) => b.value).join(', ');
  $('platform').dispatchEvent(new Event('change')); // autosave + progress
}
function platformFromValue() {
  const chosen = new Set($('platform').value.split(',').map((s) => s.trim()).filter(Boolean));
  platformBoxes().forEach((b) => (b.checked = chosen.has(b.value)));
}

function loadCached() { try { fill(JSON.parse(store.get(CACHE_KEY) || '{}')) } catch { /* corrupt cache */ } setPid(participantId) }
function newProfile() {
  if (!confirm('Mula profil baru? Borang akan dikosongkan pada peranti ini. Profil lama kekal dalam Google Sheet.')) return;
  store.del(CACHE_KEY); store.del(APPROVE_KEY); setPid(''); location.reload();
}
function copyText(t) { return navigator.clipboard && window.isSecureContext ? navigator.clipboard.writeText(t).catch(() => legacyCopy(t)) : legacyCopy(t) }
function legacyCopy(t) {
  return new Promise((res, rej) => {
    const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy') } catch { /* unsupported */ }
    ta.remove(); ok ? res() : rej();
  });
}

// ---- AI prompt cards ----
// While the AI is writing, every "Jana prompt" button is locked: each click is a paid AI call.
function setGenerating(on) {
  generating = on;
  document.querySelectorAll('.gen-btn').forEach((b) => (b.disabled = on || ('playbook' in b.dataset && !playbookReady())));
  $('promptBox').setAttribute('aria-busy', on ? 'true' : 'false');
}
async function makePrompt(idOrName) {
  if (generating) return;
  const card = CARDS.find((c) => c.id === idOrName || c.name === idOrName) || CARDS[CARDS.length - 1];
  if (card.id === 'playbook') return makePlaybook(card);
  currentCard = card; playbookWritten = false;
  next('playbook');
  setGenerating(true);
  $('promptBox').classList.add('loading');
  $('promptBox').innerHTML = '<span class="spinner" aria-hidden="true"></span><span></span>';
  $('promptBox').lastChild.textContent = 'AI sedang menyediakan arahan untuk ' + card.title + '… (10–30 saat)';
  $('promptSource').textContent = ''; $('promptSource').className = 'source'; $('copyStatus').textContent = ''; $('approveStatus').textContent = '';
  $('approveLabel').textContent = 'Jawapan ChatGPT untuk: ' + card.title;
  $('aiOutput').value = approvals[card.id]?.text || '';
  await saveProfile(true);
  try {
    const r = await api('/api/prompt', { participantId, card: card.id, data: collect(), approvals: card.id === 'playbook' ? approvals : {} });
    $('promptBox').classList.remove('loading');
    $('promptBox').textContent = r.prompt;
    const ai = r.source === 'ai';
    $('promptSource').className = 'source' + (ai ? ' ai' : '');
    $('promptSource').innerHTML = (ai ? ICON.sparkle : ICON.info) + '<span></span>';
    $('promptSource').lastChild.textContent = ai ? 'Prompt ditulis khusus oleh AI untuk bisnes anda.' : 'Prompt standard digunakan' + (r.reason ? ' (' + r.reason + ')' : '') + '.';
    $('copyStatus').textContent = 'Arahan untuk ' + card.title + ' sudah siap. Klik Salin Prompt.';
  } catch (err) {
    $('promptBox').classList.remove('loading');
    $('promptBox').textContent = 'Gagal menjana prompt: ' + err.message + '. Cuba klik kad sekali lagi.';
  } finally { setGenerating(false) }
}
// Card 10: the AI writes the playbook itself from the approved outputs; it lands in the answer box to check, edit and approve.
// If the AI can't, the participant gets the ChatGPT prompt instead, like the other cards.
let playbookWritten = false;
// The playbook is only built once every card 01–09 has an approved output.
const SOURCE_CARDS = CARDS.filter((c) => c.id !== 'playbook');
const approvedSources = () => SOURCE_CARDS.filter((c) => approvals[c.id]).length;
const playbookReady = () => approvedSources() === SOURCE_CARDS.length;
const playbookHint = () => (playbookReady() ? '' : `Luluskan semua ${SOURCE_CARDS.length} bahan (01–${String(SOURCE_CARDS.length).padStart(2, '0')}) dahulu untuk cipta Master Playbook · ${approvedSources()} / ${SOURCE_CARDS.length} lulus.`);
function refreshPlaybookButtons() {
  document.querySelectorAll('[data-playbook]').forEach((b) => (b.disabled = generating || !playbookReady()));
  document.querySelectorAll('.playbook-hint').forEach((p) => (p.textContent = playbookHint()));
}
async function makePlaybook(card) {
  if (!playbookReady()) { alert(playbookHint()); return }
  currentCard = card; playbookWritten = false;
  next('playbook');
  setGenerating(true);
  $('promptBox').classList.add('loading');
  $('promptBox').innerHTML = '<span class="spinner" aria-hidden="true"></span><span></span>';
  $('promptBox').lastChild.textContent = 'AI sedang menyusun Master Playbook daripada semua bahan yang anda luluskan… (1–3 minit)';
  $('promptSource').textContent = ''; $('promptSource').className = 'source'; $('copyStatus').textContent = ''; $('approveStatus').textContent = '';
  $('approveLabel').textContent = 'Master Playbook anda';
  await saveProfile(true);
  try {
    const r = await api('/api/playbook', { participantId, data: collect(), approvals });
    $('promptBox').classList.remove('loading');
    $('promptSource').innerHTML = (r.text ? ICON.sparkle : ICON.info) + '<span></span>';
    if (r.text) {
      playbookWritten = true;
      $('promptSource').className = 'source ai';
      $('promptSource').lastChild.textContent = 'Master Playbook disusun oleh AI daripada bahan yang anda luluskan.';
      $('promptBox').textContent = 'Master Playbook anda sudah siap di bawah. Semak dan edit jika perlu, kemudian klik Lulus & Simpan supaya ia masuk ke laporan penuh.';
      $('aiOutput').value = r.text;
      const el = $('aiOutput'); el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight + 4, window.innerHeight * 0.7) + 'px';
      $('copyStatus').textContent = 'Master Playbook siap. Semak di bawah.';
      el.scrollIntoView({ block: 'start' });
    } else {
      $('promptSource').lastChild.textContent = 'AI tidak dapat menyusun playbook sekarang' + (r.reason ? ' (' + r.reason + ')' : '') + '. Salin arahan ini ke ChatGPT dan tampal jawapannya di bawah.';
      $('promptBox').textContent = r.prompt;
      $('aiOutput').value = approvals.playbook?.text || '';
      $('copyStatus').textContent = 'Arahan Master Playbook sudah siap. Klik Salin Prompt.';
    }
  } catch (err) {
    $('promptBox').classList.remove('loading');
    $('promptBox').textContent = 'Gagal menyusun Master Playbook: ' + err.message + '. Cuba klik sekali lagi.';
  } finally { setGenerating(false) }
}
// Feedback shows right under the button, and the button is locked while saving so one click saves once.
let approving = false;
async function approveOutput() {
  if (approving) return;
  const t = $('aiOutput').value.trim();
  const say = (msg, kind) => { $('approveStatus').textContent = msg; $('approveStatus').className = 'status' + (kind ? ' ' + kind : '') };
  if (!currentCard) { say('Pilih bahan di Langkah 04 dan sediakan arahan dahulu.', 'err'); return }
  if (!t) { say('Tampal jawapan AI dahulu.', 'err'); $('aiOutput').focus(); return }
  approving = true; $('approveBtn').disabled = true;
  say('Menyimpan…');
  try {
    await saveProfile(true);
    if (!participantId) throw new Error('Profil belum disimpan. Cuba lagi');
    const r = await api('/api/approve', { participantId, card: currentCard.id, text: t });
    approvals[currentCard.id] = { text: t, at: r.at }; saveApprovals(); renderApprovals(); renderModules(); updateProgress();
    const msg = currentCard.id === 'playbook'
      ? '✓ Master Playbook diluluskan dan disimpan. Ia akan dimasukkan ke laporan penuh.'
      : '✓ ' + currentCard.title + ' diluluskan dan disimpan. Ia akan dimasukkan ke Panduan LIVE Lengkap.';
    say(msg, 'ok'); $('copyStatus').textContent = msg;
  } catch (err) { say('✗ Gagal meluluskan: ' + err.message + '. Cuba lagi.', 'err') }
  finally { approving = false; $('approveBtn').disabled = false }
}
function renderApprovals() {
  const list = CARDS.filter((c) => approvals[c.id]);
  $('approvedList').innerHTML = list.length ? `<h3 style="margin-top:16px">Output diluluskan (${list.length}/${CARDS.length})</h3>` + list.map((c) => `<details class="approved"><summary>✓ ${c.title}${approvals[c.id].at ? ' · ' + approvals[c.id].at : ''}</summary><div class="answer"></div></details>`).join('') : '';
  $('approvedList').querySelectorAll('.answer').forEach((el, i) => showAnswer(el, approvals[list[i].id].text));
}
// Plain lines stay as typed; tables in the answer become real tables (scrolling sideways on a phone).
function showAnswer(el, raw) {
  const add = (parent, tag, text) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; parent.append(n); return n; };
  let pre = null;
  for (const b of parseBlocks(raw)) {
    if (b.type === 'text') { pre ||= add(el, 'pre'); pre.textContent += (pre.textContent ? '\n' : '') + b.text; continue; }
    pre = null;
    const table = add(add(el, 'div'), 'table');
    table.parentElement.className = 'table-wrap';
    if (b.header) { const tr = add(add(table, 'thead'), 'tr'); b.header.forEach((c) => add(tr, 'th', c)); }
    const body = add(table, 'tbody');
    b.rows.forEach((r) => { const tr = add(body, 'tr'); r.forEach((c) => add(tr, 'td', c)); });
  }
}
function renderModules() {
  $('moduleGrid').innerHTML = CARDS.map((c, i) => `<article class="module">${approvals[c.id] ? `<span class="badge">${ICON.check}Diluluskan</span>` : ''}<div class="ref">${c.ref.toUpperCase()}</div><h3>${String(i + 1).padStart(2, '0')} · ${c.title}</h3><p>${c.short}</p>${c.id === 'playbook'
    ? `<button class="btn gen-btn red" data-playbook onclick="makePrompt('playbook')"${generating || !playbookReady() ? ' disabled' : ''}>Cipta Master Playbook ${ICON.arrow}</button><p class="help playbook-hint">${playbookHint()}</p>`
    : `<button class="btn gen-btn light" onclick="makePrompt('${c.id}')"${generating ? ' disabled' : ''}>Sediakan Arahan ChatGPT ${ICON.arrow}</button>`}</article>`).join('');
}

// Progress: answered fields per step, approved cards for the AI step.
const STEP_SECTIONS = ['business', 'reality', 'product', 'commit'];
function stepFields(id) { return [...$(id).querySelectorAll('input,select,textarea')].filter((e) => e.id && e.id !== 'aiOutput' && !(id === 'reality' && e.type === 'checkbox')) }
function isAnswered(e) { return e.type === 'checkbox' ? e.checked : e.value.trim() !== '' }
function setStep(id, done, total, label) {
  const el = $('st-' + id);
  const complete = total > 0 && done >= total;
  el.className = 'step-status' + (complete ? ' done' : '');
  el.innerHTML = complete ? ICON.check + 'Lengkap' : '';
  if (!complete) el.textContent = label;
}
function updateProgress() {
  let done = 0, total = 0;
  for (const id of STEP_SECTIONS) {
    const f = stepFields(id), d = f.filter(isAnswered).length;
    done += d; total += f.length;
    setStep(id, d, f.length, `${d}/${f.length}`);
  }
  const approved = CARDS.filter((c) => approvals[c.id]).length;
  done += approved; total += CARDS.length;
  setStep('tools', approved, CARDS.length, `${approved}/${CARDS.length} lulus`);
  refreshPlaybookButtons();
  // "Kemajuan semakan" in step 6
  const qcDone = QC_ITEMS.filter((_, i) => $('qc' + i)?.checked).length;
  $('qcCount').textContent = `${qcDone} / ${QC_ITEMS.length} siap`;
  $('qcFill').style.width = (qcDone / QC_ITEMS.length) * 100 + '%';
  $('qcBar').setAttribute('aria-valuenow', String(qcDone));
  updateReportCard(qcDone);
  const pct = Math.round((done / total) * 100);
  $('progressFill').style.width = pct + '%';
  $('progressBar').setAttribute('aria-valuenow', String(pct));
  $('progressText').innerHTML = `<b>${pct}%</b> lengkap`;
}
// Misi 7 Hari dates: a date picker and a time picker, saved together in one fixed format in the hidden field, e.g. "5 Nov 2026, 9:00 PM".
const MONTHS = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'];
const WHEN_RE = /^(\d{1,2}) (Jan|Feb|Mac|Apr|Mei|Jun|Jul|Ogo|Sep|Okt|Nov|Dis) (\d{4})(?:, (\d{1,2}):(\d{2}) (AM|PM))?$/;
const pad = (n) => String(n).padStart(2, '0');
const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const whenPart = (id, part) => document.querySelector(`[data-when="${id}"][data-part="${part}"]`);
function whenToValue(id) {
  const date = whenPart(id, 'date'), time = whenPart(id, 'time');
  if (!date.value) { if (WHEN_RE.test($(id).value)) { $(id).value = ''; $(id).dispatchEvent(new Event('change')) } return } // cleared; an older free-text answer stays until replaced
  if (!date.checkValidity()) { date.setAttribute('aria-invalid', 'true'); return } // out of range: keep the saved answer
  date.removeAttribute('aria-invalid');
  const [y, m, d] = date.value.split('-').map(Number);
  let out = `${d} ${MONTHS[m - 1]} ${y}`;
  if (time.value) { const [h, min] = time.value.split(':').map(Number); out += `, ${h % 12 || 12}:${pad(min)} ${h < 12 ? 'AM' : 'PM'}` }
  $(id).value = out;
  document.querySelector(`[data-when-old="${id}"]`).hidden = true;
  $(id).dispatchEvent(new Event('change')); // autosave + progress
}
function whenFromValue(id) {
  const v = $(id).value.trim(), m = v.match(WHEN_RE), old = document.querySelector(`[data-when-old="${id}"]`);
  old.hidden = !v || Boolean(m);
  if (!m) { if (v) old.textContent = `Jawapan sebelum ini: “${v}”. Pilih tarikh dan masa di atas untuk menggantikannya.`; return }
  whenPart(id, 'date').value = `${m[3]}-${pad(MONTHS.indexOf(m[2]) + 1)}-${pad(m[1])}`;
  whenPart(id, 'time').value = m[4] ? `${pad((Number(m[4]) % 12) + (m[6] === 'PM' ? 12 : 0))}:${m[5]}` : '';
}
function setupWhen() {
  const today = new Date(), week = new Date(today); week.setDate(today.getDate() + 7);
  whenPart('lastLiveAt', 'date').max = isoDay(today); // the last LIVE was before the class
  Object.assign(whenPart('nextLiveAt', 'date'), { min: isoDay(today), max: isoDay(week) }); // the mission LIVE is within 7 days
  for (const id of ['lastLiveAt', 'nextLiveAt']) {
    whenFromValue(id);
    for (const part of ['date', 'time']) whenPart(id, part).addEventListener('change', () => whenToValue(id));
  }
}

// ---- Full report (PDF): ready once step 1 is complete and the Master Playbook is approved ----
let reporting = false;
// Facebook, Instagram, Telegram… and Android WebViews can't save files at all; those participants are told to open the page in Chrome / Safari.
const IN_APP = /FBAN|FBAV|FB_IAB|Instagram|Line\/|Telegram|TikTok|musical_ly|; wv\)/i.test(navigator.userAgent);
$('reportInApp').hidden = !IN_APP;
// A plain form post: the browser downloads the server's reply itself, so phones save a real file the same way computers do.
function postDownload(action, fields) {
  const f = document.createElement('form'); f.method = 'post'; f.action = action; f.hidden = true;
  for (const [name, value] of Object.entries(fields)) { const i = document.createElement('input'); i.type = 'hidden'; i.name = name; i.value = value; f.append(i) }
  document.body.append(f); f.submit(); f.remove();
}
// "Tahniah! Anda berjaya" card: the three required items unlock the download; the checklist is encouraged.
function updateReportCard(qcDone) {
  const reqs = [
    [missingProfile().length === 0, 'Profil bisnes dan pelanggan sasaran', true],
    [Boolean($('customerNeed').value.trim()), 'Masalah pelanggan dan fokus produk', true],
    [Boolean(approvals.playbook), 'LIVE Selling Playbook yang telah disemak', true],
    [qcDone === QC_ITEMS.length, 'Persediaan untuk LIVE seterusnya', false],
  ];
  const ready = reqs.every(([ok, , required]) => ok || !required);
  $('reportCard').classList.toggle('ready', ready);
  $('reportEyebrow').textContent = ready ? 'Tahniah! Anda berjaya' : 'Langkah terakhir';
  $('reportTitle').textContent = ready ? 'LIVE Selling Playbook Anda Dah Siap!' : 'LIVE Selling Playbook Anda Hampir Siap';
  $('reportLead').textContent = ready
    ? 'Bukan sekadar belajar cara LIVE. Anda kini dah bina LIVE Selling Playbook sendiri yang boleh terus digunakan untuk sesi LIVE seterusnya.'
    : 'Lengkapkan tiga perkara pertama di bawah untuk muat turun LIVE Selling Playbook anda.';
  $('reportReqs').innerHTML = reqs.map(([ok, label, required]) =>
    `<li class="${ok ? 'ok' : ''}"><svg aria-hidden="true"><use href="#i-check-circle"/></svg><span>${label}${ok || required ? '' : ` <small>(digalakkan · semakan ${qcDone} / ${QC_ITEMS.length})</small>`}</span></li>`).join('');
  $('reportBtn').disabled = reporting || !ready;
}
async function downloadReport() {
  if (reporting) return;
  reporting = true; $('reportBtn').disabled = true;
  $('reportStatus').className = 'status'; $('reportStatus').textContent = 'Menyediakan laporan anda… (10–20 saat). Fail PDF akan dimuat turun sendiri.';
  await saveProfile(true);
  postDownload('/api/report', { participantId });
  setTimeout(() => {
    reporting = false; updateProgress();
    $('reportStatus').textContent = 'Fail tidak muncul? Semak folder Downloads, atau tekan butang sekali lagi.';
  }, 20000);
}

function copyPrompt() {
  if (playbookWritten) { copyText($('aiOutput').value).then(() => ($('copyStatus').textContent = '✓ Master Playbook disalin.')).catch(() => ($('copyStatus').textContent = 'Pilih dan salin teks playbook secara manual.')); return }
  copyText($('promptBox').textContent).then(() => ($('copyStatus').textContent = '✓ Prompt disalin. Tampal ke ChatGPT.')).catch(() => ($('copyStatus').textContent = 'Pilih dan salin teks prompt secara manual.')) }
function downloadProfile() { postDownload('/api/profile-text', { data: JSON.stringify(collect()) }) }
function openChatGPT() { window.open('https://chatgpt.com/', '_blank', 'noopener') }
let currentStep = 'business';
function next(id, scroll = true) {
  currentStep = id;
  document.querySelectorAll('main section').forEach((s) => s.classList.toggle('hidden', s.id !== id));
  document.querySelectorAll('nav button[data-tab]').forEach((b) => { const on = b.dataset.tab === id; b.classList.toggle('active', on); if (on) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current') });
  growAll();
  // Land on the step itself (below the hero), not the top of the page.
  if (scroll) window.scrollTo({ top: Math.max(0, document.querySelector('.progress').getBoundingClientRect().top + window.scrollY - 12) });
}

// Inline onclick handlers in index.html call these.
Object.assign(window, { saveProfile, saveBusiness, nextFromBusiness, ensureSummary, downloadReport, newProfile, makePrompt, approveOutput, copyPrompt, downloadProfile, openChatGPT, next });

document.querySelectorAll('nav button[data-tab]').forEach((b) => b.addEventListener('click', () => {
  if (currentStep === 'business' && b.dataset.tab !== 'business') {
    if (!checkProfile()) return; // step 1 must be complete first
    ensureSummary(false);
  }
  next(b.dataset.tab);
}));
$('qcList').innerHTML = QC_ITEMS.map((q, i) => `<label><input type="checkbox" id="qc${i}"> ${q}</label>`).join('');
loadCached(); platformFromValue(); setupWhen(); renderModules(); renderApprovals(); updateProgress(); next('business', false);
platformBoxes().forEach((b) => b.addEventListener('change', platformToValue));

// "Perlu bantuan? Lihat contoh jawapan": an example chip fills its field (replace) or adds to it (append).
document.addEventListener('click', (e) => {
  const chip = e.target.closest('button[data-example-for]');
  const target = chip && $(chip.dataset.exampleFor);
  if (!target) return;
  const suggested = chip.dataset.exampleText, current = target.value.trim();
  if (chip.dataset.exampleMode === 'append' && suggested !== 'Belum pasti' && current && current !== 'Belum pasti') {
    const parts = current.split(/\s*[,;]\s*/).filter(Boolean);
    if (!parts.some((x) => x.toLocaleLowerCase('ms') === suggested.toLocaleLowerCase('ms'))) parts.push(suggested);
    target.value = parts.join(', ');
  } else {
    target.value = suggested;
  }
  target.dispatchEvent(new Event('input', { bubbles: true }));
  target.dispatchEvent(new Event('change', { bubbles: true })); // autosave
  target.focus();
});
// Autosave a few seconds after the participant changes any field
fields().forEach((e) => {
  e.addEventListener('input', () => { updateProgress(); if (e.getAttribute('aria-invalid') === 'true' && e.value.trim()) markField(e.id, false) });
  e.addEventListener('change', () => { updateProgress(); clearTimeout(autoTimer); autoTimer = setTimeout(() => saveProfile(true), 3000) });
});
