import { CARDS, QC_ITEMS, profileText } from './cards.mjs';

const $ = (id) => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(k) } catch { return null } },
  set(k, v) { try { localStorage.setItem(k, v) } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k) } catch { /* private mode */ } },
};
const CACHE_KEY = 'liveLarisProfileV2', PID_KEY = 'liveLarisPidV2', APPROVE_KEY = 'liveLarisApprovedV2';
let participantId = store.get(PID_KEY) || '', saving = null, autoTimer = null, currentCard = null, generating = false;

// Inline SVG icons (Lucide shapes), decorative: the text next to them carries the meaning.
const svg = (d) => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON = {
  check: svg('<path d="M20 6 9 17l-5-5"/>'),
  sparkle: svg('<path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z"/>'),
  info: svg('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>'),
  arrow: svg('<path d="M5 12h14M13 5l7 7-7 7"/>'),
};
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
  $('promptBox').lastChild.textContent = 'AI sedang menulis prompt khusus untuk ' + card.name + '… (10–30 saat)';
  $('promptSource').textContent = ''; $('promptSource').className = 'source'; $('copyStatus').textContent = '';
  $('approveLabel').textContent = 'Jawapan AI untuk: ' + card.name;
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
    $('copyStatus').textContent = 'Prompt ' + card.name + ' sedia. Klik Salin Prompt.';
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
    $('copyStatus').textContent = '✓ ' + currentCard.name + ' diluluskan dan disimpan. Ia akan dimasukkan ke Master Playbook.';
  } catch (err) { alert('Gagal meluluskan: ' + err.message) }
}
function renderApprovals() {
  const list = CARDS.filter((c) => approvals[c.id]);
  $('approvedList').innerHTML = list.length ? `<h3 style="margin-top:16px">Output diluluskan (${list.length}/${CARDS.length})</h3>` + list.map((c) => `<details class="approved"><summary>✓ ${c.name}${approvals[c.id].at ? ' · ' + approvals[c.id].at : ''}</summary><pre></pre></details>`).join('') : '';
  $('approvedList').querySelectorAll('pre').forEach((p, i) => (p.textContent = approvals[list[i].id].text));
}
function renderModules() {
  $('moduleGrid').innerHTML = CARDS.map((c, i) => `<article class="module">${approvals[c.id] ? `<span class="badge">${ICON.check}Diluluskan</span>` : ''}<div class="ref">${c.ref.toUpperCase()}</div><h3>${String(i + 1).padStart(2, '0')} · ${c.name}</h3><p>${c.short}</p><details><summary>Lihat tugas penuh</summary><p>${c.task}</p></details><button class="btn gen-btn ${c.id === 'playbook' ? 'red' : 'light'}" onclick="makePrompt('${c.id}')"${generating ? ' disabled' : ''}>Jana prompt AI ${ICON.arrow}</button></article>`).join('');
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
  const pct = Math.round((done / total) * 100);
  $('progressFill').style.width = pct + '%';
  $('progressBar').setAttribute('aria-valuenow', String(pct));
  $('progressText').innerHTML = `<b>${pct}%</b> lengkap`;
}
function copyPrompt() { copyText($('promptBox').textContent).then(() => ($('copyStatus').textContent = '✓ Prompt disalin. Tampal ke ChatGPT.')).catch(() => ($('copyStatus').textContent = 'Pilih dan salin teks prompt secara manual.')) }
function downloadProfile() { const blob = new Blob([profileText(collect())], { type: 'text/plain;charset=utf-8' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'LIVE-LARIS-Profil-Peserta.txt'; a.click(); URL.revokeObjectURL(a.href) }
function openChatGPT() { window.open('https://chatgpt.com/', '_blank', 'noopener') }
function next(id) {
  document.querySelectorAll('main section').forEach((s) => s.classList.toggle('hidden', s.id !== id));
  document.querySelectorAll('nav button[data-tab]').forEach((b) => { const on = b.dataset.tab === id; b.classList.toggle('active', on); if (on) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current') });
  window.scrollTo({ top: 0 });
}

// Inline onclick handlers in index.html call these.
Object.assign(window, { saveProfile, newProfile, makePrompt, approveOutput, copyPrompt, downloadProfile, openChatGPT, next });

document.querySelectorAll('nav button[data-tab]').forEach((b) => b.addEventListener('click', () => next(b.dataset.tab)));
$('qcList').innerHTML = QC_ITEMS.map((q, i) => `<label><input type="checkbox" id="qc${i}"> ${q}</label>`).join('');
loadCached(); renderModules(); renderApprovals(); updateProgress(); next('business');
// Autosave a few seconds after the participant changes any field
fields().forEach((e) => {
  e.addEventListener('input', updateProgress);
  e.addEventListener('change', () => { updateProgress(); clearTimeout(autoTimer); setStatus('Perubahan belum disimpan…'); autoTimer = setTimeout(() => saveProfile(true), 3000) });
});
