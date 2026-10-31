import { CARDS, QC_ITEMS, profileText } from './cards.mjs';

const $ = (id) => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(k) } catch { return null } },
  set(k, v) { try { localStorage.setItem(k, v) } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k) } catch { /* private mode */ } },
};
const CACHE_KEY = 'liveLarisProfileV2', PID_KEY = 'liveLarisPidV2', APPROVE_KEY = 'liveLarisApprovedV2';
let participantId = store.get(PID_KEY) || '', saving = null, autoTimer = null, currentCard = null;
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
function setPid(id) { participantId = id || ''; if (id) store.set(PID_KEY, id); else store.del(PID_KEY); $('pidLabel').textContent = id || 'Belum disimpan'; $('copyPidBtn').classList.toggle('hidden', !id) }
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
async function loadFromCode() {
  const code = $('loadCode').value.trim().toUpperCase();
  if (!/^LL-[A-Z0-9]{8}$/.test(code)) { alert('Format kod tidak sah. Contoh: LL-AB12CD34'); return }
  $('loadBtn').disabled = true; setStatus('Memuat profil…');
  try {
    const r = await api('/api/profile/' + encodeURIComponent(code));
    fill(r.data); store.set(CACHE_KEY, JSON.stringify(collect()));
    approvals = r.approvals || {}; saveApprovals(); renderModules(); renderApprovals();
    setPid(r.participantId); $('loadCode').value = '';
    setStatus('✓ Profil dimuatkan · dikemas kini ' + r.updatedAt, 'ok'); next('business');
  } catch (err) {
    setStatus('✗ ' + err.message, 'err'); if (err.status === 404) alert('Kod peserta tidak dijumpai.');
  } finally { $('loadBtn').disabled = false }
}
function newProfile() {
  if (!confirm('Mula profil baru? Borang akan dikosongkan pada peranti ini. Profil lama kekal dalam Google Sheet dan boleh dimuat semula dengan kodnya.')) return;
  store.del(CACHE_KEY); store.del(APPROVE_KEY); setPid(''); location.reload();
}
function copyPid() { copyText(participantId).then(() => setStatus('✓ Kod peserta disalin: ' + participantId, 'ok')).catch(() => prompt('Salin kod peserta anda:', participantId)) }
function copyText(t) { return navigator.clipboard && window.isSecureContext ? navigator.clipboard.writeText(t).catch(() => legacyCopy(t)) : legacyCopy(t) }
function legacyCopy(t) {
  return new Promise((res, rej) => {
    const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy') } catch { /* unsupported */ }
    ta.remove(); ok ? res() : rej();
  });
}

// ---- AI prompt cards ----
async function makePrompt(idOrName) {
  const card = CARDS.find((c) => c.id === idOrName || c.name === idOrName) || CARDS[CARDS.length - 1];
  currentCard = card;
  next('playbook');
  $('promptBox').textContent = '✍️ AI sedang menulis prompt khusus untuk ' + card.name + '… (10–30 saat)';
  $('promptBox').classList.add('loading');
  $('promptSource').textContent = ''; $('copyStatus').textContent = '';
  $('approveLabel').textContent = 'Jawapan AI untuk: ' + card.name;
  $('aiOutput').value = approvals[card.id]?.text || '';
  await saveProfile(true);
  try {
    const r = await api('/api/prompt', { participantId, card: card.id, data: collect(), approvals: card.id === 'playbook' ? approvals : {} });
    if (currentCard !== card) return; // participant clicked another card meanwhile
    $('promptBox').textContent = r.prompt;
    $('promptSource').textContent = r.source === 'ai' ? '✨ Prompt ditulis khusus oleh AI untuk bisnes anda.' : 'Prompt standard digunakan' + (r.reason ? ' (' + r.reason + ')' : '') + '.';
    $('copyStatus').textContent = 'Prompt ' + card.name + ' sedia. Klik Salin Prompt.';
  } catch (err) {
    if (currentCard !== card) return;
    $('promptBox').textContent = 'Gagal menjana prompt: ' + err.message + '. Cuba klik kad sekali lagi.';
  } finally { $('promptBox').classList.remove('loading') }
}
async function approveOutput() {
  const t = $('aiOutput').value.trim();
  if (!currentCard) { alert('Jana prompt dahulu.'); return }
  if (!t) { alert('Tampal jawapan AI dahulu.'); return }
  await saveProfile(true);
  if (!participantId) { alert('Profil belum disimpan. Cuba lagi.'); return }
  try {
    const r = await api('/api/approve', { participantId, card: currentCard.id, text: t });
    approvals[currentCard.id] = { text: t, at: r.at }; saveApprovals(); renderApprovals(); renderModules();
    $('copyStatus').textContent = '✓ ' + currentCard.name + ' diluluskan dan disimpan. Ia akan dimasukkan ke Master Playbook.';
  } catch (err) { alert('Gagal meluluskan: ' + err.message) }
}
function renderApprovals() {
  const list = CARDS.filter((c) => approvals[c.id]);
  $('approvedList').innerHTML = list.length ? `<h3 style="margin-top:16px">Output diluluskan (${list.length}/${CARDS.length})</h3>` + list.map((c) => `<details class="approved"><summary>✓ ${c.name}${approvals[c.id].at ? ' · ' + approvals[c.id].at : ''}</summary><pre></pre></details>`).join('') : '';
  $('approvedList').querySelectorAll('pre').forEach((p, i) => (p.textContent = approvals[list[i].id].text));
}
function renderModules() {
  $('moduleGrid').innerHTML = CARDS.map((c, i) => `<article class="module">${approvals[c.id] ? '<span class="badge">✓ Diluluskan</span>' : ''}<div class="ref">${c.ref.toUpperCase()}</div><h3>${String(i + 1).padStart(2, '0')} · ${c.name}</h3><p>${c.task}</p><button class="btn ${c.id === 'playbook' ? 'red' : 'light'}" onclick="makePrompt('${c.id}')">Jana prompt AI →</button></article>`).join('');
}
function copyPrompt() { copyText($('promptBox').textContent).then(() => ($('copyStatus').textContent = '✓ Prompt disalin. Tampal ke ChatGPT.')).catch(() => ($('copyStatus').textContent = 'Pilih dan salin teks prompt secara manual.')) }
function downloadProfile() { const blob = new Blob([profileText(collect())], { type: 'text/plain;charset=utf-8' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'LIVE-LARIS-Profil-Peserta.txt'; a.click(); URL.revokeObjectURL(a.href) }
function openChatGPT() { window.open('https://chatgpt.com/', '_blank', 'noopener') }
function next(id) { document.querySelectorAll('main section').forEach((s) => s.classList.toggle('hidden', s.id !== id)); document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('active', b.dataset.tab === id)); window.scrollTo({ top: 0 }) }

// Inline onclick handlers in index.html call these.
Object.assign(window, { saveProfile, loadFromCode, newProfile, copyPid, makePrompt, approveOutput, copyPrompt, downloadProfile, openChatGPT, next });

document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => next(b.dataset.tab)));
$('qcList').innerHTML = QC_ITEMS.map((q, i) => `<label><input type="checkbox" id="qc${i}"> ${q}</label>`).join('');
loadCached(); renderModules(); renderApprovals();
// Autosave a few seconds after the participant changes any field
fields().forEach((e) => e.addEventListener('change', () => { clearTimeout(autoTimer); setStatus('Perubahan belum disimpan…'); autoTimer = setTimeout(() => saveProfile(true), 3000) }));
