import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.mjs';
import { memoryStore } from '../server/store.mjs';
import { templatePrompt } from '../public/js/cards.mjs';

const quiet = { error() {} };

async function start({ writer, limit = 30 } = {}) {
  const store = memoryStore();
  const calls = [];
  writer ||= {
    enabled: true,
    async write({ card, data, approvals }) { calls.push({ card, data, approvals }); return { prompt: `AI PROMPT ${card.id}`, source: 'ai', model: 'claude-sonnet-5-5', usage: { input_tokens: 10, output_tokens: 5 } } },
    async summarize({ data }) { calls.push({ summary: data }); return { text: `Saya menjalankan ${data.businessName}.`, source: 'ai', model: 'claude-sonnet-5-5', usage: { input_tokens: 4, output_tokens: 2 } } },
    async playbook({ data, approvals }) { calls.push({ playbook: { data, approvals } }); return { text: `PLAYBOOK ${data.businessName}`, source: 'ai', model: 'claude-sonnet-5-5', usage: { input_tokens: 8, output_tokens: 6 } } },
  };
  const server = createApp({ store, writer, aiLimitPerIpHour: limit, log: quiet }).listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const req = async (path, body) => {
    const res = await fetch(base + path, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json().catch(() => null), text: res.headers.get('content-type')?.includes('html') ? 'html' : '' };
  };
  return { store, calls, req, base, close: () => server.close() };
}

test('serves the page, health check and config', async (t) => {
  const s = await start(); t.after(s.close);
  assert.equal((await s.req('/')).text, 'html');
  assert.deepEqual((await s.req('/healthz')).body, { ok: true });
  assert.deepEqual((await s.req('/api/config')).body, { ai: true, storage: 'memory' });
});

test('saves and loads a profile by participant code', async (t) => {
  const s = await start(); t.after(s.close);
  const saved = await s.req('/api/profile', { data: { owner: 'Aina', productName: 'Lips Serum', bad: { x: 1 } } });
  assert.equal(saved.status, 200);
  const id = saved.body.participantId;
  await s.req('/api/profile', { participantId: id, data: { owner: 'Aina B' } });
  const loaded = await s.req('/api/profile/' + id.toLowerCase());
  assert.equal(loaded.body.data.owner, 'Aina B');
  assert.equal(loaded.body.data.productName, 'Lips Serum');
  assert.equal('bad' in loaded.body.data, false);
  assert.equal((await s.req('/api/profile/LL-AAAAAAAA')).status, 404);
  assert.equal((await s.req('/api/profile/nope')).status, 400);
  assert.equal((await s.req('/api/profile', { data: 'x' })).status, 400);
});

test('writes a prompt with the AI and logs it', async (t) => {
  const s = await start(); t.after(s.close);
  const { participantId } = (await s.req('/api/profile', { data: { owner: 'Aina' } })).body;
  const r = await s.req('/api/prompt', { participantId, card: 'rundown', data: { businessName: 'Aina Beauty', productName: 'Lips Serum' } });
  assert.deepEqual(r.body, { prompt: 'AI PROMPT rundown', source: 'ai', reason: '' });
  await new Promise((res) => setImmediate(res));
  assert.equal(s.store.log[0].module, 'LIVE Rundown');
  assert.equal(s.store.log[0].source, 'ai');
  assert.equal(s.store.log[0].inputTokens, 10);
  assert.equal(s.store.log[0].prompt, 'AI PROMPT rundown');
  assert.equal((await s.req('/api/prompt', { card: 'nope', data: {} })).status, 400);
});

test('only known approvals are passed on', async (t) => {
  const s = await start(); t.after(s.close);
  await s.req('/api/prompt', { card: 'playbook', data: {}, approvals: { script: { text: 'SKRIP' }, evil: { text: 'x' }, cta: 'not-an-object' } });
  assert.deepEqual(s.calls[0].approvals, { script: { text: 'SKRIP' } });
});

