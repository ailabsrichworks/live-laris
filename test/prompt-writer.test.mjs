import test from 'node:test';
import assert from 'node:assert/strict';
import { promptWriter } from '../server/prompt-writer.mjs';
import { cardById } from '../public/js/cards.mjs';

const quiet = { error() {} };
const data = { owner: 'Aina', productName: 'Lips Serum', platform: 'TikTok Shop', leakAction: '5', leakActionSign: 'ramai tanya harga' };
const longPrompt = 'Anda ialah jurulatih LIVE selling. '.repeat(20);

function fakeClient(response) {
  const calls = [];
  return {
    calls,
    beta: { messages: { create: async (params) => { calls.push(params); if (response instanceof Error) throw response; return response } } },
  };
}

test('asks Claude Sonnet with a cached system prompt and returns its prompt', async () => {
  const client = fakeClient({ stop_reason: 'end_turn', model: 'claude-sonnet-5-5', content: [{ type: 'text', text: longPrompt }], usage: { input_tokens: 1200, output_tokens: 600 } });
  const w = promptWriter({ client, model: 'claude-sonnet-5-5', log: quiet });
  const out = await w.write({ card: cardById('rundown'), data, approvals: { script: { text: 'SKRIP' } } });
  assert.equal(out.source, 'ai');
  assert.equal(out.prompt, longPrompt.trim());
  assert.equal(out.usage.input_tokens, 1200);

  const p = client.calls[0];
  assert.equal(p.model, 'claude-sonnet-5-5');
  assert.equal(p.fallbacks, 'default');
  assert.deepEqual(p.betas, ['server-side-fallback-2026-07-01']);
  assert.deepEqual(p.system[0].cache_control, { type: 'ephemeral' });
  const msg = p.messages[0].content;
  assert.match(msg, /<kad_ai>[\s\S]*LIVE Rundown/);
  assert.match(msg, /Masalah semasa LIVE \(skor 1 = tiada masalah, 5 = sangat serius\)/);
  assert.match(msg, /Penonton tak jadi beli \(Action\) 5 \(ramai tanya harga\)/, 'plain label, score, and a sign saved by an older version');
  assert.doesNotMatch(msg, /SKRIP/, 'approved outputs go only to the Master Playbook');
});

