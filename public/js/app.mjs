import { CARDS, QC_ITEMS, profileText } from './cards.mjs';

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
  setStatus('Menyimpan ke Google Sheet…');
  saving = api('/api/profile', { participantId, data })
    .then((r) => { setPid(r.participantId); setStatus('✓ Disimpan ke Google Sheet · ' + r.updatedAt, 'ok') })
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
  document.querySelectorAll('.gen-btn').forEach((b) => (b.disabled = on));
  $('promptBox').setAttribute('aria-busy', on ? 'true' : 'false');
}
async function makePrompt(idOrName) {
  if (generating) return;
  const card = CARDS.find((c) => c.id === idOrName || c.name === idOrName) || CARDS[CARDS.length - 1];
  currentCard = card;
  next('playbook');
  setGenerating(true);
  $('promptBox').classList.add('loading');
  $('promptBox').innerHTML = '<span class="spinner" aria-hidden="true"></span><span></span>';
  $('promptBox').lastChild.textContent = 'AI sedang menyediakan arahan untuk ' + card.title + '… (10–30 saat)';
  $('promptSource').textContent = ''; $('promptSource').className = 'source'; $('copyStatus').textContent = '';
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
async function approveOutput() {
  const t = $('aiOutput').value.trim();
  if (!currentCard) { alert('Jana prompt dahulu.'); return }
  if (!t) { alert('Tampal jawapan AI dahulu.'); return }
  await saveProfile(true);
  if (!participantId) { alert('Profil belum disimpan. Cuba lagi.'); return }
  try {
    const r = await api('/api/approve', { participantId, card: currentCard.id, text: t });
    approvals[currentCard.id] = { text: t, at: r.at }; saveApprovals(); renderApprovals(); renderModules(); updateProgress();
    $('copyStatus').textContent = '✓ ' + currentCard.title + ' diluluskan dan disimpan. Ia akan dimasukkan ke Panduan LIVE Lengkap.';
  } catch (err) { alert('Gagal meluluskan: ' + err.message) }
}
function renderApprovals() {
  const list = CARDS.filter((c) => approvals[c.id]);
  $('approvedList').innerHTML = list.length ? `<h3 style="margin-top:16px">Output diluluskan (${list.length}/${CARDS.length})</h3>` + list.map((c) => `<details class="approved"><summary>✓ ${c.title}${approvals[c.id].at ? ' · ' + approvals[c.id].at : ''}</summary><pre></pre></details>`).join('') : '';
  $('approvedList').querySelectorAll('pre').forEach((p, i) => (p.textContent = approvals[list[i].id].text));
}
function renderModules() {
  $('moduleGrid').innerHTML = CARDS.map((c, i) => `<article class="module">${approvals[c.id] ? `<span class="badge">${ICON.check}Diluluskan</span>` : ''}<div class="ref">${c.ref.toUpperCase()}</div><h3>${String(i + 1).padStart(2, '0')} · ${c.title}</h3><p>${c.short}</p><button class="btn gen-btn ${c.id === 'playbook' ? 'red' : 'light'}" onclick="makePrompt('${c.id}')"${generating ? ' disabled' : ''}>Sediakan Arahan ChatGPT ${ICON.arrow}</button></article>`).join('');
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
  // "Kemajuan semakan" in step 6
  const qcDone = QC_ITEMS.filter((_, i) => $('qc' + i)?.checked).length;
  $('qcCount').textContent = `${qcDone} / ${QC_ITEMS.length} siap`;
  $('qcFill').style.width = (qcDone / QC_ITEMS.length) * 100 + '%';
  $('qcBar').setAttribute('aria-valuenow', String(qcDone));
  const pct = Math.round((done / total) * 100);
  $('progressFill').style.width = pct + '%';
  $('progressBar').setAttribute('aria-valuenow', String(pct));
  $('progressText').innerHTML = `<b>${pct}%</b> lengkap`;
}
function copyPrompt() { copyText($('promptBox').textContent).then(() => ($('copyStatus').textContent = '✓ Prompt disalin. Tampal ke ChatGPT.')).catch(() => ($('copyStatus').textContent = 'Pilih dan salin teks prompt secara manual.')) }
function downloadProfile() { const blob = new Blob([profileText(collect())], { type: 'text/plain;charset=utf-8' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'LIVE-LARIS-Profil-Peserta.txt'; a.click(); URL.revokeObjectURL(a.href) }
function openChatGPT() { window.open('https://chatgpt.com/', '_blank', 'noopener') }
let currentStep = 'business';
function next(id, scroll = true) {
  currentStep = id;
  document.querySelectorAll('main section').forEach((s) => s.classList.toggle('hidden', s.id !== id));
  document.querySelectorAll('nav button[data-tab]').forEach((b) => { const on = b.dataset.tab === id; b.classList.toggle('active', on); if (on) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current') });
  // Land on the step itself (below the hero), not the top of the page.
  if (scroll) window.scrollTo({ top: Math.max(0, document.querySelector('.progress').getBoundingClientRect().top + window.scrollY - 12) });
}

// Inline onclick handlers in index.html call these.
Object.assign(window, { saveProfile, saveBusiness, nextFromBusiness, ensureSummary, newProfile, makePrompt, approveOutput, copyPrompt, downloadProfile, openChatGPT, next });

document.querySelectorAll('nav button[data-tab]').forEach((b) => b.addEventListener('click', () => {
  if (currentStep === 'business' && b.dataset.tab !== 'business') {
    if (!checkProfile()) return; // step 1 must be complete first
    ensureSummary(false);
  }
  next(b.dataset.tab);
}));
$('qcList').innerHTML = QC_ITEMS.map((q, i) => `<label><input type="checkbox" id="qc${i}"> ${q}</label>`).join('');
loadCached(); platformFromValue(); renderModules(); renderApprovals(); updateProgress(); next('business', false);
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
  e.addEventListener('change', () => { updateProgress(); clearTimeout(autoTimer); setStatus('Perubahan belum disimpan…'); autoTimer = setTimeout(() => saveProfile(true), 3000) });
});