test('over the hourly AI limit, participants get the template prompt', async (t) => {
  const s = await start({ limit: 2 }); t.after(s.close);
  for (let i = 0; i < 2; i++) assert.equal((await s.req('/api/prompt', { card: 'cta', data: {} })).body.source, 'ai');
  const third = (await s.req('/api/prompt', { card: 'cta', data: { productName: 'Lips Serum' } })).body;
  assert.equal(third.source, 'template');
  assert.equal(third.reason, 'Had penggunaan AI sejam dicapai');
  assert.match(third.prompt, /Produk fokus: Lips Serum/);
  assert.equal(s.calls.length, 2);
});

test('with the AI off, the template prompt is returned', async (t) => {
  const writer = { enabled: false, async write({ card, data, approvals }) { return { prompt: templatePrompt(card, data, approvals), source: 'template', reason: 'AI tidak aktif' } } };
  const s = await start({ writer }); t.after(s.close);
  const r = (await s.req('/api/prompt', { card: 'reality', data: {} })).body;
  assert.equal(r.source, 'template');
  assert.match(r.prompt, /^# MODUL 01 – KENAL PASTI MASALAH LIVE ANDA/, 'the module is the template');
});

test('the Master Playbook is written by the AI and logged outside the prompt appendix; over the limit it is a prompt', async (t) => {
  const s = await start({ limit: 1 }); t.after(s.close);
  const all = Object.fromEntries(['reality', 'product', 'angles', 'rundown', 'dosdonts', 'objection', 'cta', 'rehearsal'].map((id) => [id, { text: id.toUpperCase() }]));
  const notYet = await s.req('/api/playbook', { data: { businessName: 'Sambal Mak Long' }, approvals: all });
  assert.equal(notYet.status, 409, 'every card 01–09 needs an approved output first');
  assert.match(notYet.body.error, /Belum lulus: Bina Skrip LIVE \(H\.E\.B\.A\.T\.\)\.$/);
  assert.equal(s.calls.length, 0, 'no AI call');

  all.script = { text: 'SKRIP' };
  const r = (await s.req('/api/playbook', { data: { businessName: 'Sambal Mak Long' }, approvals: { ...all, evil: { text: 'x' } } })).body;
  assert.deepEqual(r, { text: 'PLAYBOOK Sambal Mak Long', source: 'ai' });
  assert.deepEqual(s.calls[0].playbook.approvals, all);
  await new Promise((res) => setImmediate(res));
  assert.equal(s.store.log[0].module, 'Master Playbook (dijana AI)');
  assert.equal(s.store.log[0].prompt, 'PLAYBOOK Sambal Mak Long');

  const over = (await s.req('/api/playbook', { data: { businessName: 'Sambal Mak Long' }, approvals: all })).body;
  assert.equal(over.source, 'template');
  assert.equal(over.reason, 'Had penggunaan AI sejam dicapai');
  assert.match(over.prompt, /^# SECTION 10 — PANDUAN LIVE LENGKAP[\s\S]*SKRIP/);
  await new Promise((res) => setImmediate(res));
  assert.equal(s.store.log[1].module, 'Master LIVE Selling Playbook');
});

test('writes the business summary with the AI and logs it', async (t) => {
  const s = await start(); t.after(s.close);
  const r = await s.req('/api/summary', { data: { businessName: 'Sambal Mak Long', customer: 'Ibu bekerja' } });
  assert.deepEqual(r.body, { text: 'Saya menjalankan Sambal Mak Long.', source: 'ai', reason: '' });
  await new Promise((res) => setImmediate(res));
  assert.equal(s.store.log[0].module, 'Ringkasan bisnes');
  assert.equal(s.store.log[0].prompt, 'Saya menjalankan Sambal Mak Long.');
});

test('over the hourly AI limit, the summary falls back to a plain sentence', async (t) => {
  const s = await start({ limit: 1 }); t.after(s.close);
  await s.req('/api/summary', { data: { businessName: 'A' } });
  const r = (await s.req('/api/summary', { data: { businessName: 'Sambal Mak Long', industry: 'Makanan & Minuman' } })).body;
  assert.equal(r.source, 'template');
  assert.match(r.text, /^Saya menjalankan Sambal Mak Long dalam industri makanan & minuman\./);
});

test('approves an AI output for a saved participant only', async (t) => {
  const s = await start(); t.after(s.close);
  assert.equal((await s.req('/api/approve', { card: 'rundown', text: 'x' })).status, 400);
  const { participantId } = (await s.req('/api/profile', { data: { owner: 'Aina' } })).body;
  assert.equal((await s.req('/api/approve', { participantId, card: 'rundown', text: '' })).status, 400);
  assert.equal((await s.req('/api/approve', { participantId, card: 'rundown', text: 'RUNDOWN DRAF' })).status, 200);
  const loaded = (await s.req('/api/profile/' + participantId)).body;
  assert.equal(loaded.approvals.rundown.text, 'RUNDOWN DRAF');
});

const FULL = { owner: 'Aina', businessName: 'Sambal Mak Long', years: '1–3 tahun', model: 'Saya tidak pasti', industry: 'Makanan & Minuman',
  team: 'Saya seorang', location: 'Seluruh Malaysia', sales: 'Bawah RM5,000', customer: 'Ibu bekerja', age: '25–34 tahun', customerNeed: 'Tak sempat masak' };

test('the full report needs a complete profile, the customer problem and an approved Master Playbook', async (t) => {
  const s = await start(); t.after(s.close);
  assert.equal((await s.req('/api/report', {})).status, 400);
  const { participantId } = (await s.req('/api/profile', { data: { owner: 'Aina' } })).body;
  const r = await s.req('/api/report', { participantId });
  assert.equal(r.status, 409);
  assert.match(r.body.error, /Profil bisnes belum lengkap.*Masalah pelanggan.*Master Playbook/);
  const { customerNeed, ...noNeed } = FULL;
  await s.req('/api/profile', { participantId, data: { ...noNeed, customerNeed: ' ' } });
  await s.req('/api/approve', { participantId, card: 'playbook', text: 'Panduan' });
  const r2 = await s.req('/api/report', { participantId });
  assert.equal(r2.status, 409);
  assert.match(r2.body.error, /: Masalah pelanggan \(Product Blueprint\) belum diisi\.$/, 'only the customer problem is missing');
});

test('downloads the full report as a PDF and keeps a copy', async (t) => {
  const s = await start(); t.after(s.close);
  const { participantId } = (await s.req('/api/profile', { data: FULL })).body;
  await s.req('/api/approve', { participantId, card: 'playbook', text: '## Panduan\n- Hook' });
  const res = await fetch(`${s.base}/api/report`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ participantId }) });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/pdf');
  assert.equal(res.headers.get('x-report-saved'), '1');
  assert.match(decodeURIComponent(res.headers.get('content-disposition')), /Panduan LIVE · Sambal Mak Long · LL-/);
  const pdf = Buffer.from(await res.arrayBuffer());
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.equal(Buffer.from(s.store.reports.get(participantId).base64, 'base64').length, pdf.length, 'the stored copy is the same file');
});