test('Claude writes the Master Playbook itself from module 10 and the approved outputs, marking missing sections', async () => {
  const playbookText = '## A. Ringkasan LIVE\n' + 'Isi playbook. '.repeat(40);
  const client = fakeClient({ stop_reason: 'end_turn', model: 'm', content: [{ type: 'text', text: playbookText }], usage: { input_tokens: 9, output_tokens: 9 } });
  const out = await promptWriter({ client, model: 'm', log: quiet }).playbook({ data, approvals: { script: { text: 'SKRIP' } } });
  assert.deepEqual([out.source, out.text], ['ai', playbookText.trim()]);
  const p = client.calls[0];
  assert.ok(p.system[0].text.includes(cardById('playbook').module), 'the trainer module is the instruction');
  assert.match(p.messages[0].content, /--- Seksyen 06 · Bina Skrip LIVE \(H\.E\.B\.A\.T\.\) ---\nSKRIP/);
  assert.match(p.messages[0].content, /--- Seksyen 01 · [^\n]+ ---\n\[BELUM LENGKAP\]/);
  assert.doesNotMatch(p.messages[0].content, /Seksyen 10/);

  for (const w of [promptWriter({ model: 'm', log: quiet }), promptWriter({ client: fakeClient({ stop_reason: 'max_tokens', content: [] }), model: 'm', log: quiet })]) {
    const fb = await w.playbook({ data, approvals: { script: { text: 'SKRIP' } } });
    assert.equal(fb.source, 'template');
    assert.ok(fb.prompt.startsWith(cardById('playbook').module), 'without Claude, the participant gets the ChatGPT prompt');
    assert.match(fb.prompt, /## OUTPUT YANG TELAH DILULUSKAN PESERTA[\s\S]*SKRIP/);
  }
});

test('the business summary uses only the step 1 answers, at low effort, with a fallback', async () => {
  const client = fakeClient({ stop_reason: 'end_turn', model: 'claude-sonnet-5-5', content: [{ type: 'text', text: 'Saya menjual sambal siap makan untuk ibu bekerja.' }] });
  const w = promptWriter({ client, model: 'claude-sonnet-5-5', log: quiet });
  const out = await w.summarize({ data: { businessName: 'Sambal Mak Long', customer: 'Ibu bekerja', productName: 'Lips Serum' } });
  assert.equal(out.source, 'ai');
  assert.equal(out.text, 'Saya menjual sambal siap makan untuk ibu bekerja.');
  const p = client.calls[0];
  assert.deepEqual(p.output_config, { effort: 'low' });
  assert.equal(p.fallbacks, 'default');
  assert.match(p.messages[0].content, /Nama bisnes: Sambal Mak Long/);
  assert.doesNotMatch(p.messages[0].content, /Lips Serum/, 'only step 1 answers are sent');

  const off = await promptWriter({ model: 'm', log: quiet }).summarize({ data: { businessName: 'Sambal Mak Long', customer: 'Ibu bekerja', location: 'Melaka' } });
  assert.equal(off.source, 'template');
  assert.equal(off.text, 'Saya menjalankan Sambal Mak Long. Pelanggan sasaran saya ialah Ibu bekerja di Melaka.');
  const refused = await promptWriter({ client: fakeClient({ stop_reason: 'refusal', content: [] }), model: 'm', log: quiet }).summarize({ data: {} });
  assert.equal(refused.source, 'template');
});

test('falls back to the template prompt when Claude is off, refuses, fails or answers too little', async () => {
  const card = cardById('cta');
  const cases = [
    [promptWriter({ model: 'm', log: quiet }), 'AI tidak aktif'],
    [promptWriter({ client: fakeClient({ stop_reason: 'refusal', content: [] }), model: 'm', log: quiet }), 'AI menolak permintaan ini'],
    [promptWriter({ client: fakeClient({ stop_reason: 'max_tokens', content: [{ type: 'text', text: longPrompt }] }), model: 'm', log: quiet }), 'Jawapan AI terpotong'],
    [promptWriter({ client: fakeClient({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] }), model: 'm', log: quiet }), 'Jawapan AI terlalu pendek'],
    [promptWriter({ client: fakeClient(new Error('network down')), model: 'm', log: quiet }), 'Ralat AI'],
  ];
  for (const [w, reason] of cases) {
    const out = await w.write({ card, data, approvals: {} });
    assert.equal(out.source, 'template');
    assert.equal(out.reason, reason);
    assert.match(out.prompt, /SEKSYEN 08 — AJAK MEMBELI/);
    assert.match(out.prompt, /Produk fokus: Lips Serum/);
  }
  assert.equal(promptWriter({ model: 'm' }).enabled, false);
});

test("a card with the trainer's module sends the whole module to Claude, and the template keeps it word for word", async () => {
  const { CARDS, templatePrompt } = await import('../public/js/cards.mjs');
  assert.deepEqual(CARDS.filter((c) => c.module).map((c) => c.id), ['reality', 'product', 'angles', 'rundown', 'dosdonts', 'script', 'objection', 'cta', 'rehearsal', 'playbook']);
  const card = cardById('reality');
  const client = fakeClient({ stop_reason: 'end_turn', model: 'm', content: [{ type: 'text', text: longPrompt }], usage: {} });
  await promptWriter({ client, model: 'm', log: quiet }).write({ card, data, approvals: {} });
  const msg = client.calls[0].messages[0].content;
  assert.ok(msg.includes(`<modul>\n${card.module}\n</modul>`));
  assert.match(client.calls[0].system[0].text, /the module wins/);

  const t = templatePrompt(card, data, {});
  assert.ok(t.startsWith(card.module));
  assert.match(t, /## MAKLUMAT PESERTA[\s\S]*Produk fokus: Lips Serum/);
});
