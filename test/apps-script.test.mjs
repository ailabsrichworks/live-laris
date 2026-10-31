import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAppsScript, formFieldIds } from './helpers.mjs';
import { CARDS } from '../public/js/cards.mjs';

test('every form field has a Sheet column, and every card an approval column', () => {
  const gs = loadAppsScript();
  const ids = formFieldIds();
  assert.deepEqual(ids.filter((id) => !gs.FORM_KEYS.includes(id)), [], 'form fields without a column');
  assert.deepEqual(gs.FORM_KEYS.filter((k) => !ids.includes(k)), [], 'columns without a form field');
  assert.deepEqual(gs.CARD_IDS, CARDS.map((c) => c.id));
});

test('refuses requests without the secret', () => {
  const gs = loadAppsScript();
  const out = gs.call('ping', {}, 'wrong');
  assert.equal(out.ok, false);
  assert.equal(out.code, 401);
});

test('saves, loads, approves and logs a participant', () => {
  const gs = loadAppsScript();
  const saved = gs.call('saveProfile', { data: { owner: 'Aina', businessName: '=HYPERLINK("x")', years: '1–3 tahun', mConversion: '✓', qc0: '✓', hacker: 'no' } });
  assert.equal(saved.ok, true);
  const id = saved.result.participantId;
  assert.match(id, /^LL-[A-Z0-9]{8}$/);

  assert.equal(gs.call('saveProfile', { data: { participantId: id, owner: 'Aina B' } }).result.participantId, id);
  assert.equal(gs.sheets['LiveLaris Profiles'].getLastRow(), 2, 'updates the same row');

  assert.equal(gs.call('saveApproval', { participantId: id, cardId: 'rundown', text: 'RUNDOWN' }).ok, true);
  assert.equal(gs.call('saveApproval', { participantId: id, cardId: 'nope', text: 'x' }).ok, false);
  assert.equal(gs.call('saveApproval', { participantId: 'LL-AAAAAAAA', cardId: 'rundown', text: 'x' }).ok, false);

  gs.call('logPrompt', { entry: { participantId: id, module: 'LIVE Rundown', source: 'ai', model: 'claude-sonnet-5-5', inputTokens: 900, prompt: '=Anda ialah jurulatih LIVE…' } });
  gs.call('logPrompt', { entry: { participantId: id, module: 'Objection Coach', source: 'template' } });

  const p = gs.call('loadProfile', { participantId: id.toLowerCase() }).result;
  assert.equal(p.data.owner, 'Aina B');
  assert.equal(p.data.businessName, '=HYPERLINK("x")', 'formula-like text comes back as typed');
  assert.equal(p.data.mConversion, '✓');
  assert.equal('hacker' in p.data, false);
  assert.deepEqual(p.approvals, { rundown: { text: 'RUNDOWN' } });

  const sh = gs.sheets['LiveLaris Profiles'];
  const row = Object.fromEntries(gs.PROFILE_HEADERS.map((h, i) => [h.split('\n')[1], sh.g[1][i]]));
  assert.equal(row['Kad terakhir dijana'], 'Objection Coach');
  assert.equal(row['Jumlah prompt dijana'], '2');
  const log = gs.sheets['LiveLaris Prompt Log'].g;
  assert.deepEqual(log[0], gs.PROMPT_HEADERS);
  assert.equal(log[1][gs.PROMPT_HEADERS.indexOf('source')], 'ai');
  assert.equal(log[1][gs.PROMPT_HEADERS.indexOf('prompt')], '=Anda ialah jurulatih LIVE…', 'full prompt text, stored as text');
  assert.equal(gs.call('loadProfile', { participantId: 'LL-AAAAAAAA' }).result, null);
});

test('every approval is added to the Answer Log, so re-approving keeps history', () => {
  const gs = loadAppsScript();
  const id = gs.call('saveProfile', { data: { businessName: 'Aina Beauty', productName: 'Lips Serum' } }).result.participantId;
  gs.call('saveApproval', { participantId: id, cardId: 'rundown', text: 'VERSI 1' });
  gs.call('saveApproval', { participantId: id, cardId: 'rundown', text: 'VERSI 2' });
  const log = gs.sheets['LiveLaris Answer Log'].g;
  assert.deepEqual(log[0], gs.ANSWER_HEADERS);
  assert.deepEqual(log.slice(1).map((r) => r.slice(1)), [
    [id, 'Aina Beauty', 'Lips Serum', 'LIVE Rundown', 'VERSI 1'],
    [id, 'Aina Beauty', 'Lips Serum', 'LIVE Rundown', 'VERSI 2'],
  ]);
  assert.deepEqual(gs.call('loadProfile', { participantId: id }).result.approvals, { rundown: { text: 'VERSI 2' } }, 'profile keeps the latest');
});

test('log rows go under the right headers even if the old Prompt Log lacks the prompt column', () => {
  const gs = loadAppsScript();
  const old = gs.ss.insertSheet('LiveLaris Prompt Log');
  old.appendRow(['timestamp', 'participantId', 'businessName', 'productName', 'module']);
  gs.call('logPrompt', { entry: { module: 'Selling Angles', source: 'ai', prompt: 'P' } });
  assert.deepEqual(old.g[0], gs.PROMPT_HEADERS);
  assert.equal(old.g[1][old.g[0].indexOf('module')], 'Selling Angles');
  assert.equal(old.g[1][old.g[0].indexOf('prompt')], 'P');
});

test('upgrades a tab that only has the old V1 header, but never rewrites one with data', () => {
  const gs = loadAppsScript();
  const old = gs.ss.insertSheet('LiveLaris Profiles');
  old.appendRow(['REKOD\nID peserta', 'REKOD\nMula', 'LANGKAH 3 · LIVE SETUP\nPlatform LIVE']);
  gs.setup();
  assert.deepEqual(old.g[0], gs.PROFILE_HEADERS);

  const gs2 = loadAppsScript();
  const withData = gs2.ss.insertSheet('LiveLaris Profiles');
  withData.appendRow(['REKOD\nID peserta', 'OLD\nColumn']);
  withData.appendRow(['LL-AAAAAAAA', 'keep me']);
  gs2.setup();
  assert.deepEqual(withData.g[0].slice(0, 2), ['REKOD\nID peserta', 'OLD\nColumn']);
  assert.equal(withData.g[1][1], 'keep me');
  assert.equal(withData.g[0].length, 1 + gs2.PROFILE_HEADERS.length, 'missing columns added on the right');
});
