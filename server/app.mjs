import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { cardById, templatePrompt } from '../public/js/cards.mjs';

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const ID_RE = /^LL-[A-Z0-9]{8}$/;
const MAX_FIELD = 5000;
const MAX_APPROVAL = 45000;

const fail = (code, message) => Object.assign(new Error(message), { code });
const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);
const normId = (v) => { const id = String(v || '').trim().toUpperCase(); return ID_RE.test(id) ? id : ''; };

// Form answers: short string values under simple keys only (the Apps Script keeps only known columns).
function cleanData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw fail(400, 'Data tidak sah.');
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    if (/^[A-Za-z][A-Za-z0-9]{0,39}$/.test(k) && (typeof v === 'string' || typeof v === 'number')) out[k] = String(v).slice(0, MAX_FIELD);
  }
  return out;
}

function cleanApprovals(a) {
  const out = {};
  if (a && typeof a === 'object') {
    for (const [k, v] of Object.entries(a)) if (cardById(k) && typeof v?.text === 'string') out[k] = { text: v.text.slice(0, MAX_APPROVAL) };
  }
  return out;
}

/** Sliding one-hour window per key; limit 0 means unlimited. */
function hourlyLimiter(limit, now) {
  const hits = new Map();
  return (key) => {
    if (!limit) return true;
    const t = now(), recent = (hits.get(key) || []).filter((x) => t - x < 3_600_000);
    if (recent.length >= limit) { hits.set(key, recent); return false; }
    recent.push(t); hits.set(key, recent);
    return true;
  };
}

export function createApp({ store, writer, aiLimitPerIpHour = 30, now = Date.now, log = console }) {
  const app = express();
  const allowAi = hourlyLimiter(aiLimitPerIpHour, now);
  app.set('trust proxy', 1); // Railway sits in front; req.ip is the visitor's address
  app.use(express.json({ limit: '400kb' }));
  app.use(express.static(publicDir));

  app.get('/healthz', (req, res) => res.json({ ok: true }));
  app.get('/api/config', (req, res) => res.json({ ai: writer.enabled, storage: store.kind }));

  app.post('/api/profile', wrap(async (req, res) => {
    const data = cleanData(req.body?.data);
    res.json(await store.saveProfile({ ...data, participantId: normId(req.body?.participantId) }));
  }));

  app.get('/api/profile/:id', wrap(async (req, res) => {
    const id = normId(req.params.id);
    if (!id) throw fail(400, 'Format kod tidak sah.');
    const p = await store.loadProfile(id);
    if (!p) throw fail(404, 'Kod peserta tidak dijumpai.');
    res.json(p);
  }));

  app.post('/api/prompt', wrap(async (req, res) => {
    const card = cardById(req.body?.card);
    if (!card) throw fail(400, 'Kad AI tidak sah.');
    const data = cleanData(req.body?.data);
    const approvals = cleanApprovals(req.body?.approvals);
    const participantId = normId(req.body?.participantId);
    // Over the hourly AI limit: still give the participant a usable (template) prompt.
    const out = writer.enabled && !allowAi(req.ip)
      ? { prompt: templatePrompt(card, data, approvals), source: 'template', reason: 'Had penggunaan AI sejam dicapai' }
      : await writer.write({ card, data, approvals });
    store.logPrompt({
      participantId, businessName: data.businessName || '', productName: data.productName || '', module: card.name,
      source: out.source, model: out.model || '', inputTokens: out.usage?.input_tokens ?? '', outputTokens: out.usage?.output_tokens ?? '',
      note: out.reason || '', prompt: out.prompt,
    }).catch((e) => log.error?.(`[log] ${e.message}`));
    res.json({ prompt: out.prompt, source: out.source, reason: out.reason || '' });
  }));

  app.post('/api/approve', wrap(async (req, res) => {
    const participantId = normId(req.body?.participantId);
    const card = cardById(req.body?.card);
    const text = String(req.body?.text || '').trim();
    if (!participantId) throw fail(400, 'Simpan profil dahulu untuk mendapat Kod Peserta.');
    if (!card) throw fail(400, 'Kad AI tidak sah.');
    if (!text) throw fail(400, 'Tampal jawapan AI dahulu.');
    res.json(await store.saveApproval(participantId, card.id, text.slice(0, MAX_APPROVAL)));
  }));

  app.use('/api', (req, res) => res.status(404).json({ error: 'Tidak dijumpai.' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const code = Number.isInteger(err.code) && err.code >= 400 && err.code < 600 ? err.code : (err.status || 500);
    if (code >= 500) log.error?.(`[api] ${req.method} ${req.path}: ${err.message}`);
    res.status(code).json({ error: code >= 500 ? 'Ralat pelayan. Cuba lagi sebentar.' : err.message });
  });
  return app;
}