test('if the Drive copy fails, the participant still gets the PDF', async (t) => {
  const s = await start(); t.after(s.close);
  const { participantId } = (await s.req('/api/profile', { data: FULL })).body;
  await s.req('/api/approve', { participantId, card: 'playbook', text: 'Panduan' });
  s.store.saveReport = async () => { throw new Error('Drive down') };
  const res = await fetch(`${s.base}/api/report`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ participantId }) });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('x-report-saved'), '0');
});

test('the report includes the prompts we gave for approved cards, and still works without them', async (t) => {
  const s = await start(); t.after(s.close);
  const { participantId } = (await s.req('/api/profile', { data: FULL })).body;
  await s.req('/api/prompt', { participantId, card: 'rundown', data: FULL }); // logs "AI PROMPT rundown"
  await new Promise((r) => setImmediate(r));
  await s.req('/api/approve', { participantId, card: 'rundown', text: 'RUNDOWN' });
  await s.req('/api/approve', { participantId, card: 'playbook', text: 'Panduan' });
  const pages = async () => {
    const res = await fetch(`${s.base}/api/report`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ participantId }) });
    assert.equal(res.status, 200);
    return (Buffer.from(await res.arrayBuffer()).toString('latin1').match(/\/Type \/Page[^s]/g) || []).length;
  };
  const withPrompts = await pages();
  s.store.getPrompts = async () => { throw new Error('Sheet down') };
  const without = await pages();
  assert.equal(withPrompts, without + 1, 'the appendix adds a page; without prompts the report still downloads');
});
